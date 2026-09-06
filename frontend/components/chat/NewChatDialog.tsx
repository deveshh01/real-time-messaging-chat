"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/types/types";
import { userApi } from "@/lib/apiClient";
import { Avatar } from "./Avatar";
import { CloseIcon } from "./icons";

interface Props {
  onPick: (user: PublicUser) => void;
  onClose: () => void;
}

export function NewChatDialog({ onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Start a conversation">
        <div className="dialog-head">
          <span>New conversation</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-body">
          <input
            autoFocus
            placeholder="Search people by name or @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading && users.length === 0 ? (
            <div className="picker-empty">Searching…</div>
          ) : users.length === 0 ? (
            <div className="picker-empty">No users found.</div>
          ) : (
            users.map((u) => (
              <button key={u.id} className="user-result" onClick={() => onPick(u)}>
                <Avatar name={u.displayName} color={u.avatarColor} image={u.image} online={u.online} showPresence small />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>@{u.username}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
