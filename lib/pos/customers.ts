import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";
import { eventChanges, snapshotJson, type BillSnapshot } from "@/lib/pos/bill-revisions";
import { prisma } from "@/lib/db";
import { measured } from "@/lib/pos/inventory";
import {
  allocateDeductionsToLines,
  deductRequirements,
  PosError,
  prepareSaleInventory,
  saleItemCreateData,
  type PersistedSaleLine,
} from "@/lib/pos/sales";

export type CreditBillItem = PersistedSaleLine;

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
    const stockComponents = Array.isArray(item.stockComponents)
      ? item.stockComponents.flatMap((raw) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
          const component = raw as Record<string, Prisma.JsonValue>;
          return typeof component.productId === "string"
            && typeof component.productName === "string"
            && typeof component.measuredPerItem === "number"
            ? [{ productId: component.productId, productName: component.productName, measuredPerItem: component.measuredPerItem }]
            : [];
        })
      : [];
    return {
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      ...(typeof item.productId === "string" ? { productId: item.productId } : {}),
      ...(typeof item.menuItemId === "string" ? { menuItemId: item.menuItemId } : {}),
      productName: item.productName,
      productSku: typeof item.productSku === "string" ? item.productSku : null,
      itemCategory: item.itemCategory,
      quantity: item.quantity,
      unitPriceLaari: item.unitPriceLaari,
      lineTotalLaari: item.lineTotalLaari,
      stockComponents,
    };
  });
}

function snapshotItems(lines: readonly PersistedSaleLine[]) {
  return lines.map((line) => ({
    id: line.id,
    productId: line.productId ?? null,
    menuItemId: line.menuItemId ?? null,
    productName: line.productName,
    productSku: line.productSku,
    itemCategory: line.itemCategory,
    quantity: line.quantity,
    unitPriceLaari: line.unitPriceLaari,
    lineTotalLaari: line.lineTotalLaari,
    stockComponents: line.stockComponents,
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

    const [{ lines, requirements }, outstanding, trackedOrder] = await Promise.all([
      prepareSaleInventory(tx, shift, input.items),
      tx.customerCreditBill.aggregate({
        where: { customerId: customer.id, status: "OUTSTANDING" },
        _sum: { totalLaari: true },
      }),
      input.heldOrderId
        ? tx.registerOrder.findFirst({
            where: { id: input.heldOrderId, registerShiftId: shift.id, status: "HELD" },
            select: { id: true, bill: { select: {
              id: true, version: true, status: true, paymentMethod: true, customerNote: true,
              restaurantTableId: true, restaurantTableName: true, items: true,
              subtotalLaari: true, totalLaari: true,
            } } },
          })
        : Promise.resolve(null),
    ]);
    if (input.heldOrderId && !trackedOrder) throw new PosError("That held bill is no longer available.");
    const persistedLines: PersistedSaleLine[] = lines.map((line) => ({ ...line, id: crypto.randomUUID() }));
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
        items: snapshotItems(persistedLines),
        note: input.note?.trim().slice(0, 500) || null,
      },
      select: { id: true, customerId: true, totalLaari: true },
    });

    const allocations = allocateDeductionsToLines(persistedLines, deductions);
    const movementIds = new Map<string, string>();
    for (const requirement of requirements) {
      const aggregate = await tx.inventoryBatch.aggregate({
        where: { productId: requirement.productId, remainingQuantity: { gt: 0 } },
        _sum: { remainingQuantity: true },
      });
      const batchSummary = (deductions.get(requirement.productId) ?? [])
        .map((entry) => `${entry.batchId}:${entry.quantity}`)
        .join(", ");
      const movement = await tx.inventoryMovement.create({
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
        select: { id: true },
      });
      movementIds.set(requirement.productId, movement.id);
    }
    await tx.inventoryConsumption.createMany({
      data: allocations.map((allocation) => ({
        sourceLineId: allocation.sourceLineId,
        customerCreditBillId: creditBill.id,
        inventoryMovementId: movementIds.get(allocation.productId)!,
        productId: allocation.productId,
        batchId: allocation.batchId,
        consumedQuantity: measured(allocation.quantity),
      })),
    });

    if (input.heldOrderId) {
      const converted = await tx.registerOrder.updateMany({
        where: {
          id: input.heldOrderId,
          registerShiftId: shift.id,
          status: "HELD",
        },
        data: { status: "CREDITED" },
      });
      if (converted.count !== 1) throw new PosError("That held bill is no longer available.");
    }

    if (trackedOrder?.bill) {
      if (trackedOrder.bill.status !== "UNPAID") throw new PosError("That bill is no longer unpaid.");
      const snapshot = {
        items: trackedOrder.bill.items,
        subtotalLaari: trackedOrder.bill.subtotalLaari,
        totalLaari: trackedOrder.bill.totalLaari,
        paymentMethod: trackedOrder.bill.paymentMethod,
        customerNote: trackedOrder.bill.customerNote,
        restaurantTableId: trackedOrder.bill.restaurantTableId,
        restaurantTableName: trackedOrder.bill.restaurantTableName,
      } as unknown as BillSnapshot;
      const version = trackedOrder.bill.version + 1;
      await tx.bill.update({
        where: { id: trackedOrder.bill.id },
        data: {
          customerCreditBillId: creditBill.id,
          version,
          revisions: { create: {
            revision: version,
            kind: "CREDIT_ISSUED",
            actorId: input.createdById,
            actorName: input.audit.actorLabel,
            changes: eventChanges("CREDIT_ISSUED", snapshot),
            snapshot: snapshotJson(snapshot),
          } },
        },
      });
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
        bill: { select: {
          id: true, version: true, openedById: true, openedByName: true,
          customerNote: true, restaurantTableId: true, restaurantTableName: true,
        } },
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
        items: {
          create: items.map(saleItemCreateData),
        },
      },
      select: { id: true, receiptNumber: true, createdAt: true },
    });
    await tx.saleItemStockComponent.createMany({
      data: items.flatMap((item) => item.stockComponents.map((component) => ({
        saleItemId: item.id,
        productId: component.productId,
        measuredPerItem: measured(component.measuredPerItem),
      }))),
      skipDuplicates: true,
    });
    await tx.inventoryConsumption.updateMany({
      where: { customerCreditBillId: creditBill.id, saleId: null },
      data: { saleId: sale.id },
    });
    for (const item of items) {
      await tx.inventoryConsumption.updateMany({
        where: { customerCreditBillId: creditBill.id, sourceLineId: item.id, saleItemId: null },
        data: { saleItemId: item.id },
      });
    }
    const paidSnapshot: BillSnapshot = {
      items: items.map((item) => ({
        productId: item.productId ?? null,
        menuItemId: item.menuItemId ?? null,
        productName: item.productName,
        productSku: item.productSku,
        itemCategory: item.itemCategory,
        quantity: item.quantity,
        unitPriceLaari: item.unitPriceLaari,
        lineTotalLaari: item.lineTotalLaari,
      })),
      subtotalLaari: creditBill.subtotalLaari,
      totalLaari: creditBill.totalLaari,
      paymentMethod: input.paymentMethod,
      customerNote: creditBill.bill?.customerNote ?? null,
      restaurantTableId: creditBill.bill?.restaurantTableId ?? null,
      restaurantTableName: creditBill.bill?.restaurantTableName ?? null,
    };
    if (creditBill.bill) {
      const version = creditBill.bill.version + 1;
      await tx.bill.update({
        where: { id: creditBill.bill.id },
        data: {
          saleId: sale.id,
          registerShiftId: shift.id,
          receiptNumber: sale.receiptNumber,
          status: "PAID",
          cashierName: input.cashierName,
          paidById: input.settledById,
          paidByName: input.cashierName,
          paymentMethod: input.paymentMethod,
          subtotalLaari: creditBill.subtotalLaari,
          totalLaari: creditBill.totalLaari,
          items: snapshotItems(items),
          paidAt: sale.createdAt,
          soldAt: sale.createdAt,
          version,
          revisions: { create: {
            revision: version,
            kind: "PAYMENT",
            actorId: input.settledById,
            actorName: input.cashierName,
            changes: eventChanges("PAYMENT", paidSnapshot),
            snapshot: snapshotJson(paidSnapshot),
          } },
        },
      });
    } else {
      await tx.bill.create({
        data: {
          saleId: sale.id,
          customerCreditBillId: creditBill.id,
          registerShiftId: shift.id,
          receiptNumber: sale.receiptNumber,
          status: "PAID",
          registerId: creditBill.registerId,
          registerName: creditBill.register.name,
          registerCode: creditBill.register.code,
          cashierName: input.cashierName,
          openedById: input.settledById,
          openedByName: input.cashierName,
          paidById: input.settledById,
          paidByName: input.cashierName,
          paymentMethod: input.paymentMethod,
          subtotalLaari: creditBill.subtotalLaari,
          totalLaari: creditBill.totalLaari,
          items: snapshotItems(items),
          openedAt: sale.createdAt,
          paidAt: sale.createdAt,
          soldAt: sale.createdAt,
          revisions: { create: {
            revision: 1,
            kind: "PAYMENT",
            actorId: input.settledById,
            actorName: input.cashierName,
            changes: eventChanges("PAYMENT", paidSnapshot),
            snapshot: snapshotJson(paidSnapshot),
          } },
        },
      });
    }
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

