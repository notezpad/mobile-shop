# Paymob — صفحة دفع الباقات (دليل التطبيق)

## نظرة عامة

تم إضافة سلسلة دفع متكاملة عبر Paymob تتيح للمستخدم:
- اختيار باقة (شهري/سنوي)
- الدفع عبر المحافظ الإلكترونية (Vodafone Cash, Instapay, Fawry) أو البطاقات
- تفعيل الاشتراك تلقائياً بعد نجاح الدفع
- تجديد الاشتراك قبل انتهائه

## البنية الجديدة

```
src/
├── lib/
│   ├── paymob.ts                                  ⭐ مكتبة Paymob (auth, order, payment_key, iframe URL, HMAC verify)
│   └── env.ts                                     🔧 إضافة أسماء متغيرات Paymob
├── app/
│   ├── api/
│   │   └── paymob/
│   │       ├── checkout/route.ts                  ⭐ POST — بدء جلسة الدفع
│   │       ├── webhook/route.ts                   ⭐ POST — استقبال إشعارات Paymob
│   │       └── return/route.ts                    ⭐ GET — التحقق بعد عودة المستخدم
│   ├── upgrade/page.tsx                           ⭐ صفحة نتيجة الدفع (نجاح/فشل)
│   ├── page.tsx                                   🔧 إضافة UpgradeDialog للشاشات المنتهية/المنبهة
│   └── components/shop/
│       ├── SettingsView.tsx                       🔧 إضافة قسم "الاشتراك الحالي" + أزرار التجديد
│       └── UpgradeDialog.tsx                      ⭐ نافذة اختيار الباقة + فترة + زر الدفع
```

## سير العمل (User Flow)

```
┌────────────────────────────────────────────────────────────┐
│ 1. المستخدم يدخل → SettingsView أو SubscriptionExpiredScreen│
│    ↓ يضغط "اشترك الآن" / "تجديد" / "ترقية"                    │
│ 2. UpgradeDialog تفتح → يختار باقة + فترة                    │
│    ↓ يضغط "الدفع الآن عبر Paymob"                              │
│ 3. POST /api/paymob/checkout                                  │
│    → ينشئ Subscription row (status=pending)                  │
│    → يستدعي Paymob: auth → order → payment_key              │
│    → يرجع checkoutUrl (iframe URL)                            │
│    ↓ redirect للـ checkoutUrl                                │
│ 4. Paymob iframe — المستخدم يدخل رقم المحفظة/البطاقة + OTP    │
│    ↓ بعد النجاح                                                │
│ 5. (A) Paymob webhook → /api/paymob/webhook                  │
│       → يتحقق HMAC + يفعلّل الاشتراك                          │
│ 5. (B) المتصفح redirect → /api/paymob/return                │
│       → يستعلم Paymob API للتأكيد                            │
│       → يفعّل الاشتراك لو نجح                                  │
│       → redirect إلى /upgrade?status=success                 │
│ 6. /upgrade/page.tsx — يعرض رسالة نجاح + زر "للوحة التحكم"    │
└────────────────────────────────────────────────────────────┘
```

## خطوات الإعداد (هام جداً)

### 1. متغيرات البيئة

أضف إلى ملف `.env` (لو في تطوير) أو Cloudflare Worker secrets (لو في إنتاج):

```env
# من Paymob dashboard > Profile > API Keys
PAYMOB_API_KEY="egy_sk_live_XXXXXXXXXXXXXXXXXXX"

# المفتاح العام (موجود عندك)
PAYMOB_PUBLIC_KEY="egy_pk_live_JLVJJQFdxEoLisGef0Y0OMNbRgHX8Rgj"

# من Paymob dashboard > Integrations > Integration Details
PAYMOB_INTEGRATION_ID="5835805"

# من Paymob dashboard > Settings > Iframe IDs
PAYMOB_IFRAME_ID="12345"  # ← بدّل ده برقم iframe بتاعك

# من Paymob dashboard > Profile > HMAC Secret
PAYMOB_HMAC_SECRET="XXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# URL تطبيقك (بدون /)
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

**ملاحظات**:
- `PAYMOB_API_KEY` لازم تطلبه من Paymob dashboard → Profile → API Keys (هو مشهور، وده secret — ما تطلعهوش لأي حد).
- `PAYMOB_IFRAME_ID` لازم تطلبه من Paymob dashboard → Settings → Iframe IDs — ابحث عن iframe مرتبط بـ Integration ID `5835805`.
- `PAYMOB_HMAC_SECRET` لازم تطلبه من Paymob dashboard → Profile → HMAC Secret.

### 2. إعداد الـ webhook في Paymob

- ادخل Paymob merchant dashboard.
- اذهب إلى **Profile** → **Webhook Notifications** (أو Account Settings → Webhooks).
- اضبط الـ URL على: `https://your-domain.com/api/paymob/webhook`
- اضبط الحقول (HMAC) على: `All` أو على الأقل `Transaction Status`.
- احفظ الـ HMAC Secret في `PAYMOB_HMAC_SECRET`.

### 3. تأكد من الـ Integration ID

من السكرين شوت: Integration ID = `5835805` (متجر `UIG` / `online_new`).
تأكد إن ده هو الـ integration اللي تريد استخدامه للباقات.

### 4. أعد التشغيل

```bash
npm run dev
# أو
npm run build && npm start
```

## أين تظهر أزرار "اشترك/تجديد/ترقية"

