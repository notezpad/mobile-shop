-- ═══════════════════════════════════════════════════════════════════════════
-- 👕 seasonal-v1 (2026-10-22): «المخزن الداخلي» للمواسم — باقات الملابس فقط
-- ─────────────────────────────────────────────────────────────────────────────
-- الفكرة: الإجمالي (quantity) = المعروض (displayQty) + في المخزن الداخلي (مشتق).
--   - Product.season:     ALL_YEAR (افتراضي) / SUMMER / WINTER — فاشون فقط
--   - Product.displayQty: الكمية المعروضة على الرفوف (0 <= displayQty <= quantity)
--   - ProductVariant.displayQty: نفس التقسيمة على مستوى اللون/المقاس
--   - StockMovement أنواع جديدة: warehouse_in (نقل للمخزن الداخلي)
--     و warehouse_out (نقل للعرض) — حركة موقع مش حركة مال: صفر أثر مالي،
--     التكلفة زي ما هي وقيمة المخزون الإجمالية مابتتغيرش.
--   - create_sale() اتحدّثت: البيع بيخصم displayQty (من المعروض الأول،
--     والباقي من المخزن الداخلي) وبيزامن مجمع المنتج من المقاسات.
--
-- شغّلها مرة واحدة على داتابيز الإنتاج:
--   psql "$DATABASE_URL" -f prisma/sql/seasonal-v1.sql
--
-- آمنة على إعادة التشغيل (IF NOT EXISTS + backfill مش بيضرب لو الحقول موجودة).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) الأعمدة الجديدة ──────────────────────────────────────────────────────
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "season"     TEXT             NOT NULL DEFAULT 'ALL_YEAR',
  ADD COLUMN IF NOT EXISTS "displayQty" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ProductVariant"
  ADD COLUMN IF NOT EXISTS "displayQty" INTEGER          NOT NULL DEFAULT 0;

-- ── 2) البادك: كل الموجود حالياً معروض بالكامل (نفس السلوك القديم بالظبط) ──
UPDATE "Product"       SET "displayQty" = "quantity" WHERE "displayQty" = 0 AND "quantity" <> 0;
UPDATE "ProductVariant" SET "displayQty" = "quantity" WHERE "displayQty" = 0 AND "quantity" <> 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) create_sale() المحدّثة — نفس منطق النسخة الحالية حرفياً + خصم displayQty:
--    البيع بيخصم من المعروض الأول (LEST) والباقي من المخزن الداخلي،
--    ومجمع المنتج (quantity + displayQty) بيتزامن من مجموع المقاسات.
--    (النسخة الأصلية: prisma/sql/create-sale.sql — قراءة شرحها الكامل هناك)
-- ═══════════════════════════════════════════════════════════════════════════

-- 3-أ) بنّاء شكل الرد (زي الأصل — بيتعملها CREATE OR REPLACE للأمان لو ناقصة)
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

-- 3-ب) البحث بمفتاح الأوفلاين (زي الأصل)
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

-- 3-ج) الدالة الرئيسية — الفرق الوحيد عن الأصل: خصم displayQty + مزامنته
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
  -- رقم الفاتورة: أعلى رقم لسنة المحل + 1 (نفس الأصل حرفياً)
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

  INSERT INTO "Sale"
    ("tenantId", "branchId", "invoiceNo", "customerId", "userId",
     "total", "paid", "paymentMethod", "dueDate", "clientRef", "status")
  VALUES
    (v_tenantId, v_branchId, v_invoiceNo, v_customerId, v_userId,
     v_total, v_paid, v_method, v_dueDate, v_clientRef, 'مكتملة')
  RETURNING "id" INTO v_saleId;

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

    v_toDeduct := it."quantity";

    IF it."unitId" IS NOT NULL THEN
      PERFORM 1 FROM "ProductUnit"
      WHERE "id" = it."unitId" AND "productId" = it."productId";
      IF NOT FOUND THEN
        RAISE EXCEPTION 'الوحدة مش موجودة أو غير مرتبطة بالمنتج';
      END IF;
    END IF;

    IF it."variantId" IS NOT NULL THEN
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

    INSERT INTO "StockMovement"
      ("tenantId", "branchId", "productId", "type", "quantity",
       "refType", "refId", "note", "userId")
    VALUES
      (v_tenantId, v_branchId, it."productId", 'sale', -it."quantity",
       'sale', v_saleId, 'فاتورة ' || v_invoiceNo || ' — ' || it."name", v_userId);
  END LOOP;

  IF v_customerId IS NOT NULL AND v_paid < v_total THEN
    UPDATE "Customer"
    SET "balance" = "balance" + (v_total - v_paid)
    WHERE "id" = v_customerId;
  END IF;

  IF v_paid > 0 THEN
    INSERT INTO "CashEntry"
      ("tenantId", "source", "refId", "amount", "method", "note", "userId")
    VALUES
      (v_tenantId, 'sale', v_saleId, v_paid, v_method,
       'بيع فاتورة ' || v_invoiceNo, v_userId);
  END IF;

  RETURN get_sale_full(v_tenantId, v_saleId);
END;
$$;
