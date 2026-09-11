import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";
import { registerScopeAllows } from "@/lib/permissions";

databaseDescribe("per-account register assignments", () => {
  let db: PrismaClient;
  let validate: typeof import("@/lib/settings-access").validateRegisterAssignment;
  let sessions: typeof import("@/lib/pos/register-sessions").getSessionRegisters;
  const marker = `settings-${crypto.randomUUID()}`;
  const users = [`${marker}-a`, `${marker}-b`];
  const roles: string[] = [];
  const registers: string[] = [];
  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ validateRegisterAssignment: validate } = await import("@/lib/settings-access"));
    ({ getSessionRegisters: sessions } = await import("@/lib/pos/register-sessions"));
    for (const suffix of ["cashier", "supervisor"]) roles.push((await db.role.create({ data: { name: `${marker}-${suffix}`, normalizedName: `${marker}-${suffix}`, registerScopeMode: "ALL", capabilities: { create: [{ capability: "REGISTERS_VIEW" }] } } })).id);
    for (const suffix of ["a", "b"]) registers.push((await db.cashRegister.create({ data: { name: `${marker}-${suffix}`, code: `${marker}-${suffix}` } })).id);
    for (let i = 0; i < users.length; i++) await db.user.create({ data: { id: users[i], name: users[i], email: `${users[i]}@example.invalid`, roleId: roles[0], registerScopeMode: "SELECTED", registerAccess: { create: { registerId: registers[i] } } } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.cashRegister.deleteMany({ where: { id: { in: registers } } });
    await db.role.deleteMany({ where: { id: { in: roles } } });
    await db.$disconnect();
  });
  test("users sharing a role have different register access and scoped sessions", async () => {
    for (let i = 0; i < users.length; i++) {
      const user = await db.user.findUniqueOrThrow({ where: { id: users[i] }, include: { registerAccess: true } });
      const ids = user.registerAccess.map(({ registerId }) => registerId);
      expect(registerScopeAllows(false, user.registerScopeMode, new Set(ids), registers[i])).toBe(true);
      expect(registerScopeAllows(false, user.registerScopeMode, new Set(ids), registers[1 - i])).toBe(false);
      expect(JSON.stringify((await sessions(ids)).registers.map(({ id }) => id))).toBe(JSON.stringify([registers[i]]));
    }
  });
  test("changing a role does not replace user assignments with legacy role scope", async () => {
    await db.user.update({ where: { id: users[0] }, data: { roleId: roles[1] } });
    const user = await db.user.findUniqueOrThrow({ where: { id: users[0] }, include: { registerAccess: true } });
    expect(user.registerScopeMode).toBe("SELECTED");
    expect(JSON.stringify(user.registerAccess.map(({ registerId }) => registerId))).toBe(JSON.stringify([registers[0]]));
  });
  test("empty assignments fail closed in register queries", async () => {
    expect((await sessions([])).registers).toHaveLength(0);
  });
  test("missing and newly archived register grants are rejected; retained archived grants are allowed", async () => {
    await expect(db.$transaction((tx) => validate(tx, { ok: true, scopeMode: "SELECTED", registerIds: [crypto.randomUUID()] }, []))).rejects.toThrow("no longer exist");
    await db.cashRegister.update({ where: { id: registers[0] }, data: { active: false } });
    await expect(db.$transaction((tx) => validate(tx, { ok: true, scopeMode: "SELECTED", registerIds: [registers[0]] }, []))).rejects.toThrow("Archived");
    expect((await db.$transaction((tx) => validate(tx, { ok: true, scopeMode: "SELECTED", registerIds: [registers[0]] }, [], false, [registers[0]]))).ok).toBe(true);
  });
  test("invalid scope prevents partial assignment writes", async () => {
    await expect(db.$transaction(async (tx) => {
      await tx.userRegisterAccess.deleteMany({ where: { userId: users[1] } });
      await validate(tx, { ok: true, scopeMode: "SELECTED", registerIds: [] }, ["REGISTER_CREATE_GLOBAL"]);
    })).rejects.toThrow("requires all-register access");
    expect(await db.userRegisterAccess.count({ where: { userId: users[1] } })).toBe(1);
  });
});
