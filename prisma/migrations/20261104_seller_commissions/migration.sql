-- 💰 التحديث الثالث عشر (2026-11-01) — عمولات البائعين
-- نسبة عمولة لكل بائع على مبيعاته (البائع منفصل عن الكشير)، تُسوّى شهرياً،
-- مع تارجت مبيعات اختياري ومفتاح تشغيل/إيقاف لصاحب المحل.
-- idempotent بالكامل: آمن على أي بيئة سبق تطبيق جزء منه.

-- ─── 1) الفاتورة: البائع + لقطة النسبة (% لحظة البيع) ───
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "Sale_tenantId_sellerId_createdAt_idx" ON "Sale"("tenantId", "sellerId", "createdAt");

-- ─── 2) إعدادات المحل (المفتاح + النسبة العامة + التارجت العام) ───
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sellerCommissionsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sellerCommissionRate" DOUBLE PRECISION;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sellerCommissionTarget" DOUBLE PRECISION;

-- ─── 3) بيانات البائع على المستخدم (استثناءات عن العام — null = وراثة) ───
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSeller" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerCommissionRate" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerCommissionTarget" DOUBLE PRECISION;

-- ─── 4) قسيمة الراتب: عمود العمولة (تُضاف للصافي تلقائياً) ───
ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "commission" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ─── 5) جدول التسوية الشهرية — قيد فريد (محل، بائع، شهر) = منع الصرف مرتين ───
CREATE TABLE IF NOT EXISTS "CommissionPayout" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "salesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "target" DOUBLE PRECISION,
    "targetMet" BOOLEAN NOT NULL DEFAULT true,
    "adjustments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viaPayroll" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT,
    "note" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommissionPayout_tenantId_userId_month_key"
  ON "CommissionPayout"("tenantId", "userId", "month");
CREATE INDEX IF NOT EXISTS "CommissionPayout_tenantId_month_idx" ON "CommissionPayout"("tenantId", "month");
CREATE INDEX IF NOT EXISTS "CommissionPayout_tenantId_userId_idx" ON "CommissionPayout"("tenantId", "userId");
DO $$ BEGIN
  ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
