import type {
  Attachment,
  Message,
  User,
} from "@prisma/client";
import type {
  AttachmentDTO,
  MessageDTO,
  MessageStatus,
  PublicUser,
} from "@/src/shared/types";
import { presence } from "./presenceService";

export function toPublicUser(
  user: Pick<User, "id" | "username" | "displayName" | "avatarColor" | "lastSeenAt"> & {
    image?: string | null;
  },
): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    image: user.image ?? null,
    online: presence.isOnline(user.id),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

export function toAttachmentDTO(a: Attachment): AttachmentDTO {
  const url =
    a.kind === "IMAGE"
      ? `/api/attachments/${a.id}` // authorized, moderated route
      : a.url; // GIF / STICKER external url
  return {
    id: a.id,
    kind: a.kind,
    mime: a.mime,
    width: a.width,
    height: a.height,
    moderationStatus: a.moderationStatus,
    url,
  };
}

/** Read/delivery watermarks of the *other* participant, for status derivation. */
export interface OtherWatermark {
  readSeq: bigint;
  deliveredSeq: bigint;
}

/**
 * Serialize a message for a specific viewer. Outgoing status is derived from the
 * other participant's read/delivery watermarks (no per-message receipt rows).
 */
export function toMessageDTO(
  message: Message & {
    attachment: Attachment | null;
    sender?: (Pick<User, "id" | "username" | "displayName" | "avatarColor" | "lastSeenAt"> & { image?: string | null }) | null;
  },
  viewerId: string,
  other: OtherWatermark,
): MessageDTO {
  const seq = Number(message.seq);
  let status: MessageStatus = "sent";
  if (message.senderId === viewerId) {
    if (other.readSeq >= message.seq) status = "read";
    else if (other.deliveredSeq >= message.seq) status = "delivered";
    else status = "sent";
  }
  return {
    id: message.id,
    seq,
    conversationId: message.conversationId,
    senderId: message.senderId,
    sender: message.sender ? toPublicUser(message.sender) : null,
    type: message.type,
    body: message.body,
    attachment: message.attachment ? toAttachmentDTO(message.attachment) : null,
    clientId: message.clientId,
    createdAt: message.createdAt.toISOString(),
    status,
  };
}
