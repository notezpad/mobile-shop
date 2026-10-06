'use client'

import * as React from 'react'
import {
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  ScanBarcode,
  Package,
  AlertTriangle,
  PackageX,
  FileSpreadsheet,
  MapPin,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { StockTab } from './inventory/StockTab'
import { MovementsTab } from './inventory/MovementsTab'
import { TransfersTab } from './inventory/TransfersTab'
import { StocktakeTab } from './inventory/StocktakeTab'
import { useDataRefresh } from '@/lib/offline/data-events'
import { StatTile, num } from './inventory/shared'

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

export function InventoryView() {
  const user = useShopStore((s) => s.user)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const isEmployee = user?.role === 'EMPLOYEE'
  const userBranchId = user?.branchId ?? null

  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<InventoryProduct[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState('stock')

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
      const productsArr = Array.isArray(ps) ? ps : (ps as any)?.data ?? []
      setBranches(bs); setProducts(productsArr); setMovements(mv); setTransfers(tf); setStocktakes(st)
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { load() }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh — a sale from POS, or an edit
  // from the Products page, changes stock shown here too.
  useDataRefresh(['inventory', 'products', 'branches'], load)

  // ----- Derived summary stats -----
  const stats = React.useMemo(() => {
    const totalItems = products.length
    const lowStock = products.filter(p => p.quantity <= p.minQuantity).length
    const outOfStock = products.filter(p => p.quantity <= 0).length
    const totalValueCost = products.reduce((s, p) => s + p.quantity * p.cost, 0)
    const totalValuePrice = products.reduce((s, p) => s + p.quantity * p.price, 0)
    const pendingTransfers = transfers.filter(t => t.status === 'pending').length
    const draftStocktakes = stocktakes.filter(s => s.status === 'draft').length
    return { totalItems, lowStock, outOfStock, totalValueCost, totalValuePrice, pendingTransfers, draftStocktakes }
  }, [products, transfers, stocktakes])

  const TYPE_LABELS: Record<string, string> = {
    in: 'وارد', out: 'صادر', adjust: 'تعديل يدوي', sale: 'بيع', return: 'مرتجع',
    transfer_in: 'تحويل وارد', transfer_out: 'تحويل صادر', stocktake: 'تسوية جرد',
  }
  const TRANSFER_STATUS_LABELS: Record<string, string> = { pending: 'معلّق', completed: 'مكتمل', cancelled: 'ملغي' }
  const STOCKTAKE_STATUS_LABELS: Record<string, string> = { draft: 'مسودة', committed: 'معتمد' }
  const branchName = (id: number | null) => (id ? branches.find((b) => b.id === id)?.name ?? '-' : 'كل الفروع')

  const exportExcel = () => {
    const shop = { name: shopName, phone: shopBranding.phone || undefined, address: shopBranding.address || undefined }
    if (tab === 'stock') {
      if (products.length === 0) return
      exportSimpleExcel({
        fileName: excelFileName('حالة-المخزون'),
        shop,
        documentTitle: 'حالة المخزون',
        sheetName: 'المخزون',
        columns: [
          { header: 'المنتج', key: 'name', format: 'text' },
          { header: 'الباركود', key: 'barcode', format: 'text' },
          { header: 'التصنيف', key: 'category', format: 'text' },
          { header: 'الفرع', key: 'branch', format: 'text' },
          { header: 'الكمية', key: 'quantity', format: 'int' },
          { header: 'الحد الأدنى', key: 'minQuantity', format: 'int' },
          { header: 'التكلفة', key: 'cost', format: 'currency' },
          { header: 'سعر البيع', key: 'price', format: 'currency' },
          { header: 'قيمة المخزون (تكلفة)', key: 'stockValue', format: 'currency' },
        ],
        rows: products.map((p) => ({
          name: p.name, barcode: p.barcode || '-', category: p.category || '-',
          branch: branchName(p.branchId), quantity: p.quantity, minQuantity: p.minQuantity,
          cost: p.cost, price: p.price, stockValue: p.quantity * p.cost,
        })),
        totals: { name: 'الإجمالي', quantity: products.reduce((s, p) => s + p.quantity, 0), stockValue: products.reduce((s, p) => s + p.quantity * p.cost, 0) },
      })
    } else if (tab === 'movements') {
      if (movements.length === 0) return
      exportSimpleExcel({
        fileName: excelFileName('حركات-المخزون'),
        shop,
        documentTitle: 'سجل حركات المخزون',
        sheetName: 'الحركات',
        columns: [
          { header: 'التاريخ', key: 'date', format: 'text' },
          { header: 'المنتج', key: 'product', format: 'text' },
          { header: 'النوع', key: 'type', format: 'text' },
          { header: 'الكمية', key: 'quantity', format: 'int' },
          { header: 'الفرع', key: 'branch', format: 'text' },
          { header: 'ملاحظة', key: 'note', format: 'text' },
          { header: 'بواسطة', key: 'user', format: 'text' },
        ],
        rows: movements.map((m) => ({
          date: new Date(m.createdAt).toLocaleString('ar-EG'),
          product: m.product.name, type: TYPE_LABELS[m.type] ?? m.type, quantity: m.quantity,
          branch: m.branch?.name || '-', note: m.note || '-', user: m.userName || '-',
        })),
      })
    } else if (tab === 'transfers') {
      if (transfers.length === 0) return
      exportSimpleExcel({
        fileName: excelFileName('تحويلات-المخزون'),
        shop,
        documentTitle: 'سجل التحويلات بين الفروع',
        sheetName: 'التحويلات',
        columns: [
          { header: 'التاريخ', key: 'date', format: 'text' },
          { header: 'من فرع', key: 'from', format: 'text' },
          { header: 'إلى فرع', key: 'to', format: 'text' },
          { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
          { header: 'إجمالي الكمية', key: 'totalQty', format: 'int' },
          { header: 'الحالة', key: 'status', format: 'text' },
          { header: 'بواسطة', key: 'user', format: 'text' },
        ],
        rows: transfers.map((t) => ({
          date: new Date(t.createdAt).toLocaleString('ar-EG'),
          from: t.fromBranch.name, to: t.toBranch.name, itemsCount: t.items.length,
          totalQty: t.items.reduce((s, i) => s + i.quantity, 0),
          status: TRANSFER_STATUS_LABELS[t.status] ?? t.status, user: t.createdByName || '-',
        })),
      })
    } else {
      if (stocktakes.length === 0) return
      exportSimpleExcel({
        fileName: excelFileName('عمليات-الجرد'),
        shop,
        documentTitle: 'سجل عمليات الجرد',
        sheetName: 'الجرد',
        columns: [
          { header: 'التاريخ', key: 'date', format: 'text' },
          { header: 'الفرع', key: 'branch', format: 'text' },
          { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
          { header: 'فروقات الكمية', key: 'diffTotal', format: 'int' },
          { header: 'الحالة', key: 'status', format: 'text' },
          { header: 'بواسطة', key: 'user', format: 'text' },
        ],
        rows: stocktakes.map((s) => ({
          date: new Date(s.createdAt).toLocaleString('ar-EG'),
          branch: s.branch?.name || 'كل الفروع', itemsCount: s.items.length,
          diffTotal: s.items.reduce((sum, i) => sum + i.diff, 0),
          status: STOCKTAKE_STATUS_LABELS[s.status] ?? s.status, user: s.createdByName || '-',
        })),
      })
    }
  }

  const noData = loading && products.length === 0
  const healthyCount = Math.max(0, stats.totalItems - stats.lowStock)
  const lowOnly = Math.max(0, stats.lowStock - stats.outOfStock)
  const expectedProfit = stats.totalValuePrice - stats.totalValueCost
  const pct = (n: number) => (stats.totalItems > 0 ? (n / stats.totalItems) * 100 : 0)

  const triggerCls =
    'flex-col gap-1 rounded-xl border-transparent py-2.5 text-xs font-semibold text-muted-foreground sm:flex-row sm:gap-2 sm:text-sm ' +
    'data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm ' +
    'dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground'

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ═════════ Hero ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" />
        <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 size-72 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative space-y-5 p-4 sm:space-y-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            {/* 📱 min-w-0 flex-1 — على الجوال الجزء ده بياخد صف كامل، والأزرار بتنزل تحته */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 sm:size-8 dark:text-emerald-400">
                  <Warehouse className="size-3.5 sm:size-4" />
                </span>
                قيمة المخزون بسعر التكلفة
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                {/* 📱 أرقام مقاومة للملايين — أصغر + truncate على الجوال */}
                <span className="min-w-0 truncate text-3xl font-extrabold tracking-tight tabular-nums text-foreground sm:text-4xl md:text-5xl">
                  {noData ? '—' : num(Math.round(stats.totalValueCost))}
                </span>
                <span className="text-base font-semibold text-muted-foreground sm:text-lg">جنيه</span>
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 shrink-0" />
                  قيمة البيع المتوقعة{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    {noData ? '—' : num(Math.round(stats.totalValuePrice))}
                  </span>
                </span>
                <span>
                  ربح متوقع{' '}
                  <span className="font-semibold tabular-nums text-success-subtle-foreground">
                    {noData ? '—' : num(Math.round(expectedProfit))}
                  </span>
                </span>
              </p>
            </div>

            {/* صحة المخزون — من md: بس */}
            <div className="hidden min-w-[260px] max-w-sm flex-1 md:block">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">صحة المخزون</p>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                {stats.totalItems > 0 && (
                  <>
                    <div
                      className="h-full bg-emerald-500 transition-all duration-slow ease-out"
                      style={{ width: `${pct(healthyCount)}%` }}
                    />
                    <div
                      className="h-full bg-amber-400 transition-all duration-slow ease-out"
                      style={{ width: `${pct(lowOnly)}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-slow ease-out"
                      style={{ width: `${pct(stats.outOfStock)}%` }}
                    />
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  سليم <b className="tabular-nums">{noData ? '—' : healthyCount}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-400" />
                  منخفض <b className="tabular-nums">{noData ? '—' : lowOnly}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-rose-500" />
                  نفد <b className="tabular-nums">{noData ? '—' : stats.outOfStock}</b>
                </span>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {isEmployee && userBranchId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                  <MapPin className="size-3.5" />
                  {branches.find((b) => b.id === userBranchId)?.name ?? '—'}
                </span>
              )}
              <Button variant="outline" onClick={exportExcel} className="w-full bg-background/60 backdrop-blur sm:w-auto">
                <FileSpreadsheet className="size-4" />
                تصدير Excel
              </Button>
            </div>
          </div>

          {/* إحصائيات سريعة — 📱 موبايل: كل كارت بعرض كامل، من sm+: 2×2، من lg: 4×1 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Package}
              label="إجمالي الأصناف"
              accent="#10b981"
              value={noData ? '—' : num(stats.totalItems)}
              unit="صنف"
              foot={<span className="text-muted-foreground">موزّعة على {num(branches.length)} فرع</span>}
            />
            <StatTile
              icon={AlertTriangle}
              label="قاربت على النفاذ"
              accent="#f59e0b"
              value={noData ? '—' : num(lowOnly)}
              unit="صنف"
              foot={<span className="text-muted-foreground">أقل من أو يساوي الحد الأدنى</span>}
            />
            <StatTile
              icon={PackageX}
              label="نفدت كميتها"
              accent="#f43f5e"
              value={noData ? '—' : num(stats.outOfStock)}
              unit="صنف"
              foot={
                stats.outOfStock > 0 ? (
                  <span className="font-semibold text-destructive-subtle-foreground">يحتاج توريد</span>
                ) : (
                  <span className="text-muted-foreground">مفيش أصناف خلصت</span>
                )
              }
            />
            <StatTile
              icon={Clock}
              label="في انتظار إجراء"
              accent="#0ea5e9"
              value={noData ? '—' : num(stats.pendingTransfers + stats.draftStocktakes)}
              unit="عملية"
              foot={
                <span className="text-muted-foreground">
                  {num(stats.pendingTransfers)} تحويل معلّق · {num(stats.draftStocktakes)} جرد مسودة
                </span>
              }
            />
          </div>
        </div>
      </section>

      {/* ═════════ Tabs ═════════ */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="animate-in-up stagger-1 grid h-auto w-full grid-cols-4 gap-1 rounded-2xl border bg-card p-1.5 shadow-xs">
          <TabsTrigger value="stock" className={triggerCls}>
            <Warehouse />
            المخزون
          </TabsTrigger>
          <TabsTrigger value="movements" className={triggerCls}>
            <ClipboardList />
            الحركات
          </TabsTrigger>
          <TabsTrigger value="transfers" className={triggerCls}>
            <ArrowLeftRight />
            التحويلات
            <TabBadge n={stats.pendingTransfers} />
          </TabsTrigger>
          <TabsTrigger value="stocktake" className={triggerCls}>
            <ScanBarcode />
            الجرد
            <TabBadge n={stats.draftStocktakes} />
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {/*
              🛡️ 2026-09-14: `forceMount` on every TabsContent so the components
              stay mounted (and keep their local state) when switching tabs.
              Inactive tabs are hidden via CSS (see `data-[state=inactive]:hidden`
              in src/components/ui/tabs.tsx) — drafts of stocktake/transfers survive.
            */}
            <TabsContent value="stock" forceMount className="space-y-0">
              <StockTab
                products={products}
                branches={branches}
                isEmployee={isEmployee}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
            <TabsContent value="movements" forceMount className="space-y-0">
              <MovementsTab
                movements={movements}
                branches={branches}
                isEmployee={isEmployee}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
            <TabsContent value="transfers" forceMount className="space-y-0">
              <TransfersTab
                transfers={transfers}
                branches={branches}
                products={products}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
            <TabsContent value="stocktake" forceMount className="space-y-0">
              <StocktakeTab
                stocktakes={stocktakes}
                branches={branches}
                products={products}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}

/* ---------------- Helpers ---------------- */

function TabBadge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span className="rounded-full bg-warning px-1.5 text-[10px] font-bold leading-4 text-warning-foreground tabular-nums">
      {n}
    </span>
  )
}

async function apiSafe<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return fallback
    const data = await res.json()
    // 🛡️ v16: الحمولة المفروض مصفوفة — أي رد غلط بنرجّع الفول باك (زي useInventoryData)
    if (Array.isArray(fallback) && !Array.isArray(data)) return fallback
    return data as T
  } catch {
    return fallback
  }
}