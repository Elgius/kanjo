import { afterAll, beforeAll, expect, test } from "bun:test";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("Neon Stock query and hybrid search", () => {
  let db: PrismaClient;
  let getStockData: typeof import("@/lib/pos/queries").getStockData;
  const marker = `stock-search-${crypto.randomUUID()}`;
  let roleId = "";
  let userId = "";
  let registerId = "";
  let shiftId = "";
  let saleId = "";
  let goodsId = "";
  let consumableId = "";
  let suppliesCategoryId = "";
  let ingredientsCategoryId = "";

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ getStockData } = await import("@/lib/pos/queries"));

    roleId = (await db.role.create({ data: { name: marker, normalizedName: marker } })).id;
    userId = crypto.randomUUID();
    await db.user.create({
      data: { id: userId, name: "Stock Search Actor", email: `${marker}@example.invalid`, roleId },
    });
    registerId = (await db.cashRegister.create({
      data: { code: marker.toUpperCase(), name: "Stock Search Register" },
    })).id;
    shiftId = (await db.registerShift.create({
      data: { registerId, openedById: userId, openingCashLaari: 0 },
    })).id;
    saleId = (await db.sale.create({
      data: {
        registerShiftId: shiftId,
        createdById: userId,
        paymentMethod: "CASH",
        subtotalLaari: 500,
        totalLaari: 500,
      },
    })).id;
    suppliesCategoryId = (await db.productCategory.create({
      data: { name: `Supplies ${marker}`, normalizedName: `supplies ${marker}` },
    })).id;
    ingredientsCategoryId = (await db.productCategory.create({
      data: { name: `Ingredients ${marker}`, normalizedName: `ingredients ${marker}` },
    })).id;
    goodsId = (await db.product.create({
      data: {
        registerId,
        sku: `${marker}-GOODS`,
        name: "Staple Goods",
        category: "Supplies",
        categoryId: suppliesCategoryId,
        retailPriceLaari: 250,
        costPriceLaari: 100,
        lowStockThreshold: 5,
      },
    })).id;
    consumableId = (await db.product.create({
      data: {
        registerId,
        sku: `${marker}-CONS`,
        name: "Coffee Concentrate",
        category: "Ingredients",
        categoryId: ingredientsCategoryId,
        retailPriceLaari: 500,
        costPriceLaari: 200,
        lowStockThreshold: 1,
        kind: "CONSUMABLE",
        quantityMetric: "ml",
        quantityValue: 1000,
        servingSize: 50,
      },
    })).id;

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const nextMonth = new Date();
    nextMonth.setUTCDate(nextMonth.getUTCDate() + 30);
    await db.inventoryBatch.createMany({ data: [
      { productId: goodsId, registerId, receivedById: userId, receivedQuantity: 2, remainingQuantity: 2, expiryDate: yesterday },
      { productId: goodsId, registerId, receivedById: userId, receivedQuantity: 2, remainingQuantity: 2, expiryDate: nextMonth },
      { productId: goodsId, registerId, receivedById: userId, receivedQuantity: 3, remainingQuantity: 0 },
      { productId: consumableId, registerId, receivedById: userId, receivedQuantity: 500, remainingQuantity: 500 },
    ] });
    await db.inventoryMovement.createMany({ data: [
      { productId: goodsId, registerId, createdById: userId, type: "INITIAL", quantityDelta: 5, balanceAfter: 5, reason: "Opening stock" },
      { productId: goodsId, registerId, createdById: userId, type: "ADJUSTMENT", quantityDelta: -1, balanceAfter: 4, reason: "Damaged package" },
      { productId: consumableId, registerId, saleId, createdById: userId, type: "SALE", quantityDelta: -250, balanceAfter: 250, reason: "Receipt sale" },
      { productId: consumableId, registerId, saleId, createdById: userId, type: "REFUND", quantityDelta: 250, balanceAfter: 500, reason: "Customer refund" },
    ] });
  });

  afterAll(async () => {
    if (!db) return;
    await db.inventoryMovement.deleteMany({ where: { registerId } });
    await db.inventoryBatch.deleteMany({ where: { registerId } });
    await db.sale.deleteMany({ where: { id: saleId } });
    await db.product.deleteMany({ where: { registerId } });
    await db.productCategory.deleteMany({ where: { id: { in: [suppliesCategoryId, ingredientsCategoryId] } } });
    await db.registerShift.deleteMany({ where: { id: shiftId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.role.deleteMany({ where: { id: roleId } });
  });

  test("aggregates stock and returns deterministic filtered movement data", async () => {
    const data = await getStockData({ register: registerId });
    expect(data.products).toHaveLength(2);
    expect(data.batches).toHaveLength(3);
    expect(data.metrics.unitsOnHand).toBe(4.5);
    expect(data.metrics.stockValueLaari).toBe(500);
    expect(data.metrics.lowStock).toBe(2);
    expect(data.metrics.outOfStock).toBe(0);
    expect(data.movementCount).toBe(4);
    expect(data.movements).toHaveLength(4);

    const adjustments = await getStockData({ register: registerId, movement: "ADJUSTMENT" });
    expect(adjustments.movementCount).toBe(1);
    expect(adjustments.movements[0]?.reason).toBe("Damaged package");
  });

  test("uses PostgreSQL candidates and preserves the existing fuzzy matcher", async () => {
    const productResult = await getStockData({ register: registerId, query: "stple" });
    expect(productResult.products.some((product) => product.id === goodsId)).toBe(true);

    const reasonResult = await getStockData({ register: registerId, query: "damagd" });
    expect(reasonResult.movements.some((movement) => movement.reason === "Damaged package")).toBe(true);

    const receipt = await db.sale.findUniqueOrThrow({ where: { id: saleId }, select: { receiptNumber: true } });
    const receiptResult = await getStockData({ register: registerId, query: `receipt ${receipt.receiptNumber}` });
    expect(receiptResult.movements.some((movement) => movement.sale?.receiptNumber === receipt.receiptNumber)).toBe(true);
  });

  test("refreshes indexed search documents when related labels change", async () => {
    await db.product.update({ where: { id: goodsId }, data: { name: "Renamed Staple" } });
    await db.cashRegister.update({ where: { id: registerId }, data: { name: "Renamed Stock Register" } });
    await db.user.update({ where: { id: userId }, data: { name: "Renamed Stock Actor" } });

    const [product, movement] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: goodsId }, select: { searchText: true } }),
      db.inventoryMovement.findFirstOrThrow({ where: { productId: goodsId }, select: { searchText: true } }),
    ]);
    expect(product.searchText.includes("renamed staple")).toBe(true);
    expect(product.searchText.includes("renamed stock register")).toBe(true);
    expect(movement.searchText.includes("renamed stock actor")).toBe(true);

    const data = await getStockData({ register: registerId, query: "renamd staple" });
    expect(data.products.some((item) => item.id === goodsId)).toBe(true);
    expect(data.movements.some((item) => item.product.id === goodsId)).toBe(true);
  });

  test("bounds normal candidates and falls back when the compatibility cap is reached", async () => {
    await db.inventoryMovement.createMany({
      data: Array.from({ length: 1_001 }, (_, index) => ({
        productId: goodsId,
        registerId,
        createdById: userId,
        type: "ADJUSTMENT" as const,
        quantityDelta: 1,
        balanceAfter: 5 + index,
        reason: `${marker} compatibility candidate ${index}`,
      })),
    });

    const [row] = await db.$queryRaw<Array<{
      payload: { movements: unknown[]; movementCandidateCapHit: boolean };
    }>>(Prisma.sql`
      SELECT public.stock_page_data(
        ${registerId}::UUID,
        ${null}::public."InventoryMovementType",
        ${marker}::TEXT,
        ${1_001}::INTEGER,
        ${100}::INTEGER
      ) AS payload
    `);
    expect(row?.payload.movements).toHaveLength(1_001);
    expect(row?.payload.movementCandidateCapHit).toBe(true);

    const originalWarn = console.warn;
    let warningCount = 0;
    console.warn = () => { warningCount += 1; };
    try {
      const data = await getStockData({ register: registerId, query: marker });
      expect(data.movementCount).toBe(1_005);
      expect(data.movements).toHaveLength(100);
      expect(warningCount > 0).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  }, 15_000);
});
