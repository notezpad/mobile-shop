-- 🧩 2026-11-04 (التحديث 25): الإضافات المدفوعة (Add-ons)
-- جدول مستقل عن Subscription — كل صف = عملية شراء إضافة (HR / فرع إضافي / مستخدم إضافي)
-- بتتدفع عبر Paymob بنفس دورة حياة الباقة: pending → (webhook) → active.
-- الإضافة ليها endDate مستقل — بتتجدد من الإعدادات → «إضافات الباقة».

CREATE TABLE "TenantAddOn" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "addOnKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "amountExpected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentNote" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAddOn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantAddOn_tenantId_idx" ON "TenantAddOn"("tenantId");
CREATE INDEX "TenantAddOn_status_idx" ON "TenantAddOn"("status");
CREATE INDEX "TenantAddOn_endDate_idx" ON "TenantAddOn"("endDate");
CREATE INDEX "TenantAddOn_tenantId_addOnKey_idx" ON "TenantAddOn"("tenantId", "addOnKey");

ALTER TABLE "TenantAddOn"
  ADD CONSTRAINT "TenantAddOn_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
