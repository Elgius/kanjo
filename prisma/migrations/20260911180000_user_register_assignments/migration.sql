-- Preserve existing effective register scope before moving assignment management to accounts.
-- Keep role scope columns and grants for migration auditing; application authorization now reads users.
BEGIN;
ALTER TABLE "user" ADD COLUMN "registerScopeMode" "RegisterScopeMode" NOT NULL DEFAULT 'SELECTED';
ALTER TABLE "roles" ADD COLUMN "workspace" TEXT NOT NULL DEFAULT 'CUSTOM';
CREATE TABLE "user_register_access" (
    "userId" TEXT NOT NULL,
    "registerId" UUID NOT NULL,
    CONSTRAINT "user_register_access_pkey" PRIMARY KEY ("userId", "registerId"),
    CONSTRAINT "user_register_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_register_access_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_register_access_registerId_idx" ON "user_register_access"("registerId");
UPDATE "user" AS u SET "registerScopeMode" = r."registerScopeMode" FROM "roles" AS r WHERE u."roleId" = r."id";
INSERT INTO "user_register_access" ("userId", "registerId")
SELECT u."id", a."registerId" FROM "user" AS u
JOIN "role_register_access" AS a ON a."roleId" = u."roleId"
WHERE u."registerScopeMode" = 'SELECTED';
COMMIT;
