"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/types/types";
import { userApi } from "@/lib/apiClient";
import { Avatar } from "./Avatar";
import { CloseIcon, PlusIcon } from "./icons";

interface Props {
  onCreate: (title: string, userIds: string[]) => void;
  onClose: () => void;
}

export function NewGroupDialog({ onCreate, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const reqId = useRef(0);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await userApi.search(query.trim());
        if (id === reqId.current) setUsers(res.users);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [query]);

  const toggleSelect = (user: PublicUser) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreate = () => {
    setError("");
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Please enter a group name");
      return;
    }
    if (selectedUsers.length === 0) {
      setError("Please select at least one member to add");
      return;
    }
    onCreate(
      trimmedTitle,
      selectedUsers.map((u) => u.id),
    );
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog group-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Create a group">
        <div className="dialog-head">
          <span>Create New Group</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="dialog-body">
          {error && <div className="dialog-error">{error}</div>}

          <div className="group-title-input">
            <label htmlFor="group-name-input" className="dialog-label">Group Name</label>
            <input
              id="group-name-input"
              autoFocus
              placeholder="e.g. Project Team"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="dialog-label">Select Members ({selectedUsers.length} selected)</div>

          {selectedUsers.length > 0 && (
            <div className="chips-row">
              {selectedUsers.map((u) => (
                <span key={u.id} className="user-chip">
                  <Avatar name={u.displayName} color={u.avatarColor} image={u.image} small />
                  <span className="chip-name">{u.displayName.split(" ")[0]}</span>
                  <button
                    className="chip-remove"
                    onClick={() => toggleSelect(u)}
                    aria-label={`Remove ${u.displayName}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            placeholder="Search people by name or @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="user-select-list">
            {loading && users.length === 0 ? (
              <div className="picker-empty">Searching…</div>
            ) : users.length === 0 ? (
              <div className="picker-empty">No users found.</div>
            ) : (
              users.map((u) => {
                const selected = selectedUsers.some((s) => s.id === u.id);
                return (
                  <button
                    key={u.id}
                    className="user-result selectable"
                    data-selected={selected}
                    onClick={() => toggleSelect(u)}
                  >
                    <Avatar name={u.displayName} color={u.avatarColor} image={u.image} online={u.online} showPresence small />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>@{u.username}</div>
                    </div>
                    <div className="checkbox-indicator">{selected ? "✓" : "+"}</div>
                  </button>
                );
              })
            )}
          </div>

          <button className="primary-btn" onClick={handleCreate} style={{ marginTop: 12, width: "100%" }}>
            <PlusIcon size={16} /> Create Group ({selectedUsers.length + 1} members)
          </button>
        </div>
      </div>
    </div>
  );
}
