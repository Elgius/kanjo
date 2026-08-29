import "server-only";

import { getAuditLogPage } from "@/lib/audit-log";
import { getSettingsAccounts, getSettingsRoles } from "@/lib/settings-queries";
import { defineAiCooTool } from "@/tools/_shared/tool";
import {
  auditSearchInputSchema,
  auditSearchOutputSchema,
  settingsAccountsOutputSchema,
  settingsListInputSchema,
  settingsRolesOutputSchema,
} from "./schemas";

export const settingsListAccounts = defineAiCooTool({
  name: "settings_list_accounts",
  description: "List team accounts and their roles without credential or session records.",
  inputSchema: settingsListInputSchema,
  outputSchema: settingsAccountsOutputSchema,
  execute: async () => ({ accounts: await getSettingsAccounts() }),
});

export const settingsListRoles = defineAiCooTool({
  name: "settings_list_roles",
  description: "List roles, capabilities, register grants, and assigned-user counts.",
  inputSchema: settingsListInputSchema,
  outputSchema: settingsRolesOutputSchema,
  execute: async () => ({ roles: await getSettingsRoles() }),
});

export const settingsSearchAuditLog = defineAiCooTool({
  name: "settings_search_audit_log",
  description: "Search the global audit trail with actor, outcome, event, area, target, date, and cursor filters.",
  inputSchema: auditSearchInputSchema,
  outputSchema: auditSearchOutputSchema,
  execute: ({ query, ...filters }) => getAuditLogPage({ ...filters, q: query }),
});

export const settingsTools = [settingsListAccounts, settingsListRoles, settingsSearchAuditLog] as const;
