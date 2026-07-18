'use client'

import * as React from 'react'
import {
  Wallet,
  TrendingUp,
  Banknote,
  AlertTriangle,
  Loader2,
  PackageX,
  Activity,
  ShoppingBag,
  Users,
  Wrench,
  Trophy,
  AlertCircle,
  Boxes,
  Truck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'

interface DashboardData {
  todaySales: number
  todayProfit: number
  todaySalesCount: number
  cashBalance: number
  lowStockCount: number
  monthSales: number
  monthProfit: number
  customersCount: number
  activeMaintenance: number
  stockValueCost: number
  stockValuePrice: number
  totalOutstandingDebt: number
  totalSupplierDebt: number
  last7DaysSales: { date: string; total: number; profit: number }[]
  topProducts: { name: string; quantity: number; total: number }[]
  last10Sales: Array<{
    id: number
    invoiceNo: string | null
    createdAt: string
    total: number
    paid: number
    status: string
    customerName: string | null
  }>
  lowStockProducts: {
    id: number
    name: string
    quantity: number
    minQuantity: number
  }[]
  activeMaintenanceOrders: {
    id: number
    customerName: string
    device: string
    status: string
    receivedAt: string
  }[]
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning'
  loading?: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            tone === 'success' && 'bg-primary/10 text-primary',
            tone === 'warning' && 'bg-destructive/10 text-destructive',
            tone === 'default' && 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-28" />
          ) : (
            <p className="truncate text-xl font-bold tabular-nums">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function maintenanceStatusVariant(s: string): string {
  switch (s) {
    case 'مستلم':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'قيد العمل':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'مكتمل':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'مُسلَّم':
      return 'bg-primary/15 text-primary border-primary/20'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function rankBadge(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-amber-100 text-amber-700 border-amber-200'
    case 2:
      return 'bg-slate-200 text-slate-700 border-slate-300'
    case 3:
      return 'bg-orange-100 text-orange-700 border-orange-200'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function DashboardView() {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const user = useShopStore((s) => s.user)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<DashboardData>('/api/dashboard')
      setData(d)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            مرحباً، {user?.name ?? 'مستخدم'}! 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            لوحة المعلومات — نظرة سريعة على أداء المحل اليوم
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Activity className="size-4" />
          )}
          تحديث
        </Button>
      </div>

      {/* Row 1: 4 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Banknote}
          label="مبيعات اليوم"
          value={formatCurrency(data?.todaySales ?? 0)}
          tone="success"
          loading={loading}
        />
        <StatCard
          icon={TrendingUp}
          label="ربح اليوم"
          value={formatCurrency(data?.todayProfit ?? 0)}
          tone="success"
          loading={loading}
        />
        <StatCard
          icon={Wallet}
          label="رصيد الخزنة"
          value={formatCurrency(data?.cashBalance ?? 0)}
          loading={loading}
        />
        <StatCard
          icon={AlertTriangle}
          label="تنبيهات مخزون"
          value={String(data?.lowStockCount ?? 0)}
          tone="warning"
          loading={loading}
        />
      </div>

      {/* Row 2: 4 more stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ShoppingBag}
          label="مبيعات الشهر"
          value={formatCurrency(data?.monthSales ?? 0)}
          tone="success"
          loading={loading}
        />
        <StatCard
          icon={TrendingUp}
          label="ربح الشهر"
          value={formatCurrency(data?.monthProfit ?? 0)}
          tone="success"
          loading={loading}
        />
        <StatCard
          icon={Users}
          label="العملاء"
          value={String(data?.customersCount ?? 0)}
          loading={loading}
        />
        <StatCard
          icon={Wrench}
          label="صيانة نشطة"
          value={String(data?.activeMaintenance ?? 0)}
          loading={loading}
        />
      </div>

      {/* Bar chart + Top products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" />
              مبيعات آخر 7 أيام
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.last7DaysSales ?? []}
                    margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} />
                    <Tooltip
                      cursor={{ fill: 'oklch(0.55 0.18 142 / 0.08)' }}
                      formatter={(v: any) => [formatCurrency(Number(v)), 'المبيعات']}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid oklch(0.9 0.005 95)',
                        fontFamily: 'inherit',
                      }}
                    />
                    <Bar dataKey="total" fill="oklch(0.55 0.18 142)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-amber-500" />
              أكثر المنتجات مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : data?.topProducts?.length ? (
              <ol className="space-y-2">
                {data.topProducts.map((p, i) => (
                  <li
                    key={p.name + i}
                    className="flex items-center gap-3 rounded-md border p-2"
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold border',
                        rankBadge(i + 1)
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {p.quantity} قطعة — {formatCurrency(p.total)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد مبيعات خلال آخر 30 يوماً
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low stock + Active maintenance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="size-4 text-destructive" />
              مخزون منخفض
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : data?.lowStockProducts?.length ? (
              <ul className="space-y-1.5">
                {data.lowStockProducts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-md bg-destructive/5 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="font-mono text-xs text-destructive tabular-nums">
                      {p.quantity} / {p.minQuantity}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد تنبيهات ✅
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4 text-primary" />
              صيانة نشطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : data?.activeMaintenanceOrders?.length ? (
              <ul className="space-y-1.5">
                {data.activeMaintenanceOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        #{o.id} {o.customerName} — {o.device}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(o.receivedAt)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={maintenanceStatusVariant(o.status)}
                    >
                      {o.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد أوامر صيانة نشطة
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock value summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Boxes}
          label="قيمة المخزون (تكلفة)"
          value={formatCurrency(data?.stockValueCost ?? 0)}
          loading={loading}
        />
        <StatCard
          icon={Boxes}
          label="قيمة المخزون (بيع)"
          value={formatCurrency(data?.stockValuePrice ?? 0)}
          loading={loading}
        />
        <StatCard
          icon={ShoppingBag}
          label="عدد فواتير اليوم"
          value={String(data?.todaySalesCount ?? 0)}
          loading={loading}
        />
        <StatCard
          icon={AlertTriangle}
          label="إجمالي ديون العملاء"
          value={formatCurrency(data?.totalOutstandingDebt ?? 0)}
          tone="warning"
          loading={loading}
        />
        <StatCard
          icon={Truck}
          label="إجمالي المستحق للموردين"
          value={formatCurrency(data?.totalSupplierDebt ?? 0)}
          tone="warning"
          loading={loading}
        />
      </div>

      {/* Last 10 sales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر 10 مبيعات</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead className="w-28">الفاتورة</TableHead>
                  <TableHead className="w-36">الوقت</TableHead>
                  <TableHead className="w-32 text-center">الإجمالي</TableHead>
                  <TableHead className="w-28 text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {data?.last10Sales?.length ? (
                    data.last10Sales.map((s, index) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.invoiceNo ?? `#${s.id}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDate(s.createdAt)}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {formatCurrency(s.total)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              s.status === 'مرتجعة' ? 'destructive' : 'secondary'
                            }
                            className={
                              s.status === 'مكتملة'
                                ? 'bg-primary/10 text-primary'
                                : ''
                            }
                          >
                            {s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد مبيعات بعد
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
