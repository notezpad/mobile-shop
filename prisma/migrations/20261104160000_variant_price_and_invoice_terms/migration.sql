-- التحديث 28 (2026-11-04) — تسعير المواصفات + كلام أسفل الفاتورة
--
-- 1) ProductVariant.price — سعر خاص بالمواصفة (للإلكترونيات: نفس الجهاز
--    8GB بـ X و16GB بـ Y بدل تكرار المنتج). nullable = «سيبكه فاضي»
--    بيرجع لسعر المنتج العام. لا يغيّر أي سلوك قائم للمتغيرات بدون سعر.
--
-- 2) Tenant.invoiceTerms — كلام حر أسفل الفاتورة المطبوعة (A4/PDF):
--    شروط الضمان / سياسة الاستبدال. '' = الذيل الافتراضي بس (بدون تغيير).

ALTER TABLE "ProductVariant" ADD COLUMN "price" DOUBLE PRECISION;

ALTER TABLE "Tenant" ADD COLUMN "invoiceTerms" TEXT NOT NULL DEFAULT '';
