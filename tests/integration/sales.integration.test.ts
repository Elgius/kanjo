import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";

const testDatabaseUrl = process.env.TEST_NEON_DB ?? process.env.NEON_DB;
const runDatabaseTests = process.env.RUN_DB_TESTS === "1" && Boolean(testDatabaseUrl);
const databaseDescribe = runDatabaseTests ? describe : describe.skip;

databaseDescribe("Neon sale transaction", () => {
  let db: PrismaClient;
  let recordSale: typeof import("@/lib/pos/sales").recordSale;
  let userId: string;
  let registerId: string;
  let shiftId: string;
  let productId: string;
  const marker = `codex-test-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ recordSale } = await import("@/lib/pos/sales"));

    const user = await db.user.create({
      data: { id: marker, name: "Integration Test", email: `${marker}@example.invalid` },
    });
    userId = user.id;
    const register = await db.cashRegister.create({
      data: { code: marker.toUpperCase(), name: marker },
    });
    registerId = register.id;
    const shift = await db.registerShift.create({
      data: { registerId, openedById: userId, openingCashLaari: 10_000 },
    });
    shiftId = shift.id;
    const product = await db.product.create({
      data: {
        sku: marker.toUpperCase(),
        name: "Integration product",
        category: "Test",
        retailPriceLaari: 2_500,
        costPriceLaari: 1_000,
        stockQuantity: 5,
        lowStockThreshold: 1,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.inventoryMovement.deleteMany({ where: { createdById: userId } });
    await db.sale.deleteMany({ where: { createdById: userId } });
    await db.registerShift.deleteMany({ where: { registerId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  test("records a sale and deducts stock in one transaction", async () => {
    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      paymentMethod: "CASH",
      items: [{ productId, quantity: 2 }],
    });

    expect(sale.totalLaari).toBe(5_000);
    const [product, storedSale, movement] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } }),
      db.inventoryMovement.findFirstOrThrow({ where: { saleId: sale.id } }),
    ]);
    expect(product.stockQuantity).toBe(3);
    expect(storedSale.items).toHaveLength(1);
    expect(storedSale.items[0].lineTotalLaari).toBe(5_000);
    expect(movement.quantityDelta).toBe(-2);
  });

  test("rolls back the sale when stock is insufficient", async () => {
    const before = await db.sale.count({ where: { createdById: userId } });
    await expect(
      recordSale(db, {
        shiftId,
        createdById: userId,
        paymentMethod: "CARD",
        items: [{ productId, quantity: 99 }],
      }),
    ).rejects.toThrow("only has 3 in stock");
    expect(await db.sale.count({ where: { createdById: userId } })).toBe(before);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(3);
  });
});
