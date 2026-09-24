'use client'

import * as React from 'react'
import {
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  ScanBarcode,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Loader2,
  Search,
  FileSpreadsheet,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { StockTab } from './inventory/StockTab'
import { MovementsTab } from './inventory/MovementsTab'
import { TransfersTab } from './inventory/TransfersTab'
import { StocktakeTab } from './inventory/StocktakeTab'

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Warehouse className="size-5" />
            </span>
            إدارة المخزون
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تتبّع الكميات، الحركات الواردة والصادرة، التحويلات بين الفروع، والجرد بالباركود.
          </p>
        </div>
        {isEmployee && userBranchId && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <span className="font-medium text-primary">صلاحية الفرع:</span>{' '}
            {branches.find(b => b.id === userBranchId)?.name ?? '—'}
          </div>
        )}
        <Button variant="outline" onClick={exportExcel}>
          <FileSpreadsheet className="size-4" />
          تصدير Excel
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard
          icon={<Package className="size-4" />}
          label="إجمالي الأصناف"
          value={String(stats.totalItems)}
          tone="default"
          loading={loading}
        />
        <StatCard
          icon={<AlertTriangle className="size-4" />}
          label="قاربت على النفاذ"
          value={String(stats.lowStock)}
          tone="warn"
          loading={loading}
        />
        <StatCard
          icon={<TrendingDown className="size-4" />}
          label="نفدت كميتها"
          value={String(stats.outOfStock)}
          tone="danger"
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="قيمة المخزون (تكلفة)"
          value={formatEGP(stats.totalValueCost)}
          tone="default"
          loading={loading}
        />
        <StatCard
          icon={<ArrowLeftRight className="size-4" />}
          label="تحويلات معلّقة"
          value={String(stats.pendingTransfers)}
          tone={stats.pendingTransfers > 0 ? 'warn' : 'default'}
          loading={loading}
        />
        <StatCard
          icon={<ClipboardList className="size-4" />}
          label="جرد مسودة"
          value={String(stats.draftStocktakes)}
          tone={stats.draftStocktakes > 0 ? 'warn' : 'default'}
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="stock" className="py-2">
            <Warehouse className="ml-1.5 size-4" />
            المخزون
          </TabsTrigger>
          <TabsTrigger value="movements" className="py-2">
            <ClipboardList className="ml-1.5 size-4" />
            الحركات
          </TabsTrigger>
          <TabsTrigger value="transfers" className="py-2">
            <ArrowLeftRight className="ml-1.5 size-4" />
            التحويلات
          </TabsTrigger>
          <TabsTrigger value="stocktake" className="py-2">
            <ScanBarcode className="ml-1.5 size-4" />
            الجرد
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/*
              🛡️ 2026-09-14: `forceMount` on every TabsContent so the components
              stay mounted (and keep their local state) when switching tabs.

              Previously, switching to another tab unmounted the active one,
              which wiped any in-progress draft (e.g. stocktake items you'd
              scanned in, transfer items you'd added). With forceMount, the
              inactive tabs are kept in the DOM and hidden via CSS (see the
              `data-[state=inactive]:hidden` rule in src/components/ui/tabs.tsx).
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

function formatEGP(n: number): string {
  return `${n.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} `
}

function StatCard({
  icon,
  label,
  value,
  tone = 'default',
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: 'default' | 'warn' | 'danger'
  loading?: boolean
}) {
  const toneClasses =
    tone === 'warn'
      ? 'border-warning-subtle bg-warning-subtle text-warning-subtle-foreground'
      : tone === 'danger'
      ? 'border-destructive-subtle bg-destructive-subtle text-destructive-subtle-foreground'
      : 'border-border bg-card text-foreground'
  const iconBg =
    tone === 'warn'
      ? 'bg-warning-subtle text-warning-subtle-foreground'
      : tone === 'danger'
      ? 'bg-destructive-subtle text-destructive-subtle-foreground'
      : 'bg-primary/10 text-primary'
  return (
    <Card className={toneClasses}>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <div className="truncate text-base font-bold">{value}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
