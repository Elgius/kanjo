-- Role-based authorization, username credentials, and append-only audit logs.
-- Mirrored from prisma/migrations/20260810180000_roles_permissions_audit/migration.sql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "PageKey" AS ENUM (
  'OVERVIEW', 'REGISTERS', 'INVENTORY', 'STOCK', 'REPORTING', 'SETTINGS', 'AUDIT_LOG'
);
CREATE TYPE "PermissionLevel" AS ENUM ('NONE', 'VIEW', 'EDIT');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

CREATE TABLE "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "role_permissions" (
  "roleId" UUID NOT NULL,
  "page" "PageKey" NOT NULL,
  "level" "PermissionLevel" NOT NULL DEFAULT 'NONE',
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "page")
);

ALTER TABLE "user"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "displayUsername" TEXT,
  ADD COLUMN "roleId" UUID,
  ADD COLUMN "isSiteAdmin" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "roles" ("name", "normalizedName", "description", "updatedAt")
VALUES ('Full Access', 'full access', 'Bootstrap role that preserves access for accounts created before role-based permissions.', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "page", "level")
SELECT role."id", permission."page"::"PageKey", permission."level"::"PermissionLevel"
FROM "roles" AS role
CROSS JOIN (VALUES
  ('OVERVIEW', 'VIEW'), ('REGISTERS', 'EDIT'), ('INVENTORY', 'EDIT'),
  ('STOCK', 'VIEW'), ('REPORTING', 'VIEW'), ('SETTINGS', 'VIEW'), ('AUDIT_LOG', 'VIEW')
) AS permission("page", "level")
WHERE role."normalizedName" = 'full access';

UPDATE "user" SET "roleId" = (SELECT "id" FROM "roles" WHERE "normalizedName" = 'full access') WHERE "roleId" IS NULL;
UPDATE "user" SET "isSiteAdmin" = true WHERE "id" = (SELECT "id" FROM "user" ORDER BY "createdAt", "id" LIMIT 1);
ALTER TABLE "user" ALTER COLUMN "roleId" SET NOT NULL;

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" "AuditOutcome" NOT NULL,
  "event" TEXT NOT NULL,
  "page" "PageKey",
  "actorId" TEXT,
  "actorLabel" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "searchText" TEXT NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
CREATE INDEX "user_roleId_idx" ON "user"("roleId");
CREATE INDEX "user_isSiteAdmin_idx" ON "user"("isSiteAdmin");
CREATE UNIQUE INDEX "roles_normalizedName_key" ON "roles"("normalizedName");
CREATE INDEX "roles_name_idx" ON "roles"("name");
CREATE INDEX "role_permissions_page_level_idx" ON "role_permissions"("page", "level");
CREATE INDEX "audit_logs_occurredAt_id_idx" ON "audit_logs"("occurredAt" DESC, "id" DESC);
CREATE INDEX "audit_logs_actorId_occurredAt_idx" ON "audit_logs"("actorId", "occurredAt" DESC);
CREATE INDEX "audit_logs_outcome_occurredAt_idx" ON "audit_logs"("outcome", "occurredAt" DESC);
CREATE INDEX "audit_logs_event_occurredAt_idx" ON "audit_logs"("event", "occurredAt" DESC);
CREATE INDEX "audit_logs_page_occurredAt_idx" ON "audit_logs"("page", "occurredAt" DESC);
CREATE INDEX "audit_logs_targetType_targetId_occurredAt_idx" ON "audit_logs"("targetType", "targetId", "occurredAt" DESC);
CREATE INDEX "audit_logs_search_text_trgm_idx" ON "audit_logs" USING GIN ("searchText" gin_trgm_ops);

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user" ADD CONSTRAINT "user_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
