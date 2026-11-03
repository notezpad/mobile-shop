# 🛡️ إصلاحات قفزات التخطيط (Layout-Shift) — 2026-11-03

## بلاغ المستخدم

> «بعض العناصر في الداشبورد (/dashboard) وصفحة الخزنة (/cash) وأماكن تانية بتقفز (layout-shift) عند النزول والصعود بالسكرول.»

---

## الأسباب الجذرية والإصلاحات

### 1) كارت «عمولتي» في الداشبورد — ظهور مفاجئ (pop-in) يدفع الصفحة لتحت

- **الملف:** `src/components/shop/MyCommissionCard.tsx` (كان سطرًا 62 تقريبًا)
- **السبب الجذري:** المكوّن كان يعمل `if (loading) return null` — أي أن الكارت يشغل 0px لحظة الرسم، وعند وصول رد `/api/commissions/my` يظهر فجأة ويدفع كل محتوى الداشبورد أسفله للأسفل (قفزة كاملة).
- **الإصلاح:** لم نعد نُرجع `null` أثناء التحميل إطلاقًا. نُرسم دائمًا الحاوية الخارجية بنفس التصميم (نفس كلاسات `PANEL` والتدرج)، وبداخلها **Skeletons** (من `@/components/ui/skeleton`) في أماكن العنوان/القيمة/مقياس التارجت — بحيث يبقى الارتفاع متقاربًا جدًا بين حالتي التحميل والبيانات، والانتقال يصبح تبديل نص داخل مكان محجوز بلا أي إزاحة.
- **ملاحظة:** بقاء سلوك «الاختفاء تمامًا لو الميزة مقفولة أو المستخدم مش بائع» (`!data || !data.enabled || !data.isSeller → null`) كما هو — هذا مقصود وليس جزءًا من المشكلة.

### 2) بانر «تنبيه عجز في الورديات» في الخزنة — ظهور/اختفاء مفاجئ يزحلق التبويبات والدفتر

- **الملف:** `src/components/shop/CashView.tsx` (داخل كارت الهيرو، أول خلية في الجريد — كان سطرًا 282-292)
- **السبب الجذري:** الزر كان يُرسم شرطيًا `{shiftSummary.shortCount > 0 && <button/>}` — عند تغيّر العدد يظهر/يختفي دفعة واحدة دافعًا التبويبات ودفتر الخزنة تحته للأعلى/الأسفل.
- **الإصلاح:** تغليف الزر بغلاف توسيع/طيّ ناعم بحركة CSS Grid (بلا أي قفزة):

```tsx
<div
  className={cn(
    'grid transition-[grid-template-rows] duration-300 ease-out',
    shiftSummary.shortCount > 0 ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
  )}
>
  <div className="min-h-0 overflow-hidden">
    {shiftSummary.shortCount > 0 && ( /* نفس الزر السابق دون تغيير */ )}
  </div>
</div>
```

عند الإغلاق يشغل ارتفاع 0، وعند الفتح يتمدد بحركة 300ms سلسة.

### 3) انهيار المحتوى إلى Skeletons عند التحديث الخلفي — القفزة العنيفة في القوائم

- **الملفات:**
  - `src/components/shop/SalesHistoryView.tsx` (كان: `setLoading(true)` بسطر 193، بوابة Skeleton بسطر 684، `useDataRefresh(['sales'], …)` بسطر 218)
  - `src/components/shop/InventoryView.tsx` (كان: `setLoading(true)` بسطر 124، بوابة Skeleton بسطر 556، `useDataRefresh(['inventory','products','branches'], load)` بسطر 159)
  - `src/components/shop/PurchaseOrdersView.tsx` (كان: `setLoading(true)` بسطر 238، بوابة Skeleton بسطر 825، `useDataRefresh(['purchase-orders'], …)` بسطر 257)
