import { z } from "zod";

/**
 * Central, validated configuration. Importing `env` guarantees required
 * variables exist and are well-typed; the process fails fast otherwise.
 */
const csv = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_BASE_URL: z.string().optional().default(""),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8_388_608),
  ALLOWED_IMAGE_MIME: z
    .string()
    .default("image/jpeg,image/png,image/webp,image/gif")
    .transform(csv),

  MODERATION_IMAGE_PROVIDER: z.enum(["nsfwjs", "sightengine", "heuristic"]).default("nsfwjs"),
  MODERATION_NSFW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  // Model load + inference must finish within this window or the upload is
  // treated as a moderation FAILURE (fail-closed) rather than hanging forever.
  MODERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Only required when MODERATION_IMAGE_PROVIDER=sightengine. Sign up free at
  // https://dashboard.sightengine.com — no native deps, plain HTTPS call.
  SIGHTENGINE_API_USER: z.string().optional().default(""),
  SIGHTENGINE_API_SECRET: z.string().optional().default(""),

  GIF_PROVIDER: z.enum(["tenor", "giphy"]).default("tenor"),
  GIF_API_KEY: z.string().optional().default(""),

  // Google OAuth (optional). When both are set, "Continue with Google" is enabled.
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),

  RL_MESSAGE_MAX: z.coerce.number().int().positive().default(30),
  RL_MESSAGE_WINDOW_MS: z.coerce.number().int().positive().default(10_000),
  RL_UPLOAD_MAX: z.coerce.number().int().positive().default(10),
  RL_UPLOAD_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RL_GIF_MAX: z.coerce.number().int().positive().default(40),
  RL_GIF_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RL_AUTH_MAX: z.coerce.number().int().positive().default(10),
  RL_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message rather than crashing deep in a handler.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === "production";

/** True only when Google OAuth is fully configured. */
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Redirect URI Google calls back to (must be whitelisted in the Google console). */
export const googleRedirectUri = `${env.APP_ORIGIN}/api/auth/google/callback`;
