-- HR phase 3: monthly employee evaluations (idempotent)
CREATE TABLE IF NOT EXISTS "EmployeeEvaluation" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "attendanceScore" DOUBLE PRECISION NOT NULL,
  "perfScore" INTEGER NOT NULL,
  "customerScore" INTEGER NOT NULL,
  "teamScore" INTEGER NOT NULL,
  "overall" DOUBLE PRECISION NOT NULL,
  "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bonusApplied" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeEvaluation_employeeId_month_key" ON "EmployeeEvaluation"("employeeId","month");
CREATE INDEX IF NOT EXISTS "EmployeeEvaluation_tenantId_month_idx" ON "EmployeeEvaluation"("tenantId","month");
DO $$ BEGIN
  ALTER TABLE "EmployeeEvaluation" ADD CONSTRAINT "EmployeeEvaluation_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
