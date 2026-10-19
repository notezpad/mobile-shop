# إصلاح الشراء والمخزون لمنتجات الألوان والمقاسات + سياسة الحركات اليدوية

انسخ الملفات فوق مشروعك بنفس المسارات، وبعدين بالترتيب:

1. `psql "$DIRECT_URL" -f prisma/migrations/20261018_purchase_variants/migration.sql`
2. `psql "$DIRECT_URL" -f prisma/migrations/20261018_branch_barcodes_and_variant_transfers/migration.sql`
3. `psql "$DIRECT_URL" -f prisma/migrations/20261018_stock_policy/migration.sql`
3b. `psql "$DIRECT_URL" -f prisma/migrations/20261018_idempotency/migration.sql`   (جدول منع تكرار العمليات)
4. `psql "$DIRECT_URL" -f prisma/sql/create-purchase-order.sql`   (بيستبدل الدالة)
5. `npx prisma generate`  ثم  `tsc`  ثم build/deploy
6. `prisma/sql/repair-variant-purchases.sql`  — الكميات الضايعة + باركود نسخ الفروع القديمة (معاينة ثم تنفيذ)
7. `prisma/sql/review-damaged-out-movements.sql` — حركات «صادر ← تالف» القديمة (مراجعة)

## أرقام السياسة (عدّلها من ملف واحد)
`src/lib/stock-policy.ts` → STOCK_POLICY:
- employeeMaxQty = 5 قطع، employeeMaxValue = 500 جنيه (حد الموظف للحركة اليدوية)
- stocktakeNoteThreshold = 1000 جنيه (عجز جرد فوقه يحتاج ملاحظة)

## ملاحظة
الشاشات القديمة المكررة `src/components/shop/StocktakeTab.tsx` و`TransfersTab.tsx`
(برّه فولدر inventory) مش مستخدمة في أي مكان — ما اتعدلتش.
