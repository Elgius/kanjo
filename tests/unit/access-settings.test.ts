import { describe, expect, test } from "bun:test";
import { accessSummary, parseAccountRegisterAssignment, SETTINGS_PERMISSION_GROUPS, toggleSettingCapability, validateAccountScope, workspaceCapabilities } from "@/lib/access-settings";
import { CAPABILITY_KEYS } from "@/lib/permissions";

describe("access settings", () => {
  test("every existing capability remains available exactly once", () => {
    const keys = SETTINGS_PERMISSION_GROUPS.flatMap(({ capabilities }) => capabilities);
    expect(JSON.stringify(keys.toSorted())).toBe(JSON.stringify([...CAPABILITY_KEYS].sort()));
    expect(new Set(keys).size).toBe(keys.length);
  });
  test("enabling an action includes its transitive prerequisites", () => {
    const result = toggleSettingCapability([], "CUSTOMER_CREDIT_SETTLE");
    for (const key of ["CUSTOMER_CREDIT_SETTLE", "CUSTOMER_CREDIT_VIEW", "CUSTOMERS_VIEW"] as const) expect(result.has(key)).toBe(true);
  });
  test("disabling a prerequisite removes dependent actions without dropping unrelated permissions", () => {
    const current = toggleSettingCapability(["SALE_RECORD"], "CUSTOMER_CREDIT_SETTLE");
    const result = toggleSettingCapability(current, "CUSTOMERS_VIEW");
    expect(result.has("CUSTOMER_CREDIT_SETTLE")).toBe(false);
    expect(result.has("CUSTOMER_CREDIT_VIEW")).toBe(false);
    expect(result.has("CUSTOMERS_VIEW")).toBe(false);
    expect(result.has("SALE_RECORD")).toBe(true);
  });
  test("cashier preset does not grant shift override", () => {
    expect(workspaceCapabilities("CASHIER").has("SHIFT_OVERRIDE")).toBe(false);
    expect(workspaceCapabilities("SHIFT_MANAGER").has("SHIFT_OVERRIDE")).toBe(true);
  });
  test("missing and invalid scope cannot silently grant all-register access", () => {
    const form = new FormData();
    expect(parseAccountRegisterAssignment(form).ok).toBe(false);
    form.set("registerScopeMode", "anything");
    expect(parseAccountRegisterAssignment(form).ok).toBe(false);
    form.set("registerScopeMode", "SELECTED");
    expect(JSON.stringify(parseAccountRegisterAssignment(form))).toBe(JSON.stringify({ ok: true, scopeMode: "SELECTED", registerIds: [] }));
    form.append("registerIds", "not-a-uuid");
    expect(parseAccountRegisterAssignment(form).ok).toBe(false);
  });
  test("register selection is deduplicated and ALL clears selected grants", () => {
    const form = new FormData();
    const id = "22222222-2222-4222-8222-222222222222";
    form.set("registerScopeMode", "SELECTED");
    form.append("registerIds", id); form.append("registerIds", id);
    expect(JSON.stringify(parseAccountRegisterAssignment(form))).toBe(JSON.stringify({ ok: true, scopeMode: "SELECTED", registerIds: [id] }));
    form.set("registerScopeMode", "ALL");
    expect(JSON.stringify(parseAccountRegisterAssignment(form))).toBe(JSON.stringify({ ok: true, scopeMode: "ALL", registerIds: [] }));
  });
  test("register creation requires compatible per-user scope", () => {
    expect(validateAccountScope(["REGISTER_CREATE_GLOBAL"], "SELECTED") === null).toBe(false);
    expect(validateAccountScope(["REGISTER_CREATE_GLOBAL"], "ALL")).toBeNull();
    expect(validateAccountScope(["REGISTER_CREATE_GLOBAL"], "SELECTED", true)).toBeNull();
  });
  test("summary makes global and cross-cashier history access explicit", () => {
    const summary = accessSummary(["REGISTER_SESSIONS_VIEW", "CUSTOMERS_VIEW"]);
    expect(summary.some((line) => line.includes("other cashiers’ history"))).toBe(true);
    expect(summary.some((line) => line.includes("Register assignments do not limit"))).toBe(true);
  });
});
