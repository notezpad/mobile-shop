'use client'

import * as React from 'react'
import { useVocab, foodTerm } from '@/lib/vocab'
import { unitWord } from '@/lib/unit-label'
import { ProductAvatar } from './ProductAvatar'
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FolderOpen,
  LayoutGrid,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  Power,
  Printer,
  Rows3,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProductDialog, type ProductFormValues } from './ProductDialog'
import { CategoryManagerDialog } from './CategoryManagerDialog'
import { PrintLabelsDialog } from './PrintLabelsDialog'
import { ProductUnitsDialog } from './ProductUnitsDialog'
import { ProductVariantsDialog } from './ProductVariantsDialog'
import { CollectionDiscountDialog } from './CollectionDiscountDialog'
import { Package, Percent } from 'lucide-react'
import { Barcode } from './Barcode'
import { NoBarcode } from './NoBarcode'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Product {
  // 🥬 وحدة المنتج (علبة/كيس/...) — null = قطعة
  unitLabel?: string | null
  soldByWeight?: boolean
  id: number
  name: string
  category: string | null
  barcode: string | null
  price: number
  /** null = المستخدم ممنوع من رؤية التكلفة/الأرباح (RBAC) */
  cost: number | null
  quantity: number
  minQuantity: number
  imagePath: string | null
  active: boolean
  soldQuantity?: number
  retailMarginPercent?: number | null
  dynamicRetailPrice?: number | null
}

// 🛡️ 2026-10-05: smart product deletion with RESPONSE-LOSS protection.
//
// THE BUG: bulk delete (تحديد الكل) sometimes showed a red "فشل حذف: <اسم>"
// toast even though the product WAS actually deleted. Root cause: the 20s
// client-side abort in api-offline.ts (or a dev-server cold compile / HMR
// restart) dropped the RESPONSE while the server still finished the deletion
// → the client counted the product as "failed" although it was gone from
// the DB a moment later.
//
// THE FIX: treat HTTP 404 ("المنتج غير موجود") as ALREADY-DELETED = success,
// and retry the whole check→archive dance ONCE on transient failures
// (timeout / 5xx). A lost response now self-heals on the retry:
//   - server already deleted it → retry gets 404 → counted as deleted ✓
//   - server didn't delete it  → retry actually performs the deletion ✓
type DeleteOutcome = 'deleted' | 'archived' | 'failed'

function isAlreadyDeleted(e: any): boolean {
  return e?.status === 404 || String(e?.body?.error ?? '').includes('غير موجود')
}

async function deleteOneProduct(id: number): Promise<DeleteOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // check mode: no references → server hard-deletes immediately
      await api(`/api/products/${id}`, { method: 'DELETE' })
      return 'deleted'
    } catch (e: any) {
      // Session problems never get better by retrying.
      if (e?.status === 401 || e?.status === 403) return 'failed'
      // 404 = a previous attempt already deleted it (its response was lost)
      if (isAlreadyDeleted(e)) return 'deleted'
      const totalRefs = e?.body?.total_references
      if (totalRefs > 0) {
        // has history → accounting-safe archive (unlink FKs, keep snapshots)
        try {
          await api(`/api/products/${id}?mode=archive`, { method: 'DELETE' })
          return 'archived'
        } catch (e2: any) {
          if (e2?.status === 401 || e2?.status === 403) return 'failed'
          if (isAlreadyDeleted(e2)) return 'deleted'
          if (attempt === 0) continue // one full retry (cold/aborted request)
          return 'failed'
        }
      }
      if (attempt === 0) continue // one full retry (cold/aborted request)
      return 'failed'
    }
  }
  return 'failed'
}

