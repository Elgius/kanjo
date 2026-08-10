import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";
import {
  maldivesDate,
  measured,
  measuredPerServing,
  measuredPerStockUnit,
  quantityNumber,
} from "@/lib/pos/inventory";

export class PosError extends Error {}

export type RecordSaleInput = {
  shiftId: string;
  createdById: string;
  paymentMethod: PaymentMethod;
  items: ReadonlyArray<{ itemId: string; quantity: number }>;
  audit: { actorLabel: string; request?: AuditRequestContext };
};

function combineItems(items: RecordSaleInput["items"]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new PosError("Sale quantities must be positive whole numbers.");
    }
    quantities.set(item.itemId, (quantities.get(item.itemId) ?? 0) + item.quantity);
  }
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}

type Requirement = {
  productId: string;
  productName: string;
  measuredQuantity: number;
};

async function deductRequirements(
  tx: Prisma.TransactionClient,
  requirements: Requirement[],
  allowUndated: boolean,
) {
  const today = maldivesDate();
  const productIds = requirements.map((item) => item.productId);
  const batches = await tx.inventoryBatch.findMany({
    where: {
      productId: { in: productIds },
      remainingQuantity: { gt: 0 },
      ...(allowUndated
        ? { OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] }
        : { expiryDate: { gte: today } }),
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
  });
  batches.sort((left, right) => {
    if (!left.expiryDate && right.expiryDate) return 1;
    if (left.expiryDate && !right.expiryDate) return -1;
    const expiry = (left.expiryDate?.getTime() ?? 0) - (right.expiryDate?.getTime() ?? 0);
    return expiry || left.receivedAt.getTime() - right.receivedAt.getTime();
  });

  const deductions = new Map<string, Array<{ batchId: string; quantity: number }>>();
  for (const requirement of requirements) {
    let remaining = requirement.measuredQuantity;
    const candidates = batches.filter((batch) => batch.productId === requirement.productId);
    for (const batch of candidates) {
      if (remaining <= 0.0004) break;
      const take = Math.min(remaining, quantityNumber(batch.remainingQuantity));
      if (take <= 0) continue;
      const updated = await tx.inventoryBatch.updateMany({
        where: { id: batch.id, remainingQuantity: { gte: measured(take) } },
        data: { remainingQuantity: { decrement: measured(take) } },
      });
      if (updated.count !== 1) throw new PosError(`${requirement.productName} stock changed. Try again.`);
      remaining = Number((remaining - take).toFixed(3));
      const entries = deductions.get(requirement.productId) ?? [];
      entries.push({ batchId: batch.id, quantity: take });
      deductions.set(requirement.productId, entries);
    }
    if (remaining > 0.0004) {
      throw new PosError(`${requirement.productName} does not have enough usable stock.`);
    }
  }
  return deductions;
}

export async function recordSale(db: PrismaClient, input: RecordSaleInput) {
  const items = combineItems(input.items);
  if (items.length === 0) throw new PosError("A sale must contain at least one item.");

  return db.$transaction(async (tx) => {
    const shift = await tx.registerShift.findFirst({
      where: { id: input.shiftId, status: "OPEN" },
      select: { id: true, registerId: true, register: { select: { purpose: true } } },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");

    let lines: Array<{
      productId?: string;
      menuItemId?: string;
      productName: string;
      productSku: string | null;
      itemCategory: string;
      quantity: number;
      unitPriceLaari: number;
      lineTotalLaari: number;
    }>;
    let requirements: Requirement[];

    if (shift.register.purpose === "SHOP") {
      const products = await tx.product.findMany({
        where: { id: { in: items.map((item) => item.itemId) }, registerId: shift.registerId, active: true },
      });
      if (products.length !== items.length) throw new PosError("One or more products are unavailable at this register.");
      const byId = new Map(products.map((product) => [product.id, product]));
      lines = items.map((item) => {
        const product = byId.get(item.itemId)!;
        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          itemCategory: product.category,
          quantity: item.quantity,
          unitPriceLaari: product.retailPriceLaari,
          lineTotalLaari: product.retailPriceLaari * item.quantity,
        };
      });
      requirements = lines.map((line) => {
        const product = byId.get(line.productId!)!;
        return {
          productId: product.id,
          productName: product.name,
          measuredQuantity: measuredPerStockUnit(product) * line.quantity,
        };
      });
    } else {
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: items.map((item) => item.itemId) }, registerId: shift.registerId, active: true },
        include: { ingredients: { include: { product: true } } },
      });
      if (menuItems.length !== items.length) throw new PosError("One or more menu items are unavailable at this register.");
      if (menuItems.some((item) => item.ingredients.length === 0)) throw new PosError("A selected menu item has no recipe.");
      const byId = new Map(menuItems.map((item) => [item.id, item]));
      lines = items.map((item) => {
        const menuItem = byId.get(item.itemId)!;
        return {
          menuItemId: menuItem.id,
          productName: menuItem.name,
          productSku: null,
          itemCategory: menuItem.category,
          quantity: item.quantity,
          unitPriceLaari: menuItem.retailPriceLaari,
          lineTotalLaari: menuItem.retailPriceLaari * item.quantity,
        };
      });
      const requirementMap = new Map<string, Requirement>();
      for (const item of items) {
        const menuItem = byId.get(item.itemId)!;
        for (const ingredient of menuItem.ingredients) {
          if (!ingredient.product.active || ingredient.product.registerId !== shift.registerId) {
            throw new PosError(`${ingredient.product.name} is unavailable for this recipe.`);
          }
          const amount = measuredPerServing(ingredient.product) * ingredient.servingMultiplier * item.quantity;
          const existing = requirementMap.get(ingredient.productId);
          requirementMap.set(ingredient.productId, {
            productId: ingredient.productId,
            productName: ingredient.product.name,
            measuredQuantity: Number(((existing?.measuredQuantity ?? 0) + amount).toFixed(3)),
          });
        }
      }
      requirements = [...requirementMap.values()];
    }

    const deductions = await deductRequirements(tx, requirements, shift.register.purpose === "SHOP");
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

    for (const requirement of requirements) {
      const aggregate = await tx.inventoryBatch.aggregate({
        where: { productId: requirement.productId },
        _sum: { remainingQuantity: true },
      });
      const batchSummary = (deductions.get(requirement.productId) ?? [])
        .map((entry) => `${entry.batchId}:${entry.quantity}`)
        .join(", ");
      await tx.inventoryMovement.create({
        data: {
          productId: requirement.productId,
          registerId: shift.registerId,
          saleId: sale.id,
          createdById: input.createdById,
          type: "SALE",
          quantityDelta: measured(-requirement.measuredQuantity),
          balanceAfter: aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0),
          reason: `Receipt #${sale.receiptNumber} · batches ${batchSummary}`,
        },
      });
    }

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
          registerPurpose: shift.register.purpose,
        },
        request: input.audit.request,
      }),
    });
    return sale;
  }, { isolationLevel: "Serializable" });
}

