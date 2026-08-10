import type { PageKey, PermissionLevel } from "@/generated/prisma/enums";

export const PAGE_DEFINITIONS = [
  { key: "OVERVIEW", label: "Overview", href: "/", editable: false },
  { key: "REGISTERS", label: "Registers", href: "/registers", editable: true },
  { key: "INVENTORY", label: "Inventory", href: "/inventory", editable: true },
  { key: "STOCK", label: "Stock", href: "/stock", editable: false },
  { key: "REPORTING", label: "Reporting", href: "/reporting", editable: false },
  { key: "SETTINGS", label: "Settings", href: "/settings", editable: false },
  { key: "AUDIT_LOG", label: "Audit log", href: "/settings/audit-log", editable: false },
] as const satisfies ReadonlyArray<{
  key: PageKey;
  label: string;
  href: string;
  editable: boolean;
}>;

export const PAGE_KEYS = PAGE_DEFINITIONS.map((page) => page.key) as PageKey[];

const permissionRank: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  EDIT: 2,
};

export function permissionAllows(
  actual: PermissionLevel,
  required: PermissionLevel,
) {
  return permissionRank[actual] >= permissionRank[required];
}

export function authorizationAllows(
  isSiteAdmin: boolean,
  actual: PermissionLevel,
  required: PermissionLevel,
) {
  return isSiteAdmin || permissionAllows(actual, required);
}

export function normalizeRoleName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function normalizeUsername(username: string) {
  return username.trim().toLocaleLowerCase("en");
}

export function validateUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3 || normalized.length > 30) {
    return { ok: false as const, error: "Username must be between 3 and 30 characters." };
  }
  if (!/^[a-z0-9_.]+$/.test(normalized)) {
    return {
      ok: false as const,
      error: "Username may contain letters, numbers, underscores, and periods only.",
    };
  }
  return { ok: true as const, value: normalized };
}

export function validateRoleName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 60) {
    return { ok: false as const, error: "Role name must be between 2 and 60 characters." };
  }
  return { ok: true as const, value: trimmed };
}

export function parsePermissionValue(
  value: FormDataEntryValue | null,
  editable: boolean,
): PermissionLevel {
  if (value === "VIEW") return "VIEW";
  if (editable && value === "EDIT") return "EDIT";
  return "NONE";
}
