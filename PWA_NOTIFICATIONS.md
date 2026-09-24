# PWA + نظام الإشعارات — دليل التطبيق

## 1. PWA (Progressive Web App)

### الملفات الجديدة
| الملف | الوظيفة |
|------|------|
| `public/manifest.json` | PWA manifest — اسم التطبيق، أيقونات، shortcuts |
| `public/sw.js` | Service Worker — offline caching + network-first for API |
| `public/offline.html` | صفحة "غير متصل" — تظهر عند انقطاع الإنترنت |
| `public/icon-192.png` | أيقونة 192×192 (للـ home screen) |
| `public/icon-512.png` | أيقونة 512×512 (للـ splash screen) |
| `src/components/shop/PWAInstallPrompt.tsx` | بانر "تثبيت التطبيق" — يظهر تلقائياً |
| `src/app/layout.tsx` (مُعدّل) | إضافة manifest + SW registration + apple meta tags |

### المزايا
- ✅ **تثبيت كتطبيق** — المستخدم يقدر يضيفه للـ Home Screen
- ✅ **Offline mode** — الصفحات اللي زيارتها قبل كده تشتغل بدون نت
- ✅ **App shortcuts** — اختصارات سريعة (POS / المنتجات / الداشبورد)
- ✅ **Splash screen** — شاشة بداية بـ gradient
- ✅ **Standalone mode** — يفتح بدون شريط المتصفح
- ✅ **iOS support** — تعليمات مخصصة لمستخدمي آيفون (مشاركة → إضافة للشاشة)
- ✅ **Android/Chrome** — زر "تثبيت" مباشر عبر beforeinstallprompt

### كيف يعمل
1. **Service Worker** بيتسجل أول ما الصفحة تحمل
2. يـ cache الـ app shell (HTML/JS/CSS) → تشتغل offline
3. API requests → network-first (دائماً يجيب أحدث بيانات، fallback لـ cache)
4. لما المستخدم يفتح النظام على Chrome → بانر "تثبيت" يظهر
5. بعد التثبيت → يفتح كتطبيق مستقل (بدون متصفح)

## 2. نظام الإشعارات

### الملفات الجديدة
| الملف | الوظيفة |
|------|------|
| `prisma/schema.prisma` (مُعدّل) | إضافة `Notification` model + 3 boolean fields على Tenant |
| `prisma/migrations/.../migration.sql` | SQL لإنشاء جدول `Notification` + أعمدة على `Tenant` |
| `src/app/api/notifications/route.ts` | GET (list) + POST (create) |
| `src/app/api/notifications/read/route.ts` | PATCH (mark as read — single or all) |
| `src/app/api/notifications/settings/route.ts` | GET + PUT (notification preferences) |
| `src/components/shop/NotificationBell.tsx` | 🔔 bell icon + popover list + unread badge |
| `src/lib/notifications.ts` | helpers: createNotification + checkLowStock + checkExpiringSubs |
| `src/app/(shop)/layout.tsx` (مُعدّل) | إضافة NotificationBell + PWAInstallPrompt |

### المزايا
- ✅ **In-app notifications** — 🔔 bell في الـ header مع unread badge
- ✅ **Real-time polling** — يجيب الإشعارات كل 30 ثانية
- ✅ **Mark as read** — فردي أو "تعليم الكل"
- ✅ **Click → navigate** — اضغط على الإشعار يروح للصفحة المرتبطة
- ✅ **Types**: low_stock / expiring_subscription / new_sale / warning / info / success
- ✅ **Per-tenant settings** — كل محل يتحكم في نوع الإشعارات اللي يستقبلها
- ✅ **Auto-detection**:
  - مخزون منخفض → إشعار تلقائي
  - اشتراك ينتهي قريباً → إشعار تلقائي

### Notification model
```prisma
model Notification {
  id        Int       @id @default(autoincrement())
  tenantId  String
  userId    String?
  type      String    @default("info")  // low_stock, expiring_subscription, new_sale, etc.
  title     String
  message   String
  link      String?                     // /products, /pricing, etc.
  isRead    Boolean   @default(false)
  createdAt DateTime  @default(now())
}
```

### Tenant notification preferences
```prisma
notifyLowStock             Boolean @default(true)
notifyExpiringSubscription Boolean @default(true)
notifyNewSales            Boolean @default(false)
```

## خطوات التطبيق

### 1. انسخ الملفات
انسخ كل الملفات من الحزمة فوق الملفات الأصلية في مشروعك:
- `public/` — 5 ملفات (manifest, sw.js, offline.html, 2 icons)
- `src/app/api/notifications/` — 3 route files
- `src/components/shop/NotificationBell.tsx`
- `src/components/shop/PWAInstallPrompt.tsx`
- `src/lib/notifications.ts`
- `src/app/layout.tsx` — فوق الملف الأصلي
- `src/app/(shop)/layout.tsx` — فوق الملف الأصلي
- `prisma/schema.prisma` — فوق الملف الأصلي
- `prisma/migrations/20260913_add_notifications/migration.sql`

### 2. شغّل migration
```bash
npx prisma migrate deploy
# أو
npx prisma db push
```

### 3. أعد التشغيل
```bash
npm run dev
```

### 4. اختبر PWA
- افتح Chrome على الدومين
- في شريط URL → لازم تلاقي أيقونة "تثبيت" 📲
- أو افتح DevTools → Application → Manifest → تأكد إن manifest متعرف
- جرّب قطع الإنترنت → لازم تظهر صفحة "أنت غير متصل"

### 5. اختبر الإشعارات
- افتح لوحة المستخدم → لازم تلاقي 🔔 bell في الـ header
- الـ API `/api/notifications` بيرجّع الإشعارات (فاضية في الأول)
- عشان تختبر: POST `/api/notifications` بـ body:
  ```json
  {
    "type": "info",
    "title": "مرحبا",
    "message": "هذا إشعار تجريبي"
  }
  ```
- لازم الإشعار يظهر في الـ bell مع unread badge

الحزمة: `/home/z/my-project/download/shop_erp_pwa_notifications.zip`
