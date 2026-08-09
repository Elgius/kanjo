import { describe, expect, test } from "bun:test";

import { parseProductForm, parseSaleForm, parseStockAdjustment } from "@/lib/pos/validation";

describe("POS form validation", () => {
  test("normalizes a valid product", () => {
    const form = new FormData();
    form.set("name", "  Coconut water  ");
    form.set("sku", " bev-001 ");
    form.set("category", "Beverages");
    form.set("retailPrice", "25.50");
    form.set("costPrice", "12");
    form.set("stockQuantity", "8");
    form.set("lowStockThreshold", "3");

    const result = parseProductForm(form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sku).toBe("BEV-001");
      expect(result.data.retailPriceLaari).toBe(2550);
      expect(result.data.stockQuantity).toBe(8);
    }
  });

  test("rejects negative stock and zero adjustments", () => {
    const product = new FormData();
    product.set("name", "Item");
    product.set("sku", "SKU");
    product.set("category", "Other");
    product.set("retailPrice", "1");
    product.set("costPrice", "1");
    product.set("stockQuantity", "-1");
    product.set("lowStockThreshold", "0");
    expect(parseProductForm(product).ok).toBe(false);

    const adjustment = new FormData();
    adjustment.set("quantityDelta", "0");
    expect(parseStockAdjustment(adjustment).ok).toBe(false);
  });

  test("accepts supported sale payment methods only", () => {
    const sale = new FormData();
    sale.set("productId", "product-id");
    sale.set("quantity", "2");
    sale.set("paymentMethod", "CARD");
    expect(parseSaleForm(sale).ok).toBe(true);

    sale.set("paymentMethod", "CRYPTO");
    expect(parseSaleForm(sale).ok).toBe(false);
  });
});
