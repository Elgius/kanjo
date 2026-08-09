import { describe, expect, test } from "bun:test";

import { formatMvr, parseMvr } from "@/lib/pos/money";

describe("MVR money helpers", () => {
  test("parses whole and fractional MVR into integer laari", () => {
    expect(parseMvr("12")).toBe(1200);
    expect(parseMvr("12.5")).toBe(1250);
    expect(parseMvr("1,234.56")).toBe(123456);
  });

  test("rejects invalid or over-precise money", () => {
    expect(parseMvr("-1")).toBeNull();
    expect(parseMvr("1.999")).toBeNull();
    expect(parseMvr("free")).toBeNull();
  });

  test("formats laari as MVR", () => {
    expect(formatMvr(123456)).toBe("MVR 1,234.56");
  });
});
