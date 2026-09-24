# نظام أكواد الاشتراك — Subscription Codes System

> 🛡️ 2026-09-21 — تطبيق شامل لنظام أكواد تفعيل الاشتراك
> مع تحكم كامل من لوحة الأدمن وتطبيق ذاتي من لوحة المستخدم.

## نظرة عامة

النظام بيتكوّن من نصّين:

1. **لوحة الأدمن** (`AdminCodesView`): إنشاء/إدارة أكواد التفعيل
2. **لوحة المستخدم** (`RedeemCodeCard` في صفحة الإعدادات): تفعيل الكود

بعد انتهاء الاشتراك:
- ❌ **مفيش** قفل للوحة التحكم — المستخدم يقدر يدخل ويشوف بياناته
- ✅ الميزات بتوقف تلقائياً (APIs بترجع 402)
- ✅ بيوصله إشعار في الجرس بيقوله "اشتراكك انتهى — استخدم كود تفعيل"
- ✅ بنر أعلى الصفحة بيذكّره بالتجديد

---

## المخطط (Database Schema)

### `ActivationCode` model — الحقول الجديدة

```prisma
model ActivationCode {
  // ... الحقول الموجودة
  durationDays     Int?      // مدة مخصصة بالأيام (بتتجاوز monthly/yearly/trial)
  expiresAt        DateTime? // تاريخ انتهاء صلاحية الكود نفسه
  assignedTenantId String?   // تخصيص الكود لمحل معين (لو null = عام)
  batchLabel       String?   // تصنيف للبحث والترتيب (مثال: "حملة ديسمبر")
}
```

كل الحقول **optional** — الأكواد القديمة هتفضل شغّالة بدون أي تغيير.

---

## API Endpoints

### 1. `POST /api/admin/redeem` — تفعيل كود (self-service)

**اللي يقدر يفتحه:** أي مستخدم مسجّل الدخول (حتى لو اشتراكه منتهي)
**اللي ممنوع:** SUPER_ADMIN (لازم يستخدم لوحة الأدمن)

**Body:**
```json
{ "code": "ABCDEFGHIJKL" }
```

**الـ Logic:**
1. التحقق من الكود (case-insensitive, بيتحوّل لـ uppercase)
2. التحقق إنه مش مستخدم بالفعل
3. التحقق إن `expiresAt` (لو موجود) لسه في المستقبل
4. التحقق إن `assignedTenantId` (لو موجود) بيطابق tenantId بتاع المستخدم
5. في transaction:
   - تحديد الكود كمستخدم (`redeemedAt = now`)
   - إلغاء أي اشتراك فعال حالي للمحل
   - إنشاء اشتراك جديد بـ:
     - `durationDays` لو موجود (مدة مخصصة)
     - أو `period` (monthly=30d / yearly=365d / trial=14d)
   - تفعيل الـ tenant
6. إنشاء إشعار للمستخدم بنجاح التفعيل

**Responses:**
- `200 OK`: `{ ok: true, subscription: { id, endDate, planId, planName, period } }`
- `400`: الكود مستخدم بالفعل / منتهي الصلاحية / غير مخصص لحسابك
- `404`: الكود غير موجود

---

### 2. `GET /api/admin/codes` — قائمة الأكواد (admin only)

**Query params:**
- `status` — `available` | `redeemed` | (فاضي = الكل)
- `planId` — فلتر بالباقة
- `assignedTenantId` — فلتر بالمحل المُخصَّص له
- `batchLabel` — فلتر بتصنيف الباتش
- `search` — بحث بالكود/الملاحظات/الباتش

**Response:** قائمة بكل الأكواد مع كل الحقول الجديدة.

---

### 3. `POST /api/admin/codes` — توليد أكواد جديدة (admin only)

**Body:**
```json
{
  "planId": 1,                          // مطلوب
  "period": "monthly",                  // monthly | yearly | trial (افتراضي: monthly)
  "quantity": 5,                        // 1-100 (افتراضي: 1)
  "notes": "حملة ديسمبر",               // optional
  "durationDays": 45,                   // optional — يلغي period
  "expiresAt": "2026-12-31T23:59:59Z", // optional — تاريخ انتهاء الكود
  "assignedTenantId": "ck_xxx",         // optional — تخصيص لمحل
  "batchLabel": "december-2026"         // optional — تصنيف
}
```

