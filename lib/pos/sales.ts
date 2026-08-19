import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { BillStatus, PaymentMethod } from "@/generated/prisma/enums";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";
import {
  describeBillChanges,
  eventChanges,
  itemsJson,
  makeBillSnapshot,
  parseBillSnapshot,
  snapshotJson,
} from "@/lib/pos/bill-revisions";
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
  cashierName?: string;
  heldOrderId?: string | null;
  customerNote?: string | null;
  restaurantTableId?: string | null;
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

export type InventoryRequirement = {
  productId: string;
  productName: string;
  measuredQuantity: number;
};

export type SaleLine = {
  productId?: string;
  menuItemId?: string;
  productName: string;
  productSku: string | null;
  itemCategory: string;
  quantity: number;
  unitPriceLaari: number;
  lineTotalLaari: number;
  stockComponents: Array<{
    productId: string;
    productName: string;
    measuredPerItem: number;
  }>;
};

export type PersistedSaleLine = SaleLine & { id: string };

export function saleItemCreateData(line: PersistedSaleLine) {
  return {
    id: line.id,
    productId: line.productId,
    menuItemId: line.menuItemId,
    productName: line.productName,
    productSku: line.productSku,
    itemCategory: line.itemCategory,
    quantity: line.quantity,
    unitPriceLaari: line.unitPriceLaari,
    lineTotalLaari: line.lineTotalLaari,
  };
}

export function allocateDeductionsToLines(
  lines: readonly PersistedSaleLine[],
  deductions: Map<string, Array<{ batchId: string; quantity: number }>>,
) {
  const remaining = new Map(
    [...deductions].map(([productId, entries]) => [
      productId,
      entries.map((entry) => ({ ...entry })),
    ]),
  );
  const allocations: Array<{ sourceLineId: string; productId: string; batchId: string; quantity: number }> = [];
  for (const line of lines) {
    for (const component of line.stockComponents) {
      let needed = Number((component.measuredPerItem * line.quantity).toFixed(3));
      const batches = remaining.get(component.productId) ?? [];
      for (const batch of batches) {
        if (needed <= 0.0004) break;
        const take = Math.min(needed, batch.quantity);
        if (take <= 0) continue;
        allocations.push({ sourceLineId: line.id, productId: component.productId, batchId: batch.batchId, quantity: take });
        batch.quantity = Number((batch.quantity - take).toFixed(3));
        needed = Number((needed - take).toFixed(3));
      }
      if (needed > 0.0004) throw new PosError(`Stock allocation for ${line.productName} is incomplete.`);
    }
  }
  return allocations;
}

