# إصلاح V5 — إلغاء قفل الصفحات الحرجة في كل الباقات (Server + Client)

## ما الذي كان خطأً في V4

V4 حلّ مشكلة الـ sidebar (الصفحات تظهر) + مشكلة الـ MainApp guard (الصفحات تفتح). لكن لما المستخدم يفتح صفحة زي Users أو Finance، الـ **API endpoint بيرجّع 403 "الميزة دي مش متاحة في باقتك الحالية"** لأن:

- `src/app/api/users/route.ts` بيستدعي `requireModule(session, 'users')`
- `src/lib/features.ts` `requireModule()` بيشوف إن 'users' مش في `enabledModules` بتاع الـ plan
- بيرمي `FeatureError` → الـ view يفشل يجيب البيانات

**النتيجة**: الصفحة بتفتح (مش ModuleLockedView) لكن الأوامر مش بتنفذ — ما يقدرش يجيب المستخدمين أو يضيف/يعدّل.

## الإصلاح الجذري V5 — Server-level bypass

في `src/lib/features.ts` ضِفت **`CRITICAL_MODULES`** + عدّلت **`requireModule()`** عشان تـ bypass الصفحات الحرجة:

```typescript
export const CRITICAL_MODULES = [
  'settings', 'users', 'finance', 'expenses', 'cash', 'reports',
] as const

export function isCriticalModule(key: string): boolean {
  return (CRITICAL_MODULES as readonly string[]).includes(key)
}

export async function requireModule(session, moduleKey) {
  if (session.role === 'SUPER_ADMIN') return
  // 🛡️ Critical modules bypass the plan check — always allowed
  if (isCriticalModule(moduleKey)) return
  const modules = await getTenantModules(session.tenantId)
  if (!modules.includes(moduleKey)) {
    throw new FeatureError('الميزة دي مش متاحة في باقتك الحالية', 403)
  }
}
```

**كده**: كل الـ API endpoints اللي بتستخدم `requireModule(session, 'users')` أو `'finance'` أو `'expenses'` أو `'cash'` أو `'reports'` هتشتغل عادي حتى لو الـ plan ما بيشملهاش.

كمان `getPlanContext()` (اللي بيقرأ الـ plan من الـ DB) دلوقتي بيرجّع enabledModules فيها الـ CRITICAL_MODULES دائماً:

```typescript
const parsedModules = safeParseArray(plan?.enabledModules)
const modules = new Set<string>(parsedModules ?? [...ALL_MODULES])
for (const m of CRITICAL_MODULES) modules.add(m)
return { enabledModules: Array.from(modules), ... }
```

## الـ 6 صفحات الحرجة المفتوحة في كل الباقات

| الصفحة | module key | تأثير الإصلاح |
|------|------|------|
| الإعدادات | `settings` | تفتح + تنفذ أوامر (تحديث بيانات المحل) |
| المستخدمين | `users` | تفتح + تنفذ أوامر (إضافة/تعديل/حذف مستخدم) |
| المعاملات المالية | `finance` | تفتح + تنفذ أوامر (سجل + إضافة معاملة) |
| المصروفات | `expenses` | تفتح + تنفذ أوامر (تسجيل + حذف مصروف) |
| الخزنة | `cash` | تفتح + تنفذ أوامر (حركة يدوية) |
| التقارير | `reports` | تفتح + تنفذ أوامر (عرض التقارير) |

## ما الذي **لم** يتأثر (الـ plans لسه بتفرّق)

| الميزة | التحقق | تأثير |
|------|------|------|
| الصيانة | `requireModule(s, 'maintenance')` | ❌ بتتقفل لو الباقة ما بيشملهاش (مثلاً Fashion Basic) |
| الفروع | `requireModule(s, 'branches')` | ❌ بتتقفل لو الباقة ما بيشملهاش |
| المشتريات | `requireModule(s, 'purchases')` | ❌ بتتقفل لو الباقة ما بيشملهاش |
| الموردين | `requireModule(s, 'suppliers')` | ❌ بتتقفل لو الباقة ما بيشملهاش |
| المخزون | `requireModule(s, 'inventory')` | ❌ بتتقفل لو الباقة ما بيشملهاش |
| بيع بالجملة | `requireCapability(s, 'multi_unit')` | ❌ بيتقفل لو الـ capability مش في الباقة |
| ألوان ومقاسات | `requireCapability(s, 'variants')` | ❌ بيتقفل لو الـ capability مش في الباقة |
| خصم كوليكشن | `requireCapability(s, 'collections')` | ❌ بيتقفل لو الـ capability مش في الباقة |

**يعني الـ plans لسه بتفرّق بين الباقات في الحدود (maxUsers, maxProducts, maxBranches) و في الـ capabilities (multi_unit, variants, collections)** — لكن مش في الصفحات الأساسية (settings, users, finance, expenses, cash, reports).

