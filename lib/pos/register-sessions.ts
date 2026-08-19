import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { BillRevisionKind, BillStatus, PaymentMethod, ShiftStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { parseBillSnapshot, type BillSnapshot } from "@/lib/pos/bill-revisions";
import { summarizeSessionDetails } from "@/lib/pos/session-details";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SessionTransaction = {
  id: string;
  version: number;
  saleId: string | null;
  billNumber: string;
  receiptNumber: string | null;
  status: BillStatus;
  paymentMethod: PaymentMethod;
  subtotalLaari: number;
  totalLaari: number;
  openedAt: string;
  cashierName: string;
  items: Array<BillSnapshot["items"][number] & { saleItemId: string | null; stockTrackedQuantity: number }>;
  revisions: Array<{ id: string; revision: number; kind: BillRevisionKind; actorName: string; changes: string[]; createdAt: string }>;
};

export async function getSessionRegisters(authorizedRegisterIds: readonly string[] | null = null) {
  const registers = await prisma.cashRegister.findMany({
    where: { active: true, ...(authorizedRegisterIds ? { id: { in: Array.from(authorizedRegisterIds) } } : {}) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      purpose: true,
      _count: { select: { shifts: true } },
      shifts: {
        orderBy: { openedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          openedAt: true,
          closedAt: true,
          openedBy: { select: { name: true } },
        },
      },
    },
  });

  return {
    registers,
    metrics: {
      registers: registers.length,
      openSessions: registers.filter((register) => register.shifts[0]?.status === "OPEN").length,
      totalSessions: registers.reduce((total, register) => total + register._count.shifts, 0),
    },
  };
}

export async function getRegisterSessions(registerId: string, authorizedRegisterIds: readonly string[] | null = null) {
  if (!uuidPattern.test(registerId)) return null;
  if (authorizedRegisterIds && !authorizedRegisterIds.includes(registerId)) return null;

  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, active: true },
    select: {
      id: true,
      code: true,
      name: true,
      purpose: true,
      shifts: {
        orderBy: { openedAt: "desc" },
        select: {
          id: true,
          status: true,
          openingCashLaari: true,
          closingCashLaari: true,
          openedAt: true,
          closedAt: true,
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!register) return null;

  const shiftIds = register.shifts.map((shift) => shift.id);
  const sales = shiftIds.length
    ? await prisma.sale.groupBy({
        by: ["registerShiftId", "status", "paymentMethod"],
        where: { registerShiftId: { in: shiftIds } },
        _count: { id: true },
        _sum: { totalLaari: true },
      })
    : [];
  const totalsByShift = new Map<string, { completedSalesLaari: number; cashSalesLaari: number; transactionCount: number; refundedCount: number }>();

  for (const aggregate of sales) {
    const totals = totalsByShift.get(aggregate.registerShiftId) ?? {
      completedSalesLaari: 0,
      cashSalesLaari: 0,
      transactionCount: 0,
      refundedCount: 0,
    };
    if (aggregate.status === "COMPLETED") {
      totals.completedSalesLaari += aggregate._sum.totalLaari ?? 0;
      totals.transactionCount += aggregate._count.id;
      if (aggregate.paymentMethod === "CASH") {
        totals.cashSalesLaari += aggregate._sum.totalLaari ?? 0;
      }
    } else if (aggregate.status === "REFUNDED") {
      totals.refundedCount += aggregate._count.id;
    }
    totalsByShift.set(aggregate.registerShiftId, totals);
  }

  return {
    ...register,
    shifts: register.shifts.map((shift) => ({
      ...shift,
      ...(totalsByShift.get(shift.id) ?? {
        completedSalesLaari: 0,
        cashSalesLaari: 0,
        transactionCount: 0,
        refundedCount: 0,
      }),
    })),
  };
}

export async function getRegisterSession(registerId: string, sessionId: string, authorizedRegisterIds: readonly string[] | null = null) {
  if (!uuidPattern.test(registerId) || !uuidPattern.test(sessionId)) return null;
  if (authorizedRegisterIds && !authorizedRegisterIds.includes(registerId)) return null;

  const session = await prisma.registerShift.findFirst({
    where: { id: sessionId, registerId, register: { active: true } },
    select: {
      id: true,
      status: true,
      openingCashLaari: true,
      closingCashLaari: true,
      openedAt: true,
      closedAt: true,
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      register: { select: { id: true, code: true, name: true, purpose: true } },
      sales: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          receiptNumber: true,
          status: true,
          paymentMethod: true,
          subtotalLaari: true,
          totalLaari: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          bill: { select: { id: true } },
          items: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              productName: true,
              productSku: true,
              itemCategory: true,
              quantity: true,
              unitPriceLaari: true,
              lineTotalLaari: true,
            },
          },
        },
      },
      bills: {
        orderBy: { openedAt: "desc" },
        select: {
          id: true,
          version: true,
          saleId: true,
          billNumber: true,
          receiptNumber: true,
          status: true,
          paymentMethod: true,
          subtotalLaari: true,
          totalLaari: true,
          items: true,
          customerNote: true,
          restaurantTableId: true,
          restaurantTableName: true,
          openedAt: true,
          openedByName: true,
          sale: {
            select: {
              items: {
                orderBy: { id: "asc" },
                select: {
                  id: true, productId: true, menuItemId: true, productName: true, productSku: true,
                  itemCategory: true, quantity: true, unitPriceLaari: true, lineTotalLaari: true,
                  stockComponents: { select: { productId: true, measuredPerItem: true } },
                  inventoryConsumptions: { select: { productId: true, consumedQuantity: true, restoredQuantity: true, retiredQuantity: true } },
                },
              },
            },
          },
          revisions: { orderBy: { revision: "asc" }, select: { id: true, revision: true, kind: true, actorName: true, changes: true, createdAt: true } },
        },
      },
    },
  });
  if (!session) return null;

  const completed = session.sales.filter((sale) => sale.status === "COMPLETED");
  const cashSalesLaari = completed.reduce(
    (total, sale) => total + (sale.paymentMethod === "CASH" ? sale.totalLaari : 0),
    0,
  );
  const expectedCashLaari = session.openingCashLaari + cashSalesLaari;

  return {
    ...session,
    metrics: {
      completedSalesLaari: completed.reduce((total, sale) => total + sale.totalLaari, 0),
      completedTransactions: completed.length,
      expectedCashLaari,
      varianceLaari:
        session.closingCashLaari === null ? null : session.closingCashLaari - expectedCashLaari,
    },
    details: summarizeSessionDetails(session.sales),
    transactions: session.bills.map<SessionTransaction>((bill) => {
      const snapshot = parseBillSnapshot({
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
        version: bill.version,
        saleId: bill.saleId,
        billNumber: bill.billNumber.toString(),
        receiptNumber: bill.receiptNumber?.toString() ?? null,
        status: bill.status,
        paymentMethod: bill.paymentMethod,
        subtotalLaari: bill.subtotalLaari,
        totalLaari: bill.totalLaari,
        openedAt: bill.openedAt.toISOString(),
        cashierName: bill.openedByName,
        items: bill.sale?.items.length
          ? bill.sale.items.filter((item) => item.quantity > 0).map((item) => ({
              saleItemId: item.id,
              productId: item.productId,
              menuItemId: item.menuItemId,
              productName: item.productName,
              productSku: item.productSku,
              itemCategory: item.itemCategory,
              quantity: item.quantity,
              unitPriceLaari: item.unitPriceLaari,
              lineTotalLaari: item.lineTotalLaari,
              stockTrackedQuantity: item.stockComponents.length
                ? Math.max(0, Math.floor(Math.min(...item.stockComponents.map((component) => {
                    const active = item.inventoryConsumptions
                      .filter((entry) => entry.productId === component.productId)
                      .reduce((total, entry) => total + Number(entry.consumedQuantity) - Number(entry.restoredQuantity) - Number(entry.retiredQuantity), 0);
                    return active / Number(component.measuredPerItem);
                  })) + 0.0004))
                : item.quantity,
            }))
          : (snapshot?.items ?? []).map((item) => ({ ...item, saleItemId: null, stockTrackedQuantity: 0 })),
        revisions: bill.revisions.map((revision) => ({
          ...revision,
          changes: Array.isArray(revision.changes) ? revision.changes.filter((change): change is string => typeof change === "string") : [],
          createdAt: revision.createdAt.toISOString(),
        })),
      };
    }),
  };
}

export function shiftStatusLabel(status: ShiftStatus) {
  return status === "OPEN" ? "Open" : "Closed";
}
