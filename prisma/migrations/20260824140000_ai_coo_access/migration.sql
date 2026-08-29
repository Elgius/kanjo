ALTER TYPE "PageKey" ADD VALUE 'AI_COO';
ALTER TYPE "CapabilityKey" ADD VALUE 'AI_COO_ACCESS';

-- Existing Full Access roles receive the new feature; every other role is opt-in.
INSERT INTO "role_capabilities" ("roleId", "capability")
SELECT "id", 'AI_COO_ACCESS'::"CapabilityKey"
FROM "roles"
WHERE "normalizedName" = 'full access'
ON CONFLICT DO NOTHING;
