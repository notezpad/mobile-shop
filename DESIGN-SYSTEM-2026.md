# نظام المحل — تطوير الستايل 2026 (Emerald Premium · Bento Modern)

تم تطوير نظام التصميم على المشروع **الأصلي** (مش إعادة بناء) — كل التعديلات على الـ tokens والمكوّنات الموجودة، مع إضافة Bento patterns جديدة للـ Dashboard.

---

## 🎯 الفهم الأساسي للمشروع

منصة SaaS متعددة المستأجرين لإدارة:
- **محلات الموبايل والكمبيوتر** (electronics vertical)
- **محلات الملابس والأحذية** (fashion vertical)
- **جملة وقطاعي** (wholesale + retail عبر `ProductUnit` بـ factor)

الباقة (Plan) تحدد:
- الـ modules المفعّلة (POS, products, sales, maintenance, customers, suppliers, ...)
- الـ capabilities (multi_unit للجملة، collections للأزياء)

---

## 🎨 القرارات التصميمية (وليه)

| القرار | السبب |
|--------|------|
| **الحفاظ على الأخضر كلون primary** | الأخضر = ثقة + نمو + مناسب للسوق المصري. تغييره كان هيكسر الإحساس البصري الموجود. |
| **تطوير الأخضر من `oklch 0.55 0.18 142` → "Emerald Premium 162"** | أخضر أعمق وأكثر تطوراً (hue 162 بدل 142) — نفس الإحساس لكن أنسب لستايل 2026. |
| **إضافة Accent لون amber/ذهبي (`--color-accent2-*`)** | يوازن برودة الأخضر، يخدم الباقات الـ B2B (يشعر بـ premium)، يستخدم في الـ gradient badges والـ top-product rank. |
| **إضافة Status tokens كاملة** | `success-subtle`, `warning-subtle`, `danger-subtle`, `info-subtle` — استبدلت inline classes عشوائية في `DashboardView` بمكوّنات موحّدة. |
| **إضافة BentoGrid + KpiCard** | الـ Dashboard القديم كان grid متماثل (4+4 بطاقات). Bento 2026 هيكله غير متماثل مع sparklines و deltas. |
| **إضافة Sparkline + DonutChart (pure SVG)** | أسرع من Recharts للـ mini-charts، بدون dependencies إضافية. |
| **Dark Mode كامل + ThemeToggle** | مطلوب عالمياً 2026. الـ ThemeToggle في الـ Sidebar footer. |
| **تطوير Sidebar (إزالة inline styles)** | كان فيه inline styles كتيرة (gradient أحمر للـ logout، gradient أخضر للـ avatar، box-shadow عشوائي). استبدلتها بـ tokens. |

---

## 📂 الملفات اللي اعدّلتها

### 1. Design Tokens
- **`src/app/globals.css`** (إعادة كتابة كاملة)
  - إضافة brand scale (emerald 11 stops) + accent scale (amber 7 stops)
  - إضافة status tokens (success/warning/danger/info مع `subtle` variants)
  - إضافة radius scale (7 مستويات: xs → 3xl)
  - إضافة motion tokens (spring/out/inOut easings + fast/base/slow durations)
  - إضافة shadow tokens (6 مستويات: xs → xl + glow)
  - Light + Dark theme محسّن (backgrounds أكثر دفئاً، primary أعمق)
  - Utility classes: `.bento-surface`, `.gradient-text`, `.gradient-brand`, `.bg-grid`, `.glow-emerald`, `.gradient-border`, `.shimmer`, `.tabular-nums`, `.rtl-flip`
  - Animation utilities: `.animate-in-up`, `.animate-scale-in`, `.animate-fade`, `.stagger-1` → `.stagger-6`

- **`tailwind.config.ts`** (توسيع)
  - إضافة `brand.*` (50-950) و `accent2.*` (50-600) كـ tailwind colors
  - إضافة `success/warning/info` بـ `DEFAULT/foreground/subtle/subtle-foreground`
  - إضافة `border-strong`, `input-hover`
  - إضافة `borderRadius` (xs → 3xl)
  - إضافة `boxShadow` (xs → xl + glow)
  - إضافة `transitionTimingFunction` (spring/out/in-out) و `transitionDuration` (fast/base/slow)
  - إضافة keyframes/animation (in-up, scale-in, shimmer)

### 2. UI Components (تحسين existing)

- **`src/components/ui/button.tsx`**
  - إضافة variants: `gradient` (emerald 600→500), `gradient-warm` (emerald→amber), `subtle` (primary-subtle)
  - إضافة sizes: `xl` (h-12), `icon-sm` (size-8), `icon-lg` (size-12)
  - إضافة `active:scale-[0.98]` للـ tactile feedback
  - Smooth transitions على hover (`duration-base ease-out`)

