# إصلاح بطء التنقل بين الصفحات

## المشكلة

التنقل بين الصفحات كان بياخد 4-5 ثواني. مقارنة بـ WorkerOS (نظام المقاولات) اللي بتفتح صفحاته في جزء من الثانية.

## الأسباب الجذرية (3 أسباب)

### 1. AnimatePresence mode="wait" — 360ms لكل تنقّل
```tsx
<AnimatePresence mode="wait">  // ← ينتظر الصفحة القديمة تخرج (180ms) قبل ما الجديدة تدخل (180ms)
  <motion.div key={activeView} ...>
```
**الحل**: شِلت `AnimatePresence` + `motion.div` وحطيت `<div key={activeView}>` بسيط — تبديل فوري بدون animation.

### 2. Boot waterfall — 4 API calls متتالية
```
getMe() → /api/tenant → /api/subscription → /api/dashboard (الصفحة)
         200ms          200ms               200ms+           = 800-2000ms فقط للـ boot
```
**الحل**: شِلت `getMe()` + `/api/tenant` في `Promise.allSettled()` — يشتغلوا بالتوازي بدل متتاليين.

### 3. مفيش caching — كل API call بيضرب الـ DB
- `cache: 'no-store'` في كل fetch → ما فيش caching إطلاقاً
- `force-dynamic` في كل route → مفيش Next.js caching

**الحل**: ضِفت `Cache-Control: private, max-age=30` على:
- `/api/auth/me` → cache 60 ثانية
- `/api/subscription` → cache 30 ثانية
- `/api/tenant` → cache 60 ثانية
- + حدّث `api()` helper يستخدم `cache: 'default'` للـ GET (يحترم Cache-Control)

## الملفات المُعدّلة (6 ملفات)

| الملف | الإصلاح | تأثير |
|------|------|------|
| `src/app/page.tsx` | شِلت AnimatePresence + parallelized boot | -360ms per nav + -200ms boot |
| `src/lib/api.ts` | `cache: 'default'` للـ GET requests | browser caching |
| `src/lib/auth-client.ts` | `cache: 'default'` في getMe() | cache session 60s |
| `src/app/api/auth/me/route.ts` | `Cache-Control: max-age=60` | cache user data |
| `src/app/api/subscription/route.ts` | `Cache-Control: max-age=30` | cache subscription |
| `src/app/api/tenant/route.ts` | `Cache-Control: max-age=60` | cache tenant data |

## إجمالي التحسن المتوقع

| الحالة | قبل | بعد |
|------|------|------|
| أول فتح للصفحة | 4-5 ثواني | ~1-2 ثانية |
| تنقّل لصفحة ثانية | 3-4 ثواني | <1 ثانية |
| تنقّل لصفحة زيارتها قبل كده | 3-4 ثواني | <0.5 ثانية (cached) |
| تنقّل سريع بين صفحتين | 2x 360ms animation | 0ms (instant) |

## خطوات التطبيق

1. انسخ الـ 6 ملفات فوق الملفات الأصلية في مشروعك
2. `npm run dev`
3. امسح cache المتصفح (F12 → Application → Clear site data)
4. جرّب التنقل بين الصفحات — لازم يكون **أسرع بكتير**

## ملاحظات إضافية

### لو لسه بطيء بعد الإصلاح

المشكلة ممكن تكون في:
- **Supabase cold start** — أول query بعد خمول بياخد وقت. ده مش ممكن نصلّحه من الكود — ده من Supabase نفسها.
- **PrismaClient per request** — كل API call بيعمل PrismaClient جديد + TCP connection جديد. ده في `db.ts` وده by design للـ Cloudflare Workers (ما يقدرش يعمل connection pool cross-request). لو على Node.js عادي، ممكن نصلّحه.
- **حجم الـ JS bundle** — لو الـ views كبيرة (POSView = 47KB, ReportsView = 45KB), lazy loading بيساعد لكن أول زيارة لكل صفحة بتحمل الـ chunk.

### ليه WorkerOS أسرع؟

WorkerOS بيستخدم:
- **TanStack Router** (file-based, code-split per route)
- **Supabase client-side auth** (JWT في localStorage, ما بيحتاجش API call للتحقق)
- **TanStack Query** (query caching + background refetch)
- **localStorage sync check** بدل `getSession()` (اللي بياخد ثواني)

نظام المحل بيستخدم:
- **Next.js App Router** (server-rendered)
- **Cookie-based JWT auth** (كل request بيجيب الـ cookie + يـ verify)
- **No query caching** (كان `cache: 'no-store'` في كل مكان)

الإصلاحات اللي عملتها دلوقتي بتقرب الـ gap — مش بتقفلونه تماماً، لكن بتسرّع التنقل بشكل ملحوظ.

الحزمة: `/home/z/my-project/download/shop_erp_perf_fix.zip`
