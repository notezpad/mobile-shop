-- ═══════════════════════════════════════════════════════════════════════════
-- 🛡️ المرحلة 4 (2026-11-02) — التحويل الهيكلي التدريجي (ج-5 + مت-14 + مت-15 + ص-13 + مت-5/مت-6)
-- (v2 — تصحيح allowlist: 'expired' للمحلات + 'expired'/'grace' للاشتراكات —
--  أوضاع مشروعة بيكتبها auth.ts تلقائيًا للاشتراكات المنتهية، والويبهوك بيقرأها)
-- (v3 — القيود بـ NOT VALID: بتحمي كل كتابة جديدة فورًا، وفحص الصفوف القديمة
--  مؤجل لـ VALIDATE CONSTRAINT في PR التنظيف بعد مراجعة القيم بهدوء)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) ج-5: 64 عمود فلوس من float8 → NUMERIC(12,2) — بدقة عشرية كاملة
--    عند التخزين، مع تقريب فوري لخانتين أثناء التحويل (round2 فوري قبلها).
--    الكميات (وزن/قطع) والنسب % والدجات فضلوا float8 عمدًا.
-- 2) مت-14: فهارس المسارات الساخنة (آجلة الفواتير / تقارير الفرع / جرس الإشعارات).
--    ملاحظة: على الإنتاج شغّل prisma/sql/perf-indexes-concurrently.sql الأول
--    (بدون قفل) — هنا بـ IF NOT EXISTS عشان يشتغل جوه transaction.
-- 3) مت-15: tenantId مُلوَّحن في SaleItem (backfill + NOT NULL + FK + index)
--    + قيود CHECK لحالات Tenant/Subscription/Sale/PurchaseOrder المعروفة
--    (مع تطبيع typo قديم 'canceled' → 'cancelled' الأول).
-- 4) ص-13: FK لجداول BalanceEntry/IdempotencyKey/HrPinAttempt (كانت بدون ربط
--    — سجلات يتيمة بعد حذف المحل/الموظف).
-- 5) مت-5/مت-6: نشر النسخة الرسمية الموحدة v5 لدوال RPC (create-sale.sql) —
--    SaleItem tenantId + StockMovement variantId + get_sale_full sellerId/
--    commissionRate + مبالغ numeric.
--
-- ⚠️ الترتيب: عيّن الـ Baseline و migration المرحلة 3 كـ applied الأول
--    (موجود في README) ثم npx prisma migrate deploy.
-- ⏱️ ALTER TYPE بيعمل rewrite للجدول — شغّله في نافذة trafic منخفض.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1) ج-5: float8 → NUMERIC(12,2) مع تقريب فوري
-- ─────────────────────────────────────────────

