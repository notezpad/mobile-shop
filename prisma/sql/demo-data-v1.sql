-- ═══════════════════════════════════════════════════════════════════════════
-- 🎁 demo-data-v1 (2026-10-23): البيانات التجريبية لأول دخول
-- ─────────────────────────────────────────────────────────────────────────────
-- المشكلة: أي عميل جديد يفتح لوحة التحكم يلاقي كل شيء صفر (منتجات/عملاء/موردين/
-- فروع/مبيعات/تقارير)، فمفيش حاجة تفهّمه النظام بيعمل إيه.
--
-- الحل: دالتين في Postgres (نفس أسلوب create_sale / create_purchase_order):
--
--   seed_demo_data(payload jsonb)  → يزرع محل تجريبي كامل في معاملة واحدة.
--   purge_demo_data(tenantId text) → يمسح البيانات التجريبية فقط (وبأمان).
--
-- مبادئ التصميم:
--   1) الزرع بيمر على create_purchase_order و create_sale الأصليتين — يعني
--      المخزون، متوسط التكلفة، الديون، الخزنة، حركات المخزون كلها بنفس
--      قواعد النظام الحقيقي بالظبط (مفيش منطق محاسبي مكرر نقدر نغلط فيه).
--      وبعدها بنرجّع تاريخ كل عملية لورا (آخر ~14 يوم) عشان الرسم البياني
--      والتقارير تبان حية.
--   2) كل صف تجريبي بيتسجّل في جدول DemoRecord (جدول واحد) — فالمسح بيعرف
--      بالظبط إيه اللي تجريبي وإيه اللي دخّله العميل بنفسه. مفيش أعمدة
--      isDemo جديدة على 12 جدول.
--   3) الدالة بترفض الزرع لو المحل فيه أي بيانات فعلية (منتج/عميل/بيع/...).
--      يعني ماتقدرش تلخبط بيانات عميل شغّال.
--   4) المسح بيحمي أي صف حقيقي مربوط بصف تجريبي (مثلاً العميل باع فاتورة
--      حقيقية لعميل تجريبي): الصف ده بيتحول لحقيقي ومابيتمسحش.
--
-- التركيب (مرة واحدة): الصق الملف كله في Supabase → SQL Editor → Run.
-- بعد create-sale.sql و create-purchase-order.sql و seasonal-v1.sql.
-- آمن على إعادة التشغيل.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) جدول تسجيل الصفوف التجريبية ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DemoRecord" (
  "id"       BIGSERIAL PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "tbl"      TEXT NOT NULL,
  "rowId"    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DemoRecord_tenant_tbl_row_key"
  ON "DemoRecord" ("tenantId", "tbl", "rowId");

