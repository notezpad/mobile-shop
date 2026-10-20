-- ═══════════════════════════════════════════════════════════════════
-- Auth hardening (2026-10-20)
--  1) User.passwordChangedAt — لإبطال جلسات SUPER_ADMIN القديمة بعد تغيير الباسورد
--  2) LoginAttempt — حد محاولات الدخول الفاشلة (لكل إيميل ولكل IP)، بنخزّن hash بس
-- آمن للتشغيل أكتر من مرة. التشغيل: npx prisma migrate deploy أو Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "id" SERIAL NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoginAttempt_keyHash_createdAt_idx"
    ON "LoginAttempt"("keyHash", "createdAt");
