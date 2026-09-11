-- Reversing settled credit must retain the original settlement history.
ALTER TABLE "customer_credit_bills"
  DROP CONSTRAINT "customer_credit_bills_settlement_consistent",
  ADD CONSTRAINT "customer_credit_bills_settlement_consistent" CHECK (
    (
      "status" IN ('PAID', 'REVERSED')
      AND "saleId" IS NOT NULL AND "settledShiftId" IS NOT NULL
      AND "settledById" IS NOT NULL AND "paidAt" IS NOT NULL
    ) OR (
      "status" <> 'PAID'
      AND "saleId" IS NULL AND "settledShiftId" IS NULL
      AND "settledById" IS NULL AND "paidAt" IS NULL
    )
  );
