import { describe, expect, test } from "bun:test";

import { describeBillChanges, makeBillSnapshot, parseBillSnapshot, snapshotJson } from "@/lib/pos/bill-revisions";

const coffee = {
  productId: "coffee",
  productName: "Coffee",
  productSku: "COF",
  itemCategory: "Drinks",
  quantity: 1,
  unitPriceLaari: 1_500,
  lineTotalLaari: 1_500,
};

describe("bill revision snapshots", () => {
  test("describes item additions, removals, and quantity changes deterministically", () => {
    const before = makeBillSnapshot([
      coffee,
      { ...coffee, productId: "nuts", productName: "Nuts", productSku: "NUT", quantity: 2, unitPriceLaari: 500, lineTotalLaari: 1_000 },
    ], "CASH", null, null);
    const after = makeBillSnapshot([
      { ...coffee, quantity: 3, lineTotalLaari: 4_500 },
      { ...coffee, productId: "water", productName: "Water", productSku: "WAT", unitPriceLaari: 500, lineTotalLaari: 500 },
    ], "CASH", null, null);

    expect(JSON.stringify(describeBillChanges(before, after))).toBe(JSON.stringify([
      "Coffee quantity 1 → 3.",
      "Nuts removed ×2.",
      "Water added ×1.",
    ]));
  });

  test("describes payment, table, and note amendments", () => {
    const before = makeBillSnapshot([coffee], "CASH", null, null);
    const after = makeBillSnapshot([coffee], "MOBILE", "Window table", { id: "table-1", name: "Table 1" });
    expect(JSON.stringify(describeBillChanges(before, after))).toBe(JSON.stringify([
      "Payment method Cash → Mobile pay.",
      "Table Unassigned → Table 1.",
      "Customer note changed.",
    ]));
  });

  test("does not create changes for an equivalent snapshot", () => {
    const snapshot = makeBillSnapshot([coffee], "CARD", "Same", { id: "table-1", name: "Table 1" });
    expect(JSON.stringify(describeBillChanges(snapshot, snapshot))).toBe("[]");
    expect(JSON.stringify(parseBillSnapshot(snapshotJson(snapshot) as never))).toBe(JSON.stringify(snapshot));
  });
});