ALTER TABLE "BalanceEntry" ALTER COLUMN "delta" TYPE NUMERIC(12,2) USING round("delta"::numeric, 2);
ALTER TABLE "CashEntry" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "CommissionPayout" ALTER COLUMN "salesTotal" TYPE NUMERIC(12,2) USING round("salesTotal"::numeric, 2);
ALTER TABLE "CommissionPayout" ALTER COLUMN "returnsTotal" TYPE NUMERIC(12,2) USING round("returnsTotal"::numeric, 2);
ALTER TABLE "CommissionPayout" ALTER COLUMN "netBase" TYPE NUMERIC(12,2) USING round("netBase"::numeric, 2);
ALTER TABLE "CommissionPayout" ALTER COLUMN "target" TYPE NUMERIC(12,2) USING round("target"::numeric, 2);
ALTER TABLE "CommissionPayout" ALTER COLUMN "adjustments" TYPE NUMERIC(12,2) USING round("adjustments"::numeric, 2);
ALTER TABLE "CommissionPayout" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "Customer" ALTER COLUMN "balance" TYPE NUMERIC(12,2) USING round("balance"::numeric, 2);
ALTER TABLE "Customer" ALTER COLUMN "creditLimit" TYPE NUMERIC(12,2) USING round("creditLimit"::numeric, 2);
ALTER TABLE "Employee" ALTER COLUMN "baseSalary" TYPE NUMERIC(12,2) USING round("baseSalary"::numeric, 2);
ALTER TABLE "EmployeeAdvance" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "EmployeeAdvance" ALTER COLUMN "installment" TYPE NUMERIC(12,2) USING round("installment"::numeric, 2);
ALTER TABLE "EmployeeAdvance" ALTER COLUMN "remaining" TYPE NUMERIC(12,2) USING round("remaining"::numeric, 2);
ALTER TABLE "EmployeeEvaluation" ALTER COLUMN "bonus" TYPE NUMERIC(12,2) USING round("bonus"::numeric, 2);
ALTER TABLE "Expense" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "MaintenanceOrder" ALTER COLUMN "cost" TYPE NUMERIC(12,2) USING round("cost"::numeric, 2);
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "PayrollRun" ALTER COLUMN "totalNet" TYPE NUMERIC(12,2) USING round("totalNet"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "baseSalary" TYPE NUMERIC(12,2) USING round("baseSalary"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "payableBase" TYPE NUMERIC(12,2) USING round("payableBase"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "absenceDeduction" TYPE NUMERIC(12,2) USING round("absenceDeduction"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "lateDeduction" TYPE NUMERIC(12,2) USING round("lateDeduction"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "bonus" TYPE NUMERIC(12,2) USING round("bonus"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "penalty" TYPE NUMERIC(12,2) USING round("penalty"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "advanceDeduction" TYPE NUMERIC(12,2) USING round("advanceDeduction"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "advanceDue" TYPE NUMERIC(12,2) USING round("advanceDue"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "commission" TYPE NUMERIC(12,2) USING round("commission"::numeric, 2);
ALTER TABLE "Payslip" ALTER COLUMN "net" TYPE NUMERIC(12,2) USING round("net"::numeric, 2);
ALTER TABLE "Plan" ALTER COLUMN "priceMonthly" TYPE NUMERIC(12,2) USING round("priceMonthly"::numeric, 2);
ALTER TABLE "Plan" ALTER COLUMN "priceYearly" TYPE NUMERIC(12,2) USING round("priceYearly"::numeric, 2);
ALTER TABLE "Product" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING round("price"::numeric, 2);
ALTER TABLE "Product" ALTER COLUMN "cost" TYPE NUMERIC(12,2) USING round("cost"::numeric, 2);
ALTER TABLE "ProductUnit" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING round("price"::numeric, 2);
ALTER TABLE "PurchaseOrder" ALTER COLUMN "total" TYPE NUMERIC(12,2) USING round("total"::numeric, 2);
ALTER TABLE "PurchaseOrder" ALTER COLUMN "paid" TYPE NUMERIC(12,2) USING round("paid"::numeric, 2);
ALTER TABLE "PurchaseOrder" ALTER COLUMN "refunded" TYPE NUMERIC(12,2) USING round("refunded"::numeric, 2);
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "cost" TYPE NUMERIC(12,2) USING round("cost"::numeric, 2);
ALTER TABLE "PurchaseReturn" ALTER COLUMN "total" TYPE NUMERIC(12,2) USING round("total"::numeric, 2);
ALTER TABLE "PurchaseReturn" ALTER COLUMN "refund" TYPE NUMERIC(12,2) USING round("refund"::numeric, 2);
ALTER TABLE "PurchaseReturnItem" ALTER COLUMN "cost" TYPE NUMERIC(12,2) USING round("cost"::numeric, 2);
ALTER TABLE "Sale" ALTER COLUMN "total" TYPE NUMERIC(12,2) USING round("total"::numeric, 2);
ALTER TABLE "Sale" ALTER COLUMN "paid" TYPE NUMERIC(12,2) USING round("paid"::numeric, 2);
ALTER TABLE "Sale" ALTER COLUMN "refunded" TYPE NUMERIC(12,2) USING round("refunded"::numeric, 2);
ALTER TABLE "SaleItem" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING round("price"::numeric, 2);
ALTER TABLE "SaleItem" ALTER COLUMN "cost" TYPE NUMERIC(12,2) USING round("cost"::numeric, 2);
ALTER TABLE "SalePayment" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "SaleReturn" ALTER COLUMN "total" TYPE NUMERIC(12,2) USING round("total"::numeric, 2);
ALTER TABLE "SaleReturn" ALTER COLUMN "exchangeTotal" TYPE NUMERIC(12,2) USING round("exchangeTotal"::numeric, 2);
ALTER TABLE "SaleReturn" ALTER COLUMN "refund" TYPE NUMERIC(12,2) USING round("refund"::numeric, 2);
ALTER TABLE "SaleReturn" ALTER COLUMN "creditApplied" TYPE NUMERIC(12,2) USING round("creditApplied"::numeric, 2);
ALTER TABLE "SaleReturnItem" ALTER COLUMN "price" TYPE NUMERIC(12,2) USING round("price"::numeric, 2);
ALTER TABLE "SaleReturnItem" ALTER COLUMN "cost" TYPE NUMERIC(12,2) USING round("cost"::numeric, 2);
ALTER TABLE "ShiftClosure" ALTER COLUMN "counted" TYPE NUMERIC(12,2) USING round("counted"::numeric, 2);
ALTER TABLE "ShiftClosure" ALTER COLUMN "expected" TYPE NUMERIC(12,2) USING round("expected"::numeric, 2);
ALTER TABLE "ShiftClosure" ALTER COLUMN "variance" TYPE NUMERIC(12,2) USING round("variance"::numeric, 2);
ALTER TABLE "ShiftSession" ALTER COLUMN "openingFloat" TYPE NUMERIC(12,2) USING round("openingFloat"::numeric, 2);
ALTER TABLE "Supplier" ALTER COLUMN "balance" TYPE NUMERIC(12,2) USING round("balance"::numeric, 2);
ALTER TABLE "SupplierPayment" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "Subscription" ALTER COLUMN "amountPaid" TYPE NUMERIC(12,2) USING round("amountPaid"::numeric, 2);
ALTER TABLE "Tenant" ALTER COLUMN "sellerCommissionTarget" TYPE NUMERIC(12,2) USING round("sellerCommissionTarget"::numeric, 2);
ALTER TABLE "Transaction" ALTER COLUMN "amount" TYPE NUMERIC(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "Transaction" ALTER COLUMN "commission" TYPE NUMERIC(12,2) USING round("commission"::numeric, 2);
ALTER TABLE "User" ALTER COLUMN "sellerCommissionTarget" TYPE NUMERIC(12,2) USING round("sellerCommissionTarget"::numeric, 2);

-- ─────────────────────────────────────────────
-- 2) مت-14: فهارس المسارات الساخنة (IF NOT EXISTS = آمنة ومتطابقة مع schema)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Sale_tenantId_dueDate_idx" ON "Sale"("tenantId", "dueDate");
CREATE INDEX IF NOT EXISTS "Sale_tenantId_branchId_createdAt_idx" ON "Sale"("tenantId", "branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_isRead_createdAt_idx" ON "Notification"("tenantId", "isRead", "createdAt" DESC);

-- ─────────────────────────────────────────────
-- 3) مت-15: tenantId مُلوَّحن في SaleItem — backfill ثم NOT NULL ثم FK
--    (كل SaleItem مربوط بـ Sale بـ CASCADE فمستحيل صف يتيم)
-- ─────────────────────────────────────────────
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "SaleItem" si
   SET "tenantId" = s."tenantId"
  FROM "Sale" s
 WHERE s."id" = si."saleId" AND si."tenantId" IS NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "SaleItem_tenantId_idx" ON "SaleItem"("tenantId");
ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_tenantId_fkey";
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- 4) مت-15: CHECK constraints للحالات المعروفة (allowlist)
--    — قبلها تطبيع الـ typo القديم 'canceled' (حرف ناقص)
-- ─────────────────────────────────────────────
UPDATE "Tenant"        SET "status" = 'cancelled' WHERE "status" = 'canceled';
UPDATE "Subscription"  SET "status" = 'cancelled' WHERE "status" = 'canceled';
UPDATE "PurchaseOrder" SET "status" = 'cancelled' WHERE "status" = 'canceled';

ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_status_allowlist";
-- 'expired' حالة مشروعة: auth.ts بيكتبها للمحل لما الاشتراك يخلص،
-- والـ webhook (خ-10) بيرفع المحل لـ 'active' فقط لو كان 'expired'.
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_status_allowlist"
  CHECK ("status" IN ('active', 'suspended', 'cancelled', 'expired')) NOT VALID;

ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_status_allowlist";
-- 'expired' بيتكتب من auth.ts عند انتهاء الاشتراك، و'grace' فترة السماح
-- (مسموح بها في admin/subscriptions ومت-18).
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_status_allowlist"
  CHECK ("status" IN ('active', 'pending', 'cancelled', 'expired', 'grace')) NOT VALID;

ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_status_allowlist";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_status_allowlist"
  CHECK ("status" IN ('مكتملة', 'مرتجعة جزئياً', 'مرتجعة')) NOT VALID;

ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_status_allowlist";
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_status_allowlist"
  CHECK ("status" IN ('pending', 'completed', 'cancelled')) NOT VALID;

-- ─────────────────────────────────────────────
-- 5) ص-13: FK للجداول اللي كانت بدون ربط — تنظف السجلات اليتيمة الأول
-- ─────────────────────────────────────────────
DELETE FROM "IdempotencyKey" k WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = k."tenantId");
DELETE FROM "BalanceEntry"   b WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = b."tenantId");
DELETE FROM "HrPinAttempt"   a WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = a."tenantId")
                                 OR NOT EXISTS (SELECT 1 FROM "Employee" e WHERE e."id" = a."employeeId");

ALTER TABLE "BalanceEntry" DROP CONSTRAINT IF EXISTS "BalanceEntry_tenantId_fkey";
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdempotencyKey" DROP CONSTRAINT IF EXISTS "IdempotencyKey_tenantId_fkey";
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HrPinAttempt" DROP CONSTRAINT IF EXISTS "HrPinAttempt_tenantId_fkey";
ALTER TABLE "HrPinAttempt" ADD CONSTRAINT "HrPinAttempt_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HrPinAttempt" DROP CONSTRAINT IF EXISTS "HrPinAttempt_employeeId_fkey";
ALTER TABLE "HrPinAttempt" ADD CONSTRAINT "HrPinAttempt_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- 6) مت-5/مت-6: نشر النسخة الرسمية الموحدة v5 لدوال RPC
--    (المصدر: prisma/sql/create-sale.sql — نفس المحتوى حرفيًا)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_sale_full(p_tenantId text, p_saleId int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',           s."id",
    'tenantId',     s."tenantId",
    'branchId',     s."branchId",
    'invoiceNo',    s."invoiceNo",
    'customerId',   s."customerId",
    'userId',       s."userId",
    -- 🛡️ مت-5: بيانات البائع رجعت مع الفاتورة (كانت ناقصة من الرد)
    'sellerId',     s."sellerId",
    'commissionRate', s."commissionRate",
    'total',        s."total",
    'paid',         s."paid",
    'paymentMethod', s."paymentMethod",
    'refunded',     s."refunded",
    'dueDate',      CASE WHEN s."dueDate" IS NULL THEN NULL
                         ELSE to_char(s."dueDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'clientRef',    s."clientRef",
    'status',       s."status",
    'createdAt',    to_char(s."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           i."id",
               'saleId',       i."saleId",
               -- 🛡️ مت-15: tenantId مُلوَّحن في جدول التفاصيل
               'tenantId',     i."tenantId",
               'productId',    i."productId",
               'name',         i."name",
               'price',        i."price",
               'quantity',     i."quantity",
               'returnedQty',  i."returnedQty",
               'cost',         i."cost",
               'unitId',       i."unitId",
               'unitLabel',    i."unitLabel",
               'unitQuantity', i."unitQuantity",
               'pieceLabel',   i."pieceLabel",
               'variantId',    i."variantId",
               'variant', CASE WHEN v."id" IS NULL THEN NULL ELSE jsonb_build_object(
                 'id',        v."id",
                 'productId', v."productId",
                 'size',      v."size",
                 'color',     v."color",
                 'barcode',   v."barcode",
                 'quantity',  v."quantity",
                 'createdAt', to_char(v."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               ) END
             ) ORDER BY i."id")
      FROM "SaleItem" i
      LEFT JOIN "ProductVariant" v ON v."id" = i."variantId"
      WHERE i."saleId" = s."id"
    ), '[]'::jsonb),
    'customer', CASE WHEN s."customerId" IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'id',         c."id",
        'tenantId',   c."tenantId",
        'name',       c."name",
        'phone',      c."phone",
        'balance',    c."balance",
        'creditLimit', c."creditLimit",
        'createdAt',  to_char(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      FROM "Customer" c
      WHERE c."id" = s."customerId"
    ) END
  )
  INTO v_result
  FROM "Sale" s
  WHERE s."id" = p_saleId AND s."tenantId" = p_tenantId;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) البحث عن فاتورة بمفتاح الأوفلاين clientRef — بيرجّع نفس شكل get_sale_full
--    أو NULL لو مفيش.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_sale_by_ref(p_tenantId text, p_ref text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT get_sale_full(p_tenantId, s."id")
  FROM "Sale" s
  WHERE s."tenantId" = p_tenantId AND s."clientRef" = p_ref
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) الدالة الرئيسية: حفظ الفاتورة كاملة في استدعاء واحد (transaction واحدة).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_sale(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenantId   text      := payload->>'tenantId';
  v_branchId   int       := (payload->>'branchId')::int;
  v_userId     text      := payload->>'userId';
  v_customerId int       := (payload->>'customerId')::int;
  -- 🛡️ ج-5: المبالغ numeric — دقة عشرية كاملة (كانت float8)
  v_total      numeric   := (payload->>'total')::numeric;
  v_paid       numeric   := (payload->>'paid')::numeric;
  v_method     text      := COALESCE(payload->>'paymentMethod', 'cash');
  -- ISO مع Z → UTC wall-clock (أعمدة Prisma timestamp بدون منطقة زمنية)
  v_dueDate    timestamp := (NULLIF(payload->>'dueDate', ''))::timestamptz AT TIME ZONE 'UTC';
  v_clientRef  text      := NULLIF(payload->>'clientRef', '');
  v_year       int       := (payload->>'year')::int;
  v_prefix     text      := COALESCE(payload->>'prefix', 'INV');
  v_start      text      := v_prefix || '-' || v_year || '-';
  v_lastSeq    int;
  v_invoiceNo  text;
  v_saleId     int;
  v_toDeduct   float8;
  v_curQty     float8;
  it           record;
BEGIN
  -- ── 1) رقم الفاتورة: أعلى رقم موجود لسنة المحل + 1 (نفس nextInvoiceNo:
  --       قراءة آخر فاتورة بالفهرس مش عدّ كل فواتير السنة) ──
  v_lastSeq := COALESCE((
    SELECT NULLIF(LEFT(t.sfx, LENGTH(t.sfx) - LENGTH(LTRIM(t.sfx, '0123456789'))), '')::int
    FROM (
      SELECT SUBSTRING(s."invoiceNo" FROM LENGTH(v_start) + 1) AS sfx
      FROM "Sale" s
      WHERE s."tenantId" = v_tenantId
        AND LEFT(s."invoiceNo", LENGTH(v_start)) = v_start
      ORDER BY s."id" DESC
      LIMIT 1
    ) t
  ), 0) + 1;
  v_invoiceNo := v_start || LPAD(v_lastSeq::text, 5, '0');

  -- ── 2) الفاتورة (status='مكتملة' زي القديم، refunded بتفضل 0) ──
  INSERT INTO "Sale"
    ("tenantId", "branchId", "invoiceNo", "customerId", "userId",
     "total", "paid", "paymentMethod", "dueDate", "clientRef", "status")
  VALUES
    (v_tenantId, v_branchId, v_invoiceNo, v_customerId, v_userId,
     v_total, v_paid, v_method, v_dueDate, v_clientRef, 'مكتملة')
  RETURNING "id" INTO v_saleId;

  -- ── 3) الأصناف: سطر فاتورة + خصم مخزون ذري + حركة مخزون (نفس deductStock) ──
  FOR it IN
    SELECT x."productId", x."name", x."price", x."cost", x."quantity",
           x."unitId", x."unitLabel", x."unitQuantity", x."pieceLabel", x."variantId"
    FROM jsonb_to_recordset(payload->'items')
      AS x("productId" int, "name" text, "price" numeric, "cost" numeric,
           "quantity" float8, "unitId" int, "unitLabel" text,
           "unitQuantity" float8, "pieceLabel" text, "variantId" int)
  LOOP
    INSERT INTO "SaleItem"
      ("saleId", "tenantId", "productId", "name", "price", "quantity", "cost",
       "unitId", "unitLabel", "unitQuantity", "pieceLabel", "variantId")
    VALUES
      -- 🛡️ مت-15: tenantId مُلوَّحن — دايمًا من الجلسة، عمره ما من الـ payload
      (v_saleId, v_tenantId, it."productId", it."name", it."price", it."quantity", it."cost",
       it."unitId", it."unitLabel", it."unitQuantity", it."pieceLabel", it."variantId");

    -- إجمالي القطع (الفاكتور مضروب مسبقًا في الـ route — نفس ناتج
    -- deductStock: factor × unitsEntered بنفس الحساب العشري بالظبط)
    v_toDeduct := it."quantity";

    -- فحص الوحدة جوه المعاملة (زي deductStock بالظبط — حماية من حذف متزامن)
    IF it."unitId" IS NOT NULL THEN
      PERFORM 1 FROM "ProductUnit"
      WHERE "id" = it."unitId" AND "productId" = it."productId";
      IF NOT FOUND THEN
        RAISE EXCEPTION 'الوحدة مش موجودة أو غير مرتبطة بالمنتج';
      END IF;
    END IF;

    IF it."variantId" IS NOT NULL THEN
      -- فحص المتغير جوه المعاملة (زي deductStock)
      PERFORM 1 FROM "ProductVariant"
      WHERE "id" = it."variantId" AND "productId" = it."productId";
      IF NOT FOUND THEN
        RAISE EXCEPTION 'المتغير (اللون/المقاس) مش موجود أو غير مرتبط بالمنتج';
      END IF;

      -- 👕 خصم ذري: الكمية + المعروض (البيع يخصم من المعروض الأول —
      --    لو المعروض أقل من المطلوب فالباقي جاي من المخزن الداخلي)
      UPDATE "ProductVariant"
      SET "quantity"   = "quantity" - v_toDeduct,
          "displayQty" = GREATEST(0, "displayQty" - LEAST(v_toDeduct, "displayQty"))
      WHERE "id" = it."variantId" AND "quantity" >= v_toDeduct;
      IF NOT FOUND THEN
        SELECT "quantity" INTO v_curQty FROM "ProductVariant" WHERE "id" = it."variantId";
        RAISE EXCEPTION 'المخزون مش كافي لهذا اللون/المقاس — متاح: %، مطلوب: %',
          COALESCE(v_curQty, 0), v_toDeduct;
      END IF;

      -- 👕 مجمع المنتج = مجموع المقاسات (الكمية + المعروض)
      UPDATE "Product" p
      SET "quantity"   = COALESCE(agg.s, 0),
          "displayQty" = COALESCE(agg.d, 0)
      FROM (SELECT SUM("quantity") AS s, SUM("displayQty") AS d
            FROM "ProductVariant" WHERE "productId" = it."productId") agg
      WHERE p."id" = it."productId";
    ELSE
      -- 👕 خصم ذري للمنتج العادي (كمية + معروض بنفس قاعدة المعروض الأول)
      UPDATE "Product"
      SET "quantity"   = "quantity" - v_toDeduct,
          "displayQty" = GREATEST(0, "displayQty" - LEAST(v_toDeduct, "displayQty"))
      WHERE "id" = it."productId" AND "quantity" >= v_toDeduct;
      IF NOT FOUND THEN
        SELECT "quantity" INTO v_curQty FROM "Product" WHERE "id" = it."productId";
        IF NOT FOUND THEN
          RAISE EXCEPTION 'المنتج غير موجود';
        END IF;
        RAISE EXCEPTION 'المخزون مش كافي — متاح: %، مطلوب: %', v_curQty, v_toDeduct;
      END IF;
    END IF;

    -- حركة المخزون (نفس stockMovement.create: type='sale'، الكمية بالسالب)
    -- 🛡️ مت-5: عمود variantId بقى بيتكتب — حركة كل بيعة لون/مقاس مربوطة بيه
    INSERT INTO "StockMovement"
      ("tenantId", "branchId", "productId", "variantId", "type", "quantity",
       "refType", "refId", "note", "userId")
    VALUES
      (v_tenantId, v_branchId, it."productId", it."variantId", 'sale', -it."quantity",
       'sale', v_saleId, 'فاتورة ' || v_invoiceNo || ' — ' || it."name", v_userId);
  END LOOP;

  -- ── 4) دين العميل (بيع آجل: الباقي يتزود على رصيده) ──
  IF v_customerId IS NOT NULL AND v_paid < v_total THEN
    UPDATE "Customer"
    SET "balance" = "balance" + (v_total - v_paid)
    WHERE "id" = v_customerId;
  END IF;

  -- ── 5) قيد الخزنة للمبلغ المدفوع (فلوس داخلية للمحل) بطريقة الدفع ──
  IF v_paid > 0 THEN
    INSERT INTO "CashEntry"
      ("tenantId", "source", "refId", "amount", "method", "note", "userId")
    VALUES
      (v_tenantId, 'sale', v_saleId, v_paid, v_method,
       'بيع فاتورة ' || v_invoiceNo, v_userId);
  END IF;

  -- ── الرد: نفس شكل sale.create({ include: { items: { include: { variant } }, customer } }) ──
  RETURN get_sale_full(v_tenantId, v_saleId);
END;
$$;

