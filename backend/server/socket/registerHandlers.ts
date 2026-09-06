import type { AppServer } from "./io";
import { userRoom, convRoom } from "./io";
import { emitStatus, emitTyping, emitPresence } from "./broadcast";
import { fanoutMessage } from "./dispatch";
import { logger } from "@/src/lib/logger";
import { AppError } from "@/src/lib/errors";
import { limiters } from "@/src/lib/rateLimiter";
import { prisma } from "@/src/server/db/prisma";
import { presence } from "@/src/server/services/presenceService";
import { sendMessage } from "@/src/server/services/messageService";
import { markRead } from "@/src/server/services/readService";
import { assertMembership, getConversationMembers } from "@/src/server/services/authz";
import { getContactUserIds } from "@/src/server/services/conversationService";
import { getMessagesAfter } from "@/src/server/repositories/messageRepo";
import { toMessageDTO } from "@/src/server/services/serialize";
import type { AckResult } from "@/src/shared/socketEvents";

/** Convert any thrown error into a safe ack payload (no internals leaked). */
function errorAck(err: unknown): AckResult<never> {
  if (err instanceof AppError) {
    return { ok: false, error: { code: err.code, message: err.message, detail: err.detail } };
  }
  logger.error("socket handler error", { err: (err as Error).message });
  return { ok: false, error: { code: "INTERNAL", message: "Something went wrong" } };
}

export function registerHandlers(io: AppServer): void {
  io.on("connection", async (socket) => {
    const userId = socket.data.userId;
    socket.join(userRoom(userId));
    logger.info("socket connected", { userId, socketId: socket.id });

    // ---- presence: online on first socket ----
    const wentOnline = presence.add(userId, socket.id);
    const contacts = await getContactUserIds(userId).catch(() => []);
    void prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
    if (wentOnline) {
      emitPresence(userId, true, new Date().toISOString(), contacts);
    }
    // Send current online contacts to this fresh socket so its UI is accurate.
    for (const cid of contacts) {
      if (presence.isOnline(cid)) {
        socket.emit("presence:update", {
          userId: cid,
          online: true,
          lastSeenAt: new Date().toISOString(),
        });
      }
    }

    // ---- join / leave a conversation room (authorized) ----
    socket.on("conversation:join", async ({ conversationId }, ack) => {
      try {
        await assertMembership(userId, conversationId);
        socket.join(convRoom(conversationId));
        ack({ ok: true });
      } catch (err) {
        ack(errorAck(err));
      }
    });

    socket.on("conversation:leave", ({ conversationId }) => {
      socket.leave(convRoom(conversationId));
    });

    // ---- send message (rate-limited, moderated, idempotent) ----
    socket.on("message:send", async (payload, ack) => {
      const rl = limiters.message.consume(userId);
      if (!rl.allowed) {
        return ack({
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "You are sending messages too fast",
            detail: { retryAfterMs: rl.retryAfterMs },
          },
        });
      }
      try {
        const result = await sendMessage(userId, payload);
        // Ack the originating tab first (fast path for optimistic UI).
        ack({ ok: true, message: result.message });
        // Fan out to participants (+ delivered handling) via shared dispatcher.
        await fanoutMessage(userId, result);
      } catch (err) {
        ack(errorAck(err));
      }
    });

    // ---- read receipts ----
    socket.on("message:read", async ({ conversationId, upToSeq }, ack) => {
      try {
        const res = await markRead(userId, conversationId, upToSeq);
        if (res.notifyUserIds.length) {
          emitStatus(conversationId, res.readSeq, "read", userId, res.notifyUserIds);
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.(errorAck(err));
      }
    });

    // ---- typing indicators (client throttles; server just relays) ----
    const relayTyping = async (conversationId: string, typing: boolean) => {
      try {
        const { others } = await getConversationMembers(userId, conversationId);
        if (others.length > 0) emitTyping(conversationId, userId, typing, others.map((m) => m.userId));
      } catch {
        /* not a member — ignore */
      }
    };
    socket.on("typing:start", ({ conversationId }) => void relayTyping(conversationId, true));
    socket.on("typing:stop", ({ conversationId }) => void relayTyping(conversationId, false));

    // ---- reconnection reconciliation: replay messages missed while away ----
    socket.on("sync:since", async ({ conversationId, afterSeq }, ack) => {
      try {
        const { me, others } = await getConversationMembers(userId, conversationId);
        const rows = await getMessagesAfter(conversationId, BigInt(Math.max(0, afterSeq)));
        const watermark = {
          readSeq: others.reduce((max, m) => (m.lastReadSeq > max ? m.lastReadSeq : max), 0n),
          deliveredSeq: others.reduce((max, m) => (m.lastDeliveredSeq > max ? m.lastDeliveredSeq : max), 0n),
        };
        const messages = rows.map((m) => toMessageDTO(m, userId, watermark));
        void me; // membership already asserted by getConversationMembers
        ack({ ok: true, messages });
      } catch (err) {
        ack(errorAck(err));
      }
    });

    // ---- disconnect: offline on last socket ----
    socket.on("disconnect", async (reason) => {
      const wentOffline = presence.remove(userId, socket.id);
      logger.info("socket disconnected", { userId, socketId: socket.id, reason });
      if (wentOffline) {
        const now = new Date();
        await prisma.user
          .update({ where: { id: userId }, data: { lastSeenAt: now } })
          .catch(() => {});
        const c = await getContactUserIds(userId).catch(() => []);
        emitPresence(userId, false, now.toISOString(), c);
      }
    });
  });
}
