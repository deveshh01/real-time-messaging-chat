import { route } from "@/src/server/http/respond";
import { Errors } from "@/src/lib/errors";
import { prisma } from "@/src/server/db/prisma";
import { requireAuthUser } from "@/src/server/auth/context";
import { assertMembership } from "@/src/server/services/authz";
import { storage } from "@/src/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authorized media delivery. An image is served ONLY when:
 *   - it is APPROVED by moderation, AND
 *   - the requester is a member of the conversation it belongs to
 *     (or its owner, for a pre-send preview).
 * This is what prevents URL-guessing / IDOR access to private or unmoderated media.
 */
export const GET = route(async (req: Request, { params }: { params: { id: string } }) => {
  const me = await requireAuthUser(req);

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
    include: { message: { select: { conversationId: true } } },
  });

  // Never confirm existence of unmoderated / missing media.
  if (!attachment || attachment.moderationStatus !== "APPROVED") {
    throw Errors.notFound("Attachment not found");
  }

  if (attachment.message) {
    await assertMembership(me.id, attachment.message.conversationId);
  } else if (attachment.ownerId !== me.id) {
    // Unattached attachment: only the uploader may preview it.
    throw Errors.forbidden();
  }

  // GIF / STICKER are external/bundled URLs — redirect rather than proxy.
  if (attachment.kind !== "IMAGE" && attachment.url) {
    return new Response(null, { status: 302, headers: { Location: attachment.url } });
  }
  if (!attachment.storageKey) throw Errors.notFound("Attachment not found");

  const bytes = await storage().get(attachment.storageKey);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(bytes.byteLength),
      // Private + immutable: safe to cache in the browser, never shared caches.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
});
