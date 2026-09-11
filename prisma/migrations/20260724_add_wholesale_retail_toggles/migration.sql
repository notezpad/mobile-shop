-- Add wholesale/retail visibility toggles on Tenant.
-- wholesaleEnabled: when false, ProductUnit rows are hidden across the app
--   (units GET returns [], POS shows single price only). Default OFF because
--   most single-shop tenants sell retail only.
-- retailEnabled:    when false, the retail (Product.price) column is hidden
--   in POS and product management. Default ON — matches current behaviour.
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "wholesaleEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "retailEnabled"    BOOLEAN NOT NULL DEFAULT true;
