import { normalizeForModeration } from "./normalize";

/**
 * Profanity moderation.
 *
 * Design goals:
 *  - Enforced server-side (this module is only ever imported by services).
 *  - Resistant to simple evasion: casing, spaces, repeats, leet substitutions.
 *  - The word STRATEGY is swappable (interface below) so the list can later be
 *    moved to a DB/config/remote service without touching the messaging code.
 *  - Pragmatic about false positives (the "Scunthorpe problem") via an
 *    allowlist of safe words that legitimately contain a banned substring.
 */

export interface ProfanityResult {
  blocked: boolean;
  /** Which normalized term matched (for server logs only, never shown raw). */
  match?: string;
}

export interface WordStrategy {
  /** Words matched (after normalization) both per-token and in the dense form. */
  bannedTokens(): string[];
  /** Safe words that contain a banned substring and must not be flagged. */
  allowlist(): string[];
}

/**
 * Default in-memory strategy. Intentionally small and illustrative — the point
 * is the pipeline, not an exhaustive list. Swap this out to change policy.
 */
export class DefaultWordStrategy implements WordStrategy {
  private static BANNED = [
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "bastard",
    "dick",
    "cunt",
    "slut",
    "whore",
    "retard",
    "nigger",
    "faggot",
  ];
  private static ALLOW = [
    "class",
    "pass",
    "glass",
    "grass",
    "bass",
    "assess",
    "assassin",
    "assist",
    "associate",
    "assume",
    "assign",
    "assembly",
    "massachusetts",
    "cassette",
    "dickens",
    "scunthorpe",
  ];

  bannedTokens() {
    return DefaultWordStrategy.BANNED.map(normalizeForModeration);
  }
  allowlist() {
    return DefaultWordStrategy.ALLOW.map(normalizeForModeration);
  }
}

export class ProfanityFilter {
  private banned: string[];
  private allow: Set<string>;

  constructor(strategy: WordStrategy = new DefaultWordStrategy()) {
    this.banned = strategy.bannedTokens().filter(Boolean);
    this.allow = new Set(strategy.allowlist().filter(Boolean));
  }

  check(text: string): ProfanityResult {
    if (!text) return { blocked: false };

    // Normalize each whitespace/punct-delimited token, dropping allowlisted
    // safe words (so "class"/"assist" never contribute to a match).
    const tokens = text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((t) => normalizeForModeration(t))
      .filter((t) => t && !this.allow.has(t));

    // Pass 1 — per token: catches "bitch", "b1tch", "biiitch", "bitchhh".
    for (const token of tokens) {
      for (const bad of this.banned) {
        if (token.includes(bad)) return { blocked: true, match: bad };
      }
    }

    // Pass 2 — dense (allowlist-filtered tokens joined): catches spacing
    // bypasses like "b i t c h" / "f u c k". Allowlisted words were removed
    // above so this does not reintroduce their false positives.
    const dense = tokens.join("");
    for (const bad of this.banned) {
      if (dense.includes(bad)) return { blocked: true, match: bad };
    }

    return { blocked: false };
  }
}

/** Shared default instance. */
export const profanityFilter = new ProfanityFilter();
