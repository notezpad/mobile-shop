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

/**
 * 🛡️ v14: أخطاء التحميل لكل مصدر على حدة — صفحات المخزون بتقرأها عشان
 * تعرض بانر "تعذّر تحميل ..." مع زر إعادة المحاولة:
 *   صفحة /inventory           ← loadErrors.products
 *   صفحة /inventory/movements ← loadErrors.movements
 *   صفحة /inventory/transfers ← loadErrors.transfers
 *   صفحة /inventory/stocktake ← loadErrors.stocktake  (بالمفرد!)
 *
 * ⚠️ العقد الصارم: الكائن دايماً موجود وبكل المفاتيح (string | null) —
 * القيمة null = مفيش مشكلة في المصدر ده، والنص = رسالة الخطأ الحقيقية.
 * مستحيل يبقى undefined مهما حصل، لأن فكّ undefined كان هو سبب سقوط
 * الصفحات الأربعة ("Cannot read properties of undefined (reading 'products')").
 */
export interface InventoryLoadErrors {
  branches: string | null
  products: string | null
  movements: string | null
  transfers: string | null
  /** مفتاح بالمفرد — صفحة الجرد بتقرأه كده بالظبط (مطابق لمسار /api/inventory/stocktake) */
  stocktake: string | null
  /** مفتاح بالجمع — احتياط لأي كود بيقرأه بالشكل ده */
  stocktakes: string | null
}

export interface InventoryData {
  branches: Branch[]
  products: InventoryProduct[]
  movements: Movement[]
  transfers: Transfer[]
  stocktakes: Stocktake[]
  loading: boolean
  noData: boolean
  /** 🛡️ v13: دايماً null — الشاشات اللي بتعرضه متقعش (الخطأ بيروح للشبكة/الكاش) */
  error: string | null
  /** 🛡️ v14: أخطاء لكل مصدر على حدة (null = تمام) — موجود دايماً، عمره ما undefined */
  loadErrors: InventoryLoadErrors
  stats: InventoryStats
  reload: () => void
}

/**
 * 🛡️ v11 (ROOT FIX — "صفحة المخزون صفر أوفلاين"):
 * قبل كده القراءة كانت بـ fetch خام — أوفلاين الـ SW بيرجّع 503 فـ res.ok
 * بتكون false وبنرجّع fallback فاضي = كل حاجة صفر. دلوقتي القراءة بتمرّ
 * من طبقة api() (offlineFetch) اللي بتخزن كل جواب ناجح في IDB وبترجّع آخر
 * نسخة معروفة أوفلاين — فالصفحات الأربعة بتشتغل بآخر بيانات حقيقية.
 *
 * 🛡️ v14: بترجّع كمان رسالة الخطأ الحقيقية (لو حصلت) عشان loadErrors —
 * معظم الأخطاء جايّة من طبقة offlineFetch برسائل عربية جاهزة.
 */
/**
 * 🛡️ v14: استخراج رسالة عربية صادقة من أي خطأ — الخطأ من طبقة offlineFetch
 * جاي برسالة جاهزة أصلاً، وده fallback لأي شكل غريب (مش Error/مفيش message).
 * مُصدَّرة للاختبار ولأي طبقة بيانات تانية تحتاج نفس السلوك.
 */
export function loadErrorMessage(e: unknown): string {
  if (e instanceof Error && typeof e.message === 'string' && e.message) return e.message
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  if (typeof e === 'string' && e) return e
  return 'تعذّر تحميل البيانات — جرّب تاني'
}

async function apiSafe<T>(
  url: string,
  fallback: T,
): Promise<{ data: T; error: string | null }> {
  try {
    const data = await api<T>(url)
    return { data: (data ?? fallback) as T, error: null }
  } catch (e) {
    return { data: fallback, error: loadErrorMessage(e) }
  }
}

/**
 * 🛡️ v12/v13: تطبيع صارم لأشكال الردود — أي رد مش قائمة حقيقية بنفكّ ظرفه:
 * أولاً الحقول المعروفة ({data:[...]} / {items:[...]}...)، ولو مفيش
 * منها حقل مصفوفة — بنلقط **أول حقل مصفوفة** في الظرف (أي اسم جديد يختاره
 * السيرفر لقائمة واحدة) — ومستحيل كومبوننت يستقبل غير مصفوفة مهما كان
 * شكل الرد من السيرفر أو من الكاش المحلي.
 */
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const known = ['data', 'items', 'results', 'rows', 'list', 'movements', 'transfers', 'stocktakes', 'branches', 'products']
    for (const k of known) {
      if (Array.isArray(o[k])) return o[k] as T[]
    }
    for (const k of Object.keys(o)) {
      if (Array.isArray(o[k])) return o[k] as T[]
    }
  }
  return []
}

const EMPTY_LOAD_ERRORS: InventoryLoadErrors = {
  branches: null,
  products: null,
  movements: null,
  transfers: null,
  stocktake: null,
  stocktakes: null,
}

export function useInventoryData(): InventoryData {
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<InventoryProduct[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)
  // 🛡️ v14: الكائن موجود من أول رندر — الصفحات بتفكّه وتقرأ مفاتيحه فوراً
  const [loadErrors, setLoadErrors] = React.useState<InventoryLoadErrors>(EMPTY_LOAD_ERRORS)

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
      setBranches(asArray<Branch>(bs.data))
      setProducts(asArray<InventoryProduct>(ps.data))
      setMovements(asArray<Movement>(mv.data))
      setTransfers(asArray<Transfer>(tf.data))
      setStocktakes(asArray<Stocktake>(st.data))
      // 🛡️ v14: أخطاء كل مصدر على حدة — مصدر فاشل ما يمنعش الباقي يظهر
      setLoadErrors({
        branches: bs.error,
        products: ps.error,
        movements: mv.error,
        transfers: tf.error,
        stocktake: st.error,
        stocktakes: st.error,
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
    error: null,
    // 🛡️ v14: كل استدعاء بيرجّع كائن جديد لكن بنفس الشكل الكامل —
    // أي قراءة loadErrors.X في أي صفحة من الأربعة آمنة 100%
    loadErrors,
    stats,
    reload: load,
  }
}
