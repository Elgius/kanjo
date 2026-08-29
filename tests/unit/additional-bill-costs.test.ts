import { describe, expect, test } from "bun:test";

import { calculateAdditionalBillCosts, parseAdditionalBillCostForm, parsePercentageBasisPoints } from "@/lib/pos/additional-bill-costs";

describe("additional bill costs", () => {
  test("stores percentages as integer basis points", () => {
    expect(parsePercentageBasisPoints("6")).toBe(600);
    expect(parsePercentageBasisPoints("6.25")).toBe(625);
    expect(parsePercentageBasisPoints("0")).toBeNull();
    expect(parsePercentageBasisPoints("100.01")).toBeNull();
  });

  test("parses a percentage cost without a flat amount", () => {
    const formData = new FormData();
    formData.set("name", "  Tourism   GST  ");
    formData.set("type", "PERCENTAGE");
    formData.set("percentage", "6");
    formData.set("flatAmount", "10");

    expect(JSON.stringify(parseAdditionalBillCostForm(formData))).toBe(JSON.stringify({
      ok: true,
      data: {
        name: "Tourism GST",
        type: "PERCENTAGE",
        percentageBasisPoints: 600,
        flatAmountLaari: null,
      },
    }));
  });

  test("parses a flat MVR cost in laari without a percentage", () => {
    const formData = new FormData();
    formData.set("name", "Plastic bag");
    formData.set("type", "FLAT_RATE");
    formData.set("flatAmount", "10.50");

    expect(JSON.stringify(parseAdditionalBillCostForm(formData))).toBe(JSON.stringify({
      ok: true,
      data: {
        name: "Plastic bag",
        type: "FLAT_RATE",
        percentageBasisPoints: null,
        flatAmountLaari: 1_050,
      },
    }));
  });

  test("adds percentage and flat costs to the item subtotal", () => {
    const result = calculateAdditionalBillCosts(10_055, [
      { id: "gst", name: "GST", type: "PERCENTAGE", percentageBasisPoints: 600, flatAmountLaari: null },
      { id: "bag", name: "Plastic bag", type: "FLAT_RATE", percentageBasisPoints: null, flatAmountLaari: 1_000 },
    ]);

    expect(result.costs[0]?.amountLaari).toBe(603);
    expect(result.costs[1]?.amountLaari).toBe(1_000);
    expect(result.additionalCostTotalLaari).toBe(1_603);
    expect(result.totalLaari).toBe(11_658);
  });

  test("does not create a flat-cost-only bill without items", () => {
    const result = calculateAdditionalBillCosts(0, [
      { id: "bag", name: "Plastic bag", type: "FLAT_RATE", percentageBasisPoints: null, flatAmountLaari: 1_000 },
    ]);
    expect(result.costs.length).toBe(0);
    expect(result.totalLaari).toBe(0);
  });
});
