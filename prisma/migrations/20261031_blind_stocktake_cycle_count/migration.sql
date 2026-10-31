-- 🫥 التحديث الحادي عشر + 🔄 الثاني عشر — 2026-10-31
-- الجرد الأعمي للمخزون (Blind Stock Count) + مفاتيح المالك + الجرد الدوري المجدول

-- 1) نوع الجرد: 'open' (تقليدي) | 'blind' (أعمي) — الأوراق القديمة كلها 'open'
--    بدون أي تأثر على محرك الاعتماد الموجود.
ALTER TABLE "Stocktake" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'open';

-- 2) رابط ورقة الجرد بجدول الجرد الدوري اللي ولّدها (null = جرد يدوي)
ALTER TABLE "Stocktake" ADD COLUMN "cycleScheduleId" INTEGER;

-- 3) مفتاح «الجرد الأعمى للخزينة» في يد صاحب المحل (افتراضي: مفعّل = الوضع الحالي)
ALTER TABLE "Tenant" ADD COLUMN "blindCashEnabled" BOOLEAN NOT NULL DEFAULT true;

-- 4) جداول الجرد الدوري المجدول
CREATE TABLE "CycleCountSchedule" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" INTEGER,
    "category" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'blind',
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleCountSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CycleCountSchedule_tenantId_enabled_idx" ON "CycleCountSchedule"("tenantId", "enabled");

ALTER TABLE "CycleCountSchedule" ADD CONSTRAINT "CycleCountSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CycleCountSchedule" ADD CONSTRAINT "CycleCountSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_cycleScheduleId_fkey" FOREIGN KEY ("cycleScheduleId") REFERENCES "CycleCountSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Stocktake_tenantId_mode_idx" ON "Stocktake"("tenantId", "mode");
