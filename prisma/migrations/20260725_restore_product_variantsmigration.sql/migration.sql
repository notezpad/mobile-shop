-- Restore product variants (size/color) after removal on 2026-07-21.
-- This recreates ProductVariant and re-links it optionally from SaleItem,
-- so the existing (currently dead) /api/products/[id]/variants routes and
-- ProductVariantsDialog.tsx component work again.

-- 1) Recreate ProductVariant table.
CREATE TABLE "ProductVariant" (
    "id"        SERIAL PRIMARY KEY,
    "productId" INTEGER NOT NULL,
    "size"      TEXT,
    "color"     TEXT,
    "barcode"   TEXT,
    "quantity"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON "ProductVariant"("barcode");
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Re-add the optional variant link on SaleItem.
ALTER TABLE "SaleItem" ADD COLUMN "variantId" INTEGER;

CREATE INDEX "SaleItem_variantId_idx" ON "SaleItem"("variantId");

ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: "gender", "style" (Product) and "loyaltyPoints" (Customer) are
-- intentionally NOT restored here — they were unrelated to variants and
-- are out of scope for this feature.
