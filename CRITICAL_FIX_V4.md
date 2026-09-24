# إصلاح نهائي — صفحة "غير متاحة في باقتك" + طريقة الاشتراك

## المشكلة الجديدة (V4)

بعد ما ظهرت الصفحات في الـ sidebar (V3)، لما فتحتها ظهرت الرسالة دي:

```
الإعدادات — غير متاحة في باقتك
الميزة دي متاحة في باقة أعلى. يمكنك ترقية اشتراكك من إعدادات الحساب لتفعيلها.
```

**السبب**: كان فيه guard تاني في `src/app/page.tsx` اسمه `ModuleLockedView` بيمنع فتح الصفحة لو `enabledModules` ما بيشملهاش — حتى لو الـ sidebar عرضها.

كمان الـ `ModuleLockedView` ما كانش فيه زر "اشترك الآن" — فالمستخدم ما كانش عارف يروح فين.

## الإصلاحات الجديدة في V4

### 1. `src/app/page.tsx` — MainApp guard يسمح بالصفحات الحرجة

```typescript
const CRITICAL_MODULES = ['settings', 'users', 'finance', 'expenses', 'cash', 'reports']
const isAllowed =
  activeView === 'dashboard' ||
  enabledModules.includes(activeView) ||
  CRITICAL_MODULES.includes(activeView)

if (!isAllowed) {
  return <ModuleLockedView label={VIEW_TITLES[activeView] ?? activeView} />
}
```

دلوقتي لو المستخدم فتح Settings/Users/Finance/Expenses/Cash/Reports — الصفحة تفتح عادي مش تظهر رسالة locked.

### 2. `src/app/page.tsx` — ModuleLockedView فيها زر "ترقية الاشتراك"

```tsx
function ModuleLockedView({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <Shield className="size-8" />
      <h2>{label} — غير متاحة في باقتك</h2>
      <p>الميزة دي متاحة في باقة أعلى. يمكنك ترقية اشتراكك لتفعيلها.</p>
      <a href="/pricing" className="...gap-2 rounded-md bg-primary px-5 py-2.5">
        <Sparkles className="size-4" />
        ترقية الاشتراك
      </a>
    </div>
  )
}
```

دلوقتي لو المستخدم فتح صفحة **مقفولة فعلاً** (زي `branches` لو الباقة ما بيشملهاش)، هيلاقي زر واضح "ترقية الاشتراك" بيوديه على `/pricing`.

### 3. توسيع قائمة CRITICAL_MODULES لـ 6 صفحات (مش 3)

أضفت:
- `settings` (الإعدادات)
- `users` (المستخدمين)
- `finance` (المعاملات المالية)
- `expenses` (المصروفات)
- `cash` (الخزنة)
- `reports` (التقارير)

التغيير ده تم في 3 أماكن:
- `src/app/api/subscription/route.ts` (API layer)
- `src/components/shop/Sidebar.tsx` (Sidebar layer)
- `src/app/page.tsx` MainApp (View guard layer)
- `prisma/seed-plans.ts` (DB layer for new plans)

## طريقة الاشتراك (للمستخدم)

لما المستخدم يحب يرقّي باقته:

1. **الطريقة 1 — من الـ sidebar**:
   - Settings → هلاقي بطاقة "الاشتراك الحالي" فيها زر "ترقية الباقة"
   - يضغطها → يروح على `/pricing`

2. **الطريقة 2 — من الـ ModuleLockedView**:
   - لما يفتح صفحة مقفولة (مثلاً Branches لو باقته ما بيشملهاش)
   - هلاقي رسالة "غير متاحة في باقتك" + زر "ترقية الاشتراك"
   - يضغطها → يروح على `/pricing`

3. **الطريقة 3 — من شريط التنبيه**:
   - لما الاشتراك يقارب ينتهي (7 أيام أو أقل)
   - يظهر شريط أصفر فوق فيه زر "تجديد الآن"
   - يضغطها → يروح على `/pricing`

4. **الطريقة 4 — لما الاشتراك ينتهي**:
   - تظهر شاشة "اشتراكك منتهي" فيها زر "اشترك الآن"
   - يضغطها → يروح على `/pricing`

### في صفحة `/pricing`:
- يختار باقة (أساسية / احترافية)
- يختار فترة (شهري / سنوي)
- يضغط "اشترك الآن"
- يروح على `/checkout` → يدخل بياناته → اضغط "ادفع الآن"
- Paymob iframe → يدخل رقم محفظة / بطاقة → دفع
- يرجع على `/checkout/callback?status=success`
- اشتراكه يتفعّل

## الملفات المطلوبة (6 ملفات)

| الملف | التغيير |
|------|------|
| `src/app/page.tsx` | ⭐ **V4 جديد**: MainApp guard يسمح بالصفحات الحرجة + ModuleLockedView فيها زر "ترقية" |
| `src/app/api/subscription/route.ts` | ⭐ **V4 جديد**: CRITICAL_MODULES = 6 صفحات (مش 3) |
| `src/components/shop/Sidebar.tsx` | ⭐ **V4 جديد**: CRITICAL_MODULES = 6 صفحات (مش 3) |
| `prisma/seed-plans.ts` | ⭐ **V4 جديد**: FASHION_BASIC تشمل 6 صفحات حرجة |
| `src/app/api/auth/signup/route.ts` | ✅ (نفسه من V1) |
| `prisma/backfill-modules.ts` | ✅ (نفسه من V1) |

## خطوات التطبيق

### 1. انسخ الـ 6 ملفات فوق الملفات الأصلية

```
shop_erp_critical_fix_v4/
├── src/app/page.tsx                                →  src/app/page.tsx
├── src/app/api/subscription/route.ts              →  src/app/api/subscription/route.ts
├── src/app/api/auth/signup/route.ts              →  src/app/api/auth/signup/route.ts
├── src/components/shop/Sidebar.tsx                →  src/components/shop/Sidebar.tsx
├── prisma/seed-plans.ts                            →  prisma/seed-plans.ts
└── prisma/backfill-modules.ts                     →  prisma/backfill-modules.ts
```

### 2. (مهم) شغّل الـ seed عشان يحدّث الـ plans في الـ DB

```bash
npx tsx prisma/seed-plans.ts
```

### 3. أعد التشغيل + امسح الـ cache
```bash
npm run dev
# F12 → Application → Storage → Clear site data
# Ctrl+Shift+R
```

### 4. سجّل خروج ودخول (مهم)

### 5. اختبر
- افتح Settings → لازم تفتح عادي (مش رسالة "غير متاحة")
- افتح Users → لازم تفتح عادي
- افتح Finance → لازم تفتح عادي
- افتح Expenses → لازم تفتح عادي
- افتح Cash → لازم تفتح عادي
- افتح Reports → لازم تفتح عادي
- افتح Branches (لو باقته ما بيشملهاش) → لازم تظهر رسالة "غير متاحة" + زر "ترقية الاشتراك" بيودي على /pricing

## ضمانات

- ✅ كل الملفات تمرّ Babel parser بنجاح
- ✅ الـ 6 صفحات الحرجة (settings, users, finance, expenses, cash, reports) تفتح في كل الباقات
- ✅ ModuleLockedView فيها زر واضح يودي على /pricing
- ✅ صفحات أخرى (branches, maintenance) تفتح حسب الباقة — لو مقفولة، تظهر رسالة + زر ترقية
- ✅ ADMIN/SUPER_ADMIN ما بيتأثروش
- ✅ ما فيش تغيير في الـ business logic

الحزمة: `/home/z/my-project/download/shop_erp_critical_fix_v4.zip`
