"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSocket, type AppSocket } from "@/lib/socket";
import { conversationApi, uploadImage, ApiError } from "@/lib/apiClient";
import type {
  ConversationSummaryDTO,
  MessageDTO,
  MessageType,
  PublicUser,
} from "@/types/types";
import type { SendMessagePayload } from "@/types/socketEvents";

export type ConnectionState = "connecting" | "connected" | "disconnected";

interface PageInfo {
  nextCursor: number | null;
  loadingOlder: boolean;
  loadedInitial: boolean;
}

// Optimistic messages get a temp seq above any realistic real seq but below
// MAX_SAFE_INTEGER, so they always sort to the bottom until reconciled.
const TEMP_SEQ_BASE = 1e15;
let tempSeqCounter = 0;

export function useChat(currentUser: PublicUser) {
  const [conversations, setConversations] = useState<ConversationSummaryDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageDTO[]>>({});
  const [pageInfo, setPageInfo] = useState<Record<string, PageInfo>>({});
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [connection, setConnection] = useState<ConnectionState>("connecting");

  const socketRef = useRef<AppSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  // Per-conversation dedup of message ids + clientIds (multi-tab / retries).
  const seenRef = useRef<Record<string, Set<string>>>({});
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  activeIdRef.current = activeId;

  const seenSet = (convId: string) => (seenRef.current[convId] ??= new Set<string>());

  // -------------------------------------------------------------------------
  // message store helpers
  // -------------------------------------------------------------------------
  const upsertMessage = useCallback((convId: string, msg: MessageDTO) => {
    setMessages((prev) => {
      const list = prev[convId] ?? [];
      const idx = list.findIndex((m) => m.clientId === msg.clientId);
      let next: MessageDTO[];
      if (idx >= 0) {
        next = list.slice();
        next[idx] = { ...next[idx], ...msg };
      } else {
        next = [...list, msg];
      }
      next.sort((a, b) => a.seq - b.seq);
      return { ...prev, [convId]: next };
    });
  }, []);

  const patchStatuses = useCallback(
    (convId: string, upToSeq: number, status: "delivered" | "read") => {
      setMessages((prev) => {
        const list = prev[convId];
        if (!list) return prev;
        const rank = { sending: 0, failed: 0, sent: 1, delivered: 2, read: 3 } as const;
        const next = list.map((m) => {
          if (m.senderId !== currentUser.id) return m;
          if (m.seq > upToSeq) return m;
          return rank[m.status] < rank[status] ? { ...m, status } : m;
        });
        return { ...prev, [convId]: next };
      });
    },
    [currentUser.id],
  );

  // -------------------------------------------------------------------------
  // conversations
  // -------------------------------------------------------------------------
  const loadConversations = useCallback(async () => {
    const { conversations } = await conversationApi.list();
    setConversations(conversations);
  }, []);

  const markConversationRead = useCallback((convId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  const emitRead = useCallback((convId: string, upToSeq: number) => {
    socketRef.current?.emit("message:read", { conversationId: convId, upToSeq });
  }, []);

  const openConversation = useCallback(
    async (convId: string) => {
      setActiveId(convId);
      const socket = socketRef.current;
      socket?.emit("conversation:join", { conversationId: convId }, () => {});

      if (!pageInfo[convId]?.loadedInitial) {
        setPageInfo((p) => ({
          ...p,
          [convId]: { nextCursor: null, loadingOlder: false, loadedInitial: false },
        }));
        const page = await conversationApi.messages(convId, null);
        const set = seenSet(convId);
        for (const m of page.messages) {
          set.add(m.id);
          set.add(m.clientId);
        }
        setMessages((prev) => ({ ...prev, [convId]: page.messages }));
        setPageInfo((p) => ({
          ...p,
          [convId]: { nextCursor: page.nextCursor, loadingOlder: false, loadedInitial: true },
        }));
        const top = page.messages[page.messages.length - 1];
        if (top) emitRead(convId, top.seq);
      } else {
        const list = messages[convId] ?? [];
        const top = list[list.length - 1];
        if (top) emitRead(convId, top.seq);
      }
      markConversationRead(convId);
    },
    [pageInfo, messages, emitRead, markConversationRead],
  );

  const loadOlder = useCallback(
    async (convId: string) => {
      const info = pageInfo[convId];
      if (!info || info.loadingOlder || info.nextCursor === null) return;
      setPageInfo((p) => ({ ...p, [convId]: { ...info, loadingOlder: true } }));
      try {
        const page = await conversationApi.messages(convId, info.nextCursor);
        const set = seenSet(convId);
        const fresh = page.messages.filter((m) => !set.has(m.id));
        for (const m of fresh) {
          set.add(m.id);
          set.add(m.clientId);
        }
        setMessages((prev) => ({ ...prev, [convId]: [...fresh, ...(prev[convId] ?? [])] }));
        setPageInfo((p) => ({
          ...p,
          [convId]: { nextCursor: page.nextCursor, loadingOlder: false, loadedInitial: true },
        }));
      } catch {
        setPageInfo((p) => ({ ...p, [convId]: { ...info, loadingOlder: false } }));
      }
    },
    [pageInfo],
  );

  // -------------------------------------------------------------------------
  // sending (optimistic + idempotent, socket-first with REST fallback)
  // -------------------------------------------------------------------------
  const deliver = useCallback(
    async (convId: string, payload: Omit<SendMessagePayload, "conversationId" | "clientId">, optimistic: MessageDTO) => {
      const clientId = optimistic.clientId;
      seenSet(convId).add(clientId);
      upsertMessage(convId, optimistic);
      bumpConversationPreview(setConversations, convId, optimistic);

      const full: SendMessagePayload = { conversationId: convId, clientId, ...payload };
      const socket = socketRef.current;

      const onOk = (real: MessageDTO) => {
        seenSet(convId).add(real.id);
        upsertMessage(convId, { ...real, clientId });
      };
      const onFail = () => {
        upsertMessage(convId, { ...optimistic, status: "failed" });
      };

      try {
        if (socket && socket.connected) {
          socket.timeout(12000).emit("message:send", full, (err, res) => {
            if (err || !res || !res.ok) return onFail();
            onOk(res.message);
          });
        } else {
          // Socket down: REST fallback keeps sending reliable and idempotent.
          const res = await fetch(`/api/conversations/${convId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(full),
          });
          const data = await res.json();
          if (!res.ok) return onFail();
          onOk(data.message as MessageDTO);
        }
      } catch {
        onFail();
      }
    },
    [upsertMessage],
  );

  const baseOptimistic = useCallback(
    (convId: string, type: MessageType, body: string | null): MessageDTO => ({
      id: `temp-${crypto.randomUUID()}`,
      seq: TEMP_SEQ_BASE + tempSeqCounter++,
      conversationId: convId,
      senderId: currentUser.id,
      type,
      body,
      attachment: null,
      clientId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: "sending",
    }),
    [currentUser.id],
  );

  const sendText = useCallback(
    (convId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const optimistic = baseOptimistic(convId, "TEXT", trimmed);
      void deliver(convId, { type: "TEXT", body: trimmed }, optimistic);
    },
    [baseOptimistic, deliver],
  );

  const sendMedia = useCallback(
    (convId: string, type: "GIF" | "STICKER", media: { url: string; width?: number; height?: number; mime?: string }) => {
      const optimistic: MessageDTO = {
        ...baseOptimistic(convId, type, null),
        attachment: {
          id: `temp-${crypto.randomUUID()}`,
          kind: type,
          mime: media.mime ?? "image/gif",
          width: media.width ?? null,
          height: media.height ?? null,
          moderationStatus: "APPROVED",
          url: media.url,
        },
      };
      void deliver(convId, { type, media }, optimistic);
    },
    [baseOptimistic, deliver],
  );

  const sendImage = useCallback(
    async (convId: string, file: File): Promise<{ error?: string }> => {
      const previewUrl = URL.createObjectURL(file);
      const optimistic: MessageDTO = {
        ...baseOptimistic(convId, "IMAGE", null),
        attachment: {
          id: `temp-${crypto.randomUUID()}`,
          kind: "IMAGE",
          mime: file.type,
          width: null,
          height: null,
          moderationStatus: "PENDING", // shows "moderating" state
          url: previewUrl,
        },
      };
      upsertMessage(convId, optimistic);
      try {
        const { attachmentId } = await uploadImage(file);
        // Reuse the SAME clientId so the optimistic bubble is reconciled in place.
        const withId: MessageDTO = { ...optimistic };
        await deliver(convId, { type: "IMAGE", attachmentId }, withId);
        return {};
      } catch (err) {
        upsertMessage(convId, { ...optimistic, status: "failed" });
        const msg = err instanceof ApiError ? err.message : "Upload failed";
        return { error: msg };
      } finally {
        setTimeout(() => URL.revokeObjectURL(previewUrl), 15000);
      }
    },
    [baseOptimistic, deliver, upsertMessage],
  );

  const retryMessage = useCallback(
    (convId: string, msg: MessageDTO) => {
      if (msg.type === "TEXT" && msg.body) {
        upsertMessage(convId, { ...msg, status: "sending" });
        void deliver(convId, { type: "TEXT", body: msg.body }, { ...msg, status: "sending" });
      } else if ((msg.type === "GIF" || msg.type === "STICKER") && msg.attachment?.url) {
        upsertMessage(convId, { ...msg, status: "sending" });
        void deliver(
          convId,
          {
            type: msg.type,
            media: {
              url: msg.attachment.url,
              width: msg.attachment.width ?? undefined,
              height: msg.attachment.height ?? undefined,
              mime: msg.attachment.mime,
            },
          },
          { ...msg, status: "sending" },
        );
      }
    },
    [deliver, upsertMessage],
  );

  // -------------------------------------------------------------------------
  // typing (throttled: start once, auto-stop after inactivity)
  // -------------------------------------------------------------------------
  const lastTypingSent = useRef<Record<string, number>>({});
  const notifyTyping = useCallback((convId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    const now = Date.now();
    if (now - (lastTypingSent.current[convId] ?? 0) > 2500) {
      socket.emit("typing:start", { conversationId: convId });
      lastTypingSent.current[convId] = now;
    }
    clearTimeout(typingTimers.current[`self-${convId}`]);
    typingTimers.current[`self-${convId}`] = setTimeout(() => {
      socket.emit("typing:stop", { conversationId: convId });
      lastTypingSent.current[convId] = 0;
    }, 2500);
  }, []);

  const stopTyping = useCallback((convId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    clearTimeout(typingTimers.current[`self-${convId}`]);
    socket.emit("typing:stop", { conversationId: convId });
    lastTypingSent.current[convId] = 0;
  }, []);

  // -------------------------------------------------------------------------
  // new conversation
  // -------------------------------------------------------------------------
  const startConversationWith = useCallback(
    async (user: PublicUser) => {
      const { conversationId } = await conversationApi.createDirect(user.id);
      await loadConversations();
      await openConversation(conversationId);
    },
    [loadConversations, openConversation],
  );

  const createGroup = useCallback(
    async (title: string, userIds: string[]) => {
      const { conversationId } = await conversationApi.createGroup(title, userIds);
      await loadConversations();
      await openConversation(conversationId);
    },
    [loadConversations, openConversation],
  );

  const addGroupMembers = useCallback(
    async (convId: string, userIds: string[]) => {
      await conversationApi.addMembers(convId, userIds);
      await loadConversations();
    },
    [loadConversations],
  );

  const removeGroupMember = useCallback(
    async (convId: string, targetUserId: string) => {
      await conversationApi.removeMember(convId, targetUserId);
      await loadConversations();
    },
    [loadConversations],
  );

  const leaveGroup = useCallback(
    async (convId: string) => {
      await conversationApi.leaveGroup(convId);
      if (activeIdRef.current === convId) {
        setActiveId(null);
      }
      await loadConversations();
    },
    [loadConversations],
  );

  const updateGroupTitle = useCallback(
    async (convId: string, title: string) => {
      await conversationApi.updateTitle(convId, title);
      await loadConversations();
    },
    [loadConversations],
  );

  // -------------------------------------------------------------------------
  // socket wiring
  // -------------------------------------------------------------------------
  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", async () => {
      setConnection("connected");
      const convId = activeIdRef.current;
      if (convId) {
        socket.emit("conversation:join", { conversationId: convId }, () => {});
        // Reconcile anything missed while disconnected.
        const list = messagesRef.current[convId] ?? [];
        const maxReal = list.reduce((m, x) => (x.seq < TEMP_SEQ_BASE && x.seq > m ? x.seq : m), 0);
        socket.emit("sync:since", { conversationId: convId, afterSeq: maxReal }, (res) => {
          if (res.ok) {
            const set = seenSet(convId);
            for (const m of res.messages) {
              if (!set.has(m.id)) {
                set.add(m.id);
                set.add(m.clientId);
                upsertMessage(convId, m);
              }
            }
            const top = res.messages[res.messages.length - 1];
            if (top) emitRead(convId, top.seq);
          }
        });
      }
      void loadConversations();
    });

    socket.on("disconnect", () => setConnection("disconnected"));
    socket.io.on("reconnect_attempt", () => setConnection("connecting"));

    socket.on("message:new", (msg) => {
      const set = seenSet(msg.conversationId);
      const isMine = msg.senderId === currentUser.id;
      if (set.has(msg.id) || (isMine && set.has(msg.clientId))) {
        // Already have it (our optimistic, a retry, or another tab). Reconcile.
        upsertMessage(msg.conversationId, msg);
        return;
      }
      set.add(msg.id);
      set.add(msg.clientId);
      upsertMessage(msg.conversationId, msg);
      bumpConversationPreview(setConversations, msg.conversationId, msg);

      const isActive = activeIdRef.current === msg.conversationId;
      if (!isMine && isActive && document.visibilityState === "visible") {
        emitRead(msg.conversationId, msg.seq);
      } else if (!isMine) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === msg.conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c,
          ),
        );
      }
    });

    socket.on("message:status", ({ conversationId, upToSeq, status }) => {
      patchStatuses(conversationId, upToSeq, status);
    });

    socket.on("typing:update", ({ conversationId, userId, typing: isTyping }) => {
      if (userId === currentUser.id) return;
      setTyping((prev) => ({ ...prev, [conversationId]: isTyping }));
      clearTimeout(typingTimers.current[`peer-${conversationId}`]);
      if (isTyping) {
        typingTimers.current[`peer-${conversationId}`] = setTimeout(() => {
          setTyping((prev) => ({ ...prev, [conversationId]: false }));
        }, 6000);
      }
    });

    socket.on("presence:update", ({ userId, online, lastSeenAt }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (!c.otherUser || c.otherUser.id !== userId) return c;
          return { ...c, otherUser: { ...c.otherUser, online, lastSeenAt } };
        }),
      );
    });

    socket.on("group:updated", (payload) => {
      if (
        payload.targetUserId === currentUser.id &&
        (payload.type === "member_removed" || payload.type === "member_left")
      ) {
        if (activeIdRef.current === payload.conversationId) {
          setActiveId(null);
        }
      }
      void loadConversations();
    });

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  // Keep a ref of messages for use inside socket callbacks without re-binding.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initial load.
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Re-mark read when the tab regains focus on the active conversation.
  useEffect(() => {
    const onVisible = () => {
      const convId = activeIdRef.current;
      if (!convId || document.visibilityState !== "visible") return;
      const list = messagesRef.current[convId] ?? [];
      const top = list[list.length - 1];
      if (top && top.seq < TEMP_SEQ_BASE) {
        emitRead(convId, top.seq);
        markConversationRead(convId);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [emitRead, markConversationRead]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations],
  );

  return {
    currentUser,
    conversations,
    activeConversation,
    activeId,
    messages,
    pageInfo,
    typing,
    connection,
    totalUnread,
    openConversation,
    loadOlder,
    sendText,
    sendMedia,
    sendImage,
    retryMessage,
    notifyTyping,
    stopTyping,
    startConversationWith,
    createGroup,
    addGroupMembers,
    removeGroupMember,
    leaveGroup,
    updateGroupTitle,
    setActiveId,
  };
}

// -- module helpers --------------------------------------------------------

function bumpConversationPreview(
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummaryDTO[]>>,
  convId: string,
  msg: MessageDTO,
) {
  setConversations((prev) => {
    const idx = prev.findIndex((c) => c.id === convId);
    if (idx < 0) return prev;
    const existing = prev[idx]!;
    const senderName =
      msg.sender?.displayName ??
      existing.members?.find((m) => m.user.id === msg.senderId)?.user.displayName ??
      null;
    const updated: ConversationSummaryDTO = {
      ...existing,
      lastMessage: {
        id: msg.id,
        type: msg.type,
        body: msg.body,
        senderId: msg.senderId,
        senderName,
        createdAt: msg.createdAt,
      },
      updatedAt: msg.createdAt,
    };
    const rest = prev.filter((_, i) => i !== idx);
    return [updated, ...rest];
  });
}
