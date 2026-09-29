-- 🛡️ 2026-09-30: أرقام فريدة للفواتير وأوامر الشراء + حقل مصدر المصروف
--
-- 1) تنظيف التكرارات القديمة قبل إنشاء الفهارس الفريدة:
--    نفس الرقم ممكن يكون اتكرر قبل كده (count+1 مع الطلبات المتزامنة).
--    بنسيب أول فاتورة (أصغر id) برقمها الأصلي، والباقي بنضيف له لاحقة
--    "-D<id>" عشان الفهرس الفريد ينشئ بنجاح — والفواتير القديمة نفسها
--    بتفضل مقروءة ومربوطة بتقاريرها.
--
-- 2) Expense.source: يميّز مصروف الهالك المتولد آلياً من حركة مخزون
--    (بيتمنع حذفه من شاشة المصروفات لأن الحذف بيضيف قيمته للخزنة غلط).

-- ── 1. فك تكرار أرقام فواتير البيع ──────────────────────────────
UPDATE "Sale" SET "invoiceNo" = "invoiceNo" || '-D' || "id"
WHERE "id" IN (
  SELECT s."id" FROM "Sale" s
  JOIN (
    SELECT "tenantId", "invoiceNo", MIN("id") AS keep_id
    FROM "Sale"
    WHERE "invoiceNo" IS NOT NULL
    GROUP BY "tenantId", "invoiceNo"
    HAVING COUNT(*) > 1
  ) d ON s."tenantId" = d."tenantId" AND s."invoiceNo" = d."invoiceNo"
  WHERE s."id" <> d."keep_id"
);

-- ── 2. فك تكرار أرقام أوامر الشراء ─────────────────────────────
UPDATE "PurchaseOrder" SET "orderNo" = "orderNo" || '-D' || "id"
WHERE "id" IN (
  SELECT p."id" FROM "PurchaseOrder" p
  JOIN (
    SELECT "tenantId", "orderNo", MIN("id") AS keep_id
    FROM "PurchaseOrder"
    WHERE "orderNo" IS NOT NULL
    GROUP BY "tenantId", "orderNo"
    HAVING COUNT(*) > 1
  ) d ON p."tenantId" = d."tenantId" AND p."orderNo" = d."orderNo"
  WHERE p."id" <> d."keep_id"
);

-- ── 3. مصدر المصروف (الهالك) ────────────────────────────────────
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- ── 4. الفهارس الفريدة (الضمانة الأخيرة ضد تكرار الأرقام) ──────
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_tenantId_invoiceNo_key"
  ON "Sale"("tenantId", "invoiceNo");

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_tenantId_orderNo_key"
  ON "PurchaseOrder"("tenantId", "orderNo");
