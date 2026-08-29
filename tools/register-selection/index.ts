import "server-only";

import { getRegisterManagementData, getRegistersData } from "@/lib/pos/queries";
import { AiCooToolError, defineAiCooTool } from "@/tools/_shared/tool";
import {
  registerSelectionSummaryInputSchema,
  registerSelectionSummaryOutputSchema,
  registerSelectionWorkspaceInputSchema,
  registerSelectionWorkspaceOutputSchema,
} from "./schemas";

export const registerSelectionGetSummary = defineAiCooTool({
  name: "register_selection_get_summary",
  description: "List all registers and summarize current shifts, cash expectations, sales, and sellable items.",
  inputSchema: registerSelectionSummaryInputSchema,
  outputSchema: registerSelectionSummaryOutputSchema,
  execute: ({ registerId }) => getRegistersData(registerId, null),
});

export const registerSelectionGetWorkspace = defineAiCooTool({
  name: "register_selection_get_workspace",
  description: "Inspect one register's live shift, sellable items, held orders, tables, customers, and optional receipt.",
  inputSchema: registerSelectionWorkspaceInputSchema,
  outputSchema: registerSelectionWorkspaceOutputSchema,
  execute: async ({ registerId, receiptId }) => {
    const data = await getRegisterManagementData(registerId, receiptId, null);
    if (!data) throw new AiCooToolError("NOT_FOUND", "Register not found.");
    return data;
  },
});

export const registerSelectionTools = [registerSelectionGetSummary, registerSelectionGetWorkspace] as const;
