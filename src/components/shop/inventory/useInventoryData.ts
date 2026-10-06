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

/** ⚡ v10: إجماليات + منحنى 14 يوم محسوبة في SQL من السيرفر */
export interface MovementMeta {
  total: number
  inTotal: number
  outTotal: number
  series: { date: string; inn: number; out: number }[]
}

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
  /** ⚡ v10: الرد دلوقتي 50 حركة/صفحة — الإجماليات الحقيقية هنا */
  movementMeta: MovementMeta | null
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

export function useInventoryData(): InventoryData {
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<InventoryProduct[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  // ⚡ v10: الرد 50 حركة/صفحة + إجماليات SQL — عشان Error 1102 (تراكم CPU/ذاكرة
  // من ردود 1000 صف مع كل فتح صفحة مخزون)
  const [movementMeta, setMovementMeta] = React.useState<MovementMeta | null>(null)
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, ps, mv, tf, st] = await Promise.all([
        apiSafe<Branch[]>('/api/branches', []),
        // ⚡ v10: meta=slim — بدون soldQuantity/تسعير ديناميكي (شاشة المخزون
        // مش بتستخدمهم) + الكاش على الحافة 20 ثانية
        apiSafe<{ data: InventoryProduct[] } | InventoryProduct[]>('/api/products?limit=1000&status=all&meta=slim', []),
        // ⚡ v10: 50 حركة/صفحة + إجماليات SQL
        apiSafe<{ data: Movement[]; total?: number; inTotal?: number; outTotal?: number; series?: MovementMeta['series'] } | Movement[]>('/api/inventory/movements?limit=50', []),
        apiSafe<Transfer[]>('/api/inventory/transfers', []),
        apiSafe<Stocktake[]>('/api/inventory/stocktake', []),
      ])
      const productsArr = Array.isArray(ps) ? ps : (ps as { data?: InventoryProduct[] })?.data ?? []
      setBranches(bs)
      setProducts(productsArr)
      setTransfers(tf)
      setStocktakes(st)
      if (Array.isArray(mv)) {
        setMovements(mv)
        setMovementMeta(null)
      } else {
        setMovements((mv as { data?: Movement[] })?.data ?? [])
        setMovementMeta({
          total: (mv as { total?: number })?.total ?? 0,
          inTotal: (mv as { inTotal?: number })?.inTotal ?? 0,
          outTotal: (mv as { outTotal?: number })?.outTotal ?? 0,
          series: (mv as { series?: MovementMeta['series'] })?.series ?? [],
        })
      }
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
    movementMeta,
    transfers,
    stocktakes,
    loading,
    noData: loading && products.length === 0,
    stats,
    reload: load,
  }
}
