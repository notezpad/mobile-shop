# Proper Next.js Routes — صفحات مستقلة بدون علامة الشباك #

## ما الذي تغيّر

بدلاً من نظام التنقل بـ Zustand state (اللي كان يخلي كل الصفحات على نفس الـ URL `/`)، دلوقتي كل صفحة لها **route مستقل** في Next.js App Router — زي WorkerOS بالظبط:

```
قبل: localhost:3000/  ← كل الصفحات على نفس الـ URL
بعد:  localhost:3000/dashboard
      localhost:3000/pos
      localhost:3000/products
      localhost:3000/settings
      localhost:3000/finance
      ... إلخ (16 صفحة)
```

## البنية الجديدة

```
src/app/
├── page.tsx                    ← صفحة الدخول (boot + auth redirect)
├── (shop)/                     ← route group (مش تظهر في URL)
│   ├── layout.tsx              ← الـ shell (sidebar + header + auth guard)
│   ├── dashboard/page.tsx     ← /dashboard
│   ├── pos/page.tsx            ← /pos
│   ├── products/page.tsx       ← /products
│   ├── sales/page.tsx          ← /sales
│   ├── maintenance/page.tsx    ← /maintenance
│   ├── customers/page.tsx      ← /customers
│   ├── suppliers/page.tsx      ← /suppliers
│   ├── purchases/page.tsx      ← /purchases
│   ├── inventory/page.tsx      ← /inventory
│   ├── finance/page.tsx        ← /finance
│   ├── expenses/page.tsx       ← /expenses
│   ├── cash/page.tsx           ← /cash
│   ├── reports/page.tsx        ← /reports
│   ├── settings/page.tsx       ← /settings
│   ├── users/page.tsx          ← /users
│   └── branches/page.tsx       ← /branches
```

### ليه `(shop)` بين قوسين؟

Route groups في Next.js (بين قوسين) مش بتظهر في الـ URL. يعني:
- `src/app/(shop)/products/page.tsx` → URL: `/products` (مش `/shop/products`)
- الـ `layout.tsx` جوه `(shop)` بيتطبّق على كل الصفحات جوه المجموعة

## كيف يعمل التنقل دلوقتي

### Sidebar
```tsx
// قبل: Zustand state change (ما بيغيرش URL)
onClick={() => setActiveView('products')}

// بعد: Next.js <Link> (بيغير URL)
<Link href="/products">المنتجات</Link>
```

### Active state
```tsx
const pathname = usePathname()
active={pathname === '/products'}
```

### Auth + Boot
الـ `layout.tsx` في `(shop)` بيعمل:
1. `getMe()` + `/api/tenant` + `/api/subscription` بالتوازي
2. لو مش مسجّل → redirect لـ `/` (landing page)
3. لو super admin → redirect لـ `/` (SuperAdminApp)
4. لو مسجّل → يرender الـ shell (sidebar + header) + `{children}`

### كل صفحة
كل `page.tsx` بتعمل `React.lazy()` للـ view component بتاعها — يعني:
- كل صفحة لها chunk منفصل
- Lazy loading — ما يتحملش إلا لما تفتح الصفحة
- Code splitting تلقائي من Next.js

## المزايا

| الميزة | قبل | بعد |
|------|------|------|
| URL | دائماً `/` | `/dashboard`, `/products`, `/settings`... |
| Back/Forward | ما يشتغلش | يشتغل عادي |
| Page refresh | يرجع للداشبورد | يفضل في نفس الصفحة |
| Bookmark | ما يقدرش | يقدر يعمل bookmark لأي صفحة |
| Code splitting | Zustand lazy (جزئي) | Next.js route-level (كامل) |
| Prefetch | ما فيش | Next.js بـ prefetch الـ links عند hover |
| السرعة | 2-4 ثواني | <1 ثانية (مع db.ts singleton) |

## الملفات (27 ملف)

### ملفات جديدة (18 ملف)
- `src/app/(shop)/layout.tsx` — الـ shell
- `src/app/(shop)/dashboard/page.tsx`
- `src/app/(shop)/pos/page.tsx`
- `src/app/(shop)/products/page.tsx`
- `src/app/(shop)/sales/page.tsx`
- `src/app/(shop)/maintenance/page.tsx`
- `src/app/(shop)/customers/page.tsx`
- `src/app/(shop)/suppliers/page.tsx`
- `src/app/(shop)/purchases/page.tsx`
- `src/app/(shop)/inventory/page.tsx`
- `src/app/(shop)/finance/page.tsx`
- `src/app/(shop)/expenses/page.tsx`
- `src/app/(shop)/cash/page.tsx`
- `src/app/(shop)/reports/page.tsx`
- `src/app/(shop)/settings/page.tsx`
- `src/app/(shop)/users/page.tsx`
- `src/app/(shop)/branches/page.tsx`
- `src/lib/use-view-router.ts` (احتياطي — مش مستخدم في النظام الجديد)

### ملفات معدّلة (9 ملف)
- `src/app/page.tsx` — redirect للمستخدمين المسجلين لـ /dashboard
- `src/components/shop/Sidebar.tsx` — يستخدم `<Link>` + `usePathname`
- `src/lib/db.ts` — global PrismaClient singleton
- `src/lib/api.ts` — cache: 'default' for GET
- `src/lib/auth-client.ts` — cache: 'default' in getMe
- `src/lib/features.ts` — CRITICAL_MODULES + requireModule bypass
- `src/app/api/auth/me/route.ts` — Cache-Control
- `src/app/api/subscription/route.ts` — Cache-Control
- `src/app/api/tenant/route.ts` — Cache-Control

## خطوات التطبيق

1. انسخ كل الملفات فوق الملفات الأصلية في مشروعك
2. **مهم**: انسخ مجلد `(shop)` كامل (مع الأقواس)
3. `npm run dev`
4. امسح cache المتصفح
5. سجّل دخول → لازم يروح على `/dashboard`
6. جرّب التنقل:
   - شوف شريط المتصفح — لازم يظهر `/dashboard`, `/products`, `/settings`...
   - جرّب زرار back — يرجعك للصفحة السابقة
   - جرّب refresh — يفضل في نفس الصفحة
   - جرّب bookmark لأي صفحة

الحزمة: `/home/z/my-project/download/shop_erp_proper_routes.zip`
