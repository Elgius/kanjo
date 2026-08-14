-- Immutable bill snapshots for every completed sale.

ALTER TYPE "PageKey" ADD VALUE IF NOT EXISTS 'BILL_HISTORY';

CREATE TABLE "bills" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "saleId" UUID NOT NULL,
  "receiptNumber" BIGINT NOT NULL,
  "registerId" UUID NOT NULL,
  "registerName" TEXT NOT NULL,
  "registerCode" TEXT NOT NULL,
  "cashierName" TEXT NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "subtotalLaari" INTEGER NOT NULL,
  "totalLaari" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "soldAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bills_totals_nonnegative" CHECK (
    "subtotalLaari" >= 0 AND "totalLaari" >= 0
  )
);

CREATE UNIQUE INDEX "bills_saleId_key" ON "bills"("saleId");
CREATE UNIQUE INDEX "bills_receiptNumber_key" ON "bills"("receiptNumber");
CREATE INDEX "bills_soldAt_id_idx" ON "bills"("soldAt" DESC, "id" DESC);
CREATE INDEX "bills_registerId_soldAt_id_idx" ON "bills"("registerId", "soldAt" DESC, "id" DESC);
CREATE INDEX "bills_paymentMethod_soldAt_idx" ON "bills"("paymentMethod", "soldAt" DESC);

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "bills" (
  "saleId",
  "receiptNumber",
  "registerId",
  "registerName",
  "registerCode",
  "cashierName",
  "paymentMethod",
  "subtotalLaari",
  "totalLaari",
  "items",
  "soldAt"
)
SELECT
  sale."id",
  sale."receiptNumber",
  shift."registerId",
  register."name",
  register."code",
  cashier."name",
  sale."paymentMethod",
  sale."subtotalLaari",
  sale."totalLaari",
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', item."id",
        'productName', item."productName",
        'productSku', item."productSku",
        'itemCategory', item."itemCategory",
        'quantity', item."quantity",
        'unitPriceLaari', item."unitPriceLaari",
        'lineTotalLaari', item."lineTotalLaari"
      )
      ORDER BY item."id"
    ) FILTER (WHERE item."id" IS NOT NULL),
    '[]'::jsonb
  ),
  sale."createdAt"
FROM "sales" AS sale
JOIN "register_shifts" AS shift ON shift."id" = sale."registerShiftId"
JOIN "cash_registers" AS register ON register."id" = shift."registerId"
JOIN "user" AS cashier ON cashier."id" = sale."createdById"
LEFT JOIN "sale_items" AS item ON item."saleId" = sale."id"
WHERE sale."status" = 'COMPLETED'
GROUP BY
  sale."id",
  shift."registerId",
  register."name",
  register."code",
  cashier."name";
