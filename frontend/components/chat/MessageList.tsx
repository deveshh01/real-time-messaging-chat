"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessageDTO } from "@/types/types";
import { dayLabel, sameDay } from "@/lib/format";
import { MessageBubble } from "./MessageBubble";

interface Props {
  conversationId: string;
  messages: MessageDTO[];
  meId: string;
  typing: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  loadedInitial: boolean;
  isGroup?: boolean;
  onLoadOlder: () => void;
  onRetry: (m: MessageDTO) => void;
}

const NEAR_BOTTOM_PX = 140;
const TOP_TRIGGER_PX = 80;

export function MessageList({
  conversationId,
  messages,
  meId,
  typing,
  hasMore,
  loadingOlder,
  loadedInitial,
  isGroup,
  onLoadOlder,
  onRetry,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevHeightRef = useRef<number | null>(null);
  const prevLenRef = useRef(0);
  const prevConvRef = useRef(conversationId);
  const [showJump, setShowJump] = useState(false);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // Preserve scroll position when older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const convChanged = prevConvRef.current !== conversationId;
    prevConvRef.current = conversationId;

    if (convChanged) {
      // New conversation: jump to bottom without animation.
      el.scrollTop = el.scrollHeight;
      prevLenRef.current = messages.length;
      prevHeightRef.current = null;
      atBottomRef.current = true;
      return;
    }

    if (prevHeightRef.current !== null) {
      // We just prepended older messages — keep the viewport anchored.
      el.scrollTop = el.scrollHeight - prevHeightRef.current;
      prevHeightRef.current = null;
      prevLenRef.current = messages.length;
      return;
    }

    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (grew && atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, conversationId]);

  // Keep pinned to bottom when the peer's typing indicator appears.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typing && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [typing]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distanceFromBottom < NEAR_BOTTOM_PX;
    setShowJump(distanceFromBottom > 400);
    if (el.scrollTop < TOP_TRIGGER_PX && hasMore && !loadingOlder) {
      prevHeightRef.current = el.scrollHeight; // snapshot for restore
      onLoadOlder();
    }
  }

  if (!loadedInitial) {
    return (
      <div className="msg-scroll" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: 38,
              width: `${40 + ((i * 13) % 45)}%`,
              alignSelf: i % 2 ? "flex-end" : "flex-start",
              margin: "4px 0",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="msg-area">
    <div className="msg-scroll" ref={scrollRef} onScroll={onScroll}>
      {hasMore && (
        <div className="load-older">{loadingOlder ? "Loading earlier messages…" : ""}</div>
      )}
      {!hasMore && messages.length === 0 && (
        <div className="chat-empty" style={{ flex: 1 }}>
          <div>
            <div className="big">No messages yet</div>
            <div>Say hello to start the conversation.</div>
          </div>
        </div>
      )}

      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const showDay = !prev || !sameDay(new Date(prev.createdAt), new Date(m.createdAt));
        const grouped = !!prev && prev.senderId === m.senderId && !showDay;
        return (
          <div key={m.id}>
            {showDay && (
              <div className="day-sep">
                <span>{dayLabel(m.createdAt)}</span>
              </div>
            )}
            <MessageBubble
              message={m}
              mine={m.senderId === meId}
              grouped={grouped}
              showSender={isGroup}
              onRetry={onRetry}
            />
          </div>
        );
      })}

      {typing && (
        <div className="row in typing-row">
          <div className="typing-bubble" aria-label="Contact is typing">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
      {showJump && (
        <button className="jump-btn" onClick={scrollToBottom} aria-label="Scroll to latest messages">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
