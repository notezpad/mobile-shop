-- Migration v3 (2026-09-15): Add `method` column to CashEntry
-- for per-method drawer aggregation.
--
-- The cash drawer currently mixes cash + Vodafone Cash + Instapay + Fawry
-- into one number. But Vodafone Cash is a DIFFERENT accounting asset than
-- physical cash - the shop cannot pay rent with Vodafone Cash. This
-- migration lets each CashEntry store its payment method so the reports
-- can split the drawer by method.
--
-- Also adds the SalePayment.cashEntryId column + FK so DELETE sale can
-- reverse each payment's cash entry via the FK link (instead of date-range
-- guessing).
--
-- Idempotent - safe to re-run.

-- 1. Add `method` column to CashEntry
ALTER TABLE "CashEntry" ADD COLUMN IF NOT EXISTS "method" TEXT;
CREATE INDEX IF NOT EXISTS "CashEntry_method_idx" ON "CashEntry"("method");

-- Backfill: set method='cash' for existing entries (legacy entries had no
-- method tracking - we assume cash since that was the default before).
-- This is a safe default - shop owners who want to audit can re-tag later.
UPDATE "CashEntry" SET "method" = 'cash' WHERE "method" IS NULL;

-- 2. Add SalePayment.cashEntryId column + FK
ALTER TABLE "SalePayment" ADD COLUMN IF NOT EXISTS "cashEntryId" INTEGER;
CREATE INDEX IF NOT EXISTS "SalePayment_cashEntryId_idx" ON "SalePayment"("cashEntryId");

-- Add FK constraint (DO $$ ... END $$ for IF NOT EXISTS check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalePayment_cashEntryId_fkey'
  ) THEN
    ALTER TABLE "SalePayment"
      ADD CONSTRAINT "SalePayment_cashEntryId_fkey"
      FOREIGN KEY ("cashEntryId") REFERENCES "CashEntry"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Verification (uncomment to run):
-- SELECT
--   table_name,
--   column_name,
--   data_type,
--   is_nullable
-- FROM information_schema.columns
-- WHERE (table_name = 'CashEntry' AND column_name = 'method')
--    OR (table_name = 'SalePayment' AND column_name = 'cashEntryId')
-- ORDER BY table_name;
-- Expected: both rows exist.
