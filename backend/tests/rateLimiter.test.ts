import { describe, it, expect } from "vitest";
import { RateLimiter } from "@/src/lib/rateLimiter";

describe("RateLimiter (fixed window)", () => {
  it("allows up to max within the window then blocks", () => {
    const rl = new RateLimiter(3, 1000);
    const t = 0;
    expect(rl.consume("u", t).allowed).toBe(true);
    expect(rl.consume("u", t).allowed).toBe(true);
    expect(rl.consume("u", t).allowed).toBe(true);
    const blocked = rl.consume("u", t);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.consume("u", 0).allowed).toBe(true);
    expect(rl.consume("u", 500).allowed).toBe(false);
    expect(rl.consume("u", 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.consume("a", 0).allowed).toBe(true);
    expect(rl.consume("b", 0).allowed).toBe(true);
    expect(rl.consume("a", 0).allowed).toBe(false);
  });
});
