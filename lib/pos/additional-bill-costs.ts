import { parseMvr } from "@/lib/pos/money";
import type { Prisma } from "@/generated/prisma/client";

export type AdditionalBillCostInput = {
  name: string;
  type: "PERCENTAGE" | "FLAT_RATE";
  percentageBasisPoints: number | null;
  flatAmountLaari: number | null;
};

export type AdditionalBillCostRate = {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FLAT_RATE";
  percentageBasisPoints: number | null;
  flatAmountLaari: number | null;
};

export type AppliedAdditionalBillCost = AdditionalBillCostRate & {
  amountLaari: number;
};

export function calculateAdditionalBillCosts(
  subtotalLaari: number,
  rates: readonly AdditionalBillCostRate[],
) {
  if (subtotalLaari <= 0) {
    return { costs: [], additionalCostTotalLaari: 0, totalLaari: subtotalLaari };
  }
  const costs = rates.map<AppliedAdditionalBillCost>((rate) => ({
    ...rate,
    amountLaari: rate.type === "PERCENTAGE"
      ? Math.round(subtotalLaari * (rate.percentageBasisPoints ?? 0) / 10_000)
      : rate.flatAmountLaari ?? 0,
  }));
  const additionalCostTotalLaari = costs.reduce((total, cost) => total + cost.amountLaari, 0);
  return {
    costs,
    additionalCostTotalLaari,
    totalLaari: subtotalLaari + additionalCostTotalLaari,
  };
}

export function parseAppliedAdditionalBillCosts(value: unknown): AppliedAdditionalBillCost[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const cost = raw as Record<string, unknown>;
    const type = cost.type === "PERCENTAGE" || cost.type === "FLAT_RATE" ? cost.type : null;
    if (
      typeof cost.id !== "string"
      || typeof cost.name !== "string"
      || !type
      || !Number.isSafeInteger(cost.amountLaari)
      || Number(cost.amountLaari) < 0
    ) return [];
    const percentageBasisPoints = Number.isSafeInteger(cost.percentageBasisPoints)
      ? Number(cost.percentageBasisPoints)
      : null;
    const flatAmountLaari = Number.isSafeInteger(cost.flatAmountLaari)
      ? Number(cost.flatAmountLaari)
      : null;
    if (type === "PERCENTAGE" && (percentageBasisPoints === null || flatAmountLaari !== null)) return [];
    if (type === "FLAT_RATE" && (flatAmountLaari === null || percentageBasisPoints !== null)) return [];
    return [{
      id: cost.id,
      name: cost.name,
      type,
      percentageBasisPoints,
      flatAmountLaari,
      amountLaari: Number(cost.amountLaari),
    }];
  });
}

export function additionalBillCostsJson(costs: readonly AppliedAdditionalBillCost[]): Prisma.InputJsonValue {
  return costs as unknown as Prisma.InputJsonValue;
}

export function parsePercentageBasisPoints(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const basisPoints = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(basisPoints) && basisPoints >= 1 && basisPoints <= 10_000
    ? basisPoints
    : null;
}

export function parseAdditionalBillCostForm(formData: FormData):
  | { ok: true; data: AdditionalBillCostInput }
  | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const type = formData.get("type") === "FLAT_RATE" ? "FLAT_RATE" : "PERCENTAGE";
  const percentageBasisPoints = type === "PERCENTAGE"
    ? parsePercentageBasisPoints(formData.get("percentage"))
    : null;
  const flatAmountLaari = type === "FLAT_RATE" ? parseMvr(formData.get("flatAmount")) : null;

  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Additional cost names must be between 2 and 80 characters." };
  }
  if (type === "PERCENTAGE" && percentageBasisPoints === null) {
    return { ok: false, error: "Enter a percentage greater than 0 and no more than 100." };
  }
  if (type === "FLAT_RATE" && (!flatAmountLaari || flatAmountLaari < 1)) {
    return { ok: false, error: "Enter a flat rate greater than MVR 0.00." };
  }

  return {
    ok: true,
    data: { name, type, percentageBasisPoints, flatAmountLaari },
  };
}
