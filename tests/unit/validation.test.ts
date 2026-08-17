import { describe, expect, test } from "bun:test";

import { parseCreditSettlementForm, parseCustomerForm, parseMenuItemForm, parseProductForm, parseRegisterCartForm, parseRegisterEditForm, parseRegisterForm, parseRestaurantTableForm, parseSaleForm, parseStockAdjustment } from "@/lib/pos/validation";

describe("POS form validation", () => {
  test("normalizes a valid product", () => {
    const form = new FormData();
    form.set("name", "  Coconut water  ");
    form.set("registerId", "register-id");
    form.set("categoryId", "category-id");
    form.set("retailPrice", "25.50");
    form.set("costPrice", "12");
    form.set("stockQuantity", "8");
    form.set("lowStockThreshold", "3");
    form.set("kind", "GOODS");

    const result = parseProductForm(form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.categoryId).toBe("category-id");
      expect(result.data.retailPriceLaari).toBe(2550);
      expect(result.data.openingStock).toBe(8);
    }
  });

  test("rejects negative stock and zero adjustments", () => {
    const product = new FormData();
    product.set("name", "Item");
    product.set("registerId", "register-id");
    product.set("categoryId", "category-id");
    product.set("retailPrice", "1");
    product.set("costPrice", "1");
    product.set("stockQuantity", "-1");
    product.set("lowStockThreshold", "0");
    product.set("kind", "GOODS");
    expect(parseProductForm(product).ok).toBe(false);

    const adjustment = new FormData();
    adjustment.set("quantityDelta", "0");
    expect(parseStockAdjustment(adjustment).ok).toBe(false);
  });

  test("requires serving details for consumables", () => {
    const consumable = new FormData();
    consumable.set("name", "Coffee beans");
    consumable.set("registerId", "register-id");
    consumable.set("categoryId", "category-id");
    consumable.set("retailPrice", "35");
    consumable.set("costPrice", "18");
    consumable.set("stockQuantity", "4");
    consumable.set("lowStockThreshold", "1");
    consumable.set("kind", "CONSUMABLE");
    expect(parseProductForm(consumable).ok).toBe(false);

    consumable.set("quantityMetric", "g");
    consumable.set("quantityValue", "1000");
    consumable.set("servingSize", "18.5");
    const result = parseProductForm(consumable);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.kind).toBe("CONSUMABLE");
      expect(result.data.servingSize).toBe("18.5");
    }
  });

  test("accepts supported sale payment methods only", () => {
    const sale = new FormData();
    sale.set("itemId", "product-id");
    sale.set("quantity", "2");
    sale.set("paymentMethod", "CARD");
    expect(parseSaleForm(sale).ok).toBe(true);

    sale.set("paymentMethod", "CRYPTO");
    expect(parseSaleForm(sale).ok).toBe(false);
  });

  test("validates multi-item register carts", () => {
    const cart = new FormData();
    cart.set("items", JSON.stringify([
      { itemId: "first", quantity: 2 },
      { itemId: "second", quantity: 1 },
    ]));
    cart.set("paymentMethod", "MOBILE");
    cart.set("customerNote", "  Less ice  ");
    const result = parseRegisterCartForm(cart);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.customerNote).toBe("Less ice");
      expect(result.data.paymentMethod).toBe("MOBILE");
    }

    cart.set("items", JSON.stringify([{ itemId: "first", quantity: 0 }]));
    expect(parseRegisterCartForm(cart).ok).toBe(false);
  });

  test("requires a supported register purpose", () => {
    const form = new FormData();
    form.set("name", "Restaurant");
    expect(parseRegisterForm(form).ok).toBe(false);
    form.set("purpose", "RESTAURANT");
    expect(JSON.stringify(parseRegisterForm(form))).toBe(JSON.stringify({ ok: true, data: { name: "Restaurant", purpose: "RESTAURANT" } }));
    form.set("status", "ARCHIVED");
    expect(JSON.stringify(parseRegisterEditForm(form))).toBe(JSON.stringify({ ok: true, data: { name: "Restaurant", purpose: "RESTAURANT", active: false } }));
  });

  test("validates restaurant table names and seat counts", () => {
    const form = new FormData();
    form.set("name", "  Window   1  ");
    form.set("seats", "4");
    expect(JSON.stringify(parseRestaurantTableForm(form))).toBe(JSON.stringify({
      ok: true,
      data: { name: "Window 1", seats: 4 },
    }));

    form.set("seats", "0");
    expect(parseRestaurantTableForm(form).ok).toBe(false);
    form.set("seats", "4.5");
    expect(parseRestaurantTableForm(form).ok).toBe(false);
  });

  test("validates customer credit details and settlement methods", () => {
    const customer = new FormData();
    customer.set("name", "  Amina   Ali ");
    customer.set("email", "amina@example.com");
    customer.set("nationality", "Maldivian");
    customer.set("creditLimit", "2500.50");
    const parsed = parseCustomerForm(customer);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.name).toBe("Amina Ali");
      expect(parsed.data.creditLimitLaari).toBe(250050);
    }

    customer.set("email", "not-an-email");
    expect(parseCustomerForm(customer).ok).toBe(false);
    const settlement = new FormData();
    settlement.set("paymentMethod", "CARD");
    expect(parseCreditSettlementForm(settlement).ok).toBe(true);
    settlement.set("paymentMethod", "CREDIT");
    expect(parseCreditSettlementForm(settlement).ok).toBe(false);
  });

  test("validates menu recipes and whole serving multiples", () => {
    const form = new FormData();
    form.set("name", "Espresso"); form.set("category", "Coffee"); form.set("retailPrice", "45");
    form.append("ingredientProductId", "beans"); form.append("servingMultiplier", "1");
    form.append("standaloneProductId", "beans");
    const parsed = parseMenuItemForm(form);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.ingredients[0].standalone).toBe(true);
    form.set("servingMultiplier", "0.5");
    expect(parseMenuItemForm(form).ok).toBe(false);
  });
});
