-- التحديث 30 (2026-11-04) — حالة المتغير (جديد / مستعمل) للإلكترونيات
--
-- ProductVariant.condition — 'new' | 'used' | NULL.
-- NULL = غير محددة (كل المتغيرات القديمة والملابس والغذائية) = بدون أي تغيير في السلوك.
-- nullable بدون default → إضافة عمود فورية بدون إعادة كتابة الجدول.

ALTER TABLE "ProductVariant" ADD COLUMN "condition" TEXT;
