-- ═══════════════════════════════════════════════════════════════════
-- Tracking & Marketing Integrations — جداول التتبع
-- يعمل بأمان مرات متعددة (IF NOT EXISTS في كل الجداول والفهارس)
-- التشغيل: Supabase SQL Editor ← لصق ← Run
-- أو:     npx prisma migrate deploy
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) TrackingEvent — سجل أحداث التتبع لكل منصة (Idempotency) ───
CREATE TABLE IF NOT EXISTS "TrackingEvent" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "payload" TEXT,
    "subscriptionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- فهرس فريد (provider + eventId) = أساس Deduplication/Idempotency
CREATE UNIQUE INDEX IF NOT EXISTS "TrackingEvent_provider_eventId_key"
    ON "TrackingEvent"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "TrackingEvent_eventName_createdAt_idx"
    ON "TrackingEvent"("eventName", "createdAt");
CREATE INDEX IF NOT EXISTS "TrackingEvent_createdAt_idx"
    ON "TrackingEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "TrackingEvent_subscriptionId_idx"
    ON "TrackingEvent"("subscriptionId");

-- ─── 2) UserAttribution — إسناد مصادر الاكتساب (first/last touch) ───
CREATE TABLE IF NOT EXISTS "UserAttribution" (
    "userId" TEXT NOT NULL,
    "firstTouchSource" TEXT,
    "firstTouchMedium" TEXT,
    "firstTouchCampaign" TEXT,
    "firstTouchContent" TEXT,
    "firstTouchTerm" TEXT,
    "firstTouchAt" TIMESTAMP(3),
    "lastTouchSource" TEXT,
    "lastTouchMedium" TEXT,
    "lastTouchCampaign" TEXT,
    "lastTouchContent" TEXT,
    "lastTouchTerm" TEXT,
    "lastTouchAt" TIMESTAMP(3),
    "gclid" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "wbraid" TEXT,
    "gbraid" TEXT,
    "landingPage" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAttribution_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX IF NOT EXISTS "UserAttribution_lastTouchSource_idx"
    ON "UserAttribution"("lastTouchSource");
CREATE INDEX IF NOT EXISTS "UserAttribution_firstTouchSource_idx"
    ON "UserAttribution"("firstTouchSource");
