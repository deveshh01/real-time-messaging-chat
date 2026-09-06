import type { SendResult } from "@/src/server/services/messageService";
import { markDelivered } from "@/src/server/services/readService";
import { presence } from "@/src/server/services/presenceService";
import { emitNewMessage, emitStatus } from "./broadcast";

/**
 * Fan out a freshly-created message to all participants and, for any recipient
 * currently connected, advance their delivered watermark + notify the sender.
 *
 * Shared by the socket handler and the REST send fallback so behavior is
 * identical regardless of transport. No-op for idempotent re-sends (created=false).
 */
export async function fanoutMessage(senderId: string, result: SendResult): Promise<void> {
  if (!result.created) return;

  const participants = [senderId, ...result.recipientIds];
  emitNewMessage(result.message, participants);

  for (const rid of result.recipientIds) {
    if (presence.isOnline(rid)) {
      const d = await markDelivered(rid, result.message.conversationId, result.message.seq);
      if (d.notifyUserIds.length) {
        emitStatus(
          result.message.conversationId,
          d.deliveredSeq,
          "delivered",
          rid,
          d.notifyUserIds,
        );
      }
    }
  }
}
