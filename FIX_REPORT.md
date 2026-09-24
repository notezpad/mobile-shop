# تجاوب جميع صفحات النظام — تقرير الإصلاحات

## السبب الجذري والخطة

كانت معظم صفحات النظام تستخدم نمط **الجدول فقط** (`<Table>`) بدون أي نسخة بديلة للموبايل، مما يجبر المستخدم على التمرير الأفقي على الشاشات الصغيرة لتتبّع صف واحد كامل. صفحة المنتجات فقط كانت تحتوي على نسختين: جدول على الشاشات الكبيرة (`lg+`) وكروت منظمة على الشاشات الأصغر.

الخطة المطبّقة:
1. **السايدبار**: تحويله إلى 3 حالات حسب عرض الشاشة:
   - أقل من `md` (768px): درج منزلق (drawer) بزر همبرغر
   - من `md` إلى `lg` (768–1023px): شريط أيقونات متمركز 68px
   - `lg` فأكثر (1024px+): سايدبار كامل 260px
2. **كل صفحة بها جدول**: إضافة نسخة كروت متجاوبة بنفس النمط المستخدم في صفحة المنتجات (كارت = صورة/عنوان/إجراءات في الأعلى + شبكة بيانات 3 أعمدة في الأسفل).

## نقاط التوقف (Breakpoints) المعتمدة

Tailwind v4 الافتراضية:
- `sm` = 640px (تابلت صغير عمودي)
- `md` = 768px (تابلت)
- `lg` = 1024px (لابتوب)
- `xl` = 1280px (ديسكتوب)
- `2xl` = 1536px (شاشة كبيرة)

للجداول: الجدول يظهر على `lg+` (1024px+)، الكروت تظهر تحت `lg`.
لسايدبار الشوبيكون: درج تحت `md`، أيقونات `md–lg`، كامل `lg+`.
لشبكة الكروت: 1 عمود تحت `sm`، عمودين من `sm`، (الجدول يحل محلها فوق `lg`).

## الملفات المعدّلة (17 ملف)

### سايدبار + الـ App Shell

| الملف | التغيير |
|------|---------|
| `src/app/page.tsx` | إضافة 3 حالات للسايدبار (drawer / icon-rail / full) باستخدام `md:max-lg:*` max-variant من Tailwind. |

### الصفحات الرئيسية (9 ملفات) — كلها بنفس النمط

لكل صفحة: الجدول الأصلي يُغلَّف بـ `hidden lg:block` ويُضاف بديل كروت `grid grid-cols-1 sm:grid-cols-2 lg:hidden` يحتوي على نفس البيانات والإجراءات.

| الملف | الجدول المعروض | أعمدة الكروت |
|------|------|------|
| `src/components/shop/SalesHistoryView.tsx` | سجل المبيعات (11 عمود) | 3×2: إجمالي/مدفوع/باقي + كمية/حالة/إجراءات |
| `src/components/shop/CustomersView.tsx` | العملاء (8 أعمدة) | 3: رصيد/مشتريات/عدد + آخر تعامل |
| `src/components/shop/SuppliersView.tsx` | الموردين (8 أعمدة) | 3: مستحق/مشتريات/عدد + آخر تعامل |
| `src/components/shop/MaintenanceView.tsx` | أوامر الصيانة (10 أعمدة) | 3: تكلفة/استلام/تسليم + إجراءات |
| `src/components/shop/UsersView.tsx` | المستخدمين (9 أعمدة) | 2×2: دور/فرع/إنشاء/دخول + إجراءات |
| `src/components/shop/ExpensesView.tsx` | المصروفات (7 أعمدة) | 1 كارت: تصنيف+مبلغ+ملاحظة+حذف |
| `src/components/shop/PurchaseOrdersView.tsx` | المشتريات (11 عمود) | 3: إجمالي/مدفوع/آجل + كمية+إرجاع |
| `src/components/shop/CashView.tsx` | حركات الخزنة (7 أعمدة، للقراءة فقط) | 1 كارت: مصدر+مبلغ+رصيد+بواسطة |
| `src/components/shop/FinanceView.tsx` | المعاملات المالية (9 أعمدة، للقراءة فقط) | 3: مبلغ/عمولة/صافي + ملاحظة+بواسطة |

### الصفحات الفرعية والـ Tabs

| الملف | التغيير |
|------|---------|
| `src/components/shop/DashboardView.tsx` | BentoGrid متجاوب أصلاً + جدول آخر 10 مبيعات أصبح له بديل كروت |
| `src/components/shop/BranchesView.tsx` | تبويب البطاقات متجاوب أصلاً + جدول تقرير الأداء أصبح له بديل كروت |
| `src/components/shop/ReportsView.tsx` | جدولان (أفضل المنتجات + منتجات محتاجة تزويد) أصبح لهما بدائل كروت |
| `src/components/shop/inventory/StockTab.tsx` | جدول المخزون (8 أعمدة) + كروت بالباركود و4 أعمدة بيانات |
| `src/components/shop/inventory/MovementsTab.tsx` | سجل الحركات (للقراءة) + كروت بنوع+كمية+بواسطة |
| `src/components/shop/inventory/TransfersTab.tsx` | سجل التحويلات + كروت قابل للنقر لفتح التفاصيل |
| `src/components/shop/inventory/StocktakeTab.tsx` | سجل عمليات الجرد + كروت قابل للنقر لفتح التفاصيل |

