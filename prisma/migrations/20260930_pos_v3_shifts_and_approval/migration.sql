-- POS v2 / Phase 3: cash shifts + manager approval settings.
-- Additive only. Defaults keep every existing shop's behaviour unchanged
-- (no shift required, no discount limit, no PIN).
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "posRequireShift"           BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "posEmployeeMaxDiscountPct" DOUBLE PRECISION NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "posManagerPinHash"         TEXT,
  ADD COLUMN IF NOT EXISTS "posPinFailCount"           INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "posPinLockedUntil"         TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CashShift" (
  "id"           SERIAL PRIMARY KEY,
  "tenantId"     TEXT             NOT NULL,
  "branchId"     INTEGER,
  "userId"       TEXT             NOT NULL,
  "openedAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"     TIMESTAMP(3),
  "openingCash"  DOUBLE PRECISION NOT NULL,
  "expectedCash" DOUBLE PRECISION,
  "countedCash"  DOUBLE PRECISION,
  "difference"   DOUBLE PRECISION,
  "note"         TEXT,
  CONSTRAINT "CashShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CashShift_tenantId_userId_closedAt_idx" ON "CashShift" ("tenantId", "userId", "closedAt");
CREATE INDEX IF NOT EXISTS "CashShift_tenantId_openedAt_idx"        ON "CashShift" ("tenantId", "openedAt");
