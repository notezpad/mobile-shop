# 🔐 متغيرات البيئة — Mobile Shop ERP

## 1️⃣ Cloudflare Worker (`apps/worker/.dev.vars` للـ dev، Wrangler Secrets للإنتاج)

| المتغير | الوصف | مطلوب | مثال |
|---|---|---|---|
| `SUPABASE_URL` | رابط مشروع Supabase | ✅ | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service_role (سري!) | ✅ | `eyJhbGci...` |
| `JWT_SECRET` | سر توقيع JWT (32+ حرف) | ✅ | `my-super-secret-key-32chars` |
| `ENVIRONMENT` | البيئة | ✅ | `development` / `staging` / `production` |
| `APP_NAME` | اسم التطبيق | ✅ | `Mobile Shop ERP API` |
| `APP_VERSION` | رقم الإصدار | ✅ | `0.1.0` |
| `LOG_LEVEL` | مستوى التسجيل | ✅ | `debug` / `info` / `warn` / `error` |
| `CORS_ORIGIN` | رابط الـ Frontend المسموح به | ✅ | `http://localhost:5173` للـ dev، `https://app.domain.com` للإنتاج |

### إعداد التطوير المحلي
```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
# املأ القيم من: supabase status
```

### إعداد الإنتاج
```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
```

---

## 2️⃣ Frontend PWA (`apps/web/.env`)

| المتغير | الوصف | مطلوب | مثال |
|---|---|---|---|
| `VITE_APP_NAME` | اسم التطبيق | ✅ | `Mobile Shop ERP` |
| `VITE_APP_VERSION` | رقم الإصدار | ✅ | `0.1.0` |
| `VITE_API_URL` | رابط الـ Worker API | ✅ | `http://localhost:8787/api/v1` للـ dev |
| `VITE_SUPABASE_URL` | رابط Supabase | ✅ | `http://127.0.0.1:54321` للـ dev |
| `VITE_SUPABASE_ANON_KEY` | مفتاح anon (آمن للنشر) | ✅ | `eyJhbGci...` |
| `VITE_DEFAULT_LOCALE` | اللغة الافتراضية | ✅ | `ar` |
| `VITE_DEFAULT_THEME` | السمة الافتراضية | ✅ | `system` |
| `VITE_DEFAULT_CURRENCY` | العملة الافتراضية | ✅ | `EGP` |
| `VITE_ENABLE_DEVTOOLS` | تفعيل أدوات التطوير | اختياري | `false` |

### إعداد التطوير المحلي
```bash
cp apps/web/.env.example apps/web/.env
# املأ القيم من: supabase status
```

### إعداد الإنتاج (Cloudflare Pages)
في **Dashboard → Pages → your-project → Settings → Environment variables**:
```
VITE_API_URL=https://your-worker.workers.dev/api/v1
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

---

## 3️⃣ Supabase (إعدادات المشروع)

### إعدادات Auth
في **Dashboard → Authentication → URL Configuration**:
- **Site URL:** `https://app.domain.com` (رابط الإنتاج)
- **Redirect URLs:**
  - `http://localhost:5173` (تطوير)
  - `https://app.domain.com` (إنتاج)

### متغيرات Supabase المحلية
من `supabase status`:
```
API URL:     http://127.0.0.1:54321
DB URL:      postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL:  http://127.0.0.1:54323
anon key:    eyJhbGci...
service_role: eyJhbGci...
```

---

## ⚠️ تحذيرات أمنية

1. **لا تنشر** `SUPABASE_SERVICE_ROLE_KEY` أو `JWT_SECRET` في الكود أو Git
2. استخدم دائماً `wrangler secret put` للإنتاج
3. مفتاح `anon` آمن للنشر في الـ Frontend (مصمم لذلك)
4. مفتاح `service_role` **ي تخطّي RLS** — استخدمه فقط في الـ Worker
5. في الإنتاج: `CORS_ORIGIN` يجب أن يطابق رابط الـ Frontend بالضبط
