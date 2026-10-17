-- ═══════════════════════════════════════════════════════════════════════════
-- ⚡ create_purchase_order(payload jsonb) — الخطوة 2 (2026-10-17)
-- حفظ أمر الشراء كاملًا في **استدعاء واحد** داخل Postgres (transaction واحدة
-- داخل الدالة) بدل 8-40 استعلام متسلسل من الـ Worker عبر Prisma — اللي كان
-- بياكل CPU الـ Worker (حد 10ms) ويسبب 503 عشوائي على POST /api/purchase-orders.
--
-- الدالة بتعمل بالترتيب نفس اللي كان بيحصل حرفيًا في route.ts:
--   1) توليد رقم الأمر (max+1 على سنة معينة — الحذف مش بيأثر عليه)
--   2) إنشاء الأمر + الأصناف
--   3) تحديث المخزون + تكلفة المتوسط المرجح (Weighted Moving Average)
--      🎨 2026-10-18: المنتج اللي له ألوان/مقاسات بيدخل مخزونه على الـ variant
--      (variantId إجباري للسطر)، وكمية المنتج بتتحسب = مجموع الـ variants.
--      قبل كده الكمية كانت بتتضاف على المنتج بس فتتمسح عند أول بيعة.
--   4) حركة مخزون (type='in') لكل صنف
--   5) رصيد المورد (total - paid) بالإشارة الصحيحة
--   6) قيد الخزنة (source='purchase'، amount سالب) بطريقة الدفع
-- وترجّع نفس شكل الرد القديم بالظبط (order + items[] + supplier كاملين).
--
-- التضارب: الفهرس الفريد @@unique([tenantId, orderNo]) هو الضمانة — لو طلبان
-- متزامنان، التاني بيفشل بـ SQLSTATE 23505 والـ route بيعيد المحاولة برقم أعلى
-- (بديل P2002 بتاع Prisma) — شوف POST handler.
--
-- التقريب: FLOOR(x*100 + 0.5)/100 = Math.round(x*100)/100 بتاعة JS بالظبط
-- (بما فيها سلوك الأنصاف للسالب)، عشان المتوسط المرجح والفرق يطلعوا مطابقين
-- للحساب القديم بتاع الجافاسكريبت.
--
-- التركيب (مرة واحدة على كل قاعدة — تجريبية أولًا ثم الإنتاج):
--   psql "$DIRECT_URL" -f prisma/sql/create-purchase-order.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_purchase_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenantId   text        := payload->>'tenantId';
  v_branchId   int         := (payload->>'branchId')::int;
  v_userId     text        := payload->>'userId';
  v_supplierId int         := NULLIF(payload->>'supplierId', '')::int;
  v_total      float8      := (payload->>'total')::float8;
  v_paid       float8      := (payload->>'paid')::float8;
  v_method     text        := COALESCE(payload->>'paymentMethod', 'cash');
  v_year       int         := (payload->>'year')::int;
  v_orderNo    text;
  v_prefix     text        := 'PO-' || v_year || '-';
  v_lastSeq    int;
  v_orderId    int;
  v_diff       float8      := FLOOR((v_total - v_paid) * 100 + 0.5)::float8 / 100;
  it           record;
  v_oldQty     float8;
  v_varCnt     int;
  v_varSum     float8;
  v_oldCost    float8;
  v_totalQty   float8;
  v_avgCost    float8;
  v_result     jsonb;
