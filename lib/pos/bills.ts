import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export const BILL_PAGE_SIZE = 25;

export type BillHistoryFilters = {
  query?: string;
  registerId?: string;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  timeFrom?: string;
  dateTo?: string;
  timeTo?: string;
};

export type BillCursor = { soldAt: string; id: string };

export type BillItemSnapshot = {
  id: string;
  productName: string;
  productSku: string | null;
  itemCategory: string;
  quantity: number;
  unitPriceLaari: number;
  lineTotalLaari: number;
};

export type BillHistoryRow = {
  id: string;
  saleId: string;
  receiptNumber: string;
  registerId: string;
  registerName: string;
  registerCode: string;
  cashierName: string;
  paymentMethod: PaymentMethod;
  subtotalLaari: number;
  totalLaari: number;
  items: BillItemSnapshot[];
  soldAt: string;
};

export type BillHistoryPage = {
  bills: BillHistoryRow[];
  nextCursor: BillCursor | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function sanitizeBillFilters(filters: BillHistoryFilters): BillHistoryFilters {
  const query = filters.query?.trim().slice(0, 100);
  const paymentMethod = ["CASH", "CARD", "MOBILE"].includes(filters.paymentMethod ?? "")
    ? filters.paymentMethod
    : undefined;
  return {
    query: query || undefined,
    registerId: filters.registerId && uuidPattern.test(filters.registerId) ? filters.registerId : undefined,
    paymentMethod,
    dateFrom: filters.dateFrom && datePattern.test(filters.dateFrom) ? filters.dateFrom : undefined,
    timeFrom: filters.timeFrom && timePattern.test(filters.timeFrom) ? filters.timeFrom : undefined,
    dateTo: filters.dateTo && datePattern.test(filters.dateTo) ? filters.dateTo : undefined,
    timeTo: filters.timeTo && timePattern.test(filters.timeTo) ? filters.timeTo : undefined,
  };
}

function maldivesBoundary(date: string, time: string, end: boolean) {
  const seconds = end ? ":59.999" : ":00.000";
  const value = new Date(`${date}T${time}${seconds}+05:00`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

function billWhere(rawFilters: BillHistoryFilters): Prisma.BillWhereInput {
  const filters = sanitizeBillFilters(rawFilters);
  const AND: Prisma.BillWhereInput[] = [];
  if (filters.registerId) AND.push({ registerId: filters.registerId });
  if (filters.paymentMethod) AND.push({ paymentMethod: filters.paymentMethod });

  const soldAt: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) {
    soldAt.gte = maldivesBoundary(filters.dateFrom, filters.timeFrom ?? "00:00", false);
  }
  if (filters.dateTo) {
    soldAt.lte = maldivesBoundary(filters.dateTo, filters.timeTo ?? "23:59", true);
  }
  if (soldAt.gte || soldAt.lte) AND.push({ soldAt });

  if (filters.query) {
    const OR: Prisma.BillWhereInput[] = [
      { cashierName: { contains: filters.query, mode: "insensitive" } },
      { registerName: { contains: filters.query, mode: "insensitive" } },
      { registerCode: { contains: filters.query, mode: "insensitive" } },
    ];
    if (/^\d{1,18}$/.test(filters.query)) OR.push({ receiptNumber: BigInt(filters.query) });
    AND.push({ OR });
  }
  return AND.length ? { AND } : {};
}

function parseBillItems(value: Prisma.JsonValue): BillItemSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, Prisma.JsonValue>;
    if (
      typeof item.productName !== "string" ||
      typeof item.itemCategory !== "string" ||
      typeof item.quantity !== "number" ||
      typeof item.unitPriceLaari !== "number" ||
      typeof item.lineTotalLaari !== "number"
    ) return [];
    return [{
      id: typeof item.id === "string" ? item.id : `item-${index}`,
      productName: item.productName,
      productSku: typeof item.productSku === "string" ? item.productSku : null,
      itemCategory: item.itemCategory,
      quantity: item.quantity,
      unitPriceLaari: item.unitPriceLaari,
      lineTotalLaari: item.lineTotalLaari,
    }];
  });
}

function serializeBill(bill: {
  id: string;
  saleId: string;
  receiptNumber: bigint;
  registerId: string;
  registerName: string;
  registerCode: string;
  cashierName: string;
  paymentMethod: PaymentMethod;
  subtotalLaari: number;
  totalLaari: number;
  items: Prisma.JsonValue;
  soldAt: Date;
}): BillHistoryRow {
  return {
    ...bill,
    receiptNumber: bill.receiptNumber.toString(),
    items: parseBillItems(bill.items),
    soldAt: bill.soldAt.toISOString(),
  };
}

export async function getBillHistoryPage(
  rawFilters: BillHistoryFilters,
  cursor?: BillCursor | null,
): Promise<BillHistoryPage> {
  const where = billWhere(rawFilters);
  const cursorDate = cursor ? new Date(cursor.soldAt) : null;
  const cursorWhere: Prisma.BillWhereInput | undefined = cursor && cursorDate && !Number.isNaN(cursorDate.getTime()) && uuidPattern.test(cursor.id)
    ? {
        OR: [
          { soldAt: { lt: cursorDate } },
          { soldAt: cursorDate, id: { lt: cursor.id } },
        ],
      }
    : undefined;

  const rows = await prisma.bill.findMany({
    where: cursorWhere ? { AND: [where, cursorWhere] } : where,
    orderBy: [{ soldAt: "desc" }, { id: "desc" }],
    take: BILL_PAGE_SIZE + 1,
  });
  const hasMore = rows.length > BILL_PAGE_SIZE;
  const visible = rows.slice(0, BILL_PAGE_SIZE);
  const last = visible.at(-1);
  return {
    bills: visible.map(serializeBill),
    nextCursor: hasMore && last ? { soldAt: last.soldAt.toISOString(), id: last.id } : null,
  };
}

export async function getBillHistoryOverview(rawFilters: BillHistoryFilters) {
  const filters = sanitizeBillFilters(rawFilters);
  const where = billWhere(filters);
  const [page, aggregate, registers] = await Promise.all([
    getBillHistoryPage(filters),
    prisma.bill.aggregate({ where, _count: true, _sum: { totalLaari: true } }),
    prisma.cashRegister.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, active: true },
    }),
  ]);
  return {
    filters,
    page,
    totalBills: aggregate._count,
    totalLaari: aggregate._sum.totalLaari ?? 0,
    registers,
  };
}
