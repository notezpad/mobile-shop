-- Migration 2026-10-18: باركود لكل فرع + تحويل/جرد بالألوان والمقاسات.
--
-- 1) الباركود كان UNIQUE على مستوى النظام كله، فنسخة المنتج في الفرع التاني
--    (بعد التحويل) كانت بتتعمل بباركود فاضي ومش بتتلاقي بالمسح. دلوقتي الباركود
--    فريد جوه نفس (المحل + الفرع) — نفس الباركود ممكن يتواجد مرة في كل فرع،
--    لكن مستحيل يتكرر جوه الفرع الواحد (ولا بين الفروع المشتركة branchId = NULL).
-- 2) باركود المقاس/اللون (ProductVariant) بنفس المنطق، بـ trigger لأنه
--    مفيهوش tenantId/branchId جواه.
-- 3) TransferItem / StocktakeItem بيشاوروا على الـ variant (لون/مقاس).
--
-- Idempotent — آمن لو اتشغل أكتر من مرة.

-- ── 1) Product.barcode ──────────────────────────────────────────────────────
DO $$
BEGIN
  -- ممكن يكون constraint أو index حسب طريقة الإنشاء القديمة
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_barcode_key') THEN
    ALTER TABLE "Product" DROP CONSTRAINT "Product_barcode_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "Product_barcode_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenant_branch_barcode_key"
  ON "Product" ("tenantId", COALESCE("branchId", 0), "barcode")
  WHERE "barcode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Product_barcode_idx" ON "Product" ("barcode");

-- ── 2) ProductVariant.barcode ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_barcode_key') THEN
    ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_barcode_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "ProductVariant_barcode_key";

-- جوه المنتج الواحد: مفيش مقاسين بنفس الباركود
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_product_barcode_key"
  ON "ProductVariant" ("productId", "barcode")
  WHERE "barcode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ProductVariant_barcode_idx" ON "ProductVariant" ("barcode");

-- بين منتجات الفرع الواحد: نفس الـ tenant + نفس الفرع (أو الاتنين مشتركين) ممنوع التكرار
CREATE OR REPLACE FUNCTION "variant_barcode_scope_check"() RETURNS trigger AS $fn$
BEGIN
  IF NEW."barcode" IS NOT NULL AND EXISTS (
    SELECT 1
      FROM "ProductVariant" v
      JOIN "Product" p2 ON p2."id" = v."productId"
      JOIN "Product" p1 ON p1."id" = NEW."productId"
     WHERE v."barcode" = NEW."barcode"
       AND v."id" <> COALESCE(NEW."id", -1)
       AND p2."tenantId" = p1."tenantId"
       AND COALESCE(p2."branchId", 0) = COALESCE(p1."branchId", 0)
  ) THEN
    RAISE EXCEPTION 'الباركود مستخدم بالفعل في نفس الفرع' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "variant_barcode_scope_trg" ON "ProductVariant";
CREATE TRIGGER "variant_barcode_scope_trg"
  BEFORE INSERT OR UPDATE OF "barcode", "productId" ON "ProductVariant"
  FOR EACH ROW EXECUTE FUNCTION "variant_barcode_scope_check"();

-- ── 3) variantId على بنود التحويل والجرد ───────────────────────────────────
ALTER TABLE "TransferItem"  ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
ALTER TABLE "StocktakeItem" ADD COLUMN IF NOT EXISTS "variantId" INTEGER;
