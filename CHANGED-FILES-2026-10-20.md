# الشغل اللي اتعمل — جلسة 2026-10-20 (الأسلوب الأوتوماتيك في كل النظام)

الطلب: «هل في مشكل مثل هذه اخري — اتحسين تجربة المستخدم بنفس الاسلوب الاوتوماتيك»
يعني: أي تنقل بين الشاشات لازم يكون **قفزة + الشاشة الهدف مفتوحة/مفلترة على المطلوب من غير ضغطة زيادة**.

## المنهجية
1. مسح شامل بوكيل استكشاف على كل شاشات الـ shop (33 نتيجة مصنفة: أزرار ميتة / تنقّل بدون سياق / إشعارات مضللة).
2. إصلاح 15 ملف بنفس النمط المرجعي الموجود (sessionStorage handoff + router.push + قارئ باراميترات يقرأ مرة واحدة وينضف الـ URL).
3. اختبار حقيقي: 84/84 فحص API على Postgres فاضية من الصفر + E2E بمتصفح فعلي على 8 مسارات.

## الإصلاحات بالملفات

### 1) قوارئ السياق الجديدة (صفحات بقت تفتح على المطلوب)
- `src/components/shop/ProductsView.tsx` — بقرأ `?search=` (بحث جاهز) و `?stock=low` (فلتر النواقص) بنفس نمط `?new=1` القديم.
- `src/components/shop/SalesHistoryView.tsx` — بقرأ `?open={id}` (يفتح الفاتورة لما الداتا توصل أو يرشدك لو مش موجودة) + `?late=1` (فلتر المتأخرة + توست) + `?q=`.
- `src/components/shop/MaintenanceView.tsx` — بقرأ `?new=1` → يفتح «استلام جهاز» على طول.
- `src/components/shop/CustomersView.tsx` — بقرأ `?status=debt` → فلتر «عليهم آجل» + توست.
- `src/components/shop/inventory/MovementsTab.tsx` — بقرأ `?review=1` (فلتر «تحتاج مراجعة») + `?q=`.

### 2) الداشبورد — كل عنصر بقى له مقصد
- `src/components/shop/DashboardView.tsx`:
  - صفوف «مخزون منخفض» بقت قابلة للضغط → أمر شراء جديد مفتوح والصنف في السلة (نفس هاند-أوف المخزون).
  - كارت/كروت «تنبيهات المخزون» → `/products?stock=low` بدل `/inventory` السادة.
  - بانر «فواتير متأخرة»: كل صف بيفتح فاتورته في سجل المبيعات، و«عرض الكل» → `/sales?late=1`.
  - صفوف «آخر المبيعات» بقت تفتح الفاتورة مباشرة.
  - «المركز المالي»: «ديون العملاء» → `/customers?status=debt`، «مستحق الموردين» → `/suppliers`، «رصيد الخزنة» (موبايل) → `/cash`.
  - «إضافة أمر صيانة جديد» → `/maintenance?new=1`.

### 3) الإشعارات — سياق حقيقي وبدون ريلود
- `src/lib/notifications.ts`: إشعار low_stock بقى لينكه `/products?search={اسم المنتج}` (كان `/products` السادة)، وإشعار سلامة المخزون → `/inventory/movements?review=1` (كان `/inventory` اللي مافيهاش الفحص أصلاً).
- `src/components/shop/NotificationBell.tsx`:
  - اللينكات الداخلية بقت `router.push` بدل `window.location.assign` (كان بيعمل ريلود كامل).
  - نوع `stock_integrity` بقى له أيقونة/بادج «سلامة المخزون» بدل أيقونة معلومة عامة.
  - نص الفوتر المصحّح: «كل 10 دقايق» (كان «كل 30 ثانية» والمعلومة كاذبة — الفعلي 600000ms).

### 4) نقطة البيع — التوستات بقت فيها أفعال
- `src/components/shop/POSView.tsx`:
  - باركود/اسم مجهول → التوست فيه زر «أضف منتج» بيفتح نافذة الإضافة معبّية بالباركود/الاسم المكتوب (كان توست يسكت).
  - كمية غير متوفرة → زر «اعمل أمر شراء» بيوديك للمشتريات والصنف في السلة.
  - «أضف منتجاً جديداً» في النتايج الفاضية بتبعت اسم البحث كـ seed.
- `src/components/shop/PurchaseOrderDialog.tsx`: بانر «منتجات لسه ملهاش أمر شراء» بقى يعرض أسماء المنتجات (أول 3) + توست تأكيد بالعدد بعد «ضيف الكل».

