CREATE TYPE "AdditionalBillCostType" AS ENUM ('PERCENTAGE', 'FLAT_RATE');

CREATE TABLE "additional_bill_costs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "registerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AdditionalBillCostType" NOT NULL,
  "percentageBasisPoints" INTEGER,
  "flatAmountLaari" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "additional_bill_costs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "additional_bill_costs_value_matches_type" CHECK (
    (
      "type" = 'PERCENTAGE'
      AND "percentageBasisPoints" BETWEEN 1 AND 10000
      AND "flatAmountLaari" IS NULL
    )
    OR
    (
      "type" = 'FLAT_RATE'
      AND "flatAmountLaari" > 0
      AND "percentageBasisPoints" IS NULL
    )
  ),
  CONSTRAINT "additional_bill_costs_registerId_fkey"
    FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "additional_bill_costs_registerId_name_key"
  ON "additional_bill_costs"("registerId", "name");

CREATE INDEX "additional_bill_costs_registerId_type_name_idx"
  ON "additional_bill_costs"("registerId", "type", "name");
