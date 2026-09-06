import { prisma } from "@/src/server/db/prisma";
import { assertMembership, getConversationMembers } from "./authz";

export interface ReadResult {
  conversationId: string;
  readSeq: number;
  /** Members to notify that their messages were read (other participants). */
  notifyUserIds: string[];
}

/**
 * Advance a member's read watermark. Monotonic: never moves backwards, and is
 * clamped to the latest message seq so a client can't mark unseen messages read.
 */
export async function markRead(
  userId: string,
  conversationId: string,
  upToSeq: number,
): Promise<ReadResult> {
  await assertMembership(userId, conversationId);

  const latest = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  const cap = latest?.seq ?? 0n;
  const target = upToSeq > 0 ? (BigInt(upToSeq) < cap ? BigInt(upToSeq) : cap) : cap;

  // Only advance; concurrent tabs/devices converge to the max.
  const res = await prisma.conversationMember.updateMany({
    where: { conversationId, userId, lastReadSeq: { lt: target } },
    data: { lastReadSeq: target },
  });

  const { others } = await getConversationMembers(userId, conversationId);
  return {
    conversationId,
    readSeq: Number(target),
    // Only notify if we actually advanced, and notify other members.
    notifyUserIds: res.count > 0 ? others.map((m) => m.userId) : [],
  };
}

/**
 * Advance a member's delivered watermark (recipient's client has received up to
 * `upToSeq`). Used to render the "delivered" state on the sender side.
 */
export async function markDelivered(
  userId: string,
  conversationId: string,
  upToSeq: number,
): Promise<{ notifyUserIds: string[]; deliveredSeq: number }> {
  const target = BigInt(Math.max(0, upToSeq));
  const res = await prisma.conversationMember.updateMany({
    where: { conversationId, userId, lastDeliveredSeq: { lt: target } },
    data: { lastDeliveredSeq: target },
  });
  const { others } = await getConversationMembers(userId, conversationId);
  return {
    deliveredSeq: Number(target),
    notifyUserIds: res.count > 0 ? others.map((m) => m.userId) : [],
  };
}

/** Unread messages in a conversation for a user (excludes their own). */
export function unreadCount(userId: string, conversationId: string, lastReadSeq: bigint) {
  return prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      senderId: { not: userId },
      seq: { gt: lastReadSeq },
    },
  });
}