- **السبب الجذري:** الثلاثة كانوا يعملون `setLoading(true)` **بلا شرط** في كل تحميل — بما فيه التحديثات الخلفية التي يطلقها `useDataRefresh` بعد أي كتابة في أي مكان بالتطبيق (بيع جديد، تعديل منتج… إلخ). والعرض كان `{loading ? <Skeletons/> : <القايمة/>}` — فتنهار القايمة المُسكرول عليها إلى هياكل عظمية ثم تُبنى مجددًا = قفزة عنيفة وفقدان مكان القراءة.
- **الإصلاح (على نمط الريبو القائم في `FinanceView.tsx` سطر 385 و`ProductsView.tsx` سطر 314):**

```tsx
const loadedOnceRef = React.useRef(false)

const load = React.useCallback(async (...) => {
  if (!loadedOnceRef.current) setLoading(true)   // السكيليتون لأول تحميل فقط
  try {
    /* ... نفس جلب البيانات دون أي تغيير ... */
  } finally {
    loadedOnceRef.current = true                  // نجح أو فشل — لا رجوع للسكيليتون
    setLoading(false)
  }
}, [])
```

وتغيير بوابة العرض إلى:

```tsx
{!loadedOnceRef.current && loading ? (<Skeletons/>) : (<القايمة/>)}
```

- التحديثات الخلفية وتغيير الفلاتر/الترقيم أصبح يحافظ على المحتوى القديم مكانه (المؤشرات الخفيفة مثل «جارٍ التحميل…» في الرأس بقيت تعمل كما هي). سلوك الفلترة والترقيم لم يُمس إطلاقًا.

### 4) صفحة التقارير — `content-visibility` يسبب قفزات عند السكرول

- **الملف:** `src/components/shop/ReportsView.tsx` (مكوّن `Chapter` — كان سطرًا 1063)
- **السبب الجذري:** كلاس `.cv-heavy` (معرّف في `globals.css`: `content-visibility:auto` + `contain-intrinsic-size:auto 720px`) يجعل الأقسام خارج الشاشة تُقدَّر بارتفاع 720px. عند الاقتراب منها بالسكرول يُستبدل التقدير بالارتفاع الحقيقي (من 400 إلى 2500px) فيقفز كل المحتوى أسفلها — نزولًا وصعودًا.
- **الإصلاح:** إزالة `cv-heavy` فقط من كلاسات القسم (`<section id={id} className="animate-in-up scroll-mt-24 space-y-4">`) مع إبقاء بقية الكلاسات، وترك قاعدة CSS في `globals.css` كما هي (معلّقة على أنها للاستخدام المستقبلي فقط مع أقسام ارتفاعها المقاس مضبوط)، وإضافة تعليق عربي يوضح السبب فوق القسم.

### 5) قفزة العرض الأفقي في الديسكتوب — ظهور/اختفاء السكرولبار

- **الملف:** `src/app/(shop)/layout.tsx` (حاوية السكرول — كان سطرًا 425)
- **السبب الجذري:** عندما يتغير ارتفاع الصفحة (تحميل بيانات، ظهور كارت…) يظهر/يختفي السكرولبار العمودي، وفي الأنظمة ذات السكرولبار الكلاسيكي يتغير عرض المحتوى ~15px فجأة = إزاحة أفقية لكل العناصر.
- **الإصلاح:** إضافة `style={{ scrollbarGutter: 'stable' }}` على عنصر السكرول الفعلي نفسه (مع بقاء كل الكلاسات كما هي). Tailwind v4 لا يوفر utility لهذه الخاصية.

---

## الفاحص الجديد: `npm run check:layout`

سكربت `scripts/check-layout-shift.mjs` (Node ESM بدون أي اعتماديات) يفحص كل ملفات `src/‏` (.ts/.tsx) ويطبع `file:line` مع وصف عربي:

| الرمز | النمط | القرار |
|---|---|---|
| P1 | `if (loading) return null` / `if (isLoading) return null` | ⚠️ تحذير فقط (بعضها مشروع مثل بوابات الصلاحيات؛ ملفات `src/app/api` مستثناة) |
| P2/P4 | بوابة `{loading ?` أو `{isLoading ?` عليها `<Skeleton` قريب **بدون** أي حارس (`loadedOnce/hasLoaded/firstLoad/refreshing/silent/!data`) | ❌ فشل |
| P3 | استخدام كلاس `cv-heavy` في أي `.tsx` (خارج التعليقات) | ❌ فشل |