export async function getCustomerDetail(
  customerId: string,
  authorizedRegisterIds: readonly string[] | null = null,
  includeCreditDetails = true,
) {
  const [customer, outstanding] = await Promise.all([prisma.customer.findFirst({
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
        where: includeCreditDetails
          ? authorizedRegisterIds
            ? { registerId: { in: Array.from(authorizedRegisterIds) } }
            : undefined
          : { registerId: { in: [] } },
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
          register: {
            select: {
              id: true,
              name: true,
              code: true,
              shifts: {
                where: { status: "OPEN" },
                orderBy: { openedAt: "desc" },
                take: 1,
                select: { openedById: true },
              },
            },
          },
          createdBy: { select: { name: true } },
          sale: { select: { receiptNumber: true, paymentMethod: true } },
        },
      },
    },
  }), prisma.customerCreditBill.aggregate({
    where: { customerId, status: "OUTSTANDING" },
    _sum: { totalLaari: true },
  })]);
  if (!customer) return null;
  const bills = customer.creditBills.map((bill) => ({
    ...bill,
    items: parseCreditBillItems(bill.items),
    receiptNumber: bill.sale?.receiptNumber.toString() ?? null,
  }));
  const outstandingLaari = outstanding._sum.totalLaari ?? 0;
  return {
    ...customer,
    creditBills: bills,
    outstandingLaari,
    availableCreditLaari: Math.max(0, customer.creditLimitLaari - outstandingLaari),
  };
}
