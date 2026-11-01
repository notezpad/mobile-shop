-- ═══════════════════════════════════════════════════════════════════
-- استعادة كلمة المرور (2026-10-24)
-- PasswordResetToken — بنخزّن SHA-256 للتوكن بس (التوكن الأصلي بيتبعت في الإيميل ومش بيتخزّن).
-- صلاحية 30 دقيقة + استخدام مرة واحدة. حد الطلبات بيستخدم جدول LoginAttempt الموجود.
-- آمن للتشغيل أكتر من مرة. التشغيل: npx prisma migrate deploy أو Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_usedAt_idx" ON "PasswordResetToken"("userId", "usedAt");
