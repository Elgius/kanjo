import "server-only";

import type { PaymentMethod, SaleStatus, ShiftStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SessionTransaction = {
  id: string;
  receiptNumber: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  subtotalLaari: number;
  totalLaari: number;
  createdAt: string;
  cashierName: string;
  hasSavedBill: boolean;
  items: Array<{
    id: string;
    productName: string;
    productSku: string | null;
    itemCategory: string;
    quantity: number;
    unitPriceLaari: number;
    lineTotalLaari: number;
  }>;
};

export async function getSessionRegisters() {
  const registers = await prisma.cashRegister.findMany({
    where: { active: true },
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

export async function getRegisterSessions(registerId: string) {
  if (!uuidPattern.test(registerId)) return null;

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

export async function getRegisterSession(registerId: string, sessionId: string) {
  if (!uuidPattern.test(registerId) || !uuidPattern.test(sessionId)) return null;

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
    transactions: session.sales.map<SessionTransaction>((sale) => ({
      id: sale.id,
      receiptNumber: sale.receiptNumber.toString(),
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      subtotalLaari: sale.subtotalLaari,
      totalLaari: sale.totalLaari,
      createdAt: sale.createdAt.toISOString(),
      cashierName: sale.createdBy.name,
      hasSavedBill: Boolean(sale.bill),
      items: sale.items,
    })),
  };
}

export function shiftStatusLabel(status: ShiftStatus) {
  return status === "OPEN" ? "Open" : "Closed";
}
