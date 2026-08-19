import "server-only";

import { cache } from "react";
import { Prisma, type InventoryMovementType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatHour, getBusinessDayRange, getMaldivesHour, shiftRange } from "@/lib/pos/dates";
import { maldivesDate, measuredPerServing, quantityNumber, stockUnitsFromMeasured } from "@/lib/pos/inventory";
import { fuzzySearchMatches, fuzzySearchScore } from "@/lib/pos/search";
import { getCustomerOptions } from "@/lib/pos/customers";

export type InventoryFilters = {
  query?: string;
  category?: string;
  register?: string;
  status?: "all" | "low" | "out" | "in";
  sort?: "recent" | "name" | "stock";
  page?: number;
};

function scopedRegisterWhere(registerIds: readonly string[] | null) {
  return registerIds ? { in: Array.from(registerIds) } : undefined;
}

function assertAuthorizedRegisterFilter(registerId: string | null | undefined, registerIds: readonly string[] | null) {
  if (registerId && registerIds && !registerIds.includes(registerId)) {
    throw new Error("UNAUTHORIZED_REGISTER_FILTER");
  }
}

export async function getInventoryData(filters: InventoryFilters = {}, authorizedIds: readonly string[] | null = null) {
  const scopedIds = scopedRegisterWhere(authorizedIds);
  const requestedRegisterId = filters.register && filters.register !== "all" ? filters.register : null;
  assertAuthorizedRegisterFilter(requestedRegisterId, authorizedIds);
  const [rawProducts, batchBalances, registers, categoryRecords] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, ...(scopedIds ? { registerId: scopedIds } : {}) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        registerId: true,
        categoryId: true,
        sku: true,
        barcode: true,
        name: true,
        category: true,
        description: true,
        retailPriceLaari: true,
        costPriceLaari: true,
        lowStockThreshold: true,
        kind: true,
        quantityMetric: true,
        quantityValue: true,
        servingSize: true,
        updatedAt: true,
        register: { select: { id: true, code: true, name: true, purpose: true } },
      },
    }),
    prisma.inventoryBatch.groupBy({
      by: ["productId"],
      where: { remainingQuantity: { gt: 0 }, product: { active: true }, ...(scopedIds ? { registerId: scopedIds } : {}) },
      _sum: { remainingQuantity: true },
    }),
    prisma.cashRegister.findMany({
      where: { active: true, ...(scopedIds ? { id: scopedIds } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, purpose: true },
    }),
    prisma.productCategory.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            products: scopedIds ? { where: { registerId: scopedIds } } : true,
          },
        },
      },
    }),
  ]);
  const balanceByProduct = new Map(
    batchBalances.map((balance) => [balance.productId, quantityNumber(balance._sum.remainingQuantity)]),
  );
  const allProducts = rawProducts.map((product) => {
    const measuredOnHand = balanceByProduct.get(product.id) ?? 0;
    return { ...product, measuredOnHand, stockQuantity: stockUnitsFromMeasured(product, measuredOnHand) };
  });

  const categories = categoryRecords.map((category) => ({
    id: category.id,
    name: category.name,
    productCount: category._count.products,
  }));
  const query = filters.query?.trim().toLocaleLowerCase();
  const category = filters.category && filters.category !== "all" ? filters.category : null;
  const status = filters.status ?? "all";
  const registerId = filters.register && filters.register !== "all" ? filters.register : null;

  const matching = allProducts.filter((product) => {
    if (query && !fuzzySearchMatches(query, [product.name, product.sku, product.barcode])) return false;
    if (category && product.category !== category) return false;
    if (registerId && product.registerId !== registerId) return false;
    if (status === "out" && product.stockQuantity !== 0) return false;
    if (status === "low" && !(product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold)) return false;
    if (status === "in" && product.stockQuantity <= product.lowStockThreshold) return false;
    return true;
  });

  matching.sort((left, right) => {
    if (query) {
      const relevance =
        (fuzzySearchScore(query, [left.name, left.sku, left.barcode]) ?? 0) -
        (fuzzySearchScore(query, [right.name, right.sku, right.barcode]) ?? 0);
      if (relevance !== 0) return relevance;
    }
    if (filters.sort === "name") return left.name.localeCompare(right.name);
    if (filters.sort === "stock") return left.stockQuantity - right.stockQuantity;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(Math.max(filters.page ?? 1, 1), pageCount);
  const pageProducts = matching.slice((page - 1) * pageSize, page * pageSize);
  const batches = pageProducts.length
    ? await prisma.inventoryBatch.findMany({
        where: { productId: { in: pageProducts.map((product) => product.id) }, remainingQuantity: { gt: 0 } },
        orderBy: { receivedAt: "asc" },
        select: {
          id: true,
          productId: true,
          remainingQuantity: true,
          expiryDate: true,
        },
      })
    : [];
  const batchesByProduct = new Map<string, typeof batches>();
  for (const batch of batches) {
    const productBatches = batchesByProduct.get(batch.productId) ?? [];
    productBatches.push(batch);
    batchesByProduct.set(batch.productId, productBatches);
  }

  return {
    products: pageProducts.map((product) => ({
      ...product,
      batches: batchesByProduct.get(product.id) ?? [],
    })),
    registers,
    categories,
    page,
    pageCount,
    total: matching.length,
    metrics: {
      inventoryValueLaari: allProducts.reduce(
        (total, product) => total + product.costPriceLaari * product.stockQuantity,
        0,
      ),
      activeSkus: allProducts.length,
      lowStock: allProducts.filter(
        (product) => product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold,
      ).length,
      outOfStock: allProducts.filter((product) => product.stockQuantity === 0).length,
    },
  };
}

export type StockFilters = {
  register?: string;
  query?: string;
  movement?: "all" | InventoryMovementType;
};

async function getStockDataExhaustive(filters: StockFilters = {}, authorizedIds: readonly string[] | null = null) {
  const registerId = filters.register && filters.register !== "all" ? filters.register : undefined;
  assertAuthorizedRegisterFilter(registerId, authorizedIds);
  const scopedIds = scopedRegisterWhere(authorizedIds);
  const query = filters.query?.trim();
  const movementType = filters.movement && filters.movement !== "all"
    ? filters.movement
    : undefined;
  const productWhere: Prisma.ProductWhereInput = {
    active: true,
    ...(registerId ? { registerId } : scopedIds ? { registerId: scopedIds } : {}),
  };
  const movementWhere: Prisma.InventoryMovementWhereInput = {
    ...(registerId ? { registerId } : scopedIds ? { registerId: scopedIds } : {}),
    ...(movementType ? { type: movementType } : {}),
  };

  const [registers, unfilteredProducts, unfilteredMovements, unfilteredMovementCount] = await Promise.all([
    prisma.cashRegister.findMany({
      where: { active: true, ...(scopedIds ? { id: scopedIds } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.product.findMany({
      where: productWhere,
      orderBy: [{ register: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        category: true,
        description: true,
        costPriceLaari: true,
        lowStockThreshold: true,
        kind: true,
        quantityMetric: true,
        quantityValue: true,
        servingSize: true,
        register: { select: { id: true, code: true, name: true, purpose: true } },
        batches: {
          where: { remainingQuantity: { gt: 0 } },
          orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
          select: { id: true, remainingQuantity: true, expiryDate: true },
        },
      },
    }),
    prisma.inventoryMovement.findMany({
      where: movementWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(!query ? { take: 100 } : {}),
      select: {
        id: true,
        type: true,
        quantityDelta: true,
        balanceAfter: true,
        reason: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            kind: true,
            quantityMetric: true,
            quantityValue: true,
            servingSize: true,
          },
        },
        register: { select: { id: true, code: true, name: true } },
        createdBy: { select: { name: true } },
        sale: { select: { receiptNumber: true } },
      },
    }),
    prisma.inventoryMovement.count({ where: movementWhere }),
  ]);

  const productMatches = unfilteredProducts
    .map((product) => ({
      product,
      score: query
        ? fuzzySearchScore(query, [
            product.name,
            product.sku,
            product.barcode,
            product.category,
            product.description,
            product.kind,
            product.register.name,
            product.register.code,
          ])
        : 0,
    }))
    .filter((match) => match.score !== null)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const products = productMatches.map((match) => {
    const measuredOnHand = match.product.batches.reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
    return { ...match.product, measuredOnHand, stockQuantity: stockUnitsFromMeasured(match.product, measuredOnHand) };
  });
  const movementMatches = unfilteredMovements
    .map((movement) => ({
      movement,
      score: query
        ? fuzzySearchScore(query, [
            movement.product.name,
            movement.product.sku,
            movement.register.name,
            movement.register.code,
            movement.type,
            movement.reason,
            movement.createdBy.name,
            movement.sale ? `Receipt ${movement.sale.receiptNumber}` : null,
            movement.quantityDelta,
            movement.balanceAfter,
          ])
        : 0,
    }))
    .filter((match) => match.score !== null)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const movementCount = query ? movementMatches.length : unfilteredMovementCount;
  const movements = movementMatches.slice(0, 100).map((match) => ({ ...match.movement, quantityDelta: quantityNumber(match.movement.quantityDelta), balanceAfter: quantityNumber(match.movement.balanceAfter) }));

  return {
    registers,
    products,
    movements,
    batches: products.flatMap((product) => product.batches.map((batch) => ({ ...batch, product: { id: product.id, name: product.name, sku: product.sku, kind: product.kind, quantityMetric: product.quantityMetric, quantityValue: product.quantityValue, servingSize: product.servingSize } }))),
    movementCount,
    metrics: {
      unitsOnHand: products.reduce((sum, product) => sum + product.stockQuantity, 0),
      stockValueLaari: products.reduce(
        (sum, product) => sum + product.costPriceLaari * product.stockQuantity,
        0,
      ),
      lowStock: products.filter(
        (product) => product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold,
      ).length,
      outOfStock: products.filter((product) => product.stockQuantity === 0).length,
    },
  };
}

const STOCK_CANDIDATE_LIMIT = 1_001;
const STOCK_RESULT_LIMIT = 100;

type StockDatabaseProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  description: string | null;
  costPriceLaari: number;
  lowStockThreshold: number;
  kind: "GOODS" | "CONSUMABLE";
  quantityMetric: string | null;
  quantityValue: string | number | null;
  servingSize: string | number | null;
  register: { id: string; code: string; name: string; purpose: "SHOP" | "RESTAURANT" };
  batches: Array<{
    id: string;
    remainingQuantity: string | number;
    expiryDate: string | null;
  }>;
  measuredOnHand: string | number;
  stockQuantity: string | number;
};

type StockDatabaseMovement = {
  id: string;
  type: InventoryMovementType;
  quantityDelta: string | number;
  balanceAfter: string | number;
  reason: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    kind: "GOODS" | "CONSUMABLE";
    quantityMetric: string | null;
    quantityValue: string | number | null;
    servingSize: string | number | null;
  };
  register: { id: string; code: string; name: string };
  createdBy: { name: string };
  sale: { receiptNumber: string } | null;
};

type StockDatabasePayload = {
  registers: Array<{ id: string; code: string; name: string }>;
  products: StockDatabaseProduct[];
  movements: StockDatabaseMovement[];
  movementCount: number;
  productCandidateCapHit: boolean;
  movementCandidateCapHit: boolean;
  metrics: {
    unitsOnHand: string | number;
    stockValueLaari: string | number;
    lowStock: number;
    outOfStock: number;
  };
};

function stockDecimal(value: string | number | null) {
  return value === null ? null : new Prisma.Decimal(String(value));
}

function hydrateStockPayload(payload: StockDatabasePayload) {
  return {
    ...payload,
    products: payload.products.map((product) => ({
      ...product,
      quantityValue: stockDecimal(product.quantityValue),
      servingSize: stockDecimal(product.servingSize),
      measuredOnHand: Number(product.measuredOnHand),
      stockQuantity: Number(product.stockQuantity),
      batches: product.batches.map((batch) => ({
        ...batch,
        remainingQuantity: stockDecimal(batch.remainingQuantity) ?? new Prisma.Decimal(0),
        expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
      })),
    })),
    movements: payload.movements.map((movement) => ({
      ...movement,
      quantityDelta: Number(movement.quantityDelta),
      balanceAfter: Number(movement.balanceAfter),
      createdAt: new Date(movement.createdAt),
      product: {
        ...movement.product,
        quantityValue: stockDecimal(movement.product.quantityValue),
        servingSize: stockDecimal(movement.product.servingSize),
      },
      sale: movement.sale ? { receiptNumber: BigInt(movement.sale.receiptNumber) } : null,
    })),
    metrics: {
      unitsOnHand: Number(payload.metrics.unitsOnHand),
      stockValueLaari: Number(payload.metrics.stockValueLaari),
      lowStock: Number(payload.metrics.lowStock),
      outOfStock: Number(payload.metrics.outOfStock),
    },
  };
}

export async function getStockData(filters: StockFilters = {}, authorizedIds: readonly string[] | null = null) {
  const registerId = filters.register && filters.register !== "all" ? filters.register : null;
  assertAuthorizedRegisterFilter(registerId, authorizedIds);
  if (authorizedIds) return getStockDataExhaustive(filters, authorizedIds);
  const query = filters.query?.trim() || null;
  const movementType = filters.movement && filters.movement !== "all"
    ? filters.movement
    : null;
  const rows = await prisma.$queryRaw<Array<{ payload: StockDatabasePayload }>>(Prisma.sql`
    SELECT public.stock_page_data(
      ${registerId}::UUID,
      ${movementType}::public."InventoryMovementType",
      ${query}::TEXT,
      ${STOCK_CANDIDATE_LIMIT}::INTEGER,
      ${STOCK_RESULT_LIMIT}::INTEGER
    ) AS payload
  `);
  const rawPayload = rows[0]?.payload;
  if (!rawPayload) throw new Error("The Stock database query returned no data.");
  const payload = hydrateStockPayload(rawPayload);

  if (query && (payload.productCandidateCapHit || payload.movementCandidateCapHit)) {
    console.warn(JSON.stringify({
      event: "stock_hybrid_search_fallback",
      queryLength: query.length,
      registerFiltered: Boolean(registerId),
      movementFiltered: Boolean(movementType),
      productCandidateCapHit: payload.productCandidateCapHit,
      movementCandidateCapHit: payload.movementCandidateCapHit,
    }));
    return getStockDataExhaustive(filters);
  }

  const productMatches = payload.products
    .map((product) => ({
      product,
      score: query
        ? fuzzySearchScore(query, [
            product.name,
            product.sku,
            product.barcode,
            product.category,
            product.description,
            product.kind,
            product.register.name,
            product.register.code,
          ])
        : 0,
    }))
    .filter((match) => match.score !== null)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const products = productMatches.map((match) => match.product);
  const movementMatches = payload.movements
    .map((movement) => ({
      movement,
      score: query
        ? fuzzySearchScore(query, [
            movement.product.name,
            movement.product.sku,
            movement.register.name,
            movement.register.code,
            movement.type,
            movement.reason,
            movement.createdBy.name,
            movement.sale ? `Receipt ${movement.sale.receiptNumber}` : null,
            movement.quantityDelta,
            movement.balanceAfter,
          ])
        : 0,
    }))
    .filter((match) => match.score !== null)
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const movements = movementMatches.slice(0, STOCK_RESULT_LIMIT).map((match) => match.movement);
  const metrics = query
    ? {
        unitsOnHand: products.reduce((sum, product) => sum + product.stockQuantity, 0),
        stockValueLaari: products.reduce(
          (sum, product) => sum + product.costPriceLaari * product.stockQuantity,
          0,
        ),
        lowStock: products.filter(
          (product) => product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold,
        ).length,
        outOfStock: products.filter((product) => product.stockQuantity === 0).length,
      }
    : payload.metrics;

  return {
    registers: payload.registers,
    products,
    movements,
    batches: products.flatMap((product) => product.batches.map((batch) => ({
      ...batch,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        kind: product.kind,
        quantityMetric: product.quantityMetric,
        quantityValue: product.quantityValue,
        servingSize: product.servingSize,
      },
    }))),
    movementCount: query ? movementMatches.length : payload.movementCount,
    metrics,
  };
}

export const getRegisterSummaries = cache(async (authorizedIds: readonly string[] | null = null) => {
  const scopedIds = scopedRegisterWhere(authorizedIds);
  const registers = await prisma.cashRegister.findMany({
    where: { active: true, ...(scopedIds ? { id: scopedIds } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      purpose: true,
      shifts: {
        where: { status: "OPEN" },
        orderBy: { openedAt: "desc" },
        take: 1,
        select: {
          id: true,
          openingCashLaari: true,
          openedAt: true,
          openedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
  const shiftIds = registers.flatMap((register) => register.shifts.map((shift) => shift.id));
  const salesByPayment = shiftIds.length
    ? await prisma.sale.groupBy({
        by: ["registerShiftId", "paymentMethod"],
        where: { registerShiftId: { in: shiftIds }, status: "COMPLETED" },
        _sum: { totalLaari: true },
        _count: { id: true },
      })
    : [];
  const totalsByShift = new Map<
    string,
    { salesLaari: number; cashSalesLaari: number; transactionCount: number }
  >();
  for (const aggregate of salesByPayment) {
    if (!aggregate.registerShiftId) continue;
    const totals = totalsByShift.get(aggregate.registerShiftId) ?? {
      salesLaari: 0,
      cashSalesLaari: 0,
      transactionCount: 0,
    };
    const salesLaari = aggregate._sum.totalLaari ?? 0;
    totals.salesLaari += salesLaari;
    totals.transactionCount += aggregate._count.id;
    if (aggregate.paymentMethod === "CASH") totals.cashSalesLaari += salesLaari;
    totalsByShift.set(aggregate.registerShiftId, totals);
  }

  return registers.map((register) => ({
    ...register,
    shifts: register.shifts.map((shift) => ({
      ...shift,
      ...(totalsByShift.get(shift.id) ?? {
        salesLaari: 0,
        cashSalesLaari: 0,
        transactionCount: 0,
      }),
    })),
  }));
});

type SellableItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  stockQuantity: number;
  retailPriceLaari: number;
  soldOutReason: string | null;
};

async function getSellableItems(register: { id: string; purpose: string }): Promise<SellableItem[]> {
  if (register.purpose === "SHOP") {
    const rows = await prisma.product.findMany({
      where: { active: true, registerId: register.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        retailPriceLaari: true,
        kind: true,
        quantityMetric: true,
        quantityValue: true,
        servingSize: true,
        batches: {
          where: { remainingQuantity: { gt: 0 } },
          select: { remainingQuantity: true, expiryDate: true },
        },
      },
    });
    const today = maldivesDate();
    return rows
      .map((product) => {
        const usable = product.batches
          .filter((batch) => !batch.expiryDate || batch.expiryDate >= today)
          .reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
        const available = Math.floor(stockUnitsFromMeasured(product, usable) + 0.000001);
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          stockQuantity: available,
          retailPriceLaari: product.retailPriceLaari,
          soldOutReason: available ? null : "Out of usable stock",
        };
      });
  }

  if (register.purpose === "RESTAURANT") {
    const today = maldivesDate();
    const [rows, standaloneProducts] = await Promise.all([
      prisma.menuItem.findMany({
        where: { registerId: register.id, active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          category: true,
          retailPriceLaari: true,
          ingredients: {
            select: {
              servingMultiplier: true,
              product: {
                select: {
                  name: true,
                  kind: true,
                  quantityMetric: true,
                  quantityValue: true,
                  servingSize: true,
                  batches: {
                    where: { remainingQuantity: { gt: 0 } },
                    select: { remainingQuantity: true, expiryDate: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.product.findMany({
        where: {
          registerId: register.id,
          active: true,
          menuIngredients: { some: { standalone: true } },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          retailPriceLaari: true,
          kind: true,
          quantityMetric: true,
          quantityValue: true,
          servingSize: true,
          batches: {
            where: { remainingQuantity: { gt: 0 } },
            select: { remainingQuantity: true, expiryDate: true },
          },
        },
      }),
    ]);
    const menuSellables = rows.map((item) => {
      if (!item.ingredients.length) {
        return {
          id: item.id,
          name: item.name,
          sku: null,
          category: item.category,
          stockQuantity: 0,
          retailPriceLaari: item.retailPriceLaari,
          soldOutReason: "Recipe is incomplete",
        };
      }
      let limiting: { count: number; reason: string | null } = {
        count: Number.MAX_SAFE_INTEGER,
        reason: null,
      };
      for (const ingredient of item.ingredients) {
        const usable = ingredient.product.batches
          .filter((batch) => batch.expiryDate && batch.expiryDate >= today)
          .reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
        const perItem = measuredPerServing(ingredient.product) * ingredient.servingMultiplier;
        const count = perItem > 0 ? Math.floor(usable / perItem + 0.000001) : 0;
        const hasUndated = ingredient.product.batches.some((batch) => !batch.expiryDate);
        const hasExpired = ingredient.product.batches.some(
          (batch) => batch.expiryDate && batch.expiryDate < today,
        );
        if (count < limiting.count) {
          limiting = {
            count,
            reason:
              count > 0
                ? null
                : `${ingredient.product.name}: ${hasUndated ? "expiry missing" : hasExpired ? "stock expired" : "insufficient stock"}`,
          };
        }
      }
      return {
        id: item.id,
        name: item.name,
        sku: null,
        category: item.category,
        stockQuantity: limiting.count,
        retailPriceLaari: item.retailPriceLaari,
        soldOutReason: limiting.count ? null : limiting.reason,
      };
    });
    const standaloneSellables = standaloneProducts.map((product) => {
      const usable = product.batches
        .filter((batch) => batch.expiryDate && batch.expiryDate >= today)
        .reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
      const perItem = measuredPerServing(product);
      const available = perItem > 0 ? Math.floor(usable / perItem + 0.000001) : 0;
      const hasUndated = product.batches.some((batch) => !batch.expiryDate);
      const hasExpired = product.batches.some(
        (batch) => batch.expiryDate && batch.expiryDate < today,
      );
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        stockQuantity: available,
        retailPriceLaari: product.retailPriceLaari,
        soldOutReason: available
          ? null
          : hasUndated
            ? "Expiry missing"
            : hasExpired
              ? "Stock expired"
              : "Insufficient stock",
      };
    });
    return [...menuSellables, ...standaloneSellables].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  return [];
}

export async function getRegistersData(selectedRegisterId?: string, authorizedIds: readonly string[] | null = null) {
  assertAuthorizedRegisterFilter(selectedRegisterId, authorizedIds);
  const registers = await getRegisterSummaries(authorizedIds);
  const selected =
    registers.find((register) => register.id === selectedRegisterId) ??
    registers.find((register) => register.shifts.length > 0) ??
    registers[0] ??
    null;
  const selectedShiftId = selected?.shifts[0]?.id;

  const [recentSales, products] = await Promise.all([
    selectedShiftId
      ? prisma.sale.findMany({
          where: { registerShiftId: selectedShiftId, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { _count: { select: { items: true } } },
        })
      : Promise.resolve([]),
    selected ? getSellableItems(selected) : Promise.resolve([]),
  ]);

  const openShifts = registers.flatMap((register) => register.shifts);
  const activeShiftSalesLaari = openShifts.reduce(
    (sum, shift) => sum + shift.salesLaari,
    0,
  );
  const cashOnHandLaari = openShifts.reduce(
    (sum, shift) => sum + shift.openingCashLaari + shift.cashSalesLaari,
    0,
  );

  return {
    registers,
    selected,
    selectedShift: selected?.shifts[0] ?? null,
    recentSales,
    products,
    metrics: {
      openRegisters: openShifts.length,
      totalRegisters: registers.length,
      activeShiftSalesLaari,
      cashOnHandLaari,
    },
  };
}

export async function getRegisterManagementData(registerId: string, receiptId?: string, authorizedIds: readonly string[] | null = null) {
  assertAuthorizedRegisterFilter(registerId, authorizedIds);
  const registers = await getRegisterSummaries(authorizedIds);
  const register = registers.find((candidate) => candidate.id === registerId) ?? null;
  if (!register) return null;

  const shift = register.shifts[0] ?? null;
  const [items, lastSale, heldOrders, receipt, restaurantTables, creditCustomers] = await Promise.all([
    getSellableItems(register),
    shift
      ? prisma.sale.findFirst({
          where: { registerShiftId: shift.id, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          select: { id: true, receiptNumber: true, totalLaari: true, createdAt: true },
        })
      : Promise.resolve(null),
    shift
      ? prisma.registerOrder.findMany({
          where: { registerShiftId: shift.id, status: "HELD" },
          orderBy: { heldAt: "desc" },
          take: 20,
          select: {
            id: true,
            customerNote: true,
            paymentMethod: true,
            restaurantTableId: true,
            restaurantTable: { select: { name: true } },
            totalLaari: true,
            heldAt: true,
            bill: { select: { id: true, billNumber: true, version: true, status: true } },
            items: {
              orderBy: { id: "asc" },
              select: { productId: true, menuItemId: true, quantity: true },
            },
          },
        })
      : Promise.resolve([]),
    receiptId
      ? prisma.sale.findFirst({
          where: {
            id: receiptId,
            status: "COMPLETED",
            registerShift: { registerId },
          },
          select: {
            id: true,
            receiptNumber: true,
            subtotalLaari: true,
            totalLaari: true,
            paymentMethod: true,
            createdAt: true,
            createdBy: { select: { name: true } },
            bill: { select: { billNumber: true, status: true } },
            items: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                productName: true,
                productSku: true,
                quantity: true,
                unitPriceLaari: true,
                lineTotalLaari: true,
              },
            },
          },
        })
      : Promise.resolve(null),
    register.purpose === "RESTAURANT"
      ? prisma.restaurantTable.findMany({
          where: { registerId, active: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            seats: true,
            orders: {
              where: { status: "HELD" },
              take: 1,
              select: { id: true },
            },
          },
        })
      : Promise.resolve([]),
    getCustomerOptions(),
  ]);

  return {
    register,
    shift,
    items,
    lastSale,
    receipt: receipt
      ? {
          ...receipt,
          receiptNumber: receipt.receiptNumber.toString(),
          bill: receipt.bill ? { ...receipt.bill, billNumber: receipt.bill.billNumber.toString() } : null,
          createdAt: receipt.createdAt.toISOString(),
        }
      : null,
    restaurantTables: restaurantTables.map((table) => ({
      id: table.id,
      name: table.name,
      seats: table.seats,
      occupiedOrderId: table.orders[0]?.id ?? null,
    })),
    creditCustomers,
    heldOrders: heldOrders.map((order) => ({
      ...order,
      bill: order.bill ? { ...order.bill, billNumber: order.bill.billNumber.toString() } : null,
      items: order.items.flatMap((item) => {
        const itemId = item.productId ?? item.menuItemId;
        return itemId ? [{ itemId, quantity: item.quantity }] : [];
      }),
    })),
  };
}

export async function getSidebarRegisters(authorizedIds: readonly string[] | null = null) {
  const registers = await getRegisterSummaries(authorizedIds);
  return registers.map((register) => {
    const shift = register.shifts[0];
    return {
      id: register.id,
      code: register.code,
      name: register.name,
      isOpen: Boolean(shift),
      salesLaari: shift?.salesLaari ?? 0,
    };
  });
}

export async function getOverviewData(authorizedIds: readonly string[] | null = null) {
  const scopedIds = scopedRegisterWhere(authorizedIds);
  const saleScope = scopedIds ? { registerShift: { registerId: scopedIds } } : {};
  const today = getBusinessDayRange();
  const yesterday = shiftRange(today, -1);
  const lastWeek = shiftRange(today, -7);

  const [todaySales, yesterdaySales, lastWeekSales, todayRefunds, registers] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: today.start, lt: today.end }, ...saleScope },
      select: {
        totalLaari: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            menuItemId: true,
            productName: true,
            itemCategory: true,
            quantity: true,
            lineTotalLaari: true,
          },
        },
      },
    }),
    prisma.sale.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: yesterday.start, lt: yesterday.end }, ...saleScope },
      _sum: { totalLaari: true },
      _count: { _all: true },
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: lastWeek.start, lt: lastWeek.end }, ...saleScope },
      select: { totalLaari: true, createdAt: true },
    }),
    prisma.sale.aggregate({
      where: { status: "REFUNDED", refundedAt: { gte: today.start, lt: today.end }, ...saleScope },
      _sum: { totalLaari: true },
      _count: { _all: true },
    }),
    getRegisterSummaries(authorizedIds),
  ]);

  const netSalesLaari = todaySales.reduce((sum, sale) => sum + sale.totalLaari, 0);
  const yesterdaySalesLaari = yesterdaySales._sum.totalLaari ?? 0;
  const productTotals = new Map<string, { name: string; units: number; salesLaari: number }>();
  const categoryTotals = new Map<string, number>();

  for (const sale of todaySales) {
    for (const item of sale.items) {
      const itemId = item.productId ?? item.menuItemId ?? item.productName;
      const product = productTotals.get(itemId) ?? { name: item.productName, units: 0, salesLaari: 0 };
      product.units += item.quantity;
      product.salesLaari += item.lineTotalLaari;
      productTotals.set(itemId, product);
      categoryTotals.set(
        item.itemCategory,
        (categoryTotals.get(item.itemCategory) ?? 0) + item.lineTotalLaari,
      );
    }
  }

  const hourly = Array.from({ length: 13 }, (_, index) => {
    const hour = index + 8;
    const todayTotal = todaySales
      .filter((sale) => getMaldivesHour(sale.createdAt) === hour)
      .reduce((sum, sale) => sum + sale.totalLaari, 0);
    const lastWeekTotal = lastWeekSales
      .filter((sale) => getMaldivesHour(sale.createdAt) === hour)
      .reduce((sum, sale) => sum + sale.totalLaari, 0);
    return { time: formatHour(hour), today: todayTotal / 100, lastWeek: lastWeekTotal / 100 };
  });

  return {
    metrics: {
      netSalesLaari,
      previousSalesLaari: yesterdaySalesLaari,
      orders: todaySales.length,
      previousOrders: yesterdaySales._count._all,
      averageOrderLaari: todaySales.length ? Math.round(netSalesLaari / todaySales.length) : 0,
      refunds: todayRefunds._count._all,
      refundsLaari: todayRefunds._sum.totalLaari ?? 0,
    },
    hourly,
    topProducts: [...productTotals.values()]
      .sort((left, right) => right.salesLaari - left.salesLaari)
      .slice(0, 5),
    categoryMix: [...categoryTotals]
      .map(([label, salesLaari]) => ({
        label,
        salesLaari,
        percentage: netSalesLaari ? Math.round((salesLaari / netSalesLaari) * 100) : 0,
      }))
      .sort((left, right) => right.salesLaari - left.salesLaari),
    registerPulse: registers
      .filter((register) => register.shifts[0])
      .map((register) => ({
        id: register.id,
        name: register.name,
        salesLaari: register.shifts[0].salesLaari,
      }))
      .sort((left, right) => right.salesLaari - left.salesLaari),
  };
}
