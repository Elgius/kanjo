-- Existing roles that can see registers or reporting can view bill history.

INSERT INTO "role_permissions" ("roleId", "page", "level")
SELECT DISTINCT
  permission."roleId",
  'BILL_HISTORY'::"PageKey",
  'VIEW'::"PermissionLevel"
FROM "role_permissions" AS permission
WHERE permission."page" IN ('REGISTERS', 'REPORTING')
  AND permission."level" <> 'NONE'
ON CONFLICT ("roleId", "page") DO NOTHING;
