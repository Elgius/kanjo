-- POS inventory, register, sales, and overview schema.
-- Monetary values are stored as integer laari (1 MVR = 100 laari).

CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'REFUNDED', 'VOIDED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE');
CREATE TYPE "InventoryMovementType" AS ENUM ('INITIAL', 'ADJUSTMENT', 'SALE', 'REFUND');

CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "retailPriceLaari" INTEGER NOT NULL,
    "costPriceLaari" INTEGER NOT NULL DEFAULT 0,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_retail_price_nonnegative" CHECK ("retailPriceLaari" >= 0),
    CONSTRAINT "products_cost_price_nonnegative" CHECK ("costPriceLaari" >= 0),
    CONSTRAINT "products_stock_nonnegative" CHECK ("stockQuantity" >= 0),
    CONSTRAINT "products_low_stock_threshold_nonnegative" CHECK ("lowStockThreshold" >= 0)
);

CREATE TABLE "cash_registers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "register_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "registerId" UUID NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingCashLaari" INTEGER NOT NULL DEFAULT 0,
    "closingCashLaari" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "register_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "register_shifts_opening_cash_nonnegative" CHECK ("openingCashLaari" >= 0),
    CONSTRAINT "register_shifts_closing_cash_nonnegative" CHECK ("closingCashLaari" IS NULL OR "closingCashLaari" >= 0),
    CONSTRAINT "register_shifts_closed_state_consistent" CHECK (
      ("status" = 'OPEN' AND "closedAt" IS NULL AND "closedById" IS NULL AND "closingCashLaari" IS NULL)
      OR
      ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL AND "closingCashLaari" IS NOT NULL)
    )
);

CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptNumber" BIGSERIAL NOT NULL,
    "registerShiftId" UUID NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "subtotalLaari" INTEGER NOT NULL,
    "totalLaari" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),
    CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_subtotal_nonnegative" CHECK ("subtotalLaari" >= 0),
    CONSTRAINT "sales_total_nonnegative" CHECK ("totalLaari" >= 0),
    CONSTRAINT "sales_refund_state_consistent" CHECK (
      ("status" = 'REFUNDED' AND "refundedAt" IS NOT NULL)
      OR
      ("status" <> 'REFUNDED' AND "refundedAt" IS NULL)
    )
);

CREATE TABLE "sale_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceLaari" INTEGER NOT NULL,
    "lineTotalLaari" INTEGER NOT NULL,
    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "sale_items_unit_price_nonnegative" CHECK ("unitPriceLaari" >= 0),
    CONSTRAINT "sale_items_line_total_nonnegative" CHECK ("lineTotalLaari" >= 0),
    CONSTRAINT "sale_items_total_matches" CHECK ("lineTotalLaari" = "quantity" * "unitPriceLaari")
);

CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "productId" UUID NOT NULL,
    "saleId" UUID,
    "createdById" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_movements_delta_nonzero" CHECK ("quantityDelta" <> 0),
    CONSTRAINT "inventory_movements_sale_link_consistent" CHECK (
      ("type" IN ('SALE', 'REFUND') AND "saleId" IS NOT NULL)
      OR
      ("type" IN ('INITIAL', 'ADJUSTMENT') AND "saleId" IS NULL)
    )
);

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE INDEX "products_active_updatedAt_idx" ON "products"("active", "updatedAt" DESC);
CREATE INDEX "products_category_idx" ON "products"("category");

CREATE UNIQUE INDEX "cash_registers_code_key" ON "cash_registers"("code");
CREATE UNIQUE INDEX "cash_registers_name_key" ON "cash_registers"("name");
CREATE INDEX "cash_registers_active_name_idx" ON "cash_registers"("active", "name");

CREATE UNIQUE INDEX "register_shifts_one_open_per_register_idx"
  ON "register_shifts"("registerId")
  WHERE "status" = 'OPEN';
CREATE INDEX "register_shifts_registerId_status_openedAt_idx"
  ON "register_shifts"("registerId", "status", "openedAt" DESC);
CREATE INDEX "register_shifts_openedById_idx" ON "register_shifts"("openedById");
CREATE INDEX "register_shifts_closedById_idx" ON "register_shifts"("closedById");

CREATE UNIQUE INDEX "sales_receiptNumber_key" ON "sales"("receiptNumber");
CREATE INDEX "sales_status_createdAt_idx" ON "sales"("status", "createdAt" DESC);
CREATE INDEX "sales_registerShiftId_createdAt_idx"
  ON "sales"("registerShiftId", "createdAt" DESC);
CREATE INDEX "sales_createdById_idx" ON "sales"("createdById");

CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX "sale_items_productId_idx" ON "sale_items"("productId");

CREATE INDEX "inventory_movements_productId_createdAt_idx"
  ON "inventory_movements"("productId", "createdAt" DESC);
CREATE INDEX "inventory_movements_saleId_idx" ON "inventory_movements"("saleId");
CREATE INDEX "inventory_movements_createdById_idx" ON "inventory_movements"("createdById");

ALTER TABLE "register_shifts"
  ADD CONSTRAINT "register_shifts_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_shifts"
  ADD CONSTRAINT "register_shifts_openedById_fkey"
  FOREIGN KEY ("openedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_shifts"
  ADD CONSTRAINT "register_shifts_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_registerShiftId_fkey"
  FOREIGN KEY ("registerShiftId") REFERENCES "register_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