-- ── 2) seed_demo_data ───────────────────────────────────────────────────────
-- payload (يبنيه src/lib/demo-data.ts):
--   tenantId, userId, vertical, prefix, withBranch(bool), demoUser{name,email}|null,
--   capital, categories[], products[], customers[], suppliers[],
--   purchases[], sales[], customerPayments[], supplierPayments[],
--   expenses[], maintenance[]
-- الرد: { ok:true, counts:{...} } أو { ok:false, skipped:'<سبب>' }
CREATE OR REPLACE FUNCTION seed_demo_data(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tid       text := payload->>'tenantId';
  v_uid       text := payload->>'userId';
  v_prefix    text := COALESCE(payload->>'prefix', 'INV');
  v_tz        text;
  v_midnight  timestamp;                          -- منتصف ليل المحل (UTC wall-clock)
  v_nowu      timestamp := (now() AT TIME ZONE 'UTC');
  v_year      int;
  v_branch    int := NULL;
  v_idx       int := 0;
  v_ts        timestamp;
  v_res       jsonb;
  v_id        int;
  v_pid       int;
  v_vid       int;
  v_cid       int;
  v_sid       int;
  v_name      text;
  v_cost      float8;
  v_total     float8;
  v_paid      float8;
  v_items     jsonb;
  v_amount    float8;
  v_method    text;
  v_pm        jsonb := '{}'::jsonb;               -- product key  -> id
  v_cm        jsonb := '{}'::jsonb;               -- customer key -> id
  v_sm        jsonb := '{}'::jsonb;               -- supplier key -> id
  r           jsonb;
  l           jsonb;
  vr          jsonb;
  n_prod int := 0; n_cust int := 0; n_supp int := 0; n_purch int := 0;
  n_sales int := 0; n_exp int := 0; n_maint int := 0;
BEGIN
  IF v_tid IS NULL OR NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = v_tid) THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'no_tenant');
  END IF;

  -- قفل لكل محل: ضغطتين متزامنتين على "حمّل بيانات تجريبية" مايزرعوش مرتين
  PERFORM pg_advisory_xact_lock(hashtext('demo-seed:' || v_tid));

  -- 🛡️ المحل لازم يكون فاضي فعلاً — مانلمسش أي بيانات حقيقية أبداً
  IF EXISTS (SELECT 1 FROM "Product"          WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "Customer"         WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "Supplier"         WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "Sale"             WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "PurchaseOrder"    WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "Expense"          WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "CashEntry"        WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "MaintenanceOrder" WHERE "tenantId" = v_tid)
  OR EXISTS (SELECT 1 FROM "DemoRecord"       WHERE "tenantId" = v_tid)
  THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'tenant_not_empty');
  END IF;

  SELECT COALESCE("timezone", 'Africa/Cairo') INTO v_tz FROM "Tenant" WHERE "id" = v_tid;
  -- منتصف ليل المحل كـ UTC wall-clock (أعمدة Prisma timestamp بدون منطقة)
  v_midnight := (date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz) AT TIME ZONE 'UTC';
  v_year := EXTRACT(YEAR FROM (now() AT TIME ZONE v_tz))::int;

  -- ── الفرع الرئيسي (حقيقي — مش بيتمسح مع التجريبي) ──
  IF COALESCE((payload->>'withBranch')::boolean, false) THEN
    INSERT INTO "Branch" ("tenantId", "name", "isMain", "active", "phone", "address")
    SELECT v_tid, 'الفرع الرئيسي', true, true, t."phone", t."address"
    FROM "Tenant" t WHERE t."id" = v_tid
    RETURNING "id" INTO v_branch;
  END IF;

  -- ── التصنيفات ──
  INSERT INTO "Category" ("tenantId", "name")
  SELECT v_tid, c FROM jsonb_array_elements_text(COALESCE(payload->'categories', '[]'::jsonb)) AS c
  ON CONFLICT ("tenantId", "name") DO NOTHING;

  -- ── المنتجات (+ ألوان/مقاسات) — الكمية صفر، البضاعة بتدخل بأوامر الشراء ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'products', '[]'::jsonb)) LOOP
    INSERT INTO "Product"
      ("tenantId", "name", "category", "barcode", "price", "cost", "quantity",
       "minQuantity", "soldByWeight", "unitLabel", "collection", "active")
    VALUES
      (v_tid, r->>'name', r->>'category', NULLIF(r->>'barcode', ''),
       (r->>'price')::float8, 0, 0,
       COALESCE((r->>'minQty')::float8, 1),
       COALESCE((r->>'soldByWeight')::boolean, false),
       NULLIF(r->>'unitLabel', ''), NULLIF(r->>'collection', ''), true)
    RETURNING "id" INTO v_pid;
    v_pm := v_pm || jsonb_build_object(r->>'key', v_pid);
    n_prod := n_prod + 1;

    FOR vr IN SELECT * FROM jsonb_array_elements(COALESCE(r->'variants', '[]'::jsonb)) LOOP
      INSERT INTO "ProductVariant" ("productId", "size", "color", "barcode", "quantity", "displayQty")
      VALUES (v_pid, NULLIF(vr->>'size', ''), NULLIF(vr->>'color', ''), NULLIF(vr->>'barcode', ''), 0, 0);
    END LOOP;
  END LOOP;

  -- ── وحدات الجملة الافتراضية (ربع دستة/نص دستة/...) — للباقات اللي فيها multi_unit ──
  IF jsonb_typeof(payload->'units') = 'array' AND jsonb_array_length(payload->'units') > 0 THEN
    INSERT INTO "ProductUnit" ("productId", "name", "factor", "price")
    SELECT p."id", u->>'name', (u->>'factor')::int, round((p."price" * (u->>'factor')::int)::numeric, 2)::float8
    FROM "Product" p CROSS JOIN jsonb_array_elements(payload->'units') u
    WHERE p."tenantId" = v_tid AND COALESCE(p."soldByWeight", false) = false;
  END IF;

  -- ── العملاء ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'customers', '[]'::jsonb)) LOOP
    INSERT INTO "Customer" ("tenantId", "name", "phone")
    VALUES (v_tid, r->>'name', NULLIF(r->>'phone', '')) RETURNING "id" INTO v_cid;
    v_cm := v_cm || jsonb_build_object(r->>'key', v_cid);
    n_cust := n_cust + 1;
  END LOOP;

  -- ── الموردين ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'suppliers', '[]'::jsonb)) LOOP
    INSERT INTO "Supplier" ("tenantId", "name", "phone")
    VALUES (v_tid, r->>'name', NULLIF(r->>'phone', '')) RETURNING "id" INTO v_id;
    v_sm := v_sm || jsonb_build_object(r->>'key', v_id);
    n_supp := n_supp + 1;
  END LOOP;

  -- ── مستخدم تجريبي (موظف كاشير) — معطّل وبدون كلمة مرور قابلة للاستخدام ──
  -- ⚠️ أمان: hash مش صالح + active=false → مستحيل حد يدخل بيه.
  IF payload->'demoUser' IS NOT NULL AND jsonb_typeof(payload->'demoUser') = 'object' THEN
    INSERT INTO "User" ("tenantId", "branchId", "name", "email", "password", "role", "active", "canViewProfits")
    VALUES (v_tid, v_branch, payload->'demoUser'->>'name', payload->'demoUser'->>'email',
            '!demo-account-disabled', 'EMPLOYEE', false, false);
  END IF;

  -- ── رأس مال تجريبي في الخزنة (عشان الرصيد ما يبقاش سالب بعد المشتريات) ──
  IF COALESCE((payload->>'capital')::float8, 0) > 0 THEN
    INSERT INTO "CashEntry" ("tenantId", "source", "amount", "method", "note", "userId", "createdAt")
    VALUES (v_tid, 'manual', (payload->>'capital')::float8, 'cash',
            'إيداع افتتاحي (بيانات تجريبية)', v_uid,
            v_midnight - make_interval(days => 15));
  END IF;

  -- ── أوامر الشراء (الأقدم أولاً) عبر create_purchase_order الأصلية ──
  v_idx := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'purchases', '[]'::jsonb)) LOOP
    v_idx := v_idx + 1;
    v_items := '[]'::jsonb; v_total := 0;
    FOR l IN SELECT * FROM jsonb_array_elements(r->'lines') LOOP
      v_pid := (v_pm->>(l->>'p'))::int;
      v_vid := NULL;
      SELECT p."name" INTO v_name FROM "Product" p WHERE p."id" = v_pid;
      IF l ? 'size' OR l ? 'color' THEN
        SELECT v."id" INTO v_vid FROM "ProductVariant" v
         WHERE v."productId" = v_pid
           AND v."size"  IS NOT DISTINCT FROM NULLIF(l->>'size', '')
           AND v."color" IS NOT DISTINCT FROM NULLIF(l->>'color', '');
        v_name := v_name || ' — ' || concat_ws(' / ', NULLIF(l->>'size', ''), NULLIF(l->>'color', ''));
      END IF;
      v_items := v_items || jsonb_build_object(
        'productId', v_pid, 'variantId', v_vid, 'name', v_name,
        'cost', (l->>'cost')::float8, 'quantity', (l->>'qty')::float8);
      v_total := v_total + (l->>'cost')::float8 * (l->>'qty')::float8;
    END LOOP;
    v_paid := CASE WHEN r->>'paid' = 'full' THEN v_total ELSE COALESCE((r->>'paid')::float8, 0) END;
    v_method := COALESCE(r->>'method', 'cash');

    v_res := create_purchase_order(jsonb_build_object(
      'tenantId', v_tid, 'branchId', v_branch, 'userId', v_uid,
      'supplierId', CASE WHEN r ? 'supplier' THEN (v_sm->>(r->>'supplier'))::int ELSE NULL END,
      'total', v_total, 'paid', v_paid, 'paymentMethod', v_method,
      'year', v_year, 'items', v_items));
    v_id := (v_res->>'id')::int;

    v_ts := LEAST(v_midnight - make_interval(days => (r->>'daysAgo')::int)
                            + make_interval(mins => COALESCE((r->>'at')::int, 600)),
                  v_nowu - make_interval(mins => 30 + v_idx));
    UPDATE "PurchaseOrder" SET "createdAt" = v_ts WHERE "id" = v_id;
    UPDATE "CashEntry"     SET "createdAt" = v_ts WHERE "tenantId" = v_tid AND "source" = 'purchase' AND "refId" = v_id;
    UPDATE "StockMovement" SET "createdAt" = v_ts WHERE "tenantId" = v_tid AND "refType" = 'purchase' AND "refId" = v_id;
    n_purch := n_purch + 1;
  END LOOP;

  -- ── فواتير البيع (الأقدم أولاً) عبر create_sale الأصلية ──
  v_idx := 0;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'sales', '[]'::jsonb)) LOOP
    v_idx := v_idx + 1;
    v_items := '[]'::jsonb; v_total := 0;
    FOR l IN SELECT * FROM jsonb_array_elements(r->'lines') LOOP
      v_pid := (v_pm->>(l->>'p'))::int;
      v_vid := NULL;
      SELECT p."name", p."cost", COALESCE((l->>'price')::float8, p."price")
        INTO v_name, v_cost, v_amount
        FROM "Product" p WHERE p."id" = v_pid;
      IF l ? 'size' OR l ? 'color' THEN
        SELECT v."id" INTO v_vid FROM "ProductVariant" v
         WHERE v."productId" = v_pid
           AND v."size"  IS NOT DISTINCT FROM NULLIF(l->>'size', '')
           AND v."color" IS NOT DISTINCT FROM NULLIF(l->>'color', '');
      END IF;
      v_items := v_items || jsonb_build_object(
        'productId', v_pid, 'variantId', v_vid, 'name', v_name,
        'price', v_amount, 'cost', v_cost, 'quantity', (l->>'qty')::float8,
        'pieceLabel', (SELECT p."unitLabel" FROM "Product" p WHERE p."id" = v_pid));
      v_total := v_total + v_amount * (l->>'qty')::float8;
    END LOOP;
    v_total := round(v_total::numeric, 2)::float8;
    v_paid := CASE WHEN r->>'paid' = 'full' THEN v_total ELSE COALESCE((r->>'paid')::float8, 0) END;
    v_cid  := CASE WHEN r ? 'customer' THEN (v_cm->>(r->>'customer'))::int ELSE NULL END;

    v_res := create_sale(jsonb_build_object(
      'tenantId', v_tid, 'branchId', v_branch, 'userId', v_uid,
      'customerId', v_cid, 'total', v_total, 'paid', v_paid,
      'paymentMethod', COALESCE(r->>'method', 'cash'),
      'year', v_year, 'prefix', v_prefix, 'items', v_items));
    v_sid := (v_res->>'id')::int;

    v_ts := LEAST(v_midnight - make_interval(days => (r->>'daysAgo')::int)
                            + make_interval(mins => COALESCE((r->>'at')::int, 720)),
                  v_nowu - make_interval(mins => 2 + v_idx));
    UPDATE "Sale"          SET "createdAt" = v_ts WHERE "id" = v_sid;
    UPDATE "CashEntry"     SET "createdAt" = v_ts WHERE "tenantId" = v_tid AND "source" = 'sale' AND "refId" = v_sid;
    UPDATE "StockMovement" SET "createdAt" = v_ts WHERE "tenantId" = v_tid AND "refType" = 'sale' AND "refId" = v_sid;
    n_sales := n_sales + 1;
  END LOOP;

  -- ── تحصيل من العملاء (دفعة على الحساب) — نفس /api/payments ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'customerPayments', '[]'::jsonb)) LOOP
    v_cid := (v_cm->>(r->>'customer'))::int;
    v_amount := (r->>'amount')::float8;
    v_method := COALESCE(r->>'method', 'cash');
    v_ts := LEAST(v_midnight - make_interval(days => (r->>'daysAgo')::int) + make_interval(mins => 840),
                  v_nowu - make_interval(mins => 3));
    INSERT INTO "Payment" ("tenantId", "customerId", "amount", "method", "note", "createdAt")
    VALUES (v_tid, v_cid, v_amount, v_method, r->>'note', v_ts) RETURNING "id" INTO v_id;
    UPDATE "Customer" SET "balance" = "balance" - v_amount WHERE "id" = v_cid;
    INSERT INTO "CashEntry" ("tenantId", "source", "refId", "amount", "method", "note", "userId", "createdAt")
    VALUES (v_tid, 'payment', v_id, v_amount, v_method,
            'دفعة من ' || (SELECT "name" FROM "Customer" WHERE "id" = v_cid), v_uid, v_ts);
  END LOOP;

  -- ── سداد للموردين — نفس /api/supplier-payments ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'supplierPayments', '[]'::jsonb)) LOOP
    v_id := (v_sm->>(r->>'supplier'))::int;
    v_amount := (r->>'amount')::float8;
    v_method := COALESCE(r->>'method', 'cash');
    v_ts := LEAST(v_midnight - make_interval(days => (r->>'daysAgo')::int) + make_interval(mins => 780),
                  v_nowu - make_interval(mins => 4));
    INSERT INTO "SupplierPayment" ("tenantId", "supplierId", "amount", "method", "note", "createdAt")
    VALUES (v_tid, v_id, v_amount, v_method, r->>'note', v_ts) RETURNING "id" INTO v_sid;
    UPDATE "Supplier" SET "balance" = "balance" - v_amount WHERE "id" = v_id;
    INSERT INTO "CashEntry" ("tenantId", "source", "refId", "amount", "method", "note", "userId", "createdAt")
    VALUES (v_tid, 'supplier_payment', v_sid, -v_amount, v_method,
            'دفعة لمورد ' || (SELECT "name" FROM "Supplier" WHERE "id" = v_id), v_uid, v_ts);
  END LOOP;

  -- ── المصروفات — نفس /api/expenses ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'expenses', '[]'::jsonb)) LOOP
    v_amount := (r->>'amount')::float8;
    v_ts := LEAST(v_midnight - make_interval(days => (r->>'daysAgo')::int) + make_interval(mins => 660),
                  v_nowu - make_interval(mins => 5));
    INSERT INTO "Expense" ("tenantId", "branchId", "category", "amount", "note", "userId", "createdAt")
    VALUES (v_tid, v_branch, r->>'category', v_amount, r->>'note', v_uid, v_ts) RETURNING "id" INTO v_id;
    INSERT INTO "CashEntry" ("tenantId", "source", "refId", "amount", "method", "note", "userId", "createdAt")
    VALUES (v_tid, 'expense', v_id, -v_amount, 'cash',
            'المصروف ' || (r->>'category') || COALESCE(' - ' || NULLIF(r->>'note', ''), ''), v_uid, v_ts);
    n_exp := n_exp + 1;
  END LOOP;

  -- ── الصيانة (محلات الموبايل) — المُسلَّم بيدخّل الخزنة زي /api/maintenance ──
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'maintenance', '[]'::jsonb)) LOOP
    v_ts := LEAST(v_midnight - make_interval(days => (r->>'daysAgo')::int) + make_interval(mins => 600),
                  v_nowu - make_interval(mins => 6));
    INSERT INTO "MaintenanceOrder"
      ("tenantId", "customerName", "phone", "device", "issue", "cost", "status", "receivedAt", "deliveredAt")
    VALUES
      (v_tid, r->>'customerName', NULLIF(r->>'phone', ''), r->>'device', COALESCE(r->>'issue', ''),
       COALESCE((r->>'cost')::float8, 0), COALESCE(r->>'status', 'مستلم'), v_ts,
       CASE WHEN r->>'status' = 'مُسلَّم' THEN LEAST(v_ts + interval '2 days', v_nowu - interval '1 minute') ELSE NULL END)
    RETURNING "id" INTO v_id;
    IF r->>'status' = 'مُسلَّم' AND COALESCE((r->>'cost')::float8, 0) > 0 THEN
      INSERT INTO "CashEntry" ("tenantId", "source", "refId", "amount", "note", "userId", "createdAt")
      VALUES (v_tid, 'maintenance', v_id, (r->>'cost')::float8,
              'صيانة - ' || (r->>'customerName') || ' (' || (r->>'device') || ')', v_uid,
              LEAST(v_ts + interval '2 days', v_nowu - interval '1 minute'));
    END IF;
    n_maint := n_maint + 1;
  END LOOP;

  -- ── تسجيل كل اللي اتزرع كـ«تجريبي» (المحل كان فاضي، فكل الصفوف دي تجريبية) ──
  INSERT INTO "DemoRecord" ("tenantId", "tbl", "rowId")
  SELECT v_tid, x.tbl, x.id FROM (
    SELECT 'Product'          AS tbl, "id"::text AS id FROM "Product"          WHERE "tenantId" = v_tid
    UNION ALL SELECT 'Customer',         "id"::text FROM "Customer"         WHERE "tenantId" = v_tid
    UNION ALL SELECT 'Supplier',         "id"::text FROM "Supplier"         WHERE "tenantId" = v_tid
    UNION ALL SELECT 'Sale',             "id"::text FROM "Sale"             WHERE "tenantId" = v_tid
    UNION ALL SELECT 'PurchaseOrder',    "id"::text FROM "PurchaseOrder"    WHERE "tenantId" = v_tid
    UNION ALL SELECT 'Expense',          "id"::text FROM "Expense"          WHERE "tenantId" = v_tid
    UNION ALL SELECT 'CashEntry',        "id"::text FROM "CashEntry"        WHERE "tenantId" = v_tid
    UNION ALL SELECT 'StockMovement',    "id"::text FROM "StockMovement"    WHERE "tenantId" = v_tid
    UNION ALL SELECT 'Payment',          "id"::text FROM "Payment"          WHERE "tenantId" = v_tid
    UNION ALL SELECT 'SupplierPayment',  "id"::text FROM "SupplierPayment"  WHERE "tenantId" = v_tid
    UNION ALL SELECT 'MaintenanceOrder', "id"::text FROM "MaintenanceOrder" WHERE "tenantId" = v_tid
    UNION ALL SELECT 'Category',         "id"::text FROM "Category"         WHERE "tenantId" = v_tid
    UNION ALL SELECT 'User',             "id"       FROM "User"             WHERE "tenantId" = v_tid AND "id" <> v_uid AND "active" = false
  ) x;
  -- علامة نشاط البيانات التجريبية (لو الباقة اتغيّرت لنشاط تاني نعيد الزرع)
  INSERT INTO "DemoRecord" ("tenantId", "tbl", "rowId") VALUES (v_tid, '_meta', COALESCE(payload->>'vertical', ''));

  RETURN jsonb_build_object('ok', true, 'counts', jsonb_build_object(
    'products', n_prod, 'customers', n_cust, 'suppliers', n_supp,
    'purchases', n_purch, 'sales', n_sales, 'expenses', n_exp, 'maintenance', n_maint,
    'branch', v_branch IS NOT NULL));
