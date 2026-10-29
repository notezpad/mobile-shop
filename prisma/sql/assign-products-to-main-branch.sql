-- 🏬 إسناد المنتجات غير المرتبطة بفرع للفرع الرئيسي (للمحلات اللي عندها فروع بس)
-- آمن لإعادة التشغيل. التطبيق بيتعامل مع branchId = NULL كأنه الفرع الرئيسي حتى لو ماتشغلش،
-- لكن تشغيله بيخلّي البيانات صريحة (والتقارير ودايالوج المنتج متطابقين).

-- 1) معاينة: كام منتج هيتأثر لكل محل
SELECT p."tenantId", COUNT(*) AS products_without_branch
FROM "Product" p
JOIN "Branch" b ON b."tenantId" = p."tenantId" AND b."isMain" = true
WHERE p."branchId" IS NULL
GROUP BY p."tenantId";

-- 2) التنفيذ
UPDATE "Product" p
SET "branchId" = b."id"
FROM "Branch" b
WHERE b."tenantId" = p."tenantId"
  AND b."isMain" = true
  AND p."branchId" IS NULL;

-- 3) تحقق: المفروض صفر للمحلات اللي ليها فروع
SELECT COUNT(*) AS still_unassigned
FROM "Product" p
WHERE p."branchId" IS NULL
  AND EXISTS (SELECT 1 FROM "Branch" b WHERE b."tenantId" = p."tenantId");
