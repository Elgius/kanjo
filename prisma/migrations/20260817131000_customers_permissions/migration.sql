-- Existing register editors can manage customers and customer credit.

INSERT INTO "role_permissions" ("roleId", "page", "level")
SELECT
  permission."roleId",
  'CUSTOMERS'::"PageKey",
  permission."level"
FROM "role_permissions" AS permission
WHERE permission."page" = 'REGISTERS'
  AND permission."level" <> 'NONE'
ON CONFLICT ("roleId", "page") DO NOTHING;
