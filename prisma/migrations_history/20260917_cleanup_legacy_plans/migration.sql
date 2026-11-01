-- Migration: Cleanup legacy plans — keep only the 4 canonical plans.
--
-- The 4 canonical plans that should exist:
--   1. electronics-basic
--   2. electronics-pro
--   3. fashion-basic
--   4. fashion-pro
--
-- Legacy plans to remove:
--   - trial (zero-price, was used before the canonical-plan flow)
--   - basic / pro / free / standard / etc. (any non-canonical code)
--
-- Before deleting legacy plans, we need to migrate ALL subscriptions
-- (active, cancelled, expired, etc.) that point to them. Otherwise the
-- FK constraint will block the DELETE.
--
-- Idempotent — safe to re-run.

-- ─── Step 1: Migrate ALL subscriptions on legacy plans to electronics-basic ───
-- We migrate ALL subscriptions (not just active) because inactive/cancelled
-- ones still hold an FK reference that would block the plan DELETE.
UPDATE "Subscription"
SET "planId" = (SELECT id FROM "Plan" WHERE code = 'electronics-basic' LIMIT 1)
WHERE "planId" IN (
  SELECT id FROM "Plan"
  WHERE code NOT IN ('electronics-basic', 'electronics-pro', 'fashion-basic', 'fashion-pro')
    AND code IS NOT NULL
);

-- ─── Step 2: Hard-delete legacy plans ───
-- At this point ALL subscriptions have been migrated, so no FK references remain.
DELETE FROM "Plan"
WHERE code NOT IN ('electronics-basic', 'electronics-pro', 'fashion-basic', 'fashion-pro')
  AND code IS NOT NULL;

-- ─── Step 3: Verify — should show exactly 4 plans ───
SELECT code, name, "isActive"
FROM "Plan"
ORDER BY "sortOrder";
