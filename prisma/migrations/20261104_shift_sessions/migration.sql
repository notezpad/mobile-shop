-- ═══════════════════════════════════════════════════════════════════
-- (التحديث السادس عشر) فتح الوردية + مسؤولية الدرج للورديات
-- ShiftSession: من «فتح الوردية» لحد «إغلاقها» — مين فتح، العهدة
-- الافتتاحية (اختيارية)، مين قفل، ومتوقع الوردية نفسها (العهدة/آخر
-- إغلاق + حركات الكاش من وقت الفتح) والفارق.
-- ShiftClosure.sessionId: ربط الإغلاق بجلسته (null = إغلاق قديم أو من
-- غير فتح رسمي — نفس سلوك قبل التحديث بالظبط، backward-compatible).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ShiftSession" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" INTEGER,
    "shiftName" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "openingFloat" DOUBLE PRECISION,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedByName" TEXT,
    "counted" DOUBLE PRECISION,
    "expected" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShiftSession_tenantId_idx" ON "ShiftSession"("tenantId");
CREATE INDEX IF NOT EXISTS "ShiftSession_tenantId_branchId_closedAt_idx"
  ON "ShiftSession"("tenantId", "branchId", "closedAt");

DO $$ BEGIN
  ALTER TABLE "ShiftSession" ADD CONSTRAINT "ShiftSession_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ShiftSession" ADD CONSTRAINT "ShiftSession_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ShiftClosure" ADD COLUMN IF NOT EXISTS "sessionId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "ShiftClosure" ADD CONSTRAINT "ShiftClosure_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ShiftSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
