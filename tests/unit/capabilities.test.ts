import { describe, expect, test } from "bun:test";

import type { CapabilityKey } from "@/generated/prisma/enums";
import { OPERATION_POLICIES } from "@/lib/operation-policies";
import {
  CAPABILITY_KEYS,
  ROLE_PRESETS,
  capabilitiesFromLegacyPermissions,
  capabilityAllows,
  expandCapabilityDependencies,
  getRegisterNavigationVisibility,
  legacyPermissionProjection,
  registerScopeAllows,
  validateCapabilitySelection,
} from "@/lib/permissions";

describe("capability permissions", () => {
  test("site administrators bypass capabilities and register scope", () => {
    expect(capabilityAllows(true, new Set(), "SALE_RECORD")).toBe(true);
    expect(registerScopeAllows(true, "SELECTED", new Set(), "any-register")).toBe(true);
    expect(capabilityAllows(false, new Set(), "SALE_RECORD")).toBe(false);
  });

  test("all and selected register scopes behave differently for future registers", () => {
    expect(registerScopeAllows(false, "ALL", new Set(), "future-register")).toBe(true);
    expect(registerScopeAllows(false, "SELECTED", new Set(["assigned"]), "assigned")).toBe(true);
    expect(registerScopeAllows(false, "SELECTED", new Set(["assigned"]), "future-register")).toBe(false);
  });

  test("mutation dependencies add the required view capability", () => {
    expect(expandCapabilityDependencies(["SALE_RECORD"]).has("REGISTERS_VIEW")).toBe(true);
    const creditDependencies = expandCapabilityDependencies(["CUSTOMER_CREDIT_SETTLE"]);
    expect(creditDependencies.has("CUSTOMER_CREDIT_VIEW")).toBe(true);
    expect(creditDependencies.has("CUSTOMERS_VIEW")).toBe(true);
    expect(expandCapabilityDependencies(["PRODUCT_UPDATE"]).has("INVENTORY_VIEW")).toBe(true);
  });

  test("selected scope requires assignments and cannot create registers globally", () => {
    expect(validateCapabilitySelection(["SALE_RECORD"], "SELECTED", []).ok).toBe(false);
    expect(validateCapabilitySelection(["SALE_RECORD"], "SELECTED", ["r1"]).ok).toBe(true);
    expect(validateCapabilitySelection(["REGISTER_CREATE_GLOBAL"], "SELECTED", ["r1"]).ok).toBe(false);
  });

  test("presets expand to editable capability lists", () => {
    const cashier = ROLE_PRESETS.find(({ key }) => key === "CASHIER")!;
    const manager = ROLE_PRESETS.find(({ key }) => key === "SHIFT_MANAGER")!;
    const auditor = ROLE_PRESETS.find(({ key }) => key === "AUDITOR")!;
    const full = ROLE_PRESETS.find(({ key }) => key === "FULL_ACCESS")!;
    expect(cashier.capabilities.includes("SALE_RECORD")).toBe(true);
    expect(cashier.capabilities.includes("SHIFT_OVERRIDE")).toBe(false);
    expect(manager.capabilities.includes("SHIFT_OVERRIDE")).toBe(true);
    expect(auditor.capabilities.includes("AUDIT_LOG_VIEW_ALL")).toBe(true);
    expect(auditor.capabilities.includes("SALE_RECORD")).toBe(false);
    expect(JSON.stringify([...full.capabilities].sort())).toBe(JSON.stringify([...CAPABILITY_KEYS].sort()));
  });

  test("register navigation uses exact session and rename capabilities", () => {
    expect(JSON.stringify(getRegisterNavigationVisibility(false, new Set(["REGISTER_SESSIONS_VIEW"])))).toBe(
      JSON.stringify({ selection: false, sessions: true, edit: false }),
    );
    expect(JSON.stringify(getRegisterNavigationVisibility(false, new Set(["REGISTER_ADMIN_VIEW"])))).toBe(
      JSON.stringify({ selection: false, sessions: false, edit: false }),
    );
    expect(JSON.stringify(getRegisterNavigationVisibility(false, new Set(["REGISTER_RENAME"])))).toBe(
      JSON.stringify({ selection: false, sessions: false, edit: true }),
    );
    expect(JSON.stringify(getRegisterNavigationVisibility(true, new Set()))).toBe(
      JSON.stringify({ selection: true, sessions: true, edit: true }),
    );
  });

  test("legacy translation preserves effective module access and rollback projection", () => {
    const translated = capabilitiesFromLegacyPermissions([
      { page: "REGISTERS", level: "EDIT" },
      { page: "CUSTOMERS", level: "VIEW" },
    ]);
    expect(translated.includes("REGISTER_CREATE_GLOBAL")).toBe(true);
    expect(translated.includes("SHIFT_OVERRIDE")).toBe(true);
    expect(translated.includes("CUSTOMERS_VIEW")).toBe(true);
    expect(translated.includes("CUSTOMER_CREDIT_VIEW")).toBe(true);
    const projection = legacyPermissionProjection(translated);
    expect(projection.REGISTERS).toBe("EDIT");
    expect(projection.CUSTOMERS).toBe("VIEW");
  });
});

describe("operation policy coverage", () => {
  const expectedEvents = [
    "REGISTER_CREATE", "REGISTER_RENAME", "REGISTER_TYPE_CHANGE", "REGISTER_ARCHIVE", "REGISTER_DELETE",
    "SHIFT_OPEN", "SHIFT_CLOSE", "SALE_RECORD", "REGISTER_ORDER_HOLD", "REGISTER_ORDER_CANCEL",
    "CUSTOMER_CREDIT_ISSUE", "MENU_ITEM_CREATE", "MENU_ITEM_UPDATE", "RESTAURANT_TABLE_CREATE",
    "RESTAURANT_TABLE_UPDATE", "PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DELETE", "CATEGORY_CREATE",
    "CATEGORY_UPDATE", "CATEGORY_DELETE", "STOCK_RECEIVE", "BATCH_EXPIRY_SET", "BATCH_WRITE_OFF",
    "CUSTOMER_CREATE", "CUSTOMER_UPDATE", "CUSTOMER_CREDIT_LIMIT_UPDATE", "CUSTOMER_CREDIT_SETTLE",
    "ROLE_CREATE", "ROLE_UPDATE", "ROLE_DELETE", "ACCOUNT_CREATE", "ACCOUNT_ROLE_ASSIGN", "SITE_ADMIN_UPDATE",
  ].sort();

  test("every server mutation has exactly one capability or site-admin policy", () => {
    expect(JSON.stringify(Object.keys(OPERATION_POLICIES).sort())).toBe(JSON.stringify(expectedEvents));
    for (const policy of Object.values(OPERATION_POLICIES)) {
      expect("siteAdmin" in policy || CAPABILITY_KEYS.includes(policy.capability as CapabilityKey)).toBe(true);
      expect(["GLOBAL", "REGISTER", "SHIFT", "ENTITY"].includes(policy.scope)).toBe(true);
    }
  });
});
