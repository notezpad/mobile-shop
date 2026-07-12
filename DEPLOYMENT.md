# 🚀 دليل النشر — Cloudflare + Supabase

## المتطلبات

- Node.js ≥ 20
- pnpm ≥ 9
- Supabase CLI
- Cloudflare Wrangler CLI
- حساب Supabase (Cloud)
- حساب Cloudflare

---

## 1️⃣ إعداد Supabase (الإنتاج)

### 1.1 إنشاء مشروع
1. اذهب إلى [supabase.com](https://supabase.com) وأنشئ مشروع جديد
2. اختر region قريب من عملائك (eu-central للشرق الأوسط)
3. احفظ كلمة مرور قاعدة البيانات

### 1.2 الحصول على المفاتيح
من **Project Settings → API**:
- `Project URL` — ستحتاجه للـ Worker + Web
- `anon public key` — للـ Web (آمن للنشر)
- `service_role key` — للـ Worker **(سري — لا تنشره)**

### 1.3 تطبيق الـ Migrations
```bash
# اربط مشروع Supabase المحلي بالسحابي
supabase link --project-ref <your-project-ref>

# اطبق migrations
supabase db push

# ازرع البيانات التجريبية
supabase db reset --linked
```

### 1.4 تفعيل Realtime
```sql
-- في Supabase SQL Editor:
ALTER PUBLICATION supabase_realtime ADD TABLE 
  sales, repairs, customers, inventory_stocks, notifications;
```

---

## 2️⃣ إعداد Cloudflare Worker (الـ API)

### 2.1 تسجيل الدخول
```bash
npx wrangler login
```

### 2.2 إعداد الأسرار (Secrets)
```bash
cd apps/worker

# ضع المفاتيح السرية
npx wrangler secret put SUPABASE_URL
# الصق: https://xxx.supabase.co

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# الصق: eyJhbGci... (service_role key)

npx wrangler secret put JWT_SECRET
# الصق: كلمة مرور قوية (32+ حرف)
```

### 2.3 تحديث wrangler.toml
```toml
# عدّل CORS_ORIGIN ليطابق رابط الـ web
[vars]
CORS_ORIGIN = "https://your-app.pages.dev"
```

### 2.4 النشر
```bash
pnpm --filter @mobile-shop/worker deploy
# أو
cd apps/worker && npx wrangler deploy
```

### 2.5 نشر بيئة الإنتاج
```bash
npx wrangler deploy --env production
```

---

## 3️⃣ إعداد Cloudflare Pages (الـ PWA)

### 3.1 البناء
```bash
pnpm build:web
```

### 3.2 النشر عبر Wrangler
```bash
cd apps/web
npx wrangler pages deploy dist --project-name mobile-shop-erp
```

### 3.3 أو الربط مع Git (موصى به)
1. ارفع المشروع إلى GitHub
2. في Cloudflare Dashboard → Pages → Create project → Connect to Git
3. إعدادات البناء:
   - **Build command:** `pnpm install && pnpm build:web`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** `/`
4. متغيرات البيئة (Settings → Environment variables):
   - `VITE_API_URL` = `https://your-worker.workers.dev/api/v1`
   - `VITE_SUPABASE_URL` = `https://xxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJhbGci...`

---

## 4️⃣ إعداد النطاق المخصص (اختياري)

### Cloudflare Worker
1. في Dashboard → Workers → your-worker → Triggers → Custom Domains
2. أضف: `api.yourdomain.com`

### Cloudflare Pages
1. في Dashboard → Pages → your-project → Custom domains
2. أضف: `app.yourdomain.com`

---

## 5️⃣ التحقق من النشر

```bash
# 1. تحقق من الـ API
curl https://your-worker.workers.dev/api/v1/health
# يجب أن يرجع: {"success":true,"data":{"status":"ok"...}}

# 2. تحقق من الـ Web
# افتح https://your-app.pages.dev في المتصفح
# يجب أن تظهر صفحة تسجيل الدخول

# 3. سجّل دخول
# super_admin / Admin@123
```

---

## 6️⃣ ما بعد النشر

- [ ] غيّر كلمة مرور `super_admin` بعد أول دخول
- [ ] أنشئ مستخدمين لكل موظف
- [ ] اضبط الإعدادات (الضرائب، العملة، قالب الفاتورة)
- [ ] اضبط CORS_ORIGIN في wrangler.toml ليطابق رابط الإنتاج
- [ ] فعّل SUPABASE_URL في Supabase Dashboard → Auth → URL Configuration
- [ ] أضف رابط الإنتاج إلى Supabase → Auth → Redirect URLs
