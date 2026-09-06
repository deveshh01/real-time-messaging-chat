import { prisma } from "@/src/server/db/prisma";
import { Errors } from "@/src/lib/errors";
import type { ConversationMember } from "@prisma/client";

/**
 * The single source of truth for "may this user act in this conversation".
 * Every REST route and socket handler that touches a conversation calls this,
 * so membership is checked server-side in exactly one place (prevents IDOR).
 */
export async function assertMembership(
  userId: string,
  conversationId: string,
): Promise<ConversationMember> {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw Errors.forbidden();
  return member;
}

/** Fetch both members of a 1:1 conversation; throws if the caller isn't one. */
export async function getDirectMembers(userId: string, conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
  });
  const me = members.find((m) => m.userId === userId);
  if (!me) throw Errors.forbidden();
  const other = members.find((m) => m.userId !== userId) ?? null;
  return { me, other, members };
}

/** Fetch all members of a conversation; throws if caller isn't a member. */
export async function getConversationMembers(userId: string, conversationId: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
  });
  const me = members.find((m) => m.userId === userId);
  if (!me) throw Errors.forbidden();
  const others = members.filter((m) => m.userId !== userId);
  const other = others[0] ?? null;
  return { me, other, others, members };
}

/**
 * Asserts that the caller is a member AND an ADMIN of a group conversation.
 * Throws forbidden error if not.
 */
export async function assertGroupAdmin(
  userId: string,
  conversationId: string,
): Promise<ConversationMember> {
  const member = await assertMembership(userId, conversationId);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroup: true },
  });
  if (!conv || !conv.isGroup) {
    throw Errors.validation("Operation only applicable to group conversations");
  }
  if (member.role !== "admin") {
    throw Errors.forbidden();
  }
  return member;
}

