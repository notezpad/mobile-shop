-- 🥬 2026-10-12: Vertical المواد الغذائية + الباقات المخفية + البيع بالوزن بالكيلو
--
-- التغييرات:
--   1) Plan.visibility        — 'public' (افتراضي) | 'hidden' (باقة مخفية للأدمن فقط)
--   2) Product.soldByWeight   — منتجات البيع بالوزن (الكيلو بكسور) لمحلات المواد الغذائية
--   3) تحويل أعمدة الكميات من INTEGER إلى DOUBLE PRECISION — لازم للكميات
--      العشرية (لحمة 1.65 كيلو). القيم الصحيحة الحالية (45) بتتحول آمناً
--      لـ (45.0) ومفيش أي تغيير في سلوك منتجات القطع العادية.
--
-- ⚠️ طبّق الـ migration دي على قاعدة البيانات الإنتاجية قبل الـ deploy.
--    ALTER COLUMN TYPE على الجداول الصغيرة دي فوري في Postgres.
--
-- ⚠️ مهم: لو فيه نسخ قديمة من prisma client شغالة على السيرفر وقت التطبيق،
--    حط الـ deploy بعد الـ migration مباشرة (نفس نافذة الصيانة المعتادة).

-- ═══ 1) الباقات المخفية ═══
ALTER TABLE "Plan" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';

-- ═══ 2) البيع بالوزن ═══
ALTER TABLE "Product" ADD COLUMN "soldByWeight" BOOLEAN NOT NULL DEFAULT false;

-- ═══ 3) الكميات العشرية (الوزن) ═══
-- المنتج نفسه: المخزون + حد التنبيه
ALTER TABLE "Product" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
ALTER TABLE "Product" ALTER COLUMN "minQuantity" TYPE DOUBLE PRECISION;

-- عناصر فواتير البيع
ALTER TABLE "SaleItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleItem" ALTER COLUMN "returnedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleItem" ALTER COLUMN "unitQuantity" TYPE DOUBLE PRECISION;

-- عناصر مرتجع البيع
ALTER TABLE "SaleReturnItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

-- عناصر أوامر الشراء + مرتجع المورد
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "returnedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseReturnItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

-- حركات المخزون
ALTER TABLE "StockMovement" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

-- التحويلات بين الفروع
ALTER TABLE "TransferItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

-- الجرد
ALTER TABLE "StocktakeItem" ALTER COLUMN "systemQty" TYPE DOUBLE PRECISION;
ALTER TABLE "StocktakeItem" ALTER COLUMN "countedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "StocktakeItem" ALTER COLUMN "diff" TYPE DOUBLE PRECISION;

-- ═══ 4) الباقة الغذائية المخفية (تُنشأ أيضاً بالـ seed — هنا ضمان وجودها) ═══
INSERT INTO "Plan" (
  "code", "name", "description", "priceMonthly", "priceYearly",
  "maxUsers", "maxProducts", "maxBranches", "trialDays",
  "features", "isActive", "sortOrder", "businessType",
  "enabledModules", "capabilities", "visibility"
) VALUES (
  'food-basic',
  'المواد الغذائية — عطارة / مجمدات / بقالة / منظفات (مخفية)',
  'باقة مخصصة للمواد الغذائية: بيع بالكيلو بكسور، وحدات كيس/طبق/برطمان، بدون ميزات الملابس (مقاسات/ألوان/كوليكشن) وبدون صيانة أو معاملات مالية. تُسند للمحلات من لوحة الأدمن.',
  299, 2990,
  10, 10000, 5, 0,
  '["بيع بالكيلو بالوزن (كميات بكسور)","وحدات بيع: كيس / طبق / برطمان / كرتونة","مخزون ومشتريات وجرد بالكيلو","بدون مقاسات وألوان أو كوليكشنات","نقطة بيع كاملة + خزنة ومصروفات","تقارير مبيعات وأرباح"]',
  true, 50, 'food',
  '["dashboard","pos","products","sales","customers","suppliers","purchases","inventory","expenses","cash","reports","settings","users","branches"]',
  '["multi_unit","returns_exchange"]',
  'hidden'
) ON CONFLICT ("code") DO UPDATE SET
  "visibility" = 'hidden',
  "businessType" = 'food';
