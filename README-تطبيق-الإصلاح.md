# إصلاح الشراء لمنتجات الألوان والمقاسات

انسخ الملفات فوق مشروعك بنفس المسارات، وبعدين بالترتيب:

1. `psql "$DIRECT_URL" -f prisma/migrations/20261018_purchase_variants/migration.sql`
2. `psql "$DIRECT_URL" -f prisma/sql/create-purchase-order.sql`   (بيستبدل الدالة)
3. `npx prisma generate`  ثم  build/deploy
4. شغّل `prisma/sql/repair-variant-purchases.sql` (قراءة فقط) وشوف الكميات الضايعة، ووزّعها على المقاسات.
