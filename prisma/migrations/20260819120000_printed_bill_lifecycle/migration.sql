-- Canonical lifecycle records and immutable revisions for printed bills.

ALTER TYPE "RegisterOrderStatus" ADD VALUE IF NOT EXISTS 'CREDITED';

CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PAID', 'CANCELLED');
CREATE TYPE "BillRevisionKind" AS ENUM (
  'INITIAL_PRINT',
  'REPRINT',
  'AMENDMENT',
  'CREDIT_ISSUED',
  'PAYMENT',
  'CANCELLATION'
);

ALTER TABLE "bills"
  ADD COLUMN "billNumber" BIGINT,
  ADD COLUMN "orderId" UUID,
  ADD COLUMN "customerCreditBillId" UUID,
  ADD COLUMN "registerShiftId" UUID,
  ADD COLUMN "status" "BillStatus" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "openedById" TEXT,
  ADD COLUMN "openedByName" TEXT,
  ADD COLUMN "paidById" TEXT,
  ADD COLUMN "paidByName" TEXT,
  ADD COLUMN "customerNote" TEXT,
  ADD COLUMN "restaurantTableId" UUID,
  ADD COLUMN "restaurantTableName" TEXT,
  ADD COLUMN "openedAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "bills"
  ALTER COLUMN "saleId" DROP NOT NULL,
  ALTER COLUMN "receiptNumber" DROP NOT NULL,
  ALTER COLUMN "soldAt" DROP NOT NULL;

UPDATE "bills" AS bill
SET
  "billNumber" = bill."receiptNumber",
  "registerShiftId" = sale."registerShiftId",
  "openedById" = sale."createdById",
  "openedByName" = bill."cashierName",
  "paidById" = sale."createdById",
  "paidByName" = bill."cashierName",
  "openedAt" = bill."soldAt",
  "paidAt" = bill."soldAt",
  "updatedAt" = bill."createdAt"
FROM "sales" AS sale
WHERE sale."id" = bill."saleId";

ALTER TABLE "bills"
  ALTER COLUMN "billNumber" SET NOT NULL,
  ALTER COLUMN "registerShiftId" SET NOT NULL,
  ALTER COLUMN "openedById" SET NOT NULL,
  ALTER COLUMN "openedByName" SET NOT NULL,
  ALTER COLUMN "openedAt" SET NOT NULL;

CREATE SEQUENCE "bills_billNumber_seq";
SELECT setval(
  '"bills_billNumber_seq"',
  COALESCE((SELECT MAX("billNumber") FROM "bills"), 0) + 1,
  false
);
ALTER SEQUENCE "bills_billNumber_seq" OWNED BY "bills"."billNumber";
ALTER TABLE "bills" ALTER COLUMN "billNumber" SET DEFAULT nextval('"bills_billNumber_seq"');

CREATE UNIQUE INDEX "bills_billNumber_key" ON "bills"("billNumber");
CREATE UNIQUE INDEX "bills_orderId_key" ON "bills"("orderId");
CREATE UNIQUE INDEX "bills_customerCreditBillId_key" ON "bills"("customerCreditBillId");
CREATE INDEX "bills_openedAt_id_idx" ON "bills"("openedAt" DESC, "id" DESC);
CREATE INDEX "bills_registerId_openedAt_id_idx" ON "bills"("registerId", "openedAt" DESC, "id" DESC);
CREATE INDEX "bills_registerShiftId_openedAt_id_idx" ON "bills"("registerShiftId", "openedAt" DESC, "id" DESC);
CREATE INDEX "bills_status_openedAt_idx" ON "bills"("status", "openedAt" DESC);
CREATE INDEX "bills_paymentMethod_openedAt_idx" ON "bills"("paymentMethod", "openedAt" DESC);

DROP INDEX IF EXISTS "bills_soldAt_id_idx";
DROP INDEX IF EXISTS "bills_registerId_soldAt_id_idx";
DROP INDEX IF EXISTS "bills_paymentMethod_soldAt_idx";

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "register_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bills_customerCreditBillId_fkey"
  FOREIGN KEY ("customerCreditBillId") REFERENCES "customer_credit_bills"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bills_registerShiftId_fkey"
  FOREIGN KEY ("registerShiftId") REFERENCES "register_shifts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "bills_status_integrity" CHECK (
    ("status" = 'UNPAID' AND "paidAt" IS NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'PAID' AND "saleId" IS NOT NULL AND "receiptNumber" IS NOT NULL AND "paidAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "paidAt" IS NULL)
  );

CREATE TABLE "bill_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "billId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "kind" "BillRevisionKind" NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bill_revisions_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bill_revisions_billId_revision_key" ON "bill_revisions"("billId", "revision");
CREATE INDEX "bill_revisions_billId_createdAt_idx" ON "bill_revisions"("billId", "createdAt");

INSERT INTO "bill_revisions" (
  "billId",
  "revision",
  "kind",
  "actorId",
  "actorName",
  "changes",
  "snapshot",
  "createdAt"
)
SELECT
  bill."id",
  1,
  'PAYMENT'::"BillRevisionKind",
  bill."paidById",
  bill."paidByName",
  jsonb_build_array('Existing paid bill imported.'),
  jsonb_build_object(
    'items', bill."items",
    'subtotalLaari', bill."subtotalLaari",
    'totalLaari', bill."totalLaari",
    'paymentMethod', bill."paymentMethod",
    'customerNote', bill."customerNote",
    'restaurantTableId', bill."restaurantTableId",
    'restaurantTableName', bill."restaurantTableName"
  ),
  bill."paidAt"
FROM "bills" AS bill;
