-- Migration 2026-10-18: أوامر الشراء ومرتجعات المورد وحركات المخزون تعرف المقاس/اللون.
--
-- المشكلة: أمر الشراء كان بيزوّد Product.quantity بس. المنتج اللي له variants
-- (ألوان/مقاسات) كمية الأب بتتحسب دايماً = مجموع الـ variants، فأول بيعة بعد
-- الشراء كانت بتعمل syncProductQuantityFromVariants وتمسح الكمية المشتراة
-- (شراء 100 → المخزون يرجع لمجموع المقاسات القديم).
--
-- الحل: كل سطر شراء/مرتجع/حركة يقدر يحمل variantId، والمخزون بيتحرك على الـ
-- variant نفسه وكمية الأب بتتحسب من مجموعهم.
--
-- Idempotent — آمن لو اتشغل أكتر من مرة.

ALTER TABLE "PurchaseOrderItem"  ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
ALTER TABLE "PurchaseReturnItem" ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
ALTER TABLE "StockMovement"      ADD COLUMN IF NOT EXISTS "variantId" INTEGER;

CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_variantId_idx" ON "PurchaseOrderItem"("variantId");
CREATE INDEX IF NOT EXISTS "StockMovement_variantId_idx"     ON "StockMovement"("variantId");
