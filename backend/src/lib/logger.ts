import { isProd } from "./env";

type Level = "debug" | "info" | "warn" | "error";

/**
 * Minimal dependency-free structured logger.
 * - JSON lines in production (machine-parseable), pretty in dev.
 * - Never log message bodies or secrets; pass only safe metadata.
 */
function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const record = { ts: new Date().toISOString(), level, msg, ...meta };
  const line = isProd ? JSON.stringify(record) : formatPretty(level, msg, meta);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function formatPretty(level: Level, msg: string, meta?: Record<string, unknown>) {
  const tag = level.toUpperCase().padEnd(5);
  const extra = meta && Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  return `${tag} ${msg}${extra}`;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    !isProd && emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
