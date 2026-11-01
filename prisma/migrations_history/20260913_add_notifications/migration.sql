-- Add Notification model for in-app + push notifications
CREATE TABLE IF NOT EXISTS "Notification" (
    "id"        SERIAL PRIMARY KEY,
    "tenantId"  TEXT NOT NULL,
    "userId"    TEXT,
    "type"      TEXT NOT NULL DEFAULT 'info',
    "title"     TEXT NOT NULL,
    "message"   TEXT NOT NULL,
    "link"      TEXT,
    "isRead"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_tenant_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- Add notification settings to Tenant (optional: per-tenant notification prefs)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "notifyLowStock" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "notifyExpiringSubscription" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "notifyNewSales" BOOLEAN NOT NULL DEFAULT false;