BEGIN
  -- ── 1) رقم الأمر: أعلى رقم موجود لسنة المحل + 1 (قراءة بالفهرس) ──
  SELECT COALESCE(
    (SELECT (SUBSTRING("orderNo" FROM LENGTH(v_prefix) + 1))::int
     FROM "PurchaseOrder"
     WHERE "tenantId" = v_tenantId AND "orderNo" LIKE v_prefix || '%'
     ORDER BY "id" DESC
     LIMIT 1),
    0) + 1
  INTO v_lastSeq;
  v_orderNo := v_prefix || LPAD(v_lastSeq::text, 5, '0');

  -- ── 2) إنشاء الأمر ──
  INSERT INTO "PurchaseOrder"
    ("tenantId", "branchId", "orderNo", "supplierId", "userId",
     "total", "paid", "paymentMethod", "status")
  VALUES
    (v_tenantId, v_branchId, v_orderNo, v_supplierId, v_userId,
     v_total, v_paid, CASE WHEN v_paid > 0 THEN v_method ELSE 'cash' END, 'مكتملة')
  RETURNING "id" INTO v_orderId;

  -- ── 3+4) الأصناف: إنشاء السطر + تحديث المخزون بالمتوسط المرجح + حركة مخزون ──
  FOR it IN
    SELECT x."productId", x."variantId", x."name", x."cost", x."quantity"
    FROM jsonb_to_recordset(payload->'items')
      AS x("productId" int, "variantId" int, "name" text, "cost" float8, "quantity" float8)
  LOOP
    -- 🎨 الأمان الأخير (الـ route بيتحقق الأول برسائل عربي): منتج له variants
    -- لازم السطر يحدد variant، ومنتج بدون variants ما ينفعش يجيله variantId.
    SELECT COUNT(*), COALESCE(SUM(v."quantity"), 0)
      INTO v_varCnt, v_varSum
      FROM "ProductVariant" v WHERE v."productId" = it."productId";

    IF v_varCnt > 0 AND it."variantId" IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_HAS_VARIANTS:%', it."productId";
    END IF;
    IF it."variantId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "ProductVariant" v
       WHERE v."id" = it."variantId" AND v."productId" = it."productId"
    ) THEN
      RAISE EXCEPTION 'VARIANT_NOT_FOUND:%', it."variantId";
    END IF;

    INSERT INTO "PurchaseOrderItem"
      ("purchaseOrderId", "productId", "variantId", "name", "cost", "quantity")
    VALUES
      (v_orderId, it."productId", it."variantId", it."name", it."cost", it."quantity");

    -- المخزون القديم لحساب المتوسط المرجح: للمنتج ذو الـ variants هو مجموعهم
    -- (مش عمود Product.quantity اللي ممكن يكون اتزحزح).
    SELECT CASE WHEN v_varCnt > 0 THEN GREATEST(v_varSum, 0) ELSE GREATEST(p."quantity", 0) END,
           GREATEST(p."cost", 0)
    INTO v_oldQty, v_oldCost
    FROM "Product" p WHERE p."id" = it."productId";

    v_totalQty := v_oldQty + it."quantity";
    -- المتوسط المرجح: (القديم × تكليفته + الجديد × سعره) ÷ الإجمالي
    -- مفيش مخزون قديم → التكلفة هي سعر الشراء الجديد (نفس القديم)
    v_avgCost := CASE
      WHEN v_totalQty > 0 THEN FLOOR(((v_oldQty * v_oldCost + it."quantity" * it."cost") / v_totalQty) * 100 + 0.5)::float8 / 100
      ELSE it."cost"
    END;

    IF it."variantId" IS NOT NULL THEN
      -- المخزون يدخل على المقاس/اللون نفسه، وكمية المنتج = مجموع كل مقاساته
      UPDATE "ProductVariant"
         SET "quantity" = "quantity" + it."quantity"::int
       WHERE "id" = it."variantId";

      UPDATE "Product"
         SET "quantity" = (SELECT COALESCE(SUM(v."quantity"), 0)
                             FROM "ProductVariant" v WHERE v."productId" = it."productId"),
             "cost" = GREATEST(v_avgCost, 0)
       WHERE "id" = it."productId";
    ELSE
      UPDATE "Product"
      SET "quantity" = "quantity" + it."quantity",
          "cost" = GREATEST(v_avgCost, 0)
      WHERE "id" = it."productId";
    END IF;

    INSERT INTO "StockMovement"
      ("tenantId", "branchId", "productId", "variantId", "type", "quantity",
       "refType", "refId", "note", "userId")
    VALUES
      (v_tenantId, v_branchId, it."productId", it."variantId", 'in', it."quantity",
       'purchase', v_orderId,
       'أمر شراء ' || v_orderNo ||
         CASE WHEN it."variantId" IS NOT NULL THEN ' — ' || it."name" ELSE '' END,
       v_userId);
  END LOOP;

  -- ── 5) رصيد المورد: موجب = علينا أكتر، سالب = دفعنا زيادة (نفس القديم) ──
  IF v_supplierId IS NOT NULL AND v_diff <> 0 THEN
    UPDATE "Supplier" SET "balance" = "balance" + v_diff WHERE "id" = v_supplierId;
  END IF;

  -- ── 6) قيد الخزنة للمبلغ المدفوع (فلوس خارجة من المحل) — بدون عمولة ──
  IF v_paid > 0 THEN
    INSERT INTO "CashEntry"
      ("tenantId", "source", "refId", "amount", "method", "note", "userId")
    VALUES
      (v_tenantId, 'purchase', v_orderId, -v_paid, v_method,
       'شراء أمر ' || v_orderNo, v_userId);
  END IF;

  -- ── الرد: نفس شكل purchaseOrder.create({ include: { items, supplier } }) ──
  SELECT jsonb_build_object(
    'id', o."id",
    'tenantId', o."tenantId",
    'branchId', o."branchId",
    'orderNo', o."orderNo",
    'supplierId', o."supplierId",
    'userId', o."userId",
    'total', o."total",
    'paid', o."paid",
    'paymentMethod', o."paymentMethod",
    'refunded', o."refunded",
    'status', o."status",
    'createdAt', o."createdAt",
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i."id",
               'purchaseOrderId', i."purchaseOrderId",
               'productId', i."productId",
               'variantId', i."variantId",
               'name', i."name",
               'cost', i."cost",
               'quantity', i."quantity",
               'returnedQty', i."returnedQty"
             ) ORDER BY i."id")
      FROM "PurchaseOrderItem" i WHERE i."purchaseOrderId" = o."id"
    ), '[]'::jsonb),
    'supplier', (
      SELECT to_jsonb(sp)
      FROM "Supplier" sp WHERE sp."id" = o."supplierId"
    )
  )
  INTO v_result
  FROM "PurchaseOrder" o WHERE o."id" = v_orderId;

  RETURN v_result;
END;
$$;