## الملفات المطلوبة (7 ملفات)

| الملف | التغيير |
|------|------|
| **`src/lib/features.ts`** ⭐ **V5 جديد** | `CRITICAL_MODULES` + `isCriticalModule()` + `requireModule()` bypass + `getPlanContext()` force-include |
| `src/app/api/subscription/route.ts` ⭐ V5 | استخدم `getPlanContext` بدل الـ logic المكرّر |
| `src/app/page.tsx` ✅ (نفسه من V4) | MainApp guard يسمح بالصفحات الحرجة |
| `src/components/shop/Sidebar.tsx` ✅ (نفسه من V4) | defence in depth على الـ CRITICAL_MODULES |
| `src/app/api/auth/signup/route.ts` ✅ (نفسه من V1) | trial plan صريح |
| `prisma/seed-plans.ts` ✅ (نفسه من V4) | FASHION_BASIC include critical modules |
| `prisma/backfill-modules.ts` ✅ (نفسه من V1) | script اختياري |

## خطوات التطبيق (مهم جداً)

### 1. انسخ الـ 7 ملفات فوق الملفات الأصلية في مشروعك

```
shop_erp_critical_fix_v5/
├── src/lib/features.ts                              →  src/lib/features.ts        ⭐ أهم ملف
├── src/app/page.tsx                                 →  src/app/page.tsx
├── src/app/api/subscription/route.ts                 →  src/app/api/subscription/route.ts
├── src/app/api/auth/signup/route.ts                 →  src/app/api/auth/signup/route.ts
├── src/components/shop/Sidebar.tsx                  →  src/components/shop/Sidebar.tsx
├── prisma/seed-plans.ts                              →  prisma/seed-plans.ts
└── prisma/backfill-modules.ts                       →  prisma/backfill-modules.ts
```

### 2. (مهم) شغّل الـ seed
```bash
npx tsx prisma/seed-plans.ts
```

### 3. أعد التشغيل + امسح الـ cache
```bash
npm run dev
# F12 → Application → Storage → Clear site data
# Ctrl+Shift+R
```

### 4. سجّل خروج ودخول

### 5. اختبر — لازم الصفحات دي تفتح **وتنفذ الأوامر**:
- ✅ Settings: يقدر يحدّث بيانات المحل + يرفع شعار
- ✅ Users: يقدر يضيف/يعدّل/يحذف/يفعّل مستخدم
- ✅ Finance: يقدر يضيف معاملة + يشوف السجل
- ✅ Expenses: يقدر يسجّل مصروف + يحذف
- ✅ Cash: يقدر يعمل حركة يدوية + يشوف الرصيد
- ✅ Reports: يقدر يشوف التقارير + يصدّر PDF

كل ده في كل الباقات (trial / electronics-basic / electronics-pro / fashion-basic / fashion-pro).

## ليه V5 أكيد شغال

في V1-V4 كنت بفكّر إن المشكلة بس في الـ sidebar + الـ MainApp guard (client-side). لكن المشكلة الحقيقية كانت في **server-side**: الـ `requireModule` في `features.ts` كان بيرفض الـ API requests للصفحات دي.

V5 بيصلّح المشكلة من الجذع:
- **API layer** (`features.ts`): `requireModule` بيتخطى الصفحات الحرجة → الـ endpoints تشتغل
- **Subscription API** (`subscription/route.ts`): بيرجّع `enabledModules` فيها الصفحات دي دائماً → الـ store يحدّث
- **Sidebar** (`Sidebar.tsx`): بيتخطى الـ filter على الصفحات دي → بتظهر في القائمة
- **MainApp** (`page.tsx`): بيتخطى الـ guard على الصفحات دي → بتفتح عادي
- **DB** (`seed-plans.ts`): الـ plans الجديدة بيشمل الصفحات دي → لو حد سجّل جديد، يفتحها

4 طبقات حماية 🛡️

## ضمانات

- ✅ كل الملفات تمرّ Babel parser بنجاح
- ✅ الـ 6 صفحات الحرجة تفتح وتنفذ الأوامر في كل الباقات
- ✅ الصفحات التانية (maintenance, branches, purchases, suppliers, inventory) لسه بتيجي على حسب الباقة
- ✅ الـ capabilities (multi_unit, variants, collections) لسه بتيجي على حسب الباقة
- ✅ ADMIN/SUPER_ADMIN ما بيتأثروش
- ✅ الـ ModuleLockedView لسه تظهر لو حد فتح صفحة مقفولة فعلاً (زي branches لو الباقة ما بيشملهاش)

الحزمة: `/home/z/my-project/download/shop_erp_critical_fix_v5.zip`
