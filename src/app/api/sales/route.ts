-- ═══════════════════════════════════════════════════════════════════════════
-- ⚡ create_sale(payload jsonb) — حفظ فاتورة البيع في استدعاء واحد (2026-10-17)
-- ─────────────────────────────────────────────────────────────────────────────
-- POST /api/sales كان أثقل مسار في الموقع (Prisma + $transaction كبيرة:
-- فاتورة + أصناف + خصم مخزون + دين عميل + خزنة) — كل استعلام منهم بياكل CPU
-- من حصة الـ 10ms بتاعة Workers المجانية → 503 عشوائي وقت الضغط.
--
-- الدالة بتعمل بالترتيب نفس اللي كان بيحصل حرفيًا في route.ts:
--   1) توليد رقم الفاتورة (أعلى رقم لسنة المحل + 1 — جوه نفس الاستدعاء)
--   2) إنشاء الفاتورة + الأصناف
--   3) خصم المخزون ذريًا لكل صنف (منتج عادي / وحدة جملة / لون-مقاس)
--      بنفس رسائل الخطأ العربية بتاعة deductStock حرفيًا
--   4) Product.quantity = مجموع المتغيرات (لو البيع من لون/مقاس)
--   5) حركة مخزون type='sale' لكل صنف
--   6) دين العميل (لو بيع آجل) + قيد الخزنة بطريقة الدفع
-- وترجّع نفس شكل الرد القديم بالظبط (sale + items[] + variant + customer).
--
-- ملاحظة مهمة: جدول SaleItem **مفيهوش** عمود createdAt (النسخة الأولى من
-- السكريبت ده غلطت فيه وفشلت) — التاريخ على الفاتورة الأم Sale فقط.
-- كل التواريخ بترجع بصيغة Prisma بالظبط: "2026-10-17T09:00:00.000Z".
--
-- عدم التكرار (أوفلاين): الفهارس الفريدة @@unique([tenantId, invoiceNo])
-- و @@unique([tenantId, clientRef]) هي الضمانة — أي تضارب بيرجع SQLSTATE
-- 23505 والـ route يرجّع الفاتورة الأصلية أو يعيد المحاولة برقم أعلى
-- (بديل P2002 بتاع Prisma).
--
-- التركيب (مرة واحدة): الصق الملف ده كله في Supabase → SQL Editor → Run
-- (نفس اللي عملناه مع create-purchase-order.sql بالظبط).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) بنّاء شكل الرد — نفس Prisma:
--    sale.create({ include: { items: { include: { variant: true } }, customer: true } })
-- كل حقل موجود بالاسم الحقيقي من schema.prisma — لا أكثر ولا أقل.
-- ─────────────────────────────────────────────────────────────────────────────
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
--    أو NULL لو مفيش. الـ route بيستخدمها في فحص التكرار قبل الحفظ
--    وعند التضارب (23505) — بديل sale.findUnique({ where: tenantId_clientRef }).
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
  v_total      float8    := (payload->>'total')::float8;
  v_paid       float8    := (payload->>'paid')::float8;
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
  --       قراءة آخر فاتورة بالفهرس مش عدّ كل فواتير السنة)
  --       استخلاص الرقم بدون regexp: LTRIM بيشيل الأرقام البادئة، والفرق
  --       في الطول بيحدد العدد — نفس parseInt(اللاحقة) || 0 بتاعة JS حرفيًا
  --       ('00042abc' → 42، 'abc' → 0، '' → 0) ──
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
      AS x("productId" int, "name" text, "price" float8, "cost" float8,
           "quantity" float8, "unitId" int, "unitLabel" text,
           "unitQuantity" float8, "pieceLabel" text, "variantId" int)
  LOOP
    INSERT INTO "SaleItem"
      ("saleId", "productId", "name", "price", "quantity", "cost",
       "unitId", "unitLabel", "unitQuantity", "pieceLabel", "variantId")
    VALUES
      (v_saleId, it."productId", it."name", it."price", it."quantity", it."cost",
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

      -- 🛡️ خصم ذري: UPDATE بشرط quantity >= المطلوب (نفس updateMany)
      UPDATE "ProductVariant"
      SET "quantity" = "quantity" - v_toDeduct
      WHERE "id" = it."variantId" AND "quantity" >= v_toDeduct;
      IF NOT FOUND THEN
        SELECT "quantity" INTO v_curQty FROM "ProductVariant" WHERE "id" = it."variantId";
        RAISE EXCEPTION 'المخزون مش كافي لهذا اللون/المقاس — متاح: %، مطلوب: %',
          COALESCE(v_curQty, 0), v_toDeduct;
      END IF;

      -- 🛡️ syncProductQuantityFromVariants: مجمع المنتج = مجموع متغيراته
      UPDATE "Product" p
      SET "quantity" = COALESCE(agg.s, 0)
      FROM (SELECT SUM("quantity") AS s
            FROM "ProductVariant" WHERE "productId" = it."productId") agg
      WHERE p."id" = it."productId";
    ELSE
      -- 🛡️ خصم ذري للمنتج العادي (نفس updateMany بالظبط)
      UPDATE "Product"
      SET "quantity" = "quantity" - v_toDeduct
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
    INSERT INTO "StockMovement"
      ("tenantId", "branchId", "productId", "type", "quantity",
       "refType", "refId", "note", "userId")
    VALUES
      (v_tenantId, v_branchId, it."productId", 'sale', -it."quantity",
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
