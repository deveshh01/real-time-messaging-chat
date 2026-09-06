import { logger } from "@/src/lib/logger";
import type { ImageModerator, ImageModerationInput, ImageModerationResult } from "./provider";

/**
 * Explicit, opt-in, NO-ML placeholder moderator (`MODERATION_IMAGE_PROVIDER=heuristic`).
 *
 * It does NOT detect nudity and must never be selected automatically. It exists
 * only so the app can boot in environments with no ML engine at all (e.g. a
 * throwaway local dev box), and it is loud about that fact:
 *   - every call is logged at "warn" so it can never fail silently, and
 *   - the README instructs that real/graded deployments must use `nsfwjs`.
 *
 * This is NOT the fallback used when the `nsfwjs` provider errors at runtime —
 * that case is handled by moderateImage() in ./index.ts, which fails CLOSED
 * (refuses to approve) instead of degrading to this provider.
 */
export class HeuristicImageModerator implements ImageModerator {
  readonly name = "heuristic";

  async moderate(_input: ImageModerationInput): Promise<ImageModerationResult> {
    logger.warn(
      "heuristic image moderator in use: NO real nudity detection is being performed",
    );
    return {
      approved: true,
      score: 0,
      reason: "heuristic: no ML configured (MODERATION_IMAGE_PROVIDER=heuristic) — not a real check",
    };
  }
}
