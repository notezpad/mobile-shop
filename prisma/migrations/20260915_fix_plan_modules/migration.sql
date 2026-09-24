-- Migration v3 (2026-09-15): Fix the "wrong modules showing in fashion plan" bug.
--
-- ROOT CAUSE:
--   1. The seed file had `maintenance`, `finance`, `expenses`, `cash` in the
--      FASHION_BASIC modules list - even though the comment said "NO maintenance,
--      NO finance". So clothing shops were getting electronics-only modules.
--
--   2. The `variants` capability (sizes/colors) was missing from BOTH fashion
--      tiers - so clothing users could not add sizes/colors to products even
--      though the UI code is there.
--
--   3. The admin PUT /api/admin/plans/[id] endpoint silently ignored the
--      `enabledModules` field, so the admin could never change module lists
--      from the UI. (This migration only fixes DB rows - the code fix is in
--      the route file.)
--
--   4. CRITICAL_MODULES in features.ts included EVERY module - defeating
--      per-plan gating. (This is a code fix, not a DB fix.)
--
-- THIS MIGRATION:
--   1. Updates the 4 canonical plans (electronics-basic, electronics-pro,
--      fashion-basic, fashion-pro) to have the correct enabledModules and
--      capabilities. Idempotent - safe to re-run.
--   2. Also fixes existing subscriptions on those plans to inherit the
--      correct values immediately (no need to wait for the next billing
--      cycle).
--
-- After this migration:
--   - ELECTRONICS_BASIC/PRO: maintenance + finance + expenses + cash ARE
--     in the modules list. capabilities: electronics-basic=[], pro=['multi_unit'].
--   - FASHION_BASIC: maintenance + finance are NOT in the modules list
--     (electronics-only - device repair + Vodafone Cash/Instapay/Fawry).
--     expenses + cash ARE in the modules list (clothes shops have rent + cash drawer).
--     capabilities: basic=['variants'], pro=['collections','multi_unit'] (no variants
--     for wholesale - they sell by carton/lot via multi_unit).
--   - Existing tenants on these plans will see the updated sidebar
--     immediately after refresh (the subscription endpoint reads plan fields
--     fresh on every call - no denormalization to fix).

-- 1. ELECTRONICS-BASIC
UPDATE "Plan"
SET
  "enabledModules"  = '["dashboard","pos","products","sales","maintenance","customers","suppliers","purchases","inventory","finance","expenses","cash","reports","settings","users","branches"]',
  "capabilities"    = '[]',
  "description"      = 'Full management for mobile/computer shop - POS, inventory, repair, financial transactions',
  "businessType"    = 'electronics',
  "isActive"         = true
WHERE "code" = 'electronics-basic';

-- 2. ELECTRONICS-PRO
UPDATE "Plan"
SET
  "enabledModules"  = '["dashboard","pos","products","sales","maintenance","customers","suppliers","purchases","inventory","finance","expenses","cash","reports","settings","users","branches"]',
  "capabilities"    = '["multi_unit"]',
  "description"      = 'All basic features + advanced reports, branches, users, wholesale',
  "businessType"    = 'electronics',
  "isActive"         = true
WHERE "code" = 'electronics-pro';

-- 3. FASHION-BASIC
-- Key change: NO maintenance, NO finance (Vodafone Cash/Instapay/Fawry).
-- Key change: expenses + cash ARE enabled (clothes shops have rent + cash drawer).
-- Key change: variants capability added - clothing always has sizes/colors.
UPDATE "Plan"
SET
  "enabledModules"  = '["dashboard","pos","products","sales","customers","suppliers","purchases","inventory","expenses","cash","reports","settings","users","branches"]',
  "capabilities"    = '["variants"]',
  "description"      = 'Clothing/shoes shop management - POS, inventory, sizes/colors, expenses, cash drawer (no repair/financial transactions)',
  "businessType"    = 'fashion',
  "isActive"         = true
WHERE "code" = 'fashion-basic';

-- 4. FASHION-PRO (wholesale)
-- Key change: NO maintenance, NO finance.
-- Key change: expenses + cash ARE enabled.
-- Key change (v6): NO 'variants' - fashion-pro is for WHOLESALE merchants.
--   They sell by carton/lot via multi_unit, not by individual piece variants.
--   If they want to sell by piece, they add a unit with factor=1. So 'variants'
--   capability is REMOVED here.
UPDATE "Plan"
SET
  "enabledModules"  = '["dashboard","pos","products","sales","customers","suppliers","purchases","inventory","expenses","cash","reports","settings","users","branches"]',
  "capabilities"    = '["collections","multi_unit"]',
  "description"      = 'For wholesale merchants - sell by carton/lot + collection discounts. To sell by piece, add a unit with factor=1.',
  "businessType"    = 'fashion',
  "isActive"         = true
WHERE "code" = 'fashion-pro';

-- 5. Verification (optional - run in SQL editor to see current state)
-- SELECT code, name, "businessType", "enabledModules", "capabilities", "isActive"
-- FROM "Plan"
-- WHERE code IN ('electronics-basic','electronics-pro','fashion-basic','fashion-pro')
-- ORDER BY "sortOrder";
