# مسارات الملفات المعدلة

استبدل كل ملف بمساره المقابل في مشروعك:

| الملف هنا | المسار في المشروع |
|---|---|
| table.tsx | `src/components/ui/table.tsx` |
| Barcode.tsx | `src/components/shop/Barcode.tsx` |
| ProductsView.tsx | `src/components/shop/ProductsView.tsx` |
| SalesHistoryView.tsx | `src/components/shop/SalesHistoryView.tsx` |
| CustomerDetailDialog.tsx | `src/components/shop/CustomerDetailDialog.tsx` |
| FinanceView.tsx | `src/components/shop/FinanceView.tsx` |
| SupplierDetailDialog.tsx | `src/components/shop/SupplierDetailDialog.tsx` |
| PurchaseOrdersView.tsx | `src/components/shop/PurchaseOrdersView.tsx` |
| CashView.tsx | `src/components/shop/CashView.tsx` |
| ExpensesView.tsx | `src/components/shop/ExpensesView.tsx` |
| DashboardView.tsx | `src/components/shop/DashboardView.tsx` |
| UsersView.tsx | `src/components/shop/UsersView.tsx` |
| MaintenanceView.tsx | `src/components/shop/MaintenanceView.tsx` |
| CustomersView.tsx | `src/components/shop/CustomersView.tsx` |
| SuppliersView.tsx | `src/components/shop/SuppliersView.tsx` |
| MovementsTab.tsx | `src/components/shop/inventory/MovementsTab.tsx` |
| StocktakeTab.tsx | `src/components/shop/inventory/StocktakeTab.tsx` |
| TransfersTab.tsx | `src/components/shop/inventory/TransfersTab.tsx` |

## ملخص التعديلات

1. **استايل الجداول (table.tsx)**: رجّعنا مكوّن الجدول للنسخة القديمة المظبوطة.
2. **عمود الإجراءات (ProductsView)**: قللنا عدد الأزرار الظاهرة (زر تعديل + قائمة منسدلة "⋮" للباقي) بدل 5 أزرار مرصوصة.
3. **هامش الجدول (ProductsView)**: خلفية الهيدر بتمتد لحواف الكارد، مع هامش داخلي بسيط لأول/آخر عمود.
4. **الباركود (Barcode.tsx + ProductsView)**: قللنا الارتفاع عشان الصف ميطلعش أطول من باقي الصفوف.
5. **عمود التاريخ (كل الملفات التانية)**: وسّعنا عمود التاريخ من `w-32/w-36/w-40` إلى `w-52` في كل مكان بيستخدم `DateTimeCell` (بادج فيه تاريخ + وقت)، عشان النص ميتقصش أو يتراكب.
