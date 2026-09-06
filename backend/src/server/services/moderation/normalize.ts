/**
 * Text normalization for profanity checks. The goal is to defeat *simple*
 * evasion (casing, spacing, repeats, common leet substitutions) — not to build
 * an unbeatable filter. Kept separate from the word strategy so either can
 * change independently.
 */

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  $: "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "+": "t",
};

/** Strip combining diacritical marks (e.g. "ｓｈïт" → "shit"-ish). */
function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Full normalization: unicode-fold, lowercase, map leet, drop non-letters,
 * collapse 3+ repeated letters to a single letter.
 *
 * Collapsing repeats to ONE letter is deliberate: it folds both "shiiit" and
 * "shit" to "shit" and even "coool"→"col", which is acceptable because the
 * word list matches on substrings of this collapsed form.
 */
export function normalizeForModeration(input: string): string {
  const folded = stripDiacritics(input.normalize("NFKC")).toLowerCase();

  let out = "";
  for (const ch of folded) {
    out += LEET_MAP[ch] ?? ch;
  }

  // Keep only a-z; this removes spaces, punctuation and zero-width tricks used
  // to break up words ("s h i t", "s.h.i.t", "s​hit").
  out = out.replace(/[^a-z]/g, "");

  // Collapse any run of the same letter (3+) down to a single occurrence.
  out = out.replace(/(.)\1{1,}/g, "$1");

  return out;
}
