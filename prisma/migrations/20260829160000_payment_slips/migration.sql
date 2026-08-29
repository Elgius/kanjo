ALTER TABLE "payment_links"
  ADD COLUMN "paymentSlipKey" TEXT,
  ADD COLUMN "paymentSlipFileName" TEXT,
  ADD COLUMN "paymentSlipContentType" TEXT,
  ADD COLUMN "paymentSlipSizeBytes" INTEGER,
  ADD COLUMN "paymentSlipUploadedAt" TIMESTAMP(3);

ALTER TABLE "payment_links"
  ADD CONSTRAINT "payment_links_slip_metadata_complete" CHECK (
    ("paymentSlipKey" IS NULL
      AND "paymentSlipFileName" IS NULL
      AND "paymentSlipContentType" IS NULL
      AND "paymentSlipSizeBytes" IS NULL
      AND "paymentSlipUploadedAt" IS NULL)
    OR
    ("paymentSlipKey" IS NOT NULL
      AND "paymentSlipFileName" IS NOT NULL
      AND char_length("paymentSlipFileName") BETWEEN 1 AND 255
      AND "paymentSlipContentType" IN ('application/pdf', 'image/heic', 'image/jpeg', 'image/png', 'image/webp')
      AND "paymentSlipSizeBytes" BETWEEN 1 AND 5242880
      AND "paymentSlipUploadedAt" IS NOT NULL)
  );
