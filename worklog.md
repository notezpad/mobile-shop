
---
Task ID: 8
Agent: main (Super Z)
Task: إصلاح 500 في /api/admin/tracking/funnel (الإصدار المُوصل للمستخدم) + استرجاع المشروع بعد تصفير الورك سبيس

Work Log:
- الورك سبيس اتصرّف بالكامل بعد إعادة التشغيل (فقط .env و download/README.md) — استرجعنا المشروع كاملاً بتنزيل nezam-developed-final.zip من gofile (تتبع رابط التنزيل المباشر عبر سحب guest token من الجلسة في متصفح headless)
- تشخيص 500 المستخدم (سكرين شوت: GET /api/admin/tracking/funnel?from=... → 500): مسارا Funnel وAttribution يستخدمان $queryRaw خام بدون أي حماية — أي فشل في بيئة التشغيل (wasm/Hyperdrive) = 500. مسار UTM كان محمياً بالفعل بـ tablesReady
- إصلاح Funnel: سلسلة ثلاثية — SQL خام → احتياطي ORM كامل (getFunnelFallback في analytics.ts — نفس الأرقام distinct eventId مع dedup المزودين، بدون فلاتر source/medium/campaign) → قيم فارغة + dataReady=false + errorDetail — لا يرجع 500 أبداً
- إصلاح Attribution: try/catch → 200 + rows=[] + dataReady=false + errorDetail
- بانر مشترك DataIssueBanner في shared.tsx (كهرماني + تفاصيل الخطأ قابلة للطي) موصول في TrackingFunnel وTrackingAttribution — يعرض السبب الحقيقي من الإنتاج لنشخّصه إن تكرر
- إعادة تطبيق إصلاح sanitizeId (ضاع مع التصفير): sanitize.ts + PUT admin/tracking + saveTrackingConfig + AdminTrackingView (onChange + save) — وتحذير مخصص جديد لو المستخدم وضع بريد إلكتروني في خانة GA4 ID
- اختبارات: smoke (8/8 تحميل المسارات + sanitize) وfunnel-behavior (9/9: فشل خام → 200 + أرقام حقيقية بـ dedup + degraded flag، ومع فلتر إسناد → 200 + dataReady=false) + tsc نظيف + eslint نظيف

Stage Summary:
- القمع لا يعطي 500 في أي سيناريو — وإن فشل الخام في الإنتاج يعرض أرقاماً حقيقية فوراً + السبب التقني في البانر
- يحتاج على الإنتاج: تشغيل TRACKING_TABLES.sql المحدّث (يضيف UtmCampaign — idempotent)
- ملاحظة إعدادات المستخدم من الكونسول: البريد الإلكتروني في خانة GA4 وG-EF3L421RLW في خانة GTM — يجب تصحيح المواضع

---
Task ID: 9
Agent: main (Super Z)
Task: تشخيص وإصلاح خطأ 42601 (syntax error at or near "$1") في استعلامات القمع/الإسناد على إنتاج Cloudflare — بعد أن كشف البانر السبب الحقيقي للمستخدم

Work Log:
- المستخدم وسّع تفاصيل البانر: "Raw query failed. Code: 42601 — syntax error at or near $1" — الـ banner ظهر بالمكشوفة زي ما صممناه في المهمة 8 وسبب التشخيص الفعلي
- بنينا rig تشخيصي: mock driver adapter يسجل (sql, args) النهائية من PrismaClient — أولاً على عميل Node (استعلامات سليمة) ثم على عميل @prisma/client/wasm نفس نسخة الإنتاج عبر محاكاة navigator.userAgent='Cloudflare-Workers' + رقعة wasm loader (WebAssembly.compile من ملف wasm)
- الجذر المؤكد: عميل wasm يبوّظ تسلسل أجزاء Prisma.sql/Prisma.raw/Prisma.empty داخل $queryRaw — يحولها لباراميترات بدل دمجها في النص: الاستعلام كان يصل Postgres حرفياً "WITH $1 ev AS (...) SELECT ... $4 AS registrations" → 42601. محرك Node يدمجها صح ولهذا كانت الاختبارات المحلية تمر بينما الإنتاج يفشل. (Prisma join واجه نفس المصير: IN ($1) بقايمة كاملة داخل باراميتر واحد)
- الإصلاح: إعادة كتابة getFunnel/getAttribution/getCampaignPerformance في analytics.ts بنصوص SQL مسطحة + باراميترات قياسية فقط عبر $queryRawUnsafe — باني RawQuery صغير يضمن تطابق ترقيم $n مع ترتيب القيم. نفس دلالات العدّ حرفياً (distinct eventId، dedup المزودين، first/last touch، فلاتر المصدر/الوسيط/الحملة). المعرفات الديناميكية من قوائم ثابتة فقط — لا حقن
- إصلاح إضافي موروث: getCampaignPerformance كان يسجل التسجيلات صفراً للأبد (أحداث CompleteRegistration بلا subscriptionId تُفلتر بـ WHERE) — ربط الإسناد للأحداث عبر CASE: signup-<userId> للتسجيلات وu."id" للباقي (نفس أسلوب تقرير الإسناد الموثق في ترويسة الملف)
- تحقق ثلاثي: (1) rig عميل wasm — 5 استعلامات، كل القيم قياسية والنوابض مطابقة بلا فجوات، (2) Postgres حقيقي عبر pglite — 28/28 فحص دلالي بأرقام محسوبة يدوياً (dedup، فلاتر منصة/إسناد، first/last، فرز revenue، أداء الحملات)، (3) مجموعات smoke + funnel-behavior (stub $queryRawUnsafe يرمي 42601 wasm mock → fallback يعمل) — كلها خضراء + tsc نظيف + eslint نظيف

