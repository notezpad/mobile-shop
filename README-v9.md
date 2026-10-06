# 🚀 nezampos — PATCH v9 (الأداء + الترقيم + الفهارس)

> **التاريخ:** 2026-10-06 · **يبنى على:** v8 (كل إصلاحات v7 وv8 محفوظة زي ما هي — مفيش أي سطر منهم اتشال)

---

## ١) ماذا يصلح هذا الباتش؟

v9 بيكمّل على v8: بعد ما الديالوجات بقت تفتح في 380-542ms، فضل **الجزء الأبطأ هو فتح الديالوج فوق صفحة فيها مئات الصفوف** (المخزون/المصروفات/المبيعات) — لأن المتصفح بيعيد حساب الأنماط لكل الصفوف الظاهرة حتى لو بره الشاشة. كمان في بقايا حسابات في الـ Worker ممكن تعدّي حد الـ CPU (خطأ 1102).

### النتائج المقاسة (iPhone 14 ‏390×664@3x + CPU throttle 6x — نفس منهجية v8)

| القياس | قبل v8 | بعد v9 | التحسن |
|---|---|---|---|
| **فتح دايلوج العميل** | 5960ms | **759ms** | 🟢 **−87%** |
| **فتح دايلوج حركة المخزون** | 2088ms | **~990ms** | 🟢 **−53%** |
| **فتح دايلوج "منتج جديد"** | 1444ms | **~877ms** | 🟢 **−39%** |
| **صفحة المصروفات** | 7078ms | **3531ms** | 🟢 **−50%** |
| **عقد DOM في المصروفات** | 18,973 | **4,964** | 🟢 **−74%** |
| **عقد DOM في المخزون** | 13,951 | **7,532** | 🟢 **−46%** |
| صفحة المنتجات | 3950ms | 3211ms | −19% |
| الخزنة | 2579ms | 2238ms | −13% |
| باقي الصفحات (داشبورد/تقارير/مالية…) | — | زي ما هي تقريباً | التغيير هناك في **CPU السيرفر** مش المتصفح |

> ⚠️ **مهم:** المخزون بعد v9 بيعرض **كل المنتجات فعلاً** — قبل كده كان فيه باج صامت: الصفحة بتطلب 1000 منتج والـ API كان بيقصّها عند 100 بصمت. يعني رقم "عقد DOM" قل نصين *مع* عرض بيانات أكتر صح.

### نتائج E2E: **23/23 ناجحة** ✅
(لوجين، داشبورد، منتجات، **بيع كامل من نقطة البيع**، مخزون، حركات، عملاء، مبيعات، مصروفات، خزنة، مالية، مشتريات، موردين، تقارير، تنقل مع loading skeletons الجديدة)

---

## ٢) شرح التعديلات (العناصر الخمسة)

### ⚡ v9-1: content-visibility: auto للصفوف الثقيلة
- صنفان جداد في src/app/globals.css (بعد كتلة v8 بالظبط): .cv-auto (للصفوف) و .cv-section (للأقسام الكبيرة).
- العناصر بره الشاشة بتبقى "skipped" — فتح الديالوج بيعمل style recalc على 30-50 صف ظاهر بدل آلاف الصفوف.
- **مفيش أي تغيير بصري** — contain-intrinsic-size: auto Npx بيحافظ على ارتفاع الصف عند التمرير.
- متطبق في: StockTab، MovementsTab، SalesHistoryView، CustomersView، SuppliersView، ExpensesView، CashView، FinanceView، PurchaseOrdersView، DashboardView، ProductsView، ReportsView.

### 📄 v9-2: Pagination — أقصى 30-50 صف في الـ DOM
- مكوّن مشترك جديد: src/components/shop/ListPager.tsx (hook usePager + واجهة أزرار «السابق/التالي»).
- ترقيم **عرض فقط** — كل الإحصائيات والملخصات وتصدير Excel بتتحسب على كامل البيانات زي الأول:
  - الحركات 30/صفحة · المخزون 50/صفحة (الجدول والكروت نفس الصفحة) · المشتريات 30 · المصروفات 50 · الخزنة 50 · المالية 50 · العملاء 50 · الموردين 50.
  - المبيعات والمنتجات كانوا مترقّمين server-side من قبل وهم زي ما هم.
- الرصيد "بعد الحركة" في الخزنة، وإجماليات المصروفات، وإحصائيات العملاء — **كلها دقيقة 100%** لأنها بتتحسب خارج الصفحة المعروضة.

