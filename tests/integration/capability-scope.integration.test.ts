import { afterAll, beforeAll, expect, test } from "bun:test";

import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("capability register scope", () => {
  let db: PrismaClient;
  let getInventoryData: typeof import("@/lib/pos/queries").getInventoryData;
  let getSessionRegisters: typeof import("@/lib/pos/register-sessions").getSessionRegisters;
  let roleId: string;
  let userId: string;
  let categoryId: string;
  const registerIds: string[] = [];
  const productIds: string[] = [];
  const marker = `scope-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ getInventoryData } = await import("@/lib/pos/queries"));
    ({ getSessionRegisters } = await import("@/lib/pos/register-sessions"));

    const role = await db.role.create({
      data: {
        name: marker,
        normalizedName: marker,
        registerScopeMode: "SELECTED",
        capabilities: { create: [{ capability: "INVENTORY_VIEW" }, { capability: "REGISTER_SESSIONS_VIEW" }] },
      },
    });
    roleId = role.id;
    userId = marker;
    await db.user.create({ data: { id: userId, name: marker, email: `${marker}@example.invalid`, roleId } });
    categoryId = (await db.productCategory.create({ data: { name: marker, normalizedName: marker } })).id;
    for (const suffix of ["assigned", "outside"]) {
      const register = await db.cashRegister.create({
        data: { code: `${marker}-${suffix}`, name: `${marker}-${suffix}` },
      });
      registerIds.push(register.id);
      const product = await db.product.create({
        data: {
          registerId: register.id,
          categoryId,
          sku: `${marker}-${suffix}`.toUpperCase(),
          name: `${marker}-${suffix}`,
          category: marker,
          retailPriceLaari: 100,
        },
      });
      productIds.push(product.id);
      await db.registerShift.create({ data: { registerId: register.id, openedById: userId } });
    }
    await db.roleRegisterAccess.create({ data: { roleId, registerId: registerIds[0] } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.registerShift.deleteMany({ where: { registerId: { in: registerIds } } });
    await db.product.deleteMany({ where: { id: { in: productIds } } });
    await db.productCategory.deleteMany({ where: { id: categoryId } });
    await db.cashRegister.deleteMany({ where: { id: { in: registerIds } } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });

  test("selected-register queries exclude cross-register inventory and sessions", async () => {
    const inventory = await getInventoryData({}, [registerIds[0]]);
    const sessions = await getSessionRegisters([registerIds[0]]);
    expect(inventory.products.every((product) => product.register.id === registerIds[0])).toBe(true);
    expect(inventory.registers.every((register) => register.id === registerIds[0])).toBe(true);
    expect(sessions.registers.every((register) => register.id === registerIds[0])).toBe(true);
  });

  test("selected-register roles do not inherit a later register", async () => {
    const access = await db.roleRegisterAccess.findMany({ where: { roleId }, select: { registerId: true } });
    expect(access).toHaveLength(1);
    expect(access[0]?.registerId).toBe(registerIds[0]);
    expect(access.some(({ registerId }) => registerId === registerIds[1])).toBe(false);
  });
});
