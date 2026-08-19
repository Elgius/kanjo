import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { BillRevisionKind, BillStatus, PaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { parseBillSnapshot, type BillSnapshot } from "@/lib/pos/bill-revisions";

export const BILL_PAGE_SIZE = 25;

export type BillHistoryFilters = {
  query?: string;
  registerId?: string;
  paymentMethod?: PaymentMethod;
  status?: BillStatus;
  dateFrom?: string;
  timeFrom?: string;
  dateTo?: string;
  timeTo?: string;
};

export type BillCursor = { openedAt: string; id: string };

export type BillHistoryRevision = {
  id: string;
  revision: number;
  kind: BillRevisionKind;
  actorName: string;
  changes: string[];
  snapshot: BillSnapshot | null;
  createdAt: string;
};

export type BillHistoryRow = {
  id: string;
  billNumber: string;
  saleId: string | null;
  receiptNumber: string | null;
  status: BillStatus;
  registerId: string;
  registerName: string;
  registerCode: string;
  cashierName: string;
  openedByName: string;
  paidByName: string | null;
  paymentMethod: PaymentMethod;
  subtotalLaari: number;
  totalLaari: number;
  items: BillSnapshot["items"];
  customerNote: string | null;
  restaurantTableName: string | null;
  openedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  revisions: BillHistoryRevision[];
};

export type BillHistoryPage = { bills: BillHistoryRow[]; nextCursor: BillCursor | null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function sanitizeBillFilters(filters: BillHistoryFilters): BillHistoryFilters {
  const query = filters.query?.trim().slice(0, 100);
  const paymentMethod = ["CASH", "CARD", "MOBILE"].includes(filters.paymentMethod ?? "") ? filters.paymentMethod : undefined;
  const status = ["UNPAID", "PAID", "AMENDED", "REVERSED", "CANCELLED"].includes(filters.status ?? "") ? filters.status : undefined;
  return {
    query: query || undefined,
    registerId: filters.registerId && uuidPattern.test(filters.registerId) ? filters.registerId : undefined,
    paymentMethod,
    status,
    dateFrom: filters.dateFrom && datePattern.test(filters.dateFrom) ? filters.dateFrom : undefined,
    timeFrom: filters.timeFrom && timePattern.test(filters.timeFrom) ? filters.timeFrom : undefined,
    dateTo: filters.dateTo && datePattern.test(filters.dateTo) ? filters.dateTo : undefined,
    timeTo: filters.timeTo && timePattern.test(filters.timeTo) ? filters.timeTo : undefined,
  };
}

function maldivesBoundary(date: string, time: string, end: boolean) {
  const value = new Date(`${date}T${time}${end ? ":59.999" : ":00.000"}+05:00`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

function billWhere(rawFilters: BillHistoryFilters, authorizedRegisterIds: readonly string[] | null): Prisma.BillWhereInput {
  const filters = sanitizeBillFilters(rawFilters);
  if (filters.registerId && authorizedRegisterIds && !authorizedRegisterIds.includes(filters.registerId)) throw new Error("UNAUTHORIZED_REGISTER_FILTER");
  const AND: Prisma.BillWhereInput[] = [];
  if (authorizedRegisterIds) AND.push({ registerId: { in: Array.from(authorizedRegisterIds) } });
  if (filters.registerId) AND.push({ registerId: filters.registerId });
  if (filters.paymentMethod) AND.push({ paymentMethod: filters.paymentMethod });
  if (filters.status) AND.push({ status: filters.status });
  const openedAt: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) openedAt.gte = maldivesBoundary(filters.dateFrom, filters.timeFrom ?? "00:00", false);
  if (filters.dateTo) openedAt.lte = maldivesBoundary(filters.dateTo, filters.timeTo ?? "23:59", true);
  if (openedAt.gte || openedAt.lte) AND.push({ openedAt });
  if (filters.query) {
    const OR: Prisma.BillWhereInput[] = [
      { cashierName: { contains: filters.query, mode: "insensitive" } },
      { openedByName: { contains: filters.query, mode: "insensitive" } },
      { paidByName: { contains: filters.query, mode: "insensitive" } },
      { registerName: { contains: filters.query, mode: "insensitive" } },
      { registerCode: { contains: filters.query, mode: "insensitive" } },
    ];
    if (/^\d{1,18}$/.test(filters.query)) {
      const number = BigInt(filters.query);
      OR.push({ billNumber: number }, { receiptNumber: number });
    }
    AND.push({ OR });
  }
  return AND.length ? { AND } : {};
}

function stringChanges(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function queryBills(where: Prisma.BillWhereInput, take: number) {
  return prisma.bill.findMany({
    where,
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    take,
    include: { revisions: { orderBy: { revision: "asc" } } },
  });
}

function serializeBill(bill: Awaited<ReturnType<typeof queryBills>>[number]): BillHistoryRow {
  const current = parseBillSnapshot({
    items: bill.items,
    subtotalLaari: bill.subtotalLaari,
    totalLaari: bill.totalLaari,
    paymentMethod: bill.paymentMethod,
    customerNote: bill.customerNote,
    restaurantTableId: bill.restaurantTableId,
    restaurantTableName: bill.restaurantTableName,
  } as unknown as Prisma.JsonValue);
  return {
    id: bill.id,
    billNumber: bill.billNumber.toString(),
    saleId: bill.saleId,
    receiptNumber: bill.receiptNumber?.toString() ?? null,
    status: bill.status,
    registerId: bill.registerId,
    registerName: bill.registerName,
    registerCode: bill.registerCode,
    cashierName: bill.cashierName,
    openedByName: bill.openedByName,
    paidByName: bill.paidByName,
    paymentMethod: bill.paymentMethod,
    subtotalLaari: bill.subtotalLaari,
    totalLaari: bill.totalLaari,
    items: current?.items ?? [],
    customerNote: bill.customerNote,
    restaurantTableName: bill.restaurantTableName,
    openedAt: bill.openedAt.toISOString(),
    paidAt: bill.paidAt?.toISOString() ?? null,
    cancelledAt: bill.cancelledAt?.toISOString() ?? null,
    revisions: bill.revisions.map((revision) => ({
      id: revision.id,
      revision: revision.revision,
      kind: revision.kind,
      actorName: revision.actorName,
      changes: stringChanges(revision.changes),
      snapshot: parseBillSnapshot(revision.snapshot),
      createdAt: revision.createdAt.toISOString(),
    })),
  };
}

export async function getBillHistoryPage(rawFilters: BillHistoryFilters, cursor?: BillCursor | null, authorizedRegisterIds: readonly string[] | null = null): Promise<BillHistoryPage> {
  const where = billWhere(rawFilters, authorizedRegisterIds);
  const cursorDate = cursor ? new Date(cursor.openedAt) : null;
  const cursorWhere: Prisma.BillWhereInput | undefined = cursor && cursorDate && !Number.isNaN(cursorDate.getTime()) && uuidPattern.test(cursor.id)
    ? { OR: [{ openedAt: { lt: cursorDate } }, { openedAt: cursorDate, id: { lt: cursor.id } }] }
    : undefined;
  const rows = await queryBills(cursorWhere ? { AND: [where, cursorWhere] } : where, BILL_PAGE_SIZE + 1);
  const visible = rows.slice(0, BILL_PAGE_SIZE);
  const last = visible.at(-1);
  return {
    bills: visible.map(serializeBill),
    nextCursor: rows.length > BILL_PAGE_SIZE && last ? { openedAt: last.openedAt.toISOString(), id: last.id } : null,
  };
}

export async function getBillHistoryOverview(rawFilters: BillHistoryFilters, authorizedRegisterIds: readonly string[] | null = null) {
  const filters = sanitizeBillFilters(rawFilters);
  const where = billWhere(filters, authorizedRegisterIds);
  const [page, totalBills, paidAggregate, registers] = await Promise.all([
    getBillHistoryPage(filters, null, authorizedRegisterIds),
    prisma.bill.count({ where }),
    prisma.bill.aggregate({ where: { AND: [where, { status: { in: ["PAID", "AMENDED"] } }] }, _sum: { totalLaari: true } }),
    prisma.cashRegister.findMany({
      where: authorizedRegisterIds ? { id: { in: Array.from(authorizedRegisterIds) } } : undefined,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, active: true },
    }),
  ]);
  return { filters, page, totalBills, totalLaari: paidAggregate._sum.totalLaari ?? 0, registers };
}
