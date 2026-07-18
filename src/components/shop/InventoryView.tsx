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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useShopStore } from '@/lib/store'
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
        apiSafe<InventoryProduct[]>('/api/products', []),
        apiSafe<Movement[]>('/api/inventory/movements', []),
        apiSafe<Transfer[]>('/api/inventory/transfers', []),
        apiSafe<Stocktake[]>('/api/inventory/stocktake', []),
      ])
      setBranches(bs); setProducts(ps); setMovements(mv); setTransfers(tf); setStocktakes(st)
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
            <TabsContent value="stock" className="space-y-0">
              <StockTab
                products={products}
                branches={branches}
                isEmployee={isEmployee}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
            <TabsContent value="movements" className="space-y-0">
              <MovementsTab
                movements={movements}
                branches={branches}
                isEmployee={isEmployee}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
            <TabsContent value="transfers" className="space-y-0">
              <TransfersTab
                transfers={transfers}
                branches={branches}
                products={products}
                userBranchId={userBranchId}
                onChanged={load}
              />
            </TabsContent>
            <TabsContent value="stocktake" className="space-y-0">
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
  return `${n.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج.م`
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
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'danger'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-border bg-card text-foreground'
  const iconBg =
    tone === 'warn'
      ? 'bg-amber-100 text-amber-700'
      : tone === 'danger'
      ? 'bg-rose-100 text-rose-700'
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
