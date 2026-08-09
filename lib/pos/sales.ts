import type { PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";

export class PosError extends Error {}

export type RecordSaleInput = {
  shiftId: string;
  createdById: string;
  paymentMethod: PaymentMethod;
  items: ReadonlyArray<{ productId: string; quantity: number }>;
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
      select: { id: true },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");

    const products = await tx.product.findMany({
      where: { id: { in: items.map((item) => item.productId) }, active: true },
      select: { id: true, name: true, sku: true, retailPriceLaari: true, stockQuantity: true },
    });
    if (products.length !== items.length) throw new PosError("One or more products are unavailable.");

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

    for (const line of lines) {
      const updated = await tx.product.updateMany({
        where: { id: line.productId, stockQuantity: { gte: line.quantity } },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (updated.count !== 1) throw new PosError(`${line.productName} no longer has enough stock.`);
    }

    await tx.inventoryMovement.createMany({
      data: lines.map((line) => ({
        productId: line.productId,
        saleId: sale.id,
        createdById: input.createdById,
        type: "SALE" as const,
        quantityDelta: -line.quantity,
        reason: `Receipt #${sale.receiptNumber}`,
      })),
    });

    return sale;
  });
}

export async function adjustInventory(
  db: PrismaClient,
  input: { productId: string; createdById: string; quantityDelta: number; reason: string },
) {
  return db.$transaction(async (tx) => {
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

    return tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        createdById: input.createdById,
        type: "ADJUSTMENT",
        quantityDelta: input.quantityDelta,
        reason: input.reason,
      },
    });
  });
}
