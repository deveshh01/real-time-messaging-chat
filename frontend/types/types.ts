/**
 * DTOs shared between client and server. These are the *wire* shapes — they
 * never include password hashes, storage keys, or other server-only fields.
 *
 * Note on `seq`: stored as BigInt in Postgres, serialized to `number` here.
 * Realistic conversation volumes stay far below Number.MAX_SAFE_INTEGER, so a
 * number keeps client-side ordering/cursor math simple. (Trade-off documented
 * in the README.)
 */

export type MessageType = "TEXT" | "IMAGE" | "GIF" | "STICKER";
export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED" | "FAILED";

/** Derived, per-viewer delivery lifecycle for an *outgoing* message. */
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  image?: string | null;
  online?: boolean;
  lastSeenAt?: string;
}

export interface AttachmentDTO {
  id: string;
  kind: "IMAGE" | "GIF" | "STICKER";
  mime: string;
  width: number | null;
  height: number | null;
  moderationStatus: ModerationStatus;
  /** For IMAGE: an authorized in-app URL. For GIF/STICKER: the external URL. */
  url: string | null;
}

export interface GroupMemberDTO {
  user: PublicUser;
  role: "admin" | "member";
  joinedAt: string;
}

export interface MessageDTO {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  sender?: PublicUser | null;
  type: MessageType;
  body: string | null;
  attachment: AttachmentDTO | null;
  clientId: string;
  createdAt: string;
  /** Server-derived status for the *current viewer*. */
  status: MessageStatus;
}

export interface ConversationSummaryDTO {
  id: string;
  isGroup: boolean;
  title: string | null;
  /** The other participant for 1:1 conversations. */
  otherUser: PublicUser | null;
  /** Members list for group conversations. */
  members?: GroupMemberDTO[];
  memberCount?: number;
  lastMessage: (Pick<MessageDTO, "id" | "type" | "body" | "senderId" | "createdAt"> & { senderName?: string | null }) | null;
  unreadCount: number;
  updatedAt: string;
}

export interface MessagePage {
  messages: MessageDTO[];
  /** Cursor to pass back to fetch the next (older) page; null when at start. */
  nextCursor: number | null;
}

export interface GifResult {
  id: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

export interface GifSearchResponse {
  enabled: boolean;
  gifs: GifResult[];
  next: string | null;
}
