# إصلاح الشراء والمخزون لمنتجات الألوان والمقاسات + الباركود بين الفروع

انسخ الملفات فوق مشروعك بنفس المسارات، وبعدين بالترتيب:

1. `psql "$DIRECT_URL" -f prisma/migrations/20261018_purchase_variants/migration.sql`
2. `psql "$DIRECT_URL" -f prisma/migrations/20261018_branch_barcodes_and_variant_transfers/migration.sql`
3. `psql "$DIRECT_URL" -f prisma/sql/create-purchase-order.sql`   (بيستبدل الدالة)
4. `npx prisma generate`  ثم  `tsc`  ثم build/deploy
5. شغّل `prisma/sql/repair-variant-purchases.sql`:
   - الجزء الأول: الكميات الضايعة من أوامر الشراء القديمة → وزّعها على المقاسات.
   - الجزء الأخير: إكمال باركود نسخ الفروع القديمة (معاينة ثم تنفيذ).

## ملاحظة
الشاشات القديمة المكررة `src/components/shop/StocktakeTab.tsx` و`TransfersTab.tsx`
(برّه فولدر inventory) مش مستخدمة في أي مكان — ما اتعدلتش.
