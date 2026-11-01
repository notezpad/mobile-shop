-- Migration 2026-11-03: باركود وحدة الجملة (ProductUnit) فريد جوه (المحل + الفرع) بدل النظام كله.
--
-- المشكلة: ProductUnit.barcode كان UNIQUE على مستوى النظام كله — عكس منطق Product/ProductVariant
-- (migration 20261018)، فباركود كرتونة في محل ممكن يتعارض مع محل تاني، ونسخة المنتج في الفرع التاني
-- (بعد التحويل) ماكانش ينفع تاخد نفس باركود الوحدة.
-- الحل: نفس منطق ProductVariant — index جوه المنتج + trigger جوه نفس (tenant + branch).
-- Idempotent — آمن لو اتشغل أكتر من مرة. مفيش بيانات حالية بتتأثر (القيد القديم كان أشد).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductUnit_barcode_key') THEN
    ALTER TABLE "ProductUnit" DROP CONSTRAINT "ProductUnit_barcode_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "ProductUnit_barcode_key";

-- جوه المنتج الواحد: مفيش وحدتين بنفس الباركود
CREATE UNIQUE INDEX IF NOT EXISTS "ProductUnit_product_barcode_key"
  ON "ProductUnit" ("productId", "barcode")
  WHERE "barcode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ProductUnit_barcode_idx" ON "ProductUnit" ("barcode");

-- بين منتجات الفرع الواحد: نفس الـ tenant + نفس الفرع (أو الاتنين مشتركين) ممنوع التكرار
CREATE OR REPLACE FUNCTION "unit_barcode_scope_check"() RETURNS trigger AS $fn$
BEGIN
  IF NEW."barcode" IS NOT NULL AND EXISTS (
    SELECT 1
      FROM "ProductUnit" u
      JOIN "Product" p2 ON p2."id" = u."productId"
      JOIN "Product" p1 ON p1."id" = NEW."productId"
     WHERE u."barcode" = NEW."barcode"
       AND u."id" <> COALESCE(NEW."id", -1)
       AND p2."tenantId" = p1."tenantId"
       AND COALESCE(p2."branchId", 0) = COALESCE(p1."branchId", 0)
  ) THEN
    RAISE EXCEPTION 'الباركود مستخدم بالفعل في نفس الفرع' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "unit_barcode_scope_trg" ON "ProductUnit";
CREATE TRIGGER "unit_barcode_scope_trg"
  BEFORE INSERT OR UPDATE OF "barcode", "productId" ON "ProductUnit"
  FOR EACH ROW EXECUTE FUNCTION "unit_barcode_scope_check"();