---

## لوحة الأدمن (`AdminCodesView`)

بتظهر في الـ sidebar تحت "أكواد الاشتراك". بتوفر:

### Toolbar
- فلتر بالحالة (متاح / مستخدم / الكل)
- فلتر بالباقة
- بحث نصّي (كود / ملاحظات / باتش)
- تصدير الأكواد المتاحة كـ CSV
- زرار "توليد أكواد"

### الإحصائيات
- إجمالي الأكواد
- متاح
- مستخدم

### الجدول
أعمدة: # | الكود | الباقة | المدة | الحالة | انتهاء الكود | مخصص لـ | الباتش | تاريخ الإنشاء | الاستخدام | إجراءات

### توليد أكواد (dialog)
- الباقة (required)
- الفترة (شهري/سنوي/تجريبي)
- ☑ تخصيص مدة الكود بالأيام (بيتجاوز الفترة)
- العدد (1-100)
- تخصيص لمحل معين (optional)
- تاريخ انتهاء صلاحية الكود (optional)
- تصنيف الباتش (optional)
- ملاحظات داخلية

بعد التوليد:
- عرض الأكواد المولّدة
- تصديرها كـ CSV

---

## لوحة المستخدم (`RedeemCodeCard`)

بتظهر في صفحة **الإعدادات** (`/settings`), فوق بيانات المحل.

### المكوّنات:
1. **Status pill** بيدّي حالة الاشتراك الحالي:
   - 🔴 منتهي
   - 🟡 ينتهي خلال X يوم
   - 🟢 فعّال — X يوم متبقي

2. **Input للكود** — بيتحوّل تلقائياً لـ uppercase، بيقبل Enter للتفعيل

3. **زرار "تفعيل الكود"**

4. **بعد التفعيل الناجح:**
   - رسالة نجاح باللون الأخضر
   - الباقة الجديدة + تاريخ الانتهاء
   - زرار "تحديث الصفحة لتفعيل الاشتراك" (عشان تتفك الكاش)

5. **رسائل مساعدة:**
   - لو الاشتراك منتهي: "الميزات متوقفة — أدخل كود تفعيل"
   - لو الاشتراك فعّال: "تقدر تطبّق كود تجديد قبل الانتهاء"

---

## التغييرات على الـ Auth

### `requireAuthIgnoreSubscription()` (جديد في `src/lib/auth.ts)

نفس `requireAuth()` لكن **بدون** فحص `requireActiveSubscription()`. بيُستخدم في:

- `GET /api/subscription` — عشان المستخدم يشوف حالة اشتراكه حتى لو منتهي
- `GET /api/tenant` — عشان صفحة الإعدادات تفتح حتى لو الاشتراك منتهي
- `GET /api/notifications` + `POST /api/notifications` — عشان الإشعارات (بما فيها تذكير التجديد) تظهر حتى لو الاشتراك منتهي

### `POST /api/admin/redeem` (محدّث)
- بيستخدم `getSession()` (مش `requireAuth()`) عشان يشتغل حتى لو الاشتراك منتهي
- كل الـ validation بيتعمل atomic في transaction
- بيرسل إشعار تأكيد بعد التفعيل

---

## الإشعارات (Notifications)

### `checkExpiringSubscriptions()` (محدّث في `src/lib/notifications.ts`)

أضينا فحص جديد بجانب الفحص الموجود:

1. **اشتراك ينتهي خلال 7 أيام** (موجود قبل كده) → إشعار `expiring_subscription`
2. **اشتراك انتهى خلال آخر 24 ساعة** (جديد) → إشعار `expired_subscription`
   - الرسالة: "انتهى اشتراكك في باقة X. يمكنك استخدام كود تفعيل من الإدارة للتجديد — افتح الإعدادات ثم 'تطبيق كود اشتراك'."
   - Link: `/settings`

### بعد تفعيل الكود بنجاح:
بيتنشأ إشعار `subscription_redeemed`:
- "تم تفعيل باقة X لمدة Y يوم (حتى DATE). شكراً لاستخدامك نظامنا! 🎉"

---

## خطوات التطبيق

1. **تطبيق الـ migration:**
   ```bash
   bunx prisma migrate deploy
   # أو
   bunx prisma db push
   ```

2. **(اختياري) إعادة توليد Prisma Client:**
   ```bash
   bunx prisma generate
   ```

