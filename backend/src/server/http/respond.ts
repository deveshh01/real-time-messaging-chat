import { z } from "zod";
import { AppError, Errors, toClientError } from "@/src/lib/errors";
import { logger } from "@/src/lib/logger";

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** Best-effort client key for IP-based rate limiting (dev-friendly fallback). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * Wrap a route handler so every thrown AppError becomes a consistent JSON error
 * with the right status, and unknown errors never leak internals.
 */
export function route<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (!(err instanceof AppError)) {
        logger.error("unhandled route error", { err: (err as Error).message });
      }
      const { status, body } = toClientError(err);
      return Response.json(body, { status });
    }
  };
}

/** Parse+validate a JSON body with a zod schema, throwing a 400 on failure. */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw Errors.validation("Invalid JSON body");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw Errors.validation("Invalid request", {
      issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  return result.data;
}
