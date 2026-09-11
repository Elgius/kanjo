CREATE TABLE "mutation_requests" (
 "scope" TEXT NOT NULL, "key" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "result" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("scope", "key")
);
ALTER TABLE "customers" ADD COLUMN "mergedIntoId" UUID;
ALTER TABLE "register_shifts" ADD COLUMN "expectedCashLaari" INTEGER,
 ADD COLUMN "cashVarianceLaari" INTEGER, ADD COLUMN "cashVarianceReason" TEXT;
ALTER TABLE "bills" ADD COLUMN "printRequestCount" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "lastPrintRequestedAt" TIMESTAMP(3);
-- Retain evidence of historical requests. These events do not prove paper output.
UPDATE "bills" b SET "printRequestCount" = a.n, "lastPrintRequestedAt" = a.last_at
FROM (SELECT "targetId", count(*)::integer n, max("occurredAt") last_at FROM "audit_logs"
 WHERE event IN ('BILL_TRACK_START', 'BILL_REPRINT') AND outcome = 'SUCCESS' GROUP BY "targetId") a
WHERE b.id::text = a."targetId";
