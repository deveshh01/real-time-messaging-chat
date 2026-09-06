/**
 * Image moderation provider contract. The messaging/upload code depends only
 * on this interface, so the concrete model/service can be swapped freely.
 */
export interface ImageModerationInput {
  buffer: Buffer;
  mime: string;
}

export interface ImageModerationResult {
  /** true => safe to deliver. Always false when `failed` is true. */
  approved: boolean;
  /** 0..1 combined "explicitness" score used for the decision. Null when the check couldn't run. */
  score: number | null;
  /** Short, non-sensitive reason for logs / sender feedback. */
  reason: string;
  /**
   * True when the moderation check itself could not complete (model/engine
   * failure, timeout, unexpected error) — as opposed to completing and
   * finding the image explicit. Callers MUST treat this as "not safe to
   * deliver", distinct from an ordinary rejection: fail CLOSED, never open.
   */
  failed?: boolean;
}

export interface ImageModerator {
  readonly name: string;
  moderate(input: ImageModerationInput): Promise<ImageModerationResult>;
}
