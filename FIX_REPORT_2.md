# تجاوب POSView + لوحة الأدمن — إضافات على التقرير السابق

## 1. POSView (نقطة البيع) — متجاوب بالكامل

### التخطيط قبل التعديل
- تخطيط 2-pane على `lg+` (grid-cols-5: بحث+سلة = 3 أعمدة، ملخص الدفع = 2 عمود).
- على الموبايل كان الجدول داخل السلة يتسبب في تمرير أفقي مزعج.

### التخطيط بعد التعديل
- **`lg+` (لابتوب/ديسكتوب)**: نفس التخطيط الأصلي — بحث + سلة + ملخص.
- **`< lg` (موبايل/تابلت)**:
  - شريط البحث + نتائج البحث في الأعلى.
  - زر عائم دائري **"عرض السلة (N)"** يظهر في أسفل الشاشة (مع شارة بعدد الأصناف).
  - عند الضغط على الزر يفتح **Sheet drawer** من أسفل الشاشة يحتوي على السلة.
  - داخل الـ Sheet كل صنف في السلة ب成了 كارت مستقل (اسم + اختيار اللون/المقاس + اختيار الوحدة + السعر/الكمية/الإجمالي + زر حذف) بدلاً من صف جدول.
  - ملخص الدفع (العميل + الإجمالي + زر "دفع وطباعة") يظهر أسفل البحث مباشرة في التدفق الطبيعي.

### التغييرات التقنية
- إضافة استيراد `Sheet, SheetContent, SheetTitle` من `@/components/ui/sheet`.
- إضافة state `cartSheetOpen` للتحكم بفتح/إغلاق الـ Sheet.
- نسخة الجدول الأصلي محفوظة بـ `hidden lg:block` (تظهر فقط على الديسكتوب).
- زر عائم `fixed bottom-4 left-4 ... lg:hidden` يفتح الـ Sheet.
- نسخة كروت جديدة داخل الـ Sheet (stacked layout لكل صنف بدلاً من صفوف جدول).

## 2. SuperAdminApp + لوحة الأدمن — متجاوبة بالكامل

### AdminSidebar — إضافة دعم `collapsed`
- قبل التعديل: `AdminSidebar` كان دائماً بعرض 260px (لا يدعم الـ icon-rail).
- بعد التعديل: يقبل prop اختياري `collapsed?: boolean`:
  - `false` (افتراضي): عرض 260px، يظهر اسم المنصة + label الأزرار + اسم المستخدم في الفوتر.
  - `true`: عرض 68px، يخفي النصوص ويعرض الأيقونات فقط (مع tooltips عبر title).

### SuperAdminApp — نفس نقاط التوقف اللي في الشوبيكون
- **`< md` (موبايل)**: درج منزلق بزر همبرغر، شريط علوي 14h يظهر اسم الصفحة الحالية + زر theme.
- **`md – lg` (تابلت)**: شريط أيقونات 68px (AdminSidebar collapsed)، الشريط العلوي يفضل ظاهر.
- **`lg+` (ديسكتوب)**: سايدبار كامل 260px + desktop header منفصل (VIEW_TITLES + Badge "أدمن أعلى" + ThemeToggle).
- المحتوى الرئيسي له `md:mr-[68px] lg:mr-[260px]` لتفسح مساحة للسايدبار.

### جداول لوحة الأدمن — 3 ملفات بإضافة كروت متجاوبة

#### AdminDashboardView (جدولان)
- جدول "أحدث الاشتراكات المنتهية قريباً" (6 أعمدة): على `< lg` → كروت (اسم المحل + الباقة + الأيام المتبقية + تاريخ + زر "تمديد سريع").
- جدول "أحدث 5 محلات مسجلة" (5 أعمدة): على `< lg` → كروت مدمجة (اسم + الباقة + التاريخ + StatusBadge).

#### AdminSubscriptionsView (جدول واحد، 10 أعمدة)
- على `< lg` → كروت لكل اشتراك (اسم المحل + StatusBadge + الباقة + الفترة + بداية/نهاية/مبلغ + طريقة الدفع + 3 أزرار: تمديد/إيقاف/حذف).

