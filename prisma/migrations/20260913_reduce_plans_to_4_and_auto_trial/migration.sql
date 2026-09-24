-- Migration: Reduce plans to 4 + auto-trial on every paid plan
-- Date: 2026-09-13
--
-- Goals:
--   1. Deactivate `trial` and `free` (and any zero-price) plans so they no longer
--      show on the public /pricing page. We don't DELETE them — existing
--      subscriptions still reference them and we want to preserve history.
--   2. Set trialDays = 14 on every remaining paid plan, so any user who picks a
--      plan automatically gets a 14-day trial with that plan's full features.
--   3. Re-activate the 4 canonical paid plans (electronics-basic, electronics-pro,
--      fashion-basic, fashion-pro) in case they were deactivated previously.

-- Step 1: Deactivate zero-price plans (trial / free / etc.)
UPDATE "Plan"
SET "isActive" = false
WHERE "priceMonthly" = 0 AND "priceYearly" = 0;

-- Step 2: Set trialDays = 14 on every active paid plan
UPDATE "Plan"
SET "trialDays" = 14
WHERE "isActive" = true
  AND "priceMonthly" > 0;

-- Step 3: Ensure the 4 canonical plans are active (in case admin disabled them)
UPDATE "Plan"
SET "isActive" = true
WHERE code IN ('electronics-basic', 'electronics-pro', 'fashion-basic', 'fashion-pro');

-- Step 4: Refresh trialDays on the 4 canonical plans (in case Step 2 missed one)
UPDATE "Plan"
SET "trialDays" = 14
WHERE code IN ('electronics-basic', 'electronics-pro', 'fashion-basic', 'fashion-pro');
