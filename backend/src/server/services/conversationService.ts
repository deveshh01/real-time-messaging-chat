import { prisma } from "@/src/server/db/prisma";
import { Errors } from "@/src/lib/errors";
import type { ConversationSummaryDTO, GroupMemberDTO, PublicUser } from "@/src/shared/types";
import { toPublicUser } from "./serialize";
import { unreadCount } from "./readService";
import { assertGroupAdmin, assertMembership } from "./authz";

/**
 * Conversations for the sidebar, newest-activity first. Membership itself is the
 * authorization boundary (we only ever read conversations the user belongs to).
 */
export async function listConversations(userId: string): Promise<ConversationSummaryDTO[]> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarColor: true,
                  image: true,
                  lastSeenAt: true,
                },
              },
            },
          },
          // Only the latest message for the preview line (indexed, take: 1).
          messages: {
            orderBy: { seq: "desc" },
            take: 1,
            select: {
              id: true,
              type: true,
              body: true,
              senderId: true,
              createdAt: true,
            },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });

  return Promise.all(
    memberships.map(async (m) => {
      const conv = m.conversation;
      const otherMember = conv.isGroup ? null : conv.members.find((x) => x.userId !== userId);
      const last = conv.messages[0] ?? null;
      const unread = await unreadCount(userId, conv.id, m.lastReadSeq);

      let senderName: string | null = null;
      if (last) {
        const senderMem = conv.members.find((x) => x.userId === last.senderId);
        senderName = senderMem?.user.displayName ?? null;
      }

      const formattedMembers: GroupMemberDTO[] = conv.members.map((mem) => ({
        user: toPublicUser(mem.user),
        role: mem.role === "admin" ? "admin" : "member",
        joinedAt: mem.joinedAt.toISOString(),
      }));

      return {
        id: conv.id,
        isGroup: conv.isGroup,
        title: conv.title,
        otherUser: otherMember ? toPublicUser(otherMember.user) : null,
        members: conv.isGroup ? formattedMembers : undefined,
        memberCount: conv.members.length,
        lastMessage: last
          ? {
              id: last.id,
              type: last.type,
              body: last.body,
              senderId: last.senderId,
              senderName,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unreadCount: unread,
        updatedAt: conv.updatedAt.toISOString(),
      } satisfies ConversationSummaryDTO;
    }),
  );
}

/** Idempotently get (or create) the 1:1 conversation between two users. */
export async function getOrCreateDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<string> {
  if (userId === otherUserId) throw Errors.validation("Cannot start a conversation with yourself");

  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true } });
  if (!other) throw Errors.notFound("User not found");

  const mine = await prisma.conversation.findMany({
    where: { isGroup: false, members: { some: { userId } } },
    include: { members: { select: { userId: true } } },
  });
  const existing = mine.find(
    (c) => c.members.length === 2 && c.members.some((mm) => mm.userId === otherUserId),
  );
  if (existing) return existing.id;

  const created = await prisma.conversation.create({
    data: {
      isGroup: false,
      members: { create: [{ userId, role: "member" }, { userId: otherUserId, role: "member" }] },
    },
    select: { id: true },
  });
  return created.id;
}

/** Create a group conversation with title and selected member userIds. Creator is admin. */
export async function createGroupConversation(
  creatorId: string,
  title: string,
  userIds: string[],
): Promise<string> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw Errors.validation("Group title is required");
  if (cleanTitle.length > 100) throw Errors.validation("Group title too long");

  // Remove duplicates and creator if present in list
  const uniqueMemberIds = Array.from(new Set(userIds.filter((id) => id !== creatorId)));
  if (uniqueMemberIds.length < 1) {
    throw Errors.validation("A group must have at least 2 members (including you)");
  }

  // Verify all target users exist
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: uniqueMemberIds } },
    select: { id: true },
  });
  if (existingUsers.length !== uniqueMemberIds.length) {
    throw Errors.notFound("One or more selected users do not exist");
  }

  const memberData = [
    { userId: creatorId, role: "admin" },
    ...uniqueMemberIds.map((id) => ({ userId: id, role: "member" })),
  ];

  const group = await prisma.conversation.create({
    data: {
      isGroup: true,
      title: cleanTitle,
      members: { create: memberData },
    },
    select: { id: true },
  });

  return group.id;
}

