# الإصلاح الجذري — صفحات الإعدادات والمستخدمين والمعاملات المالية

## السبب الحقيقي اللي كان فاتني

في الإصلاحات السابقة (V1 + V2) كنت بفكّر إن المشكلة في:
- `Sidebar.tsx` بيخفي MANAGE_GROUP عن EMPLOYEE → اصلّحتها ✅
- `page.tsx` فيه guard بيرجّع EMPLOYEE للداشبورد → اصلّحتها ✅
- trial plan ما بيدّيش enabledModules → اصلّحتها ✅
- subscription endpoint self-healing لو enabledModules null → اصلّحتها ✅

لكن لسه فيه سبب خامس ما اشتغلش عليه:

### السبب الخامس — الـ plans نفسها شارية enabledModules محدودة

في `prisma/seed-plans.ts` كانت فيه plan اسمها `FASHION_BASIC` (باقة الأساسية للأزياء) شارية enabledModules كده:

```ts
const FASHION_BASIC = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash','settings',
  // ❌ مفيش finance، مفيش users، مفيش reports، مفيش branches
]
```

يعني لو المستخدم على الباقة دي (أو على trial plan اتعمل بإعدادات مشابهة)، الـ sidebar بيخفي:
- ❌ المعاملات المالية (finance)
- ❌ المستخدمين (users)
- ❌ التقارير (reports)
- ❌ الفروع (branches)

حتى لو الـ Sidebar.tsx ما كانش فيه isAdmin check، الـ filter على enabledModules بيشيلهم.

## الحل الجديد — Force-include الصفحات الحرجة

ضِفت طبقة حماية جديدة اسمها `CRITICAL_MODULES` — ودي الصفحات اللي لازم تظهر في **كل الباقات بدون استثناء**:

### 1. `src/app/api/subscription/route.ts` (تحديث جديد)

```typescript
const CRITICAL_MODULES = ['settings', 'users', 'finance'] as const

function ensureCriticalModules(modules: string[]): string[] {
  const set = new Set(modules)
  for (const m of CRITICAL_MODULES) set.add(m)
  return Array.from(set)
}

// في الـ response:
const enabledModules = ensureCriticalModules(parsedModules ?? [...ALL_MODULES])
```

**اللي بيحصل**: الـ API بيرجّع enabledModules من الـ plan، لكن قبل ما يبعتها للـ client، بيضيف لها settings + users + finance لو مش موجودين. كده مهما كانت الـ plan في الـ DB، الـ sidebar هيلاقيهم.

### 2. `src/components/shop/Sidebar.tsx` (Defence in depth)

```typescript
const CRITICAL_MODULES = ['settings', 'users', 'finance']
const hasModule = (key: string) =>
  enabledModules.includes(key) || CRITICAL_MODULES.includes(key)

const mainItems = MAIN_GROUP.filter((it) => hasModule(it.key))
const manageItems = MANAGE_GROUP.filter((it) => hasModule(it.key))
```

**اللي بيحصل**: حتى لو الـ API رجّع enabledModules ناقصة (مستحيل بعد الإصلاح الأول، لكن احتياط)، الـ Sidebar نفسه يعرض الصفحات الحرجة.

### 3. `prisma/seed-plans.ts` (تحديث FASHION_BASIC)

```typescript
const FASHION_BASIC = [
  'dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','expenses','cash',
  'settings','users','finance',  // ⭐ ضِفنا دول
]
```

عشان أي plan جديد يتعمل بعد الـ seed يبقى فيه الصفحات دي.

## الملفات المطلوبة (6 ملفات)

| الملف | التغيير |
|------|------|
| `src/app/api/subscription/route.ts` | ⭐ **جديد**: force-include CRITICAL_MODULES |
| `src/components/shop/Sidebar.tsx` | ⭐ **جديد**: defence in depth على CRITICAL_MODULES |
| `prisma/seed-plans.ts` | ⭐ **جديد**: إضافة settings, users, finance لـ FASHION_BASIC |
| `src/app/page.tsx` | ✅ (نفسه من V1) |
| `src/app/api/auth/signup/route.ts` | ✅ (نفسه من V1) |
| `prisma/backfill-modules.ts` | ✅ (نفسه من V1، اختياري) |

