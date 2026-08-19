import { afterAll, beforeAll, expect, test } from "bun:test";

import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("paid bill corrections", () => {
  let db: PrismaClient;
  let recordSale: typeof import("@/lib/pos/sales").recordSale;
  let amendPaidBill: typeof import("@/lib/pos/bill-corrections").amendPaidBill;
  let reversePaidBill: typeof import("@/lib/pos/bill-corrections").reversePaidBill;
  const marker = `correction-${crypto.randomUUID()}`;
  let roleId = "";
  let userId = "";
  let registerId = "";
  let shiftId = "";
  let categoryId = "";
  let productId = "";

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ recordSale } = await import("@/lib/pos/sales"));
    ({ amendPaidBill, reversePaidBill } = await import("@/lib/pos/bill-corrections"));
    roleId = (await db.role.create({ data: { name: marker, normalizedName: marker } })).id;
    userId = marker;
    await db.user.create({ data: { id: userId, name: "Correction Admin", email: `${marker}@example.invalid`, roleId, isSiteAdmin: true } });
    registerId = (await db.cashRegister.create({ data: { code: marker.toUpperCase(), name: marker } })).id;
    shiftId = (await db.registerShift.create({ data: { registerId, openedById: userId, openingCashLaari: 1_000 } })).id;
    categoryId = (await db.productCategory.create({ data: { name: marker, normalizedName: marker } })).id;
    productId = (await db.product.create({ data: {
      registerId, categoryId, sku: marker.toUpperCase(), name: "Correction product", category: marker, retailPriceLaari: 1_000,
    } })).id;
    await db.inventoryBatch.create({ data: {
      productId, registerId, receivedById: userId, receivedQuantity: 10, remainingQuantity: 10,
    } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.inventoryConsumption.deleteMany({ where: { OR: [{ sale: { createdById: userId } }, { customerCreditBill: { createdById: userId } }] } });
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.inventoryMovement.deleteMany({ where: { createdById: userId } });
    await db.bill.deleteMany({ where: { sale: { createdById: userId } } });
    await db.sale.deleteMany({ where: { createdById: userId } });
    await db.inventoryBatch.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
    await db.productCategory.deleteMany({ where: { id: categoryId } });
    await db.registerShift.deleteMany({ where: { id: shiftId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });

  test("amends repeatedly and reverses only the remaining stock-backed quantity", async () => {
    const sale = await recordSale(db, {
      shiftId, createdById: userId, cashierName: "Correction Admin", paymentMethod: "CASH",
      items: [{ itemId: productId, quantity: 2 }], audit: { actorLabel: marker },
    });
    const original = await db.bill.findUniqueOrThrow({ where: { saleId: sale.id }, include: { sale: { include: { items: true } } } });
    const saleItemId = original.sale!.items[0].id;
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(8);

    await amendPaidBill(db, {
      billId: original.id, registerId, sessionId: shiftId, expectedVersion: original.version,
      quantities: [{ saleItemId, quantity: 4 }],
      addedStock: { mode: "ALL", quantities: [] }, removedStock: { mode: "ALL", quantities: [] },
      actorId: userId, actorName: "Correction Admin", audit: { actorLabel: marker },
    });
    const increased = await db.bill.findUniqueOrThrow({ where: { id: original.id } });
    expect(increased.status).toBe("AMENDED");
    expect(increased.totalLaari).toBe(4_000);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(6);

    await amendPaidBill(db, {
      billId: original.id, registerId, sessionId: shiftId, expectedVersion: increased.version,
      quantities: [{ saleItemId, quantity: 6 }],
      addedStock: { mode: "SOME", quantities: [{ saleItemId, quantity: 1 }] }, removedStock: { mode: "ALL", quantities: [] },
      actorId: userId, actorName: "Correction Admin", audit: { actorLabel: marker },
    });
    const partlyTracked = await db.bill.findUniqueOrThrow({ where: { id: original.id } });
    expect(partlyTracked.totalLaari).toBe(6_000);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(5);

    await amendPaidBill(db, {
      billId: original.id, registerId, sessionId: shiftId, expectedVersion: partlyTracked.version,
      quantities: [{ saleItemId, quantity: 7 }],
      addedStock: { mode: "NONE", quantities: [] }, removedStock: { mode: "ALL", quantities: [] },
      actorId: userId, actorName: "Correction Admin", audit: { actorLabel: marker },
    });
    const financiallyAdded = await db.bill.findUniqueOrThrow({ where: { id: original.id } });
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(5);

    await amendPaidBill(db, {
      billId: original.id, registerId, sessionId: shiftId, expectedVersion: financiallyAdded.version,
      quantities: [{ saleItemId, quantity: 3 }],
      addedStock: { mode: "NONE", quantities: [] }, removedStock: { mode: "SOME", quantities: [{ saleItemId, quantity: 1 }] },
      actorId: userId, actorName: "Correction Admin", audit: { actorLabel: marker },
    });
    const reduced = await db.bill.findUniqueOrThrow({ where: { id: original.id } });
    expect(reduced.totalLaari).toBe(3_000);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(6);

    await reversePaidBill(db, {
      billId: original.id, registerId, sessionId: shiftId, expectedVersion: reduced.version,
      stock: { mode: "ALL", quantities: [] }, actorId: userId, actorName: "Correction Admin", audit: { actorLabel: marker },
    });
    const [reversed, storedSale, revisions, stock] = await Promise.all([
      db.bill.findUniqueOrThrow({ where: { id: original.id } }),
      db.sale.findUniqueOrThrow({ where: { id: sale.id } }),
      db.billRevision.findMany({ where: { billId: original.id }, orderBy: { revision: "asc" } }),
      db.inventoryBatch.aggregate({ where: { productId }, _sum: { remainingQuantity: true } }),
    ]);
    expect(reversed.status).toBe("REVERSED");
    expect(storedSale.status).toBe("REFUNDED");
    expect(Number(stock._sum.remainingQuantity)).toBe(9);
    expect(JSON.stringify(revisions.map((revision) => revision.kind))).toBe(JSON.stringify(["PAYMENT", "AMENDMENT", "AMENDMENT", "AMENDMENT", "AMENDMENT", "REVERSAL"]));
  });
});