export async function deductRequirements(
  tx: Prisma.TransactionClient,
  requirements: InventoryRequirement[],
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

export async function prepareSaleInventory(
  tx: Prisma.TransactionClient,
  shift: { registerId: string; register: { purpose: "SHOP" | "RESTAURANT" } },
  rawItems: ReadonlyArray<{ itemId: string; quantity: number }>,
) {
  const items = combineItems(rawItems);
  if (!items.length) throw new PosError("A sale must contain at least one item.");

  let lines: SaleLine[];
  let requirements: InventoryRequirement[];
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
        stockComponents: [{
          productId: product.id,
          productName: product.name,
          measuredPerItem: measuredPerStockUnit(product),
        }],
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
    const itemIds = items.map((item) => item.itemId);
    const [menuItems, standaloneProducts] = await Promise.all([
      tx.menuItem.findMany({
        where: { id: { in: itemIds }, registerId: shift.registerId, active: true },
        include: { ingredients: { include: { product: true } } },
      }),
      tx.product.findMany({
        where: {
          id: { in: itemIds },
          registerId: shift.registerId,
          active: true,
          menuIngredients: { some: { standalone: true } },
        },
      }),
    ]);
    if (menuItems.length + standaloneProducts.length !== items.length) throw new PosError("One or more menu items are unavailable at this register.");
    if (menuItems.some((item) => item.ingredients.length === 0)) throw new PosError("A selected menu item has no recipe.");
    const byId = new Map(menuItems.map((item) => [item.id, item]));
    const productsById = new Map(standaloneProducts.map((product) => [product.id, product]));
    lines = items.map((item) => {
      const menuItem = byId.get(item.itemId);
      if (!menuItem) {
        const product = productsById.get(item.itemId)!;
        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          itemCategory: product.category,
          quantity: item.quantity,
          unitPriceLaari: product.retailPriceLaari,
          lineTotalLaari: product.retailPriceLaari * item.quantity,
          stockComponents: [{
            productId: product.id,
            productName: product.name,
            measuredPerItem: measuredPerServing(product),
          }],
        };
      }
      return {
        menuItemId: menuItem.id,
        productName: menuItem.name,
        productSku: null,
        itemCategory: menuItem.category,
        quantity: item.quantity,
        unitPriceLaari: menuItem.retailPriceLaari,
        lineTotalLaari: menuItem.retailPriceLaari * item.quantity,
        stockComponents: menuItem.ingredients.map((ingredient) => ({
          productId: ingredient.productId,
          productName: ingredient.product.name,
          measuredPerItem: measuredPerServing(ingredient.product) * ingredient.servingMultiplier,
        })),
      };
    });
    const requirementMap = new Map<string, InventoryRequirement>();
    for (const item of items) {
      const menuItem = byId.get(item.itemId);
      if (!menuItem) {
        const product = productsById.get(item.itemId)!;
        requirementMap.set(product.id, {
          productId: product.id,
          productName: product.name,
          measuredQuantity: Number(
            (((requirementMap.get(product.id)?.measuredQuantity ?? 0) + measuredPerServing(product) * item.quantity)).toFixed(3),
          ),
        });
        continue;
      }
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

  return { lines, requirements };
}

export async function recordSale(db: PrismaClient, input: RecordSaleInput) {
  return db.$transaction(async (tx) => {
    const shift = await tx.registerShift.findFirst({
      where: { id: input.shiftId, status: "OPEN" },
      select: {
        id: true,
        registerId: true,
        register: { select: { purpose: true, name: true, code: true } },
      },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");

    let heldOrder: {
      id: string;
      customerNote: string | null;
      restaurantTableId: string | null;
      restaurantTable: { id: string; name: string } | null;
      bill: {
        id: string;
        version: number;
        status: BillStatus;
        items: Prisma.JsonValue;
        subtotalLaari: number;
        totalLaari: number;
        paymentMethod: PaymentMethod;
        customerNote: string | null;
        restaurantTableId: string | null;
        restaurantTableName: string | null;
      } | null;
    } | null = null;
    if (input.heldOrderId) {
      heldOrder = await tx.registerOrder.findFirst({
        where: {
          id: input.heldOrderId,
          registerShiftId: shift.id,
          status: "HELD",
        },
        select: {
          id: true,
          customerNote: true,
          restaurantTableId: true,
          restaurantTable: { select: { id: true, name: true } },
          bill: { select: {
            id: true, version: true, status: true, items: true, subtotalLaari: true, totalLaari: true,
            paymentMethod: true, customerNote: true, restaurantTableId: true, restaurantTableName: true,
          } },
        },
      });
      if (!heldOrder) throw new PosError("That held order is no longer available.");
    }

    const { lines, requirements } = await prepareSaleInventory(tx, shift, input.items);

    const deductions = await deductRequirements(tx, requirements, shift.register.purpose === "SHOP");
    const persistedLines: PersistedSaleLine[] = lines.map((line) => ({ ...line, id: crypto.randomUUID() }));
    const allocations = allocateDeductionsToLines(persistedLines, deductions);
    const totalLaari = lines.reduce((total, line) => total + line.lineTotalLaari, 0);
    const sale = await tx.sale.create({
      data: {
        registerShiftId: input.shiftId,
        createdById: input.createdById,
        paymentMethod: input.paymentMethod,
        subtotalLaari: totalLaari,
        totalLaari,
        items: {
          create: persistedLines.map(saleItemCreateData),
        },
      },
      select: { id: true, receiptNumber: true, totalLaari: true, createdAt: true },
    });
    await tx.saleItemStockComponent.createMany({
      data: persistedLines.flatMap((line) => line.stockComponents.map((component) => ({
        saleItemId: line.id,
        productId: component.productId,
        measuredPerItem: measured(component.measuredPerItem),
      }))),
    });

    const payerName = input.cashierName ?? input.audit.actorLabel;
    const finalTable = input.restaurantTableId
      ? await tx.restaurantTable.findFirst({
          where: { id: input.restaurantTableId, registerId: shift.registerId, active: true },
          select: { id: true, name: true },
        })
      : heldOrder?.restaurantTable ?? null;
    const finalSnapshot = makeBillSnapshot(
      persistedLines,
      input.paymentMethod,
      input.customerNote ?? heldOrder?.customerNote ?? null,
      finalTable,
    );
    let billNumber: bigint;
    if (heldOrder?.bill) {
      if (heldOrder.bill.status !== "UNPAID") throw new PosError("That bill is no longer unpaid.");
      const before = parseBillSnapshot({
        items: heldOrder.bill.items,
        subtotalLaari: heldOrder.bill.subtotalLaari,
        totalLaari: heldOrder.bill.totalLaari,
        paymentMethod: heldOrder.bill.paymentMethod,
        customerNote: heldOrder.bill.customerNote,
        restaurantTableId: heldOrder.bill.restaurantTableId,
        restaurantTableName: heldOrder.bill.restaurantTableName,
      } as unknown as Prisma.JsonValue);
      if (!before) throw new PosError("That bill has invalid snapshot data.");
      const changes = describeBillChanges(before, finalSnapshot);
      let version = heldOrder.bill.version;
      if (changes.length) {
        version += 1;
        await tx.billRevision.create({ data: {
          billId: heldOrder.bill.id, revision: version, kind: "AMENDMENT",
          actorId: input.createdById, actorName: payerName, changes,
          snapshot: snapshotJson(finalSnapshot),
        } });
      }
      version += 1;
      const updatedBill = await tx.bill.update({
        where: { id: heldOrder.bill.id },
        data: {
          saleId: sale.id,
          receiptNumber: sale.receiptNumber,
          status: "PAID",
          cashierName: payerName,
          paidById: input.createdById,
          paidByName: payerName,
          paymentMethod: input.paymentMethod,
          subtotalLaari: finalSnapshot.subtotalLaari,
          totalLaari: finalSnapshot.totalLaari,
          items: itemsJson(finalSnapshot),
          customerNote: finalSnapshot.customerNote,
          restaurantTableId: finalSnapshot.restaurantTableId,
          restaurantTableName: finalSnapshot.restaurantTableName,
          paidAt: sale.createdAt,
          soldAt: sale.createdAt,
          version,
          revisions: { create: {
            revision: version,
            kind: "PAYMENT",
            actorId: input.createdById,
            actorName: payerName,
            changes: eventChanges("PAYMENT", finalSnapshot),
            snapshot: snapshotJson(finalSnapshot),
          } },
        },
        select: { billNumber: true },
      });
      billNumber = updatedBill.billNumber;
    } else {
      const createdBill = await tx.bill.create({
        data: {
          saleId: sale.id,
          orderId: heldOrder?.id ?? null,
          registerShiftId: shift.id,
          receiptNumber: sale.receiptNumber,
          status: "PAID",
          registerId: shift.registerId,
          registerName: shift.register.name,
          registerCode: shift.register.code,
          cashierName: payerName,
          openedById: input.createdById,
          openedByName: payerName,
          paidById: input.createdById,
          paidByName: payerName,
          paymentMethod: input.paymentMethod,
          subtotalLaari: finalSnapshot.subtotalLaari,
          totalLaari: finalSnapshot.totalLaari,
          items: itemsJson(finalSnapshot),
          customerNote: finalSnapshot.customerNote,
          restaurantTableId: finalSnapshot.restaurantTableId,
          restaurantTableName: finalSnapshot.restaurantTableName,
          openedAt: sale.createdAt,
          paidAt: sale.createdAt,
          soldAt: sale.createdAt,
          revisions: { create: {
            revision: 1,
            kind: "PAYMENT",
            actorId: input.createdById,
            actorName: payerName,
            changes: eventChanges("PAYMENT", finalSnapshot),
            snapshot: snapshotJson(finalSnapshot),
          } },
        },
        select: { billNumber: true },
      });
      billNumber = createdBill.billNumber;
    }

    if (input.heldOrderId) {
      const completed = await tx.registerOrder.updateMany({
        where: {
          id: input.heldOrderId,
          registerShiftId: shift.id,
          status: "HELD",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          paymentMethod: input.paymentMethod,
          saleId: sale.id,
        },
      });
      if (completed.count !== 1) throw new PosError("That held order changed. Try again.");
    }

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
          saleId: sale.id,
          createdById: input.createdById,
          type: "SALE",
          quantityDelta: measured(-requirement.measuredQuantity),
          balanceAfter: aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0),
          reason: `Receipt #${sale.receiptNumber} · batches ${batchSummary}`,
        },
        select: { id: true },
      });
      movementIds.set(requirement.productId, movement.id);
    }
    await tx.inventoryConsumption.createMany({
      data: allocations.map((allocation) => ({
        sourceLineId: allocation.sourceLineId,
        saleId: sale.id,
        saleItemId: allocation.sourceLineId,
        inventoryMovementId: movementIds.get(allocation.productId)!,
        productId: allocation.productId,
        batchId: allocation.batchId,
        consumedQuantity: measured(allocation.quantity),
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
          registerPurpose: shift.register.purpose,
          heldOrderId: input.heldOrderId ?? null,
        },
        request: input.audit.request,
      }),
    });
    return { ...sale, billNumber };
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
    const aggregate = await tx.inventoryBatch.aggregate({ where: { productId: product.id, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
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
    const aggregate = await tx.inventoryBatch.aggregate({ where: { productId: batch.productId, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
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