export async function receiveInventory(
  db: PrismaClient,
  input: {
    productId: string;
    createdById: string;
    stockUnits: number;
    expiryDate: Date | null;
    reason: string;
    audit: { actorLabel: string; request?: AuditRequestContext };
  },
) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      include: { register: { select: { purpose: true } } },
    });
    if (!product) throw new PosError("Product not found.");
    if (!Number.isSafeInteger(input.stockUnits) || input.stockUnits < 1) throw new PosError("Received stock must be a positive whole number.");
    if (product.register.purpose === "RESTAURANT" && !input.expiryDate) throw new PosError("Restaurant stock requires an expiry date.");
    if (input.expiryDate && input.expiryDate < maldivesDate()) throw new PosError("New stock cannot already be expired.");
    const quantity = measured(measuredPerStockUnit(product) * input.stockUnits);
    const batch = await tx.inventoryBatch.create({
      data: {
        productId: product.id,
        registerId: product.registerId,
        receivedById: input.createdById,
        receivedQuantity: quantity,
        remainingQuantity: quantity,
        expiryDate: input.expiryDate,
      },
    });
    const aggregate = await tx.inventoryBatch.aggregate({ where: { productId: product.id }, _sum: { remainingQuantity: true } });
    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        registerId: product.registerId,
        createdById: input.createdById,
        type: "ADJUSTMENT",
        quantityDelta: quantity,
        balanceAfter: aggregate._sum.remainingQuantity ?? quantity,
        reason: input.reason,
      },
    });
    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS", event: "STOCK_RECEIVE", page: "INVENTORY",
        actorId: input.createdById, actorLabel: input.audit.actorLabel,
        targetType: "inventory_batch", targetId: batch.id,
        summary: `Stock received for ${product.name}.`,
        metadata: { productId: product.id, stockUnits: input.stockUnits, expiryDate: input.expiryDate, measuredQuantity: quantity },
        request: input.audit.request,
      }),
    });
    return batch;
  });
}

export async function assignBatchExpiry(db: PrismaClient, input: { batchId: string; createdById: string; expiryDate: Date; audit: { actorLabel: string; request?: AuditRequestContext } }) {
  return db.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.findUnique({ where: { id: input.batchId }, include: { product: { select: { name: true } } } });
    if (!batch) throw new PosError("Stock batch not found.");
    const updated = await tx.inventoryBatch.update({ where: { id: batch.id }, data: { expiryDate: input.expiryDate } });
    await tx.auditLog.create({ data: auditCreateData({
      outcome: "SUCCESS", event: "BATCH_EXPIRY_SET", page: "INVENTORY", actorId: input.createdById,
      actorLabel: input.audit.actorLabel, targetType: "inventory_batch", targetId: batch.id,
      summary: `Expiry set for ${batch.product.name}.`, metadata: { expiryDate: input.expiryDate }, request: input.audit.request,
    }) });
    return updated;
  });
}

export async function writeOffBatch(db: PrismaClient, input: { batchId: string; createdById: string; measuredQuantity: number; reason: string; audit: { actorLabel: string; request?: AuditRequestContext } }) {
  return db.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.findUnique({ where: { id: input.batchId }, include: { product: { select: { name: true } } } });
    if (!batch) throw new PosError("Stock batch not found.");
    if (!(input.measuredQuantity > 0)) throw new PosError("Write-off quantity must be positive.");
    const quantity = measured(input.measuredQuantity);
    const updated = await tx.inventoryBatch.updateMany({ where: { id: batch.id, remainingQuantity: { gte: quantity } }, data: { remainingQuantity: { decrement: quantity } } });
    if (updated.count !== 1) throw new PosError("Write-off exceeds the batch balance.");
    const aggregate = await tx.inventoryBatch.aggregate({ where: { productId: batch.productId }, _sum: { remainingQuantity: true } });
    await tx.inventoryMovement.create({ data: {
      productId: batch.productId, registerId: batch.registerId, createdById: input.createdById,
      type: "ADJUSTMENT", quantityDelta: quantity.negated(), balanceAfter: aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0), reason: input.reason,
    } });
    await tx.auditLog.create({ data: auditCreateData({
      outcome: "SUCCESS", event: "BATCH_WRITE_OFF", page: "INVENTORY", actorId: input.createdById,
      actorLabel: input.audit.actorLabel, targetType: "inventory_batch", targetId: batch.id,
      summary: `Stock written off for ${batch.product.name}.`, metadata: { measuredQuantity: quantity, reason: input.reason }, request: input.audit.request,
    }) });
  });
}
