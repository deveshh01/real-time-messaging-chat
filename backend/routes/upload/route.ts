import { route, json } from "@/src/server/http/respond";
import { env } from "@/src/lib/env";
import { Errors } from "@/src/lib/errors";
import { limiters } from "@/src/lib/rateLimiter";
import { requireAuthUser } from "@/src/server/auth/context";
import { uploadImage } from "@/src/server/services/uploadService";

export const runtime = "nodejs";

/**
 * Authenticated, rate-limited image upload. Runs the full server-side pipeline
 * (type sniff -> moderation -> private storage) and returns an attachmentId that
 * is the ONLY way to attach the image to a message. Unsafe images get a 422 and
 * are never stored/delivered.
 */
export const POST = route(async (req: Request) => {
  const me = await requireAuthUser(req);

  const rl = limiters.upload.consume(me.id);
  if (!rl.allowed) throw Errors.rateLimited(rl.retryAfterMs);

  // Cheap early rejection using the declared length before buffering the body.
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen && declaredLen > env.MAX_UPLOAD_BYTES * 1.1) {
    throw Errors.uploadInvalid("File too large");
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw Errors.uploadInvalid("Missing 'file' field");
  if (file.size > env.MAX_UPLOAD_BYTES) throw Errors.uploadInvalid("File too large");

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadImage(me.id, buffer, file.type || undefined);
  return json(result, { status: 201 });
});
