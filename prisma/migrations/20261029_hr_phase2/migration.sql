-- ═══════════════════════════════════════════════════════════════════
-- 🏖️ الموارد البشرية — المرحلة 2 (2026-10-29): الإجازات والأذونات
-- بعد 20261028_hr_phase1. آمن للتشغيل أكتر من مرة.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "HrSettings" ADD COLUMN IF NOT EXISTS "annualLeaveDays" INTEGER NOT NULL DEFAULT 21;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "leaveId" INTEGER;

CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "hours" DOUBLE PRECISION,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeaveRequest_tenantId_startDate_idx" ON "LeaveRequest"("tenantId", "startDate");
CREATE INDEX IF NOT EXISTS "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_leaveId_idx" ON "AttendanceRecord"("leaveId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_employeeId_fkey') THEN
    ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
