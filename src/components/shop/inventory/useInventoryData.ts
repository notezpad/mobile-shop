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
import { usePathname } from 'next/navigation'
import { api } from '@/lib/api'
import { useDataRefresh } from '@/lib/offline/data-events'
import type { Branch, InventoryProduct, Movement, Stocktake, Transfer } from './types'

export interface InventoryStats {
  totalItems: number
  lowStock: number
  outOfStock: number
  /** null = المستخدم معندوش صلاحية رؤية التكاليف (الـ API بيرجّع cost: null) */
  totalValueCost: number | null
  totalValuePrice: number
  /** null = مخفي بسبب الصلاحية — مش صفر ومش قيمة البيع كاملة */
  expectedProfit: number | null
  /** false لو التكلفة مخفية عن المستخدم (RBAC: canViewProfits) */
  canSeeCost: boolean
  healthyCount: number
  lowOnly: number
  pendingTransfers: number
  draftStocktakes: number
  pendingTotal: number
  // 👕 المخزن الداخلي (فاشون): القطع النايمة وقيمتها + عدد الأصناف المتخزنة
  warehousePieces: number
  warehouseValue: number | null
  warehouseItems: number
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

type SourceKey = 'branches' | 'products' | 'movements' | 'transfers' | 'stocktake'

export function useInventoryData(): InventoryData {
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<InventoryProduct[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)
  // 🛡️ v14: الكائن موجود من أول رندر — الصفحات بتفكّه وتقرأ مفاتيحه فوراً
  const [loadErrors, setLoadErrors] = React.useState<InventoryLoadErrors>(EMPTY_LOAD_ERRORS)

  // ⚡ 2026-10-17 (تحميل على مرحلتين — علاج «الصفحة بطيئة»):
  // قبل كده Promise.all على المصادر الخمسة كان بيخلي كل صفحة تستنى **أتقل**
  // مصدر (منتجات limit=1000) حتى لو الرسم مش محتاجه — الحركات/التحويلات/الجرد
  // كانوا بيتأخروا ورا المنتجات. دلوقتي:
  //   المرحلة 1 = الفروع + القائمة الأساسية للصفحة نفسها → الرسم يبدأ فوراً
  //   المرحلة 2 = الباقي في الخلفية (بيغذّي عدّادات كروت التنقّل فقط)
  // شكل الشاشة مطابق 100%: العدّادات كانت أصلاً بتظهر أصفار أثناء التحميل.
  const pathname = usePathname()

  const load = React.useCallback(async () => {
    setLoading(true)
    const fetchOne = async (k: SourceKey): Promise<void> => {
      if (k === 'branches') {
        const r = await apiSafe<Branch[]>('/api/branches', [])
        setBranches(asArray<Branch>(r.data))
        setLoadErrors((p) => ({ ...p, branches: r.error }))
      } else if (k === 'products') {
        const r = await apiSafe<{ data: InventoryProduct[] } | InventoryProduct[]>('/api/products?limit=1000&status=all', [])
        setProducts(asArray<InventoryProduct>(r.data))
        setLoadErrors((p) => ({ ...p, products: r.error }))
      } else if (k === 'movements') {
        const r = await apiSafe<Movement[]>('/api/inventory/movements', [])
        setMovements(asArray<Movement>(r.data))
        setLoadErrors((p) => ({ ...p, movements: r.error }))
      } else if (k === 'transfers') {
        const r = await apiSafe<Transfer[]>('/api/inventory/transfers', [])
        setTransfers(asArray<Transfer>(r.data))
        setLoadErrors((p) => ({ ...p, transfers: r.error }))
      } else {
        const r = await apiSafe<Stocktake[]>('/api/inventory/stocktake', [])
        setStocktakes(asArray<Stocktake>(r.data))
        setLoadErrors((p) => ({ ...p, stocktake: r.error, stocktakes: r.error }))
      }
    }

    // المرحلة 1: الفروع + القائمة الأساسية حسب الصفحة المستدعية
    const priority: SourceKey =
      pathname === '/inventory/movements'
        ? 'movements'
        : pathname === '/inventory/transfers'
          ? 'transfers'
          : pathname === '/inventory/stocktake'
            ? 'stocktake'
            : 'products' // /inventory — القائمة الأساسية هي المنتجات
    const first: SourceKey[] = ['branches', priority]
    const rest: SourceKey[] = (
      ['branches', 'products', 'movements', 'transfers', 'stocktake'] as SourceKey[]
    ).filter((k) => !first.includes(k))

    try {
      await Promise.all(first.map(fetchOne))
    } finally {
      setLoading(false)
    }
    // المرحلة 2: الباقي في الخلفية — fetchOne ما بترميشن (apiSafe بتلقط)
    void Promise.all(rest.map(fetchOne))
  }, [pathname])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ بيع من نقطة البيع أو تعديل من صفحة المنتجات يحدّث المخزون هنا أيضاً
  useDataRefresh(['inventory', 'products', 'branches'], load)

  const stats = React.useMemo<InventoryStats>(() => {
    const totalItems = products.length
    const lowStock = products.filter((p) => p.quantity <= p.minQuantity).length
    const outOfStock = products.filter((p) => p.quantity <= 0).length
    // 🔒 RBAC: الـ API بيبدّل cost بـ null لمن لا يملك canViewProfits. قبل الإصلاح
    // quantity * null = 0 فكانت «قيمة البضاعة» صفر و«الربح المتوقع» = كامل سعر البيع.
    const canSeeCost = products.every((p) => p.cost != null)
    const totalValueCost = canSeeCost
      ? products.reduce((s, p) => s + p.quantity * p.cost, 0)
      : null
    const totalValuePrice = products.reduce((s, p) => s + p.quantity * p.price, 0)
    const pendingTransfers = transfers.filter((t) => t.status === 'pending').length
    const draftStocktakes = stocktakes.filter((s) => s.status === 'draft').length
    // 👕 المخزن الداخلي: اللي معروضه أقل من إجماليه (الباقي في الكراتين)
    const stored = products.filter((p) => (p.displayQty ?? p.quantity) < p.quantity)
    const warehousePieces = stored.reduce((s, p) => s + (p.quantity - (p.displayQty ?? p.quantity)), 0)
    const warehouseValue = canSeeCost
      ? stored.reduce((s, p) => s + (p.quantity - (p.displayQty ?? p.quantity)) * (p.cost ?? 0), 0)
      : null
    return {
      totalItems,
      lowStock,
      outOfStock,
      totalValueCost,
      totalValuePrice,
      expectedProfit: totalValueCost === null ? null : totalValuePrice - totalValueCost,
      canSeeCost,
      healthyCount: Math.max(0, totalItems - lowStock),
      lowOnly: Math.max(0, lowStock - outOfStock),
      pendingTransfers,
      draftStocktakes,
      pendingTotal: pendingTransfers + draftStocktakes,
      warehousePieces: Math.round(warehousePieces * 1000) / 1000,
      warehouseValue: warehouseValue === null ? null : Math.round(warehouseValue * 100) / 100,
      warehouseItems: stored.length,
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