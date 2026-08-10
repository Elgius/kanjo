import { describe, expect, test } from "bun:test";

import { fuzzySearchMatches, fuzzySearchScore } from "@/lib/pos/search";

describe("fuzzy POS search", () => {
  test("matches exact substrings and SKU punctuation", () => {
    expect(fuzzySearchMatches("compact", ["Compact Umbrella", "ACC-UMB-001"])).toBe(true);
    expect(fuzzySearchMatches("acc umb", ["Compact Umbrella", "ACC-UMB-001"])).toBe(true);
  });

  test("tolerates missing letters and common typos", () => {
    expect(fuzzySearchMatches("compct", ["Compact Umbrella"])).toBe(true);
    expect(fuzzySearchMatches("umbrellla", ["Compact Umbrella"])).toBe(true);
    expect(fuzzySearchMatches("garen kiosk", ["Garden Kiosk", "REG-GARDEN"])).toBe(true);
  });

  test("requires every search token and rejects unrelated text", () => {
    expect(fuzzySearchMatches("compact south", ["Compact Umbrella", "Garden Kiosk"])).toBe(false);
    expect(fuzzySearchScore("coffee", ["Vanilla Syrup"])).toBeNull();
  });
});
