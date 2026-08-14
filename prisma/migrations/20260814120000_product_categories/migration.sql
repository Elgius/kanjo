-- Inventory categories are managed records and products reference them.

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_normalizedName_key"
  ON "product_categories"("normalizedName");
CREATE INDEX "product_categories_name_idx"
  ON "product_categories"("name");

INSERT INTO "product_categories" ("id", "name", "normalizedName", "updatedAt")
SELECT
  gen_random_uuid(),
  MIN(btrim("category")),
  lower(btrim("category")),
  CURRENT_TIMESTAMP
FROM "products"
GROUP BY lower(btrim("category"));

ALTER TABLE "products" ADD COLUMN "categoryId" UUID;

UPDATE "products" AS product
SET "categoryId" = category."id"
FROM "product_categories" AS category
WHERE category."normalizedName" = lower(btrim(product."category"));

ALTER TABLE "products" ALTER COLUMN "categoryId" SET NOT NULL;

CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

ALTER TABLE "products"
  ADD CONSTRAINT "products_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
