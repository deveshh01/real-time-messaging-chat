import type { MessageDTO, MessageStatus } from "@/src/shared/types";
import type { GroupUpdatedPayload } from "@/src/shared/socketEvents";
import { getIO, userRoom, convRoom } from "./io";

/**
 * Real-time fan-out helpers. Usable from BOTH socket handlers and REST routes
 * (a message sent over REST still reaches connected sockets), so there is one
 * consistent broadcast surface. All emits target per-user rooms, which means
 * every tab/device of a user receives the event (multi-tab consistency); the
 * client de-duplicates by message id / clientId.
 */

export function emitNewMessage(message: MessageDTO, participantIds: string[]): void {
  const io = getIO();
  if (!io) return;
  for (const uid of participantIds) {
    io.to(userRoom(uid)).emit("message:new", message);
  }
  // Nudge sidebars to reorder / refresh previews.
  for (const uid of participantIds) {
    io.to(userRoom(uid)).emit("conversation:bump", { conversationId: message.conversationId });
  }
}

export function emitStatus(
  conversationId: string,
  upToSeq: number,
  status: Extract<MessageStatus, "delivered" | "read">,
  byUserId: string,
  notifyUserIds: string[],
): void {
  const io = getIO();
  if (!io) return;
  for (const uid of notifyUserIds) {
    io.to(userRoom(uid)).emit("message:status", { conversationId, upToSeq, status, byUserId });
  }
}

export function emitTyping(
  conversationId: string,
  userId: string,
  typing: boolean,
  notifyUserIds: string[],
): void {
  const io = getIO();
  if (!io) return;
  for (const uid of notifyUserIds) {
    io.to(userRoom(uid)).emit("typing:update", { conversationId, userId, typing });
  }
}

export function emitPresence(
  userId: string,
  online: boolean,
  lastSeenAt: string,
  notifyUserIds: string[],
): void {
  const io = getIO();
  if (!io) return;
  for (const uid of notifyUserIds) {
    io.to(userRoom(uid)).emit("presence:update", { userId, online, lastSeenAt });
  }
}

export function emitGroupUpdated(payload: GroupUpdatedPayload, notifyUserIds: string[]): void {
  const io = getIO();
  if (!io) return;
  for (const uid of notifyUserIds) {
    io.to(userRoom(uid)).emit("group:updated", payload);
    io.to(userRoom(uid)).emit("conversation:bump", { conversationId: payload.conversationId });
  }
}

export { userRoom, convRoom };
