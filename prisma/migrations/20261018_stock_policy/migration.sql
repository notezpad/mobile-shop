-- Migration 2026-10-18: سياسة حركات المخزون اليدوية (كود سبب + علامة مراجعة).
--   reasonCode  : كود السبب المحدد (gift_out / entry_fix / count_surplus / damage ...)
--   needsReview : حركة يدوية عملها موظف (مش مدير) — تظهر للمدير للمراجعة
--   reviewedAt/By : اتراجعت من مين وإمتى
-- Idempotent.
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reasonCode"  TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reviewedAt"  TIMESTAMP(3);
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reviewedBy"  TEXT;

-- فهرس جزئي: الحركات اللي لسه محتاجة مراجعة بس (قليلة، فسريع)
CREATE INDEX IF NOT EXISTS "StockMovement_needsReview_idx"
  ON "StockMovement" ("tenantId", "createdAt") WHERE "needsReview" = true;
