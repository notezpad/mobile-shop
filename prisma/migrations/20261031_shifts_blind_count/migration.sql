-- 🕐 2026-10-31 (التحديث الثامن): الورديات + الجرد الأعمى للدرج (Blind Count)
-- 1) Branch.shifts: تعريف ورديات الفرع [{name, from, to}] — NULL/[] = الميزة متفعّلةش للفرع.
-- 2) ShiftClosure: سجل إغلاق الوردية بالجرد الأعمى — expected/counted/variance
--    بتتحسب في السيرفر، والرد للكاشير بيبقى {ok} فقط (مفيش أي أرقام راجعة له).

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "shifts" JSONB;

CREATE TABLE IF NOT EXISTS "ShiftClosure" (
    "id"        SERIAL PRIMARY KEY,
    "tenantId"  TEXT NOT NULL,
    "branchId"  INTEGER,
    "shiftName" TEXT,
    "userId"    TEXT,
    "counted"   DOUBLE PRECISION NOT NULL,
    "expected"  DOUBLE PRECISION NOT NULL,
    "variance"  DOUBLE PRECISION NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftClosure_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftClosure_branchId_fkey" FOREIGN KEY ("branchId")
        REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ShiftClosure_tenantId_createdAt_idx"
    ON "ShiftClosure"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShiftClosure_tenantId_branchId_createdAt_idx"
    ON "ShiftClosure"("tenantId", "branchId", "createdAt");
