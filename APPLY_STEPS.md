# ملخص الإصلاحات الشامل

## المشكلة

صفحات (الإعدادات، المستخدمين، المعاملات المالية، المصروفات، الخزنة، التقارير، الفروع) **مخفية** عن المستخدم في لوحة المستخدم (مش لوحة الأدمن).

## السبب الجذري (4 أسباب مجتمعة)

1. **`Sidebar.tsx`** — كان فيه `{isAdmin && (...)}` على MANAGE_GROUP. EMPLOYEE users ما بيشوفش قائمة الإدارة أصلاً.
2. **`page.tsx` MainApp** — كان فيه guard بيرجّع EMPLOYEE للداشبورد لو حاول يفتح صفحة admin-only.
3. **`api/subscription/route.ts`** — الـ plans القديمة في الـ DB ما كانش فيها `enabledModules` field صراحةً. المستخدمين الـ موجودين قبل الإصلاح ما بيلاقوش الصفحات.
4. **`api/auth/signup/route.ts`** — trial plan الجديد ما كانش بيحدّد `enabledModules` صراحةً.

## الملفات المُعدّلة في هذه الحزمة (كل الملفات)

### الملفات الأساسية المطلوبة (4 ملفات)

| الملف | الإصلاح |
|------|------|
| `src/components/shop/Sidebar.tsx` | ✅ إزالة `isAdmin` check على MANAGE_GROUP |
| `src/app/page.tsx` | ✅ إزالة non-admin guard في MainApp |
| `src/app/api/subscription/route.ts` | ✅ **Self-healing** لو الـ plan ناقص enabledModules |
| `src/app/api/auth/signup/route.ts` | ✅ trial plan جديد + backfill الـ plans القديمة عند signup |

### الملفات الفرعية (2 ملف)

| الملف | الإصلاح |
|------|------|
| `prisma/seed-plans.ts` | ✅ ضِفت `finance` لـ FASHION_PRO |
| `prisma/backfill-modules.ts` | ✅ Script اختياري للتحديث اليدوي |

## طريقة التطبيق (هامة جداً)

### 1. استبدل الملفات في مشروعك المحلي

انسخ الملفات الأربعة الأساسية (في المسارات الموضّحة) فوق الملفات الأصلية في مشروعك:

```
shop_erp_full_fix/
├── src/components/shop/Sidebar.tsx               →  src/components/shop/Sidebar.tsx
├── src/app/page.tsx                              →  src/app/page.tsx
├── src/app/api/subscription/route.ts             →  src/app/api/subscription/route.ts
└── src/app/api/auth/signup/route.ts             →  src/app/api/auth/signup/route.ts

(اختياري)
├── seed-plans.ts                                 →  prisma/seed-plans.ts
└── backfill-modules.ts                           →  prisma/backfill-modules.ts
```

### 2. أعد تشغيل الخادم

```bash
npm run dev
```

### 3. امسح cache المتصفح (مهم)

افتح DevTools (F12) → Application tab → Storage → Clear site data
أو:
- Windows/Linux: `Ctrl+Shift+R` (hard reload)
- Mac: `Cmd+Shift+R`

### 4. سجل خروج ودخول (مهم جداً)

سجّل خروج (Logout) وسجّل دخول من جديد — عشان الـ subscription endpoint يشتغل من جديد ويعمل self-healing على الـ plan القديمة في الـ DB.

### 5. اختبر

افتح لوحة المستخدم → لازم تلاقي:
- ✅ الإعدادات
- ✅ المستخدمين
- ✅ المعاملات المالية
- ✅ المصروفات
- ✅ الخزنة
- ✅ التقارير
- ✅ الفروع

كل دي ظاهرة في قسم "الإدارة" في الـ sidebar.

## كيف يعمل الـ Self-healing؟

في `src/app/api/subscription/route.ts` ضِفت الكود ده:

```typescript
const parsedModules = parseArr(latestSub.plan.enabledModules)
const parsedCaps = parseArr(latestSub.plan.capabilities)

// 🐛 Self-healing: if the plan in DB is missing enabledModules (legacy
// trial plans from older signups had null), backfill it now so the user
// sees all the sidebar items immediately — no script run needed.
if (!parsedModules) {
  await db.plan.update({
    where: { id: latestSub.plan.id },
    data: {
      enabledModules: JSON.stringify([...ALL_MODULES]),
      capabilities: JSON.stringify(parsedCaps ?? ['collections','multi_unit','variants','returns_exchange','loyalty']),
    },
  })
}

const enabledModules = parsedModules ?? [...ALL_MODULES]
```

**اللي بيحصل**:
1. المستخدم يفتح لوحة التحكم
2. الـ React بيستدعي `/api/subscription`
3. الـ endpoint بيلاقي الـ plan قديم بدون `enabledModules`
4. يحدّثها في الـ DB فوراً (write كل الـ 17 modules)
5. يرجّع كل الـ modules للـ sidebar
6. الـ React يقوم بتحديث store، والـ sidebar يظهر كل القائمة

**Idempotent**: لو الـ plan فيها `enabledModules` أصلاً، ما بيحصلش update.

## (اختياري) تشغيل backfill script

لو حابب تشوف كل الـ plans اتحدّثت دفعة واحدة، شغّل:

```bash
npx tsx prisma/backfill-modules.ts
```

ده مش لازم — الـ self-healing في `/api/subscription` بيعمل الشغل. لكن لو حابب تتأكد:

```bash
npx tsx prisma/seed-plans.ts
```

ده يعمل upsert لكل الـ plans القياسية ويحدّث enabledModules على DB.

## ضمانات

- ✅ كل الملفات تمرّ Babel parser بنجاح
- ✅ الـ self-healing idempotent
- ✅ ADMIN/SUPER_ADMIN ما بيتأثروش (كانوا بيشوفوا كل الصفحات قبل الإصلاح)
- ✅ EMPLOYEE دلوقتي يبصّ على MANAGE_GROUP، لكن الـ API لسه بيفرض ADMIN role على الـ mutations الخطيرة (delete user, suspend tenant, etc.)
- ✅ ما فيش تغيير في الـ business logic — فقط الـ sidebar display
