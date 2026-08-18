-- Allow customer-credit inventory movements to use their credit bill as the
-- movement source while preserving the source rules for every movement type.

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_source_link_consistent_v2" CHECK (
    (
      "type" = 'SALE'
      AND (
        ("saleId" IS NOT NULL AND "customerCreditBillId" IS NULL)
        OR
        ("saleId" IS NULL AND "customerCreditBillId" IS NOT NULL)
      )
    )
    OR
    (
      "type" = 'REFUND'
      AND "saleId" IS NOT NULL
      AND "customerCreditBillId" IS NULL
    )
    OR
    (
      "type" IN ('INITIAL', 'ADJUSTMENT')
      AND "saleId" IS NULL
      AND "customerCreditBillId" IS NULL
    )
  ) NOT VALID;

ALTER TABLE "inventory_movements"
  VALIDATE CONSTRAINT "inventory_movements_source_link_consistent_v2";

ALTER TABLE "inventory_movements"
  DROP CONSTRAINT "inventory_movements_sale_link_consistent";

ALTER TABLE "inventory_movements"
  RENAME CONSTRAINT "inventory_movements_source_link_consistent_v2"
  TO "inventory_movements_sale_link_consistent";
