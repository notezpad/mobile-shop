-- ═══════════════════════════════════════════════════════════════════════════
-- 🔍 حركات «صادر» اتسجلت بسبب «تالف» قبل تعديل 2026-10-18
-- الصرف العادي كان بيشيل الكمية من غير ما يسجل خسارة، فالأرباح في التقارير
-- طالعة أعلى من الحقيقي بقيمة التالف ده. الاستعلام قراءة فقط — راجعه وقرر.
-- (الهالك ما بيمسش الخزنة: بيتسجل مصروف خسارة بسعر التكلفة بدون CashEntry)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT m."id", m."createdAt"::date AS "التاريخ", p."name" AS "المنتج",
       ABS(m."quantity") AS "الكمية", p."cost" AS "التكلفة الحالية",
       ROUND((ABS(m."quantity") * p."cost")::numeric, 2) AS "قيمة الخسارة التقريبية",
       m."note"
FROM "StockMovement" m
JOIN "Product" p ON p."id" = m."productId"
WHERE m."type" = 'out' AND m."refType" = 'manual' AND m."note" LIKE 'تالف%'
ORDER BY m."createdAt" DESC;

-- لو عايز تحسبها خسارة (بعد المراجعة)، سجّلها كمصروف هالك بدون خزنة، مثال:
-- INSERT INTO "Expense" ("tenantId","branchId","category","amount","note","source")
-- SELECT m."tenantId", m."branchId", 'هالك وتالف',
--        ROUND((ABS(m."quantity") * p."cost")::numeric, 2),
--        'هالك (تسوية): ' || p."name" || ' × ' || ABS(m."quantity"), 'damage'
-- FROM "StockMovement" m JOIN "Product" p ON p."id" = m."productId"
-- WHERE m."id" IN (/* أرقام الحركات اللي راجعتها */);
