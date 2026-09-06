import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Point 3 regression test: a moderation engine failure (model can't load,
 * throws mid-inference, or hangs) must NEVER result in an approved image.
 *
 * In a real deployment this is exactly what happens when the optional
 * `@tensorflow/tfjs-node` / `nsfwjs` native deps fail to install (a very
 * common occurrence in CI/containers/restricted networks) — which is the bug
 * this fixes: the app used to silently fall back to a provider that approved
 * every image. It must now fail CLOSED instead.
 */
describe("moderateImage (fail-closed on engine failure)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns failed:true / approved:false when the configured provider throws", async () => {
    const { moderateImage, __setModeratorForTest } = await import(
      "@/src/server/services/moderation/image/index"
    );
    __setModeratorForTest({
      name: "nsfwjs",
      moderate: async () => {
        throw new Error("simulated: native engine unavailable");
      },
    });

    const result = await moderateImage(Buffer.from("fake"), "image/png");
    expect(result.approved).toBe(false);
    expect(result.failed).toBe(true);
  });

  it("returns failed:true / approved:false when the provider does not resolve within the timeout", async () => {
    vi.stubEnv("MODERATION_TIMEOUT_MS", "50");
    const { moderateImage, __setModeratorForTest } = await import(
      "@/src/server/services/moderation/image/index"
    );
    __setModeratorForTest({
      name: "nsfwjs",
      moderate: () => new Promise(() => {}), // never resolves
    });

    const result = await moderateImage(Buffer.from("fake"), "image/png");
    expect(result.approved).toBe(false);
    expect(result.failed).toBe(true);
    vi.unstubAllEnvs();
  });

  it("still approves/rejects normally when the provider succeeds", async () => {
    const { moderateImage, __setModeratorForTest } = await import(
      "@/src/server/services/moderation/image/index"
    );
    __setModeratorForTest({
      name: "nsfwjs",
      moderate: async () => ({ approved: true, score: 0.1, reason: "ok" }),
    });

    const result = await moderateImage(Buffer.from("fake"), "image/png");
    expect(result).toEqual({ approved: true, score: 0.1, reason: "ok" });
  });
});
