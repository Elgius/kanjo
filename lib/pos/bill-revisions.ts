import { Prisma } from "@/generated/prisma/client";
import type { BillRevisionKind, PaymentMethod } from "@/generated/prisma/enums";

export type BillSnapshotItem = {
  productId: string | null;
  menuItemId: string | null;
  productName: string;
  productSku: string | null;
  itemCategory: string;
  quantity: number;
  unitPriceLaari: number;
  lineTotalLaari: number;
};

export type BillSnapshot = {
  items: BillSnapshotItem[];
  subtotalLaari: number;
  totalLaari: number;
  paymentMethod: PaymentMethod;
  customerNote: string | null;
  restaurantTableId: string | null;
  restaurantTableName: string | null;
};

type SnapshotLine = Omit<BillSnapshotItem, "productId" | "menuItemId"> & {
  productId?: string | null;
  menuItemId?: string | null;
};

export function makeBillSnapshot(
  lines: readonly SnapshotLine[],
  paymentMethod: PaymentMethod,
  customerNote: string | null,
  restaurantTable: { id: string; name: string } | null,
): BillSnapshot {
  const totalLaari = lines.reduce((total, line) => total + line.lineTotalLaari, 0);
  return {
    items: lines.map((line) => ({
      productId: line.productId ?? null,
      menuItemId: line.menuItemId ?? null,
      productName: line.productName,
      productSku: line.productSku,
      itemCategory: line.itemCategory,
      quantity: line.quantity,
      unitPriceLaari: line.unitPriceLaari,
      lineTotalLaari: line.lineTotalLaari,
    })),
    subtotalLaari: totalLaari,
    totalLaari,
    paymentMethod,
    customerNote: customerNote?.trim().slice(0, 500) || null,
    restaurantTableId: restaurantTable?.id ?? null,
    restaurantTableName: restaurantTable?.name ?? null,
  };
}

export function parseBillSnapshot(value: Prisma.JsonValue): BillSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, Prisma.JsonValue>;
  if (
    !Array.isArray(snapshot.items)
    || typeof snapshot.subtotalLaari !== "number"
    || typeof snapshot.totalLaari !== "number"
    || !["CASH", "CARD", "MOBILE"].includes(String(snapshot.paymentMethod))
  ) return null;
  const items: BillSnapshotItem[] = [];
  for (const raw of snapshot.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, Prisma.JsonValue>;
    if (
      typeof item.productName !== "string"
      || typeof item.itemCategory !== "string"
      || typeof item.quantity !== "number"
      || typeof item.unitPriceLaari !== "number"
      || typeof item.lineTotalLaari !== "number"
    ) return null;
    items.push({
      productId: typeof item.productId === "string" ? item.productId : null,
      menuItemId: typeof item.menuItemId === "string" ? item.menuItemId : null,
      productName: item.productName,
      productSku: typeof item.productSku === "string" ? item.productSku : null,
      itemCategory: item.itemCategory,
      quantity: item.quantity,
      unitPriceLaari: item.unitPriceLaari,
      lineTotalLaari: item.lineTotalLaari,
    });
  }
  return {
    items,
    subtotalLaari: snapshot.subtotalLaari,
    totalLaari: snapshot.totalLaari,
    paymentMethod: snapshot.paymentMethod as PaymentMethod,
    customerNote: typeof snapshot.customerNote === "string" ? snapshot.customerNote : null,
    restaurantTableId: typeof snapshot.restaurantTableId === "string" ? snapshot.restaurantTableId : null,
    restaurantTableName: typeof snapshot.restaurantTableName === "string" ? snapshot.restaurantTableName : null,
  };
}

function itemKey(item: BillSnapshotItem) {
  return item.productId ? `product:${item.productId}` : item.menuItemId ? `menu:${item.menuItemId}` : `legacy:${item.productName}:${item.productSku ?? ""}`;
}

function paymentLabel(method: PaymentMethod) {
  return method === "MOBILE" ? "Mobile pay" : method[0] + method.slice(1).toLowerCase();
}

export function describeBillChanges(before: BillSnapshot, after: BillSnapshot): string[] {
  const changes: string[] = [];
  const previous = new Map(before.items.map((item) => [itemKey(item), item]));
  const current = new Map(after.items.map((item) => [itemKey(item), item]));
  const keys = Array.from(new Set([...previous.keys(), ...current.keys()])).sort((left, right) => {
    const leftName = current.get(left)?.productName ?? previous.get(left)?.productName ?? left;
    const rightName = current.get(right)?.productName ?? previous.get(right)?.productName ?? right;
    return leftName.localeCompare(rightName);
  });
  for (const key of keys) {
    const oldItem = previous.get(key);
    const newItem = current.get(key);
    if (!oldItem && newItem) changes.push(`${newItem.productName} added ×${newItem.quantity}.`);
    else if (oldItem && !newItem) changes.push(`${oldItem.productName} removed ×${oldItem.quantity}.`);
    else if (oldItem && newItem) {
      if (oldItem.quantity !== newItem.quantity) changes.push(`${newItem.productName} quantity ${oldItem.quantity} → ${newItem.quantity}.`);
      if (oldItem.unitPriceLaari !== newItem.unitPriceLaari) changes.push(`${newItem.productName} unit price changed.`);
    }
  }
  if (before.paymentMethod !== after.paymentMethod) {
    changes.push(`Payment method ${paymentLabel(before.paymentMethod)} → ${paymentLabel(after.paymentMethod)}.`);
  }
  if (before.restaurantTableId !== after.restaurantTableId) {
    changes.push(`Table ${before.restaurantTableName ?? "Unassigned"} → ${after.restaurantTableName ?? "Unassigned"}.`);
  }
  if (before.customerNote !== after.customerNote) changes.push("Customer note changed.");
  return changes;
}

export function snapshotJson(snapshot: BillSnapshot): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

export function itemsJson(snapshot: BillSnapshot): Prisma.InputJsonValue {
  return snapshot.items as unknown as Prisma.InputJsonValue;
}

export function eventChanges(kind: BillRevisionKind, snapshot: BillSnapshot, changes: string[] = []) {
  if (changes.length) return changes;
  if (kind === "INITIAL_PRINT") return ["Unpaid bill printed."];
  if (kind === "REPRINT") return ["Unpaid bill reprinted."];
  if (kind === "CREDIT_ISSUED") return ["Bill moved to customer credit."];
  if (kind === "PAYMENT") return [`Bill paid via ${paymentLabel(snapshot.paymentMethod)}.`];
  if (kind === "CANCELLATION") return ["Bill cancelled."];
  return [];
}
