import "server-only";

import { getBillHistoryOverview, getBillHistoryPage } from "@/lib/pos/bills";
import { defineAiCooTool } from "@/tools/_shared/tool";
import {
  billHistoryContinueInputSchema,
  billHistoryContinueOutputSchema,
  billHistorySearchInputSchema,
  billHistorySearchOutputSchema,
} from "./schemas";

export const billHistorySearch = defineAiCooTool({
  name: "bill_history_search",
  description: "Search all-register bill history with payment, status, and Maldives date/time filters.",
  inputSchema: billHistorySearchInputSchema,
  outputSchema: billHistorySearchOutputSchema,
  execute: (filters) => getBillHistoryOverview(filters, null),
});

export const billHistoryContinue = defineAiCooTool({
  name: "bill_history_continue",
  description: "Continue a bill-history search from its opaque cursor without recomputing summary totals.",
  inputSchema: billHistoryContinueInputSchema,
  outputSchema: billHistoryContinueOutputSchema,
  execute: ({ cursor, ...filters }) => getBillHistoryPage(filters, cursor, null),
});

export const billHistoryTools = [billHistorySearch, billHistoryContinue] as const;
