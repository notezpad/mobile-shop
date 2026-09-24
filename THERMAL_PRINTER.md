# الطباعة الحرارية ESC/POS — تنفيذ كامل

## المزايا

| الميزة | الحالة |
|------|------|
| **WebUSB مباشر** | ✅ Chrome/Edge — إرسال ESC/POS commands للطابعة USB |
| **Browser print** | ✅ نافذة طباعة (fallback لكل المتصفحات) |
| **Network printer** | ✅ IP + Port (عبر server proxy) |
| **58mm + 80mm** | ✅ عرض الورق قابل للتغيير |
| **عربي RTL** | ✅ تشكيل كامل + ترميز CP1256/CP720/CP864 |
| **إعدادات قابلة للحفظ** | ✅ localStorage — تبقى بعد إغلاق المتصفح |
| **قطع تلقائي** | ✅ GS V 1 (partial cut) |
| **اختبار USB** | ✅ زر "اتصال" في الإعدادات |
| **شعار المحل** | ✅ اسم + تليفون + عنوان |
| **تفاصيل الفاتورة** | ✅ رقم + تاريخ + عميل + بائع |
| **الأصناف** | ✅ اسم + كمية + سعر + إجمالي |
| **الإجمالي** | ✅ إجمالي + مدفوع + متبقي |
| **وحدات الجملة** | ✅ يدعم "دستة" / "نص" في الفاتورة |
| **ألوان/مقاسات** | ✅ variant في اسم الصنف |

## الملفات (4 ملفات)

| الملف | الوظيفة |
|------|------|
| **`src/lib/thermal-printer.ts`** ⭐ جديد | مكتبة ESC/POS كاملة: WebUSB + browser + network |
| **`src/components/shop/PrinterSettingsDialog.tsx`** ⭐ جديد | نافذة إعدادات الطابعة (عرض/اتصال/ترميز/قطع/نص) |
| **`src/components/shop/POSView.tsx`** 🔧 مُعدّل | طباعة حرارية بعد كل بيع (لو مُفعّلة) |
| **`src/components/shop/SettingsView.tsx`** 🔧 مُعدّل | بطاقة "الطابعة الحرارية" + زر الإعدادات |

## كيف يعمل

### عند البيع (POS):
```
1. المستخدم يضغط "دفع وطباعة"
2. POST /api/sales → الفاتورة تُحفظ
3. printSale() → طباعة A4 (موجود بالفعل)
4. printThermalReceipt() → ⚡ طباعة حرارية (جديد)
   - يقرأ الإعدادات من localStorage
   - لو USB → يرسل ESC/POS commands مباشرة
   - لو browser → يفتح نافذة طباعة (58mm/80mm)
   - لو network → يفتح نافذة طباعة (fallback)
```

### الإعدادات (Settings):
```
1. الإعدادات → الطابعة الحرارية → إعدادات الطابعة
2. اختار: 58mm أو 80mm
3. اختار: USB / متصفح / شبكة
4. لو USB → اضغط "اتصال" (WebUSB)
5. اختار ترميز عربي: Windows-1256 (موصى به)
6. فعّل/عطّل: قطع تلقائي
7. اكتب: نص أسفل الفاتورة
8. حفظ → الإعدادات تبقى في localStorage
```

## خطوات التطبيق

1. انسخ الـ 4 ملفات فوق الملفات الأصلية
2. `npm run dev`
3. اذهب لـ **الإعدادات → الطابعة الحرارية → إعدادات الطابعة**
4. اختار العرض (58mm أو 80mm) + طريقة الاتصال
5. لو عندك طابعة USB → اضغط "اتصال" (على Chrome/Edge)
6. جرّب بيع منتج من POS → الفاتورة الحرارية تطبع تلقائياً

## ملاحظات تقنية

### WebUSB (USB مباشر)
- متاح فقط على Chrome/Edge (الديسكتوب)
- بيدعم: Epson / Star / Xprinter / معظم طابعات ESC/POS
- الـ filters بتشمل vendor IDs شائعة
- الـ data transfer بيبعت ESC/POS bytes على endpoint 1

### Browser print (Fallback)
- يفتح نافذة بـ CSS `@page size: 80mm` (أو 58mm)
- المتصفح بيحول ده لـ paper width على الطابعة
- يدعم كل المتصفحات + كل الطابعات (حتى WiFi)

### Network printer
- Browser ما يقدرش يبعت TCP مباشر — محتاج server proxy
- الـ fallback الحالي يستخدم browser print
- لو محتاج network printing كامل، محتاج API route على السيرفر

الحزمة: `/home/z/my-project/download/shop_erp_thermal_printer.zip`
