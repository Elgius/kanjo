import { describe, expect, test } from "bun:test";

import { canManageTeamAccount } from "@/lib/team-account-policy";

describe("team account management policy", () => {
  test("site administrators can manage ordinary team accounts", () => {
    for (const operation of ["EDIT_USERNAME", "RESET_PASSWORD", "DELETE"] as const) {
      expect(canManageTeamAccount({
        actorId: "admin-1",
        targetId: "team-1",
        targetIsSiteAdmin: false,
        operation,
      })).toBe(true);
    }
  });

  test("other site administrators cannot be edited, reset, or deleted", () => {
    for (const operation of ["EDIT_USERNAME", "RESET_PASSWORD", "DELETE"] as const) {
      expect(canManageTeamAccount({
        actorId: "admin-1",
        targetId: "admin-2",
        targetIsSiteAdmin: true,
        operation,
      })).toBe(false);
    }
  });

  test("an administrator can edit or reset their own account but cannot delete it", () => {
    expect(canManageTeamAccount({
      actorId: "admin-1",
      targetId: "admin-1",
      targetIsSiteAdmin: true,
      operation: "EDIT_USERNAME",
    })).toBe(true);
    expect(canManageTeamAccount({
      actorId: "admin-1",
      targetId: "admin-1",
      targetIsSiteAdmin: true,
      operation: "RESET_PASSWORD",
    })).toBe(true);
    expect(canManageTeamAccount({
      actorId: "admin-1",
      targetId: "admin-1",
      targetIsSiteAdmin: true,
      operation: "DELETE",
    })).toBe(false);
  });
});