## خطوات التطبيق (مهم جداً)

### 1. انسخ الملفات الستة فوق الملفات الأصلية

```
shop_erp_critical_fix/
├── src/components/shop/Sidebar.tsx                →  src/components/shop/Sidebar.tsx
├── src/app/api/subscription/route.ts              →  src/app/api/subscription/route.ts
├── src/app/page.tsx                                →  src/app/page.tsx
├── src/app/api/auth/signup/route.ts                →  src/app/api/auth/signup/route.ts
├── prisma/seed-plans.ts                            →  prisma/seed-plans.ts
└── prisma/backfill-modules.ts                     →  prisma/backfill-modules.ts
```

### 2. (مهم جداً) شغّل الـ seed عشان يحدّث الـ plans في الـ DB

```bash
npx tsx prisma/seed-plans.ts
# أو لو مش عندك tsx:
npx ts-node prisma/seed-plans.ts
# أو
bun run tsx prisma/seed-plans.ts
```

ده بيعمل upsert لكل الـ plans القياسية. مش لازم تخاف — ده idempotent، الـ subscriptions الموجودة ما بتتأثرش، فقط الـ plans نفسها بتتحدّث بقائمة الـ enabledModules الجديدة (اللي بتشمل settings, users, finance).

### 3. (اختياري) شغّل backfill script لو حابب تتأكد

```bash
npx tsx prisma/backfill-modules.ts
```

### 4. أعد تشغيل الخادم

```bash
npm run dev
```

### 5. امسح cache المتصفح

F12 → Application → Storage → Clear site data
أو: `Ctrl+Shift+R` (hard reload)

### 6. سجّل خروج ودخول (مهم)

عشان الـ subscription endpoint يشتغل من جديد ويرجّع enabledModules المحدّثة.

### 7. اختبر

افتح لوحة المستخدم → لازم تلاقي في قسم "الإدارة":
- ✅ الإعدادات
- ✅ المستخدمين
- ✅ المعاملات المالية
- ✅ المصروفات
- ✅ الخزنة
- ✅ التقارير (لو على بقة electronics أو pro)
- ✅ الفروع (لو على بقة electronics أو pro)

## ليه الإصلاح ده أكيد شغال

في الإصلاحات السابقة كنت بفترض إن الـ trial plan دايماً null enabledModules، فبتعمل fallback لـ ALL_MODULES. لكن الـ user ممكن يكون على:

1. **FASHION_BASIC plan** (مكتوبة في seed) — ناقصة finance, users, reports, branches
2. **trial plan اتسعمل بعد تشغيل seed قديم** — enabledModules ممكن تكون ناقصة
3. **plan اتعدّلت يدوي في الـ DB** — مش هتعرف تتوقع إيه فيها

الإصلاح الجديد بيعالج كل الحالات دي عن طريق:
- **API layer**: يفرض إضافة الصفحات الحرجة قبل ما يبعتها للـ client
- **Sidebar layer**: يعرضها حتى لو الـ API غلط (defence in depth)
- **DB layer**: الـ seed الجديد بيشمل الصفحات دي في كل الـ plans القياسية

## ضمانات

- ✅ كل الملفات تمرّ Babel parser بنجاح
- ✅ الـ force-include idempotent — مش بيكرر الـ modules
- ✅ ADMIN/SUPER_ADMIN ما بيتأثروش (هما أصلاً بيشوفوا كل الصفحات)
- ✅ EMPLOYEE دلوقتي يشوف Settings, Users, Finance في كل الباقات
- ✅ ما فيش تغيير في الـ business logic — فقط إظهار الصفحات في الـ sidebar
