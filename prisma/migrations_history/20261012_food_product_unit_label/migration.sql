-- 🥬 2026-10-12: اسم وحدة المنتج للمواد الغذائية (علبة / كيس / برطمان / زجاجة ...)
--
--   1) Product.unitLabel   — وحدة المنتج بالمفرد. NULL = «قطعة» (الافتراضي)
--   2) SaleItem.pieceLabel — لقطة من الوحدة وقت البيع (للفواتير القديمة)
--
-- كلاهما nullable بدون default → المنتجات والفواتير الحالية مش بتتغير
-- (بتفضل تعرض «قطعة»)، والـ migration فوري وآمن على Postgres.
-- مفيش backfill تلقائي: المحل يقدر يضغط «تعبئة الوحدات تلقائياً» من شاشة المنتجات.

ALTER TABLE "Product"  ADD COLUMN "unitLabel"   TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "pieceLabel"  TEXT;
