import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hashPassword } from "better-auth/crypto";

import type { PrismaClient } from "@/generated/prisma/client";

const testDatabaseUrl = process.env.TEST_NEON_DB ?? process.env.NEON_DB;
const runDatabaseTests = process.env.RUN_DB_TESTS === "1" && Boolean(testDatabaseUrl);
const databaseDescribe = runDatabaseTests ? describe : describe.skip;

function responseCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

function requestCookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

function cookieName(setCookie: string) {
  return setCookie.slice(0, setCookie.indexOf("="));
}

databaseDescribe("Better Auth cookie cache", () => {
  let db: PrismaClient;
  let auth: typeof import("@/lib/auth").auth;
  const marker = `auth-cache-${crypto.randomUUID()}`;
  const email = `${marker}@example.invalid`;
  const password = "test-password-12345";
  let roleId = "";
  let userId = "";

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-at-least-thirty-two-characters";
    ({ prisma: db } = await import("@/lib/db"));
    ({ auth } = await import("@/lib/auth"));

    roleId = (await db.role.create({ data: { name: marker, normalizedName: marker } })).id;
    userId = crypto.randomUUID();
    await db.user.create({
      data: { id: userId, name: "Auth Cache Test", email, emailVerified: true, roleId },
    });
    await db.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword(password),
      },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.session.deleteMany({ where: { userId } });
    await db.account.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
  });

  async function signIn() {
    return auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email, password }),
      }),
    );
  }

  test("signs, validates, rejects tampering, and expires both session cookies", async () => {
    const signInResponse = await signIn();
    expect(signInResponse.ok).toBe(true);
    const signedCookies = responseCookies(signInResponse);
    const tokenCookie = signedCookies.find((cookie) => cookieName(cookie).includes("session_token"));
    const cacheCookie = signedCookies.find((cookie) => cookieName(cookie).includes("session_data"));
    expect(Boolean(tokenCookie)).toBe(true);
    expect(cacheCookie?.includes("Max-Age=300")).toBe(true);

    const cookieHeader = requestCookieHeader(signedCookies);
    for (let read = 0; read < 2; read += 1) {
      const sessionResponse = await auth.handler(
        new Request("http://localhost:3000/api/auth/get-session", {
          headers: { cookie: cookieHeader },
        }),
      );
      expect(sessionResponse.ok).toBe(true);
      expect((await sessionResponse.json() as { user?: { id?: string } } | null)?.user?.id).toBe(userId);
    }

    await db.session.deleteMany({ where: { userId } });
    const tamperedCookies = signedCookies.map((cookie) => {
      if (!cookieName(cookie).includes("session_data")) return cookie;
      const separator = cookie.indexOf(";");
      const pair = separator === -1 ? cookie : cookie.slice(0, separator);
      const attributes = separator === -1 ? "" : cookie.slice(separator);
      const last = pair.at(-1);
      return `${pair.slice(0, -1)}${last === "a" ? "b" : "a"}${attributes}`;
    });
    const tamperedResponse = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: requestCookieHeader(tamperedCookies) },
      }),
    );
    expect(await tamperedResponse.json()).toBeNull();

    const secondSignIn = await signIn();
    const secondCookies = responseCookies(secondSignIn);
    const signOutResponse = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: requestCookieHeader(secondCookies),
          origin: "http://localhost:3000",
        },
      }),
    );
    expect(signOutResponse.ok).toBe(true);
    const expiredCookies = responseCookies(signOutResponse);
    expect(expiredCookies.some((cookie) => cookieName(cookie).includes("session_token") && /Max-Age=0/i.test(cookie))).toBe(true);
    expect(expiredCookies.some((cookie) => cookieName(cookie).includes("session_data") && /Max-Age=0/i.test(cookie))).toBe(true);
  });
});

