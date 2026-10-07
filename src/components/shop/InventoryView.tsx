'use client'

import * as React from 'react'
import {
  Warehouse,
  ArrowUpDown,
  Truck,
  ScanLine,
  Package,
  AlertTriangle,
  PackageX,
  FileSpreadsheet,
  MapPin,
  Hourglass,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { StockTab } from './inventory/StockTab'
import { MovementsTab, type MovementMeta } from './inventory/MovementsTab'
import { TransfersTab } from './inventory/TransfersTab'
import { StocktakeTab } from './inventory/StocktakeTab'
import { useDataRefresh } from '@/lib/offline/data-events'
import { cn } from '@/lib/utils'
import { ACCENT, InventoryStyles, num } from './inventory/shared'

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
  // ⚡ v10: إجماليات/منحنى الحركات محسوبة في SQL من السيرفر (الرد دلوقتي 50 صف/صفحة)
  const [movementMeta, setMovementMeta] = React.useState<MovementMeta | null>(null)
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState('stock')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [bs, ps, mv, tf, st] = await Promise.all([
        apiSafe<Branch[]>('/api/branches', []),
        // ⚡ v10: meta=slim — شاشة المخزون مش محتاجة soldQuantity/التسعير الديناميكي
        // (بيرجّع استعلام groupBy كامل على عناصر الفواتير) — والاستدعاء دلوقتي
        // متخزّن على الحافة 20 ثانية بدل ما كان بيتنفذ كامل في كل زيارة.
        apiSafe<{ data: InventoryProduct[] } | InventoryProduct[]>('/api/products?limit=1000&status=all&meta=slim', []),
        // ⚡ v10: 50 حركة/صفحة من السيرفر + إجماليات SQL — بدل 1000 صف كاملين
        apiSafe<{ data: Movement[]; total?: number; inTotal?: number; outTotal?: number; series?: MovementMeta['series'] } | Movement[]>('/api/inventory/movements?limit=50', []),
        apiSafe<Transfer[]>('/api/inventory/transfers', []),
        apiSafe<Stocktake[]>('/api/inventory/stocktake', []),
      ])
      const productsArr = Array.isArray(ps) ? ps : (ps as any)?.data ?? []
      setBranches(bs); setProducts(productsArr); setTransfers(tf); setStocktakes(st)
      if (Array.isArray(mv)) {
        setMovements(mv); setMovementMeta(null)
      } else {
        setMovements((mv as any)?.data ?? [])
        setMovementMeta({
          total: (mv as any)?.total ?? (mv as any)?.data?.length ?? 0,
          inTotal: (mv as any)?.inTotal ?? 0,
          outTotal: (mv as any)?.outTotal ?? 0,
          series: (mv as any)?.series ?? [],
        })
      }
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

  const exportExcel = async () => {
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
      // ⚡ v10: التصدير بيجيب القائمة الكاملة (حتى 1000) في طلب مستقل وقت
      // الضغط — مش اللي محمّل في الصفحة (50 صف) ولا طلب ثقيل مع كل فتح.
      if (movements.length === 0) return
      let rows = movements
      if ((movementMeta?.total ?? 0) > movements.length) {
        const all = await apiSafe<{ data: Movement[] } | Movement[]>('/api/inventory/movements?limit=1000', [])
        rows = Array.isArray(all) ? all : (all as any)?.data ?? movements
      }
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
        rows: rows.map((m) => ({
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
  const pending = stats.pendingTransfers + stats.draftStocktakes

  // رفوف المستودع: ٤٠ خلية تمثّل نسب الأصناف (سليم / منخفض / نفد)
  const shelf = React.useMemo(() => {
    const CELLS = 40
    const total = stats.totalItems
    if (total === 0) return Array.from({ length: CELLS }, () => 'empty' as const)
    let out = stats.outOfStock ? Math.max(1, Math.round((stats.outOfStock / total) * CELLS)) : 0
    let low = lowOnly ? Math.max(1, Math.round((lowOnly / total) * CELLS)) : 0
    let ok = CELLS - out - low
    if (ok < 0) { low += ok; ok = 0; if (low < 0) { out += low; low = 0 } }
    return [
      ...Array.from({ length: ok }, () => 'ok' as const),
      ...Array.from({ length: low }, () => 'low' as const),
      ...Array.from({ length: out }, () => 'out' as const),
    ]
  }, [stats.totalItems, stats.outOfStock, lowOnly])

  const CELL_STYLE = {
    ok: 'bg-emerald-500 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]',
    low: 'bg-amber-400 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]',
    out: 'bg-rose-500 shadow-[inset_0_-3px_0_rgba(0,0,0,0.16)]',
    empty: 'bg-muted',
  } as const

  const tabs = [
    { value: 'stock', label: 'المخزون', icon: Warehouse, color: ACCENT.stock, sub: `${num(stats.totalItems)} صنف`, alert: false },
    { value: 'movements', label: 'الحركات', icon: ArrowUpDown, color: ACCENT.movements, sub: `${num(movementMeta?.total ?? movements.length)} حركة`, alert: false },
    {
      value: 'transfers', label: 'التحويلات', icon: Truck, color: ACCENT.transfers,
      sub: stats.pendingTransfers > 0 ? `${num(stats.pendingTransfers)} معلّق` : `${num(transfers.length)} تحويل`,
      alert: stats.pendingTransfers > 0,
    },
    {
      value: 'stocktake', label: 'الجرد', icon: ScanLine, color: ACCENT.stocktake,
      sub: stats.draftStocktakes > 0 ? `${num(stats.draftStocktakes)} مسودة` : `${num(stocktakes.length)} عملية`,
      alert: stats.draftStocktakes > 0,
    },
  ]

  const strip = [
    { icon: Package, color: '#10b981', label: 'إجمالي الأصناف', value: stats.totalItems, hint: `في ${num(branches.length)} فرع` },
    { icon: AlertTriangle, color: '#f59e0b', label: 'قاربت على النفاذ', value: lowOnly, hint: 'عند الحد الأدنى أو أقل' },
    { icon: PackageX, color: '#f43f5e', label: 'نفدت كميتها', value: stats.outOfStock, hint: stats.outOfStock > 0 ? 'محتاجة توريد' : 'كله متوفر' },
    { icon: Hourglass, color: '#8b5cf6', label: 'بانتظار إجراء', value: pending, hint: `${num(stats.pendingTransfers)} تحويل · ${num(stats.draftStocktakes)} جرد` },
  ]

  return (
    <div className="space-y-5">
      <InventoryStyles />

      {/* ═════════ لوحة المستودع ═════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border bg-card">
        {/* أرضية شبكية باهتة */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(128,128,128,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.10) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 90% at 85% 0%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 90% at 85% 0%, black 0%, transparent 75%)',
          }}
        />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                <Warehouse className="size-[18px]" />
              </span>
              <h1 className="text-lg font-extrabold tracking-tight">المخزون</h1>
              {isEmployee && userBranchId && (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <MapPin className="size-3" />
                  {branches.find((b) => b.id === userBranchId)?.name ?? '—'}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={exportExcel} className="ms-auto lg:ms-2">
                <FileSpreadsheet className="size-4" />
                تصدير Excel
              </Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">قيمة البضاعة بسعر التكلفة</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-5xl font-black tracking-tight tabular-nums sm:text-6xl">
                  {noData ? '—' : num(Math.round(stats.totalValueCost))}
                </span>
                <span className="text-lg font-bold text-muted-foreground">جنيه</span>
              </div>
            </div>

            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-[11px] text-muted-foreground">لو اتباعت كلها</dt>
                <dd className="font-bold tabular-nums">{noData ? '—' : num(Math.round(stats.totalValuePrice))} جنيه</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">الربح المتوقع</dt>
                <dd className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {noData ? '—' : `+${num(Math.round(expectedProfit))}`} جنيه
                </dd>
              </div>
            </dl>
          </div>

          {/* الأرفف */}
          <div className="w-full max-w-[22rem] lg:w-[22rem]">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span>رفوف المستودع</span>
              <span className="tabular-nums">{num(stats.totalItems)} صنف</span>
            </div>
            <div className="grid grid-cols-8 gap-1.5 rounded-2xl border bg-background/70 p-2.5" dir="ltr">
              {shelf.map((k, i) => (
                <span
                  key={i}
                  className={cn('inv-cell aspect-square rounded-[6px]', CELL_STYLE[k])}
                  style={{ animationDelay: `${i * 14}ms` }}
                />
              ))}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-emerald-500" />سليم <b className="tabular-nums">{noData ? '—' : num(healthyCount)}</b></span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-amber-400" />منخفض <b className="tabular-nums">{noData ? '—' : num(lowOnly)}</b></span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-rose-500" />نفد <b className="tabular-nums">{noData ? '—' : num(stats.outOfStock)}</b></span>
            </div>
          </div>
        </div>

        {/* شريط الأرقام */}
        <div className="relative grid grid-cols-2 border-t bg-muted/30 lg:grid-cols-4">
          {strip.map((it, i) => (
            <div
              key={it.label}
              className={cn(
                'flex items-center gap-3 p-4',
                i % 2 === 1 && 'border-s',
                i >= 2 && 'border-t lg:border-t-0',
                i >= 1 && 'lg:border-s',
              )}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${it.color}1f`, color: it.color }}
              >
                <it.icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-muted-foreground">{it.label}</p>
                <p className="text-xl font-extrabold leading-tight tabular-nums">{noData ? '—' : num(it.value)}</p>
                <p className="truncate text-[10px] text-muted-foreground">{it.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════ Tabs ═════════ */}
      <Tabs dir="rtl" value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2.5 rounded-none bg-transparent p-0 lg:grid-cols-4">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              style={{ ['--tab' as string]: t.color }}
              className={cn(
                'group relative h-auto flex-row justify-start gap-3 overflow-hidden rounded-2xl border bg-card px-3.5 py-3 text-start shadow-xs',
                'transition-all hover:-translate-y-0.5 hover:shadow-md',
                'data-[state=active]:border-[color:var(--tab)] data-[state=active]:bg-[color-mix(in_oklab,var(--tab)_9%,var(--card))] data-[state=active]:shadow-md',
                'dark:data-[state=active]:border-[color:var(--tab)] dark:data-[state=active]:bg-[color-mix(in_oklab,var(--tab)_14%,var(--card))]',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--tab)_14%,transparent)] text-[color:var(--tab)] transition-colors group-data-[state=active]:bg-[color:var(--tab)] group-data-[state=active]:text-white">
                <t.icon className="!size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold leading-tight text-foreground">{t.label}</span>
                <span
                  className={cn(
                    'mt-0.5 flex items-center gap-1.5 text-[11px] font-medium',
                    t.alert ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
                  {t.alert && <span className="inv-blink size-1.5 rounded-full bg-amber-500" />}
                  {t.sub}
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-[3px] origin-center scale-x-0 bg-[color:var(--tab)] transition-transform duration-base group-data-[state=active]:scale-x-100" />
            </TabsTrigger>
          ))}
        </TabsList>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-3xl" />
            <Skeleton className="h-64 w-full rounded-3xl" />
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
                meta={movementMeta}
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
