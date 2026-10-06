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

export interface InventoryLoadErrors {
  branches: string | null
  products: string | null
  movements: string | null
  transfers: string | null
  stocktake: string | null
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
  /* 🛡️ v17: سبب فشل تحميل كل مصدر (null = تمام). قبل كده أي فشل شبكة/سيرفر
     كان بيتحول بهدوء لقايمة فاضية فالمستخدم يشوف "الدفتر فاضي" وهو في
     الحقيقة التحميل فشل — من غير أي رسالة توضّح السبب. */
  loadErrors: InventoryLoadErrors
}

type LoadResult<T> = { data: T; error: string | null }

const NETWORK_ERR = 'تعذر الاتصال بالخادم — تأكد من اتصال الإنترنت وحاول تاني'

/* 🛡️ v17: جلب آمن بيفضّح سبب الفشل بدل ما يبلعه:
   - !res.ok → «الخادم ردّ برمز X» (402 اشتراك / 403 باقة / 500 سيرفر…)
   - جسم غير مقروء أو غير متوقع → «رد غير متوقع من الخادم»
   - فشل شبكة → رسالة إنترنت واضحة */
async function fetchSafe<T>(url: string, opts: { wantArray: boolean; fallback: T }): Promise<LoadResult<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return { data: opts.fallback, error: `الخادم ردّ برمز ${res.status}` }
    let parsed: unknown
    try {
      parsed = await res.json()
    } catch {
      return { data: opts.fallback, error: 'رد غير مقروء من الخادم (جسم فاضي أو غير JSON)' }
    }
    if (opts.wantArray && !Array.isArray(parsed)) {
      return { data: opts.fallback, error: 'رد غير متوقع من الخادم (المفروض مصفوفة)' }
    }
    return { data: parsed as T, error: null }
  } catch {
    return { data: opts.fallback, error: NETWORK_ERR }
  }
}

export function useInventoryData(): InventoryData {
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<InventoryProduct[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadErrors, setLoadErrors] = React.useState<InventoryLoadErrors>({
    branches: null,
    products: null,
    movements: null,
    transfers: null,
    stocktake: null,
  })

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, ps, mv, tf, st] = await Promise.all([
        fetchSafe<Branch[]>('/api/branches', { wantArray: true, fallback: [] }),
        fetchSafe<{ data: InventoryProduct[] } | InventoryProduct[]>('/api/products?limit=1000&status=all', { wantArray: false, fallback: [] }),
        /* 🛡️ v18: سيرفر الإنتاج (تحديث v10) بيرجّع الحركات بشكل مقسّم صفحات
           { data: [...], total, page, limit, totalPages, inTotal, outTotal, series }
           — مش مصفوفة! لكن النسخ الأقدم بترجّع مصفوفة مباشرة. فبنقبل
           الشكلين هنا (wantArray: false) والتطبيع بيبقى تحت — وأي شكل تالت
           (زي { error }) بيتعامَل معاه كفشل حقيقي برسالة السيرفر نفسها. */
        fetchSafe<unknown>('/api/inventory/movements', { wantArray: false, fallback: [] }),
        fetchSafe<Transfer[]>('/api/inventory/transfers', { wantArray: true, fallback: [] }),
        fetchSafe<Stocktake[]>('/api/inventory/stocktake', { wantArray: true, fallback: [] }),
      ])
      // 🛡️ v16: المنتجات ممكن ترجع مصفوفة مباشرة أو { data: [...] } — الاتنين مقبولين
      const psArr = Array.isArray(ps.data) ? ps.data : ((ps.data as { data?: InventoryProduct[] })?.data ?? [])
      // 🛡️ v18: تطبيع الحركات — مصفوفة مباشرة أو { data: [...] } (سيرفر v10)
      const mvRaw = mv.data as unknown
      const mvArr: Movement[] | null = Array.isArray(mvRaw)
        ? (mvRaw as Movement[])
        : mvRaw !== null && typeof mvRaw === 'object' && Array.isArray((mvRaw as { data?: unknown }).data)
          ? ((mvRaw as { data: Movement[] }).data)
          : null
      setBranches(bs.data)
      setProducts(psArr)
      setMovements(mvArr ?? [])
      // 🛡️ v16: ضمان شكل العناصر الداخلية — items لازم تكون مصفوفة عشان
      // التحويلات والجرد مايكسروش في .reduce/.length لو رد السيرفر ناقص
      setTransfers(tf.data.map((t) => ({ ...t, items: Array.isArray(t?.items) ? t.items : [] })))
      setStocktakes(st.data.map((s) => ({ ...s, items: Array.isArray(s?.items) ? s.items : [] })))
      setLoadErrors({
        branches: bs.error,
        products: ps.error,
        /* 🛡️ v18: فشل الحركات = خطأ شبكة/رمز من fetchSafe، أو جسم ماعرفناش
           شكله خالص — وساعتها نعرض رسالة السيرفر نفسها لو الجسم فيه { error } */
        movements:
          mv.error ??
          (mvArr === null
            ? typeof (mvRaw as { error?: unknown } | null)?.error === 'string' &&
              ((mvRaw as { error?: unknown } | null)?.error as string).length > 0
              ? ((mvRaw as { error: string }).error)
              : 'رد غير متوقع من الخادم (تعذّر قراءة قائمة الحركات)'
            : null),
        transfers: tf.error,
        stocktake: st.error,
      })
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
    loadErrors,
  }
}