END;
$$;

-- ── 3) purge_demo_data ──────────────────────────────────────────────────────
-- بيمسح الصفوف التجريبية بس. أي صف تجريبي مربوط بصف حقيقي (دخّله العميل
-- بعد ما بدأ شغل فعلي) بيتحوّل لحقيقي وبيتشال من التسجيل بدل ما يتمسح.
CREATE OR REPLACE FUNCTION purge_demo_data(p_tid text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  n_sales int; n_prod int; n_cust int; n_supp int; n_po int;
  kept_prod int; kept_cust int; kept_supp int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('demo-seed:' || p_tid));

  IF NOT EXISTS (SELECT 1 FROM "DemoRecord" WHERE "tenantId" = p_tid) THEN
    RETURN jsonb_build_object('ok', true, 'purged', false, 'reason', 'no_demo_data');
  END IF;

  -- 0) تصحيح أرصدة العملاء/الموردين التجريبيين قبل ما نمسح فواتيرهم:
  --    لو عميل تجريبي اتحوّل لحقيقي (عليه فاتورة حقيقية) لازم رصيده يشيل
  --    دين الفواتير التجريبية بس، مش يفضل رقم وهمي.
  UPDATE "Customer" c SET "balance" = c."balance" - x.d
  FROM (SELECT s."customerId" AS cid, SUM(s."total" - s."paid") AS d
        FROM "Sale" s JOIN "DemoRecord" r
          ON r."tenantId" = p_tid AND r."tbl" = 'Sale' AND r."rowId" = s."id"::text
        WHERE s."tenantId" = p_tid AND s."customerId" IS NOT NULL
        GROUP BY s."customerId") x
  WHERE c."id" = x.cid AND c."tenantId" = p_tid;
  UPDATE "Customer" c SET "balance" = c."balance" + x.d
  FROM (SELECT pm."customerId" AS cid, SUM(pm."amount") AS d
        FROM "Payment" pm JOIN "DemoRecord" r
          ON r."tenantId" = p_tid AND r."tbl" = 'Payment' AND r."rowId" = pm."id"::text
        WHERE pm."tenantId" = p_tid
        GROUP BY pm."customerId") x
  WHERE c."id" = x.cid AND c."tenantId" = p_tid;
  UPDATE "Supplier" s SET "balance" = s."balance" - x.d
  FROM (SELECT o."supplierId" AS sid, SUM(o."total" - o."paid") AS d
        FROM "PurchaseOrder" o JOIN "DemoRecord" r
          ON r."tenantId" = p_tid AND r."tbl" = 'PurchaseOrder' AND r."rowId" = o."id"::text
        WHERE o."tenantId" = p_tid AND o."supplierId" IS NOT NULL
        GROUP BY o."supplierId") x
  WHERE s."id" = x.sid AND s."tenantId" = p_tid;
  UPDATE "Supplier" s SET "balance" = s."balance" + x.d
  FROM (SELECT sp."supplierId" AS sid, SUM(sp."amount") AS d
        FROM "SupplierPayment" sp JOIN "DemoRecord" r
          ON r."tenantId" = p_tid AND r."tbl" = 'SupplierPayment' AND r."rowId" = sp."id"::text
        WHERE sp."tenantId" = p_tid
        GROUP BY sp."supplierId") x
  WHERE s."id" = x.sid AND s."tenantId" = p_tid;

  -- ملاحظة: كل DELETE تحت بيستبعد أي صف مش مسجّل (يعني حقيقي).
  -- 1) الخزنة وحركات المخزون التجريبية
  DELETE FROM "CashEntry" c USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'CashEntry' AND d."rowId" = c."id"::text AND c."tenantId" = p_tid;
  DELETE FROM "StockMovement" m USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'StockMovement' AND d."rowId" = m."id"::text AND m."tenantId" = p_tid;

  -- 2) الفواتير وأوامر الشراء (الأصناف والمرتجعات بتتمسح بالـ CASCADE)
  WITH del AS (
    DELETE FROM "Sale" s USING "DemoRecord" d
     WHERE d."tenantId" = p_tid AND d."tbl" = 'Sale' AND d."rowId" = s."id"::text AND s."tenantId" = p_tid
    RETURNING 1) SELECT count(*) INTO n_sales FROM del;
  WITH del AS (
    DELETE FROM "PurchaseOrder" o USING "DemoRecord" d
     WHERE d."tenantId" = p_tid AND d."tbl" = 'PurchaseOrder' AND d."rowId" = o."id"::text AND o."tenantId" = p_tid
    RETURNING 1) SELECT count(*) INTO n_po FROM del;

  -- 3) الدفعات (لازم قبل العملاء/الموردين — الـ FK بدون cascade)
  DELETE FROM "Payment" p USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'Payment' AND d."rowId" = p."id"::text AND p."tenantId" = p_tid;
  DELETE FROM "SupplierPayment" p USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'SupplierPayment' AND d."rowId" = p."id"::text AND p."tenantId" = p_tid;

  -- 4) العملاء/الموردين: بنمسح بس اللي مفيش حاجة حقيقية متعلقة بيه
  WITH del AS (
    DELETE FROM "Customer" c USING "DemoRecord" d
     WHERE d."tenantId" = p_tid AND d."tbl" = 'Customer' AND d."rowId" = c."id"::text AND c."tenantId" = p_tid
       AND NOT EXISTS (SELECT 1 FROM "Sale"       x WHERE x."customerId" = c."id")
       AND NOT EXISTS (SELECT 1 FROM "Payment"    x WHERE x."customerId" = c."id")
       AND NOT EXISTS (SELECT 1 FROM "SaleReturn" x WHERE x."customerId" = c."id")
    RETURNING 1) SELECT count(*) INTO n_cust FROM del;
  WITH del AS (
    DELETE FROM "Supplier" s USING "DemoRecord" d
     WHERE d."tenantId" = p_tid AND d."tbl" = 'Supplier' AND d."rowId" = s."id"::text AND s."tenantId" = p_tid
       AND NOT EXISTS (SELECT 1 FROM "PurchaseOrder"   x WHERE x."supplierId" = s."id")
       AND NOT EXISTS (SELECT 1 FROM "SupplierPayment" x WHERE x."supplierId" = s."id")
    RETURNING 1) SELECT count(*) INTO n_supp FROM del;

  -- 5) المنتجات: بنمسح اللي مفيش عليه حركة/فاتورة/جرد/تحويل حقيقي
  --    (الألوان/المقاسات والوحدات بتتمسح بالـ CASCADE)
  --    حركات المخزون والخزنة التجريبية اتمسحت فوق، فأي حركة فاضلة = حقيقية.
  WITH del AS (
    DELETE FROM "Product" p USING "DemoRecord" d
     WHERE d."tenantId" = p_tid AND d."tbl" = 'Product' AND d."rowId" = p."id"::text AND p."tenantId" = p_tid
       AND NOT EXISTS (SELECT 1 FROM "SaleItem"          x WHERE x."productId" = p."id")
       AND NOT EXISTS (SELECT 1 FROM "PurchaseOrderItem" x WHERE x."productId" = p."id")
       AND NOT EXISTS (SELECT 1 FROM "StockMovement"     x WHERE x."productId" = p."id")
       AND NOT EXISTS (SELECT 1 FROM "TransferItem"      x WHERE x."productId" = p."id")
       AND NOT EXISTS (SELECT 1 FROM "StocktakeItem"     x WHERE x."productId" = p."id")
    RETURNING 1) SELECT count(*) INTO n_prod FROM del;

  -- 5-ب) المنتج اللي اتحمى (اتباع في فاتورة حقيقية) بيفضل في الكتالوج بس
  --      بمخزون صفر — المخزون الحالي كان من مشتريات تجريبية مش بضاعة فعلية.
  UPDATE "ProductVariant" v SET "quantity" = 0, "displayQty" = 0
   WHERE v."productId" IN (SELECT p."id" FROM "Product" p JOIN "DemoRecord" d
                            ON d."tenantId" = p_tid AND d."tbl" = 'Product' AND d."rowId" = p."id"::text
                           WHERE p."tenantId" = p_tid);
  UPDATE "Product" p SET "quantity" = 0, "displayQty" = 0
   WHERE p."tenantId" = p_tid AND EXISTS (SELECT 1 FROM "DemoRecord" d
          WHERE d."tenantId" = p_tid AND d."tbl" = 'Product' AND d."rowId" = p."id"::text);

  -- 6) باقي التجريبي
  DELETE FROM "Expense" e USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'Expense' AND d."rowId" = e."id"::text AND e."tenantId" = p_tid;
  DELETE FROM "MaintenanceOrder" m USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'MaintenanceOrder' AND d."rowId" = m."id"::text AND m."tenantId" = p_tid;
  DELETE FROM "User" u USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'User' AND d."rowId" = u."id" AND u."tenantId" = p_tid
     AND u."active" = false AND u."password" = '!demo-account-disabled';
  -- التصنيفات: اللي مفيش منتج باقي بيستخدمها
  DELETE FROM "Category" c USING "DemoRecord" d
   WHERE d."tenantId" = p_tid AND d."tbl" = 'Category' AND d."rowId" = c."id"::text AND c."tenantId" = p_tid
     AND NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."tenantId" = p_tid AND p."category" = c."name");

  -- 7) إشعارات «مخزون منخفض» اللي اتولّدت من منتجات تجريبية (هتتولّد تاني للحقيقية)
  DELETE FROM "Notification" WHERE "tenantId" = p_tid AND "type" = 'low_stock';

  -- 8) عدّاد اللي اتحمى (اتحوّل لحقيقي) ثم تنظيف التسجيل
  SELECT count(*) INTO kept_prod FROM "DemoRecord" d JOIN "Product"  p ON d."tbl" = 'Product'  AND d."rowId" = p."id"::text WHERE d."tenantId" = p_tid;
  SELECT count(*) INTO kept_cust FROM "DemoRecord" d JOIN "Customer" c ON d."tbl" = 'Customer' AND d."rowId" = c."id"::text WHERE d."tenantId" = p_tid;
  SELECT count(*) INTO kept_supp FROM "DemoRecord" d JOIN "Supplier" s ON d."tbl" = 'Supplier' AND d."rowId" = s."id"::text WHERE d."tenantId" = p_tid;
  DELETE FROM "DemoRecord" WHERE "tenantId" = p_tid;

  RETURN jsonb_build_object('ok', true, 'purged', true,
    'deleted', jsonb_build_object('sales', n_sales, 'purchases', n_po, 'products', n_prod,
                                  'customers', n_cust, 'suppliers', n_supp),
    'keptAsReal', jsonb_build_object('products', kept_prod, 'customers', kept_cust, 'suppliers', kept_supp));
