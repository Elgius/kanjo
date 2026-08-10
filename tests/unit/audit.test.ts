import { describe, expect, test } from "bun:test";

import {
  auditCreateData,
  buildAuditSearchText,
  decodeAuditCursor,
  encodeAuditCursor,
  normalizeAuditFilters,
  parseMaldivesDateBoundary,
  sanitizeAuditMetadata,
} from "@/lib/audit-core";

describe("audit helpers", () => {
  test("removes credentials while retaining useful metadata", () => {
    expect(JSON.stringify(sanitizeAuditMetadata({
      username: "cashier",
      password: "do-not-store",
      nested: { sessionToken: "secret", quantity: 2 },
    }))).toBe(JSON.stringify({ username: "cashier", nested: { quantity: 2 } }));
  });

  test("builds normalized searchable text", () => {
    expect(buildAuditSearchText({
      event: "STOCK_ADJUST",
      page: "INVENTORY",
      actorLabel: "Floor.Manager",
      targetType: "product",
      targetId: "abc",
      summary: "Stock updated",
      metadata: { sku: "COF-01" },
    }).includes("floor.manager product abc stock updated sku cof-01")).toBe(true);
  });

  test("round-trips valid cursors and rejects malformed ones", () => {
    const cursor = { occurredAt: "2026-08-10T12:00:00.000Z", id: "abc" };
    expect(JSON.stringify(decodeAuditCursor(encodeAuditCursor(cursor)))).toBe(JSON.stringify(cursor));
    expect(decodeAuditCursor("not-a-cursor")).toBeNull();
  });

  test("interprets filter dates in Maldives time", () => {
    expect(parseMaldivesDateBoundary("2026-08-10")?.toISOString()).toBe("2026-08-09T19:00:00.000Z");
    expect(parseMaldivesDateBoundary("2026-08-10", true)?.toISOString()).toBe("2026-08-10T19:00:00.000Z");
  });

  test("normalizes valid filter combinations and ignores invalid enums", () => {
    const filters = normalizeAuditFilters({
      from: "2026-08-01",
      to: "2026-08-10",
      actor: " user-id ",
      outcome: "DENIED",
      event: " PAGE_ACCESS ",
      area: "SETTINGS",
      targetType: " role ",
      q: " manager ",
    });
    expect(filters.from?.toISOString()).toBe("2026-07-31T19:00:00.000Z");
    expect(filters.to?.toISOString()).toBe("2026-08-10T19:00:00.000Z");
    expect(filters.actor).toBe("user-id");
    expect(filters.outcome).toBe("DENIED");
    expect(filters.event).toBe("PAGE_ACCESS");
    expect(filters.page).toBe("SETTINGS");
    expect(filters.targetType).toBe("role");
    expect(filters.query).toBe("manager");
    expect(normalizeAuditFilters({ outcome: "MAYBE", area: "UNKNOWN" }).outcome).toBe(undefined);
    expect(normalizeAuditFilters({ outcome: "MAYBE", area: "UNKNOWN" }).page).toBe(undefined);
  });

  test("creates audit data without sensitive fields", () => {
    const data = auditCreateData({
      outcome: "FAILURE",
      event: "AUTH_SIGN_IN",
      actorLabel: "cashier",
      summary: "Sign-in failed.",
      metadata: { password: "hidden", status: 401 },
    });
    expect(JSON.stringify(data.metadata)).toBe(JSON.stringify({ status: 401 }));
    expect(data.searchText.includes("hidden")).toBe(false);
  });
});
