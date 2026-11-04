-- 💵 التحديث 24 (2026-11-04) — الدفعات المقدمة من العمولة (صرف على دفعات قبل آخر الشهر)
-- جدول جديد بالكامل — مش بيلمس CommissionPayout (قيد بائع/شهر الفريد) ولا أي جدول رواتب.
-- الصرف النهائي بيخصم مجموع الدفعات المقدمة تلقائياً من صافي الشهر.
-- idempotent: آمن على أي بيئة سبق تطبيقه.

CREATE TABLE IF NOT EXISTS "CommissionAdvance" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionAdvance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommissionAdvance_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX IF NOT EXISTS "CommissionAdvance_tenantId_userId_month_idx"
  ON "CommissionAdvance"("tenantId", "userId", "month");
CREATE INDEX IF NOT EXISTS "CommissionAdvance_tenantId_month_idx"
  ON "CommissionAdvance"("tenantId", "month");
DO $$ BEGIN
  ALTER TABLE "CommissionAdvance" ADD CONSTRAINT "CommissionAdvance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
