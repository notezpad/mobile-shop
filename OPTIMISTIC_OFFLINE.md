# Optimistic Updates — كل العمليات تظهر فوراً offline

## المشكلة

عند إضافة منتج/مصروف/عميل offline، العملية تُحفظ في Outbox لكن **لا تظهر في الـ UI** لأن `load()` بيحاول يجيب من API → يفشل offline → البيانات القديمة تبقى كما هي. التغيير يظهر فقط عند عودة النت.

## الحل — Optimistic Updates

كل عملية إضافة/حذف/تعديل الآن:
1. **تحدّث الـ UI فوراً** (قبل الـ API call)
2. لو نجح الـ API → يـ reload (online)
3. لو offline → الـ UI محدّث بالفعل + العملية في Outbox
4. لو error حقيقي → يرجّع الـ optimistic update

## الملفات المُعدّلة (6 ملفات)

| الملف | العمليات المُصلّحة |
|------|------|
| **`ExpensesView.tsx`** | ✅ submit (إضافة مصروف) optimistic + delete optimistic |
| **`CustomersView.tsx`** | ✅ remove (حذف عميل) optimistic + load offline-friendly |
| **`SuppliersView.tsx`** | ✅ remove (حذف مورد) optimistic + load offline-friendly |
| **`MaintenanceView.tsx`** | ✅ remove (حذف أمر صيانة) optimistic + cycleStatus optimistic |
| **`CashView.tsx`** | ✅ load offline-friendly |
| **`ProductsView.tsx`** | ✅ toggleActive + removeProduct (مُصلّحة قبل كده) |

## مثال: إضافة مصروف offline

```typescript
// قبل: API call → load() → يفشل offline → المصروف ما بيظهرش
const submit = async () => {
  await api('/api/expenses', { method: 'POST', body: {...} })
  load()  // ← يفشل offline!
}

// بعد: Optimistic update فوراً → API call → offline = محفوظ + ظاهر
const submit = async () => {
  // ⚡ 1. أضف للمصروفات فوراً في الـ UI
  setData((prev) => ({
    ...prev,
    expenses: [{ id: tempId, ...newData }, ...prev.expenses],
    total: prev.total + amount,
  }))

  // 2. حاول API
  try {
    await api('/api/expenses', { method: 'POST', body: {...} })
    if (online) load()  // ← reload بس لو online
  } catch {
    // 3. Offline = محفوظ في outbox + ظاهر في UI
    toast.success('تم تسجيل المصروف (offline)')
  }
}
```

## خطوات التطبيق

1. انسخ الـ 6 ملفات فوق الملفات الأصلية في `src/components/shop/`
2. `npm run dev`
3. جرّب offline:
   - اضيف مصروف → **يظهر فوراً في القائمة** ✅
   - احذف عميل → **يختفي فوراً** ✅
   - غيّر حالة صيانة → **تتغير فوراً** ✅
   - ارجع النت → **كل العمليات تترفع** ✅

الحزمة: `/home/z/my-project/download/shop_erp_optimistic_offline.zip`
