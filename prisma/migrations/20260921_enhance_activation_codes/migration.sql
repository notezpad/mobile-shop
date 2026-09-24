-- 🛡️ 2026-09-21 — Subscription Codes Enhancement
--
-- Adds 4 optional columns to "ActivationCode":
--   durationDays       Int?      — custom duration in days (overrides monthly/yearly/trial)
--   expiresAt          DateTime? — code-level expiry date (code can't be redeemed after this)
--   assignedTenantId   String?   — pre-assign code to a specific tenant (only they can redeem)
--   batchLabel         String?   — grouping label for marketing campaigns
--
-- All columns are nullable so existing rows keep working without backfill.
-- Two new indexes added for the most common admin filters (assignedTenantId, batchLabel).

ALTER TABLE "ActivationCode" ADD COLUMN "durationDays"     INTEGER;
ALTER TABLE "ActivationCode" ADD COLUMN "expiresAt"        TIMESTAMP(3);
ALTER TABLE "ActivationCode" ADD COLUMN "assignedTenantId" TEXT;
ALTER TABLE "ActivationCode" ADD COLUMN "batchLabel"       TEXT;

CREATE INDEX "ActivationCode_assignedTenantId_idx" ON "ActivationCode"("assignedTenantId");
CREATE INDEX "ActivationCode_batchLabel_idx"        ON "ActivationCode"("batchLabel");
