# نظام نِظام POS — حزمة ملفات الموقع المطوَّر

مرحباً! هذه حزمة كاملة لملفات الموقع (Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma).

---

## 📦 محتويات الحزمة

```
nezam-pos-website/
├── src/                      ← كل كود الموقع
│   ├── app/                  ← صفحات الموقع العامة + كل مسارات الـ API
│   │   ├── page.tsx          ← اللاندنج + HomeGate (زائر / مسجّل / سوبر أدمن)
│   │   ├── (shop)/           ← واجهة المتجر والكاشير
│   │   ├── about-us/ · pricing/ · contact-us/ · guide/
│   │   ├── login/ · signup/ · checkout/ · upgrade/
│   │   ├── privacy-policy/ · terms-and-conditions/ · refund-policy/ · cookies-policy/
│   │   └── api/              ← 33 مجموعة مسارات API
│   ├── components/
│   │   ├── admin/            ← ⭐ لوحة تحكم السوبر أدمن (الصفحات المُعاد تصميمها)
│   │   ├── landing/ · shop/ · layout/ · charts/ · bento/ · ui/
│   ├── lib/                  ← منطق الأعمال (اشتراكات، عمولات، طباعة، باركود…)
│   └── hooks/
├── prisma/
│   ├── schema.prisma         ← مخطط قاعدة البيانات كاملاً
│   ├── migrations/           ← ترحيلات قاعدة البيانات
│   └── *.ts                  ← سكربتات صيانة وبذور الباقات
├── public/                   ← الأصول (شعارات، أيقونات، PWA، صور الدليل)
├── package.json · bun.lock   ← التبعيات
├── tsconfig.json · next.config.ts · tailwind.config.ts · postcss.config.mjs
├── eslint.config.mjs · components.json
└── .env.example              ← نموذج متغيرات البيئة
```

---

## ⭐ الصفحات التي طوّرناها في هذه الجلسة (لوحة السوبر أدمن)

كل صفحة بهويتها البصرية المستقلة تماماً — لا تشابه ولا تكرار:

| الصفحة | الملف | الهوية البصرية | الحالة |
|---|---|---|---|
| المحلات المشتركة | `src/components/admin/AdminTenantsView.tsx` | **كهرماني دافئ** (Amber) — بطاقات ترحيبية | ✅ معتمدة |
| الاشتراكات | `src/components/admin/AdminSubscriptionsView.tsx` | **تركواز داكن** (Dark Teal) — سجلّ/خزنة بنكية + طوابع + إيصالات | ✅ معتمدة |
| خطط الاشتراك | `src/components/admin/AdminPlansView.tsx` | **فولاذ صناعي + قرمزي** (Graphite + Crimson) — خط إنتاج/مصنع | ✅ معتمدة |

> ملاحظة: إعادة تصميم صفحة الباقات جاءت بعد رفض النسخة البنفسجية — النسخة
> المرفقة هنا هي نسخة «خط إنتاج الباقات» الصناعية القوية بلا أي فوشيا/بنفسجي.

كل صفحات الأدمن تحتفظ بعقود الـ API الأصلية كما هي (GET/POST/PUT/DELETE) —
أي أن الملفات **drop-in replacement**: انسخها مكان القديمة مباشرة في مستودعك.

---

## 🚀 التشغيل

```bash
bun install                # تثبيت التبعيات
cp .env.example .env       # ثم عدّل DATABASE_URL
bun run db:push            # تطبيق المخطط على القاعدة
bun run dev                # تشغيل التطوير على المنفذ 3000
```

---

## ⚠️ ملاحظات مهمة لمن سينقل الكود لمستودعه الحقيقي

هذه الحزمة جاءت من بيئة **معاينة Sandbox**، لذلك عند النقل لمستودعك الحقيقي
احذف/تجاهل هذه الإضافات الخاصة بالبيئة التجريبية فقط:

1. `src/app/page.tsx` — في البيئة هنا يحوّل مباشرة للوحة الأدمن (نسخة عرض).
   في موقعك الحقيقي ابقِ نسخة اللاندنج + HomeGate الأصلية لديك.
2. `src/lib/` — محوّلات خاصة بالـ Sandbox: `db.ts` / `env.ts` / `auth.ts` /
   `prisma-wasm.ts` / `tracking-server` (عندك النسخ الأصلية الأفضل).
3. سطر «default view» في أعلى `SuperAdminApp.tsx` (يحدد الصفحة الافتتاحية
   للعرض التجريبي فقط).
4. `prisma/seed-demo.ts` — بيانات تجريبية للمعاينة فقط.
5. سطر `datasource` في `schema.prisma` هنا SQLite — في موقعك الحقيقي
   استخدم قاعدتك الأصلية (PostgreSQL/MySQL…).

كل ما عدا ذلك (خصوصاً ملفات `src/components/admin/*View.tsx` الثلاثة
المُعاد تصميمها) جاهز للنقل كما هو.