### 5) مسارات ميتة رجعت للحياة + نصوص
- `src/components/shop/inventory/StockPage.tsx` + `IntegrityPanel.tsx`: زر «فحص سلامة المخزون» كان محبوس في مكوّن قديم مش مركّب على أي راوت — رجع في هيدر صفحة المخزون، ورسالة «حركات تحتاج مراجعة» بقت زر بيوديك للفلتر جاهز.
- `src/components/shop/inventory/StockTab.tsx`: الحالة الفاضية بقت فيها زر «مسح الفلاتر» (كانت نص بس).
- `src/components/shop/SettingsView.tsx`: توست «إنت already على الباقة دي» (كلمة روسية ظهرت في التوست) اتصححت لـ «إنت بالفعل على الباقة دي».

### 6) إعدادات
- `eslint.config.mjs` — نسخة GitHub كانت ناقصة القرار الموثق من جلسة الـ 127 خطأ: `react-hooks/set-state-in-effect: "warn"` (بيعلّق على 114 تحذير معروفة، 0 أخطاء). رجّعناه زي ما هو في الحزمة v3 المختبرة.

## الاختبار اللي اتعمل فعلاً
- **84/84 فحص API** (`scripts/erp-selftest.mjs`) على Postgres حقيقي مدمج — داتابيز فاضية من الصفر (مشتركة: الشراء بالمقاسات 364 قطعة، البيع، حذف الفاتورة، المرتجع، الاستبدال بالمقاسات، الصلاحيات...). ملاحظة: لازم باقة fashion-pro تكون موجودة في الداتابيز (الاختبار بيسجل بيها) — نضفناها يدوياً في بيئة الاختبار.
- **E2E بمتصفح فعلي (Chromium)** على النظام شغال بـ Postgres:
  1. كليك صف «قميص UX ناقص» في الداشبورد → `/purchases` + «أمر شراء جديد» مفتوح + الصنف في السلة ✓
  2. كليك فاتورة متأخرة في البانر → `/sales` + البحث متعبّي INV-2026-00001 + الفاتورة مفتوحة (aria-pressed) ✓
  3. «ديون العملاء» في المركز المالي → `/customers` مفلتة «عليهم آجل» + زر «سدد الآن» بيفتح «تسجيل دفعة عميل» بالعميل ✓
  4. `/products?stock=low` → فلتر «منخفض فقط» مفعّل + الرابط اتنضف ✓
  5. `/maintenance?new=1` → نافذة «استلام جهاز» مفتوحة لوحدها ✓
  6. كليك إشعار المخزون → تنقّل فوري (بدون ريلود) → `/products` والبحث متعبّي باسم المنتج ✓
  7. بحث POS باسم مجهول → توست فيه زر «أضف منتج» ✓ (والتوصيل: seed name+barcode → ProductDialog — متحقق منه في الكود)
  8. `/inventory` → زر «فحص سلامة المخزون» ظاهر جنب «تصدير Excel» ✓
- `tsc --noEmit` نضيف + `eslint` 0 أخطاء (114 تحذير موثقة) + `next build` ناجح.

## ملاحظات نشر
1. مفيش migrations ولا تغييرات داتابيز في الجلسة دي — كلها client-side + ملف notifications.ts سيرفر (لينكات إشعارات جديدة فقط؛ الإشعارات القديمة المحفوظة بتفضل بلينكاتها القديمة وده مقبول).
2. deploy عادي (استبدال الكود + build). الـ Service Worker ممكن يخدم باندل قديم — امسح الكاش/اعمل unregister لو حسيت بسلوك قديم.
3. **تحذير مطوّر مهم**: ملف `.env` في المستودع فيه `DATABASE_URL`/`DIRECT_URL` الإنتاجية + `JWT_SECRET`. سطر الأوامر بتاع Prisma بيقرأ `.env` وبيتجاهل الـ shell env في بعض الحالات — لو هتشغّل prisma CLI على داتابيز تانية، انقل `.env` جانباً مؤقتاً أو مرّر `DATABASE_URL` + `DIRECT_URL` مع بعض وتأكد من `SELECT current_database()`.

## الملفات المتغيرة (15)
```
eslint.config.mjs
src/components/shop/CustomersView.tsx
src/components/shop/DashboardView.tsx
src/components/shop/MaintenanceView.tsx
src/components/shop/NotificationBell.tsx
src/components/shop/POSView.tsx
src/components/shop/ProductsView.tsx
src/components/shop/PurchaseOrderDialog.tsx
src/components/shop/SalesHistoryView.tsx
src/components/shop/SettingsView.tsx
src/components/shop/inventory/IntegrityPanel.tsx
src/components/shop/inventory/MovementsTab.tsx
src/components/shop/inventory/StockPage.tsx
src/components/shop/inventory/StockTab.tsx
src/lib/notifications.ts
```
ملفات اختبار مساعدة جديدة (اختيارية في النشر): `scripts/erp-selftest.mjs`، `scripts/apply-sql.cjs`، `scripts/boot-pg.mjs`، `scripts/ux-e2e-seed.cjs`، `scripts/ux-e2e-seed2.cjs`
