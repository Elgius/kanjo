import { afterAll, beforeAll, expect, test } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("generated product SKUs", () => {
  let db: PrismaClient;
  let createProductWithGeneratedSku: typeof import("@/lib/pos/products").createProductWithGeneratedSku;
  let registerId = "";
  let categoryId = "";
  const marker = `generated-product-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ createProductWithGeneratedSku } = await import("@/lib/pos/products"));
    registerId = (await db.cashRegister.create({
      data: { code: marker.toUpperCase(), name: marker },
    })).id;
    categoryId = (await db.productCategory.create({
      data: { name: marker, normalizedName: marker },
    })).id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.product.deleteMany({ where: { registerId } });
    await db.productCategory.deleteMany({ where: { id: categoryId } });
    await db.cashRegister.deleteMany({ where: { id: registerId } });
    await db.$disconnect();
  });

  test("allocates consecutive unique SKUs for simultaneous creates", async () => {
    const base = {
      registerId,
      categoryId,
      category: marker,
      retailPriceLaari: 100,
    };
    const created = await Promise.all([
      db.$transaction((tx) => createProductWithGeneratedSku(tx, { ...base, name: `${marker}-one` })),
      db.$transaction((tx) => createProductWithGeneratedSku(tx, { ...base, name: `${marker}-two` })),
    ]);
    const numbers = created
      .map((product) => Number(product.sku.replace("SKU-", "")))
      .sort((left, right) => left - right);

    expect(created[0]?.sku === created[1]?.sku).toBe(false);
    expect(created.every((product) => /^SKU-\d{6,}$/.test(product.sku))).toBe(true);
    expect(numbers[1] - numbers[0]).toBe(1);
  });
});
