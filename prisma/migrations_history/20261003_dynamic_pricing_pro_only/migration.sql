-- Step 1: reset flag للباقات الأساسية
UPDATE "Tenant" t
SET "dynamicRetailPricingEnabled" = false
FROM "Subscription" s
JOIN "Plan" p ON s."planId" = p.id
WHERE s."tenantId" = t.id
  AND s.status = 'active'
  AND p.code IN ('electronics-basic', 'fashion-basic');

-- Step 2: إزالة margin override من منتجات الباقات الأساسية
UPDATE "Product" pr
SET "retailMarginPercent" = NULL
WHERE pr."tenantId" IN (
  SELECT s."tenantId"
  FROM "Subscription" s
  JOIN "Plan" p ON s."planId" = p.id
  WHERE s.status = 'active'
    AND p.code IN ('electronics-basic', 'fashion-basic')
);

-- Step 3: إضافة dynamic_retail_pricing للباقات الاحترافية (correlated subquery)
UPDATE "Plan"
SET "capabilities" = (
  SELECT json_agg(DISTINCT val)::text
  FROM (
    SELECT json_array_elements_text("capabilities"::json) AS val
    UNION
    SELECT 'dynamic_retail_pricing'
  ) sub
)
WHERE code IN ('electronics-pro', 'fashion-pro');