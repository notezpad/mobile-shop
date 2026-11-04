-- 🎨 2026-11-04 (التحديث 27): مصمم ملصقات الباركود الحر — سحب وإفلات.
-- جدول قوالب التصميم لكل محل: مقاس الملصق + مواضع العناصر (مم) في JSON.
-- العناصر: name / price / barcode / barcodeText / variant — التحقق النهائي
-- في src/lib/label-design.ts → sanitizeDesign() قبل أي طباعة.

CREATE TABLE "LabelTemplate" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "elements" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabelTemplate_tenantId_idx" ON "LabelTemplate"("tenantId");

ALTER TABLE "LabelTemplate"
  ADD CONSTRAINT "LabelTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
