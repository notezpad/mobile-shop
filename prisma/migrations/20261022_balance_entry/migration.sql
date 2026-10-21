-- ═══════════════════════════════════════════════════════════════════
-- BalanceEntry — قيود الرصيد الافتتاحي وتسويات الكشوف (ترحيل من نظام قديم)
-- حركة دفاتر محضة: لا تخزن نقدية ولا تلمس الخزنة (CashEntry).
-- آمن للتشغيل أكتر من مرة. التشغيل: npx prisma migrate deploy أو Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "BalanceEntry" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BalanceEntry_tenantId_kind_refId_idx" ON "BalanceEntry"("tenantId", "kind", "refId");
CREATE INDEX IF NOT EXISTS "BalanceEntry_tenantId_createdAt_idx" ON "BalanceEntry"("tenantId", "createdAt");
