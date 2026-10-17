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

-- 3) قالب التوزيع (عدّل الأرقام وشغّله مرة واحدة) — مثال: 100 قطعة على مقاسين
-- BEGIN;
--   UPDATE "ProductVariant" SET "quantity" = "quantity" + 50 WHERE "id" = <variantId1>;
--   UPDATE "ProductVariant" SET "quantity" = "quantity" + 50 WHERE "id" = <variantId2>;
--   UPDATE "Product" SET "quantity" =
--     (SELECT SUM("quantity") FROM "ProductVariant" WHERE "productId" = <productId>)
--   WHERE "id" = <productId>;
-- COMMIT;
