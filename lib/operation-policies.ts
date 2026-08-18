import type { CapabilityKey, PageKey } from "@/generated/prisma/enums";

export type CapabilityOperationPolicy = {
  capability: CapabilityKey;
  page: PageKey;
  scope: "GLOBAL" | "REGISTER" | "SHIFT" | "ENTITY";
};

export type SiteAdminOperationPolicy = {
  siteAdmin: true;
  page: "SETTINGS";
  scope: "GLOBAL";
};

export type OperationPolicy = CapabilityOperationPolicy | SiteAdminOperationPolicy;

/**
 * The one authoritative policy for each business mutation. Actions use these exact
 * event names in both authorization denials and success/failure audit records.
 */
export const OPERATION_POLICIES = {
  REGISTER_CREATE: { capability: "REGISTER_CREATE_GLOBAL", page: "REGISTERS", scope: "GLOBAL" },
  REGISTER_RENAME: { capability: "REGISTER_RENAME", page: "REGISTERS", scope: "REGISTER" },
  REGISTER_TYPE_CHANGE: { capability: "REGISTER_TYPE_CHANGE", page: "REGISTERS", scope: "REGISTER" },
  REGISTER_ARCHIVE: { capability: "REGISTER_ARCHIVE", page: "REGISTERS", scope: "REGISTER" },
  REGISTER_DELETE: { capability: "REGISTER_DELETE", page: "REGISTERS", scope: "REGISTER" },
  SHIFT_OPEN: { capability: "SHIFT_OPEN", page: "REGISTERS", scope: "REGISTER" },
  SHIFT_CLOSE: { capability: "SHIFT_CLOSE", page: "REGISTERS", scope: "SHIFT" },
  SALE_RECORD: { capability: "SALE_RECORD", page: "REGISTERS", scope: "SHIFT" },
  REGISTER_ORDER_HOLD: { capability: "ORDER_HOLD", page: "REGISTERS", scope: "SHIFT" },
  REGISTER_ORDER_CANCEL: { capability: "ORDER_CANCEL", page: "REGISTERS", scope: "SHIFT" },
  CUSTOMER_CREDIT_ISSUE: { capability: "CUSTOMER_CREDIT_ISSUE", page: "CUSTOMERS", scope: "SHIFT" },
  MENU_ITEM_CREATE: { capability: "MENU_ITEM_CREATE", page: "REGISTERS", scope: "REGISTER" },
  MENU_ITEM_UPDATE: { capability: "MENU_ITEM_UPDATE", page: "REGISTERS", scope: "ENTITY" },
  RESTAURANT_TABLE_CREATE: { capability: "RESTAURANT_TABLE_CREATE", page: "REGISTERS", scope: "REGISTER" },
  RESTAURANT_TABLE_UPDATE: { capability: "RESTAURANT_TABLE_UPDATE", page: "REGISTERS", scope: "ENTITY" },
  PRODUCT_CREATE: { capability: "PRODUCT_CREATE", page: "INVENTORY", scope: "REGISTER" },
  PRODUCT_UPDATE: { capability: "PRODUCT_UPDATE", page: "INVENTORY", scope: "ENTITY" },
  PRODUCT_DELETE: { capability: "PRODUCT_DELETE", page: "INVENTORY", scope: "ENTITY" },
  CATEGORY_CREATE: { capability: "CATEGORY_CREATE_GLOBAL", page: "INVENTORY", scope: "GLOBAL" },
  CATEGORY_UPDATE: { capability: "CATEGORY_UPDATE_GLOBAL", page: "INVENTORY", scope: "GLOBAL" },
  CATEGORY_DELETE: { capability: "CATEGORY_DELETE_GLOBAL", page: "INVENTORY", scope: "GLOBAL" },
  STOCK_RECEIVE: { capability: "STOCK_RECEIVE", page: "STOCK", scope: "ENTITY" },
  BATCH_EXPIRY_SET: { capability: "BATCH_EXPIRY_UPDATE", page: "STOCK", scope: "ENTITY" },
  BATCH_WRITE_OFF: { capability: "STOCK_WRITE_OFF", page: "STOCK", scope: "ENTITY" },
  CUSTOMER_CREATE: { capability: "CUSTOMER_CREATE", page: "CUSTOMERS", scope: "GLOBAL" },
  CUSTOMER_UPDATE: { capability: "CUSTOMER_UPDATE", page: "CUSTOMERS", scope: "GLOBAL" },
  CUSTOMER_CREDIT_LIMIT_UPDATE: { capability: "CUSTOMER_CREDIT_LIMIT_UPDATE", page: "CUSTOMERS", scope: "GLOBAL" },
  CUSTOMER_CREDIT_SETTLE: { capability: "CUSTOMER_CREDIT_SETTLE", page: "CUSTOMERS", scope: "ENTITY" },
  ROLE_CREATE: { siteAdmin: true, page: "SETTINGS", scope: "GLOBAL" },
  ROLE_UPDATE: { siteAdmin: true, page: "SETTINGS", scope: "GLOBAL" },
  ROLE_DELETE: { siteAdmin: true, page: "SETTINGS", scope: "GLOBAL" },
  ACCOUNT_CREATE: { siteAdmin: true, page: "SETTINGS", scope: "GLOBAL" },
  ACCOUNT_ROLE_ASSIGN: { siteAdmin: true, page: "SETTINGS", scope: "GLOBAL" },
  SITE_ADMIN_UPDATE: { siteAdmin: true, page: "SETTINGS", scope: "GLOBAL" },
} as const satisfies Record<string, OperationPolicy>;

export type OperationEvent = keyof typeof OPERATION_POLICIES;

export function operationPolicy(event: OperationEvent): OperationPolicy {
  return OPERATION_POLICIES[event];
}
