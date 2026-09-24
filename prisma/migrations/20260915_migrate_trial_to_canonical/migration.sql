-- Migration v4: Migrate a tenant from the legacy 'trial' plan to a
-- canonical plan (fashion-basic by default, but you can change the code below).
--
-- USAGE (Supabase SQL Editor):
--   1. Open Supabase, then SQL Editor (left sidebar).
--   2. Paste this whole file.
--   3. Edit the two values below (search for CHANGE THIS, they are inside
--      single quotes).
--   4. Click Run (or press Ctrl+Enter).
--
-- This is idempotent: running it twice with the same target plan code is a
-- no-op the second time.
--
-- 1. EDIT THESE TWO VALUES (replace the strings inside the single quotes)
--    target_plan_code options:
--      'fashion-basic'      -> clothing/shoes basic
--      'fashion-pro'        -> clothing/shoes pro
--      'electronics-basic'  -> mobile/computer basic
--      'electronics-pro'    -> mobile/computer pro
--
--    tenant_id: copy from /api/debug/plan output (the tenantId field)
--
--    After editing, also update the tenant_id in the SELECT at the bottom
--    of this file (search for MUST match).
-- ---------------------------------------------------------------------

DO $$
DECLARE
  -- CHANGE THIS: your tenant ID from /api/debug/plan
  v_tenant_id         TEXT := 'cmrn5he690000u01ltw39s4pc';
  -- CHANGE THIS: fashion-basic | fashion-pro | electronics-basic | electronics-pro
  v_target_plan_code  TEXT := 'fashion-basic';
  v_target_plan_id    INT;
BEGIN
  -- 1. Verify the target plan exists
  SELECT id INTO v_target_plan_id FROM "Plan" WHERE code = v_target_plan_code LIMIT 1;
  IF v_target_plan_id IS NULL THEN
    RAISE EXCEPTION 'Target plan not found: %', v_target_plan_code;
  END IF;

  -- 2. Show the target plan for logging (will appear in the Messages tab)
  RAISE NOTICE 'Target plan: % (id=%), businessType=%',
    v_target_plan_code, v_target_plan_id,
    (SELECT "businessType" FROM "Plan" WHERE id = v_target_plan_id);

  -- 3. Update the tenant's active subscription to point to the new plan
  UPDATE "Subscription"
  SET
    "planId"      = v_target_plan_id,
    "paymentNote" = COALESCE("paymentNote", '') || ' | migrated-from-trial-via-sql-' || v_target_plan_code
  WHERE
    "tenantId" = v_tenant_id
    AND status = 'active';

  RAISE NOTICE 'Migrated tenant % to plan %', v_tenant_id, v_target_plan_code;
END $$;

-- 2. VERIFY - should show the new plan code (not 'trial')
--    CHANGE THIS tenant_id to match the one above
SELECT
  s.id              AS subscription_id,
  s."tenantId",
  s.status,
  p.id              AS plan_id,
  p.code            AS plan_code,
  p.name            AS plan_name,
  p."businessType",
  p."enabledModules",
  p."capabilities"
FROM "Subscription" s
JOIN "Plan" p ON p.id = s."planId"
WHERE
  s."tenantId" = 'cmrn5he690000u01ltw39s4pc'  -- MUST match v_tenant_id above
  AND s.status = 'active'
ORDER BY s."endDate" DESC
LIMIT 1;