- استثناء: بوابات Skeleton داخل Dialogs (Portal) تُطبع كتحذير لا فشل.
- التشغيل: `npm run check:layout` — أو على مجلد آخر: `node scripts/check-layout-shift.mjs <dir>`.
- خروج 0 = سليم، خروج 1 = توجد مخالفات لازم تتصلح قبل الدمج.

---

## 📏 قواعد للمطورين المستقبلًا (تمنع رجوع الباج)

1. **لا تستبدل أبدًا محتوى محمّل بسكيليتون في التحديثات الخلفية.** أي `load()` جديدة: `if (!loadedOnceRef.current) setLoading(true)` + في `finally` ضع `loadedOnceRef.current = true` — والبوابة `{!loadedOnceRef.current && loading ? <Skeleton/> : <المحتوى/>}`. المحتوى القديم يبقى مكانه حتى وصول الجديد.
2. **لا تُرجع `null` أثناء التحميل لكارت أعلى الصفحة.** احجز مكانه دائمًا بسكيليتون بنفس تصميم الكارت، حتى لو الكارت ممكن يختفي بعد التحميل (قفل ميزة/صلاحية) — القرار وقتها يتم بعد انتهاء التحميل.
3. **لا تستخدم `content-visibility:auto` (cv-heavy) على أقسام صفحة قابلة للسكرول إلا إذا كان `contain-intrinsic-size` مطابقًا للارتفاع الحقيقي المقيس.** غير كده هتحصل على قفزات نزول/صعود.
4. **أضف `scrollbar-gutter: stable` على حاوية السكرول الحقيقية** (`src/app/(shop)/layout.tsx` حاليًا) — ظهور/اختفاء السكرولبار بيغيّر عرض المحتوى ~15px.
5. **الظهور/الاختفاء الشرطي لعناصر داخل تدفق الصفحة** (بانرات، تنبيهات) — استخدم حركة توسيع/طيّ (مثل `grid-rows-[0fr]→[1fr]`) بدل `&&` المجردة.
6. قبل أي دمج: شغّل `npm run check:layout` (ويمكن إضافتها لاحقًا في CI مع `npx tsc --noEmit`).

---

## التحقق

- `npx tsc --noEmit` → نجاح (0 أخطاء).
- `npm run check:layout` → ✅ سليم (0 مخالفات؛ تحذيرات معلومة عن أنماط مشروعة/داخل Dialogs).
- `npm run build` (`prisma generate && next build`) → نجاح.

---

## تحديث 2 — قفزات التمرير على الكمبيوتر (hover-lift) — 2026-11-03

### بلاغ المستخدم (متابعة)

> «لسه فيه قفزات على الكمبيوتر أثناء السكرول بالعجلة — الكروت والأرقام والصفوف بتتحرك قدام عيني مع كل لفة عجلة.»

### السبب الجذري

المستخدم كان يسكول بالعجلة والمؤشر ثابت في مكانه على الشاشة. مع نزول الصفحة، المؤشر بيعدي فوق الكروت/الأزرار/الصفوف واحد ورا التاني، وده بيشغّل تأثيرات `hover:` اللي بتغير مكان العنصر:

- `hover:-translate-y-*` و `hover:translate-y-[Npx]` (رفع الكارت/الزر كام بكسل)
- `group-hover:scale-*` و `group-hover:rotate-*` (تكبير/دوران الأيقونات والزخارف)

كل عنصر بيعدي عليه المؤشر بيتحرك كام بكسل ويرجع — فعلى مستوى الصفحة كلها ده بيبان كأن **المحتوى نفسه بيقفز** مع كل لفة عجلة. الأثر كان واضح في: كروت KPI الداشبورد، بلاطات الخزنة (ShiftClosuresCard)، صفوف المبيعات، كروت العملاء/الموردين/العمولات/الموظفين/المخزون، وكل شاشات HR.