END;
$$;

-- ── 4) محلات «تجريبية فقط» — للوحة الأدمن (تنظيف الحسابات الوهمية) ──────────
-- المحل اللي كل بياناته تجريبية (العميل ماشتغلش فعلياً) يتعامل زي المحل الفاضي.
CREATE OR REPLACE FUNCTION demo_only_tenant_ids()
RETURNS TABLE ("id" text)
LANGUAGE sql STABLE
AS $$
  SELECT t."id" FROM "Tenant" t
  WHERE EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id")
    AND NOT EXISTS (SELECT 1 FROM "Sale" x WHERE x."tenantId" = t."id" AND NOT EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id" AND d."tbl" = 'Sale' AND d."rowId" = x."id"::text))
    AND NOT EXISTS (SELECT 1 FROM "Product" x WHERE x."tenantId" = t."id" AND NOT EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id" AND d."tbl" = 'Product' AND d."rowId" = x."id"::text))
    AND NOT EXISTS (SELECT 1 FROM "Customer" x WHERE x."tenantId" = t."id" AND NOT EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id" AND d."tbl" = 'Customer' AND d."rowId" = x."id"::text))
    AND NOT EXISTS (SELECT 1 FROM "Supplier" x WHERE x."tenantId" = t."id" AND NOT EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id" AND d."tbl" = 'Supplier' AND d."rowId" = x."id"::text))
    AND NOT EXISTS (SELECT 1 FROM "PurchaseOrder" x WHERE x."tenantId" = t."id" AND NOT EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id" AND d."tbl" = 'PurchaseOrder' AND d."rowId" = x."id"::text))
    AND NOT EXISTS (SELECT 1 FROM "CashEntry" x WHERE x."tenantId" = t."id" AND NOT EXISTS (SELECT 1 FROM "DemoRecord" d WHERE d."tenantId" = t."id" AND d."tbl" = 'CashEntry' AND d."rowId" = x."id"::text));
$$;
