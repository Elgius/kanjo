-- Additive capability authorization. Legacy role_permissions remains in place for rollback.
CREATE TYPE "RegisterScopeMode" AS ENUM ('ALL', 'SELECTED');

CREATE TYPE "CapabilityKey" AS ENUM (
  'OVERVIEW_VIEW', 'REGISTERS_VIEW', 'REGISTER_ADMIN_VIEW', 'REGISTER_SESSIONS_VIEW',
  'RESTAURANT_MENU_VIEW', 'RESTAURANT_FLOOR_VIEW', 'INVENTORY_VIEW', 'STOCK_VIEW',
  'BILL_HISTORY_VIEW', 'CUSTOMERS_VIEW', 'CUSTOMER_CREDIT_VIEW', 'REPORTING_VIEW',
  'SETTINGS_VIEW', 'AUDIT_LOG_VIEW_ALL', 'REGISTER_CREATE_GLOBAL', 'REGISTER_RENAME',
  'REGISTER_TYPE_CHANGE', 'REGISTER_ARCHIVE', 'REGISTER_DELETE', 'SHIFT_OPEN', 'SHIFT_CLOSE',
  'SHIFT_OVERRIDE', 'SALE_RECORD', 'ORDER_HOLD', 'ORDER_CANCEL', 'CUSTOMER_CREDIT_ISSUE',
  'MENU_ITEM_CREATE', 'MENU_ITEM_UPDATE', 'RESTAURANT_TABLE_CREATE',
  'RESTAURANT_TABLE_UPDATE', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DELETE',
  'CATEGORY_CREATE_GLOBAL', 'CATEGORY_UPDATE_GLOBAL', 'CATEGORY_DELETE_GLOBAL',
  'STOCK_RECEIVE', 'BATCH_EXPIRY_UPDATE', 'STOCK_WRITE_OFF', 'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE', 'CUSTOMER_CREDIT_LIMIT_UPDATE', 'CUSTOMER_CREDIT_SETTLE'
);

-- Existing roles must retain access to every current and future register.
ALTER TABLE "roles"
  ADD COLUMN "registerScopeMode" "RegisterScopeMode" NOT NULL DEFAULT 'ALL';
ALTER TABLE "roles" ALTER COLUMN "registerScopeMode" SET DEFAULT 'SELECTED';