3. **إعادة بناء وإطلاق الموقع** — مفيش حاجة تانية مطلوبة.

---

## سيناريوهات الاستخدام

### 1. إنشاء كود عام لكل العملاء
- Admin → أكواد الاشتراك → توليد
- اختار الباقة + الفترة (شهري)
- العدد = 10
- اضغط توليد
- نسخ/تصدير الأكواد وإرسالها للعملاء

### 2. إنشاء كود مخصص لمحل واحد
- Admin → أكواد الاشتراك → توليد
- اختار الباقة + فترة + تخصيص لمحل (select المحل)
- حتى لو حد سرق الكود، مش هينفع يفعّله لأنه مخصّص للمحل ده بس

### 3. إنشاء كود مدته 45 يوم (بدل 30)
- Admin → أكواد الاشتراك → توليد
- اختار الباقة
- ☑ تخصيص مدة الكود → 45 يوم
- الكود لما يتفعّل، الاشتراك هيدوم 45 يوم بدل 30

### 4. إنشاء كود تنتهي صلاحيته بعد شهر
- Admin → أكواد الاشتراك → توليد
- اختار الباقة + الفترة
- تاريخ انتهاء صلاحية الكود = بعد شهر
- حتى لو الكود مش مستخدم، مش هيقدر يتفعّل بعد ده

### 5. تفعيل كود من لوحة المستخدم
- المستخدم يفتح الإعدادات
- ينزل تحت لـ "تطبيق كود اشتراك"
- يدخل الكود ويفعّل
- لو ناجح: بيظهر له رسالة + زرار تحديث الصفحة
- بعد التحديث: الاشتراك الجديد يتفعّل فوراً

### 6. بعد انتهاء الاشتراك
- لوحة التحكم بتفضل مفتوحة (مفيش قفل)
- بنر أحمر فوق كل الصفحات بيقول "انتهت فترة التجربة"
- جرس الإشعارات بيظهر فيه إشعار "انتهى اشتراكك"
- الميزات (POS, مبيعات, ...): APIs بترجع 402 → بتتوقف
- صفحة الإعدادات بتفتح عادي → المستخدم يقدر يطبّق كود تجديد

---

## الأمان

1. **tenantId من الـ session فقط** — مش من الـ body (منع تفعيل كود لحساب غير حسابك)
2. **Atomic conditional update** — لو أكتر من request وصلوا في نفس الوقت، بس واحد فيهم هينجح (الباقي هيرجع P2025)
3. **Pre-assignment check** — لو الكود مخصّص لمحل X، أي محلات تانية مش هتقدر تفعّله
4. **Code expiry check** — لو الكود له `expiresAt` وعدّى، مفيش تفعيل
5. **Redeemed code can't be deleted** — حماية من فقدان السجل
6. **Super admin bypass for redeem** — السوبر أدمن ممنوع يستخدم `/api/admin/redeem` (لازم يستخدم لوحة الأدمن)

---

## الـ Files اللي اتعدّلت

| File | نوع التغيير |
|------|-------------|
| `prisma/schema.prisma` | إضافة 4 حقول + 2 index على `ActivationCode` |
| `prisma/migrations/20260921_enhance_activation_codes/migration.sql` | migration جديد |
| `src/app/api/admin/redeem/route.ts` | إعادة كتابة مع validation كامل + إشعار |
| `src/app/api/admin/codes/route.ts` | POST + GET بيدعموا الحقول الجديدة + search |
| `src/app/api/subscription/route.ts` | استخدام `requireAuthIgnoreSubscription` |
| `src/app/api/tenant/route.ts` | GET بستخدم `requireAuthIgnoreSubscription` |
| `src/app/api/notifications/route.ts` | GET + POST بستخدموا `requireAuthIgnoreSubscription` |
| `src/lib/auth.ts` | إضافة `requireAuthIgnoreSubscription()` |
| `src/lib/notifications.ts` | `checkExpiringSubscriptions` بتفحص "just expired" برضو |
| `src/components/shop/RedeemCodeCard.tsx` | مكوّن جديد — تطبيق كود في الإعدادات |
| `src/components/shop/SettingsView.tsx` | استيراد `RedeemCodeCard` وعرضه |
| `src/components/admin/AdminCodesView.tsx` | توليد + جدول بالحقول الجديدة + search |
