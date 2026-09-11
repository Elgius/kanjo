import type { CapabilityKey, RegisterScopeMode } from "@/generated/prisma/enums";
import { CAPABILITY_BY_KEY, CAPABILITY_DEFINITIONS, expandCapabilityDependencies, ROLE_PRESETS } from "@/lib/permissions";

export const WORKSPACES = [
  { key: "CASHIER", label: "Cashier", description: "Run a counter, take payments, and manage your own shift." },
  { key: "SHIFT_MANAGER", label: "Supervisor", description: "Support cashiers and manage shifts at assigned registers." },
  { key: "INVENTORY_CLERK", label: "Inventory", description: "Manage products, receive stock, and track batches." },
  { key: "AUDITOR", label: "Auditor", description: "Review activity and reports without recording transactions." },
  { key: "FULL_ACCESS", label: "Full access", description: "All operational permissions. Site administration is separate." },
  { key: "CUSTOM", label: "Custom", description: "Choose the actions this role needs." },
] as const;
export type WorkspaceKey = typeof WORKSPACES[number]["key"];
export function isWorkspace(value: unknown): value is WorkspaceKey {
  return WORKSPACES.some(({ key }) => key === value);
}
export function workspaceCapabilities(workspace: WorkspaceKey) {
  return expandCapabilityDependencies(ROLE_PRESETS.find(({ key }) => key === workspace)?.capabilities ?? []);
}

/** Removing a prerequisite also removes actions which depend on it, transitively. */
export function toggleSettingCapability(current: Iterable<CapabilityKey>, key: CapabilityKey) {
  const next = expandCapabilityDependencies(current);
  if (!next.has(key)) return expandCapabilityDependencies([...next, key]);
  next.delete(key);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of next) {
      const prerequisite = CAPABILITY_BY_KEY[candidate].implies;
      if (prerequisite && !next.has(prerequisite)) {
        next.delete(candidate);
        changed = true;
      }
    }
  }
  return next;
}

const everyday: CapabilityKey[] = ["REGISTERS_VIEW", "SHIFT_OPEN", "SHIFT_CLOSE", "SALE_RECORD", "ORDER_HOLD", "ORDER_CANCEL", "RESTAURANT_FLOOR_VIEW"];
const history: CapabilityKey[] = ["REGISTER_SESSIONS_VIEW", "BILL_HISTORY_VIEW", "OVERVIEW_VIEW", "REPORTING_VIEW"];
const supervisor: CapabilityKey[] = ["SHIFT_OVERRIDE", "CUSTOMER_CREDIT_ISSUE", "CUSTOMER_CREDIT_SETTLE", "CUSTOMER_CREDIT_LIMIT_UPDATE"];
export const SETTINGS_PERMISSION_GROUPS = [
  { label: "Everyday checkout", description: "The actions a cashier needs during a shift.", capabilities: everyday },
  { label: "History & reporting", description: "History includes other cashiers’ activity at the user’s assigned registers.", capabilities: history },
  { label: "Supervisor actions", description: "Additional authority for supporting staff and managing credit.", capabilities: supervisor },
  ...["Customers", "Restaurant management", "Inventory", "Register administration", "Other access"].map((label) => ({
    label,
    description: label === "Other access" ? "Additional workspace access. Site administration still requires a site admin account." : "Enable only the actions this job needs.",
    capabilities: CAPABILITY_DEFINITIONS.filter((item) => ![...everyday, ...history, ...supervisor].includes(item.key) && (label === "Other access" ? item.group === "Read access" || item.group === "AI COO" : item.group === label)).map(({ key }) => key) as CapabilityKey[],
  })),
];

export function parseAccountRegisterAssignment(formData: FormData) {
  const scopeMode = formData.get("registerScopeMode");
  if (scopeMode !== "ALL" && scopeMode !== "SELECTED") return { ok: false as const, error: "Choose selected registers or all registers." };
  const values = formData.getAll("registerIds");
  if (values.some((value) => typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
    return { ok: false as const, error: "Select valid registers." };
  }
  return { ok: true as const, scopeMode: scopeMode as RegisterScopeMode, registerIds: scopeMode === "ALL" ? [] : [...new Set(values as string[])] };
}

export function validateAccountScope(capabilities: Iterable<CapabilityKey>, scope: RegisterScopeMode, isSiteAdmin = false) {
  if (!isSiteAdmin && scope !== "ALL" && new Set(capabilities).has("REGISTER_CREATE_GLOBAL")) {
    return "This role can create registers and requires all-register access. Choose all registers or a different role.";
  }
  return null;
}

export function accessSummary(capabilities: Iterable<CapabilityKey>, isSiteAdmin = false) {
  const keys = new Set(capabilities);
  if (isSiteAdmin) return ["Site administrator: all registers and all actions, regardless of role settings."];
  const summary: string[] = [];
  if (keys.has("REGISTERS_VIEW")) summary.push("Can open assigned registers.");
  if (keys.has("SALE_RECORD")) summary.push("Can record sales.");
  if (keys.has("SHIFT_OPEN")) summary.push("Can start shifts.");
  if (keys.has("SHIFT_CLOSE")) summary.push(keys.has("SHIFT_OVERRIDE") ? "Can close other cashiers’ shifts at assigned registers." : "Can close their own shifts.");
  summary.push(keys.has("SHIFT_OVERRIDE") ? "May operate another cashier’s shift when the action is permitted." : "Cannot operate another cashier’s shift.");
  if (keys.has("REGISTER_SESSIONS_VIEW") || keys.has("BILL_HISTORY_VIEW")) summary.push("Can view other cashiers’ history at assigned registers.");
  const global = [...keys].filter((key) => CAPABILITY_BY_KEY[key].scope === "GLOBAL");
  if (global.length) summary.push(`Workspace-wide access: ${global.map((key) => CAPABILITY_BY_KEY[key].label.toLowerCase()).join(", ")}. Register assignments do not limit these permissions.`);
  return summary;
}
