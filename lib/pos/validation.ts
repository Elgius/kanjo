import { parseMvr } from "@/lib/pos/money";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveDecimal(value: string) {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? value : null;
}

export type ProductInput = {
  registerId: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  description: string | null;
  retailPriceLaari: number;
  costPriceLaari: number;
  stockQuantity: number;
  lowStockThreshold: number;
  kind: "GOODS" | "CONSUMABLE";
  quantityMetric: string | null;
  quantityValue: string | null;
  servingSize: string | null;
};

export function parseProductForm(formData: FormData): ValidationResult<ProductInput> {
  const name = text(formData, "name");
  const registerId = text(formData, "registerId");
  const sku = text(formData, "sku").toUpperCase();
  const category = text(formData, "category");
  const retailPriceLaari = parseMvr(formData.get("retailPrice"));
  const costPriceLaari = parseMvr(formData.get("costPrice"));
  const stockQuantity = nonNegativeInteger(text(formData, "stockQuantity"));
  const lowStockThreshold = nonNegativeInteger(text(formData, "lowStockThreshold"));
  const kind = text(formData, "kind");

  if (!name || !sku || !category || !registerId) {
    return { ok: false, error: "Register, name, SKU, and category are required." };
  }
  if (retailPriceLaari === null || costPriceLaari === null) {
    return { ok: false, error: "Prices must be valid non-negative MVR amounts." };
  }
  if (stockQuantity === null || lowStockThreshold === null) {
    return { ok: false, error: "Stock values must be non-negative whole numbers." };
  }
  if (kind !== "GOODS" && kind !== "CONSUMABLE") {
    return { ok: false, error: "Select whether this item is goods or consumable." };
  }

  const quantityMetric = kind === "CONSUMABLE" ? text(formData, "quantityMetric") : null;
  const quantityValue = kind === "CONSUMABLE"
    ? positiveDecimal(text(formData, "quantityValue"))
    : null;
  const servingSize = kind === "CONSUMABLE"
    ? positiveDecimal(text(formData, "servingSize"))
    : null;
  if (kind === "CONSUMABLE" && (!quantityMetric || !quantityValue || !servingSize)) {
    return {
      ok: false,
      error: "Consumables need a quantity unit, total quantity, and serving size.",
    };
  }
  if (
    kind === "CONSUMABLE" &&
    Number(servingSize) > Number(quantityValue)
  ) {
    return { ok: false, error: "Serving size cannot exceed the total quantity." };
  }

  return {
    ok: true,
    data: {
      registerId,
      name,
      sku,
      category,
      barcode: text(formData, "barcode") || null,
      description: text(formData, "description") || null,
      retailPriceLaari,
      costPriceLaari,
      stockQuantity,
      lowStockThreshold,
      kind,
      quantityMetric,
      quantityValue,
      servingSize,
    },
  };
}

export function parseStockAdjustment(formData: FormData) {
  const rawDelta = text(formData, "quantityDelta");
  const quantityDelta = Number(rawDelta);
  if (!/^-?\d+$/.test(rawDelta) || !Number.isSafeInteger(quantityDelta) || quantityDelta === 0) {
    return { ok: false, error: "Adjustment must be a non-zero whole number." } as const;
  }
  return {
    ok: true,
    data: { quantityDelta, reason: text(formData, "reason") || "Manual adjustment" },
  } as const;
}

export function parseRegisterForm(formData: FormData) {
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name");
  if (!code || !name) {
    return { ok: false, error: "Register code and name are required." } as const;
  }
  return { ok: true, data: { code, name } } as const;
}

export function parseOpeningCash(formData: FormData) {
  const openingCashLaari = parseMvr(formData.get("openingCash"));
  if (openingCashLaari === null) {
    return { ok: false, error: "Opening cash must be a valid non-negative MVR amount." } as const;
  }
  return { ok: true, data: { openingCashLaari } } as const;
}

export function parseClosingCash(formData: FormData) {
  const closingCashLaari = parseMvr(formData.get("closingCash"));
  if (closingCashLaari === null) {
    return { ok: false, error: "Closing cash must be a valid non-negative MVR amount." } as const;
  }
  return { ok: true, data: { closingCashLaari } } as const;
}

export function parseSaleForm(formData: FormData) {
  const productId = text(formData, "productId");
  const rawQuantity = text(formData, "quantity");
  const quantity = Number(rawQuantity);
  const paymentMethod = text(formData, "paymentMethod");

  if (!productId || !/^\d+$/.test(rawQuantity) || !Number.isSafeInteger(quantity) || quantity < 1) {
    return { ok: false, error: "Select a product and enter a positive quantity." } as const;
  }
  if (!(["CASH", "CARD", "MOBILE"] as const).includes(paymentMethod as "CASH" | "CARD" | "MOBILE")) {
    return { ok: false, error: "Select a supported payment method." } as const;
  }

  return {
    ok: true,
    data: {
      paymentMethod: paymentMethod as "CASH" | "CARD" | "MOBILE",
      items: [{ productId, quantity }],
    },
  } as const;
}
