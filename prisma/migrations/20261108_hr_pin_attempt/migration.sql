-- 🔐 (v26) عدّاد محاولات PIN غلط في الداتابيز + القسط المستحق الأصلي على القسيمة
CREATE TABLE IF NOT EXISTS "HrPinAttempt" (
    "tenantId" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "fails" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrPinAttempt_pkey" PRIMARY KEY ("tenantId", "employeeId")
);

ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "advanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0;