### 🗄️ v9-3: تحويل الحسابات لـ SQL + سد الثغرات
- api/expenses: الإجماليات والتوزيع بالتصنيف اتحولوا من JS reduce داخل الـ Worker إلى aggregate + groupBy في Postgres — أسرع على الـ Worker وأخف على حد الـ CPU (10ms خطة مجانية).
  - 🎁 **إصلاح دقة خفي:** الإجماليات كانت بتتحسب على آخر 500 مصروف فقط — دلوقتي على كل صفوف الفترة المفلترة.
- api/purchase-orders: كان **بدون أي حد** لما بتستخدم فلتر تاريخ (بيسحب السجل كله بأصنافه) → سقف موحّد 1000.
- api/products: إصلاح باج الـ clamp (فوق).

### 🧭 v9-4: تنقّل أسرع + توسيع كاش الحافة
- **10 ملفات loading.tsx** جديدة (داشبورد، مخزون، تقارير، منتجات، مبيعات، مشتريات، مصروفات، خزنة، مالية، عملاء) + PageSkeleton.tsx مشترك — كل صفحة ليها skeleton بشكلها هي فور الضغطة.
- edgeCache.ts اكتمل بنمط **النسخة (version-bump)**: بدل ما نضطر نمسح آلاف مفاتيح الفاريانتس (from/to/page…)، بنخزّن رقم نسخة على الحافة نفسها — أي تعديل بيزوّد الرقم فكل النسخ القديمة بتُبطَل **فوراً**.
- الكاش اتوسع لـ 6 endpoints إضافية: المبيعات (15ث)، المصروفات (30ث)، المالية (30ث)، أوامر الشراء (30ث)، حركات المخزون (15ث)، الفروع (60ث) — مع bumps في **كل** نقاط التعديل (بيع/حذف بيع/مرتجع بيع/مصروف/هالك/تحويل/جرد/أمر شراء/مرتجع شراء/معاملة/فرع).
- الخزنة (/api/cash) **متعمد تركها بدون كاش** — بتتكتب من 6+ مصادر والرصيد لازم يكون live.

### 🗂️ v9-5: فهارس Postgres
9 فهارس جديدة على أعمدة الفلترة/التجميع الساخنة (متطابقة مع schema.prisma):

| الفهرس | بيخدم |
|---|---|
| Sale(tenantId, status, createdAt) | كل استعلامات الأرباح/التقارير (فلتر "مكتملة" + نطاق تاريخ) |
| Sale(tenantId, dueDate) | فواتير الآجل المتأخرة في الداشبورد |
| Customer(tenantId, balance) / Supplier(tenantId, balance) | إجمالي الديون/المستحقات (فهرس تغطية) |
| MaintenanceOrder(tenantId, receivedAt / deliveredAt) | تقارير الصيانة |
| Transfer / Stocktake (tenantId, createdAt) | قوائم أحدث أولاً |
| SaleItem(saleId, productId) | أفضل المنتجات / ربح الصنف |

---

## ٣) خطوات النشر (بالترتيب)

```bash
# 0) نسخة احتياطية سريعة
cp -r المشروع المشروع-backup-v8

# 1) انسخ ملفات الباتش فوق مجلد المشروع (استبدال الموجود)
#    (هيكل الملفات داخل الـ zip مطابق لهيكل المشروع)

# 2) الفهارس — اختر طريقة واحدة:
#    أ) عبر psql (الأسرع):
psql "$DIRECT_URL" -f scripts/add-indexes-v9.sql
#    ب) أو من Supabase SQL Editor: الصق محتوى scripts/add-indexes-v9.sql وشغّله
#    ج) أو عبر Prisma:
npx prisma db push
#    (السكريبت آمن للتكرار — IF NOT EXISTS)

# 3) البناء والنشر
bun install
bun run cf:build
wrangler deploy
```

> ⏱️ أول تحميل بعد الديبلوي ممكن يكون أبطأ شوية (cold start) — ده طبيعي ومش من الباتش.

---

## ٤) ملفات الباتش

**جديدة:**
```
src/components/shop/ListPager.tsx              ← مكوّن الترقيم المشترك
src/components/shop/PageSkeleton.tsx           ← skeletons مشتركة
src/app/(shop)/dashboard/loading.tsx           ← 10 ملفات loading.tsx
src/app/(shop)/inventory/loading.tsx              (dashboard · inventory · reports ·
src/app/(shop)/reports/loading.tsx                products · sales · purchases ·
src/app/(shop)/products/loading.tsx               expenses · cash · finance · customers)
src/app/(shop)/sales/loading.tsx
src/app/(shop)/purchases/loading.tsx
src/app/(shop)/expenses/loading.tsx
src/app/(shop)/cash/loading.tsx
src/app/(shop)/finance/loading.tsx
src/app/(shop)/customers/loading.tsx
scripts/add-indexes-v9.sql                     ← سكريبت الفهارس (آمن للتكرار)
scripts/seed-v9-perf.ts                        ← (اختياري - اختبار) بذر بيانات ضخمة محلياً
tools/measure-v9.mjs                           ← سكريبت قياس Playwright (اختياري)
tools/e2e-v9.mjs                               ← سكريبت E2E (اختياري)
```