| الظهور | الشرط | النص |
|------|------|------|
| SettingsView → بطاقة "الاشتراك الحالي" | دائماً (لو `sub` loaded) | "اشترك الآن" / "تجديد الاشتراك" / "ترقية الباقة" حسب الحالة |
| SubscriptionWarningBanner (top bar) | `expiringSoon === true` | "تجديد الآن" |
| SubscriptionExpiredScreen (full screen) | `expired === true` | "اشترك الآن" (داخل البطاقة) |

## كيف يعمل تفعيل الاشتراك

عند نجاح الدفع في الـ webhook:
1. نجيب الـ subscription row الـ `status='pending'` من `merchant_order_id` (مخزّن بصيغة `sub-<subscriptionId>`).
2. نحدّثه: `status='active'`, `amountPaid=<amount>`, `endDate=<extended>`.
3. **لو اشتراك سابق لسه فعّال**، نمدد `endDate` (لا نضيف مدة جديدة — ده سلوك SaaS القياسي).
4. نحدّث `tenant.status='active'`.

## حالات الـ subscription

| status | المعنى |
|------|------|
| `pending` | تم بدء الدفعة في Paymob، لسه ما خلصتش |
| `active` | تم الدفع بنجاح، الاشتراك فعّال حتى `endDate` |
| `failed` | الدفعة فشلت (مرفوضة، voided، أو خطأ في الـ API) |
| `cancelled` | الأدمن ألغى الاشتراك |

## ملاحظات أمنية

1. **`PAYMOB_API_KEY` و `PAYMOB_HMAC_SECRET`** لازم يكونوا server-side only — ما تتعرضوش للـ client.
2. **الـ webhook بيستخدم HMAC** للتحقق من أصله — لو الـ HMAC فشل، نرجّع 400 وما نعالجش.
3. **الـ return endpoint** بيستعلم Paymob API للتأكد — ما نعتمدش على URL parameters فقط لأنها غير موقعة.
4. **`PAYMOB_PUBLIC_KEY`** معروض في الـ .env.example لكنه **لا يُستخدم** في الكود الحالي (لازِم فقط للـ Mobile SDK أو الـ JS SDK المباشر).
5. **`PAYMOB_INTEGRATION_ID=5835805`** — ده ID بتاعك من السكرين شوت.
6. **كل المبالغ بـ EGP** وبتتحوّل لـ cents (`Math.round(amount * 100)`) قبل إرسالها لـ Paymob.

## اختبار التدفق

1. سجّل محل جديد — الاشتراك هيكون `trial` (14 يوم).
2. ادخل SettingsView → هتلاقي بطاقة "الاشتراك الحالي".
3. اضغط "ترقية الباقة" → تفتح UpgradeDialog.
4. اختر باقة + فترة → اضغط "الدفع الآن عبر Paymob".
5. هتتحوّل لـ iframe Paymob — أدخل رقم محفظة وهمية (في sandbox) أو حقيقي.
6. بعد النجاح هتتحوّل لـ `/upgrade?status=success`.
7. ارجع للوحة التحكم → الاشتراك فعّال.

## اختبار في sandbox (بدون دفع حقيقي)

Paymob مش بتوفر sandbox بيومنا هذا — لازم تختبر ببطاقة/محفظة حقيقية بمبلغ صغير. أو استخدم ميزة "Refund" في Paymob dashboard لاسترداد المبلغ بعد الاختبار.

## استكشاف الأخطاء

| المشكلة | السبب المحتمل | الحل |
|--------|------------|------|
| "فشل إنشاء جلسة الدفع" | `PAYMOB_API_KEY` غير مضبوط | تأكد من قيمة الـ API key |
| Iframe يفتح لكن الدفع يفشل | `PAYMOB_INTEGRATION_ID` خطأ | راجع Integration Details |
| Webhook ما بيستقبلش | URL مش مضبوط في Paymob dashboard | اضبط webhook URL + HMAC |
| الاشتراك ما يتفعلّش بعد الدفع | HMAC secret لا يطابق | راجع `PAYMOB_HMAC_SECRET` |
| Redirect لـ /upgrade?status=failed | الدفع مرفوض من المحفظة | تأكد من رصيد المحفظة |

## الملفات الجديدة المُضافة في هذه الجولة

- `src/lib/paymob.ts` (300+ سطر — المكتبة)
- `src/app/api/paymob/checkout/route.ts`
- `src/app/api/paymob/webhook/route.ts`
- `src/app/api/paymob/return/route.ts`
- `src/app/upgrade/page.tsx`
- `src/components/shop/UpgradeDialog.tsx`

## الملفات المُعدّلة

- `src/lib/env.ts` (إضافة 5 أسماء متغيرات Paymob)
- `src/app/page.tsx` (إضافة UpgradeDialog + Sparkles import + تحديث SubscriptionWarningBanner + SubscriptionExpiredScreen)
- `src/components/shop/SettingsView.tsx` (إضافة قسم "الاشتراك الحالي")
- `.env.example` (إضافة Paymob block)

## ما الذي يحدث بعد نجاح الدفع؟

1. الـ webhook يفعّل الـ subscription row.
2. الـ tenant.status يصبح `active`.
3. المستخدم يرى صفحة `/upgrade?status=success` مع ملخص الباقة والفترة.
4. عند الضغط على "الذهاب للوحة التحكم"، يعود لـ `/` — ويكون لديه صلاحية كل الـ modules في الباقة.
