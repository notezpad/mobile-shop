-- Unit-Based Dynamic Pricing for Wholesale POS.
--
-- Adds the global on/off toggle + default margin on Tenant, and a
-- per-product margin override on Product. This is purely additive:
-- existing Product.price / ProductUnit.price columns are untouched, and
-- both new Tenant columns default to today's behaviour (feature OFF,
-- 20% margin ready to go the moment a tenant turns it on).
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "dynamicRetailPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "defaultRetailMarginPercent"  DOUBLE PRECISION NOT NULL DEFAULT 20;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "retailMarginPercent" DOUBLE PRECISION;