Stage Summary:
- استعلامات التحليلات تعمل الآن على المحركين (Node و WASM) — القمع والإسناد وأداء الحملات لن يعودوا يرمون 42601 على Cloudflare
- نفس حزمة nezam-developed-final.zip — المسارات محمية أصلاً ولا يلزم تغيير على Supabase إضافي لما سبق (مع بقاء توصية تشغيل TRACKING_TABLES.sql لتفعيل UtmCampaign كاملة)

---
Task ID: 10
Agent: main (Super Z)
Task: مراجعة شاملة (Full Audit) لقسم Marketing & Tracking من الأول للآخر — التأكد من صحة تدفق البيانات من كل المنصات والبكسلات

Work Log:
- قراءة كاملة لكل ملفات الطبقة (22 ملفاً): client.ts/server.ts/types/config/sanitize/analytics/utm + كل المسارات (/api/track, /api/tracking/*, /api/admin/tracking/*, paymob checkout/webhook/status, signup, start-trial) + المكونات (TrackingBootstrap, ConsentBanner, AdminTrackingView, Funnel/Attribution/UTM) + TRACKING_TABLES.sql + schema.prisma
- تحقق من سلسلة الأحداث الستة كاملة: PageView (داخلي) → ViewContent (relay) → CompleteRegistration/StartTrial (signup) → InitiateCheckout (paymob checkout) → Purchase (webhook + status self-healing + purchase-info للمتصفح) — كل نقطة تُطلق فقط بعد نجاح العملية الحقيقي في DB + non-blocking
- تحقق من Deduplication: نفس eventId ثابت (purchase-sub-N / trial-sub-N / checkout-sub-N / signup-<userId>) بين المتصفح والسيرفر + فهرس فريد (provider,eventId) + alreadySent قبل الإرسال + upsert للتسجيل
- تحقق من الأمان: أسرار لا تعود للمتصفح أبداً (GET مسحّب + PUT فارغ=بدون تغيير + __CLEAR__) + whitelist صارم في /api/track + أنماط محجوزة + حذف userData من المتصفح + sanitizeId مزدوج (واجهة+سيرفر) + requireSuperAdmin على كل مسارات الإدارة
- تحقق من Consent: Google Consent Mode v2 (defaults قبل أي سكريبت + wait_for_update) + Meta/TikTok مؤجلة حتى موافقة التسويق + بانر حقيقي + زر إعادة فتح + استعادة القرار المحفوظ
- 🐛 إصلاح 1 (أهم اكتشاف): /api/track كان يسبق eventId بـ relay- → بكسل المتصفح يرسل vc-xxx والـ CAPI يرسل relay-vc-xxx → Meta/TikTok لا تطابق بينهما → ViewContent يُحسب مرتين. أُزيلت البادئة (نفس eventId حرفياً — شرط Dedup) — الكود صار يطابق التعليق الموثق في ترويسة المسار
- 🐛 إصلاح 2: /api/track كان يستخدم void trackServerEvent بدل runNonBlocking → على Cloudflare Workers الإرسال قد يُلغى بعد رجوع الاستجابة. أصبح runNonBlocking (waitUntil) مثل باقي المسارات
- 🐛 إصلاح 3: Meta Test Mode كان معطلاً فعلياً — سطر ميت test_event_code: undefined ولا توجد خانة كود اختبار لـ Meta. أُضيف meta.testEventCode كاملاً (types + defaults + merge + save + sanitizePatch + خانة في اللوحة بنفس نمط TikTok) — عند Test Mode + كود → أحداث Meta تروح لـ Test Events بدل تلوث بيانات الإنتاج
- إصلاحات TS تتبعية: signup/page.tsx أضاف planName لتوحيده مع استجابة السيرفر + checkout/callback أصلح ضياع narrowing لـ merchantOrderId (إعلان دالة hoisted)
- تحقق نهائي: node scripts/tracking-test/build-tests.mjs (smoke 8/8 + funnel-behavior 9/9 خضراء) + tsc نظيف على كل ملفات التتبع + eslint نظيف على الملفات المعدلة

Stage Summary:
- 3 أخطاء حقيقية اتصلحت: ازدواج عدّ ViewContent في Meta/TikTok، إلغاء إرسالات relay على Cloudflare، تلوث بيانات الإنتاج في Meta Test Mode
- ملاحظات مرصودة بدون تغيير (قرارات منتج): أحداث السيرفر لا تفحص موافقة المستخدم (compliance للسوق الأوروبي)، externalId يختلف بين signup (user.id) وpurchase (tenantId) — اختياري توحيده، لا rate limiting على /api/track و/pageview (خطر منخفض)
- القمع/الإسناد/UTM/الحملات كلها تعمل على المحركين بعد إصلاح 42601 السابق — لا حاجة لأي تغيير على Supabase إضافي

---
Task ID: 11
Agent: main (Super Z)
Task: إصلاح فلاش اللاندنج عند ريفرش لوحة الأدمن ("كل اعمل ريفرش بتظهر الرئيسية و بعدها تظهر لوحة الادمن")

Work Log:
- التشخيص: لوحة السوبر أدمن بتعيش على "/" داخل HomeGate — الـ HTML الأولاني من السيرفر هو اللاندنج (تصميم SEO مقصود من جيل سابق)، وحالة boot='checking' بترندر اللاندنج كمان على الكلايانت → المستخدم المسجّل كان بيشوف اللاندنج طوال رحلة getMe() (نتورك روند تريب) + تحميل chunk SuperAdminApp الديناميكي قبل ما اللوحة تظهر
- قيود اكتشفت أثناء التحليل: الـ store عمداً مش بيحفظ user (partialize = drafts بس) → أي حل تفاؤلي كان هيتمسح فوراً بـ effect الخروج (سطر !user && boot===superadmin) — لازم verifiedRef يمنع الـ effects تعتمد على قرار قبل تأكيده من السيرفر؛ وlazy useState initializer ممنوع (hydration mismatch مع HTML السيرفر)
- الحل (Fast-boot): آخر قرار مؤكد (superadmin + نسخة عرض AuthUser) بيتخزن sessionStorage (nezam:home-gate-boot — يعيش لحد إغلاق التاب بس) وبيتطبّق قبل أول paint عبر useLayoutEffect بـ iso-pattern (typeof window) → أول render بيطابق السيرفر (لا mismatch) والفلاشة بتختفي تماماً
- مصدر الحقيقة فضل السيرفر: getMe() شغال زي ما هو في الخلفية — لو الكاش قديم (خروج/حظر/تغيير دور/impersonation) القرار بيتصحح فوراً بعد الرد (guest → لاندنج + مسح كاش، shop → مسح كاش + /dashboard)، ونسخة العرض بتتنضف بـ setUser(null) في مسار guest
- auth-client.ts: تصدير HOME_GATE_BOOT_KEY + clearHomeGateBootCache() مع مسح تلقائي في apiLogin الناجح وapiLogout — عشان الكاش ما يعيش أطول من سيشن (جهاز مشترك آمن)
- تحقق صارم عند القراءة: boot==='superadmin' + role==='SUPER_ADMIN' + userId string — أي شكل فاسد → تجاهل والمسار الطبيعي
- سيناريوهات مغطاة: ريفرش أدمن (فوري بلا فلاش) / زائر أو بوت (بلا كاش → لاندنج فوري زي ما هو — SEO سليم) / خروج (الكاش بيتمسح من 3 مسارات: effect الخروج + apiLogout + مسار guest) / impersonation (الكاش بيتمسح → ريفرش طبيعي) / أوفلاين PWA (getMe → IDB → نفس القرار) / تبويب خاص (setItem يفشل بصمت → سلوك عادي)
- التحقق: tsc نظيف على الملفين (الأخطاء الـ 50 في src كلها قديمة/بيئية — Prisma client غير مولّد محلياً + ignoreBuildErrors:true في next.config، والمستخدم بيعمل deploy عادي) + eslint نضيف + dev server حقيقي: GET / → 200 واللاندنج كاملة في الـ HTML

Stage Summary:
- الريفرش بعد أول زيارة للوحة بيفتحها فوراً (سبينر chunk خفيف ساعة تحميل الكود ثم اللوحة) — مفيش لاندنج خالص
- ملاحظة للمستخدم: أول ريفرش بعد الـ deploy هيبقى عادي (الكاش لسه فاضي) — من التاني وطالع الفرق
- ملفات: src/components/HomeGate.tsx (إعادة كتابة) + src/lib/auth-client.ts (تصديرات + مسح عند دخول/خروج)

---
Task ID: 12
Agent: main (Super Z)
Task: تشخيص "وضعت بيكسل فيسبوك فقط ولم تظهر أي أحداث" + لخبطة الإيميل/باسورد في حقول جوجل + قفل الفجوات المشابهة في باقي المنصات

Work Log:
- تتبع مسار Meta كاملاً (الفورم → PUT → config → client pixel → CAPI server): الحدث يمر من 5 بوابات (المفتاح الرئيسي general.enabled — افتراضياً OFF / مفتاح Meta / Pixel ID / CAPI Token لأحداث السيرفر / موافقة التسويق عند تفعيل Consent Management). حالة المستخدم: Pixel ID فقط بدون capiToken → كل أحداث السيرفر كانت تتخطى Meta بصمت تام (الشرط القديم كان يتطلب capiToken ولا يترك أي أثر)
- 🐛 إصلاح 1 (server.ts): التوكن الناقص لم يعد صمتاً — للأحداث المهمة (CompleteRegistration/StartTrial/InitiateCheckout/Purchase) يسجل صف 'skipped' في TrackingEvent برسالة عربية تحدد التوكن الناقص ومسار الحصول عليه؛ أحداث الضوضاء (PageView/ViewContent) تتخطى بصمت لعدم زحام السجل. نفس المنطق لـ TikTok (eventsApiToken) و GA4 (ga4ApiSecret)
- 🐛 إصلاح 2 (client.ts): initTracking كان يحمّل سكريبتات المنصات حتى مع المفتاح الرئيسي OFF — يخالف العقد الموثق في اللوحة. الآن: مفتاح OFF = لا تحميل لأي سكريبت (مع بقاء window.NezamTracking للتشخيص) + loadDeferredPixels محمية بنفس البوابة. (نبهت أثناء التنفيذ على خطأ deferredPixelsLoaded=false دخّلته بنفسي واتصلح فوراً — الحاجز رجع true)
- 🧪 أداة تشخيص جديدة: POST /api/admin/tracking/test (Super Admin فقط) — يبني تقرير بوابات + يرسل حدثاً اختبارياً حقيقياً عبر trackServerEvent نفسه (نفس مصير أي حدث إنتاج) ويرجع لكل منصة sent/failed/skipped + رسالة الخطأ الحرفية من المنصة (مثل #190 توكن ميتا بايظ) + إرشادات عربية حسب الحالة الفعلية + "فين تشوف الحدث" (Test Events vs Overview vs GA4 Realtime)
- 🖥️ اللوحة (AdminTrackingView): كارت "اختبار الإرسال للمنصات" بزر تشغيل + نتائج لكل منصة + فحوصات المتصفح الحية (fbq/ttq/gtag محملة؟ حالة موافقة المتصفح) + بانر أزرق "لا تحتاج إيميل أو كلمة مرور لأي منصة هنا" (معالجة مباشرة للخبطة) + تحذير كهرماني داخل كارت Meta وTikTok لما التوكن ناقص + كل خانة أصبحت تحمل مسار الوصول الفعلي للقيمة
- اختبارات: rig جديد token-missing.test.ts (4/4: مهم بدون توكن → صف بالسبب العربي / ضوضاء → صمت / توكن موجود → مسار عادي / مفتاح OFF → skipped واضح) + توسيع stub db-admin (findUnique/upsert + التقاط recordedEvents + setTrackingConfig) + الحزم القديمة smoke وfunnel-behavior كلها خضراء + tsc صفر أخطاء على كل ملف ملموس + eslint نظيف

Stage Summary:
- سبب غياب أحداث Meta عند المستخدم محسوم: CAPI Token ناقص (وأحياناً المفتاح الرئيسي/الموافقة) — والنظام لم يعد يخفي السبب: السجل والأداة الجديدة يقولانه حرفياً
- الإيميل/الباسورد: لا وجود لها في النظام — الجديد بانر يوضح ذلك + مسارات الحصول على كل معرف/توكن مكتوبة تحت كل خانة
- خطوات المستخدم المطلوبة: توليد CAPI Token من Events Manager ← Settings ← Conversions API ← Generate access token وإدخاله + التأكد من المفتاح الرئيسي + (إن رغب بالتحقق الفوري) Test Mode + Test Event Code ثم زر الاختبار
