# إصلاح URL Routing + بطء التنقل

## المشكلة

المتصفح كان دائماً يظهر نفس الـ URL (`/`) بغض النظر عن الصفحة اللي أنت فيها. يعني لما تفتح المنتجات أو الإعدادات، الـ URL بيفضل `localhost:3000/` — مش `localhost:3000/#products` أو `/#settings`.

ده مش بس مشكلة UX (ما تقدرش تعمل bookmark أو share رابط لصفحة معينة)، ده كمان **مشكلة أداء** لأن:
1. **ما فيش browser history** — زرار back/forward مش بيشتغل
2. **ما فيش page refresh** — لو تعمل refresh، ترجع للداشبورد
3. **ما فيش prefetch** — المتصفح ما يقدرش يحضّر الصفحة اللي هيفتحها
4. **الـ view كله بيعيد render** لأنه ما فيش route boundary

## الحل — Hash-based URL routing

ضِفت `useViewRouter` hook بتعمل sync بين Zustand state و URL hash:

```
قبل: localhost:3000/  (كل الصفحات على نفس الـ URL)
بعد:  localhost:3000/#dashboard
      localhost:3000/#products
      localhost:3000/#settings
      localhost:3000/#finance
      ... إلخ
```

### المزايا
- ✅ **URL بتتغير مع كل تنقّل** — تشوف اسم الصفحة في شريط المتصفح
- ✅ **Browser back/forward بيشتغل** — ترجع للصفحة السابقة
- ✅ **Page refresh يحافظ على الصفحة** — لو تعمل refresh على `/#products`، تفضل في المنتجات
- ✅ **Bookmark/share** — تقدر تعمل bookmark لصفحة معينة
- ✅ **No page reload** — التنقل سريع (hash change ما بيعملش reload)

## الملفات المطلوبة (8 ملفات)

| الملف | التغيير |
|------|------|
| **`src/lib/use-view-router.ts`** ⭐ جديد | Hook جديد بعمل sync بين Zustand و URL hash |
| **`src/lib/db.ts`** ⭐ V2 جديد | Global PrismaClient singleton (أهم إصلاح أداء) |
| `src/components/shop/Sidebar.tsx` | يستخدم useViewRouter بدل Zustand مباشرة |
| `src/app/page.tsx` | MainApp يستخدم useViewRouter + AnimatePresence removed |
| `src/lib/api.ts` | cache: 'default' for GET |
| `src/lib/auth-client.ts` | cache: 'default' in getMe |
| `src/app/api/auth/me/route.ts` | Cache-Control: max-age=60 |
| `src/app/api/subscription/route.ts` | Cache-Control: max-age=30 |
| `src/app/api/tenant/route.ts` | Cache-Control: max-age=60 |

## خطوات التطبيق

1. انسخ الـ 8 ملفات فوق الملفات الأصلية في مشروعك
2. `npm run dev`
3. امسح cache المتصفح (F12 → Application → Clear site data)
4. سجّل خروج ودخول
5. جرّب التنقل:
   - شوف شريط المتصفح — لازم يظهر `/#dashboard` ثم `/#products` ثم `/#settings`... إلخ
   - جرّب زرار back في المتصفح — لازم يرجعك للصفحة السابقة
   - جرّب refresh — لازم تفصل في نفس الصفحة (مش ترجع للداشبورد)

## التحسن المتوقع

| الحالة | قبل | بعد |
|------|------|------|
| شريط المتصفح | دائماً `/` | `/#dashboard`, `/#products`, `/#settings`... |
| زرار back | ما يشتغلش | يرجعك للصفحة السابقة |
| Page refresh | يرجع للداشبورد | يفضل في نفس الصفحة |
| سرعة التنقل | 2-4 ثواني | <1 ثانية (مع db.ts singleton) |

## كيف يعمل useViewRouter

```typescript
// 1. على أول تحميل: اقرأ hash من URL وحدّث Zustand
useEffect(() => {
  const viewFromHash = getViewFromHash()  // #products → 'products'
  setActiveViewInStore(viewFromHash)
  
  // استمع لزرار back/forward
  window.addEventListener('popstate', onPopState)
}, [])

// 2. عند الضغط على عنصر في الـ sidebar: حدّث Zustand + URL
const setActiveView = (view) => {
  setActiveViewInStore(view)           // حدّث React state
  setViewInHash(view)                  // حدّث URL: /#products
}

// 3. عند back/forward: اقرأ hash الجديد وحدّث Zustand
const onPopState = () => {
  const view = getViewFromHash()
  setActiveViewInStore(view)
}
```

الحزمة: `/home/z/my-project/download/shop_erp_url_routing.zip`
