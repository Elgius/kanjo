CREATE TABLE "payment_links" (
  "billId" UUID NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "normalizedPhoneNumber" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_links_pkey" PRIMARY KEY ("billId"),
  CONSTRAINT "payment_links_phone_valid" CHECK (char_length("normalizedPhoneNumber") BETWEEN 7 AND 15),
  CONSTRAINT "payment_links_expiry_valid" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "payment_links_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "payment_links_normalizedPhoneNumber_idx" ON "payment_links"("normalizedPhoneNumber");
CREATE INDEX "payment_links_expiresAt_idx" ON "payment_links"("expiresAt");