### الإصلاح

1. **إزالة كل حركات hover** (`hover:`/`group-hover:` + `translate/scale/rotate`) من عناصر الصفحات — في ~30 ملف تحت `src/` (شاشات المحل + HR + كروت الداشبورد + السايدبار + الشاشات المشتركة، وكمان شاشات الأدمن/اللاندينج/لوغين عشان الفاحص يغطي `src/` كلها).
2. **التغذية الراجعة بقت بالظل/اللون فقط:** أُبقيت `hover:bg-*` / `hover:text-*` / `hover:border-*` / `hover:opacity-*` / `group-hover:opacity-*`، وتعميق الظل (`hover:shadow-md` وأخف) أو استبدال ظل الزر ثلاثي الأبعاد `shadow-[0_Npx_0_color]` → `hover:shadow-[0_2px_0_color]` — دي بتدي إحساس الضغط من غير أي حركة.
3. **الإصلاح (حماية السلوك):** حالات `active:translate-y-*` / `active:scale-*` (ضغطة المستخدم الفعلية) و`focus-visible:ring-*` وحالات `disabled:` أُبقيت كما هي.
4. **كروت تفقدت كل تغذية راجعة بعد إزالة الحركة** اتضاف ليها `hover:shadow-md` بسيط.
5. **تنظيف:** أزيلت الكلاسات الميتة اللي كانت بتتصرف حركات hover المزالة: `disabled:hover:translate-y-0` / `motion-reduce:hover:translate-y-0`، و`transition-transform` اللي مبقاش له لازمة، و`transition-[...transform]` بقت `transition-[border-color,box-shadow]` / `transition-[filter]`.
6. **بونص — كارت «عمولات البائعين» في الإعدادات (`SellerCommissionsCard.tsx`):** كان يعمل `if (loading) return null` فيقفز المحتوى عند ظهوره. بقى يرسم حاوية الكارت دايمًا مع Skeletons أثناء التحميل (على نفس نمط `MyCommissionCard.tsx`).

### الفاحص — قاعدة جديدة P5

`scripts/check-layout-shift.mjs` اتضاف له **P5**: يفحص أي `.tsx` تحت `src/` بحثًا عن أي كلاس مطابق:

```
/(?:[\w-]+:)*hover:[-]?(?:translate|scale|rotate)[^\s"'`}]+/  أو  /group-hover:[-]?(?:translate|scale|rotate)/
```

- أي تطابق = طباعة `file:line` مع رسالة عربية و**فشل (exit 1)**.
- حالات `active:translate-y` / `focus-visible:` / `motion-reduce:animate-none` / `disabled:translate-y-0` **مش بتتحسب** — الـ regex بيطلب بادئة `hover:` صريحة.
- اتعمل اختبار على fixture في `/tmp` (خارج `src/`): الملفات المخالفة اتشالت واتطبع الـ P5 صح، والملف النظيف عدّى بخروج 0.

### 📏 قاعدة للمطورين (مهمة)

> **«ممنوع إضافة hover:translate/scale/rotate على عناصر الصفحات — استخدم ظل/لون فقط.»**

لما تحب تدي إحساس تفاعل عند المرور بالماوس: `hover:shadow-md` / `hover:bg-*` / `hover:border-*` / `hover:text-*`. حركة العنصر نفسه (translate/scale/rotate) مسموحة **فقط** على `active:` (ضغط فعلي) أو `focus-visible:`، أو خارج تدفق سكرول الصفحة (Dialog/Portal).

### التحقق (التحديث 2)

- `npx tsc --noEmit` → 0 أخطاء.
- `npm run check:layout` → ✅ سليم (0 مخالفات، بمن فيهم P5 الجديد).
- `npm run build` → نجاح.
- `grep -rEn "(group-)?hover:[-]?(translate|scale|rotate)" src/ --include="*.tsx"` → فاضي تمامًا.