#### AdminTenantsView (جدول واحد، 8 أعمدة)
- على `< lg` → كروت لكل محل (اسم المحل + البريد + StatusBadge + Badge الباقة + تاريخ التسجيل/آخر دخول + 5 أزرار: عرض/تعديل/دخول كمالك/تفعيل-إيقاف/حذف).

## الملفات الإضافية المعدّلة (5 ملفات)

| الملف | الوصف |
|------|------|
| `src/components/admin/SuperAdminApp.tsx` | إضافة `collapsed` prop لـ AdminSidebar + تحديث نقاط التوقف |
| `src/components/admin/AdminDashboardView.tsx` | جدولان يحصلان على كروت متجاوبة |
| `src/components/admin/AdminSubscriptionsView.tsx` | جدول الاشتراكات يحصل على كروت متجاوبة |
| `src/components/admin/AdminTenantsView.tsx` | جدول المحلات يحصل على كروت متجاوبة |
| `src/components/shop/POSView.tsx` | POS متجاوب: زر عائم + Sheet للسلة على الموبايل |

## التركيبة الكاملة للحزمة (22 ملف)

```
shop_erp_responsive/
├── src/
│   ├── app/
│   │   └── page.tsx                                   # السايدبار 3 حالات
│   └── components/
│       ├── shop/
│       │   ├── POSView.tsx                            # ⭐ جديد: POS متجاوب
│       │   ├── SalesHistoryView.tsx
│       │   ├── CustomersView.tsx
│       │   ├── SuppliersView.tsx
│       │   ├── MaintenanceView.tsx
│       │   ├── UsersView.tsx
│       │   ├── ExpensesView.tsx
│       │   ├── PurchaseOrdersView.tsx
│       │   ├── CashView.tsx
│       │   ├── FinanceView.tsx
│       │   ├── DashboardView.tsx
│       │   ├── BranchesView.tsx
│       │   ├── ReportsView.tsx
│       │   └── inventory/
│       │       ├── StockTab.tsx
│       │       ├── MovementsTab.tsx
│       │       ├── TransfersTab.tsx
│       │       └── StocktakeTab.tsx
│       └── admin/
│           ├── SuperAdminApp.tsx                      # ⭐ جديد: سايدبار متجاوب
│           ├── AdminDashboardView.tsx                 # ⭐ جديد
│           ├── AdminSubscriptionsView.tsx             # ⭐ جديد
│           └── AdminTenantsView.tsx                   # ⭐ جديد
└── FIX_REPORT.md (تقرير المرحلة الأولى — ما زال ساري)
└── FIX_REPORT_2.md (هذا الملف — تغطية POSView + لوحة الأدمن)
```

## اختبار سريع

انسخ الملفات الـ 5 الجديدة إلى مشروعك فوق الملفات الأصلية، ثم جرّب:
- **POS** على موبايل (375×812): ابحث عن منتج، اضغط على زر "عرض السلة" العائم — السلة تنفتح من أسفل الشاشة.
- **POS** على لابتوب (1280×800): السلة تظهر بجانب البحث كالسابق.
- **لوحة الأدمن** على تابلت (768×1024): السايدبار يتحول إلى شريط أيقونات 68px.
- **لوحة الأدمن** على لابتوب (1280×800): السايدبار كامل 260px.
- **لوحة الأدمن** على موبايل (375×812): السايدبار يختفي، يظهر زر همبرغر يفتح درج.

## ضمانات
- ✅ لم يتغير أي logic في الـ checkout / refund / impersonation / quick-extend.
- ✅ RTL محفوظ بالكامل.
- ✅ CRLF محفوظ لكل الملفات.
- ✅ تم التحقق من توازن الأقواس في كل ملف (depth=0, minDepth=0).
- ✅ كل الإجراءات (extend / pause / delete / impersonate / toggle-status) تعمل بنفس الـ handlers الأصلية.