export function ProductsView() {
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  // ⚡ 2026-10-19 (على طريقة نقطة البيع): الـ skeleton في أول تحميل بس. بعد كده القايمة
  // القديمة تفضل ظاهرة والتحديث بيتم في الخلفية (شريط رفيع) بدل ما الشبكة تفضى كل مرة.
  const [refreshing, setRefreshing] = React.useState(false)
  const hasLoadedRef = React.useRef(false)
  const loadSeqRef = React.useRef(0) // رقم آخر طلب — يتجاهل الردود القديمة المتأخرة
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [sort, setSort] = React.useState('newest')
  const [lowOnly, setLowOnly] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [initial, setInitial] = React.useState<Partial<ProductFormValues> | null>(null)
  const [catDialogOpen, setCatDialogOpen] = React.useState(false)
  const [confirmId, setConfirmId] = React.useState<number | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const PAGE_SIZE = 50
  const [labelsDialogOpen, setLabelsDialogOpen] = React.useState(false)
  const [unitsFor, setUnitsFor] = React.useState<{id:number;name:string;price:number}|null>(null)
  const [variantsFor, setVariantsFor] = React.useState<{id:number;name:string}|null>(null)
  const [collectionDlg, setCollectionDlg] = React.useState(false)
  const t = useVocab()
  const capabilities = useShopStore((st) => st.plan.capabilities)
  // 🔒 RBAC: التكلفة والهامش للمدير أو لمن عنده صلاحية الأرباح بس
  const canSeeCost = useShopStore((st) => st.user?.role === 'ADMIN' || st.user?.role === 'SUPER_ADMIN' || st.user?.canViewProfits === true)
  const [singlePrintProduct, setSinglePrintProduct] = React.useState<Product | null>(null)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  // شكل البطاقة المختار في الإعدادات: auto | image | compact
  const [cardStyle, setCardStyle] = React.useState<'auto' | 'image' | 'compact'>('auto')
  const loadCardStyle = React.useCallback(() => {
    api<{ productCardStyle?: string }>('/api/tenant')
      .then((d) => {
        const v = d?.productCardStyle
        if (v === 'auto' || v === 'image' || v === 'compact') setCardStyle(v)
      })
      .catch(() => {})
  }, [])
  React.useEffect(() => {
    loadCardStyle()
  }, [loadCardStyle])
  useDataRefresh(['settings'], loadCardStyle)

  // طريقة العرض (بطاقات / قائمة) — تتحفظ في المتصفح
  const [view, setView] = React.useState<'tags' | 'list'>(() => {
    try {
      if (typeof window === 'undefined') return 'tags'
      return localStorage.getItem('products-view') === 'list' ? 'list' : 'tags'
    } catch {
      return 'tags'
    }
  })
  const searchWrapRef = React.useRef<HTMLDivElement>(null)
  const changeView = (v: 'tags' | 'list') => {
    setView(v)
    try { localStorage.setItem('products-view', v) } catch { /* ignore */ }
  }
  // اختصار "/" للتركيز على البحث
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      searchWrapRef.current?.querySelector('input')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loadCats = React.useCallback(async () => {
    try {
      const data = await api<{ id: number; name: string }[]>('/api/categories')
      setCategories(data)
    } catch {
      /* ignore */
    }
  }, [])

  const loadProducts = React.useCallback(async (p = page) => {
    const seq = ++loadSeqRef.current
    if (hasLoadedRef.current) setRefreshing(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category && category !== 'all') params.set('category', category)
      params.set('status', status)
      if (sort !== 'newest') params.set('sort', sort)
      if (lowOnly) params.set('stock', 'low')
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      const res = await api<{ data: Product[]; total: number; totalPages: number }>(`/api/products?${params.toString()}`)
      if (seq !== loadSeqRef.current) return // وصل رد أحدث — تجاهل ده
      setProducts(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      hasLoadedRef.current = true
    } catch (e: any) {
      if (seq !== loadSeqRef.current) return
      if (e?.message?.includes('لا توجد بيانات محفوظة')) {
        toast.info('أنت غير متصل — افتح المنتجات مرة واحدة وأنت متصل لحفظها')
      } else {
        toast.error(e?.message || t('فشل تحميل المنتجات'))
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [search, category, status, sort, lowOnly, page, PAGE_SIZE])

  React.useEffect(() => {
    loadCats()
  }, [loadCats])

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1)
  }, [search, category, status, sort, lowOnly])

  React.useEffect(() => {
    // ⚡ v10: الديباونس للتايبينج/تغيير الفلاتر بس — أول تحميل بالوضع
    // الافتراضي يبدأ فوراً (0ms) بدل انتظار 400ms قبل أول طلب.
    const isDefaultState = !search.trim() && category === 'all' && status === 'all' && sort === 'newest' && !lowOnly && page === 1
    const t = setTimeout(() => loadProducts(page), isDefaultState ? 0 : 400)
    return () => clearTimeout(t)
  }, [loadProducts, page])

  // 🛡️ ROOT FIX (2026-09-27): refetch live whenever ANY write anywhere in the
  // app touches products/categories — not just ones made from this view
  // (e.g. a stock adjustment from the Inventory page, or a sale from POS).
  useDataRefresh(['products', 'categories'], () => { loadProducts(); loadCats() })

  // Quick-add product requested from POS
  React.useEffect(() => {
    if (quickAdd.open) {
      setInitial(quickAdd.seed ? { name: quickAdd.seed, barcode: quickAdd.seed } : {})
      setDialogOpen(true)
      closeQuickAdd()
    }
  }, [quickAdd, closeQuickAdd])

  const openAdd = () => {
    setInitial(null)
    setDialogOpen(true)
  }

  // 👋 جاي من شاشة الترحيب (/products?new=1) → افتح نافذة إضافة منتج مرة واحدة
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('new') === '1') {
        url.searchParams.delete('new')
        window.history.replaceState(null, '', url.pathname + url.search)
        setInitial(null)
        setDialogOpen(true)
      }
    } catch { /* ignore */ }
     
  }, [])
  const openEdit = (p: Product) => {
    setInitial({
      id: p.id,
      name: p.name,
      category: p.category,
      barcode: p.barcode,
      price: p.price,
      cost: p.cost,
      quantity: p.quantity,
      minQuantity: p.minQuantity,
      imagePath: p.imagePath,
      retailMarginPercent: p.retailMarginPercent ?? null,
      // 🥬 لازم يتمرروا، وإلا تعديل أي منتج بالوزن كان هيرجّعه «قطعة» ويمسح وحدته
      soldByWeight: p.soldByWeight === true,
      unitLabel: p.unitLabel ?? null,
    })
    setDialogOpen(true)
  }

  const removeProduct = async (id: number) => {
    // 🛡️ 2026-09-15 (v3 → v4): Smart, accounting-aware product deletion.
    //
    // v4 fix: was using `toast()` with both `action` + `cancel` options,
    // but sonner 2.0.7 only supports ONE action button per regular toast.
    // The `cancel` option was silently ignored, so the user saw the message
    // but no buttons → couldn't proceed.
    //
    // v4 fix: use `toast.custom()` to render a custom React component
    // with BOTH buttons (حذف نهائي محاسبياً + تعطيل فقط) inside the toast.
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' })
      // Success — product was hard-deleted immediately (no FK refs)
      setProducts((prev) => prev.filter((p) => p.id !== id))
      setSelectedIds((prev) => {
        const next = new Set(prev); next.delete(id); return next
      })
      toast.success('تم حذف المنتج نهائياً (مفيش بيانات مربوطة بيه)')
      if (typeof navigator === 'undefined' || navigator.onLine) {
        loadCats()
      }
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ محلياً') || e?.message?.includes('offline')) {
        // Offline — optimistic queue
        setProducts((prev) => prev.filter((p) => p.id !== id))
        toast.success('تم حذف المنتج (offline — سيتم المزامنة لاحقاً)')
      } else if (isAlreadyDeleted(e)) {
        // 🛡️ 2026-10-05: 404 = محذوف بالفعل (محاولة سابقة اتحذفت response بتاعها
        // بسبب timeout / إعادة تشغيل السيرفر) — نجاح مش فشل.
        setProducts((prev) => prev.filter((p) => p.id !== id))
        setSelectedIds((prev) => {
          const next = new Set(prev); next.delete(id); return next
        })
        toast.success('المنتج محذوف بالفعل — السجل المالي محفوظ')
      } else {
        // 🛡️ 2026-09-15 (v4): Use toast.custom() to render a custom toast
        // with TWO buttons. sonner's regular `toast()` only supports one
        // `action` button, so the previous `cancel` option was ignored.
        const errorBody = e?.body ?? e
        const references = errorBody?.references
        const totalRefs = errorBody?.total_references
        const mainError = errorBody?.error ?? errorBody?.message ?? e?.message ?? 'فشل الحذف'

        if (references && totalRefs > 0) {
          const refSummary = [
            references.sale_items ? `${references.sale_items} صنف بيع` : null,
            references.stock_movements ? `${references.stock_movements} حركة مخزون` : null,
            references.transfer_items ? `${references.transfer_items} تحويل` : null,
            references.stocktake_items ? `${references.stocktake_items} جرد` : null,
            references.purchase_order_items ? `${references.purchase_order_items} شراء` : null,
          ].filter(Boolean).join('، ')

          // 🛡️ toast.custom() lets us render any React element as the toast.
          // We pass a function that receives the toast ID (so we can dismiss
          // it after the user clicks a button).
          toast.custom((toastId) => (
            <div
              dir="rtl"
              className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-lg dark:border-amber-700 dark:bg-amber-950"
              style={{ maxWidth: '440px' }}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    {mainError}
                  </p>
                  {refSummary && (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                      المنتج مربوط بـ: {refSummary}.
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                    الخزنة + المبيعات + التقارير محفوظة في الحالتين.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700"
                  onClick={async () => {
                    try {
                      const archiveResult = await api(
                        `/api/products/${id}?mode=archive`,
                        { method: 'DELETE' }
                      )
                      setProducts((prev) => prev.filter((p) => p.id !== id))
                      setSelectedIds((prev) => {
                        const next = new Set(prev); next.delete(id); return next
                      })
                      toast.dismiss(toastId)
                      toast.success(
                        `تم حذف المنتج نهائياً. السجل المالي محفوظ (${archiveResult?.cleared_references?.sale_items ?? 0} صنف بيع، ${archiveResult?.cleared_references?.stock_movements ?? 0} حركة مخزون)`
                      )
                      if (typeof navigator === 'undefined' || navigator.onLine) {
                        loadCats()
                      }
                    } catch (err: any) {
                      toast.dismiss(toastId)
                      // 🛡️ 2026-10-05: 404 = الحذف المحاسبي نجح فعلاً من محاولة
                      // سابقة (الـ response ضاع بسبب timeout / recompile) —
                      // ممنوع نعرض إشعار أحمر لمنتج اتحذف بالفعل.
                      if (isAlreadyDeleted(err)) {
                        setProducts((prev) => prev.filter((p) => p.id !== id))
                        setSelectedIds((prev) => {
                          const next = new Set(prev); next.delete(id); return next
                        })
                        toast.success('تم حذف المنتج نهائياً. السجل المالي محفوظ')
                        if (typeof navigator === 'undefined' || navigator.onLine) {
                          loadCats()
                        }
                        return
                      }
                      // 🛡️ 2026-09-15 (v5): Show the FULL error detail so we can
                      // see the actual DB error. The err.body has the structured
                      // response from the DELETE endpoint (error, detail,
                      // suggestion). The err.message is just the top-level message.
                      const mainErr = err?.message || 'فشل الحذف المحاسبي'
                      const detail = err?.body?.detail
                      const suggestion = err?.body?.suggestion
                      if (detail || suggestion) {
                        // Show full toast with detail + suggestion
                        toast.custom((toastId2) => (
                          <div
                            dir="rtl"
                            className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-lg dark:border-rose-700 dark:bg-rose-950"
                            style={{ maxWidth: '480px' }}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xl">❌</span>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                                  {mainErr}
                                </p>
                                {detail && (
                                  <p className="mt-1 text-xs text-rose-800 dark:text-rose-200" dir="ltr">
                                    {String(detail)}
                                  </p>
                                )}
                                {suggestion && (
                                  <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
                                    {suggestion}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="self-end rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                              onClick={() => toast.dismiss(toastId2)}
                            >
                              إغلاق
                            </button>
                          </div>
                        ), { duration: 30000 })
                      } else {
                        toast.error(mainErr)
                      }
                    }
                  }}
                >
                  حذف نهائي محاسبياً ✓
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
                  onClick={() => {
                    const prod = products.find((p) => p.id === id)
                    if (prod) {
                      toggleActive({ ...prod, active: true }).then(() => {
                        setProducts((prev) => prev.filter((p) => p.id !== id))
                        toast.dismiss(toastId)
                        toast.success('تم تعطيل المنتج (هيختفي من القائمة، تقدر تفعلّه تاني من الفلتر)')
                      })
                    }
                  }}
                >
                  تعطيل فقط (آمن)
                </button>
                <button
                  type="button"
                  className="rounded-md bg-muted px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted/70"
                  onClick={() => toast.dismiss(toastId)}
                  title="إغلاق"
                >
                  ✕
                </button>
              </div>
            </div>
          ), {
            duration: 30000, // 30 seconds — give user time to read + decide
          })
        } else {
          // Old-style error (no references field) — show generic error
          toast.error(mainError)
        }
      }
    } finally {
      setConfirmId(null)
    }
  }

  const toggleActive = async (p: Product) => {
    // ⚡ Optimistic update: update the UI immediately
    const newActive = !p.active
    setProducts((prev) => prev.map((item) =>
      item.id === p.id ? { ...item, active: newActive } : item
    ))

    try {
      await api(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: { active: newActive },
      })
      toast.success(newActive ? 'تم تفعيل المنتج' : 'تم تعطيل المنتج')
      // Only reload from server if we're online (offline = already updated locally)
      if (typeof navigator === 'undefined' || navigator.onLine) {
        loadProducts()
      }
    } catch (e: any) {
      // ⚡ Offline: the PATCH was queued in outbox — show success
      // The optimistic update already happened above
      if (e?.message?.includes('تم الحفظ محلياً') || e?.message?.includes('offline')) {
        toast.success(`${newActive ? 'تم تفعيل' : 'تم تعطيل'} المنتج (offline — سيتم المزامنة لاحقاً)`)
      } else {
        // Revert optimistic update on real error
        setProducts((prev) => prev.map((item) =>
          item.id === p.id ? { ...item, active: p.active } : item
        ))
        toast.error(e?.message || 'فشل التحديث')
      }
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))
    )
  }
  const printOneLabel = (p: Product) => {
    setSinglePrintProduct(p)
    setLabelsDialogOpen(true)
  }
  const exportExcel = () => {
    if (products.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName(t('قائمة-المنتجات')),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: t('قائمة المنتجات'),
      periodLabel: category !== 'all' ? `التصنيف: ${category}` : undefined,
      sheetName: t('المنتجات'),
      columns: [
        { header: 'المنتج', key: 'name', format: 'text' },
        { header: 'التصنيف', key: 'category', format: 'text' },
        { header: 'الباركود', key: 'barcode', format: 'text' },
        { header: 'سعر البيع', key: 'price', format: 'currency' },
        { header: 'سعر القطعة', key: 'effectiveRetailPrice', format: 'currency' },
        ...(canSeeCost ? [{ header: 'التكلفة', key: 'cost', format: 'currency' as const }] : []),
        { header: 'الكمية المتاحة', key: 'quantity', format: 'int' },
        { header: 'الحد الأدنى', key: 'minQuantity', format: 'int' },
        { header: 'الكمية المباعة', key: 'soldQuantity', format: 'int' },
      ],
      rows: products.map((p) => ({
        name: p.name,
        category: p.category || '-',
        barcode: p.barcode || '-',
        price: p.price,
        // Unit-Based Dynamic Pricing: the price actually charged for the
        // "Piece / قطعة" unit — cost+margin when enabled, else same as
        // the flat sale price. Never the wholesale ProductUnit price.
        effectiveRetailPrice: p.dynamicRetailPrice ?? p.price,
        ...(canSeeCost ? { cost: p.cost } : {}),
        quantity: p.quantity,
        minQuantity: p.minQuantity,
        soldQuantity: p.soldQuantity ?? 0,
      })),
      totals: {
        name: 'الإجمالي',
        quantity: products.reduce((s, p) => s + p.quantity, 0),
        soldQuantity: products.reduce((s, p) => s + (p.soldQuantity ?? 0), 0),
      },
    })
  }

  const openBulkLabels = () => {
    setSinglePrintProduct(null)
    setLabelsDialogOpen(true)
  }
  const labelProducts = singlePrintProduct
    ? [singlePrintProduct]
    : products.filter((p) => selectedIds.has(p.id))

  const hasFilters = search.trim() !== '' || category !== 'all' || status !== 'all' || lowOnly
  const clearFilters = () => {
    setSearch('')
    setCategory('all')
    setStatus('all')
    setLowOnly(false)
  }
  const lowOnPage = products.filter((p) => p.active && p.quantity <= p.minQuantity).length
  const allSelected = products.length > 0 && selectedIds.size === products.length
  // سعر القطعة خاص بباقة الجملة (الاحترافية) فقط — القطاعي بيكتب سعره وخلاص
  const isWholesale = capabilities.includes('multi_unit')
  const selectionMode = selectedIds.size > 0
  // تلقائي: بطاقة الصورة لو نص منتجات الصفحة على الأقل ليها صور، وإلا البطاقة المضغوطة
  const imageShare = products.length > 0 ? products.filter((p) => !!p.imagePath).length / products.length : 0
  const cardVariant: 'image' | 'compact' =
    cardStyle === 'auto' ? (imageShare >= 0.5 ? 'image' : 'compact') : cardStyle

  const rowActions = (p: Product) => ({
    p,
    capabilities,
    onEdit: () => openEdit(p),
    onPrint: () => printOneLabel(p),
    onUnits: () => setUnitsFor({ id: p.id, name: p.name, price: p.price }),
    onVariants: () => setVariantsFor({ id: p.id, name: p.name }),
    onToggle: () => toggleActive(p),
    onDelete: () => setConfirmId(p.id),
  })

  return (
    <div className="space-y-5">
      {/* ═══ الرأس ═══ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="relative flex size-12 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm"
          >
            <Tag className="size-5 -rotate-45" />
            <span className="absolute end-2 top-2 size-1.5 rounded-full bg-background/80" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{t('المنتجات')}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className="tabular-nums">
                <b className="font-extrabold text-foreground">{total}</b> صنف
              </span>
              {!loading && (lowOnly || lowOnPage > 0) && (
                <button
                  type="button"
                  onClick={() => setLowOnly((v) => !v)}
                  aria-pressed={lowOnly}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors',
                    lowOnly
                      ? 'bg-foreground text-background'
                      : 'bg-warning-subtle text-warning-subtle-foreground hover:brightness-95'
                  )}
                >
                  <AlertTriangle className="size-3" />
                  {lowOnly ? 'المنخفض فقط — إلغاء' : `${lowOnPage} منخفض في الصفحة — اعرضهم`}
                </button>
              )}
            </p>
          </div>
        </div>

        {/* 📱 موبايل: الأزرار الثانوية 2×2 + "منتج جديد" بارز بعرض كامل.
            من sm+ وفوق: كل الأزرار صف أفقي زي الأصل. */}
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:items-center">
          <Button
            variant="outline"
            className="h-10 flex-1 basis-[calc(50%-4px)] sm:h-10 sm:flex-initial sm:basis-auto"
            onClick={() => setCatDialogOpen(true)}
          >
            <FolderOpen className="size-4" />
            التصنيفات
          </Button>
          <Button
            variant="outline"
            className="h-10 flex-1 basis-[calc(50%-4px)] sm:h-10 sm:flex-initial sm:basis-auto"
            onClick={exportExcel}
            disabled={products.length === 0}
          >
            <FileSpreadsheet className="size-4" />
            تصدير Excel
          </Button>
          {capabilities.includes('collections') && (
            <Button
              variant="outline"
              className="h-10 flex-1 basis-[calc(50%-4px)] sm:h-10 sm:flex-initial sm:basis-auto"
              onClick={() => setCollectionDlg(true)}
            >
              <Percent className="size-4" />
              خصم كوليكشن
            </Button>
          )}

          {/* ➕ منتج جديد — الزر الأساسي: بارز، مميّز، يملئ الفراغ على الموبايل */}
          <Button
            onClick={openAdd}
            className={cn(
              'group/add relative h-12 gap-2 overflow-hidden rounded-xl',
              // 📱 موبايل: صف كامل بعرض كامل + تصميم بارز
              'basis-full shadow-lg shadow-primary/25',
              // 🖥️ sm+: يرجع لحجمه الطبيعي زي باقي الأزرار
              'sm:h-10 sm:basis-auto sm:gap-1.5 sm:rounded-lg sm:shadow-sm sm:hover:bg-primary/90'
            )}
          >
            {/* لمعة خفيفة تمرّ على الزر */
            }
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary-foreground/15 to-transparent transition-transform duration-700 group-hover/add:translate-x-full"
            />
            <span className="relative flex size-7 items-center justify-center rounded-lg bg-primary-foreground/20 sm:size-5">
              <Plus className="size-4 sm:size-3.5" strokeWidth={3} />
            </span>
            <span className="relative text-base font-extrabold sm:text-sm sm:font-bold">
              {t('منتج جديد')}
            </span>
          </Button>
        </div>
      </header>

      {/* ═══ شريط التحكم ═══ */}
      {/* 📱 موبايل: شبكة 2×2 — من sm+ وفوق: صف أفقي زي الأصل.
          ترتيب العرض: بحث → (تصنيف + ترتيب) → حالة → (منخفض + تحديد الكل) */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-foreground/15 bg-card p-2 shadow-xs sm:flex sm:flex-wrap sm:items-center">
        {/* ① البحث — عرض كامل على الموبايل */}
        <div ref={searchWrapRef} className="relative col-span-2 min-w-0 sm:min-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الباركود..."
            className="h-10 rounded-xl border-0 bg-muted/60 pe-10 ps-9 shadow-none focus-visible:bg-background"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="مسح البحث"
              className="absolute left-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground hover:bg-foreground/20"
            >
              <X className="size-3" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute left-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
              /
            </kbd>
          )}
        </div>

        {/* ② التصنيف — نصف عرض على الموبايل */}
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-10 w-full min-w-0 rounded-xl border-0 bg-muted/60 shadow-none sm:w-[170px]">
            <SelectValue placeholder="كل التصنيفات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ③ الترتيب — نصف عرض على الموبايل */}
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 w-full min-w-0 rounded-xl border-0 bg-muted/60 shadow-none sm:w-[160px]" aria-label="ترتيب">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="الترتيب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">الأحدث أولاً</SelectItem>
            <SelectItem value="name">الاسم (أ → ي)</SelectItem>
            <SelectItem value="price_desc">السعر: الأعلى</SelectItem>
            <SelectItem value="price_asc">السعر: الأقل</SelectItem>
            <SelectItem value="qty_asc">المخزون: الأقل</SelectItem>
            <SelectItem value="qty_desc">المخزون: الأعلى</SelectItem>
            <SelectItem value="sold">الأكثر مبيعاً</SelectItem>
          </SelectContent>
        </Select>

        {/* ④ الحالة — عرض كامل على الموبايل (3 أزرار موزّعة) */}
        <div role="group" aria-label="الحالة" className="col-span-2 flex rounded-xl bg-muted/60 p-1 sm:w-auto">
          {(
            [
              ['all', 'الكل'],
              ['active', 'مفعّل'],
              ['inactive', 'معطّل'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={status === v}
              onClick={() => setStatus(v)}
              className={cn(
                'h-8 flex-1 rounded-lg px-3 text-xs font-bold transition-colors sm:flex-initial',
                status === v
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ⑤ منخفض فقط — نصف عرض على الموبايل */}
        <button
          type="button"
          aria-pressed={lowOnly}
          onClick={() => setLowOnly((v) => !v)}
          className={cn(
            'inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors sm:w-auto sm:justify-start',
            lowOnly ? 'bg-foreground text-background shadow-sm' : 'bg-muted/60 text-muted-foreground hover:text-foreground'
          )}
        >
          <AlertTriangle className="size-3.5" />
          منخفض فقط
        </button>

        {/* ⑥ تحديد الكل — نصف عرض على الموبايل */}
        <label className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-2 text-xs font-bold text-muted-foreground hover:bg-muted/60 sm:w-auto sm:justify-start">
          <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} disabled={products.length === 0} />
          <span>تحديد الكل</span>
        </label>

        {/* ⑦ طريقة العرض — زي ما هي (xl فأكثر بس) */}
        <div role="group" aria-label="طريقة العرض" className="hidden rounded-xl bg-muted/60 p-1 xl:flex">
          <button
            type="button"
            aria-pressed={view === 'tags'}
            title="عرض بطاقات"
            onClick={() => changeView('tags')}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg transition-colors',
              view === 'tags' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            aria-pressed={view === 'list'}
            title="عرض قائمة"
            onClick={() => changeView('list')}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg transition-colors',
              view === 'list' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Rows3 className="size-4" />
          </button>
        </div>
      </div>

      {/* ═══ المحتوى ═══ */}
      {refreshing && !loading && (
        <div aria-hidden className="h-0.5 w-full animate-pulse rounded-full bg-foreground/25" />
      )}
      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-foreground/10 bg-card p-3 pt-9">
              <Skeleton className="aspect-[5/4] w-full rounded-xl" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-foreground/20 bg-card/50 px-6 py-16 text-center">
          <span className="relative flex size-16 items-center justify-center rounded-2xl border border-foreground/15 bg-card shadow-sm">
            <Tag className="size-7 -rotate-45 text-muted-foreground" />
          </span>
          <p className="text-lg font-extrabold">
            {hasFilters ? 'مفيش منتج مطابق للبحث' : 'لسه مضفتش أي منتج'}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasFilters
              ? 'جرّب تغيّر كلمة البحث أو التصنيف أو الحالة.'
              : 'ابدأ بأول صنف، وهيظهر هنا كبطاقة بسعره ومخزونه وباركوده.'}
          </p>
          {hasFilters ? (
            <Button variant="outline" onClick={clearFilters}>
              <X className="size-4" />
              مسح الفلاتر
            </Button>
          ) : (
            <Button onClick={openAdd}>
              <Plus className="size-4" />
              {t('منتج جديد')}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* بطاقات: الافتراضي، وهي الوحيدة تحت xl */}
          <div
            className={cn(
              'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-5',
              view === 'list' && 'xl:hidden'
            )}
          >
            {products.map((p, index) => (
              <ProductTag
                key={p.id}
                index={index}
                selected={selectedIds.has(p.id)}
                selectionMode={selectionMode}
                variant={cardVariant}
                onSelect={() => toggleSelect(p.id)}
                {...rowActions(p)}
              />
            ))}
          </div>

          {/* قائمة مضغوطة (xl فأكثر) */}
          {view === 'list' && (
            <div className="hidden overflow-hidden rounded-2xl border border-foreground/15 bg-card xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-14 px-3 text-center [&:has([role=checkbox])]:pr-5">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead>المنتج</TableHead>
                    <TableHead className="w-44">الباركود</TableHead>
                    {canSeeCost && <TableHead className="w-24 text-center">التكلفة</TableHead>}
                    <TableHead className="w-28 text-center">السعر</TableHead>
                    {/* 🛡️ 2026-10-03: header عمود سعر القطعة — باقة احترافية فقط */}
                    {capabilities.includes('dynamic_retail_pricing') && <TableHead className="w-36 text-center">سعر القطعة</TableHead>}
                    <TableHead className="w-48">المخزون</TableHead>
                    <TableHead className="w-20 text-center">مبيعات</TableHead>
                    <TableHead className="w-24 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const st = stockState(p)
                    const ui = STOCK_UI[st]
                    return (
                      <TableRow
                        key={p.id}
                        data-state={selectedIds.has(p.id) ? 'selected' : undefined}
                        className={cn(!p.active && 'opacity-50', 'hover:bg-muted/40')}
                      >
                        <TableCell className="px-3 text-center [&:has([role=checkbox])]:pr-5">
                          <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="flex items-center gap-3 text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg"
                          >
                            <ProductAvatar name={p.name} imagePath={p.imagePath} size="sm" />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 font-bold">
                                {p.name}
                                {!p.active && (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                    معطل
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">{p.category || 'بدون تصنيف'}</span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          {p.barcode ? <Barcode value={p.barcode} height={20} fontSize={8} fitContainer /> : <NoBarcode compact />}
                        </TableCell>
                        {canSeeCost && (
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {formatCurrency(p.cost)}
                          </TableCell>
                        )}
                        <TableCell className="text-center font-extrabold tabular-nums">
                          {formatCurrency(p.price)}
                        </TableCell>
                        {capabilities.includes('dynamic_retail_pricing') && (
                          <TableCell className="text-center tabular-nums">
                            {p.dynamicRetailPrice != null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="font-extrabold text-primary">{formatCurrency(p.dynamicRetailPrice)}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  تلقائي {p.retailMarginPercent != null ? `(${p.retailMarginPercent}%)` : ''}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">{formatCurrency(p.price)}</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={cn('min-w-10 text-lg font-extrabold tabular-nums', ui.text)}>{p.quantity}{p.unitLabel && <span className="ms-1 text-[10px] font-semibold text-muted-foreground">{unitWord(p.quantity, p.unitLabel)}</span>}</span>
                            <div className="min-w-0 flex-1">
                              <StockMeter p={p} compact />
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {ui.label} · الحد الأدنى {p.minQuantity}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold tabular-nums">{p.soldQuantity ?? 0}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" title="تعديل المنتج" onClick={() => openEdit(p)}>
                              <Pencil className="size-4" />
                            </Button>
                            <ProductActions {...rowActions(p)} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* ═══ شريط التحديد الجماعي (لاصق أسفل الشاشة) ═══ */}
      {selectionMode && (
        <div className="sticky bottom-4 z-30 flex justify-center">
          <div className="animate-in-up flex flex-wrap items-center gap-1.5 rounded-2xl bg-foreground px-3 py-2 text-background shadow-xl">
            <span className="px-2 text-sm font-extrabold tabular-nums">{selectedIds.size} محدد</span>
            <Button variant="ghost" size="sm" className="text-background hover:bg-background/15 hover:text-background" onClick={openBulkLabels}>
              <Printer className="size-4" />
              طباعة ملصقات
            </Button>
            <Button variant="ghost" size="sm" className="bg-destructive text-white hover:bg-destructive/90 hover:text-white" onClick={() => setBulkConfirmOpen(true)}>
              <Trash2 className="size-4" />
              حذف المحدد
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-background hover:bg-background/15 hover:text-background" onClick={() => setSelectedIds(new Set())} aria-label="إلغاء التحديد">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={initial}
        categories={categories}
        onSaved={() => {
          // ⚡ Online: reload from server. Offline: loadProducts() returns
          // cached data (which doesn't include the new product, but the
          // toast says "تم الحفظ" so user knows it's queued).
          loadProducts()
          loadCats()
        }}
      />
      <CategoryManagerDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        onChanged={() => {
          loadCats()
          loadProducts()
        }}
      />
      <PrintLabelsDialog
        open={labelsDialogOpen}
        onOpenChange={(v) => {
          setLabelsDialogOpen(v)
          if (!v) setSinglePrintProduct(null)
        }}
        products={labelProducts}
      />
      <ProductUnitsDialog
        open={!!unitsFor}
        onOpenChange={(o) => !o && setUnitsFor(null)}
        product={unitsFor}
        onChanged={loadProducts}
      />
      <ProductVariantsDialog
        open={!!variantsFor}
        onOpenChange={(o) => !o && setVariantsFor(null)}
        product={variantsFor}
        onChanged={loadProducts}
      />
      <CollectionDiscountDialog
        open={collectionDlg}
        onOpenChange={setCollectionDlg}
        collections={Array.from(new Set(products.map((p:any) => p.collection).filter(Boolean)))}
        onDone={loadProducts}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} setPage={setPage} />
      )}

      {/* simple inline confirm */}
      {confirmId !== null && (
        <ConfirmDialog
          title="حذف المنتج"
          message="هل أنت متأكد من حذف هذا المنتج نهائياً؟ لو المنتج له مبيعات سابقة، استخدم زر التعطيل بدلاً من الحذف."
          onConfirm={() => removeProduct(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}

      {/* bulk delete confirm */}
      {bulkConfirmOpen && (
        <ConfirmDialog
          title={`حذف ${selectedIds.size} منتج`}
          message={t('المنتجات التي ليس لها بيانات مرتبطة ستُحذف نهائياً. المنتجات التي لها مبيعات أو مخزون ستُحذف محاسبياً مع الحفاظ على السجل المالي.')}
          onConfirm={async () => {
            setBulkConfirmOpen(false)
            const ids = Array.from(selectedIds)
            let deleted = 0
            let archived = 0
            const failed: string[] = []
            for (const id of ids) {
              // 🛡️ 2026-10-05: deleteOneProduct self-heals lost responses
              // (404 = already deleted → success) so a product that IS gone
              // from the DB can never be reported as "فشل الحذف" anymore.
              const outcome = await deleteOneProduct(id)
              if (outcome === 'deleted') deleted++
              else if (outcome === 'archived') archived++
              else failed.push(products.find((p) => p.id === id)?.name ?? `#${id}`)
            }
            setSelectedIds(new Set())
            await loadProducts()
            if (deleted > 0) toast.success(`تم حذف ${deleted} منتج نهائياً`)
            if (archived > 0) toast.success(`تم حذف ${archived} منتج محاسبياً مع حفظ السجل المالي`)
            if (failed.length > 0) toast.error(`فشل حذف: ${failed.join('، ')}`, { duration: 6000 })
          }}
          onCancel={() => setBulkConfirmOpen(false)}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   هوية صفحة المنتجات: "بطاقة التعليق" (Hang-Tag)
   كل منتج بطاقة بخيط وثقب ونقطة تمزيق وباركود، والسعر ملصق حبر.
   الألوان الوظيفية الوحيدة هي حالة المخزون (أخضر / كهرماني / أحمر)،
   وكل الباقي حبر وورق من tokens النظام فيشتغل في الداكن تلقائياً.
   ════════════════════════════════════════════════════════════════ */

type StockState = 'out' | 'low' | 'ok'

const stockState = (p: Product): StockState =>
  p.quantity <= 0 ? 'out' : p.quantity <= p.minQuantity ? 'low' : 'ok'

const STOCK_UI: Record<StockState, { label: string; bar: string; text: string; chip: string }> = {
  out: {
    label: 'نفد',
    bar: 'bg-destructive',
    text: 'text-destructive',
    chip: 'bg-destructive/10 text-destructive',
  },
  low: {
    label: 'منخفض',
    bar: 'bg-warning',
    text: 'text-warning-subtle-foreground',
    chip: 'bg-warning-subtle text-warning-subtle-foreground',
  },
  ok: {
    label: 'متوفر',
    bar: 'bg-success',
    text: 'text-success-subtle-foreground',
    chip: 'bg-success-subtle text-success-subtle-foreground',
  },
}

/** عدّاد مخزون من 10 خانات: الهدف = ٣ أضعاف الحد الأدنى (أو الكمية الحالية لو أكبر). */
function StockMeter({ p, compact = false }: { p: Product; compact?: boolean }) {
  const st = stockState(p)
  const target = Math.max(p.minQuantity * 3, p.quantity, 1)
  const filled = p.quantity <= 0 ? 0 : Math.min(10, Math.max(1, Math.round((p.quantity / target) * 10)))
  return (
    <div
      role="meter"
      aria-label="مستوى المخزون"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.max(0, p.quantity)}
      className={cn('flex gap-[3px]', compact ? 'h-1.5' : 'h-2')}
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={cn('flex-1 rounded-full transition-colors', i < filled ? STOCK_UI[st].bar : 'bg-foreground/10')}
        />
      ))}
    </div>
  )
}

/** صورة المنتج أو "مونوجرام" بخطوط مائلة لو مفيش صورة. */
function TagImage({ name, imagePath }: { name: string; imagePath: string | null }) {
  const [err, setErr] = React.useState(false)
  if (imagePath && !err) {
    return <img src={imagePath} alt={name} loading="lazy" onError={() => setErr(true)} className="h-full w-full object-cover" />
  }
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-muted text-5xl font-extrabold text-foreground/25"
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, transparent 0 10px, color-mix(in oklab, currentColor 6%, transparent) 10px 11px)',
      }}
    >
      {name.trim().charAt(0) || '؟'}
    </div>
  )
}

interface ActionsProps {
  p: Product
  capabilities: string[]
  onEdit: () => void
  onPrint: () => void
  onUnits: () => void
  onVariants: () => void
  onToggle: () => void
  onDelete: () => void
}

function ProductActions({ p, capabilities, onPrint, onUnits, onVariants, onToggle, onDelete, triggerClassName }: ActionsProps & { triggerClassName?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-8', triggerClassName)} title="المزيد من الإجراءات">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onPrint}>
          <Printer className="size-4" />
          طباعة ملصق باركود
        </DropdownMenuItem>
        {capabilities.includes('multi_unit') && (
          <DropdownMenuItem onClick={onUnits}>
            <Package className="size-4" />
            وحدات الجملة
          </DropdownMenuItem>
        )}
        {capabilities.includes('variants') && (
          <DropdownMenuItem onClick={onVariants}>
            <Palette className="size-4" />
            الألوان والمقاسات
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onToggle}>
          <Power className={`size-4 ${p.active ? 'text-muted-foreground' : 'text-success-subtle-foreground'}`} />
          {p.active ? 'تعطيل المنتج' : 'تفعيل المنتج'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" />
          حذف نهائي
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProductTag({
  index,
  selected,
  selectionMode,
  variant,
  onSelect,
  ...actions
}: ActionsProps & {
  index: number
  selected: boolean
  selectionMode: boolean
  /** image: صورة كبيرة | compact: شريط مضغوط بصورة مصغّرة (لو موجودة) */
  variant: 'image' | 'compact'
  onSelect: () => void
}) {
  const { p, onEdit } = actions
  const st = stockState(p)
  const ui = STOCK_UI[st]
  const canSeeCost = useShopStore((st) => st.user?.role === 'ADMIN' || st.user?.role === 'SUPER_ADMIN' || st.user?.canViewProfits === true)
  const cost = p.cost ?? 0
  const profit = p.price - cost
  const margin = canSeeCost && p.cost != null && p.cost > 0 && p.price > 0 ? Math.round((profit / p.price) * 100) : null
  const compact = variant === 'compact'

  return (
    <article
      className="animate-in-up motion-reduce:animate-none group relative pt-6"
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
    >
      {/* الخيط */}
      <svg aria-hidden width="28" height="34" viewBox="0 0 28 34" fill="none" className="absolute left-1/2 top-0 z-20 -translate-x-1/2 text-foreground/40">
        <circle cx="14" cy="6" r="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M14 10v24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <div
        className={cn(
          'relative origin-top overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-slow ease-spring',
          'hover:shadow-lg motion-safe:hover:-rotate-[0.8deg]',
          selected ? 'border-primary ring-2 ring-primary/40' : 'border-foreground/15',
          !p.active && 'grayscale-[0.6]'
        )}
      >
        {/* الثقب */}
        <span aria-hidden className="absolute left-1/2 top-2.5 z-10 size-3.5 -translate-x-1/2 rounded-full border border-foreground/20 bg-background shadow-inner" />

        {/* تحديد + إجراءات */}
        <div className="absolute inset-x-2 top-1.5 z-10 flex items-center justify-between">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg bg-card/90 backdrop-blur transition-opacity',
              selected || selectionMode ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100 max-xl:opacity-100'
            )}
          >
            <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`تحديد ${p.name}`} />
          </span>
          <span className="flex items-center rounded-lg bg-card/90 backdrop-blur">
            <ProductActions {...actions} />
          </span>
        </div>

        {compact ? (
          /* بدون صورة كبيرة: صورة مصغّرة (أو حرف) + الاسم والتصنيف + ملصق السعر */
          <div className="mx-3.5 mt-11 flex items-start gap-3">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`تعديل ${p.name}`}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ProductAvatar name={p.name} imagePath={p.imagePath} size="sm" />
              <span className="min-w-0">
                <span className="line-clamp-2 text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]">{p.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  {p.category || 'بدون تصنيف'}
                  {!p.active && (
                    <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold text-background">معطّل</span>
                  )}
                </span>
              </span>
            </button>
            <span className="shrink-0 rounded-lg bg-foreground px-2.5 py-1 text-background shadow-md">
              <span className="text-lg font-extrabold leading-none tabular-nums">
                {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
              <span className="ms-1 text-[10px] font-semibold opacity-70">جنيه</span>
            </span>
          </div>
        ) : (
          <>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`تعديل ${p.name}`}
          className="relative mx-2.5 mt-9 block aspect-[5/4] w-[calc(100%-1.25rem)] overflow-hidden rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <TagImage name={p.name} imagePath={p.imagePath} />
          <span className="absolute bottom-2 start-2 rounded-lg bg-foreground px-2.5 py-1 text-background shadow-md">
            <span className="text-lg font-extrabold leading-none tabular-nums">
              {p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
            <span className="ms-1 text-[10px] font-semibold opacity-70">جنيه</span>
          </span>
          {!p.active && (
            <span className="absolute end-2 top-2 rounded-md bg-foreground/80 px-2 py-0.5 text-[10px] font-bold text-background">
              معطّل
            </span>
          )}
        </button>

          </>
        )}

        {/* البيانات */}
        <div className="space-y-2 px-4 pb-4 pt-3">
          {!compact && (
          <div>
            <button type="button" onClick={onEdit} className="block w-full text-start outline-none">
              <h3 className="line-clamp-2 text-[15px] font-extrabold leading-snug [overflow-wrap:anywhere]">{p.name}</h3>
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {p.category ? (
                <Badge variant="secondary" className="rounded-md text-[10px]">{p.category}</Badge>
              ) : (
                <span className="text-muted-foreground">بدون تصنيف</span>
              )}
            </div>
          </div>
          )}

          {/* 🛡️ 2026-10-03: عمود سعر القطعة — باقة احترافية فقط */}
          {actions.capabilities.includes('dynamic_retail_pricing') && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-foreground/20 px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">سعر القطعة</span>
            <span className="flex items-baseline gap-1.5 tabular-nums">
              <b className={cn('text-sm font-extrabold', p.dynamicRetailPrice != null ? 'text-primary' : 'text-muted-foreground')}>
                {(p.dynamicRetailPrice ?? p.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </b>
              <span className="text-[10px] text-muted-foreground">
                {p.dynamicRetailPrice != null
                  ? `تلقائي${p.retailMarginPercent != null ? ` ${p.retailMarginPercent}%` : ''}`
                  : 'نفس السعر'}
              </span>
            </span>
          </div>
          )}

          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">المخزون</p>
              <p className={cn('text-2xl font-extrabold leading-none tabular-nums', ui.text)}>{p.quantity}{p.unitLabel && <span className="ms-1 text-[10px] font-semibold text-muted-foreground">{unitWord(p.quantity, p.unitLabel)}</span>}</p>
            </div>
            <div className="text-end">
              <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold', ui.chip)}>{ui.label}</span>
              <p className="mt-1 text-[10px] text-muted-foreground">الحد الأدنى {p.minQuantity}</p>
            </div>
          </div>
          <StockMeter p={p} />
        </div>

        {/* خط التمزيق */}
        <div className="relative">
          <span aria-hidden className="absolute -start-2 -top-2 size-4 rounded-full border border-foreground/15 bg-background" />
          <span aria-hidden className="absolute -end-2 -top-2 size-4 rounded-full border border-foreground/15 bg-background" />
          <div className="mx-4 border-t border-dashed border-foreground/25" />
        </div>

        {/* الباركود + الأرقام الداخلية */}
        <div className="space-y-2 px-4 pb-3.5 pt-3">
          {p.barcode ? (
            <div className="flex justify-center rounded-lg bg-muted/40 py-1.5">
              <Barcode value={p.barcode} height={24} fontSize={9} fitContainer />
            </div>
          ) : (
            <p className="rounded-lg bg-muted/40 py-2 text-center text-[11px] text-muted-foreground">بدون باركود</p>
          )}
          <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            {canSeeCost && p.cost != null ? (
              <span>تكلفة {p.cost.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            ) : (
              <span />
            )}
            {margin !== null && (
              <span className={cn('font-bold', margin >= 0 ? 'text-success-subtle-foreground' : 'text-destructive')}>
                هامش {margin}%
              </span>
            )}
            <span>مباع {p.soldQuantity ?? 0}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

/** ترقيم الصفحات: نفس المنطق القديم بشكل كبسولة. */
function Pager({ page, totalPages, total, pageSize, setPage }: { page: number; totalPages: number; total: number; pageSize: number; setPage: React.Dispatch<React.SetStateAction<number>> }) {
  const span = Math.min(5, totalPages)
  const half = Math.floor(span / 2)
  let start = Math.max(1, page - half)
  const end = Math.min(totalPages, start + span - 1)
  start = Math.max(1, end - span + 1)
  const pages = Array.from({ length: span }, (_, i) => start + i)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
      <p className="text-sm tabular-nums text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total} منتج
      </p>
      <div className="flex items-center gap-1 rounded-full border border-foreground/15 bg-card p-1">
        <Button variant="ghost" size="icon" className="size-8 rounded-full" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="السابق">
          <ChevronRight className="size-4" />
        </Button>
        {pages.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPage(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cn(
              'size-8 rounded-full text-xs font-bold tabular-nums transition-colors',
              n === page ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {n}
          </button>
        ))}
        <Button variant="ghost" size="icon" className="size-8 rounded-full" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="التالي">
          <ChevronLeft className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-sm space-y-4 rounded-2xl border border-foreground/15 bg-card p-6 text-center shadow-xl"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Trash2 className="size-5" />
        </span>
        <h3 className="text-lg font-extrabold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button variant="destructive" onClick={onConfirm}>حذف</Button>
        </div>
      </div>
    </div>
  )
}