import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AuditRequestContext } from "@/lib/audit-core";
import { auditCreateData } from "@/lib/audit-core";
import { itemsJson, makeBillSnapshot, snapshotJson } from "@/lib/pos/bill-revisions";
import { measured, measuredPerServing, measuredPerStockUnit, quantityNumber } from "@/lib/pos/inventory";
import {
  allocateDeductionsToLines,
  deductRequirements,
  PosError,
  type InventoryRequirement,
  type PersistedSaleLine,
} from "@/lib/pos/sales";

export type CorrectionStockMode = "ALL" | "SOME" | "NONE";
export type CorrectionStockChoice = {
  mode: CorrectionStockMode;
  quantities: Array<{ saleItemId: string; quantity: number }>;
};

export type AmendPaidBillInput = {
  billId: string;
  registerId: string;
  sessionId: string;
  expectedVersion: number;
  quantities: Array<{ saleItemId: string; quantity: number }>;
  addedStock: CorrectionStockChoice;
  removedStock: CorrectionStockChoice;
  actorId: string;
  actorName: string;
  audit: { actorLabel: string; request?: AuditRequestContext };
};

export type ReversePaidBillInput = {
  billId: string;
  registerId: string;
  sessionId: string;
  expectedVersion: number;
  stock: CorrectionStockChoice;
  actorId: string;
  actorName: string;
  audit: { actorLabel: string; request?: AuditRequestContext };
};

const epsilon = 0.0004;
const batchPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9]+(?:\.[0-9]+)?)/gi;

function quantityMap(entries: ReadonlyArray<{ saleItemId: string; quantity: number }>) {
  const values = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.saleItemId || !Number.isSafeInteger(entry.quantity) || entry.quantity < 0) {
      throw new PosError("Bill quantities must be non-negative whole numbers.");
    }
    if (values.has(entry.saleItemId)) throw new PosError("Each bill item may be selected only once.");
    values.set(entry.saleItemId, entry.quantity);
  }
  return values;
}

function parsedBatches(reason: string | null) {
  const entries: Array<{ batchId: string; quantity: number }> = [];
  for (const match of reason?.matchAll(batchPattern) ?? []) {
    const quantity = Number(match[2]);
    if (quantity > epsilon) entries.push({ batchId: match[1], quantity });
  }
  return entries;
}

type LoadedBill = Awaited<ReturnType<typeof loadBill>>;

async function loadBill(tx: Prisma.TransactionClient, billId: string, registerId: string, sessionId: string) {
  return tx.bill.findFirst({
    where: { id: billId, registerId, registerShiftId: sessionId },
    include: {
      sale: {
        include: {
          items: {
            orderBy: { id: "asc" },
            include: {
              stockComponents: { include: { product: true } },
              inventoryConsumptions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            },
          },
          stockMovements: { where: { type: "SALE" }, orderBy: { createdAt: "asc" } },
        },
      },
      customerCreditBill: {
        include: { stockMovements: { where: { type: "SALE" }, orderBy: { createdAt: "asc" } } },
      },
      registerShift: { select: { register: { select: { purpose: true } } } },
    },
  });
}

