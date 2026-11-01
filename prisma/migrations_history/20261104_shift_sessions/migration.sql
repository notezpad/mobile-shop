-- 🔗 (التحديث السادس عشر) فتح الوردية — جدول جلسات الوردية + ربط الإغلاق بالجلسة
-- ShiftSession: من «فتح الوردية» لحد «إغلاقها» — مين فتح، العهدة الافتتاحية،
-- والفارق وقت الإغلاق بيتحسب على الوردية نفسها بدل رصيد الدرج الكامل.

CREATE TABLE IF NOT EXISTS "ShiftSession" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" INTEGER,
    "shiftName" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "openingFloat" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ShiftSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShiftSession_tenantId_idx" ON "ShiftSession"("tenantId");
CREATE INDEX IF NOT EXISTS "ShiftSession_tenantId_branchId_closedAt_idx"
  ON "ShiftSession"("tenantId", "branchId", "closedAt");

DO $$ BEGIN
  ALTER TABLE "ShiftSession" ADD CONSTRAINT "ShiftSession_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ShiftSession" ADD CONSTRAINT "ShiftSession_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ربط الإغلاق بجلسة الفتح (سجل المسؤولية الكامل: فتحها فلان ← غلقها فلان)
ALTER TABLE "ShiftClosure" ADD COLUMN IF NOT EXISTS "sessionId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "ShiftClosure" ADD CONSTRAINT "ShiftClosure_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ShiftSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "ShiftClosure_sessionId_idx" ON "ShiftClosure"("sessionId");
