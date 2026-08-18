import type {
  CapabilityKey,
  PageKey,
  PermissionLevel,
  RegisterScopeMode,
} from "@/generated/prisma/enums";

export const PAGE_DEFINITIONS = [
  { key: "OVERVIEW", label: "Overview", href: "/", editable: false },
  { key: "REGISTERS", label: "Registers", href: "/registers", editable: true },
  { key: "INVENTORY", label: "Inventory", href: "/inventory", editable: true },
  { key: "STOCK", label: "Stock", href: "/stock", editable: false },
  { key: "REPORTING", label: "Reporting", href: "/reporting", editable: false },
  { key: "BILL_HISTORY", label: "Bill history", href: "/bill-history", editable: false },
  { key: "CUSTOMERS", label: "Customers", href: "/customers", editable: true },
  { key: "SETTINGS", label: "Settings", href: "/settings", editable: false },
  { key: "AUDIT_LOG", label: "Audit log", href: "/settings/audit-log", editable: false },
] as const satisfies ReadonlyArray<{
  key: PageKey;
  label: string;
  href: string;
  editable: boolean;
}>;

export const PAGE_KEYS = PAGE_DEFINITIONS.map((page) => page.key) as PageKey[];

export type CapabilityScope = "GLOBAL" | "REGISTER";

export type CapabilityDefinition = {
  key: CapabilityKey;
  label: string;
  description: string;
  group: string;
  page: PageKey;
  scope: CapabilityScope;
  mutation: boolean;
  implies?: CapabilityKey;
};