async function materializeLegacyStock(tx: Prisma.TransactionClient, bill: NonNullable<LoadedBill>) {
  if (!bill.sale) throw new PosError("This paid bill is missing its transaction.");
  if (bill.sale.items.some((item) => item.inventoryConsumptions.length)) return;

  const productIds = bill.sale.items.flatMap((item) => item.productId ? [item.productId] : []);
  const menuIds = bill.sale.items.flatMap((item) => item.menuItemId ? [item.menuItemId] : []);
  const [products, menus] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds } } }),
    tx.menuItem.findMany({
      where: { id: { in: menuIds } },
      include: { ingredients: { include: { product: true } } },
    }),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const menusById = new Map(menus.map((menu) => [menu.id, menu]));
  const componentMap = new Map<string, Array<{ productId: string; measuredPerItem: number }>>();
  for (const item of bill.sale.items) {
    if (item.stockComponents.length) {
      componentMap.set(item.id, item.stockComponents.map((component) => ({
        productId: component.productId,
        measuredPerItem: quantityNumber(component.measuredPerItem),
      })));
      continue;
    }
    if (item.productId) {
      const product = productsById.get(item.productId);
      if (!product) throw new PosError(`Stock mapping is unavailable for ${item.productName}.`);
      componentMap.set(item.id, [{
        productId: product.id,
        measuredPerItem: bill.registerShift.register.purpose === "SHOP"
          ? measuredPerStockUnit(product)
          : measuredPerServing(product),
      }]);
    } else if (item.menuItemId) {
      const menu = menusById.get(item.menuItemId);
      if (!menu?.ingredients.length) throw new PosError(`The historic recipe for ${item.productName} is unavailable.`);
      componentMap.set(item.id, menu.ingredients.map((ingredient) => ({
        productId: ingredient.productId,
        measuredPerItem: measuredPerServing(ingredient.product) * ingredient.servingMultiplier,
      })));
    }
  }

  const movements = bill.customerCreditBill?.stockMovements.length
    ? bill.customerCreditBill.stockMovements
    : bill.sale.stockMovements;
  for (const movement of movements) {
    const candidates = bill.sale.items.flatMap((item) => {
      const component = componentMap.get(item.id)?.find((entry) => entry.productId === movement.productId);
      return component ? [{ item, component }] : [];
    });
    if (!candidates.length) throw new PosError("Historic restaurant stock cannot be mapped to the sold items.");
    const movementTotal = Math.abs(quantityNumber(movement.quantityDelta));
    const weightedTotal = candidates.reduce((total, { item, component }) => total + item.quantity * component.measuredPerItem, 0);
    if (weightedTotal <= epsilon) throw new PosError("Historic stock quantities are invalid.");
    const scale = movementTotal / weightedTotal;
    for (const { component } of candidates) component.measuredPerItem = Number((component.measuredPerItem * scale).toFixed(3));

    const batches = parsedBatches(movement.reason).map((entry) => ({ ...entry }));
    if (!batches.length) throw new PosError("Historic stock batches cannot be identified for this bill.");
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const { item, component } = candidates[candidateIndex];
      let needed = candidateIndex === candidates.length - 1
        ? batches.reduce((total, batch) => total + batch.quantity, 0)
        : Number((item.quantity * component.measuredPerItem).toFixed(3));
      for (const batch of batches) {
        if (needed <= epsilon) break;
        const take = Math.min(needed, batch.quantity);
        if (take <= epsilon) continue;
        await tx.inventoryConsumption.create({ data: {
          sourceLineId: item.id,
          saleId: bill.sale.id,
          saleItemId: item.id,
          customerCreditBillId: bill.customerCreditBillId,
          inventoryMovementId: movement.id,
          productId: movement.productId,
          batchId: batch.batchId,
          consumedQuantity: measured(take),
        } });
        batch.quantity = Number((batch.quantity - take).toFixed(3));
        needed = Number((needed - take).toFixed(3));
      }
      if (needed > epsilon) throw new PosError("Historic stock allocation is incomplete.");
    }
  }
  await tx.saleItemStockComponent.createMany({
    data: [...componentMap].flatMap(([saleItemId, components]) => components.map((component) => ({
      saleItemId,
      productId: component.productId,
      measuredPerItem: measured(component.measuredPerItem),
    }))),
    skipDuplicates: true,
  });
}

function activeMeasured(consumption: { consumedQuantity: Prisma.Decimal; restoredQuantity: Prisma.Decimal; retiredQuantity: Prisma.Decimal }) {
  return Number((quantityNumber(consumption.consumedQuantity)
    - quantityNumber(consumption.restoredQuantity)
    - quantityNumber(consumption.retiredQuantity)).toFixed(3));
}

function trackedItemQuantity(item: NonNullable<NonNullable<LoadedBill>["sale"]>["items"][number]) {
  if (!item.stockComponents.length) return 0;
  return Math.max(0, Math.floor(Math.min(...item.stockComponents.map((component) => {
    const active = item.inventoryConsumptions
      .filter((entry) => entry.productId === component.productId)
      .reduce((total, entry) => total + activeMeasured(entry), 0);
    return active / quantityNumber(component.measuredPerItem);
  })) + epsilon));
}

