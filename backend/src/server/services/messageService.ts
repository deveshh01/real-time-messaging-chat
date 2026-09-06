import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { Errors } from "@/src/lib/errors";
import { logger } from "@/src/lib/logger";
import type { MessageDTO, MessagePage } from "@/src/shared/types";
import { assertMembership, getConversationMembers } from "./authz";
import { profanityFilter } from "./moderation/profanity";
import {
  createMessageIdempotent,
  findByClientId,
  getMessagePage,
  type MessageWithAttachment,
} from "@/src/server/repositories/messageRepo";
import { toMessageDTO, type OtherWatermark } from "./serialize";

const MAX_BODY = 4000;
const PAGE_LIMIT = 30;
const MAX_PAGE_LIMIT = 100;

/** Hosts we accept media URLs from, so a client can't inject arbitrary URLs. */
const GIF_HOSTS = [/(^|\.)tenor\.com$/, /(^|\.)giphy\.com$/, /(^|\.)tenor\.googleapis\.com$/];

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  clientId: z.string().min(8).max(100),
  type: z.enum(["TEXT", "IMAGE", "GIF", "STICKER"]),
  body: z.string().max(MAX_BODY).optional(),
  attachmentId: z.string().min(1).optional(),
  media: z
    .object({
      url: z.string().url().max(2048),
      width: z.number().int().positive().max(4096).optional(),
      height: z.number().int().positive().max(4096).optional(),
      mime: z.string().max(100).optional(),
    })
    .optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export interface SendResult {
  message: MessageDTO;
  created: boolean;
  /** Recipient user ids to notify (excludes the sender). */
  recipientIds: string[];
}

/**
 * The one place a message is created. REST and WebSocket layers both call this,
 * so authentication context, authorization, validation, moderation, idempotency
 * and persistence are guaranteed identical regardless of transport.
 */
export async function sendMessage(
  senderId: string,
  raw: unknown,
): Promise<SendResult> {
  const input = parse(raw);

  // Authorization: caller must be a member of the target conversation.
  await assertMembership(senderId, input.conversationId);

  // Fast idempotency path: if this exact (conversation, sender, clientId) was
  // already accepted, return it WITHOUT re-moderating or creating a new
  // attachment. Prevents orphan media rows and duplicate work on retries.
  const prior = await findByClientId(input.conversationId, senderId, input.clientId);
  if (prior) {
    const { others } = await getConversationMembers(senderId, input.conversationId);
    return {
      message: toMessageDTO(prior, senderId, {
        readSeq: others.reduce((max, m) => (m.lastReadSeq > max ? m.lastReadSeq : max), 0n),
        deliveredSeq: others.reduce((max, m) => (m.lastDeliveredSeq > max ? m.lastDeliveredSeq : max), 0n),
      }),
      created: false,
      recipientIds: others.map((m) => m.userId),
    };
  }

  let attachmentId: string | null = null;
  let body: string | null = null;

  if (input.type === "TEXT") {
    const text = (input.body ?? "").trim();
    if (!text) throw Errors.validation("Message body is required");
    // Server-side profanity gate — never delivered if blocked.
    const verdict = profanityFilter.check(text);
    if (verdict.blocked) {
      logger.info("message rejected: profanity", {
        senderId,
        conversationId: input.conversationId,
        match: verdict.match,
      });
      throw Errors.profanity();
    }
    body = text;
  } else if (input.type === "IMAGE") {
    if (!input.attachmentId) throw Errors.validation("attachmentId required for IMAGE");
    attachmentId = await resolveApprovedOwnedImage(senderId, input.attachmentId);
    body = await moderateOptionalCaption(input.body, senderId, input.conversationId);
  } else {
    // GIF / STICKER — external curated media, validated by host.
    if (!input.media?.url) throw Errors.validation("media.url required");
    attachmentId = await createExternalMedia(senderId, input.type, input.media);
    body = await moderateOptionalCaption(input.body, senderId, input.conversationId);
  }

  const { message, created } = await createMessageIdempotent({
    conversationId: input.conversationId,
    senderId,
    clientId: input.clientId,
    type: input.type,
    body,
    attachmentId,
  });

  const { others } = await getConversationMembers(senderId, input.conversationId);
  const watermark: OtherWatermark = {
    readSeq: others.reduce((max, m) => (m.lastReadSeq > max ? m.lastReadSeq : max), 0n),
    deliveredSeq: others.reduce((max, m) => (m.lastDeliveredSeq > max ? m.lastDeliveredSeq : max), 0n),
  };

  if (created) {
    logger.info("message accepted", {
      messageId: message.id,
      conversationId: input.conversationId,
      type: input.type,
    });
  }

  return {
    message: toMessageDTO(message, senderId, watermark),
    created,
    recipientIds: others.map((m) => m.userId),
  };
}

