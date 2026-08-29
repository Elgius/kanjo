import "server-only";

import { getInventoryData } from "@/lib/pos/queries";
import { defineAiCooTool } from "@/tools/_shared/tool";
import { inventorySearchInputSchema, inventorySearchOutputSchema } from "./schemas";

export const inventorySearch = defineAiCooTool({
  name: "inventory_search",
  description: "Search the all-register product catalogue and return pricing, stock, batches, categories, and inventory metrics.",
  inputSchema: inventorySearchInputSchema,
  outputSchema: inventorySearchOutputSchema,
  execute: ({ query, category, registerId, status, sort, page }) => getInventoryData({
    query,
    category,
    register: registerId,
    status,
    sort,
    page,
  }, null),
});

export const inventoryTools = [inventorySearch] as const;
