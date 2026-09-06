import { Prisma, type Attachment, type Message, type MessageType, type User } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";

export type MessageWithAttachment = Message & {
  attachment: Attachment | null;
  sender?: Pick<User, "id" | "username" | "displayName" | "avatarColor" | "lastSeenAt" | "image"> | null;
};

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  clientId: string;
  type: MessageType;
  body: string | null;
  attachmentId: string | null;
}

export interface CreateMessageResult {
  message: MessageWithAttachment;
  /** false when an identical (conversation, sender, clientId) already existed. */
  created: boolean;
}

const senderSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarColor: true,
  image: true,
  lastSeenAt: true,
} as const;

/**
 * Idempotent insert. The DB unique constraint (conversationId, senderId,
 * clientId) is the real guard: two concurrent retries race into create(); the
 * loser catches P2002 and reads the winning row. No duplicate is ever stored.
 */
export async function createMessageIdempotent(
  input: CreateMessageInput,
): Promise<CreateMessageResult> {
  const existing = await findByClientId(input.conversationId, input.senderId, input.clientId);
  if (existing) return { message: existing, created: false };

  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          clientId: input.clientId,
          type: input.type,
          body: input.body,
          attachmentId: input.attachmentId,
        },
        include: { attachment: true, sender: { select: senderSelect } },
      });
      // Bump conversation ordering key for cheap sidebar sorting.
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      });
      return created;
    });
    return { message, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await findByClientId(input.conversationId, input.senderId, input.clientId);
      if (row) return { message: row, created: false };
    }
    throw err;
  }
}

export function findByClientId(
  conversationId: string,
  senderId: string,
  clientId: string,
): Promise<MessageWithAttachment | null> {
  return prisma.message.findUnique({
    where: {
      conversationId_senderId_clientId: { conversationId, senderId, clientId },
    },
    include: { attachment: true, sender: { select: senderSelect } },
  });
}

/**
 * Cursor pagination, newest-first. `beforeSeq` fetches strictly-older messages.
 * Uses the (conversationId, seq) index; never OFFSET, so deep history is O(limit).
 * Returns messages ascending (oldest→newest) for direct rendering.
 */
export async function getMessagePage(
  conversationId: string,
  beforeSeq: bigint | null,
  limit: number,
): Promise<{ messages: MessageWithAttachment[]; nextCursor: number | null }> {
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(beforeSeq !== null ? { seq: { lt: beforeSeq } } : {}),
    },
    include: { attachment: true, sender: { select: senderSelect } },
    orderBy: { seq: "desc" },
    take: limit + 1, // fetch one extra to know if an older page exists
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? Number(page[page.length - 1]!.seq) : null;

  // Reverse to ascending for the UI (oldest at top).
  page.reverse();
  return { messages: page, nextCursor };
}

/** Messages strictly newer than a seq — used to replay missed events on reconnect. */
export function getMessagesAfter(
  conversationId: string,
  afterSeq: bigint,
  limit = 200,
): Promise<MessageWithAttachment[]> {
  return prisma.message.findMany({
    where: { conversationId, deletedAt: null, seq: { gt: afterSeq } },
    include: { attachment: true, sender: { select: senderSelect } },
    orderBy: { seq: "asc" },
    take: limit,
  });
}
