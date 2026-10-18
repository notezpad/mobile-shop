-- ═══════════════════════════════════════════════════════════════════════════
-- 🩹 إصلاح بيانات: أوامر شراء اتسجلت على منتج له ألوان/مقاسات بدون تحديد المقاس
-- (قبل تعديل 2026-10-18). الكمية دي ضاعت من المخزون عند أول بيعة، بينما أمر
-- الشراء وحساب المورد والخزنة سليمين — فمش محتاج تعمل أمر شراء تاني.
--
-- الخطوة 1 (قراءة فقط): اعرف الكميات الضايعة لكل منتج.
-- الخطوة 2: وزّع الكمية على المقاسات بواسطة «حركة مخزون → وارد» واختار
--           اللون/المقاس (من شاشة المخزون) — ده بيحدّث المقاس وكمية المنتج.
--           أو نفّذ قالب الـ SQL تحت (اتأكد من الأرقام الأول).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) أوامر شراء على منتجات ليها variants وسطرها بدون variantId
SELECT o."orderNo",
       o."createdAt"::date            AS "التاريخ",
       p."id"                          AS "productId",
       p."name"                        AS "المنتج",
       i."quantity" - i."returnedQty"  AS "الكمية المشتراة (بعد المرتجع)",
       p."quantity"                    AS "كمية المنتج الحالية",
       (SELECT COALESCE(SUM(v."quantity"),0) FROM "ProductVariant" v WHERE v."productId" = p."id")
                                       AS "مجموع المقاسات الحالي"
FROM "PurchaseOrderItem" i
JOIN "PurchaseOrder" o ON o."id" = i."purchaseOrderId"
JOIN "Product" p       ON p."id" = i."productId"
WHERE i."variantId" IS NULL
  AND EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id")
ORDER BY o."createdAt" DESC;

-- 2) منتجات كميتها الإجمالية لا تساوي مجموع مقاساتها (لسه ما اتبعش بعد الشراء)
SELECT p."id", p."name", p."quantity" AS "كمية المنتج",
       SUM(v."quantity") AS "مجموع المقاسات",
       p."quantity" - SUM(v."quantity") AS "الفرق"
FROM "Product" p
JOIN "ProductVariant" v ON v."productId" = p."id"
GROUP BY p."id"
HAVING p."quantity" <> SUM(v."quantity");

-- 2.5) مزامنة كمية المنتج مع مجموع مقاساته — ⚠️ نفّذها *بعد* ما توزّع الكميات الضايعة
--      من الاستعلام (1) على المقاسات، وإلا هتمسح الفرق (الـ 100 مثلاً) نهائياً.
-- UPDATE "Product" p SET "quantity" = s.total
-- FROM (SELECT "productId", SUM("quantity") AS total FROM "ProductVariant" GROUP BY "productId") s
-- WHERE s."productId" = p."id" AND p."quantity" <> s.total;

-- 3) قالب التوزيع (عدّل الأرقام وشغّله مرة واحدة) — مثال: 100 قطعة على مقاسين
-- BEGIN;
--   UPDATE "ProductVariant" SET "quantity" = "quantity" + 50 WHERE "id" = <variantId1>;
--   UPDATE "ProductVariant" SET "quantity" = "quantity" + 50 WHERE "id" = <variantId2>;
--   UPDATE "Product" SET "quantity" =
--     (SELECT SUM("quantity") FROM "ProductVariant" WHERE "productId" = <productId>)
--   WHERE "id" = <productId>;
-- COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 🏬 إكمال باركود النسخ اللي اتعملت بالتحويل بين الفروع قبل تعديل 2026-10-18
-- (كانت بتتعمل بباركود فاضي فمكنتش بتتلاقي بالمسح). شغّل بعد migration
-- 20261018_branch_barcodes_and_variant_transfers.
-- ═══════════════════════════════════════════════════════════════════════════

-- أ) معاينة: النسخة + الباركود اللي هيتحط (بس لو في باركود واحد واضح من أصل في فرع تاني
--    ومفيش منتج في نفس الفرع بيستخدمه)
SELECT d."id", d."branchId", d."name", c."bc" AS "الباركود المقترح"
FROM "Product" d
JOIN (
  SELECT d2."id", MIN(s."barcode") AS bc
  FROM "Product" d2
  JOIN "Product" s
    ON s."tenantId" = d2."tenantId" AND s."name" = d2."name"
   AND s."branchId" IS DISTINCT FROM d2."branchId" AND s."barcode" IS NOT NULL
  WHERE d2."barcode" IS NULL AND d2."branchId" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "StockMovement" m WHERE m."productId" = d2."id" AND m."type" = 'transfer_in')
  GROUP BY d2."id"
  HAVING COUNT(DISTINCT s."barcode") = 1
) c ON c."id" = d."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "Product" x
  WHERE x."tenantId" = d."tenantId" AND x."branchId" = d."branchId" AND x."barcode" = c."bc"
);

-- ب) التنفيذ (فك التعليق بعد مراجعة المعاينة)
-- UPDATE "Product" d SET "barcode" = c."bc"
-- FROM ( ...نفس الاستعلام الفرعي بتاع المعاينة... ) c
-- WHERE d."id" = c."id"
--   AND NOT EXISTS (SELECT 1 FROM "Product" x WHERE x."tenantId" = d."tenantId"
--                   AND x."branchId" = d."branchId" AND x."barcode" = c."bc");
