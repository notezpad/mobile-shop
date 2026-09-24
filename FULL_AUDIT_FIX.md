# إصلاح شامل — 5 أخطاء حرجة

## 1. ❌❌❌ تعارض في الأسعار (حرج) — مُصلّح

### قبل:
| الصفحة | المصدر | السعر المعروض (electronics-basic شهري) |
|------|------|------|
| /pricing | DB × USD_TO_EGP(50) | 299 × 50 = **14,950 ج.م** ❌ |
| /checkout | hardcoded PLAN_META × 50 | $9 × 50 = **450 ج.م** ❌ |
| Paymob API | DB مباشرة | **299 ج.م** ✅ |

**3 أسعار مختلفة لنفس الباقة!**

### بعد:
| الصفحة | المصدر | السعر المعروض |
|------|------|------|
| /pricing | DB مباشرة | **299 ج.م** ✅ |
| /checkout | DB مباشرة (عبر API) | **299 ج.م** ✅ |
| Paymob API | DB مباشرة | **299 ج.م** ✅ |

**الإصلاح**:
- `/pricing` — شِلت `USD_TO_EGP` + `currency switcher` — الأسعار في DB هي EGP أصلاً
- `/checkout` — شِلت `PLAN_META` hardcoded — دلوقتي بيجيب السعر من `/api/plans/public`

## 2. ❌ صفحة /checkout تستخدم أسعار hardcoded — مُصلّح

```typescript
// قبل: أسعار hardcoded + USD_TO_EGP
const PLAN_META = { 'electronics-basic': { monthlyUsd: 9, yearlyUsd: 97 } }
const amountUsd = plan.monthlyUsd
const amountEgp = amountUsd * 50  // 450 ج.م ≠ 299 ج.م في DB

// بعد: fetch من API
const found = await api('/api/plans/public').then(d => d.items.find(p => p.code === planCode))
const price = cycle === 'monthly' ? found.priceMonthly : found.priceYearly  // 299 مباشرة
```

## 3. ❌ صفحة /pricing تتعامل مع الأسعار كـ USD — مُصلّح

```typescript
// قبل:
const usd = plan.priceMonthly  // 299 (ده EGP مش USD!)
const egp = usd * 50           // 14,950 (غلط!)

// بعد:
const price = plan.priceMonthly  // 299 (EGP مباشرة)
// مفيش تحويل — السعر يظهر زي ما هو في DB
```

## 4. ⚠️ 'pos','products','sales','customers' مش في CRITICAL_MODULES — مُصلّح

```typescript
// قبل: 11 module
const CRITICAL_MODULES = ['settings','users','finance','expenses','cash','reports','branches','maintenance','purchases','suppliers','inventory']

// بعد: 15 module — كل الصفحات الأساسية
const CRITICAL_MODULES = ['settings','users','finance','expenses','cash','reports','branches','maintenance','purchases','suppliers','inventory','pos','products','sales','customers']
```

## 5. ⚠️ FASHION_BASIC ناقصة maintenance — مُصلّح

```typescript
// قبل:
const FASHION_BASIC = ['dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','settings','users','finance','expenses','cash','reports','branches']
// ❌ مفيش maintenance

// بعد:
const FASHION_BASIC = ['dashboard','pos','products','sales','customers','suppliers',
  'purchases','inventory','maintenance','settings','users','finance','expenses','cash','reports','branches']
// ✅ maintenance موجود
```

## الملفات (6 ملفات)

| الملف | التغيير |
|------|------|
| **`src/app/pricing/page.tsx`** | ⭐ إعادة كتابة — شِلت USD_TO_EGP + currency switcher — EGP مباشرة |
| **`src/app/checkout/page.tsx`** | ⭐ إعادة كتابة — fetch من API بدل PLAN_META |
| **`src/lib/features.ts`** | ⭐ CRITICAL_MODULES += 4 modules |
| **`src/components/shop/Sidebar.tsx`** | ⭐ CRITICAL_MODULES += 4 modules |
| **`src/app/page.tsx`** | ⭐ CRITICAL_MODULES += 4 modules |
| **`prisma/seed-plans.ts`** | ⭐ FASHION_BASIC += maintenance |

## خطوات التطبيق

1. انسخ الـ 6 ملفات فوق الملفات الأصلية
2. شغّل seed: `npx tsx prisma/seed-plans.ts`
3. `npm run dev`
4. جرّب:
   - افتح `/pricing` → الأسعار بالجنيه مباشرة (299, 599, 349, 699)
   - افتح `/checkout?plan=electronics-basic` → نفس السعر (299)
   - ادفع → Paymob بيقبض 299 (نفس الـ DB)
   - كل الصفحات ظاهرة في الـ sidebar (POS, products, sales, customers + كل الباقي)

الحزمة: `/home/z/my-project/download/shop_erp_full_audit_fix.zip`
