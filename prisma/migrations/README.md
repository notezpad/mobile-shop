# 🛡️ Baseline Migration (خ-8 — 2026-11-02)

## ليه الملف ده موجود؟
جداول الأساس (User، Tenant، Sale، Product…) اتبنت في البداية بـ `db push`
من غير أي migration — يعني **مافيش استعادة كاملة من الصفر على بيئة جديدة**
بالأدوات القياسية، وكمان `prisma migrate dev` كان هيحاول يعمل CREATE لجداول
موجودة أصلًا. الملف ده هو «نقطة الصفر الموثقة»: **كل** الـ schema الحالي
(58 جدول) في SQL واحد مولّد من `prisma/schema.prisma` بالأمر:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

## ترتيب المجلدات
```
prisma/migrations/
├── 20260101000000_baseline/          ← كل الجداول والفهارس من الصفر
└── 20261102_phase3_hr_money_guards/  ← خ-9 RESTRICT + مت-11 unique + خ-8 توثيق
```

المايجريشنز القديمة (v11→v22) اتنقلت لـ **`prisma/migrations_history/`**
(أرشيف للقراءة فقط) — لأن الـ Baseline بيحتوي كل تغييراتها بالفعل، وتشغيلها
بعد الـ Baseline على بيئة جديدة هيكسر (جداول موجودة). ملف الـ lock:
`migration_lock.toml` زي ما هو.

## على الإنتاج (Supabase) — مرة واحدة بس:
```bash
# 1) علّم الـ Baseline كأنه متطبق (الجداول موجودة أصلًا):
npx prisma migrate resolve --applied 20260101000000_baseline

# 2) طبّق migration المرحلة 3 (خ-9 + مت-11):
npx prisma migrate deploy
```

## على بيئة جديدة من الصفر:
```bash
npx prisma migrate deploy
# بيطبق الـ Baseline ثم migration المرحلة 3 — الترتيب سليم لأن التاريخ أبكر.
```

## القاعدة الجديدة (من تقرير التدقيق خ-8)
> أي فهرس أو عمود بيتم بـ SQL يدوي لازم يتوثق في migration فورًا —
> ملفات `prisma/sql/*.sql` الدليلية مش بديل عن migration موثق.

## 🛡️ المرحلة 4 (2026-11-02) — ج-5 + مت-14 + مت-15 + ص-13 + مت-5/مت-6

```
prisma/migrations/
├── 20260101000000_baseline/
├── 20261102_phase3_hr_money_guards/
└── 20261102000000_phase4_money_numeric_and_indexes/   ← جديد
```

**اللي بيعمله:** 64 عمود فلوس `float8 → NUMERIC(12,2)` مع تقريب فوري
(ج-5) + فهارس المسارات الساخنة (مت-14) + `SaleItem.tenantId` مُلوَّحن مع
backfill و FK (مت-15) + قيود CHECK للحالات المعروفة (مت-15) + FK لجداول
BalanceEntry/IdempotencyKey/HrPinAttempt (ص-13) + نشر النسخة الرسمية الموحدة
v5 لدوال RPC (مت-5/مت-6).

**التشغيل على الإنتاج (بالترتيب):**
```bash
# 0) نافذة traffic منخفضة — ALTER TYPE بيعمل rewrite للجداول المالية
# 1) الفهارس بدون قفل (اختياري لكن أسرع — الـ IF NOT EXISTS بيمنع التعارض):
psql "$DIRECT_URL" -f prisma/sql/perf-indexes-concurrently.sql
# 2) الـ migration نفسه (لو عملت 1 فالفهارس هتبـ no-op):
npx prisma migrate deploy
```

**ملاحظات:**
- الكود مصمم يشتغل مع النسختين (قبل/بعد الـ migration): Prisma بيرجّع
  `Decimal` لأعمدة NUMERIC والـ shim في `src/lib/prisma-wasm.ts` بيحوّله
  number في الـ JSON، و`src/lib/db.ts` ضابط pg NUMERIC parser للاستعلامات
  الخام — فمفيش نصوص راجعة للواجهة في الحالتين.
- لو الـ migration وقف على قيمة status مش متوقعة (قيود مت-15 CHECK):
  شوف الصفوف بـ
  `SELECT "status", COUNT(*) FROM "Sale" GROUP BY 1;`
  (ونفس الفكرة لـ Tenant/Subscription/PurchaseOrder) — نظّف القيمة الغريبة
  وأعد `npx prisma migrate deploy` (الملف idempotent بالكامل).
- دوال RPC لم تعد تتعدل إلا من `prisma/sql/create-sale.sql` (الملف الرسمي
  الموحد v5) — نسخة seasonal-v1.sql القديمة اتشالت (مت-6).

## قبل التشغيل: افحص عدم وجود ربط مكرر (مت-11)
```sql
SELECT "tenantId", "userId", COUNT(*) FROM "Employee"
WHERE "userId" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;
```
لو فيه صفوف، افصل الربط الأول — وإلا القيد الفريد هيرفض الـ migration.
