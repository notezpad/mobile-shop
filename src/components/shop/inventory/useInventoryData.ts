'use client'

/**
 * 🛡️ 2026-09-30: طبقة البيانات المشتركة لصفحات المخزون الأربعة.
 *
 * بعد تحويل التبويبات إلى صفحات مستقلة (/inventory، /inventory/movements،
 * /inventory/transfers، /inventory/stocktake)، كل صفحة بتحمّل نفس مصادر
 * البيانات الخمسة بالتوازي (زي ما كانت الصفحة الموحدة بتعمل بالظبط) —
 * عشان كروت التنقّل بين الصفحات تفضل تعرض أعداد حقيقية (معلّق/مسودة...)،
 * والمسودات المحفوظة في Zustand تشتغل على أي صفحة.
 *
 * البيانات بتتحدّث تلقائياً لما يحصل بيع/تعديل من صفحة تانية عبر
 * useDataRefresh (نفس آلية الصفحة القديمة).
 */

import * as React from 'react'
import { useDataRefresh } from '@/lib/offline/data-events'
import type { Branch, InventoryProduct, Movement, Stocktake, Transfer } from './types'

export interface InventoryStats {
  totalItems: number
  lowStock: number
  outOfStock: number
  totalValueCost: number
  totalValuePrice: number
  expectedProfit: number
  healthyCount: number
  lowOnly: number
  pendingTransfers: number
  draftStocktakes: number
  pendingTotal: number
}

export interface InventoryData {
  branches: Branch[]
  products: InventoryProduct[]
  movements: Movement[]
  transfers: Transfer[]
  stocktakes: Stocktake[]
  loading: boolean
  noData: boolean
  stats: InventoryStats
  reload: () => void
}

async function apiSafe<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    const data = await res.json()
    return data as T
  } catch {
    return fallback
  }
}

/* 🛡️ 2026-10-07 (v16): للـ endpoints اللي المفروض ترجّع مصفوفة — لو السيرفر
   ردّ 200 بجسم غلط (object خطأ، null، HTML…) بنرجّع [] بدل ما المصفوفة تبقى
   object و .length يبقى undefined ويكسّر الصفحة عند التنسيق (سبب شاشة
   الحركات السوداء). */
async function apiSafeArray<T>(url: string, fallback: T[]): Promise<T[]> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    const data = await res.json()
    return Array.isArray(data) ? (data as T[]) : fallback
  } catch {
    return fallback
  }
}

export function useInventoryData(): InventoryData {
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<InventoryProduct[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, ps, mv, tf, st] = await Promise.all([
        apiSafeArray<Branch>('/api/branches', []),
        apiSafe<{ data: InventoryProduct[] } | InventoryProduct[]>('/api/products?limit=1000&status=all', []),
        apiSafeArray<Movement>('/api/inventory/movements', []),
        apiSafeArray<Transfer>('/api/inventory/transfers', []),
        apiSafeArray<Stocktake>('/api/inventory/stocktake', []),
      ])
      const productsArr = Array.isArray(ps) ? ps : (ps as { data?: InventoryProduct[] })?.data ?? []
      setBranches(bs)
      setProducts(productsArr)
      setMovements(mv)
      // 🛡️ v16: ضمان شكل العناصر الداخلية — items لازم تكون مصفوفة عشان
      // التحويلات والجرد مايكسروش في .reduce/.length لو رد السيرفر ناقص
      setTransfers(tf.map((t) => ({ ...t, items: Array.isArray(t?.items) ? t.items : [] })))
      setStocktakes(st.map((s) => ({ ...s, items: Array.isArray(s?.items) ? s.items : [] })))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ بيع من نقطة البيع أو تعديل من صفحة المنتجات يحدّث المخزون هنا أيضاً
  useDataRefresh(['inventory', 'products', 'branches'], load)

  const stats = React.useMemo<InventoryStats>(() => {
    const totalItems = products.length
    const lowStock = products.filter((p) => p.quantity <= p.minQuantity).length
    const outOfStock = products.filter((p) => p.quantity <= 0).length
    const totalValueCost = products.reduce((s, p) => s + p.quantity * p.cost, 0)
    const totalValuePrice = products.reduce((s, p) => s + p.quantity * p.price, 0)
    const pendingTransfers = transfers.filter((t) => t.status === 'pending').length
    const draftStocktakes = stocktakes.filter((s) => s.status === 'draft').length
    return {
      totalItems,
      lowStock,
      outOfStock,
      totalValueCost,
      totalValuePrice,
      expectedProfit: totalValuePrice - totalValueCost,
      healthyCount: Math.max(0, totalItems - lowStock),
      lowOnly: Math.max(0, lowStock - outOfStock),
      pendingTransfers,
      draftStocktakes,
      pendingTotal: pendingTransfers + draftStocktakes,
    }
  }, [products, transfers, stocktakes])

  return {
    branches,
    products,
    movements,
    transfers,
    stocktakes,
    loading,
    noData: loading && products.length === 0,
    stats,
    reload: load,
  }
}
