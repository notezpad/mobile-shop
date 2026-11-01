-- UtmCampaign — مكتبة حملات UTM (Marketing & Tracking)
CREATE TABLE IF NOT EXISTS "UtmCampaign" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "utmId" TEXT,
    "fullUrl" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtmCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UtmCampaign_urlHash_key" ON "UtmCampaign"("urlHash");
CREATE INDEX IF NOT EXISTS "UtmCampaign_platform_idx" ON "UtmCampaign"("platform");
CREATE INDEX IF NOT EXISTS "UtmCampaign_utmCampaign_idx" ON "UtmCampaign"("utmCampaign");
CREATE INDEX IF NOT EXISTS "UtmCampaign_archived_createdAt_idx" ON "UtmCampaign"("archived", "createdAt");
