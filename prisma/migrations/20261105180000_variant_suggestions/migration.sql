-- التحديث 31 (2026-11-05) — اقتراحات المعالج/كارت الشاشة (خاصة بكل محل)
-- جدول جديد بالكامل: مفيش تأثير على أي بيانات موجودة.

CREATE TABLE "VariantSuggestion" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VariantSuggestion_tenantId_kind_normalized_key" ON "VariantSuggestion"("tenantId", "kind", "normalized");
CREATE INDEX "VariantSuggestion_tenantId_kind_idx" ON "VariantSuggestion"("tenantId", "kind");

ALTER TABLE "VariantSuggestion" ADD CONSTRAINT "VariantSuggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
