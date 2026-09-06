import { env } from "./env";

/**
 * Fixed-window in-memory rate limiter.
 *
 * Adequate for a single-instance modular monolith and easy to reason about.
 * For a multi-instance deployment, swap this implementation for a Redis-backed
 * counter (INCR + EXPIRE) behind the same `consume()` interface — call sites
 * do not change. See README "Rate limiting".
 */
interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, retryAfterMs: 0 };
    }
    if (bucket.count >= this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
    }
    bucket.count += 1;
    return { allowed: true, remaining: this.max - bucket.count, retryAfterMs: 0 };
  }

  /** Periodically drop expired buckets to bound memory. */
  sweep(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/** Named limiters used across REST + socket layers. Limits come from env. */
export const limiters = {
  message: new RateLimiter(env.RL_MESSAGE_MAX, env.RL_MESSAGE_WINDOW_MS),
  upload: new RateLimiter(env.RL_UPLOAD_MAX, env.RL_UPLOAD_WINDOW_MS),
  gif: new RateLimiter(env.RL_GIF_MAX, env.RL_GIF_WINDOW_MS),
  auth: new RateLimiter(env.RL_AUTH_MAX, env.RL_AUTH_WINDOW_MS),
};

// Bound memory growth for long-running processes.
const sweepTimer = setInterval(() => {
  for (const l of Object.values(limiters)) l.sweep();
}, 60_000);
// Do not keep the event loop alive solely for the sweeper.
sweepTimer.unref?.();