async function releaseItemStock(
  tx: Prisma.TransactionClient,
  item: NonNullable<NonNullable<LoadedBill>["sale"]>["items"][number],
  releaseItems: number,
  restoreItems: number,
) {
  const restored = new Map<string, number>();
  for (const component of item.stockComponents) {
    const perItem = quantityNumber(component.measuredPerItem);
    let releaseMeasured = Number((releaseItems * perItem).toFixed(3));
    let restoreMeasured = Number((restoreItems * perItem).toFixed(3));
    const consumptions = item.inventoryConsumptions.filter((entry) => entry.productId === component.productId);
    for (const consumption of consumptions) {
      if (releaseMeasured <= epsilon) break;
      const active = activeMeasured(consumption);
      const take = Math.min(active, releaseMeasured);
      if (take <= epsilon) continue;
      const restore = Math.min(take, restoreMeasured);
      const retire = Number((take - restore).toFixed(3));
      await tx.inventoryConsumption.update({
        where: { id: consumption.id },
        data: {
          restoredQuantity: { increment: measured(restore) },
          retiredQuantity: { increment: measured(retire) },
        },
      });
      if (restore > epsilon) {
        await tx.inventoryBatch.update({
          where: { id: consumption.batchId },
          data: { remainingQuantity: { increment: measured(restore) } },
        });
        restored.set(component.productId, Number(((restored.get(component.productId) ?? 0) + restore).toFixed(3)));
      }
      releaseMeasured = Number((releaseMeasured - take).toFixed(3));
      restoreMeasured = Number((restoreMeasured - restore).toFixed(3));
    }
    if (releaseMeasured > epsilon) throw new PosError(`Tracked stock for ${item.productName} changed. Reload and try again.`);
  }
  return restored;
}

async function createRefundMovements(
  tx: Prisma.TransactionClient,
  bill: NonNullable<LoadedBill>,
  actorId: string,
  restored: Map<string, number>,
) {
  for (const [productId, quantity] of restored) {
    if (quantity <= epsilon) continue;
    const aggregate = await tx.inventoryBatch.aggregate({
      where: { productId, remainingQuantity: { gt: 0 } },
      _sum: { remainingQuantity: true },
    });
    await tx.inventoryMovement.create({ data: {
      productId,
      registerId: bill.registerId,
      saleId: bill.saleId,
      customerCreditBillId: bill.customerCreditBillId,
      createdById: actorId,
      type: "REFUND",
      quantityDelta: measured(quantity),
      balanceAfter: aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0),
      reason: `Bill #${bill.billNumber} stock reversal`,
    } });
  }
}

