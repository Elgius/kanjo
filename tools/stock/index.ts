import "server-only";

import { dateOnly, maldivesDate, quantityNumber } from "@/lib/pos/inventory";
import { getStockData } from "@/lib/pos/queries";
import { defineAiCooTool } from "@/tools/_shared/tool";
import { stockRiskInputSchema, stockRiskOutputSchema, stockSnapshotInputSchema, stockSnapshotOutputSchema } from "./schemas";

export const stockGetSnapshot = defineAiCooTool({
  name: "stock_get_snapshot",
  description: "Return an all-register or single-register stock snapshot with bounded movement history.",
  inputSchema: stockSnapshotInputSchema,
  outputSchema: stockSnapshotOutputSchema,
  execute: ({ registerId, query, movementType }) => getStockData({
    register: registerId,
    query,
    movement: movementType,
  }, null),
});

export const stockGetRisks = defineAiCooTool({
  name: "stock_get_risks",
  description: "Identify low, out-of-stock, expired, and soon-expiring inventory with supporting batch evidence.",
  inputSchema: stockRiskInputSchema,
  outputSchema: stockRiskOutputSchema,
  execute: async ({ registerId, expiryWindowDays }) => {
    const data = await getStockData({ register: registerId }, null);
    const asOf = maldivesDate();
    const asOfDate = dateOnly(asOf);
    const cutoff = new Date(asOf);
    cutoff.setUTCDate(cutoff.getUTCDate() + expiryWindowDays);
    const cutoffDate = dateOnly(cutoff);
    const risks = data.products.flatMap((product) => {
      const expiredBatches = product.batches.filter((batch) => batch.expiryDate && dateOnly(batch.expiryDate) < asOfDate);
      const expiringBatches = product.batches.filter((batch) => {
        if (!batch.expiryDate) return false;
        const expiry = dateOnly(batch.expiryDate);
        return expiry >= asOfDate && expiry <= cutoffDate;
      });
      const riskTypes = [
        ...(product.stockQuantity === 0 ? ["OUT_OF_STOCK"] : []),
        ...(product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold ? ["LOW_STOCK"] : []),
        ...(expiredBatches.length ? ["EXPIRED"] : []),
        ...(expiringBatches.length ? ["EXPIRING_SOON"] : []),
      ];
      if (!riskTypes.length) return [];
      return [{
        productId: product.id,
        name: product.name,
        sku: product.sku,
        register: product.register,
        stockQuantity: product.stockQuantity,
        measuredOnHand: product.measuredOnHand,
        lowStockThreshold: product.lowStockThreshold,
        riskTypes,
        expiredBatches: expiredBatches.map((batch) => ({ id: batch.id, expiryDate: batch.expiryDate, remainingQuantity: quantityNumber(batch.remainingQuantity) })),
        expiringBatches: expiringBatches.map((batch) => ({ id: batch.id, expiryDate: batch.expiryDate, remainingQuantity: quantityNumber(batch.remainingQuantity) })),
      }];
    });
    return {
      asOfDate,
      expiryWindowDays,
      risks,
      counts: {
        total: risks.length,
        lowStock: risks.filter((risk) => risk.riskTypes.includes("LOW_STOCK")).length,
        outOfStock: risks.filter((risk) => risk.riskTypes.includes("OUT_OF_STOCK")).length,
        expired: risks.filter((risk) => risk.riskTypes.includes("EXPIRED")).length,
        expiringSoon: risks.filter((risk) => risk.riskTypes.includes("EXPIRING_SOON")).length,
      },
    };
  },
});

export const stockTools = [stockGetSnapshot, stockGetRisks] as const;
