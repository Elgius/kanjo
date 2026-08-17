import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";
import { prisma } from "@/lib/db";
import { measured } from "@/lib/pos/inventory";
import {
  deductRequirements,
  PosError,
  prepareSaleInventory,
  type SaleLine,
} from "@/lib/pos/sales";

export type CreditBillItem = SaleLine;

function parseCreditBillItems(value: Prisma.JsonValue): CreditBillItem[] {
  if (!Array.isArray(value)) throw new PosError("This customer bill has invalid item data.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PosError("This customer bill has invalid item data.");
    }
    const item = entry as Record<string, Prisma.JsonValue>;
    if (
      typeof item.productName !== "string" ||
      typeof item.itemCategory !== "string" ||
      typeof item.quantity !== "number" ||
      typeof item.unitPriceLaari !== "number" ||
      typeof item.lineTotalLaari !== "number"
    ) {
      throw new PosError("This customer bill has invalid item data.");
    }
    return {
      ...(typeof item.productId === "string" ? { productId: item.productId } : {}),
      ...(typeof item.menuItemId === "string" ? { menuItemId: item.menuItemId } : {}),
      productName: item.productName,
      productSku: typeof item.productSku === "string" ? item.productSku : null,
      itemCategory: item.itemCategory,
      quantity: item.quantity,
      unitPriceLaari: item.unitPriceLaari,
      lineTotalLaari: item.lineTotalLaari,
    };
  });
}

function snapshotItems(lines: SaleLine[]) {
  return lines.map((line) => ({
    productId: line.productId ?? null,
    menuItemId: line.menuItemId ?? null,
    productName: line.productName,
    productSku: line.productSku,
    itemCategory: line.itemCategory,
    quantity: line.quantity,
    unitPriceLaari: line.unitPriceLaari,
    lineTotalLaari: line.lineTotalLaari,
  }));
}

export async function issueCustomerCredit(
  db: PrismaClient,
  input: {
    shiftId: string;
    customerId: string;
    createdById: string;
    heldOrderId?: string | null;
    note?: string | null;
    items: ReadonlyArray<{ itemId: string; quantity: number }>;
    audit: { actorLabel: string; request?: AuditRequestContext };
  },
) {
  return db.$transaction(async (tx) => {
    const [shift, customer] = await Promise.all([
      tx.registerShift.findFirst({
        where: { id: input.shiftId, status: "OPEN" },
        select: {
          id: true,
          registerId: true,
          register: { select: { purpose: true, name: true, code: true } },
        },
      }),
      tx.customer.findFirst({
        where: { id: input.customerId, active: true },
        select: { id: true, name: true, creditLimitLaari: true },
      }),
    ]);
    if (!shift) throw new PosError("The selected register does not have an open shift.");
    if (!customer) throw new PosError("Select an active customer for this credit bill.");

    const [{ lines, requirements }, outstanding] = await Promise.all([
      prepareSaleInventory(tx, shift, input.items),
      tx.customerCreditBill.aggregate({
        where: { customerId: customer.id, status: "OUTSTANDING" },
        _sum: { totalLaari: true },
      }),
    ]);
    const totalLaari = lines.reduce((total, line) => total + line.lineTotalLaari, 0);
    const outstandingLaari = outstanding._sum.totalLaari ?? 0;
    if (outstandingLaari + totalLaari > customer.creditLimitLaari) {
      throw new PosError(`${customer.name} does not have enough available credit for this bill.`);
    }

    const deductions = await deductRequirements(
      tx,
      requirements,
      shift.register.purpose === "SHOP",
    );
    const creditBill = await tx.customerCreditBill.create({
      data: {
        customerId: customer.id,
        registerId: shift.registerId,
        issuedShiftId: shift.id,
        createdById: input.createdById,
        subtotalLaari: totalLaari,
        totalLaari,
        items: snapshotItems(lines),
        note: input.note?.trim().slice(0, 500) || null,
      },
      select: { id: true, customerId: true, totalLaari: true },
    });

    for (const requirement of requirements) {
      const aggregate = await tx.inventoryBatch.aggregate({
        where: { productId: requirement.productId, remainingQuantity: { gt: 0 } },
        _sum: { remainingQuantity: true },
      });
      const batchSummary = (deductions.get(requirement.productId) ?? [])
        .map((entry) => `${entry.batchId}:${entry.quantity}`)
        .join(", ");
      await tx.inventoryMovement.create({
        data: {
          productId: requirement.productId,
          registerId: shift.registerId,
          customerCreditBillId: creditBill.id,
          createdById: input.createdById,
          type: "SALE",
          quantityDelta: measured(-requirement.measuredQuantity),
          balanceAfter: aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0),
          reason: `Customer credit bill ${creditBill.id.slice(0, 8).toUpperCase()} · batches ${batchSummary}`,
        },
      });
    }

    if (input.heldOrderId) {
      const converted = await tx.registerOrder.updateMany({
        where: {
          id: input.heldOrderId,
          registerShiftId: shift.id,
          status: "HELD",
        },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (converted.count !== 1) throw new PosError("That held bill is no longer available.");
    }

    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS",
        event: "CUSTOMER_CREDIT_ISSUE",
        page: "REGISTERS",
        actorId: input.createdById,
        actorLabel: input.audit.actorLabel,
        targetType: "customer_credit_bill",
        targetId: creditBill.id,
        summary: `Credit bill issued to ${customer.name}.`,
        metadata: {
          customerId: customer.id,
          registerId: shift.registerId,
          shiftId: shift.id,
          totalLaari,
          outstandingBeforeLaari: outstandingLaari,
          creditLimitLaari: customer.creditLimitLaari,
          convertedHeldOrderId: input.heldOrderId ?? null,
        },
        request: input.audit.request,
      }),
    });
    return creditBill;
  }, { isolationLevel: "Serializable" });
}

