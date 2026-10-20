-- ═══════════════════════════════════════════════════════════════════
-- AuditLog — سجل نشاط الأدمن (من عمل إيه، على مين، ومتى)
-- آمن للتشغيل أكتر من مرة. التشغيل: npx prisma migrate deploy أو Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_targetId_idx" ON "AuditLog"("targetId");
