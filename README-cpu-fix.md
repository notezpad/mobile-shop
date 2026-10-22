# إصلاح CPU — الاستيراد + إغلاق/فتح المواسم

## الملفات (انسخها فوق نفس المسارات في المشروع)
| الملف | التغيير |
|---|---|
| `src/lib/bulk-sql.ts` | **جديد** — دوال SQL مجمّعة (استيراد / دمج / إغلاق موسم / فتح موسم) |
| `src/app/api/products/import/commit/route.ts` | بدل لفّة Prisma لكل منتج → استعلام واحد لكل 500 منتج |
| `src/app/api/products/seasonal/route.ts` | نفس الفكرة + شلنا Prisma من GET كمان + رفعنا حد الفتح من 500 لـ 2000 |
| `src/lib/audit.ts` | `logAudit` بقى على postgres.js (كان بيبني PrismaClient لكل عملية) |
| `prisma/sql/perf-indexes-v1.sql` | فهرس `(tenantId, season)` + فهرس مطابقة الاسم |
| `scripts/bulk-sql-test/` | اختبار على Postgres حقيقي (27 فحص) |

## ترتيب النشر
1. شغّل `prisma/sql/perf-indexes-v1.sql` على الداتابيز (مرة واحدة، آمن للتكرار).
2. (اختياري) ضيف `@@index([tenantId, season])` في model Product بـ schema.prisma عشان ما يحصلش drift.
3. انسخ الملفات وانشر.
4. **على staging الأول**: اقفل موسم وافتحه (الـ sql.begin عبر Hyperdrive ماتجربش عندنا).
5. قس قبل/بعد بـ `bash scripts/measure-cpu.sh`.

## تشغيل الاختبار محليًا
Postgres محلي + `npm i postgres tsx` ثم عدّل بيانات الاتصال في أول الملف وشغّل:
`psql -f scripts/bulk-sql-test/schema.sql && npx tsx scripts/bulk-sql-test/test-bulk-sql.ts`
