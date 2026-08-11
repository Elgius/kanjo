import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("Neon sale transaction", () => {
  let db: PrismaClient;
  let recordSale: typeof import("@/lib/pos/sales").recordSale;
  let holdRegisterOrder: typeof import("@/lib/pos/orders").holdRegisterOrder;
  let userId: string;
  let roleId: string;
  let registerId: string;
  let shiftId: string;
  let productId: string;
  const marker = `codex-test-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ recordSale } = await import("@/lib/pos/sales"));
    ({ holdRegisterOrder } = await import("@/lib/pos/orders"));

    const role = await db.role.create({
      data: { name: marker, normalizedName: marker },
    });
    roleId = role.id;
    const user = await db.user.create({
      data: { id: marker, name: "Integration Test", email: `${marker}@example.invalid`, roleId },
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
        registerId,
        name: "Integration product",
        category: "Test",
        retailPriceLaari: 2_500,
        costPriceLaari: 1_000,
        lowStockThreshold: 1,
      },
    });
    productId = product.id;
    await db.inventoryBatch.create({ data: {
      productId, registerId, receivedById: userId,
      receivedQuantity: 5, remainingQuantity: 5,
    } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.inventoryMovement.deleteMany({ where: { createdById: userId } });
    await db.sale.deleteMany({ where: { createdById: userId } });
    await db.registerOrder.deleteMany({ where: { createdById: userId } });
    await db.inventoryBatch.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.registerShift.deleteMany({ where: { registerId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });

  test("records a sale and deducts stock in one transaction", async () => {
    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      paymentMethod: "CASH",
      items: [{ itemId: productId, quantity: 2 }],
      audit: { actorLabel: marker },
    });

    expect(sale.totalLaari).toBe(5_000);
    const [product, storedSale, movement, audit] = await Promise.all([
      db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }),
      db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } }),
      db.inventoryMovement.findFirstOrThrow({ where: { saleId: sale.id } }),
      db.auditLog.findFirstOrThrow({ where: { event: "SALE_RECORD", targetId: sale.id } }),
    ]);
    expect(Number(product._sum.remainingQuantity)).toBe(3);
    expect(storedSale.items).toHaveLength(1);
    expect(storedSale.items[0].lineTotalLaari).toBe(5_000);
    expect(Number(movement.quantityDelta)).toBe(-2);
    expect(movement.registerId).toBe(registerId);
    expect(Number(movement.balanceAfter)).toBe(3);
    expect(audit.outcome).toBe("SUCCESS");
    expect(audit.actorId).toBe(userId);
  });

  test("rolls back the sale when stock is insufficient", async () => {
    const [before, auditBefore] = await Promise.all([
      db.sale.count({ where: { createdById: userId } }),
      db.auditLog.count({ where: { actorId: userId } }),
    ]);
    await expect(
      recordSale(db, {
        shiftId,
        createdById: userId,
        paymentMethod: "CARD",
        items: [{ itemId: productId, quantity: 99 }],
        audit: { actorLabel: marker },
      }),
    ).rejects.toThrow("does not have enough usable stock");
    expect(await db.sale.count({ where: { createdById: userId } })).toBe(before);
    expect(await db.auditLog.count({ where: { actorId: userId } })).toBe(auditBefore);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(3);
  });

  test("holds an order without stock movement and completes it with the sale", async () => {
    const before = await db.inventoryBatch.aggregate({
      where: { productId },
      _sum: { remainingQuantity: true },
    });
    const order = await holdRegisterOrder(db, {
      shiftId,
      createdById: userId,
      paymentMethod: "CASH",
      customerNote: "Integration hold",
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    expect(order.status).toBe("HELD");
    expect(Number((await db.inventoryBatch.aggregate({
      where: { productId },
      _sum: { remainingQuantity: true },
    }))._sum.remainingQuantity)).toBe(Number(before._sum.remainingQuantity));

    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      heldOrderId: order.id,
      paymentMethod: "CASH",
      items: [{ itemId: productId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    const completed = await db.registerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.saleId).toBe(sale.id);
  });
});
