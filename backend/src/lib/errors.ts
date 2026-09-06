/**
 * Typed application errors. Handlers translate these into consistent HTTP /
 * socket error payloads WITHOUT leaking internals to the client.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "MODERATION_PROFANITY"
  | "MODERATION_IMAGE"
  | "MODERATION_UNAVAILABLE"
  | "UPLOAD_INVALID"
  | "CONFLICT"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  MODERATION_PROFANITY: 422,
  MODERATION_IMAGE: 422,
  // 503: distinct from a confirmed rejection — the check itself could not run.
  MODERATION_UNAVAILABLE: 503,
  UPLOAD_INVALID: 400,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe, structured detail intended for the client (never internals). */
  readonly detail?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail;
  }
}

export const Errors = {
  unauthenticated: (m = "Authentication required") => new AppError("UNAUTHENTICATED", m),
  forbidden: (m = "You do not have access to this resource") =>
    new AppError("FORBIDDEN", m),
  notFound: (m = "Not found") => new AppError("NOT_FOUND", m),
  validation: (m = "Invalid request", detail?: Record<string, unknown>) =>
    new AppError("VALIDATION", m, detail),
  rateLimited: (retryAfterMs: number) =>
    new AppError("RATE_LIMITED", "Too many requests, slow down", { retryAfterMs }),
  profanity: () =>
    new AppError("MODERATION_PROFANITY", "Message blocked by content moderation"),
  imageModeration: () =>
    new AppError("MODERATION_IMAGE", "Image could not be sent because it failed moderation"),
  moderationUnavailable: () =>
    new AppError(
      "MODERATION_UNAVAILABLE",
      "Image moderation is temporarily unavailable, so this image could not be checked and was not sent. Please try again shortly.",
    ),
  uploadInvalid: (m: string) => new AppError("UPLOAD_INVALID", m),
  conflict: (m = "Conflict") => new AppError("CONFLICT", m),
  internal: (m = "Something went wrong") => new AppError("INTERNAL", m),
};

/** Shape returned to clients for any error. */
export interface ClientErrorBody {
  error: { code: ErrorCode; message: string; detail?: Record<string, unknown> };
}

export function toClientError(err: unknown): { status: number; body: ClientErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, detail: err.detail } },
    };
  }
  // Unknown error: never leak the raw message.
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong" } },
  };
}
