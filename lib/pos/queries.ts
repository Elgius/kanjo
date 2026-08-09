import "server-only";

import { prisma } from "@/lib/db";
import { formatHour, getBusinessDayRange, getMaldivesHour, shiftRange } from "@/lib/pos/dates";

export type InventoryFilters = {
  query?: string;
  category?: string;
  status?: "all" | "low" | "out" | "in";
  sort?: "recent" | "name" | "stock";
  page?: number;
};

export async function getInventoryData(filters: InventoryFilters = {}) {
  const allProducts = await prisma.product.findMany({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
  });

  const categories = [...new Set(allProducts.map((product) => product.category))].sort();
  const query = filters.query?.trim().toLocaleLowerCase();
  const category = filters.category && filters.category !== "all" ? filters.category : null;
  const status = filters.status ?? "all";

  const matching = allProducts.filter((product) => {
    const searchable = `${product.name} ${product.sku} ${product.barcode ?? ""}`.toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (category && product.category !== category) return false;
    if (status === "out" && product.stockQuantity !== 0) return false;
    if (status === "low" && !(product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold)) return false;
    if (status === "in" && product.stockQuantity <= product.lowStockThreshold) return false;
    return true;
  });

  matching.sort((left, right) => {
    if (filters.sort === "name") return left.name.localeCompare(right.name);
    if (filters.sort === "stock") return left.stockQuantity - right.stockQuantity;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(Math.max(filters.page ?? 1, 1), pageCount);

  return {
    products: matching.slice((page - 1) * pageSize, page * pageSize),
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

  const [recentSales, products] = await Promise.all([
    selectedShiftId
      ? prisma.sale.findMany({
          where: { registerShiftId: selectedShiftId, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { _count: { select: { items: true } } },
        })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { active: true, stockQuantity: { gt: 0 } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, stockQuantity: true, retailPriceLaari: true },
    }),
  ]);

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
            productName: true,
            quantity: true,
            lineTotalLaari: true,
            product: { select: { category: true } },
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
      const product = productTotals.get(item.productId) ?? { name: item.productName, units: 0, salesLaari: 0 };
      product.units += item.quantity;
      product.salesLaari += item.lineTotalLaari;
      productTotals.set(item.productId, product);
      categoryTotals.set(
        item.product.category,
        (categoryTotals.get(item.product.category) ?? 0) + item.lineTotalLaari,
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
