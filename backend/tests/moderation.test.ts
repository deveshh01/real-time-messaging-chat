import { describe, it, expect } from "vitest";
import { normalizeForModeration } from "@/src/server/services/moderation/normalize";
import { ProfanityFilter, DefaultWordStrategy } from "@/src/server/services/moderation/profanity";

const filter = new ProfanityFilter(new DefaultWordStrategy());

describe("normalizeForModeration", () => {
  it("lowercases and strips separators", () => {
    expect(normalizeForModeration("H E L L O")).toBe("helo"); // repeats collapsed
  });
  it("maps common leet substitutions", () => {
    expect(normalizeForModeration("sh1t")).toContain("shit");
    expect(normalizeForModeration("@ss")).toBe("as");
  });
  it("collapses repeated letters", () => {
    expect(normalizeForModeration("cooool")).toBe("col");
  });
});

describe("ProfanityFilter", () => {
  it("blocks a plain profane word", () => {
    expect(filter.check("you are a bitch").blocked).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(filter.check("SHIT happens").blocked).toBe(true);
  });

  it("defeats spacing bypass", () => {
    expect(filter.check("f u c k this").blocked).toBe(true);
    expect(filter.check("you are a b i t c h").blocked).toBe(true);
  });

  it("defeats repeated-letter bypass", () => {
    expect(filter.check("shiiiit").blocked).toBe(true);
  });

  it("defeats leetspeak bypass", () => {
    expect(filter.check("you b1tch").blocked).toBe(true); // 1 -> i
    expect(filter.check("5hit man").blocked).toBe(true); // 5 -> s
  });

  it("allows clean text", () => {
    expect(filter.check("Have a wonderful day!").blocked).toBe(false);
  });

  it("does not false-positive on safe words containing a banned substring", () => {
    for (const safe of ["class", "pass the ball", "glass of water", "assessment", "assist me"]) {
      expect(filter.check(safe).blocked, `"${safe}" should be allowed`).toBe(false);
    }
  });

  it("respects a swapped word strategy (extensibility)", () => {
    const custom = new ProfanityFilter({
      bannedTokens: () => [normalizeForModeration("banana")],
      allowlist: () => [],
    });
    expect(custom.check("i love banana").blocked).toBe(true);
    expect(custom.check("i love apples").blocked).toBe(false);
  });
});