/** Get full details of a conversation for a member. */
export async function getConversationDetails(
  userId: string,
  conversationId: string,
): Promise<ConversationSummaryDTO> {
  await assertMembership(userId, conversationId);
  const conversations = await listConversations(userId);
  const conv = conversations.find((c) => c.id === conversationId);
  if (!conv) throw Errors.notFound("Conversation not found");
  return conv;
}

/** Add members to a group conversation (Admin only). */
export async function addGroupMembers(
  adminId: string,
  conversationId: string,
  userIds: string[],
): Promise<{ addedUserIds: string[] }> {
  await assertGroupAdmin(adminId, conversationId);

  const cleanIds = Array.from(new Set(userIds.filter(Boolean)));
  if (cleanIds.length === 0) throw Errors.validation("No users specified to add");

  // Filter out users already in conversation
  const existingMembers = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { in: cleanIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existingMembers.map((m) => m.userId));
  const toAdd = cleanIds.filter((id) => !existingSet.has(id));

  if (toAdd.length === 0) {
    return { addedUserIds: [] };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: toAdd } },
    select: { id: true },
  });
  if (users.length !== toAdd.length) {
    throw Errors.notFound("One or more users do not exist");
  }

  await prisma.$transaction([
    prisma.conversationMember.createMany({
      data: toAdd.map((id) => ({ conversationId, userId: id, role: "member" })),
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return { addedUserIds: toAdd };
}

/** Remove a member from a group conversation (Admin only). */
export async function removeGroupMember(
  adminId: string,
  conversationId: string,
  targetUserId: string,
): Promise<{ removedUserId: string }> {
  await assertGroupAdmin(adminId, conversationId);

  const targetMember = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
  if (!targetMember) throw Errors.notFound("User is not a member of this group");

  await prisma.$transaction([
    prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return { removedUserId: targetUserId };
}

/** User leaves a group conversation. Auto-transfers admin role if admin leaves. */
export async function leaveGroup(
  userId: string,
  conversationId: string,
): Promise<{ leftUserId: string; newAdminId?: string }> {
  const member = await assertMembership(userId, conversationId);

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isGroup: true },
  });
  if (!conv || !conv.isGroup) {
    throw Errors.validation("Only group conversations can be left");
  }

  let newAdminId: string | undefined;

  await prisma.$transaction(async (tx) => {
    await tx.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (member.role === "admin") {
      const remainingMembers = await tx.conversationMember.findMany({
        where: { conversationId },
        orderBy: { joinedAt: "asc" },
      });

      if (remainingMembers.length > 0) {
        const existingAdmin = remainingMembers.find((m) => m.role === "admin");
        if (!existingAdmin) {
          const oldest = remainingMembers[0]!;
          await tx.conversationMember.update({
            where: { id: oldest.id },
            data: { role: "admin" },
          });
          newAdminId = oldest.userId;
        }
      }
    }

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  });

  return { leftUserId: userId, newAdminId };
}

/** Update group title (Admin only). */
export async function updateGroupTitle(
  adminId: string,
  conversationId: string,
  title: string,
): Promise<{ title: string }> {
  await assertGroupAdmin(adminId, conversationId);

  const cleanTitle = title.trim();
  if (!cleanTitle) throw Errors.validation("Group title cannot be empty");
  if (cleanTitle.length > 100) throw Errors.validation("Group title too long");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { title: cleanTitle, updatedAt: new Date() },
  });

  return { title: cleanTitle };
}

/**
 * Distinct user ids that share at least one conversation with `userId`.
 * Used to scope presence broadcasts to relevant contacts only (not everyone).
 */
export async function getContactUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.conversationMember.findMany({
    where: {
      userId: { not: userId },
      conversation: { members: { some: { userId } } },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}

/** Directory search to start new conversations (never returns the caller). */
export async function searchUsers(query: string, excludeUserId: string): Promise<PublicUser[]> {
  const q = query.trim();
  const users = await prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      ...(q
        ? {
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { displayName: "asc" },
    take: 20,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarColor: true,
      image: true,
      lastSeenAt: true,
    },
  });
  return users.map(toPublicUser);
}

