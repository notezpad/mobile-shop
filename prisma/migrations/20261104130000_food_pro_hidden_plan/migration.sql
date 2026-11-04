-- 🥬 2026-11-04 (التحديث 26): الباقة الاحترافية الغذائية المخفية (food-pro)
--
-- 🔧 إصلاح خطأ 42702 (column reference "enabledModules" is ambiguous):
--   جوّه ON CONFLICT DO UPDATE، أي مرجع عمود عاري (من غير سَند) بيتحصل
--   من جدولين: صف "Plan" الموجود + صف الـ VALUES الجديد — فلازم السَند.
--   التغيير: INSERT INTO "Plan" AS p + كل مراجع "enabledModules"
--   جوّه الـ CASE بقت p."enabledModules". EXCLUDED زي ما هي.
--
-- الخلفية:
--   زميل التطوير كان قال قبل إضافة الإضافات المدفوعة: «الغذائية مالهاش مسار
--   لـ HR — قاعدة الحذف بتشمل أي باقة food، ومفيش food-pro، فعميل الغذائي
--   مهما كبر مش هيقدر ياخد HR. لو الغذائية هتفضل خفيفة وخلاص مفيش مشكلة،
--   وإلا هتحتاج باقة أعلى ليها».
--
--   التحديث 26 سدّ الفتحتين مع بعض:
--   1) إضافة HR المدفوعة بقت متاحة للغذائية (كود: addons.ts + plan-constants.ts).
--   2) الباقة دي (food-pro) — مخفية زي food-basic، فيها HR مشمولة أصلاً.
--
-- التغييرات:
--   - INSERT باقة 'food-pro' — visibility='hidden' (تُسند من لوحة الأدمن
--     أو بأكواد التفعيل). محمية من التسجيل الذاتي (signup guard) ومن
--     الشراء الذاتي (paymob/checkout بيرفض hidden) ومن التبديل الذاتي
--     (switch-plan بيرفض hidden) — نفس حمايات food-basic بالظبط.
--   - موديول hr ضمن enabledModules من البداية + قاعدة enforceVerticalRules
--     فيها استثناء food-pro (شوف plan-constants.ts التحديث 26) فما تمسحهاش.
--   - مفيش أي ALTER للجداول — الحقول كلها موجودة (visibility من 20261012،
--     TenantAddOn من 20261104120000).
--
-- 💰 الأسعار (429 / 4290): قرار تجاري مبدئي — الطرح: food-basic (299) +
--    إضافة HR (149) = 448 لو اشتروا منفصلين، فالباقة المجملة 429 بتوفر
--    ~20 ج/شهر. لو عايز تعدل: UPDATE "Plan" SET "priceMonthly"=X WHERE "code"='food-pro';
--    أو من لوحة الأدمن → الباقات.
--
-- ⚠️ ملاحظة إعادة التشغيل: السكريبت idempotent — لكن خد بالك إن الـ upsert
--    بيحدّث (name/description/الأسعار/features/sortOrder/capabilities) من
--    القيم اللي هنا كل مرة تشغّله. المحمي الوحيد هو enabledModules
--    (بيتكمل بـ hr لو ناقص بس، ومش بيمسح تخصيص الأدمن).
--
-- ⚠️ طبّق على قاعدة البيانات الإنتاجية قبل الـ deploy، وبعدها شغّل الاختياري:
--    bun run tsx prisma/seed-food-pro-plan.ts (idempotent — نفس البيانات)

INSERT INTO "Plan" AS p (
  "code", "name", "description", "priceMonthly", "priceYearly",
  "maxUsers", "maxProducts", "maxBranches", "trialDays",
  "features", "isActive", "sortOrder", "businessType",
  "enabledModules", "capabilities", "visibility"
) VALUES (
  'food-pro',
  'المواد الغذائية — احترافية (مخفية)',
  'كل مزايا الغذائية الأساسية + الموارد البشرية مشمولة: حضور وانصراف الموظفين، الإجازات، وكشف رواتب شهري مع الدفعات المقدمة. للسلاسل والمحلات الكبيرة — تُسند للمحلات من لوحة الأدمن أو بأكواد التفعيل.',
  429, 4290,
  10, 10000, 5, 0,
  '["بيع بالكيلو بالوزن (كميات بكسور)","وحدات بيع: كيس / طبق / برطمان / كرتونة","الموارد البشرية مشمولة: حضور وإجازات ورواتب","كل مزايا الغذائية الأساسية","نقطة بيع كاملة + خزنة ومصروفات","تقارير مبيعات وأرباح"]',
  true, 55, 'food',
  '["dashboard","pos","products","sales","customers","suppliers","purchases","inventory","expenses","cash","reports","settings","users","branches","hr"]',
  '["multi_unit","returns_exchange"]',
  'hidden'
) ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "priceMonthly" = EXCLUDED."priceMonthly",
  "priceYearly" = EXCLUDED."priceYearly",
  "maxUsers" = EXCLUDED."maxUsers",
  "maxProducts" = EXCLUDED."maxProducts",
  "maxBranches" = EXCLUDED."maxBranches",
  "features" = EXCLUDED."features",
  "isActive" = true,
  "sortOrder" = EXCLUDED."sortOrder",
  "businessType" = 'food',
  -- ملاحظة: enabledModules مش بنمسحها في الـ UPDATE عشان لو الأدمن ظبطها
  -- يدوياً من اللوحة متترجعش. لكن نتأكد إن hr موجودة لو ناقصة:
  "enabledModules" = CASE
    WHEN p."enabledModules" IS NOT NULL
     AND p."enabledModules" <> ''
     AND jsonb_typeof(p."enabledModules"::jsonb) = 'array'
     AND NOT ((p."enabledModules"::jsonb) ? 'hr')
    THEN ((p."enabledModules"::jsonb) || '"hr"'::jsonb)::text
    ELSE p."enabledModules"
  END,
  "capabilities" = EXCLUDED."capabilities",
  "visibility" = 'hidden';

-- ── الفحص النهائي: صف واحد فيه has_hr = true وvisibility = hidden ──
-- (محصّن ضد القيم الغريبة: فاضي / مش array / NULL → has_hr ترجع NULL بدل ما تكسر)
SELECT "code", "visibility", "priceMonthly", "priceYearly", "sortOrder",
       CASE WHEN "enabledModules" IS NOT NULL
             AND "enabledModules" <> ''
             AND jsonb_typeof("enabledModules"::jsonb) = 'array'
            THEN ("enabledModules"::jsonb) ? 'hr'
            ELSE NULL
       END AS has_hr,
       "enabledModules"
FROM "Plan"
WHERE "code" = 'food-pro';
