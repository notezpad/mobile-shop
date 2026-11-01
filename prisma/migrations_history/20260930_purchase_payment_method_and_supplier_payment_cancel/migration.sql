-- Migration 2026-09-30: accounting fixes for purchases / supplier payments.
--
--  1. PurchaseOrder.paymentMethod  -> how a purchase was paid (cash / wallet / instapay)
--  2. SupplierPayment.status/cancelledAt/cancelledBy -> cancelled payments are kept
--     (marked 'cancelled') instead of being deleted.
--
-- Idempotent — safe to re-run.

ALTER TABLE "PurchaseOrder"   ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'cash';

ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "status"        TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "cancelledAt"   TIMESTAMP(3);
ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "cancelledBy"   TEXT;
