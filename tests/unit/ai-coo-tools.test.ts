import { describe, expect, mock, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

mock.module("server-only", () => ({}));

import type { AuthorizationContext } from "@/lib/authorization";
const { aiCooTools } = await import("@/tools");
const { normalizeJson, runAiCooTool } = await import("@/tools/_shared/tool");

function authorization(options: { ai?: boolean; admin?: boolean } = {}): AuthorizationContext {
  return {
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.invalid",
      username: "test.user",
      isSiteAdmin: options.admin ?? false,
      roleId: "11111111-1111-4111-8111-111111111111",
      roleName: "Test",
    },
    capabilities: new Set(options.ai ? ["AI_COO_ACCESS"] : []),
    registerScopeMode: "SELECTED",
    registerIds: new Set(["22222222-2222-4222-8222-222222222222"]),
    permissions: {
      OVERVIEW: "NONE", AI_COO: "NONE", REGISTERS: "NONE", INVENTORY: "NONE", STOCK: "NONE",
      REPORTING: "NONE", BILL_HISTORY: "NONE", CUSTOMERS: "NONE", SETTINGS: "NONE", AUDIT_LOG: "NONE",
    },
  };
}

const configuration = {
  name: "test_tool",
  description: "Test tool",
  inputSchema: z.object({ value: z.number().int() }).strict(),
  outputSchema: z.object({ value: z.number().int(), at: z.string(), large: z.string() }).strict(),
  execute: async ({ value }: { value: number }) => ({ value, at: new Date("2026-08-24T00:00:00.000Z"), large: BigInt(42) }),
};

describe("AI COO tool runner", () => {
  test("rejects malformed, unauthenticated, and unauthorized requests", async () => {
    expect((await runAiCooTool(configuration, { value: "1" }, async () => authorization({ ai: true }))).ok).toBe(false);
    expect(JSON.stringify(await runAiCooTool(configuration, { value: 1 }, async () => null))).toBe(JSON.stringify({
      ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in before using AI COO.", retryable: false },
    }));
    expect((await runAiCooTool(configuration, { value: 1 }, async () => authorization())).ok).toBe(false);
  });

  test("allows AI roles and site administrators across all registers", async () => {
    for (const current of [authorization({ ai: true }), authorization({ admin: true })]) {
      const result = await runAiCooTool(configuration, { value: 7 }, async () => current);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(JSON.stringify(result.data)).toBe(JSON.stringify({ value: 7, at: "2026-08-24T00:00:00.000Z", large: "42" }));
        expect(result.meta.registerScope).toBe("ALL");
      }
    }
  });

  test("normalizes nested values to JSON-safe data", () => {
    expect(JSON.stringify(normalizeJson({
      date: new Date("2026-08-24T00:00:00.000Z"),
      value: BigInt(3),
      missing: undefined,
    }))).toBe(JSON.stringify({ date: "2026-08-24T00:00:00.000Z", value: "3" }));
  });

  test("sanitizes implementation errors and invalid outputs", async () => {
    const previousError = console.error;
    console.error = () => undefined;
    try {
      const throwing = {
        ...configuration,
        execute: async () => { throw new Error("postgres://user:secret@example.invalid/internal_table"); },
      };
      const failed = await runAiCooTool(throwing, { value: 1 }, async () => authorization({ ai: true }));
      expect(failed.ok).toBe(false);
      if (!failed.ok) {
        expect(failed.error.code).toBe("INTERNAL_ERROR");
        expect(failed.error.message.includes("secret")).toBe(false);
      }

      const invalidOutput = { ...configuration, execute: async () => ({ value: "wrong" }) };
      const invalid = await runAiCooTool(invalidOutput, { value: 1 }, async () => authorization({ ai: true }));
      expect(invalid.ok).toBe(false);
      if (!invalid.ok) expect(invalid.error.code).toBe("INTERNAL_ERROR");
    } finally {
      console.error = previousError;
    }
  });
});

describe("AI COO registry", () => {
  test("contains unique, described tools for every non-reporting domain", () => {
    const names = aiCooTools.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(17);
    for (const prefix of ["overview_", "register_selection_", "register_sessions_", "register_administration_", "inventory_", "stock_", "bill_history_", "customers_", "settings_"]) {
      expect(names.some((name) => name.startsWith(prefix))).toBe(true);
    }
    expect(names.some((name) => name.startsWith("reporting_"))).toBe(false);
    for (const tool of aiCooTools) {
      expect(tool.description.length > 20).toBe(true);
      expect(typeof tool.inputSchema.safeParse).toBe("function");
      expect(typeof tool.outputSchema.safeParse).toBe("function");
    }
  });

  test("accepts each documented request contract and rejects unsafe bounds", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const samples: Record<string, unknown> = {
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
    for (const tool of aiCooTools) {
      expect(tool.inputSchema.safeParse(samples[tool.name]).success).toBe(true);
    }
    expect(aiCooTools.find(({ name }) => name === "stock_get_risks")!.inputSchema.safeParse({ expiryWindowDays: 366 }).success).toBe(false);
    expect(aiCooTools.find(({ name }) => name === "customers_get_overview")!.inputSchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(aiCooTools.find(({ name }) => name === "inventory_search")!.inputSchema.safeParse({ query: "x".repeat(101) }).success).toBe(false);
    expect(aiCooTools.find(({ name }) => name === "bill_history_search")!.inputSchema.safeParse({ dateFrom: "24-08-2026" }).success).toBe(false);
    expect(aiCooTools.find(({ name }) => name === "settings_search_audit_log")!.inputSchema.safeParse({ after: "a", before: "b" }).success).toBe(false);
  });

  test("keeps domain tools independent from Prisma and workspace actions", async () => {
    const root = path.resolve(process.cwd(), "tools");
    const domains = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .map((entry) => entry.name);
    for (const domain of domains) {
      for (const file of ["index.ts", "schemas.ts"]) {
        const source = await readFile(path.join(root, domain, file), "utf8");
        expect(source.includes("@/lib/db")).toBe(false);
        expect(source.includes("@/generated/prisma")).toBe(false);
        expect(source.includes("/actions")).toBe(false);
      }
    }
  });
});