## ملفات لم تُعدّل (متجاوبة أصلاً)

- `src/components/shop/SettingsView.tsx` — تستخدم `sm:grid-cols-2` و `sm:grid-cols-3` أصلاً
- `src/components/shop/ProductsView.tsx` — هي المرجع الذي طُبّق نفس نمطه
- `src/components/shop/POSView.tsx` — لها تخطيط 2-pane معقد يحتاج دراسة مستقلة
- `src/components/admin/SuperAdminApp.tsx` — لوحة الأدمن الأعلى (نمط منفصل)

## تشريح الكارت (مطابق لـ ProductsView)

```
┌─────────────────────────────────────────────┐
│  [Avatar]  #1 اسم العميل      [✏][⋮][🗑]   │  ← الرأس
│            معلومات إضافية                    │
├─────────────────────────────────────────────┤
│  الباركود / الصورة (إن وُجد)                │
├─────────────────────────────────────────────┤
│   رصيد     │   مشتريات    │   عدد المبيعات    │  ← شبكة 3 أعمدة
├─────────────────────────────────────────────┤
│  آخر تعامل: 2026-09-12                       │  ← معلومات إضافية
└─────────────────────────────────────────────┘
```

## كيفية التطبيق

انسخ كل ملف من الحزمة إلى مكانه في مشروعك:

```
shop_erp_responsive/
├── src/
│   ├── app/
│   │   └── page.tsx                          →  src/app/page.tsx
│   └── components/shop/
│       ├── SalesHistoryView.tsx              →  src/components/shop/
│       ├── CustomersView.tsx                 →  src/components/shop/
│       ├── SuppliersView.tsx                 →  src/components/shop/
│       ├── MaintenanceView.tsx               →  src/components/shop/
│       ├── UsersView.tsx                     →  src/components/shop/
│       ├── ExpensesView.tsx                  →  src/components/shop/
│       ├── PurchaseOrdersView.tsx            →  src/components/shop/
│       ├── CashView.tsx                      →  src/components/shop/
│       ├── FinanceView.tsx                   →  src/components/shop/
│       ├── DashboardView.tsx                 →  src/components/shop/
│       ├── BranchesView.tsx                  →  src/components/shop/
│       ├── ReportsView.tsx                   →  src/components/shop/
│       └── inventory/
│           ├── StockTab.tsx                  →  src/components/shop/inventory/
│           ├── MovementsTab.tsx              →  src/components/shop/inventory/
│           ├── TransfersTab.tsx             →  src/components/shop/inventory/
│           └── StocktakeTab.tsx              →  src/components/shop/inventory/
```

بعد النسخ شغّل `npm run dev` وافتح الموقع على مقاسات مختلفة (Chrome DevTools → Device Toolbar):
- 375×812 (iPhone 13)
- 390×844 (iPhone 14 Pro)
- 768×1024 (iPad)
- 1024×768 (iPad Landscape — هنا يبدأ الجدول)
- 1280×800 (Laptop)
- 1920×1080 (Desktop)

## ضمانات

- ✅ لم يتغير أي منطق عمل (business logic) — كل الإجراءات والـ API calls كما هي.
- ✅ الكروت تستخدم نفس الدوال والمعالجات (handlers) التي يستخدمها الجدول.
- ✅ RTL محفوظ بالكامل (dir="rtl" + الترتيب المنطقي للأيقونات).
- ✅ تم الحفاظ على رموز نهاية السطر CRLF لمطابقة الملفات الأصلية.
- ✅ تم التحقق من عدم وجود أخطاء صياغة (double-braces, comma-expressions).

## ما لم يُغطَّى (مهم)

- **POSView**: لم يُعدَّل لأنه يحتوي على تخطيط 2-pane معقد (يمين: الفاتورة، يسار: سلة + دفع). يحتاج دراسة مستقلة لتجعله متجاوباً (على الموبايل يُفضَّل تحويله إلى stack عمودي: المنتجات في الأعلى، السلة في الأسفل، زر "إتمام البيع" عائم).
- **SuperAdminApp**: لم يُعدَّل لأن السايدبار الخاص بالأدمن لا يدعم `collapsed` بعد. إذا أردت تطبيق نفس نمط الـ icon-rail على لوحة الأدمن، يجب أولاً تطوير `AdminSidebar` لدعم الـ collapsed prop.
