-- Migration 2026-09-29: partial purchase returns + supplier delete safety.
--
--  1. PurchaseOrderItem.returnedQty  -> per-line returned quantity
--  2. PurchaseOrder.refunded         -> cash received back from the supplier
--  3. PurchaseReturn / PurchaseReturnItem tables (audit trail of each return)
--  4. Backfill: orders already fully returned (status = 'مرتجعة') get
--     returnedQty = quantity and refunded = paid, so they stay non-returnable
--     and the numbers match what the old DELETE endpoint did.
--  5. Supplier FKs: ON DELETE NO ACTION (was CASCADE on payments / SET NULL on
--     orders) so a supplier that has history can no longer be deleted.
--
-- Idempotent — safe to re-run.

-- 1 + 2
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "returnedQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder"     ADD COLUMN IF NOT EXISTS "refunded"    DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 3
CREATE TABLE IF NOT EXISTS "PurchaseReturn" (
    "id"              SERIAL PRIMARY KEY,
    "tenantId"        TEXT NOT NULL,
    "branchId"        INTEGER,
    "purchaseOrderId" INTEGER NOT NULL,
    "supplierId"      INTEGER,
    "total"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refund"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundMethod"    TEXT,
    "note"            TEXT,
    "userId"          TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseReturn_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId")
        REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseReturn_tenantId_idx"            ON "PurchaseReturn"("tenantId");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_tenantId_createdAt_idx"  ON "PurchaseReturn"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseReturn_purchaseOrderId_idx"     ON "PurchaseReturn"("purchaseOrderId");

CREATE TABLE IF NOT EXISTS "PurchaseReturnItem" (
    "id"                  SERIAL PRIMARY KEY,
    "purchaseReturnId"    INTEGER NOT NULL,
    "purchaseOrderItemId" INTEGER,
    "productId"           INTEGER,
    "name"                TEXT NOT NULL,
    "cost"                DOUBLE PRECISION NOT NULL,
    "quantity"            INTEGER NOT NULL,
    CONSTRAINT "PurchaseReturnItem_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId")
        REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseReturnItem_purchaseReturnId_idx" ON "PurchaseReturnItem"("purchaseReturnId");

-- 4. Backfill for orders returned with the old all-or-nothing endpoint
UPDATE "PurchaseOrderItem" i
   SET "returnedQty" = i."quantity"
  FROM "PurchaseOrder" o
 WHERE o."id" = i."purchaseOrderId" AND o."status" = 'مرتجعة' AND i."returnedQty" = 0;

UPDATE "PurchaseOrder" SET "refunded" = "paid" WHERE "status" = 'مرتجعة' AND "refunded" = 0;

-- 5. Supplier foreign keys -> NO ACTION.
--    We look the existing constraints up by (table, referenced table) instead of
--    trusting a name, drop them, and re-create them with a known name.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = '"Supplier"'::regclass
       AND c.conrelid IN ('"SupplierPayment"'::regclass, '"PurchaseOrder"'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId")
  REFERENCES "Supplier"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId")
  REFERENCES "Supplier"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
