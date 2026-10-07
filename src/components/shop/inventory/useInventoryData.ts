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
import { api } from '@/lib/api'
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

/**
 * 🛡️ v11 (ROOT FIX — "صفحة المخزون صفر أوفلاين"):
 * قبل كده القراءة كانت بـ fetch خام — أوفلاين الـ SW بيرجّع 503 فـ res.ok
 * بتكون false وبنرجّع fallback فاضي = كل حاجة صفر. دلوقتي القراءة بتمرّ
 * من طبقة api() (offlineFetch) اللي بتخزن كل جواب ناجح في IDB وبترجّع آخر
 * نسخة معروفة أوفلاين — فالصفحات الأربعة بتشتغل بآخر بيانات حقيقية.
 */
async function apiSafe<T>(url: string, fallback: T): Promise<T> {
  try {
    const data = await api<T>(url)
    return (data ?? fallback) as T
  } catch {
    return fallback
  }
}

/**
 * 🛡️ v12 (ROOT FIX — "خطأ غير متوقع" في صفحات المخزون): تطبيع صارم
 * لأشكال الردود — أي رد مش قائمة حقيقية بنفكّ ظرفه ({data:[...]}) أو
 * بنرجّع [] — فمستحيل كومبوننت يستقبل غير مصفوفة مهما كان شكل الرد من
 * السيرفر أو من الكاش المحلي. (ده بيقطع خالص صنف الأعطال اللي بيحصل
 * لما الكاش/السيرفر يرجّعوا شكل غير متوقع).
 */
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    const d = (v as { data?: unknown }).data
    if (Array.isArray(d)) return d as T[]
  }
  return []
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
        apiSafe<Branch[]>('/api/branches', []),
        apiSafe<{ data: InventoryProduct[] } | InventoryProduct[]>('/api/products?limit=1000&status=all', []),
        apiSafe<Movement[]>('/api/inventory/movements', []),
        apiSafe<Transfer[]>('/api/inventory/transfers', []),
        apiSafe<Stocktake[]>('/api/inventory/stocktake', []),
      ])
      // 🛡️ v12: تطبيع صارم — كل مصدر بيدخل الـ state كـ Array حقيقية
      setBranches(asArray<Branch>(bs))
      setProducts(asArray<InventoryProduct>(ps))
      setMovements(asArray<Movement>(mv))
      setTransfers(asArray<Transfer>(tf))
      setStocktakes(asArray<Stocktake>(st))
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