**معدّلة:**
```
src/app/globals.css                            ← v9 CSS بعد كتلة v8 (v8 محفوظة)
src/lib/edgeCache.ts                           ← دوال versioned جديدة (القديمة زي ما هي)
prisma/schema.prisma                           ← الفهارس الـ 9
src/app/api/sales/route.ts                     ← كاش + bump بعد البيع
src/app/api/sales/[id]/route.ts                ← bump بعد الحذف
src/app/api/sales/returns/route.ts             ← bump بعد المرتجع
src/app/api/expenses/route.ts                  ← SQL aggregate/groupBy + كاش + bump
src/app/api/expenses/[id]/route.ts             ← bump بعد الحذف
src/app/api/finance/route.ts                   ← كاش + bump
src/app/api/finance/[id]/route.ts              ← bump بعد الإلغاء
src/app/api/purchase-orders/route.ts           ← سقف 1000 + كاش + bump
src/app/api/purchase-orders/[id]/route.ts      ← bump بعد المرتجع الكامل
src/app/api/purchase-orders/[id]/returns/route.ts ← bump بعد المرتجع الجزئي
src/app/api/inventory/movements/route.ts       ← كاش + bump (+damage يبطل كاش المصروفات)
src/app/api/inventory/transfers/route.ts       ← bump (التحويل بيسجل حركات)
src/app/api/inventory/stocktake/route.ts       ← bump (تسوية الجرد بيسجل حركات)
src/app/api/branches/route.ts                  ← كاش 60ث + bump
src/app/api/branches/[id]/route.ts             ← bump بعد التعديل/الحذف
src/app/api/products/route.ts                  ← إصلاح باج clamp المخزون
src/components/shop/{DashboardView,ProductsView,ReportsView,SalesHistoryView,CustomersView,SuppliersView,ExpensesView,CashView,FinanceView,PurchaseOrdersView}.tsx
src/components/shop/inventory/{StockTab,MovementsTab}.tsx
scripts/seed.ts                                ← إصلاح PrismaPg adapter (للتشغيل المحلي فقط)
```

---

## ٥) ملاحظات قبل ما تنشر

1. **التوافق:** كل تعديلات v7 وv8 في مكانها (الـ preventDefault في dialog/sheet/alert-dialog، كتلة @media (max-width: 639.98px) في globals.css، كاش الداشبورد/المنتجات/العملاء/الموردين/التصنيفات — نفس الإصدارات v2/v3 زي ما هي).
2. **أرقام المصروفات:** الإجمالي في هيرو المصروفات دلوقتي بيحسب **كل صفوف الفترة** بدل آخر 500 — لو المحل فيه أكتر من 500 مصروف في فترة، الرقم هيبقى **أكبر صح** من الأول.
3. **المخزون:** لو عندك أكتر من 1000 منتج، شاشة المخزون هتعرف تعرض حتى 1000 (والباقي بالفلترة/البحث). الكاشير مزيّلش: بيفضل محدود 100 لخفة الـ payload.
4. **الكاش على الحافة:** لو حسيت أي endpoint بيعرض بيانات قديمة بعد عملية — النقاط المطلوبة كلها بتتبطل فوراً بـ bumpEdgeCache، والتعبئة الاحتياطية هي الـ TTL القصير (15-60 ثانية).
5. **سكريبتات tools/** اختيارية للقياس المحلي ومش جزء من تطبيق الإنتاج.
6. **tsconfig.json + postcss.config.mjs:** الملفين دول مش موجودين في الـ zip اللي وصلني (غالباً أداة الضغط استثناتهم) ومش مضمّنين في الباتش عشان ما نغطيش نسختك المحلية — لو البناء فشل بعد النسخ لأي سبب، هما ملفات Next 16 + Tailwind 4 القياسية وابعتلي أجهزهملك.

## ٦) بعد النشر — إزاي تتأكد؟

1. افتح المخزون والمصروفات على الموبايل → افتح أي دايلوج → المفروض تحس بفرق السرعة فوراً.
2. سجّل بيع جديد → افتح سجل المبيعات → الفاتورة لازم تظهر **فوراً** (مش بعد 15 ثانية) — ده دليل إن إبطال الكاش شغال.
3. لوحة التحكم → رقم "مبيعات اليوم" لازم يتحدث فور البيع برضه.
