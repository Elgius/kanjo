-- Register-scoped stock and consumable product metadata.

CREATE TYPE "ProductKind" AS ENUM ('GOODS', 'CONSUMABLE');

ALTER TABLE "products"
  ADD COLUMN "registerId" UUID,
  ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'GOODS',
  ADD COLUMN "quantityMetric" TEXT,
  ADD COLUMN "quantityValue" DECIMAL(12,3),
  ADD COLUMN "servingSize" DECIMAL(12,3);

-- Existing catalogues predate register ownership. Attach them to the oldest
-- register, creating a sensible default only when products exist without one.
INSERT INTO "cash_registers" ("code", "name", "active", "createdAt", "updatedAt")
SELECT 'MAIN', 'Main Register', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "products")
  AND NOT EXISTS (SELECT 1 FROM "cash_registers");

UPDATE "products"
SET "registerId" = (
  SELECT "id" FROM "cash_registers" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
)
WHERE "registerId" IS NULL;

ALTER TABLE "products" ALTER COLUMN "registerId" SET NOT NULL;

ALTER TABLE "products"
  ADD CONSTRAINT "products_consumable_details_consistent" CHECK (
    ("kind" = 'GOODS' AND "quantityMetric" IS NULL AND "quantityValue" IS NULL AND "servingSize" IS NULL)
    OR
    (
      "kind" = 'CONSUMABLE'
      AND NULLIF(BTRIM("quantityMetric"), '') IS NOT NULL
      AND "quantityValue" > 0
      AND "servingSize" > 0
      AND "servingSize" <= "quantityValue"
    )
  );

ALTER TABLE "inventory_movements"
  ADD COLUMN "registerId" UUID,
  ADD COLUMN "balanceAfter" INTEGER;

UPDATE "inventory_movements" AS movement
SET "registerId" = product."registerId"
FROM "products" AS product
WHERE movement."productId" = product."id";

WITH movement_balances AS (
  SELECT
    "id",
    SUM("quantityDelta") OVER (
      PARTITION BY "productId"
      ORDER BY "createdAt" ASC, "id" ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::INTEGER AS "balanceAfter"
  FROM "inventory_movements"
)
UPDATE "inventory_movements" AS movement
SET "balanceAfter" = movement_balances."balanceAfter"
FROM movement_balances
WHERE movement."id" = movement_balances."id";

ALTER TABLE "inventory_movements"
  ALTER COLUMN "registerId" SET NOT NULL,
  ALTER COLUMN "balanceAfter" SET NOT NULL;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_balance_nonnegative" CHECK ("balanceAfter" >= 0);

CREATE INDEX "products_registerId_active_name_idx"
  ON "products"("registerId", "active", "name");
CREATE INDEX "inventory_movements_registerId_createdAt_idx"
  ON "inventory_movements"("registerId", "createdAt" DESC);

ALTER TABLE "products"
  ADD CONSTRAINT "products_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