- **`src/components/ui/card.tsx`**
  - إضافة `variant` prop: `default | bento | elevated | subtle`
  - `bento` variant: hover lift (`-translate-y-0.5`) + brand border hint
  - إضافة `glow` prop (radial halo على hover)

- **`src/components/ui/badge.tsx`**
  - إضافة variants: `success`, `warning`, `danger`, `info`, `subtle`, `gradient`
  - إضافة `destructive` كـ alias لـ `danger` (backward-compat)
  - إضافة `size` prop (`default | sm | lg`)
  - إضافة `StatusDot` component (مع pulse option)

- **`src/components/ui/input.tsx`**
  - إضافة `icon` prop (لـ search/barcode fields)
  - إضافة `error` prop (destructive styling)
  - Smooth border transitions (input → input-hover → primary)

- **`src/components/ui/table.tsx`**
  - تغيير `selected` state من `bg-muted` لـ `bg-primary-subtle/40`

### 3. Bento Components (جديدة)

- **`src/components/bento/bento-grid.tsx`** — شبكة Bento غير متماثلة (cols 2-5)
- **`src/components/bento/kpi-card.tsx`** — بطاقة KPI بـ delta + sparkline + 6 variants
- **`src/components/charts/sparkline.tsx`** — mini line chart (pure SVG, no deps)
- **`src/components/charts/donut-chart.tsx`** — donut مع center label (pure SVG)

### 4. Shop Components (تطوير)

- **`src/components/shop/Sidebar.tsx`** (إعادة كتابة كاملة)
  - إزالة كل inline styles (gradient أحمر، box-shadow عشوائي)
  - استخدام `bg-primary-subtle text-primary-subtle-foreground` للـ active state
  - Active indicator: شريط primary-colored على الـ inner edge
  - إضافة `ThemeToggle` (Sun/Moon) في الـ footer
  - الـ Logout بـ `destructive-subtle` بدل gradient أحمر
  - Brand badge أحسن (font-bold + tracking-tight + subtitle)

- **`src/components/shop/DashboardView.tsx`** (إعادة كتابة كاملة)
  - استبدال `StatCard` بـ `KpiCard` (مع delta + sparkline)
  - استخدام `BentoGrid` + `BentoCell` (col-span + row-span)
  - إضافة sparklines لمبيعات اليوم وربح اليوم (7-day trend)
  - Donut placeholder جاهز (لو حابب تضيفه)
  - Status dots بدل inline classes في low-stock list
  - Rank badges (gold/silver/bronze) بـ accent2 tokens
  - Maintenance status بـ badge variants موحّدة (info/warning/success)
  - Stagger animations للـ entrance

---

## ✅ التحقق

```
✓ TypeScript compilation passed
✓ Next.js build: "Compiled successfully in 15.5s"
✓ All 4 static pages generated
✓ All 67 API routes preserved
✓ All 110 components preserved
```

---

## 🚀 التشغيل

```bash
npm install
cp .env.example .env  # عدّل DATABASE_URL, JWT_SECRET
npm run db:generate
npm run db:push
npm run dev
```

افتح `http://localhost:3000` → سجّل دخول بـ `admin@demo.com` / `admin123` → شوف:
- **Sidebar**: Theme toggle + active states + brand badge
- **Dashboard**: Bento KPI cards + sparklines + top products + low stock
- **باقي الصفحات**: بتورّث الـ tokens الجديدة تلقائياً (Button, Card, Badge, Table)

---

## 🛣️ خطوات مستقبلية مقترحة

| الأولوية | المهمة | النطاق |
|---------|--------|--------|
| عالية | تطوير `POSView.tsx` بـ Bento patterns | POS interface (721 سطر) |
| عالية | تطوير `ProductsView.tsx` بـ table الجديدة | Products list (573 سطر) |
| متوسطة | تطوير `LandingPage` بـ gradient-brand | Landing sections (13 section) |
| متوسطة | تطوير `SuperAdminApp` بـ KpiCard | Admin dashboard |
| منخفضة | إضافة DonutChart للـ payment methods | DashboardView |
| منخفضة | تطوير ReportsView بـ chart tokens | Reports |

---

## 📝 ملاحظات تقنية

- كل الألوان بـ `oklch` (أدق من HSL، يدعم P3 gamut)
- الـ charts الرسوم SVG صافية (Sparkline + Donut) — بدون dependencies إضافية
- Recharts لسه موجود للـ bar charts الكبيرة في DashboardView
- `tabular-nums` على كل الـ KPI values لمنع jitter
- `rtl-flip` class للأيقونات الاتجاهية (arrows, chevrons)
- الـ ThemeToggle بيستخدم `next-themes` الموجود بالفعل في `providers.tsx`
