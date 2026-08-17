-- Customer accounts, credit bills, and stock movement attribution.

ALTER TYPE "PageKey" ADD VALUE IF NOT EXISTS 'CUSTOMERS';

CREATE TYPE "CustomerCreditStatus" AS ENUM ('OUTSTANDING', 'PAID', 'CANCELLED');

CREATE TABLE "customers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "email" TEXT,
  "address" TEXT,
  "phoneNumber" TEXT,
  "nationality" TEXT NOT NULL,
  "creditLimitLaari" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_credit_limit_nonnegative" CHECK ("creditLimitLaari" >= 0)
);

CREATE TABLE "customer_credit_bills" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "registerId" UUID NOT NULL,
  "issuedShiftId" UUID NOT NULL,
  "createdById" TEXT NOT NULL,
  "settledShiftId" UUID,
  "settledById" TEXT,
  "saleId" UUID,
  "status" "CustomerCreditStatus" NOT NULL DEFAULT 'OUTSTANDING',
  "subtotalLaari" INTEGER NOT NULL,
  "totalLaari" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "note" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_credit_bills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_credit_bills_totals_nonnegative" CHECK (
    "subtotalLaari" >= 0 AND "totalLaari" >= 0
  ),
  CONSTRAINT "customer_credit_bills_settlement_consistent" CHECK (
    ("status" = 'PAID' AND "saleId" IS NOT NULL AND "settledShiftId" IS NOT NULL AND "settledById" IS NOT NULL AND "paidAt" IS NOT NULL)
    OR
    ("status" <> 'PAID' AND "saleId" IS NULL AND "settledShiftId" IS NULL AND "settledById" IS NULL AND "paidAt" IS NULL)
  )
);

ALTER TABLE "inventory_movements"
  ADD COLUMN "customerCreditBillId" UUID;

CREATE INDEX "customers_active_name_idx" ON "customers"("active", "name");
CREATE INDEX "customers_email_idx" ON "customers"("email");
CREATE INDEX "customers_phoneNumber_idx" ON "customers"("phoneNumber");
CREATE UNIQUE INDEX "customer_credit_bills_saleId_key" ON "customer_credit_bills"("saleId");
CREATE INDEX "customer_credit_bills_customerId_status_issuedAt_idx" ON "customer_credit_bills"("customerId", "status", "issuedAt" DESC);
CREATE INDEX "customer_credit_bills_registerId_status_issuedAt_idx" ON "customer_credit_bills"("registerId", "status", "issuedAt" DESC);
CREATE INDEX "customer_credit_bills_issuedShiftId_idx" ON "customer_credit_bills"("issuedShiftId");
CREATE INDEX "customer_credit_bills_settledShiftId_idx" ON "customer_credit_bills"("settledShiftId");
CREATE INDEX "customer_credit_bills_createdById_idx" ON "customer_credit_bills"("createdById");
CREATE INDEX "customer_credit_bills_settledById_idx" ON "customer_credit_bills"("settledById");
CREATE INDEX "inventory_movements_customerCreditBillId_idx" ON "inventory_movements"("customerCreditBillId");

ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_registerId_fkey"
  FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_issuedShiftId_fkey"
  FOREIGN KEY ("issuedShiftId") REFERENCES "register_shifts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_settledShiftId_fkey"
  FOREIGN KEY ("settledShiftId") REFERENCES "register_shifts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_settledById_fkey"
  FOREIGN KEY ("settledById") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_bills"
  ADD CONSTRAINT "customer_credit_bills_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_customerCreditBillId_fkey"
  FOREIGN KEY ("customerCreditBillId") REFERENCES "customer_credit_bills"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