/** Cursor-paginated history, authorized and serialized for the viewer. */
export async function listMessages(
  userId: string,
  conversationId: string,
  cursor: number | null,
  limit = PAGE_LIMIT,
): Promise<MessagePage> {
  await assertMembership(userId, conversationId);
  const { others } = await getConversationMembers(userId, conversationId);

  const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);
  const { messages, nextCursor } = await getMessagePage(
    conversationId,
    cursor !== null ? BigInt(cursor) : null,
    safeLimit,
  );

  const watermark: OtherWatermark = {
    readSeq: others.reduce((max, m) => (m.lastReadSeq > max ? m.lastReadSeq : max), 0n),
    deliveredSeq: others.reduce((max, m) => (m.lastDeliveredSeq > max ? m.lastDeliveredSeq : max), 0n),
  };

  return {
    messages: messages.map((m) => serializeForViewer(m, userId, watermark)),
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parse(raw: unknown): SendMessageInput {
  const result = sendMessageSchema.safeParse(raw);
  if (!result.success) {
    throw Errors.validation("Invalid message payload", {
      issues: result.error.issues.map((i) => i.path.join(".")),
    });
  }
  return result.data;
}

function serializeForViewer(
  m: MessageWithAttachment,
  viewerId: string,
  watermark: OtherWatermark,
): MessageDTO {
  return toMessageDTO(m, viewerId, watermark);
}

async function moderateOptionalCaption(
  caption: string | undefined,
  senderId: string,
  conversationId: string,
): Promise<string | null> {
  const text = (caption ?? "").trim();
  if (!text) return null;
  if (text.length > MAX_BODY) throw Errors.validation("Caption too long");
  const verdict = profanityFilter.check(text);
  if (verdict.blocked) {
    logger.info("caption rejected: profanity", { senderId, conversationId, match: verdict.match });
    throw Errors.profanity();
  }
  return text;
}

/**
 * Verify the attachment is (a) owned by the sender, (b) an image, (c) APPROVED
 * by moderation, and (d) not already attached to another message. Any failure
 * means the image must not be delivered.
 */
async function resolveApprovedOwnedImage(senderId: string, attachmentId: string): Promise<string> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { message: { select: { id: true } } },
  });
  if (!attachment || attachment.ownerId !== senderId || attachment.kind !== "IMAGE") {
    throw Errors.forbidden();
  }
  if (attachment.moderationStatus !== "APPROVED") {
    throw Errors.imageModeration();
  }
  if (attachment.message) {
    throw Errors.conflict("Attachment already used");
  }
  return attachment.id;
}

async function createExternalMedia(
  senderId: string,
  type: "GIF" | "STICKER",
  media: NonNullable<SendMessageInput["media"]>,
): Promise<string> {
  const url = new URL(media.url);
  if (type === "GIF") {
    const host = url.hostname.toLowerCase();
    if (!GIF_HOSTS.some((re) => re.test(host))) {
      throw Errors.validation("GIF url host not allowed");
    }
  } else {
    // Stickers are bundled and served from our own origin under /stickers/.
    if (!url.pathname.startsWith("/stickers/")) {
      throw Errors.validation("Invalid sticker url");
    }
  }
  try {
    const attachment = await prisma.attachment.create({
      data: {
        kind: type,
        ownerId: senderId,
        mime: media.mime ?? (type === "GIF" ? "image/gif" : "image/webp"),
        width: media.width ?? null,
        height: media.height ?? null,
        url: media.url,
        moderationStatus: "APPROVED", // curated external/bundled source
      },
    });
    return attachment.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) throw Errors.internal();
    throw err;
  }
}