export async function settleCustomerCredit(
  db: PrismaClient,
  input: {
    creditBillId: string;
    settledById: string;
    cashierName: string;
    paymentMethod: PaymentMethod;
    audit: { actorLabel: string; request?: AuditRequestContext };
  },
) {
  return db.$transaction(async (tx) => {
    const creditBill = await tx.customerCreditBill.findFirst({
      where: { id: input.creditBillId, status: "OUTSTANDING", customer: { active: true } },
      select: {
        id: true,
        customerId: true,
        registerId: true,
        subtotalLaari: true,
        totalLaari: true,
        items: true,
        customer: { select: { name: true } },
        register: { select: { name: true, code: true } },
      },
    });
    if (!creditBill) throw new PosError("That customer bill is no longer outstanding.");
    const shift = await tx.registerShift.findFirst({
      where: { registerId: creditBill.registerId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    });
    if (!shift) {
      throw new PosError(`Open ${creditBill.register.name} before recording this payment.`);
    }
    const items = parseCreditBillItems(creditBill.items);
    const sale = await tx.sale.create({
      data: {
        registerShiftId: shift.id,
        createdById: input.settledById,
        paymentMethod: input.paymentMethod,
        subtotalLaari: creditBill.subtotalLaari,
        totalLaari: creditBill.totalLaari,
        items: { create: items },
      },
      select: { id: true, receiptNumber: true, createdAt: true },
    });
    await tx.bill.create({
      data: {
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        registerId: creditBill.registerId,
        registerName: creditBill.register.name,
        registerCode: creditBill.register.code,
        cashierName: input.cashierName,
        paymentMethod: input.paymentMethod,
        subtotalLaari: creditBill.subtotalLaari,
        totalLaari: creditBill.totalLaari,
        items: items.map((item, index) => ({
          id: `${sale.id}:${index + 1}`,
          productName: item.productName,
          productSku: item.productSku,
          itemCategory: item.itemCategory,
          quantity: item.quantity,
          unitPriceLaari: item.unitPriceLaari,
          lineTotalLaari: item.lineTotalLaari,
        })),
        soldAt: sale.createdAt,
      },
    });
    const paidAt = new Date();
    const updated = await tx.customerCreditBill.updateMany({
      where: { id: creditBill.id, status: "OUTSTANDING" },
      data: {
        status: "PAID",
        saleId: sale.id,
        settledShiftId: shift.id,
        settledById: input.settledById,
        paidAt,
      },
    });
    if (updated.count !== 1) throw new PosError("That customer bill changed. Try again.");
    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS",
        event: "CUSTOMER_CREDIT_SETTLE",
        page: "CUSTOMERS",
        actorId: input.settledById,
        actorLabel: input.audit.actorLabel,
        targetType: "customer_credit_bill",
        targetId: creditBill.id,
        summary: `Customer credit bill paid by ${creditBill.customer.name}.`,
        metadata: {
          customerId: creditBill.customerId,
          registerId: creditBill.registerId,
          settledShiftId: shift.id,
          saleId: sale.id,
          receiptNumber: sale.receiptNumber,
          totalLaari: creditBill.totalLaari,
          paymentMethod: input.paymentMethod,
        },
        request: input.audit.request,
      }),
    });
    return sale;
  }, { isolationLevel: "Serializable" });
}

