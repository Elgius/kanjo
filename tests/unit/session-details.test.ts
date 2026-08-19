import { describe, expect, test } from "bun:test";

import { summarizeSessionDetails } from "@/lib/pos/session-details";

describe("session detail summaries", () => {
  test("totals completed payments by method and Maldives hour", () => {
    const details = summarizeSessionDetails([
      { status: "COMPLETED", paymentMethod: "CASH", totalLaari: 1_000, createdAt: new Date("2026-08-18T19:15:00.000Z") },
      { status: "COMPLETED", paymentMethod: "CASH", totalLaari: 2_500, createdAt: new Date("2026-08-18T19:45:00.000Z") },
      { status: "COMPLETED", paymentMethod: "CARD", totalLaari: 4_000, createdAt: new Date("2026-08-18T20:10:00.000Z") },
      { status: "COMPLETED", paymentMethod: "MOBILE", totalLaari: 7_500, createdAt: new Date("2026-08-19T07:00:00.000Z") },
      { status: "REFUNDED", paymentMethod: "CASH", totalLaari: 9_999, createdAt: new Date("2026-08-18T19:30:00.000Z") },
    ]);

    expect(JSON.stringify(details.paymentMethods)).toBe(JSON.stringify([
      { paymentMethod: "CASH", label: "Cash", totalLaari: 3_500, count: 2 },
      { paymentMethod: "CARD", label: "Card", totalLaari: 4_000, count: 1 },
      { paymentMethod: "MOBILE", label: "Mobile pay", totalLaari: 7_500, count: 1 },
    ]));
    expect(details.hourlyPayments.length).toBe(24);
    expect(details.hourlyPayments[0].count).toBe(2);
    expect(details.hourlyPayments[1].count).toBe(1);
    expect(details.hourlyPayments[12].count).toBe(1);
    expect(details.hourlyPayments.reduce((total, hour) => total + hour.count, 0)).toBe(4);
  });
});
