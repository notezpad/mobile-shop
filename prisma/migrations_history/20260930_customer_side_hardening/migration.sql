-- Migration 2026-09-30: customer-side hardening (نفس مستوى حماية الموردين).
--
--  1. Sale.paymentMethod / refunded / dueDate / clientRef
--  2. SaleItem.returnedQty                  -> per-line returned quantity
--  3. SaleReturn / SaleReturnItem tables    -> audit trail for partial returns
--  4. Payment.status/cancelledAt/cancelledBy -> soft cancel (was hard delete)
--  5. Customer.creditLimit                   -> optional credit limit for آجل
--  6. Transaction.status/cancelledAt/cancelledBy -> soft cancel for wallet txns
--  7. FKs: Payment.customer + Sale.customer -> ON DELETE NO ACTION
--     (was CASCADE on payments / SET NULL on sales — deleting a customer used
--     to wipe the debt and the whole payment history).
--  8. Backfill: sales already fully returned by the old whole-invoice DELETE
--     get returnedQty = quantity so they stay non-returnable.
--
-- Idempotent — safe to re-run.

-- 1. Sale columns
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "refunded"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "dueDate"       TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "clientRef"     TEXT;

-- 2. SaleItem.returnedQty
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "returnedQty" INTEGER NOT NULL DEFAULT 0;

-- 3. SaleReturn / SaleReturnItem
CREATE TABLE IF NOT EXISTS "SaleReturn" (
    "id"            SERIAL PRIMARY KEY,
    "tenantId"      TEXT NOT NULL,
    "branchId"      INTEGER,
    "saleId"        INTEGER NOT NULL,
    "customerId"    INTEGER,
    "total"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refund"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundMethod"  TEXT,
    "creditApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note"          TEXT,
    "userId"        TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId")
        REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleReturn_customerId_fkey" FOREIGN KEY ("customerId")
        REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SaleReturn_tenantId_idx"           ON "SaleReturn"("tenantId");
CREATE INDEX IF NOT EXISTS "SaleReturn_tenantId_createdAt_idx" ON "SaleReturn"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "SaleReturn_saleId_idx"             ON "SaleReturn"("saleId");
CREATE INDEX IF NOT EXISTS "SaleReturn_customerId_idx"         ON "SaleReturn"("customerId");

CREATE TABLE IF NOT EXISTS "SaleReturnItem" (
    "id"           SERIAL PRIMARY KEY,
    "saleReturnId" INTEGER NOT NULL,
    "saleItemId"   INTEGER,
    "productId"    INTEGER,
    "name"         TEXT NOT NULL,
    "price"        DOUBLE PRECISION NOT NULL,
    "cost"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity"     INTEGER NOT NULL,
    CONSTRAINT "SaleReturnItem_saleReturnId_fkey" FOREIGN KEY ("saleReturnId")
        REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SaleReturnItem_saleReturnId_idx" ON "SaleReturnItem"("saleReturnId");

-- 4. Payment soft-cancel columns
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

-- 5. Customer.creditLimit
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditLimit" DOUBLE PRECISION;

-- 6. Transaction soft-cancel columns
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

-- 7. Unique idempotency key per tenant (NULLs are allowed to repeat)
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_tenantId_clientRef_key" ON "Sale"("tenantId", "clientRef");

-- 8. Backfill: sales fully returned via the old DELETE endpoint
UPDATE "SaleItem" i
   SET "returnedQty" = i."quantity"
  FROM "Sale" s
 WHERE s."id" = i."saleId" AND s."status" = 'مرتجعة' AND i."returnedQty" = 0;

-- 9. Foreign keys -> NO ACTION.
--    Look the existing constraints up by (table, referenced table) — constraint
--    names differ between deployments. Same technique as the 2026-09-29
--    supplier FK rewrite.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  -- Payment.customer was ON DELETE CASCADE
  SELECT c.conname INTO con_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class r ON r.oid = c.confrelid
   WHERE c.contype = 'f'
     AND t.relname = 'Payment'
     AND r.relname = 'Customer'
     AND c.conkey = ARRAY[(
         SELECT a.attnum FROM pg_attribute a
          WHERE a.attrelid = t.oid AND a.attname = 'customerId'
       )]::smallint[]
   LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "Payment" DROP CONSTRAINT %I', con_name);
    EXECUTE format(
      'ALTER TABLE "Payment" ADD CONSTRAINT %I FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE NO ACTION ON UPDATE CASCADE',
      con_name
    );
  END IF;

  -- Sale.customer was ON DELETE SET NULL (implicit default for optional FK)
  SELECT c.conname INTO con_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class r ON r.oid = c.confrelid
   WHERE c.contype = 'f'
     AND t.relname = 'Sale'
     AND r.relname = 'Customer'
     AND c.conkey = ARRAY[(
         SELECT a.attnum FROM pg_attribute a
          WHERE a.attrelid = t.oid AND a.attname = 'customerId'
       )]::smallint[]
   LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "Sale" DROP CONSTRAINT %I', con_name);
    EXECUTE format(
      'ALTER TABLE "Sale" ADD CONSTRAINT %I FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE NO ACTION ON UPDATE CASCADE',
      con_name
    );
  END IF;
END $$;
