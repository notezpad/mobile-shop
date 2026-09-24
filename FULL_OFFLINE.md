# Full Offline + Sync — نظام محتمل بدون إنترنت

## البنية

```
src/lib/offline/
├── idb.ts              ⭐ IndexedDB wrapper (3 stores: rows, outbox, meta)
├── api-offline.ts      ⭐ Offline-aware fetch wrapper
├── sync.ts             ⭐ Sync engine (flush outbox + auto-sync)
└── use-offline.ts      ⭐ React hooks (useSyncState, usePendingOperations, useOfflineReady)

src/components/shop/
├── OfflineIndicator.tsx  ⭐ Banner: offline / pending / syncing / result
└── (existing files updated)
```

## كيف يعمل

### عند الاتصال (Online)
```
GET /api/products → fetch من السيرفر → cache في IndexedDB → عرض البيانات
POST /api/sales   → fetch مباشرة → حفظ في DB
```

### عند الانقطاع (Offline)
```
GET /api/products → لا يوجد نت → اقرأ من IndexedDB cache → عرض آخر بيانات
POST /api/sales   → لا يوجد نت → احفظ في Outbox (IndexedDB) → ارجع "تم الحفظ محلياً"
```

### عند عودة الاتصال (Online event)
```
1. Sync engine يفحص الـ Outbox
2. يرسل كل عملية بالترتيب للسيرفر (POST/PUT/PATCH/DELETE)
3. لو نجحت → يمسحها من الـ Outbox
4. لو فشلت (4xx) → يحاول 5 مرات ثم يرميها
5. لو فشلت (5xx) → يتوقف (السيرفر مش شغال)
6. يعرض banner "تمت مزامنة X عملية بنجاح"
```

## المزايا

| الميزة | الحالة |
|------|------|
| قراءة البيانات offline | ✅ آخر استجابة من كل API محفوظة في IndexedDB |
| كتابة offline | ✅ كل عملية POST/PUT/PATCH/DELETE تُحفظ في Outbox |
| مزامنة تلقائية | ✅ عند عودة الاتصال + كل دقيقتين |
| مزامنة يدوية | ✅ زر "مزامنة الآن" في الـ banner |
| عرض العمليات المعلقة | ✅ "X عملية بانتظار المزامنة" + تفاصيل |
| Banner تفاعلي | ✅ orange (offline) / blue (pending) / spinner (syncing) / green/red (result) |
| Retry logic | ✅ 5 محاولات ثم discard |
| صلاحية المستخدم | ✅ getMe() يرجّع cached user offline |
| PWA + Offline | ✅ Service Worker + IndexedDB معاً |

## الملفات (8 ملفات)

| الملف | الوظيفة |
|------|------|
| `src/lib/offline/idb.ts` | IndexedDB wrapper — 3 stores (rows/outbox/meta) |
| `src/lib/offline/api-offline.ts` | Offline-aware fetch — GET cache / POST outbox |
| `src/lib/offline/sync.ts` | Sync engine — flush + auto-sync + retry |
| `src/lib/offline/use-offline.ts` | React hooks — useSyncState, useOfflineReady |
| `src/components/shop/OfflineIndicator.tsx` | Banner UI — offline/pending/syncing/result |
| `src/lib/api.ts` (مُعدّل) | يستخدم offlineFetch بدل fetch مباشرة |
| `src/lib/auth-client.ts` (مُعدّل) | getMe() يرجّع cached user offline |
| `src/app/(shop)/layout.tsx` (مُعدّل) | يضيف OfflineIndicator + useOfflineReady |

## خطوات التطبيق

1. انسخ الـ 8 ملفات فوق الملفات الأصلية
2. `npm run dev`
3. اختبر:
   - افتح المنتجات → قطع النت → المنتجات لسه تظهر (cached)
   - أضف منتج offline → تظهر رسالة "تم الحفظ محلياً"
   - ارجع النت → تظهر banner "مزامنة الآن" → اضغطها → البيانات تترفع
   - جرّب فاتورة POS offline → تُحفظ في Outbox → تترفع عند عودة النت

الحزمة: `/home/z/my-project/download/shop_erp_full_offline.zip`
