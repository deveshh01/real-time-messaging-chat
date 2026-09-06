"use client";

import type { ConversationSummaryDTO } from "@/types/types";
import { Avatar } from "./Avatar";
import { BackIcon, InfoIcon } from "./icons";
import { relativeSeen } from "@/lib/format";

interface Props {
  conversation: ConversationSummaryDTO;
  typing: boolean;
  infoOpen: boolean;
  onBack: () => void;
  onToggleInfo: () => void;
}

export function ChatHeader({ conversation, typing, infoOpen, onBack, onToggleInfo }: Props) {
  const isGroup = conversation.isGroup;
  const other = conversation.otherUser;
  const online = !isGroup && !!other?.online;

  let title = "Unknown";
  let statusText = "";

  if (isGroup) {
    title = conversation.title ?? "Group";
    const count = conversation.memberCount ?? conversation.members?.length ?? 0;
    const memberNames = conversation.members
      ? conversation.members.map((m) => m.user.displayName.split(" ")[0]).join(", ")
      : "";
    statusText = typing ? "typing…" : memberNames ? `${count} members: ${memberNames}` : `${count} members`;
  } else {
    title = other?.displayName ?? "Unknown";
    statusText = typing ? "typing…" : online ? "online" : relativeSeen(other?.lastSeenAt);
  }

  return (
    <div className="chat-header">
      <button className="icon-btn" onClick={onBack} aria-label="Back" style={{ display: "none" }} data-mobile-only>
        <BackIcon />
      </button>
      <Avatar
        name={title}
        color={other?.avatarColor ?? "#999"}
        image={other?.image}
        online={online}
        showPresence={!isGroup}
        isGroup={isGroup}
      />
      <div className="who">
        <div className="name">{title}</div>
        <div className="status" data-online={online && !typing}>
          {statusText}
        </div>
      </div>
      <button
        className="icon-btn"
        onClick={onToggleInfo}
        aria-label={infoOpen ? "Hide conversation info" : "Show conversation info"}
        title="Conversation info"
        data-active={infoOpen}
      >
        <InfoIcon />
      </button>
    </div>
  );
}
