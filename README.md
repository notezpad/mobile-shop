# Mobile Shop ERP — نظام إدارة محلات الهواتف المحمولة والصيانة

نظام ERP + POS متكامل لإدارة محلات الهواتف المحمولة وخدمات الصيانة. مبني كـ **SaaS Multi-Tenant** على Cloudflare Workers + Supabase.

## 🌟 المميزات

- ✅ **SaaS Multi-Tenant** — كل متجر (tenant) معزول بالكامل عبر RLS
- ✅ **Offline-First PWA** — قابل للتثبيت + يعمل بدون إنترنت + مزامنة تلقائية
- ✅ **نقطة بيع (POS)** كاملة مع دفع متعدد وسلال تفاعلية
- ✅ **إدارة الصيانة** مع تتبع الحالة + قطع الغيار + QR Code عام
- ✅ **مخزون** مع 9 أنواع حركات + جرد + تحويل بين الفروع
- ✅ **مالية** مع خزنة يومية + مصروفات + إيرادات + 5 وسائل دفع
- ✅ **تقارير** مع رسوم بيانية (Recharts) + تصدير PDF
- ✅ **فواتير** بـ 3 قوالب (A4 / 80mm / 58mm) + QR + Barcode
- ✅ **RBAC** مع 6 أدوار + 85 صلاحية
- ✅ **Realtime Sync** عبر Supabase Realtime + Background Sync API

## 🏗️ التقنيات

| الطبقة | التقنية |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui |
| State | Zustand + TanStack React Query |
| Forms | React Hook Form + Zod |
| Backend | Cloudflare Workers + Hono |
| Database | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| PWA | vite-plugin-pwa + Workbox (Service Worker) |
| Charts | Recharts |
| PDF | jsPDF + html2canvas |
| Monorepo | pnpm workspaces |

## 📁 بنية المشروع

```
mobile-shop-erp/
├── apps/
│   ├── web/              # React PWA (Vite)
│   └── worker/           # Cloudflare Worker API (Hono)
├── packages/
│   ├── shared/           # Types + Zod schemas + RBAC + constants
│   └── db/               # Supabase clients
├── supabase/
│   ├── migrations/       # 14 SQL migrations
│   └── seed/             # SEED.sql (بيانات تجريبية)
└── scripts/              # أدوات مساعدة
```

## 🚀 التشغيل السريع

```bash
# 1. تثبيت
pnpm install

# 2. تشغيل Supabase محلياً (يتطلب Docker)
supabase start
supabase db reset    # يطبّق migrations + seed

# 3. إعداد البيئة
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
cp apps/web/.env.example apps/web/.env
# املأ القيم من: supabase status

# 4. توليد الأيقونات
python3 scripts/generate-icons.py

# 5. تشغيل
pnpm dev    # web على :5173 + worker على :8787
```

## 🚀 النشر على Cloudflare Workers (الكل في واحد)

المشروع كله (Frontend + Backend) ينشر على **Worker واحد**:

```bash
# 1. بناء الـ Frontend
cd apps/worker
pnpm build:web    # يبني React PWA → apps/web/dist

# 2. ضبط الأسرار
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET

# 3. النشر (يبني web + ينشر worker)
npx wrangler deploy
```

رابط واحد يخدم كل حاجة: `https://your-worker.workers.dev`
- `/api/v1/*` → API endpoints
- أي مسار آخر → React PWA (مع SPA fallback)

## 🔑 بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|---|---|---|
| `super_admin` | `Admin@123` | مدير عام |
| `admin` | `Admin@123` | مدير المتجر |

## 📚 الوثائق

- [DEPLOYMENT.md](./DEPLOYMENT.md) — دليل النشر على Cloudflare + Supabase
- [ENVIRONMENT.md](./ENVIRONMENT.md) — متغيرات البيئة المطلوبة

## 📋 المراحل المنفذة

| # | المرحلة | الحالة |
|---|---|---|
| 0 | Foundation & Setup | ✅ |
| 1 | Auth & RBAC | ✅ |
| 2 | Settings & Branches | ✅ |
| 3 | Catalog (Products + Categories + Devices) | ✅ |
| 4 | Inventory | ✅ |
| 5 | Customers & Suppliers | ✅ |
| 6 | Sales (POS) | ✅ |
| 7 | Invoices & PDF & QR/Barcode | ✅ |
| 8 | Returns | ✅ |
| 9 | Repairs (الصيانة) | ✅ |
| 10 | Finance | ✅ |
| 11 | Reports | ✅ |
| 12 | Employees & HR | ✅ |
| 13 | Backup & Restore | ✅ |
| 14 | Audit Logs & Notifications | ✅ |
| 15 | PWA Finalization | ✅ |
| 16 | Testing & Polish | ✅ |
| 17 | Sync Layer (Cloud Realtime) | ✅ |
| SaaS | Multi-Tenant Transformation | ✅ |

## 📄 الترخيص

UNLICENSED — All rights reserved.
