-- Register purpose, restaurant menus, expiring inventory batches, and measured balances.

CREATE TYPE "RegisterPurpose" AS ENUM ('SHOP', 'RESTAURANT');

ALTER TABLE "cash_registers"
  ADD COLUMN "purpose" "RegisterPurpose" NOT NULL DEFAULT 'SHOP';

CREATE TABLE "menu_items" (
  "id" UUID NOT NULL,
  "registerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "retailPriceLaari" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_items_price_nonnegative" CHECK ("retailPriceLaari" >= 0)
);

CREATE TABLE "menu_item_ingredients" (
  "menuItemId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "servingMultiplier" INTEGER NOT NULL,
  CONSTRAINT "menu_item_ingredients_pkey" PRIMARY KEY ("menuItemId", "productId"),
  CONSTRAINT "menu_item_ingredients_multiplier_positive" CHECK ("servingMultiplier" > 0)
);

CREATE TABLE "inventory_batches" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "registerId" UUID NOT NULL,
  "receivedById" TEXT NOT NULL,
  "receivedQuantity" DECIMAL(14,3) NOT NULL,
  "remainingQuantity" DECIMAL(14,3) NOT NULL,
  "expiryDate" DATE,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_batches_quantities_valid" CHECK (
    "receivedQuantity" > 0
    AND "remainingQuantity" >= 0
    AND "remainingQuantity" <= "receivedQuantity"
  )
);

INSERT INTO "inventory_batches" (
  "id", "productId", "registerId", "receivedById",
  "receivedQuantity", "remainingQuantity", "expiryDate", "receivedAt"
)
SELECT
  gen_random_uuid(),
  product."id",
  product."registerId",
  actor."createdById",
  CASE
    WHEN product."kind" = 'CONSUMABLE' THEN product."stockQuantity" * product."quantityValue"
    ELSE product."stockQuantity"::DECIMAL
  END,
  CASE
    WHEN product."kind" = 'CONSUMABLE' THEN product."stockQuantity" * product."quantityValue"
    ELSE product."stockQuantity"::DECIMAL
  END,
  NULL,
  COALESCE(actor."createdAt", product."createdAt")
FROM "products" AS product
CROSS JOIN LATERAL (
  SELECT movement."createdById", movement."createdAt"
  FROM "inventory_movements" AS movement
  WHERE movement."productId" = product."id"
  ORDER BY movement."createdAt" ASC, movement."id" ASC
  LIMIT 1
) AS actor
WHERE product."stockQuantity" > 0;

ALTER TABLE "inventory_movements"
  ADD COLUMN "quantityDeltaMeasured" DECIMAL(14,3),
  ADD COLUMN "balanceAfterMeasured" DECIMAL(14,3);

UPDATE "inventory_movements" AS movement
SET
  "quantityDeltaMeasured" = CASE
    WHEN product."kind" = 'CONSUMABLE' THEN movement."quantityDelta" * product."quantityValue"
    ELSE movement."quantityDelta"::DECIMAL
  END,
  "balanceAfterMeasured" = CASE
    WHEN product."kind" = 'CONSUMABLE' THEN movement."balanceAfter" * product."quantityValue"
    ELSE movement."balanceAfter"::DECIMAL
  END
FROM "products" AS product
WHERE movement."productId" = product."id";

ALTER TABLE "inventory_movements"
  DROP COLUMN "quantityDelta",
  DROP COLUMN "balanceAfter";
ALTER TABLE "inventory_movements" RENAME COLUMN "quantityDeltaMeasured" TO "quantityDelta";
ALTER TABLE "inventory_movements" RENAME COLUMN "balanceAfterMeasured" TO "balanceAfter";
ALTER TABLE "inventory_movements"
  ALTER COLUMN "quantityDelta" SET NOT NULL,
  ALTER COLUMN "balanceAfter" SET NOT NULL,
  ADD CONSTRAINT "inventory_movements_balance_nonnegative_v2" CHECK ("balanceAfter" >= 0);

ALTER TABLE "sale_items"
  ADD COLUMN "menuItemId" UUID,
  ADD COLUMN "itemCategory" TEXT;

UPDATE "sale_items" AS item
SET "itemCategory" = product."category"
FROM "products" AS product
WHERE item."productId" = product."id";

ALTER TABLE "sale_items"
  ALTER COLUMN "productId" DROP NOT NULL,
  ALTER COLUMN "productSku" DROP NOT NULL,
  ALTER COLUMN "itemCategory" SET NOT NULL,
  ADD CONSTRAINT "sale_items_exactly_one_source" CHECK (
    ("productId" IS NOT NULL AND "menuItemId" IS NULL)
    OR ("productId" IS NULL AND "menuItemId" IS NOT NULL)
  );

ALTER TABLE "products" DROP COLUMN "stockQuantity";

CREATE UNIQUE INDEX "menu_items_registerId_name_key" ON "menu_items"("registerId", "name");
CREATE INDEX "menu_items_registerId_active_name_idx" ON "menu_items"("registerId", "active", "name");
CREATE INDEX "menu_item_ingredients_productId_idx" ON "menu_item_ingredients"("productId");
CREATE INDEX "inventory_batches_productId_expiryDate_receivedAt_idx" ON "inventory_batches"("productId", "expiryDate", "receivedAt");
CREATE INDEX "inventory_batches_registerId_expiryDate_idx" ON "inventory_batches"("registerId", "expiryDate");
CREATE INDEX "sale_items_menuItemId_idx" ON "sale_items"("menuItemId");

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_item_ingredients"
  ADD CONSTRAINT "menu_item_ingredients_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_item_ingredients"
  ADD CONSTRAINT "menu_item_ingredients_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches"
  ADD CONSTRAINT "inventory_batches_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
