import type { PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";

export class PosError extends Error {}

export type RecordSaleInput = {
  shiftId: string;
  createdById: string;
  paymentMethod: PaymentMethod;
  items: ReadonlyArray<{ productId: string; quantity: number }>;
  audit: { actorLabel: string; request?: AuditRequestContext };
};

function combineItems(items: RecordSaleInput["items"]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new PosError("Sale quantities must be positive whole numbers.");
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export async function recordSale(db: PrismaClient, input: RecordSaleInput) {
  const items = combineItems(input.items);
  if (items.length === 0) throw new PosError("A sale must contain at least one item.");

  return db.$transaction(async (tx) => {
    const shift = await tx.registerShift.findFirst({
      where: { id: input.shiftId, status: "OPEN" },
      select: { id: true, registerId: true },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");

    const products = await tx.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        registerId: shift.registerId,
        active: true,
      },
      select: { id: true, name: true, sku: true, retailPriceLaari: true, stockQuantity: true },
    });
    if (products.length !== items.length) {
      throw new PosError("One or more products are unavailable at this register.");
    }

    const byId = new Map(products.map((product) => [product.id, product]));
    const lines = items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new PosError("One or more products are unavailable.");
      if (product.stockQuantity < item.quantity) {
        throw new PosError(`${product.name} only has ${product.stockQuantity} in stock.`);
      }
      return {
        ...item,
        productName: product.name,
        productSku: product.sku,
        unitPriceLaari: product.retailPriceLaari,
        lineTotalLaari: product.retailPriceLaari * item.quantity,
      };
    });
    const totalLaari = lines.reduce((total, line) => total + line.lineTotalLaari, 0);

    const sale = await tx.sale.create({
      data: {
        registerShiftId: input.shiftId,
        createdById: input.createdById,
        paymentMethod: input.paymentMethod,
        subtotalLaari: totalLaari,
        totalLaari,
        items: { create: lines },
      },
      select: { id: true, receiptNumber: true, totalLaari: true },
    });

    const balances = new Map<string, number>();
    for (const line of lines) {
      const updated = await tx.product.updateMany({
        where: { id: line.productId, stockQuantity: { gte: line.quantity } },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (updated.count !== 1) throw new PosError(`${line.productName} no longer has enough stock.`);
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
        select: { stockQuantity: true },
      });
      balances.set(line.productId, product.stockQuantity);
    }

    await tx.inventoryMovement.createMany({
      data: lines.map((line) => ({
        productId: line.productId,
        registerId: shift.registerId,
        saleId: sale.id,
        createdById: input.createdById,
        type: "SALE" as const,
        quantityDelta: -line.quantity,
        balanceAfter: balances.get(line.productId) ?? 0,
        reason: `Receipt #${sale.receiptNumber}`,
      })),
    });

    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS",
        event: "SALE_RECORD",
        page: "REGISTERS",
        actorId: input.createdById,
        actorLabel: input.audit.actorLabel,
        targetType: "sale",
        targetId: sale.id,
        summary: `Receipt #${sale.receiptNumber} recorded.`,
        metadata: {
          receiptNumber: sale.receiptNumber,
          totalLaari: sale.totalLaari,
          paymentMethod: input.paymentMethod,
          lineCount: lines.length,
          registerId: shift.registerId,
        },
        request: input.audit.request,
      }),
    });

    return sale;
  });
}

export async function adjustInventory(
  db: PrismaClient,
  input: {
    productId: string;
    createdById: string;
    quantityDelta: number;
    reason: string;
    audit: { actorLabel: string; request?: AuditRequestContext };
  },
) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { registerId: true, name: true },
    });
    if (!product) throw new PosError("Product not found.");

    const updated = await tx.product.updateMany({
      where: {
        id: input.productId,
        ...(input.quantityDelta < 0
          ? { stockQuantity: { gte: Math.abs(input.quantityDelta) } }
          : {}),
      },
      data: { stockQuantity: { increment: input.quantityDelta } },
    });
    if (updated.count !== 1) throw new PosError("Adjustment would make stock negative.");

    const balance = await tx.product.findUniqueOrThrow({
      where: { id: input.productId },
      select: { stockQuantity: true },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        registerId: product.registerId,
        createdById: input.createdById,
        type: "ADJUSTMENT",
        quantityDelta: input.quantityDelta,
        balanceAfter: balance.stockQuantity,
        reason: input.reason,
      },
    });
    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS",
        event: "STOCK_ADJUST",
        page: "INVENTORY",
        actorId: input.createdById,
        actorLabel: input.audit.actorLabel,
        targetType: "product",
        targetId: input.productId,
        summary: `Stock adjusted for ${product.name}.`,
        metadata: {
          quantityDelta: input.quantityDelta,
          balanceAfter: balance.stockQuantity,
          reason: input.reason,
          registerId: product.registerId,
        },
        request: input.audit.request,
      }),
    });
    return movement;
  });
}
