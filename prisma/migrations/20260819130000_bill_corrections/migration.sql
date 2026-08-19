-- Site-admin paid-bill amendments/reversals and exact inventory consumption tracking.

ALTER TYPE "BillStatus" ADD VALUE IF NOT EXISTS 'AMENDED' BEFORE 'CANCELLED';
ALTER TYPE "BillStatus" ADD VALUE IF NOT EXISTS 'REVERSED' BEFORE 'CANCELLED';
ALTER TYPE "BillRevisionKind" ADD VALUE IF NOT EXISTS 'REVERSAL' BEFORE 'CREDIT_ISSUED';
ALTER TYPE "CustomerCreditStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

ALTER TABLE "bills" DROP CONSTRAINT IF EXISTS "bills_status_integrity";
ALTER TABLE "bills" ADD CONSTRAINT "bills_status_integrity" CHECK (
  ("status"::text = 'UNPAID' AND "paidAt" IS NULL AND "cancelledAt" IS NULL)
  OR
  ("status"::text IN ('PAID', 'AMENDED', 'REVERSED') AND "saleId" IS NOT NULL AND "receiptNumber" IS NOT NULL AND "paidAt" IS NOT NULL AND "cancelledAt" IS NULL)
  OR
  ("status"::text = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "paidAt" IS NULL)
);

ALTER TABLE "bill_revisions" ADD COLUMN "metadata" JSONB;

CREATE TABLE "sale_item_stock_components" (
  "saleItemId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "measuredPerItem" DECIMAL(14,3) NOT NULL,
  CONSTRAINT "sale_item_stock_components_pkey" PRIMARY KEY ("saleItemId", "productId"),
  CONSTRAINT "sale_item_stock_components_positive" CHECK ("measuredPerItem" > 0),
  CONSTRAINT "sale_item_stock_components_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_item_stock_components_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sale_item_stock_components_productId_idx" ON "sale_item_stock_components"("productId");

CREATE TABLE "inventory_consumptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sourceLineId" UUID NOT NULL,
  "saleId" UUID,
  "saleItemId" UUID,
  "customerCreditBillId" UUID,
  "inventoryMovementId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "consumedQuantity" DECIMAL(14,3) NOT NULL,
  "restoredQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "retiredQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_consumptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_consumptions_quantities" CHECK (
    "consumedQuantity" > 0
    AND "restoredQuantity" >= 0
    AND "retiredQuantity" >= 0
    AND "restoredQuantity" + "retiredQuantity" <= "consumedQuantity"
  ),
  CONSTRAINT "inventory_consumptions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_consumptions_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_consumptions_customerCreditBillId_fkey" FOREIGN KEY ("customerCreditBillId") REFERENCES "customer_credit_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_consumptions_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_consumptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_consumptions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "inventory_consumptions_sourceLineId_idx" ON "inventory_consumptions"("sourceLineId");
CREATE INDEX "inventory_consumptions_saleId_idx" ON "inventory_consumptions"("saleId");
CREATE INDEX "inventory_consumptions_saleItemId_idx" ON "inventory_consumptions"("saleItemId");
CREATE INDEX "inventory_consumptions_customerCreditBillId_idx" ON "inventory_consumptions"("customerCreditBillId");
CREATE INDEX "inventory_consumptions_inventoryMovementId_idx" ON "inventory_consumptions"("inventoryMovementId");
CREATE INDEX "inventory_consumptions_productId_idx" ON "inventory_consumptions"("productId");
CREATE INDEX "inventory_consumptions_batchId_idx" ON "inventory_consumptions"("batchId");
