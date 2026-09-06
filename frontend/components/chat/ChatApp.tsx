"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@/types/types";
import { authApi } from "@/lib/apiClient";
import { useChat } from "@/hooks/useChat";
import { Sidebar } from "./Sidebar";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { NewChatDialog } from "./NewChatDialog";
import { NewGroupDialog } from "./NewGroupDialog";
import { ProfilePanel } from "./ProfilePanel";
import "./chat.css";

interface Props {
  currentUser: PublicUser;
}

export function ChatApp({ currentUser }: Props) {
  const router = useRouter();
  const me: PublicUser = { ...currentUser, online: true };
  const chat = useChat(me);
  const [showChatMobile, setShowChatMobile] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const openConversation = useCallback(
    (id: string) => {
      setShowChatMobile(true);
      void chat.openConversation(id);
    },
    [chat],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const active = chat.activeConversation;
  const activeId = chat.activeId;
  const messages = activeId ? chat.messages[activeId] ?? [] : [];
  const info = activeId ? chat.pageInfo[activeId] : undefined;

  return (
    <div className="app-shell">
      <span className="glow glow-1" aria-hidden="true" />
      <span className="glow glow-2" aria-hidden="true" />
      <div className="app" data-view={showChatMobile ? "chat" : "list"} data-info={infoOpen && !!active}>
      <Sidebar
        currentUser={me}
        conversations={chat.conversations}
        activeId={activeId}
        onOpen={(id) => {
          setInfoOpen(false);
          openConversation(id);
        }}
        onNewChat={() => setNewChatOpen(true)}
        onNewGroup={() => setNewGroupOpen(true)}
        onLogout={logout}
      />

      <section className="chat-pane">
        {chat.connection !== "connected" && (
          <div className="conn-banner" data-state={chat.connection}>
            {chat.connection === "connecting" ? "Reconnecting…" : "You are offline — messages will send when reconnected"}
          </div>
        )}

        {!active || !activeId ? (
          <div className="chat-empty">
            <div>
              <div className="chat-empty-icon" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.5 8.5 0 0 1-11.6 7.9L3 21l1.6-6.4A8.5 8.5 0 1 1 21 11.5Z" />
                </svg>
              </div>
              <div className="big">Welcome, {currentUser.displayName.split(" ")[0]}</div>
              <div>Select a conversation or start a new one to begin messaging.</div>
            </div>
          </div>
        ) : (
          <>
            <ChatHeader
              conversation={active}
              typing={!!chat.typing[activeId]}
              infoOpen={infoOpen}
              onBack={() => setShowChatMobile(false)}
              onToggleInfo={() => setInfoOpen((v) => !v)}
            />
            <MessageList
              conversationId={activeId}
              messages={messages}
              meId={currentUser.id}
              typing={!!chat.typing[activeId]}
              hasMore={info?.nextCursor !== null && info?.nextCursor !== undefined}
              loadingOlder={!!info?.loadingOlder}
              loadedInitial={!!info?.loadedInitial}
              isGroup={active.isGroup}
              onLoadOlder={() => chat.loadOlder(activeId)}
              onRetry={(m) => chat.retryMessage(activeId, m)}
            />
            <Composer
              onSendText={(t) => chat.sendText(activeId, t)}
              onSendImage={(f) => chat.sendImage(activeId, f)}
              onSendMedia={(type, media) => chat.sendMedia(activeId, type, media)}
              onTyping={() => chat.notifyTyping(activeId)}
              onStopTyping={() => chat.stopTyping(activeId)}
            />
          </>
        )}
      </section>

      {infoOpen && active && (
        <ProfilePanel
          conversation={active}
          messages={messages}
          currentUserId={currentUser.id}
          onClose={() => setInfoOpen(false)}
          onLogout={logout}
          onAddMembers={async (ids) => {
            await chat.addGroupMembers(active.id, ids);
          }}
          onRemoveMember={async (uid) => {
            await chat.removeGroupMember(active.id, uid);
          }}
          onLeaveGroup={async () => {
            await chat.leaveGroup(active.id);
            setInfoOpen(false);
          }}
          onUpdateTitle={async (title) => {
            await chat.updateGroupTitle(active.id, title);
          }}
        />
      )}

      {newChatOpen && (
        <NewChatDialog
          onClose={() => setNewChatOpen(false)}
          onPick={async (u) => {
            setNewChatOpen(false);
            setShowChatMobile(true);
            await chat.startConversationWith(u);
          }}
        />
      )}

      {newGroupOpen && (
        <NewGroupDialog
          onClose={() => setNewGroupOpen(false)}
          onCreate={async (title, userIds) => {
            setNewGroupOpen(false);
            setShowChatMobile(true);
            await chat.createGroup(title, userIds);
          }}
        />
      )}
      </div>
    </div>
  );
}
