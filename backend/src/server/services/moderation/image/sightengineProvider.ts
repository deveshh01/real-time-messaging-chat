import { env } from "@/src/lib/env";
import type { ImageModerator, ImageModerationInput, ImageModerationResult } from "./provider";

/**
 * Sightengine (https://sightengine.com) nudity-detection provider.
 *
 * Why this exists: `@tensorflow/tfjs-node` (used by the `nsfwjs` provider) is
 * a native module that frequently fails to install — mismatched Node/OS/glibc
 * versions, or a postinstall step that downloads a prebuilt binary from a CDN
 * that many corporate/restricted networks block even when the npm registry
 * itself is reachable. When that happens, moderation fails closed (see
 * ./index.ts) and NO image can be sent, which is safe but useless.
 *
 * This provider needs no native compilation at all: it's a plain HTTPS POST.
 * Sign up for a free API user/secret at https://dashboard.sightengine.com
 * (free tier covers a meaningful number of checks/month — see their pricing
 * page for current limits) and set SIGHTENGINE_API_USER / _API_SECRET plus
 * MODERATION_IMAGE_PROVIDER=sightengine in .env.
 *
 * Decision rule mirrors the nsfwjs provider for consistency: reject when
 * (sexual_activity + sexual_display + 0.5*erotica) >= MODERATION_NSFW_THRESHOLD.
 * Docs: https://sightengine.com/docs/nudity-moderation-api
 */
interface SightengineNudity {
  sexual_activity?: number;
  sexual_display?: number;
  erotica?: number;
  none?: number;
}
interface SightengineResponse {
  status?: string;
  error?: { message?: string };
  nudity?: SightengineNudity;
}

export class SightengineImageModerator implements ImageModerator {
  readonly name = "sightengine";

  async moderate(input: ImageModerationInput): Promise<ImageModerationResult> {
    if (!env.SIGHTENGINE_API_USER || !env.SIGHTENGINE_API_SECRET) {
      // Treated as a moderation FAILURE (fail-closed), not silently skipped —
      // a misconfigured provider must never result in an approved image.
      throw new Error(
        "sightengine provider selected but SIGHTENGINE_API_USER/SIGHTENGINE_API_SECRET are not set",
      );
    }

    const form = new FormData();
    form.append("media", new Blob([new Uint8Array(input.buffer)], { type: input.mime }), "upload");
    form.append("models", "nudity-2.1");
    form.append("api_user", env.SIGHTENGINE_API_USER);
    form.append("api_secret", env.SIGHTENGINE_API_SECRET);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(env.MODERATION_TIMEOUT_MS),
    });
    const data = (await res.json()) as SightengineResponse;
    if (!res.ok || data.status === "failure") {
      throw new Error(`sightengine error: ${data.error?.message ?? res.status}`);
    }

    const n = data.nudity ?? {};
    const score = (n.sexual_activity ?? 0) + (n.sexual_display ?? 0) + 0.5 * (n.erotica ?? 0);
    const approved = score < env.MODERATION_NSFW_THRESHOLD;

    return {
      approved,
      score: Number(score.toFixed(4)),
      reason: approved
        ? "sightengine: below threshold"
        : `sightengine: explicit content score ${score.toFixed(2)} >= ${env.MODERATION_NSFW_THRESHOLD}`,
    };
  }
}
