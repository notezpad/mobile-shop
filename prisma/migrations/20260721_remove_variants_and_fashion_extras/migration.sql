-- Remove size/color variants, assortment units, loyalty points, and gender/style
-- attributes entirely. Wholesale units become simple factor-only multipliers.

-- Drop assortment composition table first (FK depends on ProductVariant + ProductUnit).
DROP TABLE IF EXISTS "ProductUnitItem";

-- Drop the variant-reference column + FK/index on SaleItem before dropping ProductVariant.
ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_variantId_fkey";
DROP INDEX IF EXISTS "SaleItem_variantId_idx";
ALTER TABLE "SaleItem" DROP COLUMN IF EXISTS "variantId";

-- Drop the variants table itself.
DROP TABLE IF EXISTS "ProductVariant";

-- ProductUnit becomes factor-only: drop the assortment mode, make factor required.
-- Any existing rows without a factor (pure assortment units) are removed since
-- the assortment feature no longer exists.
DELETE FROM "ProductUnit" WHERE "factor" IS NULL;
ALTER TABLE "ProductUnit" ALTER COLUMN "factor" SET NOT NULL;

-- Drop fashion attributes that are no longer supported.
ALTER TABLE "Product" DROP COLUMN IF EXISTS "gender";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "style";

-- Drop loyalty points from Customer.
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "loyaltyPoints";
