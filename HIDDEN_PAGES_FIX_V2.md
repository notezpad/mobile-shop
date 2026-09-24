# إصلاح الصفحات المخفية في لوحة المستخدم (V2)

## المشكلة الحقيقية

في الإصلاح السابق (V1) ظننت إنك تقصد **لوحة الأدمن**، لكنك تقصد فعلاً **لوحة المستخدم** (الـ shop) — الإعدادات والمستخدمين والمعاملات المالية **مخفية** عن المستخدم في الـ sidebar.

## التشخيص الكامل

كان فيه 4 أسباب للمشكلة (3 اتصلّحو في V1 + 1 جديد):

### V1 — أصلّحت 4 أسباب
1. `Sidebar.tsx` كان فيه `{isAdmin && ...}` على MANAGE_GROUP → EMPLOYEE ما بيشوفش القائمة أصلاً ✅ اتصصلّح
2. `page.tsx` كان فيه guard بيرجّع EMPLOYEE للداشبورد لو فتح Settings/Finance → اتصصلّح ✅
3. `seed-plans.ts` FASHION_PRO ناسي `finance` → اتصصلّح ✅
4. `signup/route.ts` trial plan ما كانش بيدّي `enabledModules` صراحةً → اتصصلّح ✅

### V2 — المشكلة الباقية
5. **الـ plans القديمة في الـ DB** لسه من غير `enabledModules` — backfill الـ signup route بيشتغل فقط عند signup جديد، لكن المستخدمين الـ موجودين ما بيتحدّثش أوتوماتيكياً.

## الإصلاح الجديد في V2

### `src/app/api/subscription/route.ts` (ملف جديد في V2)
ضِفت **self-healing** على الـ subscription endpoint:

```typescript
const parsedModules = parseArr(latestSub.plan.enabledModules)

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
```

**يعني**: أول مرة المستخدم يفتح صفحته، الـ endpoint بيجيب الـ subscription، يلاقي الـ plan قديم من غير enabledModules، يحدّثه فوراً في الـ DB، ويرجّع كل الـ modules للـ sidebar.

### الفائدة
- **ما فيش حاجة تشغّل backfill script** — كل مستخدم لما يفتح الـ app، الـ plan بتاعه يتصلّح أوتوماتيكياً
- Idempotent — ما بيتعملش update في كل مرة (لأن بعد أول update، `parsedModules` يبقى موجود)
- Safe — ما بيتعدّلش غير plans ناقصة enabledModules

## الملفات في V2 (6 ملفات)

| الملف | التغيير |
|------|------|
| `src/components/shop/Sidebar.tsx` | ✅ إزالة `isAdmin` check (V1) |
| `src/app/page.tsx` | ✅ إزالة non-admin guard (V1) |
| `src/app/api/auth/signup/route.ts` | ✅ trial plan صريح + backfill عند signup (V1) |
| `prisma/seed-plans.ts` | ✅ إضافة `finance` لـ FASHION_PRO (V1) |
| `prisma/backfill-modules.ts` | ✅ Script يدوي لو احتاجت (V1) |
| **`src/app/api/subscription/route.ts`** ⭐ | ✅ **Self-healing عند كل طلب (V2 جديد)** |

## خطوات التطبيق

1. **انسخ الـ 6 ملفات** من `/home/z/my-project/download/shop_erp_hidden_pages_v2.zip`

2. **أعد التشغيل**:
```bash
npm run dev
```

3. **اختبر**:
   - سجل دخول بأي حساب موجود (مش لازم تسجل جديد)
   - افتح لوحة المستخدم → لازم تلاقي:
     - الإعدادات ✅
     - المستخدمين ✅
     - المعاملات المالية ✅
     - المصروفات ✅
     - الخزنة ✅
     - التقارير ✅
     - الفروع ✅
   - كل دي ظاهرة في قسم "الإدارة" في الـ sidebar

### (اختياري) تشغيل backfill script لو حابب
```bash
bun run tsx prisma/backfill-modules.ts
# أو
npx tsx prisma/backfill-modules.ts
```

ده مش لازم — الـ self-healing في `/api/subscription` بيعمل الشغل لوحده. لكن لو حابب تشوف الـ plans كلها اتحدّثت دفعة واحدة، شغّله.

## ليه V1 ما اشتغلش كفاية

- V1 اصلّح الـ sidebar + page guards + signup route — لكن **مش** حدّث الـ subscription endpoint
- عشان كده المستخدمين الـ موجودين قبل الـ fix (زي حسابك اللي شغال دلوقتي) ما اتصلّحش عندهم الـ plan في الـ DB
- V2 أضاف الـ self-healing — أول مرة المستخدم يفتح الـ app، الـ plan بتاعه يتصلّح أوتوماتيكياً

## ضمانات
- ✅ كل الملفات الـ 6 تمرّ Babel parser بنجاح
- ✅ الـ self-healing idempotent — ما بيتعملش update غير مرة واحدة
- ✅ ما بيتأثرش الـ ADMIN/SUPER_ADMIN (هما أصلاً كانوا بيقدروا يبصّوا على كل الصفحات)
- ✅ ما بيتأثرش الـ custom plans اللي الأدمن عملها — الـ self-healing بيشتغل فقط لو `enabledModules` null
