import "server-only";

import { getRegisterSession, getRegisterSessionsPage, getSessionRegisters } from "@/lib/pos/register-sessions";
import { AiCooToolError, defineAiCooTool } from "@/tools/_shared/tool";
import {
  sessionDetailInputSchema,
  sessionDetailOutputSchema,
  sessionListInputSchema,
  sessionListOutputSchema,
  sessionRegistersInputSchema,
  sessionRegistersOutputSchema,
} from "./schemas";

export const registerSessionsListRegisters = defineAiCooTool({
  name: "register_sessions_list_registers",
  description: "List all active registers with their latest and total session counts.",
  inputSchema: sessionRegistersInputSchema,
  outputSchema: sessionRegistersOutputSchema,
  execute: () => getSessionRegisters(null),
});

export const registerSessionsList = defineAiCooTool({
  name: "register_sessions_list",
  description: "Return a bounded page of shift summaries and payment totals for one register.",
  inputSchema: sessionListInputSchema,
  outputSchema: sessionListOutputSchema,
  execute: async ({ registerId, page, pageSize }) => {
    const data = await getRegisterSessionsPage(registerId, page, pageSize, null);
    if (!data) throw new AiCooToolError("NOT_FOUND", "Register not found.");
    return data;
  },
});

export const registerSessionsGetDetail = defineAiCooTool({
  name: "register_sessions_get_detail",
  description: "Inspect one register session's cash variance, sales, bills, revisions, and stock tracking.",
  inputSchema: sessionDetailInputSchema,
  outputSchema: sessionDetailOutputSchema,
  execute: async ({ registerId, sessionId }) => {
    const data = await getRegisterSession(registerId, sessionId, null);
    if (!data) throw new AiCooToolError("NOT_FOUND", "Register session not found.");
    return data;
  },
});

export const registerSessionTools = [registerSessionsListRegisters, registerSessionsList, registerSessionsGetDetail] as const;
