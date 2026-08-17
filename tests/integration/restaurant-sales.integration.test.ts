import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("restaurant recipe sale", () => {
  let db: PrismaClient;
  let recordSale: typeof import("@/lib/pos/sales").recordSale;
  let holdRegisterOrder: typeof import("@/lib/pos/orders").holdRegisterOrder;
  const marker = `restaurant-test-${crypto.randomUUID()}`;
  let userId = ""; let roleId = ""; let registerId = ""; let shiftId = ""; let coffeeId = ""; let eggId = ""; let menuItemId = ""; let categoryId = ""; let tableId = "";

  function day(offset: number) { const value = new Date(); value.setUTCDate(value.getUTCDate() + offset); return value; }

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ recordSale } = await import("@/lib/pos/sales"));
    ({ holdRegisterOrder } = await import("@/lib/pos/orders"));
    const role = await db.role.create({ data: { name: marker, normalizedName: marker } }); roleId = role.id;
    const user = await db.user.create({ data: { id: marker, name: "Restaurant Test", email: `${marker}@example.invalid`, roleId } }); userId = user.id;
    const register = await db.cashRegister.create({ data: { code: marker.toUpperCase(), name: marker, purpose: "RESTAURANT" } }); registerId = register.id;
    tableId = (await db.restaurantTable.create({ data: { registerId, name: "Table 1", seats: 4 } })).id;
    shiftId = (await db.registerShift.create({ data: { registerId, openedById: userId } })).id;
    categoryId = (await db.productCategory.create({ data: { name: `Ingredients ${marker}`, normalizedName: `ingredients ${marker}` } })).id;
    const coffee = await db.product.create({ data: { registerId, categoryId, sku: `${marker}-COF`, name: "Coffee beans", category: "Ingredients", retailPriceLaari: 1500, kind: "CONSUMABLE", quantityMetric: "g", quantityValue: 1000, servingSize: 25 } }); coffeeId = coffee.id;
    const eggs = await db.product.create({ data: { registerId, categoryId, sku: `${marker}-EGG`, name: "Eggs", category: "Ingredients", retailPriceLaari: 0, kind: "GOODS" } }); eggId = eggs.id;
    await db.inventoryBatch.createMany({ data: [
      { productId: coffeeId, registerId, receivedById: userId, receivedQuantity: 100, remainingQuantity: 100, expiryDate: day(-1) },
      { productId: coffeeId, registerId, receivedById: userId, receivedQuantity: 50, remainingQuantity: 50, expiryDate: null },
      { productId: coffeeId, registerId, receivedById: userId, receivedQuantity: 30, remainingQuantity: 30, expiryDate: day(1), receivedAt: day(-3) },
      { productId: coffeeId, registerId, receivedById: userId, receivedQuantity: 100, remainingQuantity: 100, expiryDate: day(30), receivedAt: day(-2) },
      { productId: eggId, registerId, receivedById: userId, receivedQuantity: 10, remainingQuantity: 10, expiryDate: day(7) },
    ] });
    const menu = await db.menuItem.create({ data: { registerId, name: "Breakfast coffee", category: "Breakfast", retailPriceLaari: 7500, ingredients: { create: [
      { productId: coffeeId, servingMultiplier: 2, standalone: true }, { productId: eggId, servingMultiplier: 2 },
    ] } } }); menuItemId = menu.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { actorId: userId } });
    await db.inventoryMovement.deleteMany({ where: { createdById: userId } });
    await db.bill.deleteMany({ where: { sale: { createdById: userId } } });
    await db.sale.deleteMany({ where: { createdById: userId } });
    await db.registerOrder.deleteMany({ where: { createdById: userId } });
    await db.menuItem.deleteMany({ where: { registerId } });
    await db.inventoryBatch.deleteMany({ where: { registerId } });
    await db.product.deleteMany({ where: { registerId } });
    await db.productCategory.deleteMany({ where: { id: categoryId } });
    await db.registerShift.deleteMany({ where: { registerId } });
    await db.restaurantTable.deleteMany({ where: { registerId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
    await db.$disconnect();
  });

  test("uses dated stock FEFO and ignores expired and undated batches", async () => {
    const before = await db.inventoryBatch.findMany({ where: { productId: coffeeId }, orderBy: { receivedAt: "asc" } });
    const sale = await recordSale(db, { shiftId, createdById: userId, paymentMethod: "CARD", items: [{ itemId: menuItemId, quantity: 1 }], audit: { actorLabel: marker } });
    expect(sale.totalLaari).toBe(7500);
    const after = await db.inventoryBatch.findMany({ where: { productId: coffeeId }, orderBy: { expiryDate: "asc" } });
    const expired = after.find((batch) => batch.expiryDate && batch.expiryDate < new Date());
    const undated = after.find((batch) => !batch.expiryDate);
    const soon = after.find((batch) => batch.expiryDate && Number(batch.receivedQuantity) === 30);
    const later = after.find((batch) => batch.expiryDate && Number(batch.receivedQuantity) === 100 && batch.expiryDate > new Date());
    expect(Number(expired?.remainingQuantity)).toBe(100);
    expect(Number(undated?.remainingQuantity)).toBe(50);
    expect(Number(soon?.remainingQuantity)).toBe(0);
    expect(Number(later?.remainingQuantity)).toBe(80);
    expect(before).toHaveLength(4);
    expect(Number((await db.inventoryBatch.aggregate({ where: { productId: eggId }, _sum: { remainingQuantity: true } }))._sum.remainingQuantity)).toBe(8);
    const stored = await db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    expect(stored.items[0].menuItemId).toBe(menuItemId);
    expect(stored.items[0].itemCategory).toBe("Breakfast");
  });

  test("rolls back every ingredient when usable stock is insufficient", async () => {
    const before = await db.inventoryBatch.findMany({ where: { registerId }, select: { id: true, remainingQuantity: true } });
    await expect(recordSale(db, { shiftId, createdById: userId, paymentMethod: "CASH", items: [{ itemId: menuItemId, quantity: 99 }], audit: { actorLabel: marker } })).rejects.toThrow("does not have enough usable stock");
    const after = await db.inventoryBatch.findMany({ where: { registerId }, select: { id: true, remainingQuantity: true } });
    expect(JSON.stringify(after.map((item) => `${item.id}:${item.remainingQuantity}`).sort())).toBe(JSON.stringify(before.map((item) => `${item.id}:${item.remainingQuantity}`).sort()));
  });

  test("sells a checked recipe ingredient as its own menu item", async () => {
    const before = await db.inventoryBatch.aggregate({
      where: { productId: coffeeId, expiryDate: { gte: day(0) } },
      _sum: { remainingQuantity: true },
    });
    const sale = await recordSale(db, {
      shiftId,
      createdById: userId,
      paymentMethod: "CASH",
      items: [{ itemId: coffeeId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    const after = await db.inventoryBatch.aggregate({
      where: { productId: coffeeId, expiryDate: { gte: day(0) } },
      _sum: { remainingQuantity: true },
    });
    expect(sale.totalLaari).toBe(1500);
    expect(Number(before._sum.remainingQuantity) - Number(after._sum.remainingQuantity)).toBe(25);
    const stored = await db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    expect(stored.items[0].productId).toBe(coffeeId);
    expect(stored.items[0].menuItemId).toBeNull();
  });

  test("assigns one open held bill to a restaurant table and releases it after payment", async () => {
    const order = await holdRegisterOrder(db, {
      shiftId,
      createdById: userId,
      restaurantTableId: tableId,
      customerNote: "Window guest",
      items: [{ itemId: menuItemId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    expect(order.restaurantTableId).toBe(tableId);

    await expect(holdRegisterOrder(db, {
      shiftId,
      createdById: userId,
      restaurantTableId: tableId,
      items: [{ itemId: menuItemId, quantity: 1 }],
      audit: { actorLabel: marker },
    })).rejects.toThrow("already has an open bill");

    await recordSale(db, {
      shiftId,
      createdById: userId,
      heldOrderId: order.id,
      paymentMethod: "CARD",
      items: [{ itemId: menuItemId, quantity: 1 }],
      audit: { actorLabel: marker },
    });

    const nextOrder = await holdRegisterOrder(db, {
      shiftId,
      createdById: userId,
      restaurantTableId: tableId,
      items: [{ itemId: menuItemId, quantity: 1 }],
      audit: { actorLabel: marker },
    });
    expect(nextOrder.status).toBe("HELD");
  });
});
