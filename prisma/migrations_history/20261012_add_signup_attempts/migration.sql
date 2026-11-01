-- ═══════════════════════════════════════════════════════════════════
-- SignupAttempt — حد التسجيل لكل IP (مكافحة تكرار التجارب المجانية)
-- بنخزّن hash للـ IP (SHA-256) مش الـ IP نفسه.
-- يعمل بأمان مرات متعددة (IF NOT EXISTS).
-- التشغيل: Supabase SQL Editor ← لصق ← Run
-- أو:     npx prisma migrate deploy
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "SignupAttempt" (
    "id" SERIAL NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignupAttempt_ipHash_createdAt_idx"
    ON "SignupAttempt"("ipHash", "createdAt");
