import { describe, expect, test } from "bun:test";
import type { CapabilityKey } from "@/generated/prisma/enums";
import { isRegisterOnly, navigationRedirect, registerUiPath, resolveLandingPath } from "@/lib/landing";

const access = (keys: CapabilityKey[], isSiteAdmin = false) => ({ user: { isSiteAdmin }, capabilities: new Set(keys) });

describe("cashier landing routes", () => {
  const cashier = access(["REGISTERS_VIEW", "SHIFT_OPEN", "SHIFT_CLOSE", "SALE_RECORD", "ORDER_HOLD"]);
  test("register-only accounts land on the register selector", () => {
    expect(isRegisterOnly(cashier)).toBe(true);
    expect(resolveLandingPath(cashier)).toBe("/live_register");
    expect(navigationRedirect("/login", cashier)).toBe("/live_register");
    expect(navigationRedirect("/", cashier)).toBe("/live_register");
    expect(navigationRedirect("/registers", cashier)).toBe("/live_register");
  });
  test("view-only register accounts use the same selector", () => {
    expect(resolveLandingPath(access(["REGISTERS_VIEW"]))).toBe("/live_register");
  });
  test("administrators and broader accounts retain their normal workspace", () => {
    expect(resolveLandingPath(access([], true))).toBe("/");
    expect(isRegisterOnly(access(["REGISTERS_VIEW", "OVERVIEW_VIEW"]))).toBe(false);
    expect(resolveLandingPath(access(["REGISTERS_VIEW", "OVERVIEW_VIEW"]))).toBe("/");
    expect(navigationRedirect("/settings", access([], true))).toBeNull();
  });
  test("accounts without register viewing cannot be sent to the cashier page", () => {
    expect(resolveLandingPath(access([]))).toBeNull();
    expect(resolveLandingPath(access(["REGISTER_SESSIONS_VIEW"]))).toBe("/registers/sessions");
    expect(navigationRedirect("/login", access([]))).toBe("/access-denied");
  });
  test("existing register links retain their selection without redirect loops", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(navigationRedirect(`/registers/${id}`, cashier)).toBe(`/live_register/${id}`);
    expect(navigationRedirect(`/live_register/${id}`, cashier)).toBeNull();
    expect(navigationRedirect("/live_register", cashier)).toBeNull();
    expect(navigationRedirect("/access-denied", cashier)).toBeNull();
    expect(navigationRedirect("/inventory", cashier)).toBe("/live_register");
  });
  test("mutations return to the originating register workspace", () => {
    expect(registerUiPath("register-a", true)).toBe("/live_register/register-a");
    expect(registerUiPath("register-a", false)).toBe("/registers/register-a");
    expect(registerUiPath(undefined, true)).toBe("/live_register");
  });
});
