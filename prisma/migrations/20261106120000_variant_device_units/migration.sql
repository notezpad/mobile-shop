-- التحديث 33 (2026-11-06) — بيانات جهاز الموبايل/التابلت + IMEI لكل جهاز
--
-- 1) أعمدة اختيارية جديدة على ProductVariant (تظهر في دايلوج «موبايل/تابلت» فقط):
--    warrantyMonths — الضمان المتبقي بالشهور (ضمان الوكيل للأجهزة الجديدة).
--    boxCondition   — 'full' = بالكرتونة الكاملة | 'device' = الجهاز بس.
--    edition        — الإصدار/النسخة (نص حر): «نسخة مصرية/سعودية/أمريكية»، «مفتوح الشبكات/مقفول».
--
-- 2) جدول جديد VariantUnit — جهاز فردي جوه المتغير:
--    IMEI/سيريال لكل قطعة على حدة + نسبة صحة البطارية (للآيفون بس) + حالة الجهاز.
--    الـ IMEI فريد على مستوى المحل (tenantId + imeiNorm) — حماية من تكرار جهاز مسروق/مباع قبل كده.
--
-- كل الأعمدة nullable والجدول جديد → مفيش أي تأثير على بيانات قديمة.

ALTER TABLE "ProductVariant" ADD COLUMN "warrantyMonths" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN "boxCondition" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "edition" TEXT;

CREATE TABLE "VariantUnit" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "variantId" INTEGER NOT NULL,
    "imei" TEXT NOT NULL,
    "imeiNorm" TEXT NOT NULL,
    "batteryHealth" INTEGER,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VariantUnit_tenantId_imeiNorm_key" ON "VariantUnit"("tenantId", "imeiNorm");
CREATE INDEX "VariantUnit_variantId_idx" ON "VariantUnit"("variantId");
CREATE INDEX "VariantUnit_tenantId_idx" ON "VariantUnit"("tenantId");

ALTER TABLE "VariantUnit" ADD CONSTRAINT "VariantUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantUnit" ADD CONSTRAINT "VariantUnit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
