-- 🎁 جدول تسجيل الصفوف التجريبية (الدوال نفسها في prisma/sql/demo-data-v1.sql)
CREATE TABLE IF NOT EXISTS "DemoRecord" (
  "id"       BIGSERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "tbl"      TEXT NOT NULL,
  "rowId"    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DemoRecord_tenant_tbl_row_key" ON "DemoRecord" ("tenantId", "tbl", "rowId");
CREATE INDEX IF NOT EXISTS "DemoRecord_tenantId_idx" ON "DemoRecord" ("tenantId");
