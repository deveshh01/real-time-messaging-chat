"use client";

import { useMemo, useState } from "react";
import type { ConversationSummaryDTO, PublicUser } from "@/types/types";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { PlusIcon, LogoutIcon, LogoIcon, SearchIcon, UsersIcon } from "./icons";
import { previewText, timeShort } from "@/lib/format";

interface Props {
  currentUser: PublicUser;
  conversations: ConversationSummaryDTO[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onLogout: () => void;
}

export function Sidebar({
  currentUser,
  conversations,
  activeId,
  onOpen,
  onNewChat,
  onNewGroup,
  onLogout,
}: Props) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      if (c.isGroup) {
        return (
          c.title?.toLowerCase().includes(q) ||
          c.lastMessage?.body?.toLowerCase().includes(q) ||
          c.members?.some(
            (m) =>
              m.user.displayName.toLowerCase().includes(q) ||
              m.user.username.toLowerCase().includes(q),
          )
        );
      }
      const u = c.otherUser;
      return (
        u?.displayName.toLowerCase().includes(q) ||
        u?.username.toLowerCase().includes(q) ||
        c.lastMessage?.body?.toLowerCase().includes(q)
      );
    });
  }, [conversations, filter]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <LogoIcon size={18} />
          </span>
          <span className="brand-name">Real-Time Chat</span>
        </div>
        <ThemeToggle />
        <button className="icon-btn" onClick={onNewGroup} aria-label="New group" title="New group">
          <UsersIcon size={17} />
        </button>
        <button className="icon-btn" onClick={onNewChat} aria-label="New conversation" title="New conversation">
          <PlusIcon />
        </button>
      </div>

      <div className="sidebar-search">
        <SearchIcon size={16} />
        <input
          type="search"
          placeholder="Search chats..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Search conversations"
        />
      </div>

      <div className="conv-list" role="list">
        {conversations.length === 0 ? (
          <div className="side-empty">
            <p>No conversations yet.</p>

            <button className="side-empty-btn" onClick={onNewChat}>
              <PlusIcon size={16} /> Start a conversation
            </button>
            <button className="side-empty-btn secondary" onClick={onNewGroup} style={{ marginTop: 6 }}>
              <UsersIcon size={15} /> Create a group
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="side-empty">
            <p>No matches for “{filter}”.</p>
          </div>
        ) : (
          filtered.map((c) => {
            const title = c.isGroup ? c.title ?? "Group" : c.otherUser?.displayName ?? "Unknown";
            return (
              <button
                key={c.id}
                className="conv-item"
                data-active={c.id === activeId}
                onClick={() => onOpen(c.id)}
                role="listitem"
              >
                <Avatar
                  name={title}
                  color={c.otherUser?.avatarColor ?? "#999"}
                  image={c.otherUser?.image}
                  online={c.otherUser?.online}
                  showPresence={!c.isGroup}
                  isGroup={c.isGroup}
                />
                <div className="conv-main">
                  <div className="conv-top">
                    <span className="conv-name">{title}</span>
                    {c.lastMessage && <span className="conv-time">{timeShort(c.lastMessage.createdAt)}</span>}
                  </div>
                  <div className="conv-bottom">
                    <span className="conv-preview" data-unread={c.unreadCount > 0}>
                      {previewText(c.lastMessage, currentUser.id, c.isGroup)}
                    </span>
                    {c.unreadCount > 0 && <span className="badge">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="sidebar-foot">
        <Avatar name={currentUser.displayName} color={currentUser.avatarColor} image={currentUser.image} small />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="me-name">{currentUser.displayName}</div>
          <div className="me-sub">@{currentUser.username}</div>
        </div>
        <button className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
          <LogoutIcon size={17} />
        </button>
      </div>
    </aside>
  );
}
