-- ═══════════════════════════════════════════════════════════════════
-- ⚡ nezampos v9 — Postgres indexes لأعمدة البحث والفلترة الساخنة
-- ═══════════════════════════════════════════════════════════════════
-- الهدف: تحويل الـ seq scans في استعلامات التقارير/الداشبورد/القوائم
-- إلى index scans — أسرع 10-50x على جداول الفواتير والحركات الكبيرة،
-- وأهم من كده: CPU أقل على خطة Cloudflare المجانية (10ms/طلب — خطأ 1102).
--
-- آمن للتشغيل المتكرر (IF NOT EXISTS). متوافق مع Prisma schema.prisma
-- (نفس الفهارس مضافة فيه — prisma db push هيعتبرها موجودة).
--
-- طرق التطبيق (اختر واحدة):
--   أ) psql "$DIRECT_URL" -f scripts/add-indexes-v9.sql
--   ب) Supabase SQL Editor → الصق المحتوى وشغّل
--   ج) npx prisma db push   (بيطبّق نفس الفهارس من الـ schema)
-- ═══════════════════════════════════════════════════════════════════

-- Sale: كل استعلامات الأرباح/التقارير بتفلتر tenantId + status='مكتملة'
-- + نطاق createdAt (dashboard/reports SaleItem joins)
CREATE INDEX IF NOT EXISTS "Sale_tenantId_status_createdAt_idx"
  ON "Sale" ("tenantId", "status", "createdAt");

-- Sale: فواتير الآجل المتأخرة في الداشبورد (dueDate < اليوم، status != مرتجعة)
CREATE INDEX IF NOT EXISTS "Sale_tenantId_dueDate_idx"
  ON "Sale" ("tenantId", "dueDate");

-- Customer/Supplier: إجمالي الديون/المستحقات SUM(balance WHERE > 0)
-- (فهرس تغطية — بيقرا من الفهرس نفسه بدون الوصول للجدول)
CREATE INDEX IF NOT EXISTS "Customer_tenantId_balance_idx"
  ON "Customer" ("tenantId", "balance");
CREATE INDEX IF NOT EXISTS "Supplier_tenantId_balance_idx"
  ON "Supplier" ("tenantId", "balance");

-- MaintenanceOrder: تقارير الصيانة بتجمّع receivedAt/deliveredAt بنطاق
CREATE INDEX IF NOT EXISTS "MaintenanceOrder_tenantId_receivedAt_idx"
  ON "MaintenanceOrder" ("tenantId", "receivedAt");
CREATE INDEX IF NOT EXISTS "MaintenanceOrder_tenantId_deliveredAt_idx"
  ON "MaintenanceOrder" ("tenantId", "deliveredAt");

-- Transfer/Stocktake: قوائم (أحدث أولاً لكل محل)
CREATE INDEX IF NOT EXISTS "Transfer_tenantId_createdAt_idx"
  ON "Transfer" ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Stocktake_tenantId_createdAt_idx"
  ON "Stocktake" ("tenantId", "createdAt");

-- SaleItem: تجميع الأصناف الأكثر مبيعاً (join على saleId + group by productId)
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_productId_idx"
  ON "SaleItem" ("saleId", "productId");
