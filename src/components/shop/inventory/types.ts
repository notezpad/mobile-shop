'use client'

/**
 * الأنواع المشتركة لصفحات المخزون (المخزون / الحركات / التحويلات / الجرد).
 * 🛡️ 2026-09-30: انفصلت من InventoryView القديم بعد تحويل التبويبات إلى
 * صفحات مستقلة — كل صفحة بتستورد من هنا بدل ما تكون الأنواع حبيسة ملف واحد.
 */

export interface Branch {
  id: number
  name: string
  isMain: boolean
  active: boolean
}

export interface InventoryProduct {
  id: number
  name: string
  barcode: string | null
  price: number
  cost: number
  quantity: number
  minQuantity: number
  branchId: number | null
  category: string | null
  imagePath?: string | null
  // 🥬 2026-10-12: بيع بالوزن (غذائية) — الجرد والتحويلات والحركات بتعرض بالكيلو
  soldByWeight?: boolean
  // 🥬 وحدة المنتج (علبة/كيس/...) — null = قطعة
  unitLabel?: string | null
}

export interface Movement {
  id: number
  type: string
  quantity: number
  note: string | null
  createdAt: string
  branchId: number | null
  product: { name: string; barcode: string | null }
  branch: { name: string } | null
  userName?: string | null
}

export interface Transfer {
  id: number
  status: string
  note: string | null
  createdAt: string
  completedAt: string | null
  fromBranchId: number
  toBranchId: number
  fromBranch: { name: string }
  toBranch: { name: string }
  items: { productId: number; quantity: number; product: { name: string; barcode: string | null } }[]
  createdByName?: string | null
}

export interface Stocktake {
  id: number
  status: string
  createdAt: string
  committedAt: string | null
  note: string | null
  branchId: number | null
  branch: { name: string } | null
  createdByName?: string | null
  items: {
    productId: number
    systemQty: number
    countedQty: number
    diff: number
    product: { name: string; barcode: string | null }
  }[]
}