async function deductAddedStock(
  tx: Prisma.TransactionClient,
  bill: NonNullable<LoadedBill>,
  items: NonNullable<NonNullable<LoadedBill>["sale"]>["items"],
  selected: Map<string, number>,
  actorId: string,
) {
  const lines: PersistedSaleLine[] = items.flatMap((item) => {
    const quantity = selected.get(item.id) ?? 0;
    if (!quantity) return [];
    return [{
      id: item.id,
      productId: item.productId ?? undefined,
      menuItemId: item.menuItemId ?? undefined,
      productName: item.productName,
      productSku: item.productSku,
      itemCategory: item.itemCategory,
      quantity,
      unitPriceLaari: item.unitPriceLaari,
      lineTotalLaari: item.unitPriceLaari * quantity,
      stockComponents: item.stockComponents.map((component) => ({
        productId: component.productId,
        productName: component.product.name,
        measuredPerItem: quantityNumber(component.measuredPerItem),
      })),
    }];
  });
  const requirements = new Map<string, InventoryRequirement>();
  for (const line of lines) for (const component of line.stockComponents) {
    const current = requirements.get(component.productId);
    requirements.set(component.productId, {
      productId: component.productId,
      productName: component.productName,
      measuredQuantity: Number(((current?.measuredQuantity ?? 0) + component.measuredPerItem * line.quantity).toFixed(3)),
    });
  }
  if (!requirements.size) return;
  const deductions = await deductRequirements(
    tx,
    [...requirements.values()],
    bill.registerShift.register.purpose === "SHOP",
  );
  const allocations = allocateDeductionsToLines(lines, deductions);
  const movementIds = new Map<string, string>();
  for (const requirement of requirements.values()) {
    const aggregate = await tx.inventoryBatch.aggregate({ where: { productId: requirement.productId, remainingQuantity: { gt: 0 } }, _sum: { remainingQuantity: true } });
    const batchSummary = (deductions.get(requirement.productId) ?? []).map((entry) => `${entry.batchId}:${entry.quantity}`).join(", ");
    const movement = await tx.inventoryMovement.create({ data: {
      productId: requirement.productId,
      registerId: bill.registerId,
      saleId: bill.saleId,
      customerCreditBillId: bill.customerCreditBillId,
      createdById: actorId,
      type: "SALE",
      quantityDelta: measured(-requirement.measuredQuantity),
      balanceAfter: aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0),
      reason: `Bill #${bill.billNumber} amendment · batches ${batchSummary}`,
    }, select: { id: true } });
    movementIds.set(requirement.productId, movement.id);
  }
  await tx.inventoryConsumption.createMany({ data: allocations.map((allocation) => ({
    sourceLineId: allocation.sourceLineId,
    saleId: bill.saleId,
    saleItemId: allocation.sourceLineId,
    customerCreditBillId: bill.customerCreditBillId,
    inventoryMovementId: movementIds.get(allocation.productId)!,
    productId: allocation.productId,
    batchId: allocation.batchId,
    consumedQuantity: measured(allocation.quantity),
  })) });
}

function mergeQuantities(mode: CorrectionStockMode, maximums: Map<string, number>, requested: CorrectionStockChoice) {
  if (mode === "NONE") return new Map<string, number>();
  if (mode === "ALL") return new Map(maximums);
  const selected = quantityMap(requested.quantities);
  for (const [itemId, quantity] of selected) {
    if (quantity > (maximums.get(itemId) ?? 0)) throw new PosError("A stock quantity exceeds the corresponding bill change.");
  }
  if ([...maximums.values()].some((quantity) => quantity > 0) && ![...selected.values()].some((quantity) => quantity > 0)) {
    throw new PosError("Select at least one stock quantity for the Some option.");
  }
  return selected;
}

