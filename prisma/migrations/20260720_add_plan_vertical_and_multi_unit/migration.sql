-- Add Plan vertical (businessType) + fine-grained enforcement columns.
ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "businessType"   TEXT NOT NULL DEFAULT 'electronics',
  ADD COLUMN IF NOT EXISTS "enabledModules" TEXT,
  ADD COLUMN IF NOT EXISTS "capabilities"   TEXT;

-- Fashion-only optional attribute on Product (used for bulk collection discounts).
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "collection" TEXT;

CREATE INDEX IF NOT EXISTS "Product_tenantId_collection_idx" ON "Product"("tenantId","collection");

-- Wholesale units (simple factor-based multiplier, e.g. دستة/نص دستة/كرتونة).
CREATE TABLE IF NOT EXISTS "ProductUnit" (
  "id"        SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL,
  "name"      TEXT NOT NULL,
  "price"     DOUBLE PRECISION,
  "barcode"   TEXT UNIQUE,
  "factor"    INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
  CONSTRAINT "ProductUnit_productId_name_key" UNIQUE ("productId","name")
);
CREATE INDEX IF NOT EXISTS "ProductUnit_productId_idx" ON "ProductUnit"("productId");

-- Sale-item wholesale-unit metadata (for invoice display).
ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "unitId"       INTEGER,
  ADD COLUMN IF NOT EXISTS "unitLabel"    TEXT,
  ADD COLUMN IF NOT EXISTS "unitQuantity" INTEGER;

DO $$ BEGIN
  ALTER TABLE "SaleItem"
    ADD CONSTRAINT "SaleItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProductUnit"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "SaleItem_unitId_idx" ON "SaleItem"("unitId");

-- Backfill: all existing plans stay as electronics + all-modules (null = all).
UPDATE "Plan" SET "businessType" = 'electronics' WHERE "businessType" IS NULL;
