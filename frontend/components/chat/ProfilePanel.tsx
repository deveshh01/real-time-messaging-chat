"use client";

import { useMemo, useState } from "react";
import type { ConversationSummaryDTO, MessageDTO, PublicUser } from "@/types/types";
import { Avatar } from "./Avatar";
import { CloseIcon, LogoutIcon, PlusIcon } from "./icons";
import { relativeSeen } from "@/lib/format";
import { userApi } from "@/lib/apiClient";

interface Props {
  conversation: ConversationSummaryDTO;
  messages: MessageDTO[];
  currentUserId: string;
  onClose: () => void;
  onLogout: () => void;
  onAddMembers?: (userIds: string[]) => Promise<void>;
  onRemoveMember?: (userId: string) => Promise<void>;
  onLeaveGroup?: () => Promise<void>;
  onUpdateTitle?: (title: string) => Promise<void>;
}

export function ProfilePanel({
  conversation,
  messages,
  currentUserId,
  onClose,
  onLogout,
  onAddMembers,
  onRemoveMember,
  onLeaveGroup,
  onUpdateTitle,
}: Props) {
  const isGroup = conversation.isGroup;
  const other = conversation.otherUser;
  const online = !isGroup && !!other?.online;

  const members = conversation.members ?? [];
  const myMember = members.find((m) => m.user.id === currentUserId);
  const isAdmin = isGroup && myMember?.role === "admin";

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(conversation.title ?? "");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [addUsersList, setAddUsersList] = useState<PublicUser[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [loadingAdd, setLoadingAdd] = useState(false);

  // Shared media filter
  const media = useMemo(
    () =>
      messages
        .filter((m) => m.type === "IMAGE" && m.attachment?.url)
        .slice()
        .reverse()
        .slice(0, 8),
    [messages],
  );

  const handleSaveTitle = async () => {
    if (!newTitle.trim() || !onUpdateTitle) return;
    try {
      await onUpdateTitle(newTitle.trim());
      setIsEditingTitle(false);
    } catch {
      /* ignore */
    }
  };

  const handleOpenAddModal = async () => {
    setShowAddModal(true);
    setLoadingAdd(true);
    try {
      const res = await userApi.search("");
      const existingIds = new Set(members.map((m) => m.user.id));
      setAddUsersList(res.users.filter((u) => !existingIds.has(u.id)));
    } finally {
      setLoadingAdd(false);
    }
  };

  const handleSearchAddUsers = async (q: string) => {
    setAddSearchQuery(q);
    const res = await userApi.search(q);
    const existingIds = new Set(members.map((m) => m.user.id));
    setAddUsersList(res.users.filter((u) => !existingIds.has(u.id)));
  };

  const handleConfirmAddMembers = async () => {
    if (selectedToAdd.length === 0 || !onAddMembers) return;
    try {
      await onAddMembers(selectedToAdd);
      setShowAddModal(false);
      setSelectedToAdd([]);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="profile-panel">
      <button
        className="icon-btn profile-close"
        onClick={onClose}
        aria-label="Close info panel"
        style={{ display: "none" }}
        data-mobile-only
      >
        <CloseIcon />
      </button>

      <div className="profile-hero">
        <Avatar
          name={isGroup ? conversation.title ?? "Group" : other?.displayName ?? "?"}
          color={other?.avatarColor ?? "#999"}
          image={other?.image}
          large
          isGroup={isGroup}
        />
        {isGroup ? (
          <div className="profile-name-group">
            {isEditingTitle ? (
              <div className="title-edit-row">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                  className="title-edit-input"
                />
                <button className="save-btn" onClick={handleSaveTitle}>Save</button>
                <button className="cancel-btn" onClick={() => setIsEditingTitle(false)}>Cancel</button>
              </div>
            ) : (
              <div className="profile-name">
                {conversation.title ?? "Group"}
                {isAdmin && (
                  <button className="edit-title-btn" onClick={() => { setNewTitle(conversation.title ?? ""); setIsEditingTitle(true); }}>
                    ✎
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="profile-name">
            <span className="presence-inline" data-online={online} aria-hidden="true" />
            {other?.displayName ?? "Unknown"}
          </div>
        )}

        <div className="profile-sub">
          {isGroup
            ? `${members.length} members`
            : `${online ? "Online" : relativeSeen(other?.lastSeenAt)} · @${other?.username ?? "unknown"}`}
        </div>
      </div>

      {isGroup && (
        <div className="profile-members-section">
          <div className="profile-section-header">
            <span>Group Members ({members.length})</span>
            {isAdmin && (
              <button className="add-member-btn" onClick={handleOpenAddModal}>
                <PlusIcon size={14} /> Add
              </button>
            )}
          </div>

          <div className="members-list">
            {members.map((m) => {
              const isMe = m.user.id === currentUserId;
              return (
                <div key={m.user.id} className="member-row">
                  <Avatar
                    name={m.user.displayName}
                    color={m.user.avatarColor}
                    image={m.user.image}
                    online={m.user.online}
                    showPresence
                    small
                  />
                  <div className="member-info">
                    <div className="member-name">
                      {m.user.displayName} {isMe && <span className="me-badge">(You)</span>}
                    </div>
                    <div className="member-sub">@{m.user.username}</div>
                  </div>
                  <div className="member-actions">
                    {m.role === "admin" && <span className="admin-badge">Admin</span>}
                    {isAdmin && !isMe && (
                      <button
                        className="remove-member-btn"
                        onClick={() => onRemoveMember?.(m.user.id)}
                        title="Remove member"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button className="leave-group-btn" onClick={() => onLeaveGroup?.()}>
            Leave Group
          </button>
        </div>
      )}

      <div className="profile-media">
        <div className="profile-section-title">Media</div>
        {media.length === 0 ? (
          <div className="profile-media-empty">No shared images yet.</div>
        ) : (
          <div className="media-grid">
            {media.map((m) => (
              <a
                key={m.id}
                href={m.attachment!.url!}
                target="_blank"
                rel="noreferrer"
                className="media-thumb"
                aria-label="Open shared image"
              >
                <img src={m.attachment!.url!} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="dialog-overlay" onClick={() => setShowAddModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head">
              <span>Add Members</span>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="dialog-body">
              <input
                placeholder="Search people to add..."
                value={addSearchQuery}
                onChange={(e) => handleSearchAddUsers(e.target.value)}
              />
              <div className="user-select-list">
                {loadingAdd ? (
                  <div className="picker-empty">Loading...</div>
                ) : addUsersList.length === 0 ? (
                  <div className="picker-empty">No users available to add.</div>
                ) : (
                  addUsersList.map((u) => {
                    const sel = selectedToAdd.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        className="user-result selectable"
                        data-selected={sel}
                        onClick={() =>
                          setSelectedToAdd((prev) =>
                            sel ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                          )
                        }
                      >
                        <Avatar name={u.displayName} color={u.avatarColor} image={u.image} small />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>@{u.username}</div>
                        </div>
                        <div className="checkbox-indicator">{sel ? "✓" : "+"}</div>
                      </button>
                    );
                  })
                )}
              </div>
              <button
                className="primary-btn"
                onClick={handleConfirmAddMembers}
                disabled={selectedToAdd.length === 0}
                style={{ marginTop: 12, width: "100%" }}
              >
                Add Selected ({selectedToAdd.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <button className="logout-pill" onClick={onLogout}>
        <LogoutIcon size={17} /> Log out
      </button>
    </aside>
  );
}