databaseDescribe("register summaries", () => {
  let db: PrismaClient;
  let getRegisterSummaries: typeof import("@/lib/pos/queries").getRegisterSummaries;
  const marker = `register-summary-${crypto.randomUUID()}`;
  let roleId = "";
  let userId = "";
  let openRegisterId = "";
  let closedRegisterId = "";
  let openShiftId = "";
  let closedShiftId = "";

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ getRegisterSummaries } = await import("@/lib/pos/queries"));
    roleId = (await db.role.create({ data: { name: marker, normalizedName: marker } })).id;
    userId = crypto.randomUUID();
    await db.user.create({ data: { id: userId, name: marker, email: `${marker}@example.invalid`, roleId } });
    openRegisterId = (await db.cashRegister.create({ data: { code: `${marker}-OPEN`, name: `${marker}-open` } })).id;
    closedRegisterId = (await db.cashRegister.create({ data: { code: `${marker}-CLOSED`, name: `${marker}-closed` } })).id;
    openShiftId = (await db.registerShift.create({ data: { registerId: openRegisterId, openedById: userId, openingCashLaari: 500 } })).id;
    closedShiftId = (await db.registerShift.create({ data: { registerId: closedRegisterId, openedById: userId, status: "CLOSED", closedAt: new Date() } })).id;
    await db.sale.createMany({ data: [
      { registerShiftId: openShiftId, createdById: userId, status: "COMPLETED", paymentMethod: "CASH", subtotalLaari: 100, totalLaari: 100 },
      { registerShiftId: openShiftId, createdById: userId, status: "COMPLETED", paymentMethod: "CARD", subtotalLaari: 250, totalLaari: 250 },
      { registerShiftId: openShiftId, createdById: userId, status: "REFUNDED", paymentMethod: "CASH", subtotalLaari: 900, totalLaari: 900, refundedAt: new Date() },
      { registerShiftId: closedShiftId, createdById: userId, status: "COMPLETED", paymentMethod: "CASH", subtotalLaari: 400, totalLaari: 400 },
    ] });
  });

  afterAll(async () => {
    if (!db) return;
    await db.sale.deleteMany({ where: { createdById: userId } });
    await db.registerShift.deleteMany({ where: { id: { in: [openShiftId, closedShiftId] } } });
    await db.cashRegister.deleteMany({ where: { id: { in: [openRegisterId, closedRegisterId] } } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
  });

  test("aggregates only completed sales for each latest open shift", async () => {
    const registers = await getRegisterSummaries();
    const open = registers.find((register) => register.id === openRegisterId);
    const closed = registers.find((register) => register.id === closedRegisterId);
    expect(open?.shifts[0]?.id).toBe(openShiftId);
    expect(open?.shifts[0]?.salesLaari).toBe(350);
    expect(open?.shifts[0]?.cashSalesLaari).toBe(100);
    expect(open?.shifts[0]?.transactionCount).toBe(2);
    expect(closed?.shifts).toHaveLength(0);
  });
});

databaseDescribe("audit keyset pagination", () => {
  let db: PrismaClient;
  let getAuditLogPage: typeof import("@/lib/audit-log").getAuditLogPage;
  const marker = `audit-page-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ getAuditLogPage } = await import("@/lib/audit-log"));
    const start = Date.now() - 200_000;
    await db.auditLog.createMany({
      data: Array.from({ length: 123 }, (_, index) => ({
        occurredAt: new Date(start + index * 1_000),
        outcome: "SUCCESS" as const,
        event: "PAGINATION_TEST",
        summary: `${marker} ${index}`,
        searchText: `${marker} ${index}`,
      })),
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { searchText: { contains: marker } } });
  });

  test("moves forward and backward across first, middle, and final pages without gaps", async () => {
    const first = await getAuditLogPage({ q: marker });
    expect(first.rows).toHaveLength(50);
    expect(first.previousCursor).toBeNull();
    expect(Boolean(first.nextCursor)).toBe(true);

    const second = await getAuditLogPage({ q: marker, after: first.nextCursor! });
    expect(second.rows).toHaveLength(50);
    expect(Boolean(second.previousCursor)).toBe(true);
    expect(Boolean(second.nextCursor)).toBe(true);

    const final = await getAuditLogPage({ q: marker, after: second.nextCursor! });
    expect(final.rows).toHaveLength(23);
    expect(Boolean(final.previousCursor)).toBe(true);
    expect(final.nextCursor).toBeNull();

    const previous = await getAuditLogPage({ q: marker, before: final.previousCursor! });
    expect(JSON.stringify(previous.rows.map((row) => row.id))).toBe(JSON.stringify(second.rows.map((row) => row.id)));
    const allIds = [...first.rows, ...second.rows, ...final.rows].map((row) => row.id);
    expect(new Set(allIds).size).toBe(123);
  });
});
