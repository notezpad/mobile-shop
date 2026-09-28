'use client'

import * as React from 'react'
import { ProductAvatar } from './ProductAvatar'
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FolderOpen,
  ImageOff,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  Power,
  Printer,
  Search,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Product {
  id: number
  name: string
  category: string | null
  barcode: string | null
  price: number
  cost: number
  quantity: number
  minQuantity: number
  imagePath: string | null
  active: boolean
  soldQuantity?: number
  retailMarginPercent?: number | null
  dynamicRetailPrice?: number | null
}

export function ProductsView() {
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [status, setStatus] = React.useState('all')
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
  const capabilities = useShopStore((st) => st.plan.capabilities)
  const [singlePrintProduct, setSinglePrintProduct] = React.useState<Product | null>(null)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const loadCats = React.useCallback(async () => {
    try {
      const data = await api<{ id: number; name: string }[]>('/api/categories')
      setCategories(data)
    } catch {
      /* ignore */
    }
  }, [])

  const loadProducts = React.useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category && category !== 'all') params.set('category', category)
      params.set('status', status)
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      const res = await api<{ data: Product[]; total: number; totalPages: number }>(`/api/products?${params.toString()}`)
      setProducts(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (e: any) {
      if (e?.message?.includes('لا توجد بيانات محفوظة')) {
        toast.info('أنت غير متصل — افتح المنتجات مرة واحدة وأنت متصل لحفظها')
      } else {
        toast.error(e?.message || 'فشل تحميل المنتجات')
      }
    } finally {
      setLoading(false)
    }
  }, [search, category, status, page, PAGE_SIZE])

  React.useEffect(() => {
    loadCats()
  }, [loadCats])

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1)
  }, [search, category, status])

  React.useEffect(() => {
    const t = setTimeout(() => loadProducts(page), 400)
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
      fileName: excelFileName('قائمة-المنتجات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'قائمة المنتجات',
      periodLabel: category !== 'all' ? `التصنيف: ${category}` : undefined,
      sheetName: 'المنتجات',
      columns: [
        { header: 'المنتج', key: 'name', format: 'text' },
        { header: 'التصنيف', key: 'category', format: 'text' },
        { header: 'الباركود', key: 'barcode', format: 'text' },
        { header: 'سعر البيع', key: 'price', format: 'currency' },
        { header: 'سعر القطعة الفعلي', key: 'effectiveRetailPrice', format: 'currency' },
        { header: 'التكلفة', key: 'cost', format: 'currency' },
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
        cost: p.cost,
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

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">المنتجات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة الأصناف والمخزون
          </p>
        </div>
      </div>

      <Card className="max-w-full overflow-hidden">
        <CardContent className="grid min-w-0 grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
          <div className="relative min-w-0 sm:col-span-2 xl:min-w-[200px] xl:flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الباركود..."
              className="pr-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full xl:w-[180px]">
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
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full xl:w-[150px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">مفعّل فقط</SelectItem>
              <SelectItem value="inactive">معطّل فقط</SelectItem>
            </SelectContent>
          </Select>
          {selectedIds.size > 0 ? (
            /* ── Bulk-action bar (replaces normal actions when items are selected) ── */
            <>
              <span className="self-center text-sm font-medium text-muted-foreground">
                {selectedIds.size} محدد
              </span>
              <Button
                variant="outline"
                onClick={openBulkLabels}
              >
                <Printer className="size-4" />
                طباعة ملصقات
              </Button>
              <Button
                variant="destructive"
                onClick={() => setBulkConfirmOpen(true)}
              >
                <Trash2 className="size-4" />
                حذف المحدد
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedIds(new Set())}
              >
                إلغاء التحديد
              </Button>
            </>
          ) : (
            /* ── Normal toolbar ── */
            <>
              <Button variant="outline" onClick={() => setCatDialogOpen(true)}>
                <FolderOpen className="size-4" />
                التصنيفات
              </Button>
              <Button variant="outline" onClick={exportExcel} disabled={products.length === 0}>
                <FileSpreadsheet className="size-4" />
                تصدير Excel
              </Button>
              {capabilities.includes('collections') && (
                <Button variant="outline" onClick={() => setCollectionDlg(true)}>
                  <Percent className="size-4" />
                  خصم كوليكشن
                </Button>
              )}
              <Button onClick={openAdd}>
                <Plus className="size-4" />
                منتج جديد
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full overflow-hidden py-0">
        <CardContent className="min-w-0 max-w-full p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="hidden w-full max-w-full overflow-x-auto overscroll-x-contain lg:block" dir="ltr">
              {/*
                من lg فما فوق: نعرض الجدول العادي بكل أعمدته. تحته نسخة
                كروت (خارج هذا الشرط) مخصصة للشاشات الأصغر من lg، بدل ما
                نسيب سكرول أفقي على الشاشات الصغيرة/اللابتوبات صغيرة الدقة.
                السبب: جدول بهذا العدد من الأعمدة (12 عمود) لازم مساحة
                عرض كبيرة عشان يتقرأ صح، وعلى الشاشات الضيقة السكرول
                الأفقي بيدي تجربة استخدام مزعجة (المستخدم بيحتاج يسكرول
                يمين وشمال عشان يشوف صف واحد كامل). الكروت بتحل المشكلة
                دي جذريًا بعرض كل بيانات المنتج رأسيًا بدل أفقيًا.
              */}
              <Table className="min-w-[1340px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-center pr-4">
                      <Checkbox
                        checked={products.length > 0 && selectedIds.size === products.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-14 text-center">الصورة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead className="w-24">التصنيف</TableHead>
                    <TableHead className="w-52">الباركود</TableHead>
                    <TableHead className="w-28 text-center">التكلفة</TableHead>
                    <TableHead className="w-28 text-center">السعر</TableHead>
                    <TableHead className="w-32 text-center">سعر القطعة الفعلي</TableHead>
                    <TableHead className="w-16 text-center">الكمية</TableHead>
                    <TableHead className="w-20 text-center">الحد الأدنى</TableHead>
                    <TableHead className="w-24 text-center">عدد المبيعات</TableHead>
                    <TableHead className="w-24 text-center pl-4">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={13}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد منتجات
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((p, index) => {
                      const low = p.quantity <= p.minQuantity
                      return (
                        <TableRow key={p.id} className={!p.active ? 'opacity-50' : 'hover:bg-muted/40'}>
                          <TableCell className="text-center pr-4">
                            <Checkbox
                              checked={selectedIds.has(p.id)}
                              onCheckedChange={() => toggleSelect(p.id)}
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {index + 1}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="mx-auto"><ProductAvatar name={p.name} imagePath={p.imagePath} size="sm" /></div>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              {p.name}
                              {!p.active && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                  معطل
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {p.category ? (
                              <Badge variant="secondary">{p.category}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Barcode value={p.barcode} height={20} fontSize={8} fitContainer />
                          </TableCell>
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {formatCurrency(p.cost)}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {formatCurrency(p.price)}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {p.dynamicRetailPrice != null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="font-semibold text-primary">
                                  {formatCurrency(p.dynamicRetailPrice)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  تلقائي {p.retailMarginPercent != null ? `(${p.retailMarginPercent}%)` : ''}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">{formatCurrency(p.price)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                'font-semibold tabular-nums',
                                low && 'text-destructive'
                              )}
                            >
                              {p.quantity}
                            </span>
                            {low && (
                              <span className="mr-1 text-xs text-destructive">
                                (تنبيه)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {p.minQuantity}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums text-info-subtle-foreground">
                            {p.soldQuantity ?? 0}
                          </TableCell>
                          <TableCell className="text-center pl-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="تعديل المنتج"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    title="المزيد من الإجراءات"
                                  >
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => printOneLabel(p)}>
                                    <Printer className="size-4" />
                                    طباعة ملصق باركود
                                  </DropdownMenuItem>
                                  {capabilities.includes('multi_unit') && (
                                    <DropdownMenuItem
                                      onClick={() => setUnitsFor({ id: p.id, name: p.name, price: p.price })}
                                    >
                                      <Package className="size-4" />
                                      وحدات الجملة
                                    </DropdownMenuItem>
                                  )}
                                  {capabilities.includes('variants') && (
                                    <DropdownMenuItem
                                      onClick={() => setVariantsFor({ id: p.id, name: p.name })}
                                    >
                                      <Palette className="size-4" />
                                      الألوان والمقاسات
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => toggleActive(p)}>
                                    <Power
                                      className={`size-4 ${p.active ? 'text-muted-foreground' : 'text-success-subtle-foreground'}`}
                                    />
                                    {p.active ? 'تعطيل المنتج' : 'تفعيل المنتج'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setConfirmId(p.id)}
                                  >
                                    <Trash2 className="size-4" />
                                    حذف نهائي
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg (لابتوبات صغيرة
            الدقة، تابلت، موبايل). كل منتج بقى كارت مستقل تُعرض فيه كل
            البيانات رأسيًا (صورة + اسم فوق، وتحته Grid صغير بالأرقام
            المهمة)، بدل صف عريض في جدول يحتاج سكرول أفقي ليُقرأ كاملًا.
          */}
          {!loading && (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
              {products.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا توجد منتجات
                </p>
              ) : (
                products.map((p, index) => {
                  const low = p.quantity <= p.minQuantity
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'rounded-lg border bg-card p-3',
                        !p.active && 'opacity-50'
                      )}
                    >
                      {/* رأس الكارت: تحديد + صورة + اسم + تصنيف */}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                          className="mt-1"
                        />
                        <ProductAvatar name={p.name} imagePath={p.imagePath} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium leading-tight">{p.name}</p>
                            {!p.active && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                معطل
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.category ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {p.category}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                بدون تصنيف
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{index + 1}
                            </span>
                          </div>
                        </div>
                        {/* إجراءات: نفس أزرار الجدول */}
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="تعديل المنتج"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="المزيد من الإجراءات"
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => printOneLabel(p)}>
                                <Printer className="size-4" />
                                طباعة ملصق باركود
                              </DropdownMenuItem>
                              {capabilities.includes('multi_unit') && (
                                <DropdownMenuItem
                                  onClick={() => setUnitsFor({ id: p.id, name: p.name, price: p.price })}
                                >
                                  <Package className="size-4" />
                                  وحدات الجملة
                                </DropdownMenuItem>
                              )}
                              {capabilities.includes('variants') && (
                                <DropdownMenuItem
                                  onClick={() => setVariantsFor({ id: p.id, name: p.name })}
                                >
                                  <Palette className="size-4" />
                                  الألوان والمقاسات
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => toggleActive(p)}>
                                <Power
                                  className={`size-4 ${p.active ? 'text-muted-foreground' : 'text-success-subtle-foreground'}`}
                                />
                                {p.active ? 'تعطيل المنتج' : 'تفعيل المنتج'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setConfirmId(p.id)}
                              >
                                <Trash2 className="size-4" />
                                حذف نهائي
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* الباركود (لو موجود) */}
                      {p.barcode && (
                        <div className="mt-2 flex justify-center rounded-md border bg-muted/30 py-1.5">
                          <Barcode value={p.barcode} height={24} fontSize={9} fitContainer />
                        </div>
                      )}

                      {/* شبكة البيانات: تكلفة/سعر/كمية/حد أدنى/مبيعات */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">التكلفة</p>
                          <p className="tabular-nums text-muted-foreground">
                            {formatCurrency(p.cost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">السعر</p>
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(p.price)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">المبيعات</p>
                          <p className="font-semibold tabular-nums text-info-subtle-foreground">
                            {p.soldQuantity ?? 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الكمية</p>
                          <p
                            className={cn(
                              'font-semibold tabular-nums',
                              low && 'text-destructive'
                            )}
                          >
                            {p.quantity}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الحد الأدنى</p>
                          <p className="tabular-nums text-muted-foreground">{p.minQuantity}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الحالة</p>
                          <p
                            className={cn(
                              'text-xs font-medium',
                              low ? 'text-destructive' : 'text-success'
                            )}
                          >
                            {low ? 'منخفض' : 'جيدة'}
                          </p>
                        </div>
                        {p.dynamicRetailPrice != null && (
                          <div className="col-span-3 border-t border-border/60 pt-2">
                            <p className="text-[10px] text-muted-foreground">سعر القطعة الفعلي (تلقائي)</p>
                            <p className="font-semibold tabular-nums text-primary">
                              {formatCurrency(p.dynamicRetailPrice)}
                              {p.retailMarginPercent != null && (
                                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                  ({p.retailMarginPercent}%)
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
        <div className="flex items-center justify-between px-1 py-2">
          <p className="text-sm text-muted-foreground">
            عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total} منتج
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const half = Math.floor(Math.min(5, totalPages) / 2)
              let start = Math.max(1, page - half)
              const end = Math.min(totalPages, start + Math.min(5, totalPages) - 1)
              start = Math.max(1, end - Math.min(5, totalPages) + 1)
              return start + i
            }).map((p) => (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="icon"
                className="size-8 text-xs"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
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
          message="المنتجات التي ليس لها بيانات مرتبطة ستُحذف نهائياً. المنتجات التي لها مبيعات أو مخزون ستُحذف محاسبياً مع الحفاظ على السجل المالي."
          onConfirm={async () => {
            setBulkConfirmOpen(false)
            const ids = Array.from(selectedIds)
            let deleted = 0
            let archived = 0
            const failed: string[] = []
            for (const id of ids) {
              try {
                await api(`/api/products/${id}`, { method: 'DELETE' })
                deleted++
              } catch (e: any) {
                const errorBody = e?.body ?? e
                const totalRefs = errorBody?.total_references
                if (totalRefs > 0) {
                  try {
                    await api(`/api/products/${id}?mode=archive`, { method: 'DELETE' })
                    archived++
                  } catch {
                    const name = products.find((p) => p.id === id)?.name ?? `#${id}`
                    failed.push(name)
                  }
                } else {
                  const name = products.find((p) => p.id === id)?.name ?? `#${id}`
                  failed.push(name)
                }
              }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-center">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onCancel}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              حذف
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
