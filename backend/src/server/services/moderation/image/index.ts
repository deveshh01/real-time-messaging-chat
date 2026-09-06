import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import type { ImageModerator, ImageModerationResult } from "./provider";
import { HeuristicImageModerator } from "./heuristicProvider";
import { NsfwImageModerator } from "./nsfwProvider";
import { SightengineImageModerator } from "./sightengineProvider";

/**
 * Resolves the configured image moderator.
 *
 * IMPORTANT (fail-CLOSED, not fail-open): `MODERATION_IMAGE_PROVIDER=heuristic`
 * is an explicit, opt-in developer/CI setting for when no ML engine is
 * available at all -- it is documented in the README as NOT providing real
 * nudity detection. It is never selected automatically. If the configured
 * `nsfwjs` engine fails to load or throws at runtime, we do NOT silently swap
 * to a provider that rubber-stamps every image as safe: moderateImage() below
 * treats that as a FAILED check and refuses to approve the image.
 *
 * `nsfwjs` (in-process, needs native @tensorflow/tfjs-node) and `sightengine`
 * (hosted HTTPS API, no native deps at all) are the two REAL detection
 * options -- pick whichever installs/works in your environment. See README
 * "Image moderation" for when to use which.
 */
let cached: ImageModerator | null = null;

export function getImageModerator(): ImageModerator {
  if (cached) return cached;
  cached =
    env.MODERATION_IMAGE_PROVIDER === "heuristic"
      ? new HeuristicImageModerator()
      : env.MODERATION_IMAGE_PROVIDER === "sightengine"
        ? new SightengineImageModerator()
        : new NsfwImageModerator();
  return cached;
}

/** Test-only seam: inject a fake moderator instead of the real nsfwjs/heuristic one. */
export function __setModeratorForTest(moderator: ImageModerator | null): void {
  cached = moderator;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`moderation timed out after ${ms}ms`)), ms);
  });
}

/**
 * Moderate an image. Never approves an image the check didn't actually
 * clear: any engine failure or timeout comes back as `{ approved: false,
 * failed: true }` so the caller can reject the upload with a clear
 * "moderation unavailable" message instead of delivering unmoderated content.
 */
export async function moderateImage(buffer: Buffer, mime: string): Promise<ImageModerationResult> {
  const moderator = getImageModerator();
  try {
    return await Promise.race([
      moderator.moderate({ buffer, mime }),
      timeout(env.MODERATION_TIMEOUT_MS),
    ]);
  } catch (err) {
    logger.error("image moderation failed; refusing to approve", {
      provider: moderator.name,
      err: (err as Error).message,
    });
    return {
      approved: false,
      score: null,
      reason: `moderation_failed(${moderator.name}): ${(err as Error).message}`,
      failed: true,
    };
  }
}

export type { ImageModerator, ImageModerationResult } from "./provider";
