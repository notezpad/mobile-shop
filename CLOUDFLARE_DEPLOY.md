# نشر المشروع على Cloudflare Workers + Supabase

## التعديلات اللي اتعملت في الكود

1. **`prisma/schema.prisma`** — تغيير `provider` من `sqlite` إلى `postgresql`، وإضافة `directUrl` للـ migrations، وتفعيل `driverAdapters`.
2. **`src/lib/db.ts`** — بقى بيستخدم `@prisma/adapter-pg` (`pg`) بدل الـ engine الافتراضي، لأن Cloudflare Workers مش بيدعم الـ Prisma engine binary التقليدي.
3. **`src/lib/auth.ts`** — استبدال `jsonwebtoken` بـ `jose` (بيستخدم Web Crypto المدعوم في بيئة Workers بدل Node crypto).
4. **إزالة `sharp`** من package.json — مكتبة native binary مش متوافقة مع Workers، ومكنتش مستخدمة فعليًا في الكود.
5. **إزالة `z-ai-web-dev-sdk`** — dependency مش مستخدمة.
6. **`next.config.ts`** — إزالة `output: "standalone"` وإضافة تهيئة OpenNext للتطوير المحلي.
7. **ملفات جديدة**: `wrangler.jsonc` (إعدادات الـ Worker) و `open-next.config.ts` (إعدادات محول OpenNext لـ Cloudflare).
8. **`package.json`** scripts جديدة: `cf:dev`, `cf:build`, `cf:deploy`.

## الخطوات اللي محتاج تعملها

### 1. إنشاء مشروع Supabase
- روح على supabase.com واعمل مشروع جديد.
- من Project Settings → Database → Connection string، خد:
  - **Connection pooling (Transaction mode, port 6543)** ← ده اللي هيتحط في `DATABASE_URL`
  - **Direct connection (port 5432)** ← ده اللي هيتحط في `DIRECT_URL`

### 2. تثبيت المكتبات الجديدة محليًا
```bash
npm install
```

### 3. تجهيز قاعدة البيانات
```bash
cp .env.example .env
# افتح .env واملأ DATABASE_URL و DIRECT_URL و JWT_SECRET بالقيم الحقيقية

npx prisma generate
npx prisma db push   # أو: npx prisma migrate deploy لو عندك migrations جاهزة
```

### 4. تسجيل الدخول على Cloudflare
```bash
npx wrangler login
```

### 5. تخزين الأسرار (Secrets) على Cloudflare
```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put DIRECT_URL
npx wrangler secret put JWT_SECRET
```

### 6. تجربة محلية على بيئة Workers (اختياري لكن موصى بيه)
```bash
npm run cf:dev
```

### 7. النشر
```bash
npm run cf:deploy
```

بعد النشر هتاخد رابط زي: `https://shop-saas.<your-subdomain>.workers.dev`

## ملاحظات مهمة

- **ملف الشعار / الصور المرفوعة**: لو هتضيف لاحقًا ميزة رفع ملفات (صور منتجات، شعار المحل)، لازم تتخزن على **Cloudflare R2** مش على الفايل سيستم المحلي، لأن Workers مفيهاش تخزين دائم على القرص.
- **الـ Caddyfile** بتاع الإعداد القديم (VPS) بقى مش مستخدم في مسار Cloudflare — سيبته موجود لو حبيت ترجع للنشر على VPS يومًا ما.
- لو حصل خطأ اتصال بقاعدة البيانات من جوه الـ Worker، تأكد إنك مستخدم الـ **pooled connection (6543)** في `DATABASE_URL` مش الـ direct واحد، عشان تتفادى استهلاك كل الـ connections المتاحة في Postgres.
- `wrangler.jsonc` فيه `compatibility_flags: ["nodejs_compat", ...]` وده ضروري عشان `pg` و `bcryptjs` يشتغلوا صح.
