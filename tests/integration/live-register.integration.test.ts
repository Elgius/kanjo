import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";
import { NextRequest } from "next/server";

databaseDescribe("live register authentication and queries", () => {
  let db: PrismaClient;
  let authorize: typeof import("@/lib/auth-context").getAuthorizationFromHeaders;
  let proxy: typeof import("@/proxy").proxy;
  let queries: typeof import("@/lib/pos/queries");
  let roleId: string;
  let headers: Headers;
  const marker = `live-${crypto.randomUUID()}`;
  const registers: string[] = [];
  const shifts: string[] = [];
  const receipts: string[] = [];

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ getAuthorizationFromHeaders: authorize } = await import("@/lib/auth-context"));
    ({ proxy } = await import("@/proxy"));
    queries = await import("@/lib/pos/queries");
    roleId = (await db.role.create({ data: { name: marker, normalizedName: marker, registerScopeMode: "ALL", capabilities: { create: [{ capability: "REGISTERS_VIEW" }, { capability: "SHIFT_OPEN" }] } } })).id;
    for (const suffix of ["a", "b"]) registers.push((await db.cashRegister.create({ data: { name: `${marker}-${suffix}`, code: `${marker}-${suffix}` } })).id);
    const password = crypto.randomUUID();
    const { hashPassword } = await import("better-auth/crypto");
    await db.user.create({ data: { id: marker, name: marker, email: `${marker}@example.invalid`, roleId, registerScopeMode: "SELECTED", registerAccess: { create: { registerId: registers[0] } }, accounts: { create: { id: marker, accountId: marker, providerId: "credential", password: await hashPassword(password) } } } });
    const { auth } = await import("@/lib/auth");
    const response = await auth.api.signInEmail({ body: { email: `${marker}@example.invalid`, password }, asResponse: true });
    if (!response.ok) throw new Error(`Fixture login failed: ${response.status}`);
    headers = new Headers({ cookie: response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ") });
    for (let i = 0; i < 3; i++) {
      shifts.push((await db.registerShift.create({ data: { registerId: registers[i === 2 ? 1 : 0], openedById: marker, status: i === 0 ? "CLOSED" : "OPEN", ...(i === 0 ? { closedAt: new Date(), closedById: marker, closingCashLaari: 0 } : {}) } })).id);
      receipts.push((await db.sale.create({ data: { registerShiftId: shifts[i], createdById: marker, paymentMethod: "CASH", subtotalLaari: 100, totalLaari: 100 } })).id);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.sale.deleteMany({ where: { id: { in: receipts } } });
    await db.registerShift.deleteMany({ where: { id: { in: shifts } } });
    await db.user.deleteMany({ where: { id: marker } });
    await db.cashRegister.deleteMany({ where: { id: { in: registers } } });
    if (roleId) await db.role.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });

  test("signed-in scope comes from the user, not legacy all-register role scope", async () => {
    const access = await authorize(headers);
    expect(access?.registerScopeMode).toBe("SELECTED");
    expect(JSON.stringify([...access!.registerIds])).toBe(JSON.stringify([registers[0]]));
    expect((await queries.getRegisterSummaries([...access!.registerIds])).map(r => r.id).join()).toBe(registers[0]);
    expect(await authorize(new Headers())).toBeNull();
  });

  test("proxy redirects authenticated cashiers and preserves the live action destination", async () => {
    for (const path of ["/", "/login", "/registers"]) {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
      expect(new URL(response.headers.get("location")!).pathname).toBe("/live_register");
    }
    const live = await proxy(new NextRequest("http://localhost:3000/live_register", { headers }));
    expect(live.headers.get("location")).toBeNull();
    const post = await proxy(new NextRequest(`http://localhost:3000/live_register/${registers[0]}`, { headers, method: "POST" }));
    expect(post.headers.get("x-middleware-request-x-kanjo-register-ui")).toBe("live");
    const anonymous = await proxy(new NextRequest("http://localhost:3000/live_register"));
    expect(new URL(anonymous.headers.get("location")!).pathname).toBe("/login");
  });

  test("cashier queries restrict receipts to the current assigned shift", async () => {
    const options = { includeCreditCustomers: false, currentShiftReceiptOnly: true };
    const current = await queries.getRegisterManagementData(registers[0], receipts[1], [registers[0]], options);
    expect(current?.receipt?.id).toBe(receipts[1]);
    expect(current?.creditCustomers).toHaveLength(0);
    expect((await queries.getRegisterManagementData(registers[0], receipts[0], [registers[0]], options))?.receipt).toBeNull();
    expect((await queries.getRegisterManagementData(registers[0], receipts[2], [registers[0]], options))?.receipt).toBeNull();
    await expect(queries.getRegisterManagementData(registers[1], undefined, [registers[0]], options)).rejects.toThrow();
    expect(await queries.getRegisterSummaries([])).toHaveLength(0);
  });

  test("permission and scope edits take effect with the existing session cookie", async () => {
    await db.userRegisterAccess.deleteMany({ where: { userId: marker } });
    expect([...(await authorize(headers))!.registerIds]).toHaveLength(0);
    await db.roleCapability.create({ data: { roleId, capability: "OVERVIEW_VIEW" } });
    const response = await proxy(new NextRequest("http://localhost:3000/login", { headers }));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
    await db.session.deleteMany({ where: { userId: marker } });
    expect(await authorize(headers)).toBeNull();
  });
});
