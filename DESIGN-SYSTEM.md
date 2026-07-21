# Mobile Shop 2026 — Design System & UI Patterns

نظام تصميم متكامل بستايل **Bento Modern 2026** (Apple/Vercel/Linear inspired) — مطبق على منصة Mobile Shop SaaS.

## 🎨 ما الجديد في 2026

| الجانب | القديم | الجديد 2026 |
|--------|--------|-------------|
| **الستايل** | Flat / Material | Bento Modern + Glassmorphism خفيف |
| **الألوان** | HSL ثابت | OKLCH (دقة لونية أعلى) + Dual Theme |
| **الخطوط** | system-ui | IBM Plex Sans Arabic + JetBrains Mono |
| **الـ Layout** | Grid متماثل | Bento Grid غير متماثل + KPI Cards |
| **الحركة** | لا يوجد | Spring easings + Stagger animations |
| **الـ Radius** | rounded-md فقط | 7 مستويات (xs→3xl) |
| **الـ Shadows** | ظل واحد | 5 مستويات متدرجة + glow effects |

## 📁 البنية

```
src/
├── app/
│   ├── layout.tsx              # RTL + Arabic fonts
│   ├── globals.css             # Design Tokens (الألوان، الخطوط، إلخ)
│   ├── page.tsx                # Landing page
│   ├── design-system/          # 🎨 توثيق بصري كامل
│   ├── dashboard/              # 📊 لوحة تحكم Bento
│   ├── products/               # 📦 جدول المنتجات
│   ├── pos/                    # 🛒 نقطة بيع POS
│   ├── invoices/               # 🧾 الفواتير
│   └── login/                  # 🔐 تسجيل الدخول
├── components/
│   ├── ui/                     # 11 مكوّن أساسي (Button, Card, Input, ...)
│   ├── layout/                 # Sidebar, Topbar, PageHeader, BentoGrid
│   ├── bento/                  # KpiCard (Bento-style)
│   └── charts/                 # Sparkline, BarChart, DonutChart (pure SVG)
└── lib/
    ├── utils.ts                # cn() + formatters (EGP, date, number)
    ├── auth.ts                 # JWT helpers
    └── prisma.ts               # Prisma client
```

## 🎨 نظام الألوان

- **Brand**: Violet (brand-50 → brand-950) — `oklch` based
- **Accent**: Cyan (للـ data viz)
- **Status**: success (green), warning (amber), danger (red)
- **Neutral**: Zinc-based مع دعم Light + Dark

## 🧩 المكوّنات الجاهزة

### UI Components (11)
- `Button` (8 variants × 6 sizes)
- `Card` (4 variants: default, subtle, elevated, bento)
- `Badge` (8 variants) + `StatusDot`
- `Input`, `Textarea`, `Label`, `Field`
- `Table` (مع hover + selected)
- `Dialog`, `Tabs`, `Switch`, `Progress`, `Avatar`, `Separator`, `Skeleton`, `Tooltip`

### Layout Components
- `Sidebar` (مع sections + active states + RTL aware)
- `Topbar` (sticky + backdrop blur + search)
- `PageHeader` (title + description + actions + breadcrumb)
- `BentoGrid` + `BentoCell` (col-span + row-span)

### Bento Components
- `KpiCard` (title + value + delta + icon + sparkline + 5 variants)
- `Sparkline` (pure SVG, no deps)
- `BarChart` (pure SVG)
- `DonutChart` (pure SVG + center label)

## 🎯 الـ Patterns المطبقة

1. **KPI Cards Row** — 4 بطاقات بألوان مختلفة + sparklines
2. **Bento Dashboard Layout** — 3 cols، خلية كبيرة للـ chart + Donut + 2 خلايا صغيرة
3. **Data Table** — مع filters, tabs, pagination, hover actions
4. **POS Interface** — Sidebar مصغر + product grid + cart panel + payment methods
5. **Auth Split Layout** — Form على اليمين + visual على اليسار

## 🌐 RTL Support

- `dir="rtl"` على root html
- Border directions (`border-l` بدل `border-r`)
- Icons mirroring (`.rtl-flip` class)
- Text alignment افتراضي `text-right`
- Number formatting بالعربية (`Intl.NumberFormat("ar-EG")`)

## 🚀 التشغيل

```bash
# 1. تثبيت الـ dependencies
npm install   # أو: bun install

# 2. إعداد البيئة
cp .env.example .env
# عدّل DATABASE_URL, DIRECT_URL, JWT_SECRET

# 3. تجهيز قاعدة البيانات
npm run db:generate
npm run db:push

# 4. تشغيل التطوير
npm run dev
```

ثم افتح:
- http://localhost:3000 — Landing page
- http://localhost:3000/design-system — 🎨 التوثيق البصري الكامل
- http://localhost:3000/dashboard — لوحة التحكم
- http://localhost:3000/pos — نقطة البيع
- http://localhost:3000/products — المنتجات
- http://localhost:3000/invoices — الفواتير
- http://localhost:3000/login — تسجيل الدخول

## 🛣️ خارطة طريق التطبيق على باقي النظام

| المرحلة | النطاق | المدة |
|---------|--------|-------|
| **1. Tokens** | تطبيق `globals.css` على كل الصفحات | يوم |
| **2. Components** | استبدال المكوّنات القديمة بـ `@/components/ui/*` | 3-5 أيام |
| **3. Layouts** | تطبيق `Sidebar` + `Topbar` على كل المجموعات | يوم |
| **4. Pages** | ترحيل الصفحات للـ BentoGrid + KpiCard | أسبوع |
| **5. Motion** | إضافة animations + micro-interactions | 3 أيام |
| **6. Dark Mode** | تفعيل theme switcher على كل الصفحات | يوم |

## 📝 ملاحظات

- كل الألوان معرّفة في `globals.css` بـ OKLCH (أكثر دقة من HSL)
- الـ Charts رسوم SVG صافية بدون dependencies (لا Recharts مطلوب للـ basics)
- الـ Sidebar يدعم `active` state مع شريط ملوّن على اليمين (RTL)
- الخط الافتراضي: **IBM Plex Sans Arabic** (يحمّل من Google Fonts تلقائياً)
