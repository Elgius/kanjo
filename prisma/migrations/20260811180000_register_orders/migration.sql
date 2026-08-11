-- Held register orders used by the dedicated register-management workspace.

CREATE TYPE "RegisterOrderStatus" AS ENUM ('HELD', 'COMPLETED', 'CANCELLED');

CREATE TABLE "register_orders" (
  "id" UUID NOT NULL,
  "registerShiftId" UUID NOT NULL,
  "createdById" TEXT NOT NULL,
  "saleId" UUID,
  "status" "RegisterOrderStatus" NOT NULL DEFAULT 'HELD',
  "customerNote" TEXT,
  "paymentMethod" "PaymentMethod",
  "subtotalLaari" INTEGER NOT NULL,
  "totalLaari" INTEGER NOT NULL,
  "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "register_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "register_orders_totals_nonnegative" CHECK (
    "subtotalLaari" >= 0 AND "totalLaari" >= 0
  )
);

CREATE TABLE "register_order_items" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "productId" UUID,
  "menuItemId" UUID,
  "productName" TEXT NOT NULL,
  "productSku" TEXT,
  "itemCategory" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceLaari" INTEGER NOT NULL,
  "lineTotalLaari" INTEGER NOT NULL,
  CONSTRAINT "register_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "register_order_items_exactly_one_source" CHECK (
    ("productId" IS NOT NULL AND "menuItemId" IS NULL)
    OR ("productId" IS NULL AND "menuItemId" IS NOT NULL)
  ),
  CONSTRAINT "register_order_items_values_valid" CHECK (
    "quantity" > 0 AND "unitPriceLaari" >= 0 AND "lineTotalLaari" >= 0
  )
);

CREATE INDEX "register_orders_registerShiftId_status_heldAt_idx"
  ON "register_orders"("registerShiftId", "status", "heldAt" DESC);
CREATE INDEX "register_orders_createdById_idx"
  ON "register_orders"("createdById");
CREATE UNIQUE INDEX "register_orders_saleId_key"
  ON "register_orders"("saleId");
CREATE INDEX "register_order_items_orderId_idx"
  ON "register_order_items"("orderId");
CREATE INDEX "register_order_items_productId_idx"
  ON "register_order_items"("productId");
CREATE INDEX "register_order_items_menuItemId_idx"
  ON "register_order_items"("menuItemId");

ALTER TABLE "register_orders"
  ADD CONSTRAINT "register_orders_registerShiftId_fkey"
  FOREIGN KEY ("registerShiftId") REFERENCES "register_shifts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_orders"
  ADD CONSTRAINT "register_orders_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_orders"
  ADD CONSTRAINT "register_orders_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "register_order_items"
  ADD CONSTRAINT "register_order_items_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "register_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "register_order_items"
  ADD CONSTRAINT "register_order_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "register_order_items"
  ADD CONSTRAINT "register_order_items_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
