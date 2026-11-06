-- 🧾 التحديث 36: سيريال/IMEI الجهاز المباع بيتسحب تلقائيًا وقت البيع ويتطبع في الفاتورة.
-- أعمدة nullable فقط — مفيش أي تأثير على الفواتير القديمة.
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "serials" TEXT;
ALTER TABLE "VariantUnit" ADD COLUMN IF NOT EXISTS "saleItemId" INTEGER;
CREATE INDEX IF NOT EXISTS "VariantUnit_saleItemId_idx" ON "VariantUnit"("saleItemId");
