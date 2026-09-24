# Paymob — صفحة دفع الباقات (WorkerOS-style)

## ما الذي تغيّر عن المرحلة السابقة

في المرحلة السابقة كانت صفحة الدفع بسيطة (Dialog + صفحة /upgrade). الآن تم استبدالها بـ **3 صفحات مستقلة** مطابقة لأسلوب WorkerOS:

| الصفحة | الوظيفة |
|------|------|
| `/pricing` | صفحة رئيسية لعرض الباقات (4 كروت) مع toggle شهري/سنوي + currency switcher EGP/USD + روابط للاشتراك |
| `/checkout?plan=...&cycle=...&currency=...` | صفحة الدفع الثلاثية الخطوات (stepper) — ملخص الطلب + بيانات العميل + Paymob |
| `/checkout/callback?order=...` | صفحة استقبال العودة من Paymob مع polling + display حالة (paid/failed/pending) |

## البنية الجديدة (ملفات جديدة)

```
src/
├── app/
│   ├── pricing/page.tsx                       ⭐ صفحة الباقات (WorkerOS pattern)
│   ├── checkout/
│   │   ├── page.tsx                           ⭐ صفحة الدفع الثلاثية الخطوات
│   │   └── callback/page.tsx                  ⭐ صفحة استقبال callback + polling
│   └── api/paymob/
│       └── status/route.ts                    ⭐ endpoint للـ polling (يُستدعى من callback page)
└── app/globals.css                            🔧 إضافة 24KB CSS جديد (pg-card, co-*, cb-*)
```

## الملفات المعدّلة (تتغيّر الأسلوب)

| الملف | التغيير |
|------|------|
| `src/app/api/paymob/checkout/route.ts` | قبول `customer` data + تحديث default success/cancel URLs لـ /checkout/callback |
| `src/app/api/paymob/return/route.ts` | تحديث redirects لـ /checkout/callback بدلاً من /upgrade |
| `src/app/page.tsx` | إزالة UpgradeDialog + استبدال الأزرار بروابط لـ /pricing |
| `src/components/shop/SettingsView.tsx` | استبدال UpgradeDialog بروابط لـ /pricing |
| `src/app/globals.css` | إضافة 24KB CSS مطابق لأسلوب WorkerOS (pg-card, pg-toggle, co-*, cb-*) |

## الملفات المحذوفة (لم تعد تُستخدم)

- `src/app/upgrade/page.tsx`
- `src/components/shop/UpgradeDialog.tsx`

## الـ UX Flow الجديد

```
1. المستخدم → SettingsView → يرى بطاقة "الاشتراك الحالي"
   ↓ يضغط "اشترك الآن" / "تجديد" / "ترقية"
   (ينتقل إلى /pricing)
2. /pricing page
   ├── يرى 4 كروت (تجربة / أساسية / احترافية لكل قطاع)
   ├── يختار currency: EGP / USD (default EGP)
   ├── يختار billing: شهري / سنوي (toggle)
   └── يضغط "اشترك الآن" على الباقة المختارة
   (ينتقل إلى /checkout?plan=...&cycle=...&currency=...)
3. /checkout page
   ├── Stepper: 1-مراجعة الطلب | 2-بيانات العميل | 3-الدفع الآمن
   ├── LEFT: ملخص الطلب (باقة + سعر + مميزات + ضمان + trust badges)
   ├── RIGHT: بيانات العميل (name, phone, email, Paymob badge)
   └── يضغط "ادفع الآن"
   (POST /api/paymob/checkout → redirect إلى Paymob iframe)
4. Paymob iframe — المستخدم يدخل بيانات المحفظة/البطاقة + OTP
   ↓ بعد النجاح
   (A) Paymob webhook → /api/paymob/webhook → يفعّل الاشتراك
   (B) المتصفح redirect → /api/paymob/return → redirect إلى /checkout/callback
5. /checkout/callback page
   ├── Polling: GET /api/paymob/status?merchant_order_id=sub-X
   ├── يعرض الحالة النهائية (paid/failed/pending)
   └── أزرار: "الذهاب للوحة التحكم" + "عرض الباقات"
```

