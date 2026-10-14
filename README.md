# RBAC Implementation — ملخص التغييرات

## الفكرة
نظامان متكاملان:
1. **الصلاحيات (permissions)** — أي صفحات يشوفها الموظف
2. **رؤية الأرباح (canViewProfits)** — هل يشوف الأرباح والتكاليف؟

## الملفات المتغيرة

| الملف | التغيير |
|-------|---------|
| `prisma/schema.prisma` | +عمودين: `permissions String?` و`canViewProfits Boolean @default(false)` |
| `src/lib/auth.ts` | Session type + createSession + getSession: إضافة الحقلين |
| `src/lib/auth-client.ts` | AuthUser type |
| `src/app/api/auth/login/route.ts` | تمرير permissions + canViewProfits في الـ JWT |
| `src/app/api/auth/me/route.ts` | إرجاع الحقلين للفرونت |
| `src/app/api/users/route.ts` | POST: حفظ الصلاحيات + GET: إرجاعها |
| `src/app/api/users/[id]/route.ts` | PUT: تحديث الصلاحيات |
| `src/app/api/dashboard/route.ts` | إخفاء الأرباح من الـ API لمن لا يملك الصلاحية |
| `src/app/api/reports/route.ts` | نفس الفكرة للتقارير |
| `src/app/api/sales/route.ts` | إخفاء حقل cost من الـ items |
| `src/app/api/products/route.ts` | إخفاء حقل cost من المنتجات |
| `src/components/shop/Sidebar.tsx` | فلترة الصفحات حسب user.permissions |
| `src/components/shop/UsersView.tsx` | UI اختيار الصلاحيات + toggle الأرباح |
| `src/components/shop/DashboardView.tsx` | إخفاء بطاقات وتلميحات الأرباح |
| `src/components/shop/ReportsView.tsx` | إخفاء قسم المالية وبيانات الأرباح |

## خطوات التطبيق

### 1. قاعدة البيانات
```bash
# الأسرع
npx prisma migrate dev --name add_user_rbac

# أو بالـ SQL مباشرة
npx prisma db execute --file migration_rbac.sql
```

### 2. نشر الكود
استبدل كل ملف بالنسخة الجديدة في مجلد `shop_god_rbac/`

### 3. التحقق
- سجّل دخول كمدير → اضغط "إضافة مستخدم" → شوف قسم "الصفحات المتاحة"
- أضف موظف بصلاحيات محدودة
- سجّل دخول بحسابه → تأكد إن الـ Sidebar بيعرض الصفحات المسموحة فقط
- تأكد إن الأرباح مخفية في الداشبورد والتقارير

## المنطق

```
ADMIN        → يشوف كل صفحات الباقة + الأرباح دايمًا
EMPLOYEE     → permissions=null : يشوف كل صفحات الباقة
             → permissions=[...] : يشوف الصفحات المحددة فقط
             → canViewProfits=false : الأرباح مخفية (الافتراضي)
             → canViewProfits=true  : الأرباح ظاهرة (لو أذن المدير)
```

## الأمان (Defense in Depth)
- **Database**: حقول permissions + canViewProfits
- **JWT**: مخزنة في الـ token (مش بيرجع للـ DB في كل طلب)
- **API level**: كل endpoint بيفحص canViewProfits قبل ما يرجّع بيانات الأرباح
- **UI level**: الـ Sidebar + الكاردات بتختفي بناءً على الـ API response
