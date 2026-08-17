import { describe, expect, test } from "bun:test";

import {
  authorizationAllows,
  normalizeRoleName,
  normalizeUsername,
  PAGE_DEFINITIONS,
  parsePermissionValue,
  permissionAllows,
  validateRoleName,
  validateUsername,
} from "@/lib/permissions";

describe("role permissions", () => {
  test("orders none, view, and edit permissions", () => {
    expect(permissionAllows("NONE", "VIEW")).toBe(false);
    expect(permissionAllows("VIEW", "VIEW")).toBe(true);
    expect(permissionAllows("EDIT", "VIEW")).toBe(true);
    expect(permissionAllows("VIEW", "EDIT")).toBe(false);
  });

  test("site administrators bypass role permissions", () => {
    expect(authorizationAllows(true, "NONE", "EDIT")).toBe(true);
    expect(authorizationAllows(false, "NONE", "VIEW")).toBe(false);
    expect(authorizationAllows(false, "EDIT", "VIEW")).toBe(true);
  });

  test("normalizes and validates usernames", () => {
    expect(normalizeUsername(" Floor.Manager ")).toBe("floor.manager");
    expect(JSON.stringify(validateUsername("floor_manager"))).toBe(JSON.stringify({ ok: true, value: "floor_manager" }));
    expect(validateUsername("no spaces").ok).toBe(false);
    expect(validateUsername("ab").ok).toBe(false);
  });

  test("normalizes role names case-insensitively", () => {
    expect(normalizeRoleName("  Floor   Manager ")).toBe("floor manager");
    expect(validateRoleName("A").ok).toBe(false);
    expect(JSON.stringify(validateRoleName("Cashier"))).toBe(JSON.stringify({ ok: true, value: "Cashier" }));
  });

  test("does not accept edit for read-only pages", () => {
    expect(parsePermissionValue("EDIT", false)).toBe("NONE");
    expect(parsePermissionValue("EDIT", true)).toBe("EDIT");
    expect(parsePermissionValue("VIEW", false)).toBe("VIEW");
  });

  test("only operational write pages expose edit capability", () => {
    expect(JSON.stringify(PAGE_DEFINITIONS.filter((page) => page.editable).map((page) => page.key))).toBe(
      JSON.stringify(["REGISTERS", "INVENTORY", "CUSTOMERS"]),
    );
  });
});
