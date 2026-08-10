import { Prisma } from "@/generated/prisma/client";

type QuantityProduct = {
  kind: "GOODS" | "CONSUMABLE";
  quantityValue: Prisma.Decimal | null;
  servingSize: Prisma.Decimal | null;
};

export function measuredPerStockUnit(product: QuantityProduct) {
  return product.kind === "CONSUMABLE" ? Number(product.quantityValue ?? 0) : 1;
}

export function measuredPerServing(product: QuantityProduct) {
  return product.kind === "CONSUMABLE" ? Number(product.servingSize ?? 0) : 1;
}

export function measured(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}

export function quantityNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

export function stockUnitsFromMeasured(product: QuantityProduct, quantity: number) {
  const perUnit = measuredPerStockUnit(product);
  return perUnit > 0 ? quantity / perUnit : 0;
}

export function maldivesDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Maldives",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}

export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatQuantity(product: QuantityProduct & { quantityMetric: string | null }, quantity: number) {
  const value = Number(quantity.toFixed(3)).toLocaleString("en-MV", { maximumFractionDigits: 3 });
  return product.kind === "CONSUMABLE" ? `${value} ${product.quantityMetric}` : `${value} units`;
}
