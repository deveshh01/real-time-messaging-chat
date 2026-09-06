import { memo } from "react";
import type { MessageDTO } from "@/types/types";
import { timeShort } from "@/lib/format";
import { StatusTicks } from "./StatusTicks";

interface Props {
  message: MessageDTO;
  mine: boolean;
  grouped: boolean;
  showSender?: boolean;
  onRetry: (m: MessageDTO) => void;
}

/**
 * A single message bubble. Memoized so re-rendering the list (e.g. a status
 * change on one message) doesn't re-render every other bubble.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  grouped,
  showSender,
  onRetry,
}: Props) {
  const isSticker = message.type === "STICKER";
  const isMedia = message.type === "IMAGE" || message.type === "GIF";
  const att = message.attachment;

  const senderName = message.sender?.displayName;
  const senderColor = message.sender?.avatarColor ?? "#6366f1";

  return (
    <div className={`row ${mine ? "out" : "in"}${grouped ? " grouped" : ""}`}>
      <div className={`bubble${isMedia ? " media" : ""}${isSticker ? " sticker" : ""}`}>
        {!mine && showSender && senderName && (
          <div className="msg-sender-name" style={{ color: senderColor }}>
            {senderName}
          </div>
        )}
        {message.type === "TEXT" && <div className="text">{message.body}</div>}

        {isSticker && att?.url && (
          <img className="sticker-img" src={att.url} alt="Sticker" loading="lazy" />
        )}

        {message.type === "GIF" && att?.url && (
          <img
            className="msg-img"
            src={att.url}
            alt="GIF"
            loading="lazy"
            width={att.width ?? undefined}
            height={att.height ?? undefined}
          />
        )}

        {message.type === "IMAGE" && <ImageContent message={message} />}

        {isMedia && message.body && <div className="caption">{message.body}</div>}

        {!isSticker && (
          <div className="msg-meta">
            <span>{timeShort(message.createdAt)}</span>
            {mine && message.status === "failed" ? (
              <button className="retry" onClick={() => onRetry(message)}>
                retry
              </button>
            ) : (
              mine && <StatusTicks status={message.status} />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function ImageContent({ message }: { message: MessageDTO }) {
  const att = message.attachment;
  // Optimistic image being moderated shows a state, not the recipient's view.
  if (message.status === "sending" && att?.moderationStatus === "PENDING") {
    return (
      <div className="media-state">
        <span className="spinner" /> Moderating image…
      </div>
    );
  }
  if (message.status === "failed") {
    return <div className="media-state">Image could not be sent</div>;
  }
  if (!att?.url) return <div className="media-state">Image unavailable</div>;
  return <img className="msg-img" src={att.url} alt="Shared image" loading="lazy" />;
}
