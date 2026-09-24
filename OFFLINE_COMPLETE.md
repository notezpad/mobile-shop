# Offline + Sync كامل 100% — POS يعمل بدون إنترنت

## ما الذي تم بناؤه

### 1. Pre-warm Engine (prewarm.ts) ⭐ جديد
عند فتح التطبيق وهو متصل:
- يسحب **كل المنتجات** من `/api/products?status=all` → يحفظها في IndexedDB
- يـ cache 8 API endpoints أساسية (dashboard, customers, suppliers, etc.)
- يتكرر كل 5 دقائق (لا يكرر لو سحب مؤخراً)

### 2. IndexedDB v2 (idb.ts) ⭐ محدّث
- `products` store جديد بـ indexes على `name` و `barcode` و `active`
- `searchProducts(query)` — بحث offline في المنتجات (by name + barcode)
- `getProductById(id)` — جلب منتج واحد offline
- `getAllProducts()` — كل المنتجات offline
- `productCount()` — عد المنتجات المحفوظة

### 3. Offline-aware API (api-offline.ts) ⭐ محدّث
- GET `/api/products?search=X` offline → يبحث في IndexedDB مباشرةً
- GET عام offline → يرجّع cached response من `rows` store
- POST offline → يحفظ في Outbox + يرجّع "تم الحفظ محلياً"

### 4. Sync Engine (sync.ts) ⭐ محدّث
- `fullSync()` = flushOutbox + prewarmAll
- عند عودة النت → يرفع العمليات + يسحب بيانات جديدة
- كل دقيقتين → مزامنة تلقائية

### 5. OfflineIndicator ⭐ محدّث
- يعرض "X منتج محفوظ offline" في الـ banner

## كيف يعمل POS offline الآن

```
1. المستخدم يفتح POS وهو متصل
   → prewarm.ts يسحب كل المنتجات لـ IndexedDB (بعد 2 ثانية من boot)

2. المستخدم يكتب في البحث: "آيفون"
   → api-offline.ts يبحث في IndexedDB (by name + barcode)
   → يرجّع النتائج فوراً (0ms — محلي)

3. المستخدم يضيف منتج للسلة
   → يقرأ المنتج من IndexedDB (متوفر offline)
   → السلة تشتغل 100% offline

4. المستخدم يضغط "دفع وطباعة"
   → offlineFetch POST /api/sales
   → لو offline → يحفظ في Outbox
   → يرجّع "تم الحفظ محلياً"
   → الفاتورة تُرفع عند عودة النت

5. النت يرجع
   → sync engine يفحص Outbox
   → يرسل POST /api/sales للسيرفر
   → الفاتورة تُحفظ في DB
   → المخزون يتحدّث
   → banner: "تمت مزامنة 1 عملية بنجاح"
```

## الملفات (8 ملفات)

| الملف | الحالة | الوظيفة |
|------|------|------|
| `src/lib/offline/idb.ts` | ⭐ v2 جديد | IndexedDB + products store + searchProducts |
| `src/lib/offline/api-offline.ts` | ⭐ محدّث | GET products search offline → IDB |
| `src/lib/offline/sync.ts` | ⭐ محدّث | fullSync = flushOutbox + prewarmAll |
| `src/lib/offline/prewarm.ts` | ⭐ جديد | سحب كل المنتجات + endpoints لـ IDB |
| `src/lib/offline/use-offline.ts` | ✅ محدّث | hooks نظيفة |
| `src/components/shop/OfflineIndicator.tsx` | ✅ محدّث | يعرض prewarmed count |
| `src/lib/api.ts` | ✅ نفسه | يستخدم offlineFetch |
| `src/app/(shop)/layout.tsx` | ✅ نفسه | يبدأ sync engine |

## خطوات التطبيق

1. انسخ الـ 8 ملفات فوق الملفات الأصلية
2. `npm run dev`
3. **مهم جداً**: افتح التطبيق وهو متصل بالنت → اتركه 10 ثواني (عشان يـ pre-warm)
4. بعدين جرّب:
   - افتح POS → ابحث عن منتج → **النتائج تظهر من IndexedDB**
   - قطع النت → ابحث تاني → **لسه تظهر** (offline search)
   - أضف للسلة → اضغط "دفع" → **"تم الحفظ محلياً"**
   - ارجع النت → **banner "مزامنة الآن"** → اضغطها → **الفاتورة تترفع**

## ليه ده مختلف عن الإصدار السابق

| الإصدار السابق | الإصدار الجديد |
|------|------|
| GET offline يرجّع cached response فقط | GET products search يبحث في IndexedDB مباشرةً |
| مفيش pre-warm — البيانات تتـ cache بس لما تفتح الصفحة | pre-warm يسحب كل المنتجات عند boot |
| POS search offline → يرجّع cached (بتاع آخر بحث online) | POS search offline → يبحث في كل المنتجات (live local search) |
| مفيش product store في IDB | products store بـ indexes على name + barcode |

الحزمة: `/home/z/my-project/download/shop_erp_offline_complete.zip`