CREATE TABLE "role_capabilities" (
  "roleId" UUID NOT NULL,
  "capability" "CapabilityKey" NOT NULL,
  CONSTRAINT "role_capabilities_pkey" PRIMARY KEY ("roleId", "capability"),
  CONSTRAINT "role_capabilities_roleId_fkey" FOREIGN KEY ("roleId")
    REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "role_register_access" (
  "roleId" UUID NOT NULL,
  "registerId" UUID NOT NULL,
  CONSTRAINT "role_register_access_pkey" PRIMARY KEY ("roleId", "registerId"),
  CONSTRAINT "role_register_access_roleId_fkey" FOREIGN KEY ("roleId")
    REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_register_access_registerId_fkey" FOREIGN KEY ("registerId")
    REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "role_capabilities_capability_idx" ON "role_capabilities"("capability");
CREATE INDEX "role_register_access_registerId_idx" ON "role_register_access"("registerId");

-- Translate each legacy page grant to the capabilities that reproduce its effective access.
WITH mapping(page_name, capability_name, required_level) AS (
  VALUES
    ('OVERVIEW', 'OVERVIEW_VIEW', 'VIEW'),
    ('REGISTERS', 'REGISTERS_VIEW', 'VIEW'),
    ('REGISTERS', 'REGISTER_ADMIN_VIEW', 'VIEW'),
    ('REGISTERS', 'REGISTER_SESSIONS_VIEW', 'VIEW'),
    ('REGISTERS', 'RESTAURANT_MENU_VIEW', 'VIEW'),
    ('REGISTERS', 'RESTAURANT_FLOOR_VIEW', 'VIEW'),
    ('REGISTERS', 'REGISTER_CREATE_GLOBAL', 'EDIT'),
    ('REGISTERS', 'REGISTER_RENAME', 'EDIT'),
    ('REGISTERS', 'REGISTER_TYPE_CHANGE', 'EDIT'),
    ('REGISTERS', 'REGISTER_ARCHIVE', 'EDIT'),
    ('REGISTERS', 'REGISTER_DELETE', 'EDIT'),
    ('REGISTERS', 'SHIFT_OPEN', 'EDIT'),
    ('REGISTERS', 'SHIFT_CLOSE', 'EDIT'),
    ('REGISTERS', 'SHIFT_OVERRIDE', 'EDIT'),
    ('REGISTERS', 'SALE_RECORD', 'EDIT'),
    ('REGISTERS', 'ORDER_HOLD', 'EDIT'),
    ('REGISTERS', 'ORDER_CANCEL', 'EDIT'),
    ('REGISTERS', 'CUSTOMER_CREDIT_ISSUE', 'EDIT'),
    ('REGISTERS', 'CUSTOMER_CREDIT_VIEW', 'EDIT'),
    ('REGISTERS', 'CUSTOMERS_VIEW', 'EDIT'),
    ('REGISTERS', 'MENU_ITEM_CREATE', 'EDIT'),
    ('REGISTERS', 'MENU_ITEM_UPDATE', 'EDIT'),
    ('REGISTERS', 'RESTAURANT_TABLE_CREATE', 'EDIT'),
    ('REGISTERS', 'RESTAURANT_TABLE_UPDATE', 'EDIT'),
    ('INVENTORY', 'INVENTORY_VIEW', 'VIEW'),
    ('INVENTORY', 'PRODUCT_CREATE', 'EDIT'),
    ('INVENTORY', 'PRODUCT_UPDATE', 'EDIT'),
    ('INVENTORY', 'PRODUCT_DELETE', 'EDIT'),
    ('INVENTORY', 'CATEGORY_CREATE_GLOBAL', 'EDIT'),
    ('INVENTORY', 'CATEGORY_UPDATE_GLOBAL', 'EDIT'),
    ('INVENTORY', 'CATEGORY_DELETE_GLOBAL', 'EDIT'),
    ('INVENTORY', 'STOCK_RECEIVE', 'EDIT'),
    ('INVENTORY', 'BATCH_EXPIRY_UPDATE', 'EDIT'),
    ('INVENTORY', 'STOCK_WRITE_OFF', 'EDIT'),
    ('INVENTORY', 'STOCK_VIEW', 'EDIT'),
    ('STOCK', 'STOCK_VIEW', 'VIEW'),
    ('REPORTING', 'REPORTING_VIEW', 'VIEW'),
    ('BILL_HISTORY', 'BILL_HISTORY_VIEW', 'VIEW'),
    ('CUSTOMERS', 'CUSTOMERS_VIEW', 'VIEW'),
    ('CUSTOMERS', 'CUSTOMER_CREDIT_VIEW', 'VIEW'),
    ('CUSTOMERS', 'CUSTOMER_CREATE', 'EDIT'),
    ('CUSTOMERS', 'CUSTOMER_UPDATE', 'EDIT'),
    ('CUSTOMERS', 'CUSTOMER_CREDIT_LIMIT_UPDATE', 'EDIT'),
    ('CUSTOMERS', 'CUSTOMER_CREDIT_SETTLE', 'EDIT'),
    ('SETTINGS', 'SETTINGS_VIEW', 'VIEW'),
    ('AUDIT_LOG', 'AUDIT_LOG_VIEW_ALL', 'VIEW')
)
INSERT INTO "role_capabilities" ("roleId", "capability")
SELECT rp."roleId", mapping.capability_name::"CapabilityKey"
FROM "role_permissions" rp
JOIN mapping ON rp.page::text = mapping.page_name
WHERE rp.level = 'EDIT' OR (rp.level = 'VIEW' AND mapping.required_level = 'VIEW')
ON CONFLICT DO NOTHING;

-- The built-in Full Access role is always exhaustive, including new global trusted reads.
INSERT INTO "role_capabilities" ("roleId", "capability")
SELECT roles.id, capabilities.capability
FROM "roles" roles
CROSS JOIN unnest(enum_range(NULL::"CapabilityKey")) AS capabilities(capability)
WHERE roles."normalizedName" = 'full access'
ON CONFLICT DO NOTHING;