## الـ Plan Card (مطابق لـ WorkerOS)

كل كارت بهذا التركيب:
- **Badge** (اختياري): "الأكثر طلباً" (pro) / "خطتك الحالية" (current)
- **Header**: أيقونة ملونة (gradient) + اسم الباقة + وصف
- **Price box**: العملة + المبلغ + الفترة + note (توفير سنوي)
- **CTA button**: ملون بgradient الباقة + "اشترك الآن" أو "ابدأ التجربة"
- **Features list**: مميزات متاحة (✓) ومميزات معطلة (✗) — مثل WorkerOS بالضبط

## إعداد Paymob (نفس الإعداد السابق)

كل ما تحتاجه موجود في `.env.example`. الأهم:

```env
PAYMOB_API_KEY=""                                  # من Paymob dashboard > Profile > API Keys
PAYMOB_PUBLIC_KEY="egy_pk_live_JLVJJQFdxEoLisGef0Y0OMNbRgHX8Rgj"
PAYMOB_INTEGRATION_ID="5835805"
PAYMOB_IFRAME_ID=""
PAYMOB_HMAC_SECRET=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

**في Paymob dashboard**:
1. Profile → API Keys → انسخ الـ API Key (server-side secret)
2. Profile → HMAC Secret → انسخ الـ HMAC
3. Integrations → Integration Details → لقطة الـ Integration ID (5835805 عندك)
4. Settings → Iframe IDs → انسخ الـ iframe id
5. Profile → Webhook Notifications:
   - URL: `https://your-domain.com/api/paymob/webhook`
   - HMAC Secret = نفس `PAYMOB_HMAC_SECRET`

## خطوات التطبيق

1. انسخ الملفات الجديدة (6 ملفات) + المعدّلة (4 ملفات) من الحزمة.
2. احذف الملفات القديمة: `src/app/upgrade/page.tsx` و `src/components/shop/UpgradeDialog.tsx`.
3. أضف متغيرات Paymob في `.env` (أو Cloudflare Worker secrets).
4. شغّل `npm run dev`.
5. جرّب `/pricing` → اختر باقة → `/checkout` → اضغط "ادفع" → Paymob → /checkout/callback.

## ميزات الـ WorkerOS-style المطبّقة

- ✅ **Currency switcher** EGP/USD (default EGP) — متحرك بـ slider
- ✅ **Billing toggle** شهري/سنوي — متحرك بـ slider + badge "وفّر 17%"
- ✅ **Plan cards** بـ gradients مختلفة (trial/basic/pro)
- ✅ **Badge "الأكثر طلباً"** على باقة Pro مع animation (pulse)
- ✅ **Mميزات ok/no** — list مع ✓ و ✗ و strike-through
- ✅ **Stepper** ثلاثي الخطوات (مراجعة الطلب → بيانات العميل → الدفع الآمن)
- ✅ **Trust badges** في sidebar (SSL 256-bit, محمية, Visa, محافظ)
- ✅ **Paymob badge** داخل form (PCI-DSS Level 1)
- ✅ **Guarantee** 14 يوم استرداد
- ✅ **Form validation** للهاتف المصري (01[0125]\d{8})
- ✅ **Polling** على callback page (20 محاولة × 3 ثوان = 60 ثانية)
- ✅ **Status display** بـ icon متحرك (paid/failed/pending/checking)
- ✅ **Dark mode** مطابق لـ landing-dark (نفس variables و backgrounds)
- ✅ **Responsive** على الموبايل (grid يتغير من 4 → 2 → 1)

## ضمانات

- ✅ كل الملفات الجديدة تمرّ Babel parser (TypeScript + JSX).
- ✅ لا يوجد hardcoded amount — كل الأسعار تأتي من `/api/plans/public`.
- ✅ Webhook HMAC verification مطابق لمواصفات Paymob.
- ✅ Return endpoint يستعلم Paymob API للتأكيد قبل redirect.
- ✅ Status endpoint يتحقق من tenant ownership (security).
- ✅ RTL محفوظ بالكامل.
- ✅ مطابق لأسلوب WorkerOS المرسل (workeros-theme-fixed-7.zip).
