-- EmailLog — سجل الإيميلات المرسلة (حد يومي + منع التكرار). آمن للتشغيل أكتر من مرة.
CREATE TABLE IF NOT EXISTS "EmailLog" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT,
    "toHash" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_tenantId_kind_createdAt_idx" ON "EmailLog"("tenantId", "kind", "createdAt");