export async function getCustomerOptions() {
  const customers = await prisma.customer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      creditLimitLaari: true,
      creditBills: {
        where: { status: "OUTSTANDING" },
        select: { totalLaari: true },
      },
    },
  });
  return customers.map((customer) => {
    const outstandingLaari = customer.creditBills.reduce((total, bill) => total + bill.totalLaari, 0);
    return {
      id: customer.id,
      name: customer.name,
      creditLimitLaari: customer.creditLimitLaari,
      outstandingLaari,
      availableCreditLaari: Math.max(0, customer.creditLimitLaari - outstandingLaari),
    };
  });
}

export async function getCustomersOverview() {
  const customers = await prisma.customer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      nationality: true,
      creditLimitLaari: true,
      updatedAt: true,
      creditBills: {
        where: { status: "OUTSTANDING" },
        select: { totalLaari: true },
      },
    },
  });
  const rows = customers.map((customer) => {
    const outstandingLaari = customer.creditBills.reduce((total, bill) => total + bill.totalLaari, 0);
    return {
      ...customer,
      outstandingLaari,
      availableCreditLaari: Math.max(0, customer.creditLimitLaari - outstandingLaari),
      atLimit: outstandingLaari >= customer.creditLimitLaari,
    };
  });
  return {
    customers: rows,
    metrics: {
      customers: rows.length,
      outstandingLaari: rows.reduce((total, customer) => total + customer.outstandingLaari, 0),
      availableCreditLaari: rows.reduce((total, customer) => total + customer.availableCreditLaari, 0),
      atLimit: rows.filter((customer) => customer.atLimit).length,
    },
  };
}

export async function getCustomerDetail(customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, active: true },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      phoneNumber: true,
      nationality: true,
      creditLimitLaari: true,
      creditBills: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          status: true,
          subtotalLaari: true,
          totalLaari: true,
          items: true,
          note: true,
          issuedAt: true,
          paidAt: true,
          register: { select: { id: true, name: true, code: true } },
          createdBy: { select: { name: true } },
          sale: { select: { receiptNumber: true, paymentMethod: true } },
        },
      },
    },
  });
  if (!customer) return null;
  const bills = customer.creditBills.map((bill) => ({
    ...bill,
    items: parseCreditBillItems(bill.items),
    receiptNumber: bill.sale?.receiptNumber.toString() ?? null,
  }));
  const outstandingLaari = bills.reduce(
    (total, bill) => total + (bill.status === "OUTSTANDING" ? bill.totalLaari : 0),
    0,
  );
  return {
    ...customer,
    creditBills: bills,
    outstandingLaari,
    availableCreditLaari: Math.max(0, customer.creditLimitLaari - outstandingLaari),
  };
}
