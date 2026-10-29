-- 🏬 Phase 2: ربط أوردرات الصيانة بالفرع (idempotent، آمن لإعادة التشغيل)
-- NULL = قديم/غير مسند → بيتعامل كتابع للفرع الرئيسي (نفس قاعدة branch-scope.ts)
ALTER TABLE "MaintenanceOrder" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
CREATE INDEX IF NOT EXISTS "MaintenanceOrder_branchId_idx" ON "MaintenanceOrder"("branchId");
DO $$ BEGIN
  ALTER TABLE "MaintenanceOrder" ADD CONSTRAINT "MaintenanceOrder_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
