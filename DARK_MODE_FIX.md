# إصلاح الوضع الليلي — باركود + تباين + جداول

## الأخطاء المكتشفة (8 أخطاء)

### 1. الباركود — أسود على أسود في الوضع الليلي ❌❌❌
الـ `JsBarcode` كان يستخدم `lineColor` الافتراضي (`#000000`) — يعني الخطوط سوداء على خلفية داكنة = غير مرئية.

**الإصلاح**:
```typescript
// قبل:
JsBarcode(svgRef.current, value, {
  background: 'transparent',
  // lineColor مش محدد → افتراضي #000000 (أسود)
})

// بعد:
JsBarcode(svgRef.current, value, {
  background: 'transparent',
  lineColor: 'currentColor', // ⚡ يستخدم لون النص الموروث — أبيض في dark، أسود في light
})
```
+ `frame` ياخد `text-foreground` + `SVG` ياخد `color: inherit`

### 2. شريحة رقم الباركود — تباين ضعيف ❌
```typescript
// قبل: text-foreground/80 (80% opacity = خافت)
// بعد: text-foreground (100% = كامل التباين)
```

### 3. أكواع الباركود — ضعيفة جداً ❌
```css
opacity: 0.55 → 0.7  /* أوضح في الوضع الليلي */
```

### 4. جدول المنتجات — مفيش فاصل بين الصفوف ❌
في الوضع الليلي، الصفوف بتدمج مع بعض — مفيش border واضح.

**الإصلاح** (في globals.css):
```css
.dark table tbody tr {
  border-bottom-color: oklch(0.24 0.005 264 / 0.5) !important;
}
.dark table tbody tr:hover {
  background: oklch(0.24 0.005 264 / 0.5) !important;
}
```

### 5. رأس الجدول — نص خافت في الوضع الليلي ❌
```css
.dark table thead th {
  color: oklch(0.85 0.008 264) !important;  /* أوضح */
}
```

### 6. Badge في الوضع الليلي — تباين ضعيف ❌
```css
.dark [data-slot="badge"][data-variant="secondary"] {
  background: oklch(0.28 0.005 264);
  color: oklch(0.88 0.005 264);
}
```

### 7. Skeleton في الوضع الليلي — غير مرئي ❌
```css
.dark [data-slot="skeleton"] {
  background: oklch(0.24 0.005 264) !important;
}
```

### 8. Card hover في الوضع الليلي — مفيش ❌
كل الكروت في كل الصفحات (المنتجات، العملاء، الموردين، الصيانة، المستخدمين، المصروفات، الخزنة، المعاملات، الجرد) ما كانش فيها hover في الوضع الليلي.

**الإصلاح**:
```css
hover:bg-muted/30 dark:hover:bg-muted/20
```
طُبّق على 12+ view component.

## الملفات (18 ملف)

| الملف | الإصلاح |
|------|------|
| **`src/components/shop/Barcode.tsx`** | ⭐ lineColor: currentColor + text-foreground + opacity |
| **`src/app/globals.css`** | ⭐ dark table headers + rows + badges + skeleton + hover |
| `src/components/shop/ProductsView.tsx` | row hover |
| `src/components/shop/CustomersView.tsx` | card hover |
| `src/components/shop/SuppliersView.tsx` | card hover |
| `src/components/shop/MaintenanceView.tsx` | card hover |
| `src/components/shop/UsersView.tsx` | card hover |
| `src/components/shop/ExpensesView.tsx` | card hover |
| `src/components/shop/CashView.tsx` | card hover |
| `src/components/shop/FinanceView.tsx` | card hover |
| `src/components/shop/SalesHistoryView.tsx` | (no change needed — uses card grid) |
| `src/components/shop/PurchaseOrdersView.tsx` | (uses card grid) |
| `src/components/shop/BranchesView.tsx` | (uses card grid) |
| `src/components/shop/ReportsView.tsx` | card hover |
| `src/components/shop/inventory/MovementsTab.tsx` | card hover |
| (others) | CSS-level dark fixes apply globally |

## خطوات التطبيق

انسخ كل الملفات فوق الملفات الأصلية و `npm run dev`

الحزمة: `/home/z/my-project/download/shop_erp_dark_mode_fix.zip`
