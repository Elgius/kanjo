import "server-only";

import type { InventoryMovementType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatHour, getBusinessDayRange, getMaldivesHour, shiftRange } from "@/lib/pos/dates";
import { maldivesDate, measuredPerServing, quantityNumber, stockUnitsFromMeasured } from "@/lib/pos/inventory";
import { fuzzySearchMatches, fuzzySearchScore } from "@/lib/pos/search";

export type InventoryFilters = {
  query?: string;
  category?: string;
  register?: string;
  status?: "all" | "low" | "out" | "in";
  sort?: "recent" | "name" | "stock";
  page?: number;
};

export async function getInventoryData(filters: InventoryFilters = {}) {
  const [rawProducts, registers] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
      include: { register: { select: { id: true, code: true, name: true, purpose: true } }, batches: { where: { remainingQuantity: { gt: 0 } }, orderBy: { receivedAt: "asc" } } },
    }),
    prisma.cashRegister.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, purpose: true },
    }),
  ]);
  const allProducts = rawProducts.map((product) => {
    const measuredOnHand = product.batches.reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
    return { ...product, measuredOnHand, stockQuantity: stockUnitsFromMeasured(product, measuredOnHand) };
  });

  const categories = [...new Set(allProducts.map((product) => product.category))].sort();
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

  return {
    products: matching.slice((page - 1) * pageSize, page * pageSize),
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

export async function getStockData(filters: StockFilters = {}) {
  const registerId = filters.register && filters.register !== "all" ? filters.register : undefined;
  const query = filters.query?.trim();
  const movementType = filters.movement && filters.movement !== "all"
    ? filters.movement
    : undefined;
  const productWhere: Prisma.ProductWhereInput = {
    active: true,
    ...(registerId ? { registerId } : {}),
  };
  const movementWhere: Prisma.InventoryMovementWhereInput = {
    ...(registerId ? { registerId } : {}),
    ...(movementType ? { type: movementType } : {}),
  };

  const [registers, unfilteredProducts, unfilteredMovements, unfilteredMovementCount] = await Promise.all([
    prisma.cashRegister.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.product.findMany({
      where: productWhere,
      orderBy: [{ register: { name: "asc" } }, { name: "asc" }],
      include: { register: { select: { id: true, code: true, name: true, purpose: true } }, batches: { where: { remainingQuantity: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }] } },
    }),
    prisma.inventoryMovement.findMany({
      where: movementWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(!query ? { take: 100 } : {}),
      include: {
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

const registerWithOpenShift = {
  shifts: {
    where: { status: "OPEN" as const },
    orderBy: { openedAt: "desc" as const },
    take: 1,
    include: {
      openedBy: { select: { name: true } },
      sales: {
        where: { status: "COMPLETED" as const },
        select: { totalLaari: true, paymentMethod: true },
      },
    },
  },
};

export async function getRegistersData(selectedRegisterId?: string) {
  const registers = await prisma.cashRegister.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: registerWithOpenShift,
  });
  const selected =
    registers.find((register) => register.id === selectedRegisterId) ??
    registers.find((register) => register.shifts.length > 0) ??
    registers[0] ??
    null;
  const selectedShiftId = selected?.shifts[0]?.id;

  const recentSales = await (
    selectedShiftId
      ? prisma.sale.findMany({
          where: { registerShiftId: selectedShiftId, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { _count: { select: { items: true } } },
        })
      : Promise.resolve([])
  );
  let products: Array<{ id: string; name: string; sku: string | null; stockQuantity: number; retailPriceLaari: number; soldOutReason: string | null }> = [];
  if (selected?.purpose === "SHOP") {
    const rows = await prisma.product.findMany({ where: { active: true, registerId: selected.id }, orderBy: { name: "asc" }, include: { batches: { where: { remainingQuantity: { gt: 0 } } } } });
    const today = maldivesDate();
    products = rows.map((product) => {
      const usable = product.batches.filter((batch) => !batch.expiryDate || batch.expiryDate >= today).reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
      const available = Math.floor(stockUnitsFromMeasured(product, usable) + 0.000001);
      return { id: product.id, name: product.name, sku: product.sku, stockQuantity: available, retailPriceLaari: product.retailPriceLaari, soldOutReason: available ? null : "Out of usable stock" };
    }).filter((product) => product.stockQuantity > 0);
  } else if (selected?.purpose === "RESTAURANT") {
    const today = maldivesDate();
    const rows = await prisma.menuItem.findMany({ where: { registerId: selected.id, active: true }, orderBy: { name: "asc" }, include: { ingredients: { include: { product: { include: { batches: { where: { remainingQuantity: { gt: 0 } } } } } } } } });
    products = rows.map((item) => {
      if (!item.ingredients.length) return { id: item.id, name: item.name, sku: null, stockQuantity: 0, retailPriceLaari: item.retailPriceLaari, soldOutReason: "Recipe is incomplete" };
      let limiting: { count: number; reason: string | null } = { count: Number.MAX_SAFE_INTEGER, reason: null };
      for (const ingredient of item.ingredients) {
        const usable = ingredient.product.batches.filter((batch) => batch.expiryDate && batch.expiryDate >= today).reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
        const perItem = measuredPerServing(ingredient.product) * ingredient.servingMultiplier;
        const count = perItem > 0 ? Math.floor(usable / perItem + 0.000001) : 0;
        const hasUndated = ingredient.product.batches.some((batch) => !batch.expiryDate);
        const hasExpired = ingredient.product.batches.some((batch) => batch.expiryDate && batch.expiryDate < today);
        if (count < limiting.count) limiting = { count, reason: count > 0 ? null : `${ingredient.product.name}: ${hasUndated ? "expiry missing" : hasExpired ? "stock expired" : "insufficient stock"}` };
      }
      return { id: item.id, name: item.name, sku: null, stockQuantity: limiting.count, retailPriceLaari: item.retailPriceLaari, soldOutReason: limiting.count ? null : limiting.reason };
    });
  }

  const openShifts = registers.flatMap((register) => register.shifts);
  const activeShiftSalesLaari = openShifts.reduce(
    (sum, shift) => sum + shift.sales.reduce((shiftSum, sale) => shiftSum + sale.totalLaari, 0),
    0,
  );
  const cashOnHandLaari = openShifts.reduce(
    (sum, shift) =>
      sum +
      shift.openingCashLaari +
      shift.sales
        .filter((sale) => sale.paymentMethod === "CASH")
        .reduce((cash, sale) => cash + sale.totalLaari, 0),
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

export async function getSidebarRegisters() {
  const registers = await prisma.cashRegister.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: registerWithOpenShift,
  });
  return registers.map((register) => {
    const shift = register.shifts[0];
    return {
      id: register.id,
      code: register.code,
      name: register.name,
      isOpen: Boolean(shift),
      salesLaari: shift?.sales.reduce((sum, sale) => sum + sale.totalLaari, 0) ?? 0,
    };
  });
}

export async function getOverviewData() {
  const today = getBusinessDayRange();
  const yesterday = shiftRange(today, -1);
  const lastWeek = shiftRange(today, -7);

  const [todaySales, yesterdaySales, lastWeekSales, todayRefunds, registers] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: today.start, lt: today.end } },
      select: {
        totalLaari: true,
        createdAt: true,
        registerShiftId: true,
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
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: yesterday.start, lt: yesterday.end } },
      select: { totalLaari: true },
    }),
    prisma.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: lastWeek.start, lt: lastWeek.end } },
      select: { totalLaari: true, createdAt: true },
    }),
    prisma.sale.findMany({
      where: { status: "REFUNDED", refundedAt: { gte: today.start, lt: today.end } },
      select: { totalLaari: true },
    }),
    prisma.cashRegister.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: registerWithOpenShift,
    }),
  ]);

  const netSalesLaari = todaySales.reduce((sum, sale) => sum + sale.totalLaari, 0);
  const yesterdaySalesLaari = yesterdaySales.reduce((sum, sale) => sum + sale.totalLaari, 0);
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
      previousOrders: yesterdaySales.length,
      averageOrderLaari: todaySales.length ? Math.round(netSalesLaari / todaySales.length) : 0,
      refunds: todayRefunds.length,
      refundsLaari: todayRefunds.reduce((sum, sale) => sum + sale.totalLaari, 0),
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
        salesLaari: register.shifts[0].sales.reduce((sum, sale) => sum + sale.totalLaari, 0),
      }))
      .sort((left, right) => right.salesLaari - left.salesLaari),
  };
}
