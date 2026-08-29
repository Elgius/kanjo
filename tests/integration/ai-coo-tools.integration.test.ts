import { expect, mock, test } from "bun:test";

import type { AuthorizationContext } from "@/lib/authorization";
import type { AiCooTool } from "@/tools/_shared/tool";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

mock.module("server-only", () => ({}));

const uuid = "11111111-1111-4111-8111-111111111111";
const authorization: AuthorizationContext = {
  user: {
    id: "ai-coo-integration",
    name: "AI COO Integration",
    email: "ai-coo@example.invalid",
    username: "ai.coo",
    isSiteAdmin: false,
    roleId: uuid,
    roleName: "AI COO",
  },
  capabilities: new Set(["AI_COO_ACCESS"]),
  registerScopeMode: "SELECTED",
  registerIds: new Set<string>(),
  permissions: {
    OVERVIEW: "NONE", AI_COO: "NONE", REGISTERS: "NONE", INVENTORY: "NONE", STOCK: "NONE",
    REPORTING: "NONE", BILL_HISTORY: "NONE", CUSTOMERS: "NONE", SETTINGS: "NONE", AUDIT_LOG: "NONE",
  },
};

databaseDescribe("AI COO read-only tool catalogue", () => {
  test("executes every domain family against an isolated Neon branch", async () => {
    process.env.NEON_DB = testDatabaseUrl;
    const { aiCooToolRegistry } = await import("@/tools");
    const { runAiCooToolWithAuthorization } = await import("@/tools/_shared/tool");
    const requests: Record<string, unknown> = {
      overview_get_operating_brief: {},
      register_selection_get_summary: {},
      register_selection_get_workspace: { registerId: uuid },
      register_sessions_list_registers: {},
      register_sessions_list: { registerId: uuid },
      register_sessions_get_detail: { registerId: uuid, sessionId: uuid },
      register_administration_list: {},
      inventory_search: {},
      stock_get_snapshot: {},
      stock_get_risks: {},
      bill_history_search: {},
      bill_history_continue: { cursor: { openedAt: "2026-08-24T00:00:00.000Z", id: uuid } },
      customers_get_overview: {},
      customers_get_detail: { customerId: uuid },
      settings_list_accounts: {},
      settings_list_roles: {},
      settings_search_audit_log: {},
    };
    for (const [name, request] of Object.entries(requests)) {
      const result = await runAiCooToolWithAuthorization(aiCooToolRegistry[name] as AiCooTool, request, authorization);
      expect(result.ok || (!result.ok && result.error.code === "NOT_FOUND")).toBe(true);
    }
  });
});
