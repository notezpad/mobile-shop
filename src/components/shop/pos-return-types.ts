/**
 * 🔁 2026-10-31 — أنواع بيانات بحث فاتورة المرتجع من نقطة البيع.
 *
 * دي نفس بيانات /api/sales/returns/lookup — الحد الأدنى المطلوب لعمل مرتجع
 * بدون أي تكاليف أو أرباح (cost مش موجود هنا عن قصد).
 */

export interface SaleLookupItem {
  id: number
  productId: number | null
  name: string
  price: number
  quantity: number
  returnedQty: number
  unitLabel: string | null
  unitQuantity: number | null
  pieceLabel: string | null
  variantLabel: string | null
}

export interface SaleLookupSale {
  id: number
  invoiceNo: string | null
  status: string
  /** الكاش اللي دخل الخزنة فعلاً على الفاتورة دي لحد الآن */
  paid: number
  /** الكاش اللي خرج بالفعل عبر مرتجعات سابقة */
  refunded: number
  paymentMethod: string | null
  customerId: number | null
  customerName: string | null
  /** 🏬 (التحديث الرابع عشر) فرع الفاتورة — بحث بضاعة الاستبدال بيتفلتر عليه (null = قديمة/بدون فرع) */
  branchId: number | null
  items: SaleLookupItem[]
}
