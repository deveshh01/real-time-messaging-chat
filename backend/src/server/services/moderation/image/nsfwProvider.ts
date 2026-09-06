import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import type { ImageModerator, ImageModerationInput, ImageModerationResult } from "./provider";

/**
 * NSFW.js image moderator running in-process on the server (CPU via
 * @tensorflow/tfjs-node). Model + engine are loaded lazily and memoized.
 *
 * Decision rule: reject when (porn + hentai + 0.5*sexy) >= MODERATION_NSFW_THRESHOLD.
 * "sexy" is down-weighted because it fires on swimwear/fitness photos that are
 * generally acceptable; "porn"/"hentai" are the strong signals.
 *
 * See README for model size / latency notes.
 */

// Loaded lazily; typed loosely because these are optional deps that may be
// absent. All usage is funneled through this file, isolating the untyped edge.
type NsfwModel = {
  classify: (img: unknown) => Promise<Array<{ className: string; probability: number }>>;
};

let modelPromise: Promise<{ tf: any; model: NsfwModel }> | null = null;

async function loadEngine() {
  // webpackIgnore: these are optional, native, server-only dependencies that
  // may not be installed (that's the whole point of `optionalDependencies`).
  // Without this comment, Next's webpack build tries to statically resolve
  // the import path at BUILD time and fails the entire build/compile step if
  // the package isn't present -- instead of the intended behavior, which is:
  // the app builds and runs fine, and only an actual image-upload attempt
  // hits this code path and fails closed (see index.ts / uploadService.ts).
  // The `webpackIgnore` comment defers resolution to plain Node `require`/
  // `import` at runtime, so a missing package surfaces as a normal caught
  // error here instead of a build failure.
  const tf = await import(/* webpackIgnore: true */ "@tensorflow/tfjs-node");
  const nsfw = await import(/* webpackIgnore: true */ "nsfwjs");
  // MobileNetV2 (~ default) — small, quantized, good enough for a moderation gate.
  const model = (await (nsfw as any).load()) as NsfwModel;
  logger.info("nsfw model loaded", { backend: "tfjs-node" });
  return { tf, model };
}

export class NsfwImageModerator implements ImageModerator {
  readonly name = "nsfwjs";

  private engine() {
    if (!modelPromise) modelPromise = loadEngine();
    return modelPromise;
  }

  async moderate(input: ImageModerationInput): Promise<ImageModerationResult> {
    const { tf, model } = await this.engine();

    // Decode bytes -> tensor. Wrapped in tidy to free intermediates.
    const predictions: Array<{ className: string; probability: number }> = await (async () => {
      const image = tf.node.decodeImage(input.buffer, 3);
      try {
        return await model.classify(image);
      } finally {
        image.dispose();
      }
    })();

    const p: Record<string, number> = {};
    for (const { className, probability } of predictions) p[className] = probability;

    const score =
      (p.Porn ?? 0) + (p.Hentai ?? 0) + 0.5 * (p.Sexy ?? 0);
    const approved = score < env.MODERATION_NSFW_THRESHOLD;

    return {
      approved,
      score: Number(score.toFixed(4)),
      reason: approved
        ? "nsfwjs: below threshold"
        : `nsfwjs: explicit content score ${score.toFixed(2)} >= ${env.MODERATION_NSFW_THRESHOLD}`,
    };
  }
}