export const CAPABILITY_DEFINITIONS = [
  { key: "OVERVIEW_VIEW", label: "View overview", description: "View overview totals for authorized registers.", group: "Read access", page: "OVERVIEW", scope: "REGISTER", mutation: false },
  { key: "REGISTERS_VIEW", label: "Select registers", description: "View and select authorized registers.", group: "Read access", page: "REGISTERS", scope: "REGISTER", mutation: false },
  { key: "REGISTER_ADMIN_VIEW", label: "View register administration", description: "View register configuration for authorized registers.", group: "Read access", page: "REGISTERS", scope: "REGISTER", mutation: false },
  { key: "REGISTER_SESSIONS_VIEW", label: "View sessions", description: "View shifts and session transactions for authorized registers.", group: "Read access", page: "REGISTERS", scope: "REGISTER", mutation: false },
  { key: "RESTAURANT_MENU_VIEW", label: "View restaurant menus", description: "View menus for authorized restaurant registers.", group: "Read access", page: "REGISTERS", scope: "REGISTER", mutation: false },
  { key: "RESTAURANT_FLOOR_VIEW", label: "View restaurant floors", description: "View tables and their current bills.", group: "Read access", page: "REGISTERS", scope: "REGISTER", mutation: false },
  { key: "INVENTORY_VIEW", label: "View inventory", description: "View products for authorized registers.", group: "Read access", page: "INVENTORY", scope: "REGISTER", mutation: false },
  { key: "STOCK_VIEW", label: "View stock", description: "View batches and stock movements for authorized registers.", group: "Read access", page: "STOCK", scope: "REGISTER", mutation: false },
  { key: "BILL_HISTORY_VIEW", label: "View bill history", description: "View bills from authorized registers.", group: "Read access", page: "BILL_HISTORY", scope: "REGISTER", mutation: false },
  { key: "CUSTOMERS_VIEW", label: "View customer profiles", description: "View global customer profile details.", group: "Read access", page: "CUSTOMERS", scope: "GLOBAL", mutation: false },
  { key: "CUSTOMER_CREDIT_VIEW", label: "View customer credit", description: "View credit bill details for authorized registers.", group: "Read access", page: "CUSTOMERS", scope: "REGISTER", mutation: false, implies: "CUSTOMERS_VIEW" },
  { key: "REPORTING_VIEW", label: "View reporting", description: "View reports for authorized registers.", group: "Read access", page: "REPORTING", scope: "REGISTER", mutation: false },
  { key: "SETTINGS_VIEW", label: "View settings", description: "View workspace settings.", group: "Read access", page: "SETTINGS", scope: "GLOBAL", mutation: false },
  { key: "AUDIT_LOG_VIEW_ALL", label: "View global audit log", description: "View all audit events across the site.", group: "Read access", page: "AUDIT_LOG", scope: "GLOBAL", mutation: false },

  { key: "REGISTER_CREATE_GLOBAL", label: "Create registers globally", description: "Create a register. Only roles with all-register scope may receive this capability.", group: "Register administration", page: "REGISTERS", scope: "GLOBAL", mutation: true, implies: "REGISTER_ADMIN_VIEW" },
  { key: "REGISTER_RENAME", label: "Rename registers", description: "Change the name of an authorized register.", group: "Register administration", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTER_ADMIN_VIEW" },
  { key: "REGISTER_TYPE_CHANGE", label: "Change register type", description: "Change an authorized register between shop and restaurant.", group: "Register administration", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTER_ADMIN_VIEW" },
  { key: "REGISTER_ARCHIVE", label: "Archive or restore registers", description: "Change active status for an authorized register.", group: "Register administration", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTER_ADMIN_VIEW" },
  { key: "REGISTER_DELETE", label: "Delete registers", description: "Permanently delete an unused authorized register.", group: "Register administration", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTER_ADMIN_VIEW" },

  { key: "SHIFT_OPEN", label: "Open shifts", description: "Open a shift in an authorized register.", group: "Shift operations", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTERS_VIEW" },
  { key: "SHIFT_CLOSE", label: "Close owned shifts", description: "Close a shift owned by the current user.", group: "Shift operations", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTERS_VIEW" },
  { key: "SHIFT_OVERRIDE", label: "Override shift ownership", description: "Operate another user's shift when the underlying action is also granted.", group: "Shift operations", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTERS_VIEW" },

  { key: "SALE_RECORD", label: "Record sales", description: "Charge and record sales in owned shifts.", group: "Transactions", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTERS_VIEW" },
  { key: "ORDER_HOLD", label: "Physically hold bills", description: "Temporarily hold a bill without moving stock.", group: "Transactions", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTERS_VIEW" },
  { key: "ORDER_CANCEL", label: "Cancel held bills", description: "Cancel held bills in an owned shift.", group: "Transactions", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "REGISTERS_VIEW" },
  { key: "CUSTOMER_CREDIT_ISSUE", label: "Issue customer credit", description: "Place a bill on customer credit after checking the limit.", group: "Transactions", page: "CUSTOMERS", scope: "REGISTER", mutation: true, implies: "CUSTOMER_CREDIT_VIEW" },

  { key: "MENU_ITEM_CREATE", label: "Create menu items", description: "Create menu items in authorized restaurant registers.", group: "Restaurant management", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "RESTAURANT_MENU_VIEW" },
  { key: "MENU_ITEM_UPDATE", label: "Update menu items", description: "Edit, activate, or archive menu items.", group: "Restaurant management", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "RESTAURANT_MENU_VIEW" },
  { key: "RESTAURANT_TABLE_CREATE", label: "Create restaurant tables", description: "Create tables in authorized restaurant registers.", group: "Restaurant management", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "RESTAURANT_FLOOR_VIEW" },
  { key: "RESTAURANT_TABLE_UPDATE", label: "Update restaurant tables", description: "Edit, activate, or archive restaurant tables.", group: "Restaurant management", page: "REGISTERS", scope: "REGISTER", mutation: true, implies: "RESTAURANT_FLOOR_VIEW" },

  { key: "PRODUCT_CREATE", label: "Create products", description: "Create products in authorized registers.", group: "Inventory", page: "INVENTORY", scope: "REGISTER", mutation: true, implies: "INVENTORY_VIEW" },
  { key: "PRODUCT_UPDATE", label: "Update products", description: "Edit products in authorized registers.", group: "Inventory", page: "INVENTORY", scope: "REGISTER", mutation: true, implies: "INVENTORY_VIEW" },
  { key: "PRODUCT_DELETE", label: "Delete products", description: "Delete unused products in authorized registers.", group: "Inventory", page: "INVENTORY", scope: "REGISTER", mutation: true, implies: "INVENTORY_VIEW" },
  { key: "CATEGORY_CREATE_GLOBAL", label: "Create categories globally", description: "Create a product category shared by all registers.", group: "Inventory", page: "INVENTORY", scope: "GLOBAL", mutation: true, implies: "INVENTORY_VIEW" },
  { key: "CATEGORY_UPDATE_GLOBAL", label: "Update categories globally", description: "Rename a product category shared by all registers.", group: "Inventory", page: "INVENTORY", scope: "GLOBAL", mutation: true, implies: "INVENTORY_VIEW" },
  { key: "CATEGORY_DELETE_GLOBAL", label: "Delete categories globally", description: "Delete an unused product category shared by all registers.", group: "Inventory", page: "INVENTORY", scope: "GLOBAL", mutation: true, implies: "INVENTORY_VIEW" },
  { key: "STOCK_RECEIVE", label: "Receive stock", description: "Receive stock into products for authorized registers.", group: "Inventory", page: "STOCK", scope: "REGISTER", mutation: true, implies: "STOCK_VIEW" },
  { key: "BATCH_EXPIRY_UPDATE", label: "Assign batch expiry", description: "Assign or change expiry dates for authorized batches.", group: "Inventory", page: "STOCK", scope: "REGISTER", mutation: true, implies: "STOCK_VIEW" },
  { key: "STOCK_WRITE_OFF", label: "Write off stock", description: "Record stock write-offs for authorized products.", group: "Inventory", page: "STOCK", scope: "REGISTER", mutation: true, implies: "STOCK_VIEW" },

  { key: "CUSTOMER_CREATE", label: "Create customers", description: "Create global customer profiles.", group: "Customers", page: "CUSTOMERS", scope: "GLOBAL", mutation: true, implies: "CUSTOMERS_VIEW" },
  { key: "CUSTOMER_UPDATE", label: "Update customers", description: "Edit global customer profile details.", group: "Customers", page: "CUSTOMERS", scope: "GLOBAL", mutation: true, implies: "CUSTOMERS_VIEW" },
  { key: "CUSTOMER_CREDIT_LIMIT_UPDATE", label: "Change credit limits", description: "Change a customer's global credit limit.", group: "Customers", page: "CUSTOMERS", scope: "GLOBAL", mutation: true, implies: "CUSTOMERS_VIEW" },
  { key: "CUSTOMER_CREDIT_SETTLE", label: "Settle customer credit", description: "Settle credit bills from authorized registers.", group: "Customers", page: "CUSTOMERS", scope: "REGISTER", mutation: true, implies: "CUSTOMER_CREDIT_VIEW" },
] as const satisfies readonly CapabilityDefinition[];

export const CAPABILITY_KEYS = CAPABILITY_DEFINITIONS.map(({ key }) => key) as CapabilityKey[];
export const CAPABILITY_BY_KEY = Object.fromEntries(
  CAPABILITY_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<CapabilityKey, CapabilityDefinition>;

export const CAPABILITY_GROUPS = Array.from(
  new Set(CAPABILITY_DEFINITIONS.map(({ group }) => group)),
).map((label) => ({
  label,
  capabilities: CAPABILITY_DEFINITIONS.filter(({ group }) => group === label),
}));

export function expandCapabilityDependencies(capabilities: Iterable<CapabilityKey>) {
  const expanded = new Set(capabilities);
  let changed = true;
  while (changed) {
    changed = false;
    for (const capability of Array.from(expanded)) {
      const implied = CAPABILITY_BY_KEY[capability].implies;
      if (implied && !expanded.has(implied)) {
        expanded.add(implied);
        changed = true;
      }
    }
  }
  return expanded;
}

export function validateCapabilitySelection(
  capabilities: Iterable<CapabilityKey>,
  scopeMode: RegisterScopeMode,
  registerIds: Iterable<string>,
) {
  const expanded = expandCapabilityDependencies(capabilities);
  if (scopeMode === "SELECTED" && expanded.has("REGISTER_CREATE_GLOBAL")) {
    return { ok: false as const, error: "Register creation requires all-register scope." };
  }
  const hasRegisterCapabilities = Array.from(expanded).some(
    (capability) => CAPABILITY_BY_KEY[capability].scope === "REGISTER",
  );
  if (scopeMode === "SELECTED" && hasRegisterCapabilities && !Array.from(registerIds).length) {
    return { ok: false as const, error: "Select at least one register for this role." };
  }
  return { ok: true as const, capabilities: Array.from(expanded) };
}

const CASHIER: CapabilityKey[] = [
  "OVERVIEW_VIEW", "REGISTERS_VIEW", "RESTAURANT_FLOOR_VIEW", "CUSTOMERS_VIEW",
  "SHIFT_OPEN", "SHIFT_CLOSE", "SALE_RECORD", "ORDER_HOLD", "ORDER_CANCEL",
];
const SHIFT_MANAGER: CapabilityKey[] = [
  ...CASHIER, "REGISTER_SESSIONS_VIEW", "BILL_HISTORY_VIEW", "CUSTOMER_CREDIT_VIEW",
  "SHIFT_OVERRIDE", "CUSTOMER_CREDIT_ISSUE", "CUSTOMER_CREDIT_SETTLE",
  "RESTAURANT_MENU_VIEW", "MENU_ITEM_CREATE", "MENU_ITEM_UPDATE",
  "RESTAURANT_TABLE_CREATE", "RESTAURANT_TABLE_UPDATE",
];
const INVENTORY_CLERK: CapabilityKey[] = [
  "OVERVIEW_VIEW", "INVENTORY_VIEW", "STOCK_VIEW", "PRODUCT_CREATE", "PRODUCT_UPDATE",
  "STOCK_RECEIVE", "BATCH_EXPIRY_UPDATE", "STOCK_WRITE_OFF",
];
const AUDITOR = CAPABILITY_DEFINITIONS.filter(({ mutation }) => !mutation).map(({ key }) => key);

export const ROLE_PRESETS = [
  { key: "CASHIER", label: "Cashier", scopeMode: "SELECTED", capabilities: CASHIER },
  { key: "SHIFT_MANAGER", label: "Shift Manager", scopeMode: "SELECTED", capabilities: SHIFT_MANAGER },
  { key: "INVENTORY_CLERK", label: "Inventory Clerk", scopeMode: "SELECTED", capabilities: INVENTORY_CLERK },
  { key: "AUDITOR", label: "Auditor", scopeMode: "ALL", capabilities: AUDITOR },
  { key: "FULL_ACCESS", label: "Full Access", scopeMode: "ALL", capabilities: CAPABILITY_KEYS },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  scopeMode: RegisterScopeMode;
  capabilities: readonly CapabilityKey[];
}>;

const permissionRank: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2 };

export function permissionAllows(actual: PermissionLevel, required: PermissionLevel) {
  return permissionRank[actual] >= permissionRank[required];
}

export function authorizationAllows(isSiteAdmin: boolean, actual: PermissionLevel, required: PermissionLevel) {
  return isSiteAdmin || permissionAllows(actual, required);
}

export function capabilityAllows(
  isSiteAdmin: boolean,
  capabilities: ReadonlySet<CapabilityKey>,
  capability: CapabilityKey,
) {
  return isSiteAdmin || capabilities.has(capability);
}

export function registerScopeAllows(
  isSiteAdmin: boolean,
  scopeMode: RegisterScopeMode,
  registerIds: ReadonlySet<string>,
  registerId: string,
) {
  return isSiteAdmin || scopeMode === "ALL" || registerIds.has(registerId);
}

const LEGACY_PAGE_CAPABILITIES: Record<PageKey, { view: CapabilityKey[]; edit: CapabilityKey[] }> = {
  OVERVIEW: { view: ["OVERVIEW_VIEW"], edit: [] },
  REGISTERS: {
    view: ["REGISTERS_VIEW", "REGISTER_ADMIN_VIEW", "REGISTER_SESSIONS_VIEW", "RESTAURANT_MENU_VIEW", "RESTAURANT_FLOOR_VIEW"],
    edit: ["REGISTER_CREATE_GLOBAL", "REGISTER_RENAME", "REGISTER_TYPE_CHANGE", "REGISTER_ARCHIVE", "REGISTER_DELETE", "SHIFT_OPEN", "SHIFT_CLOSE", "SHIFT_OVERRIDE", "SALE_RECORD", "ORDER_HOLD", "ORDER_CANCEL", "CUSTOMER_CREDIT_ISSUE", "MENU_ITEM_CREATE", "MENU_ITEM_UPDATE", "RESTAURANT_TABLE_CREATE", "RESTAURANT_TABLE_UPDATE"],
  },
  INVENTORY: { view: ["INVENTORY_VIEW"], edit: ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DELETE", "CATEGORY_CREATE_GLOBAL", "CATEGORY_UPDATE_GLOBAL", "CATEGORY_DELETE_GLOBAL", "STOCK_RECEIVE", "BATCH_EXPIRY_UPDATE", "STOCK_WRITE_OFF"] },
  STOCK: { view: ["STOCK_VIEW"], edit: [] },
  REPORTING: { view: ["REPORTING_VIEW"], edit: [] },
  BILL_HISTORY: { view: ["BILL_HISTORY_VIEW"], edit: [] },
  CUSTOMERS: { view: ["CUSTOMERS_VIEW", "CUSTOMER_CREDIT_VIEW"], edit: ["CUSTOMER_CREATE", "CUSTOMER_UPDATE", "CUSTOMER_CREDIT_LIMIT_UPDATE", "CUSTOMER_CREDIT_SETTLE"] },
  SETTINGS: { view: ["SETTINGS_VIEW"], edit: [] },
  AUDIT_LOG: { view: ["AUDIT_LOG_VIEW_ALL"], edit: [] },
};

export function capabilitiesFromLegacyPermissions(
  permissions: Iterable<{ page: PageKey; level: PermissionLevel }>,
) {
  const capabilities = new Set<CapabilityKey>();
  for (const { page, level } of permissions) {
    if (level === "NONE") continue;
    LEGACY_PAGE_CAPABILITIES[page].view.forEach((capability) => capabilities.add(capability));
    if (level === "EDIT") {
      LEGACY_PAGE_CAPABILITIES[page].edit.forEach((capability) => capabilities.add(capability));
    }
  }
  return Array.from(expandCapabilityDependencies(capabilities));
}

export function legacyPermissionProjection(capabilities: Iterable<CapabilityKey>) {
  const selected = new Set(capabilities);
  return Object.fromEntries(PAGE_KEYS.map((page) => {
    const mapping = LEGACY_PAGE_CAPABILITIES[page];
    const edit = mapping.edit.some((capability) => selected.has(capability));
    const view = mapping.view.some((capability) => selected.has(capability));
    return [page, edit ? "EDIT" : view ? "VIEW" : "NONE"];
  })) as Record<PageKey, PermissionLevel>;
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
    return { ok: false as const, error: "Username may contain letters, numbers, underscores, and periods only." };
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

export function parseCapabilityValues(formData: FormData) {
  const valid = new Set<CapabilityKey>(CAPABILITY_KEYS);
  return formData.getAll("capabilities").filter(
    (value): value is CapabilityKey => typeof value === "string" && valid.has(value as CapabilityKey),
  );
}

export function parseRegisterScopeMode(value: FormDataEntryValue | null): RegisterScopeMode {
  return value === "ALL" ? "ALL" : "SELECTED";
}

/** Temporary rollback compatibility for the legacy role editor. */
export function parsePermissionValue(value: FormDataEntryValue | null, editable: boolean): PermissionLevel {
  if (value === "VIEW") return "VIEW";
  if (editable && value === "EDIT") return "EDIT";
  return "NONE";
}
