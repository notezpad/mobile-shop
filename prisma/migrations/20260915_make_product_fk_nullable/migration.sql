-- Migration v3: Make productId FK nullable in historical tables.
-- This lets a product be hard-deleted WITHOUT losing sale/cash/accounting history.
--
-- The approach:
--   1. ALTER each table's productId column to be nullable (DROP NOT NULL).
--   2. The existing FK constraints remain in place, they just allow NULL now.
--   3. When the user clicks "hard delete" with mode=archive:
--      a. The DELETE endpoint sets productId = NULL on all rows that
--         reference the product being deleted (SaleItem, StockMovement,
--         TransferItem, StocktakeItem, PurchaseOrderItem).
--      b. The Product is then deleted (cascades ProductUnit + ProductVariant).
--      c. Historical data (name, price, cost, quantity - stored as
--         snapshot at sale time) remains intact, so reports + cash drawer
--         + accounting + audit trail stay correct.
--
-- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.
-- Safe to re-run.

-- 1. SaleItem.productId -> nullable
ALTER TABLE "SaleItem" ALTER COLUMN "productId" DROP NOT NULL;

-- 2. StockMovement.productId -> nullable
ALTER TABLE "StockMovement" ALTER COLUMN "productId" DROP NOT NULL;

-- 3. TransferItem.productId -> nullable
ALTER TABLE "TransferItem" ALTER COLUMN "productId" DROP NOT NULL;

-- 4. StocktakeItem.productId -> nullable
ALTER TABLE "StocktakeItem" ALTER COLUMN "productId" DROP NOT NULL;

-- 5. PurchaseOrderItem.productId -> nullable
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "productId" DROP NOT NULL;

-- Verification (uncomment to run):
-- SELECT table_name, column_name, is_nullable
-- FROM information_schema.columns
-- WHERE column_name = 'productId'
--   AND table_name IN ('SaleItem', 'StockMovement', 'TransferItem',
--                      'StocktakeItem', 'PurchaseOrderItem')
-- ORDER BY table_name;
-- Expected: all rows show is_nullable = 'YES'.
