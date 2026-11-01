-- ═══════════════════════════════════════════════════════════════════════════
-- 👕 seasonal-v1 (2026-10-22): «المخزن الداخلي» للمواسم — باقات الملابس فقط
-- ─────────────────────────────────────────────────────────────────────────────
-- الفكرة: الإجمالي (quantity) = المعروض (displayQty) + في المخزن الداخلي (مشتق).
--   - Product.season:     ALL_YEAR (افتراضي) / SUMMER / WINTER — فاشون فقط
--   - Product.displayQty: الكمية المعروضة على الرفوف (0 <= displayQty <= quantity)
--   - ProductVariant.displayQty: نفس التقسيمة على مستوى اللون/المقاس
--   - StockMovement أنواع جديدة: warehouse_in (نقل للمخزن الداخلي)
--     و warehouse_out (نقل للعرض) — حركة موقع مش حركة مال: صفر أثر مالي،
--     التكلفة زي ما هي وقيمة المخزون الإجمالية مابتتغيرش.
--   - create_sale() اتحدّثت: البيع بيخصم displayQty (من المعروض الأول،
--     والباقي من المخزن الداخلي) وبيزامن مجمع المنتج من المقاسات.
--
-- شغّلها مرة واحدة على داتابيز الإنتاج:
--   psql "$DATABASE_URL" -f prisma/sql/seasonal-v1.sql
--
-- آمنة على إعادة التشغيل (IF NOT EXISTS + backfill مش بيضرب لو الحقول موجودة).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) الأعمدة الجديدة ──────────────────────────────────────────────────────
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "season"     TEXT             NOT NULL DEFAULT 'ALL_YEAR',
  ADD COLUMN IF NOT EXISTS "displayQty" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ProductVariant"
  ADD COLUMN IF NOT EXISTS "displayQty" INTEGER          NOT NULL DEFAULT 0;

-- ── 2) البادك: كل الموجود حالياً معروض بالكامل (نفس السلوك القديم بالظبط) ──
UPDATE "Product"       SET "displayQty" = "quantity" WHERE "displayQty" = 0 AND "quantity" <> 0;
UPDATE "ProductVariant" SET "displayQty" = "quantity" WHERE "displayQty" = 0 AND "quantity" <> 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) دوال RPC الخاصة بالبيع — اتنقلت للملف الرسمي الموحّد (مت-6 — 2026-11-02)
-- ─────────────────────────────────────────────────────────────────────────────
-- كان هنا نسخة تانية من create_sale/get_sale_full/get_sale_by_ref بتخصم
-- displayQty — النسختين بقوا متعارضين ومفيش آلية versioning (مت-6 في
-- تقرير التدقيق). دلوقتي النسخة الرسمية الوحيدة (بتشمل منطق displayQty
-- بتاع v2 + tenantId/variantId/sellerId بتاع مت-5/مت-15 + numeric بتاع ج-5):
--
--    ⚡ prisma/sql/create-sale.sql  —  v5 (نُشرت 2026-11-02)
--
-- أي تعديل مستقبلي على دوال الـ RPC يتم هناك فقط، ويتنشر بـ
-- CREATE OR REPLACE على كل البيئات (هو نفسه مدمج في migration المرحلة 4).
-- ═══════════════════════════════════════════════════════════════════════════
