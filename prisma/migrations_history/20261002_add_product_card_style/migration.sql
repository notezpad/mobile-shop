-- Products page card style per tenant: 'auto' | 'image' | 'compact'.
-- Purely additive; every existing tenant starts on 'auto'.
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "productCardStyle" TEXT NOT NULL DEFAULT 'auto';