function correctionMetadata(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function amendPaidBill(db: PrismaClient, input: AmendPaidBillInput) {
  return db.$transaction(async (tx) => {
    let bill = await loadBill(tx, input.billId, input.registerId, input.sessionId);
    if (!bill?.sale || !["PAID", "AMENDED"].includes(bill.status)) throw new PosError("Only an active paid bill can be amended.");
    if (bill.version !== input.expectedVersion) throw new PosError("This bill changed. Reload it before amending.");
    await materializeLegacyStock(tx, bill);
    bill = await loadBill(tx, input.billId, input.registerId, input.sessionId);
    if (!bill?.sale) throw new PosError("The bill could not be reloaded.");

    const nextQuantities = quantityMap(input.quantities);
    if (nextQuantities.size !== bill.sale.items.length || bill.sale.items.some((item) => !nextQuantities.has(item.id))) {
      throw new PosError("Every existing bill item must include its new quantity.");
    }
    if (![...nextQuantities.values()].some((quantity) => quantity > 0)) throw new PosError("Use full reversal instead of amending a bill to zero.");
    const increases = new Map<string, number>();
    const trackedReductions = new Map<string, number>();
    const changes: string[] = [];
    for (const item of bill.sale.items) {
      const next = nextQuantities.get(item.id)!;
      if (next === item.quantity) continue;
      changes.push(`${item.productName} quantity ${item.quantity} → ${next}.`);
      if (next > item.quantity) increases.set(item.id, next - item.quantity);
      else {
        const decrease = item.quantity - next;
        const tracked = trackedItemQuantity(item);
        const untracked = Math.max(0, item.quantity - tracked);
        trackedReductions.set(item.id, Math.max(0, decrease - untracked));
      }
    }
    if (!changes.length) throw new PosError("Change at least one item quantity.");

    const addedSelection = mergeQuantities(input.addedStock.mode, increases, input.addedStock);
    const restoreSelection = mergeQuantities(input.removedStock.mode, trackedReductions, input.removedStock);
    if (increases.size) changes.push(`Added-quantity stock handling: ${input.addedStock.mode.toLowerCase()}.`);
    if ([...trackedReductions.values()].some((quantity) => quantity > 0)) changes.push(`Removed-quantity stock reversal: ${input.removedStock.mode.toLowerCase()}.`);
    const restoredTotals = new Map<string, number>();
    for (const item of bill.sale.items) {
      const release = trackedReductions.get(item.id) ?? 0;
      if (!release) continue;
      const restored = await releaseItemStock(tx, item, release, restoreSelection.get(item.id) ?? 0);
      for (const [productId, quantity] of restored) restoredTotals.set(productId, Number(((restoredTotals.get(productId) ?? 0) + quantity).toFixed(3)));
    }
    await createRefundMovements(tx, bill, input.actorId, restoredTotals);
    await deductAddedStock(tx, bill, bill.sale.items, addedSelection, input.actorId);

    for (const item of bill.sale.items) {
      const quantity = nextQuantities.get(item.id)!;
      await tx.saleItem.update({ where: { id: item.id }, data: { quantity, lineTotalLaari: quantity * item.unitPriceLaari } });
    }
    const currentItems = bill.sale.items.map((item) => ({ ...item, quantity: nextQuantities.get(item.id)!, lineTotalLaari: nextQuantities.get(item.id)! * item.unitPriceLaari })).filter((item) => item.quantity > 0);
    const snapshot = makeBillSnapshot(currentItems, bill.paymentMethod, bill.customerNote, bill.restaurantTableId && bill.restaurantTableName ? { id: bill.restaurantTableId, name: bill.restaurantTableName } : null);
    await tx.sale.update({ where: { id: bill.sale.id }, data: { subtotalLaari: snapshot.totalLaari, totalLaari: snapshot.totalLaari } });
    const updated = await tx.bill.updateMany({
      where: { id: bill.id, version: input.expectedVersion, status: { in: ["PAID", "AMENDED"] } },
      data: { status: "AMENDED", subtotalLaari: snapshot.totalLaari, totalLaari: snapshot.totalLaari, items: itemsJson(snapshot), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new PosError("This bill changed. Reload it before amending.");
    if (bill.customerCreditBillId) await tx.customerCreditBill.update({
      where: { id: bill.customerCreditBillId },
      data: { subtotalLaari: snapshot.totalLaari, totalLaari: snapshot.totalLaari, items: currentItems.map((item) => ({
        id: item.id, productId: item.productId, menuItemId: item.menuItemId, productName: item.productName,
        productSku: item.productSku, itemCategory: item.itemCategory, quantity: item.quantity,
        unitPriceLaari: item.unitPriceLaari, lineTotalLaari: item.lineTotalLaari,
        stockComponents: item.stockComponents.map((component) => ({ productId: component.productId, productName: component.product.name, measuredPerItem: quantityNumber(component.measuredPerItem) })),
      })) },
    });
    const metadata = {
      previousTotalLaari: bill.totalLaari,
      currentTotalLaari: snapshot.totalLaari,
      amountDeltaLaari: snapshot.totalLaari - bill.totalLaari,
      addedStock: { mode: input.addedStock.mode, quantities: [...addedSelection].map(([saleItemId, quantity]) => ({ saleItemId, quantity })) },
      removedStock: { mode: input.removedStock.mode, quantities: [...restoreSelection].map(([saleItemId, quantity]) => ({ saleItemId, quantity })) },
    };
    await tx.billRevision.create({ data: {
      billId: bill.id, revision: input.expectedVersion + 1, kind: "AMENDMENT",
      actorId: input.actorId, actorName: input.actorName, changes,
      snapshot: snapshotJson(snapshot), metadata: correctionMetadata(metadata),
    } });
    await tx.auditLog.create({ data: auditCreateData({
      outcome: "SUCCESS", event: "BILL_AMEND", page: "REGISTERS", actorId: input.actorId,
      actorLabel: input.audit.actorLabel, targetType: "bill", targetId: bill.id,
      summary: `Bill #${bill.billNumber} amended.`, metadata: { ...metadata, registerId: bill.registerId, sessionId: bill.registerShiftId }, request: input.audit.request,
    }) });
    return { id: bill.id, version: input.expectedVersion + 1, status: "AMENDED" as const };
  }, { isolationLevel: "Serializable" });
}

export async function reversePaidBill(db: PrismaClient, input: ReversePaidBillInput) {
  return db.$transaction(async (tx) => {
    let bill = await loadBill(tx, input.billId, input.registerId, input.sessionId);
    if (!bill?.sale || !["PAID", "AMENDED"].includes(bill.status)) throw new PosError("Only an active paid bill can be reversed.");
    if (bill.version !== input.expectedVersion) throw new PosError("This bill changed. Reload it before reversing.");
    await materializeLegacyStock(tx, bill);
    bill = await loadBill(tx, input.billId, input.registerId, input.sessionId);
    if (!bill?.sale) throw new PosError("The bill could not be reloaded.");
    const tracked = new Map(bill.sale.items.map((item) => [item.id, trackedItemQuantity(item)]));
    const restoreSelection = mergeQuantities(input.stock.mode, tracked, input.stock);
    const restoredTotals = new Map<string, number>();
    for (const item of bill.sale.items) {
      const release = tracked.get(item.id) ?? 0;
      if (!release) continue;
      const restored = await releaseItemStock(tx, item, release, restoreSelection.get(item.id) ?? 0);
      for (const [productId, quantity] of restored) restoredTotals.set(productId, Number(((restoredTotals.get(productId) ?? 0) + quantity).toFixed(3)));
    }
    await createRefundMovements(tx, bill, input.actorId, restoredTotals);
    const now = new Date();
    await tx.sale.update({ where: { id: bill.sale.id }, data: { status: "REFUNDED", refundedAt: now } });
    const updated = await tx.bill.updateMany({
      where: { id: bill.id, version: input.expectedVersion, status: { in: ["PAID", "AMENDED"] } },
      data: { status: "REVERSED", version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new PosError("This bill changed. Reload it before reversing.");
    if (bill.customerCreditBillId) await tx.customerCreditBill.update({ where: { id: bill.customerCreditBillId }, data: { status: "REVERSED" } });
    const snapshot = makeBillSnapshot(bill.sale.items.filter((item) => item.quantity > 0), bill.paymentMethod, bill.customerNote, bill.restaurantTableId && bill.restaurantTableName ? { id: bill.restaurantTableId, name: bill.restaurantTableName } : null);
    const metadata = {
      previousTotalLaari: bill.totalLaari,
      currentTotalLaari: 0,
      amountDeltaLaari: -bill.totalLaari,
      stock: { mode: input.stock.mode, quantities: [...restoreSelection].map(([saleItemId, quantity]) => ({ saleItemId, quantity })) },
    };
    await tx.billRevision.create({ data: {
      billId: bill.id, revision: input.expectedVersion + 1, kind: "REVERSAL",
      actorId: input.actorId, actorName: input.actorName,
      changes: [`Bill reversed in full (${bill.totalLaari} laari).`, `Stock reversal: ${input.stock.mode.toLowerCase()}.`],
      snapshot: snapshotJson(snapshot), metadata: correctionMetadata(metadata),
    } });
    await tx.auditLog.create({ data: auditCreateData({
      outcome: "SUCCESS", event: "BILL_REVERSE", page: "REGISTERS", actorId: input.actorId,
      actorLabel: input.audit.actorLabel, targetType: "bill", targetId: bill.id,
      summary: `Bill #${bill.billNumber} reversed.`, metadata: { ...metadata, registerId: bill.registerId, sessionId: bill.registerShiftId }, request: input.audit.request,
    }) });
    return { id: bill.id, version: input.expectedVersion + 1, status: "REVERSED" as const };
  }, { isolationLevel: "Serializable" });
}
