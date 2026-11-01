-- ═══════════════════════════════════════════════════════════════════
-- 👥 الموارد البشرية — المرحلة 1 (2026-10-28)
-- موظفين، حضور، سلف، رواتب. آمن للتشغيل أكتر من مرة.
-- التشغيل: npx prisma migrate deploy  أو  Supabase SQL Editor (الصق الملف كله)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Employee" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" INTEGER,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT,
    "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weeklyOffDay" INTEGER NOT NULL DEFAULT 5,
    "pinHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Employee_tenantId_idx" ON "Employee"("tenantId");
CREATE INDEX IF NOT EXISTS "Employee_tenantId_active_idx" ON "Employee"("tenantId", "active");

CREATE TABLE IF NOT EXISTS "HrSettings" (
    "tenantId" TEXT NOT NULL,
    "shiftStart" TEXT NOT NULL DEFAULT '10:00',
    "shiftHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "lateMode" TEXT NOT NULL DEFAULT 'per_minute',
    "dayDivisor" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrSettings_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_tenantId_date_idx" ON "AttendanceRecord"("tenantId", "date");

CREATE TABLE IF NOT EXISTS "EmployeeAdvance" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "installment" DOUBLE PRECISION NOT NULL,
    "remaining" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "method" TEXT NOT NULL DEFAULT 'cash',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmployeeAdvance_tenantId_status_idx" ON "EmployeeAdvance"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "EmployeeAdvance_employeeId_idx" ON "EmployeeAdvance"("employeeId");

CREATE TABLE IF NOT EXISTS "PayrollRun" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_tenantId_month_key" ON "PayrollRun"("tenantId", "month");

CREATE TABLE IF NOT EXISTS "Payslip" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "employeeName" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "payableBase" DOUBLE PRECISION NOT NULL,
    "absentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absenceDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Payslip_runId_employeeId_key" ON "Payslip"("runId", "employeeId");
CREATE INDEX IF NOT EXISTS "Payslip_tenantId_idx" ON "Payslip"("tenantId");

-- المفاتيح الأجنبية (آمنة لإعادة التشغيل)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_tenantId_fkey') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrSettings_tenantId_fkey') THEN
    ALTER TABLE "HrSettings" ADD CONSTRAINT "HrSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceRecord_employeeId_fkey') THEN
    ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeAdvance_employeeId_fkey') THEN
    ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollRun_tenantId_fkey') THEN
    ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payslip_runId_fkey') THEN
    ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payslip_employeeId_fkey') THEN
    ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ═══ تفعيل موديول hr في الباقات الاحترافية (عدّل الأكواد حسب رغبتك) ═══
-- الباقات اللي enabledModules فيها فاضي بتاخد كل الموديولات تلقائيًا ومش محتاجة تعديل.
UPDATE "Plan"
SET "enabledModules" = (("enabledModules"::jsonb) || '"hr"'::jsonb)::text
WHERE "code" IN ('electronics-pro', 'fashion-pro')
  AND "enabledModules" IS NOT NULL
  AND "enabledModules" <> ''
  AND jsonb_typeof("enabledModules"::jsonb) = 'array'
  AND NOT (("enabledModules"::jsonb) ? 'hr');
