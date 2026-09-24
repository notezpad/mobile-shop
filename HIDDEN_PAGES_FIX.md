# إصلاح الصفحات المخفية في لوحة المستخدم

## المشكلة

كانت بعض الصفحات (الإعدادات، المستخدمين، المعاملات المالية، المصروفات، الخزنة، التقارير، الفروع) **مخفية** عن المستخدمين العاديين (EMPLOYEE) في كل الباقات. صاحب المحل (ADMIN) كان يراها، لكن الموظفين لا.

## الأسباب الجذرية (3 مشاكل)

### 1. Sidebar: `isAdmin` check على MANAGE_GROUP
في `src/components/shop/Sidebar.tsx` كان فيه:
```tsx
{isAdmin && (
  // MANAGE_GROUP (Settings, Users, Finance, etc.)
)}
```
يعني **EMPLOYEE users ما بيقدروش يبصّوا على قائمة الإدارة أصلاً** — حتى لو الباقة بتشملها.

### 2. MainApp: guard يمنع EMPLOYEE من فتح تلك الصفحات
في `src/app/page.tsx` كان فيه:
```tsx
if (!isAdmin && ['finance','expenses','cash','reports','settings','users','branches'].includes(activeView)) {
  return <DashboardView />  // ← يرجّعه للداشبورد فوراً
}
```
حتى لو EMPLOYEE فتح URL الإعدادات يدوياً، كان يرجّعه.

### 3. FASHION_PRO seed plan ناسي يضيف `finance`
في `prisma/seed-plans.ts`:
```ts
const FASHION_PRO = [...FASHION_BASIC, 'reports','branches','users']
//                                                            ↑ مفيش finance!
```
يعني **محلات الأزياء Pro ما بيقدروش يفتحوا المعاملات المالية** حتى لو دفعوا.

### 4. Trial plan في signup route مش بيضبط `enabledModules` صراحةً
في `src/app/api/auth/signup/route.ts` كان بيعمل trial plan من غير `enabledModules` field. رغم إن الكود بيعمل fallback لـ ALL_MODULES، ده كان مزعج وممكن يكسر لو حد غير الـ fallback.

## الإصلاحات المُطبَّقة (5 ملفات)

### 1. `src/components/shop/Sidebar.tsx`
- ❌ شِلت `isAdmin` check على MANAGE_GROUP
- ❌ شِلت `const user = useShopStore((s) => s.user)` (ما عادت تستخدم)
- ❌ شِلت `const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'`
- ✅ دلوقتي MANAGE_GROUP بتظهر لكل المستخدمين، الفلترة الوحيدة على `enabledModules.includes(it.key)`

### 2. `src/app/page.tsx`
- ❌ شِلت الـ guard اللي بيرجّع EMPLOYEE لـ DashboardView لو حاول يفتح صفحة admin-only
- ❌ شِلت `isAdmin` variable declaration + from useMemo deps
- ✅ دلوقتي كل المستخدمين يقدروا يفتحوا أي صفحة في الباقة (الـ API لسه بيفرض ADMIN role على الـ mutations: create/update/delete)

### 3. `prisma/seed-plans.ts`
- ✅ ضِفت `'finance'` لـ `FASHION_PRO` list
- دلوقتي Fashion Pro users هيلاقوا المعاملات المالية في الـ sidebar

### 4. `src/app/api/auth/signup/route.ts`
- ✅ Trial plan الجديد بقى فيها `enabledModules` صريح (كل الـ 17 module) + `capabilities` كاملة
- ✅ Backfill: لو فيه trial plan قديم بدون enabledModules، يتحدّث تلقائياً عند أي signup جديد

### 5. `prisma/backfill-modules.ts` (ملف جديد)
- ✅ Script مرة واحدة لتحديث كل الـ plans القديمة في الـ DB
- ✅ Idempotent — يطابق canonical values من seed-plans.ts
- ✅ Safe — يط.skip الـ plans اللي مش معروفة (custom plans)

## خطوات التطبيق (هام)

### 1. انسخ الملفات
انسخ الملفات الـ 5 من الحزمة فوق الملفات الأصلية في مشروعك.

### 2. شغّل backfill script على الـ DB
عشان يحدّث كل الـ plans القديمة الموجودة في الـ DB (لو فيه users سجلوا قبل كده):

```bash
# محلياً
bun run tsx prisma/backfill-modules.ts
# أو
npx tsx prisma/backfill-modules.ts
# أو
npx prisma db seed  # لو عندك prisma seed config
```

أو ببساطة شغّل seed-plans.ts:
```bash
bun run tsx prisma/seed-plans.ts
```

### 3. أعد التشغيل
```bash
npm run dev
```

### 4. اختبر
- سجل دخول كـ ADMIN → هتشوف كل الصفحات في الـ sidebar (Settings, Users, Finance, Reports, Branches, etc.)
- سجل دخول كـ EMPLOYEE → هتلاقي نفس الصفحات ظاهرة (ممكن تفتحها، الـ API يفرض قيود على الـ mutations لو لزم)
- جرّب تفتح `/` كـ EMPLOYEE وروح لـ Settings — لازم تفتح صفحة الإعدادات، ما ترجعش Dashboard

## ما الذي لم يتغيّر

- ❌ API endpoints لسه بتفرض `requireAdmin()` على الـ mutations الخطيرة (delete user, suspend tenant, etc.)
- ❌ الـ sidebar RTL + collapsed mode ما اتغيّرش
- ❌ الـ trial plan price/limits ما اتغيّرش
- ❌ الباقات الأساسية ما اتأثرتش (Electronics basic + pro كان فيهم كل الموديولز أصلاً)

## ضمانات
- ✅ كل الملفات الخمسة تمرّ Babel parser بنجاح (TypeScript + JSX)
- ✅ الـ backfill script آمن — يتعامل مع custom plans بـ skip
- ✅ ما عدناش نكسر nothing — الـ ADMIN/SUPER_ADMIN لسه يقدروا يفتحوا كل الصفحات كما كانت
- ✅ EMPLOYEE users دلوقتي يقدروا يبصّوا على الإعدادات والمستخدمين والمعاملات المالية — لكن الـ API لسه بيفرض صلاحيات ADMIN على الـ actions الخطيرة
