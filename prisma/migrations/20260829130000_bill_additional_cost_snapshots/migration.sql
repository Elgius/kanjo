ALTER TABLE "register_orders"
  ADD COLUMN "additionalCosts" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "sales"
  ADD COLUMN "additionalCosts" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "bills"
  ADD COLUMN "additionalCosts" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "customer_credit_bills"
  ADD COLUMN "additionalCosts" JSONB NOT NULL DEFAULT '[]'::jsonb;
