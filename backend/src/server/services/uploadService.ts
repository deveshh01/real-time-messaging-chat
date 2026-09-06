import { prisma } from "@/src/server/db/prisma";
import { env } from "@/src/lib/env";
import { Errors } from "@/src/lib/errors";
import { logger } from "@/src/lib/logger";
import { storage, buildObjectKey } from "@/src/server/storage";
import { moderateImage } from "./moderation/image";

export interface UploadResult {
  attachmentId: string;
  mime: string;
  moderationStatus: "APPROVED";
}

/**
 * Full server-side image intake pipeline:
 *   validate size -> sniff REAL content type (magic bytes) -> moderate ->
 *   store privately -> persist APPROVED attachment.
 *
 * Moderation is SYNCHRONOUS here: the upload response is only successful for a
 * safe image, and the returned attachmentId is the only way to attach an image
 * to a message. A client therefore cannot deliver an unmoderated image by
 * calling the message API directly (see README "Image moderation").
 */
export async function uploadImage(
  ownerId: string,
  buffer: Buffer,
  declaredMime: string | undefined,
): Promise<UploadResult> {
  // 1. Size (defense in depth; the route also caps the body).
  if (buffer.byteLength === 0) throw Errors.uploadInvalid("Empty file");
  if (buffer.byteLength > env.MAX_UPLOAD_BYTES) {
    throw Errors.uploadInvalid(
      `File exceeds ${(env.MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1)} MB limit`,
    );
  }

  // 2. Trust the bytes, not the client. Sniff the real type from magic numbers.
  const { fileTypeFromBuffer } = await import("file-type");
  const sniffed = await fileTypeFromBuffer(buffer);
  const realMime = sniffed?.mime;
  if (!realMime || !env.ALLOWED_IMAGE_MIME.includes(realMime)) {
    throw Errors.uploadInvalid(
      `Unsupported image type${realMime ? ` (${realMime})` : ""}. Allowed: ${env.ALLOWED_IMAGE_MIME.join(", ")}`,
    );
  }
  // Reject a mismatch between claimed and actual type (e.g. .png that is really
  // something else) — a common upload trick.
  if (declaredMime && declaredMime !== realMime) {
    logger.warn("upload mime mismatch", { declaredMime, realMime, ownerId });
  }

  // 3. Content moderation BEFORE the image is retrievable by anyone.
  const started = Date.now();
  const verdict = await moderateImage(buffer, realMime);
  const ms = Date.now() - started;
  if (verdict.failed) {
    // The check itself could not complete (model/engine down, timeout,
    // unexpected error). This is NOT treated as safe: fail closed. Record it
    // for audit/ops visibility, but never store the bytes and never approve.
    logger.error("image moderation unavailable", { ownerId, reason: verdict.reason, ms });
    await prisma.attachment.create({
      data: {
        kind: "IMAGE",
        ownerId,
        mime: realMime,
        size: buffer.byteLength,
        moderationStatus: "FAILED",
        moderationScore: null,
        moderationReason: verdict.reason,
      },
    });
    throw Errors.moderationUnavailable();
  }
  logger.info("image moderated", {
    ownerId,
    approved: verdict.approved,
    score: verdict.score,
    ms,
  });
  if (!verdict.approved) {
    // Record the rejection for audit; do NOT store the bytes.
    await prisma.attachment.create({
      data: {
        kind: "IMAGE",
        ownerId,
        mime: realMime,
        size: buffer.byteLength,
        moderationStatus: "REJECTED",
        moderationScore: verdict.score,
        moderationReason: verdict.reason,
      },
    });
    throw Errors.imageModeration();
  }

  // 4. Store privately under a server-generated key (never the client filename).
  const key = buildObjectKey(ownerId, sniffed.ext);
  await storage().put({ key, body: buffer, contentType: realMime });

  // 5. Persist APPROVED attachment; the id is the capability to send this image.
  const attachment = await prisma.attachment.create({
    data: {
      kind: "IMAGE",
      ownerId,
      mime: realMime,
      size: buffer.byteLength,
      storageKey: key,
      moderationStatus: "APPROVED",
      moderationScore: verdict.score,
      moderationReason: verdict.reason,
    },
  });

  return { attachmentId: attachment.id, mime: realMime, moderationStatus: "APPROVED" };
}
