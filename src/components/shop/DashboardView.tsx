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
  BarChart as RechartsBarChart,
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
import { Badge, StatusDot } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { KpiCard } from '@/components/bento/kpi-card'
import { BentoGrid, BentoCell } from '@/components/bento/bento-grid'
import { Sparkline } from '@/components/charts/sparkline'
import { DonutChart } from '@/components/charts/donut-chart'

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

/* maintenanceStatusVariant — maps Arabic maintenance status strings to
 * badge variants. These strings come from the database (receivedAt, status)
 * and are user-facing, so they stay in Arabic. */
function maintenanceStatusVariant(s: string): { variant: 'info' | 'warning' | 'default' | 'success' | 'outline' } {
  switch (s) {
    case 'مستلم':
      return { variant: 'info' }
    case 'قيد العمل':
      return { variant: 'warning' }
    case 'مكتمل':
      return { variant: 'default' }
    case 'مُسلَّم':
      return { variant: 'success' }
    default:
      return { variant: 'outline' }
  }
}

/* rankBadgeStyle — gold/silver/bronze for top-3 products.
 * Returns inline classes since these are one-off colors not in the token system. */
function rankBadgeStyle(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-accent2-100 text-accent2-600 border-accent2-200'
    case 2:
      return 'bg-muted text-muted-foreground border-border'
    case 3:
      return 'bg-accent2-50 text-accent2-500 border-accent2-100'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function DashboardView() {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [chartDays, setChartDays] = React.useState<7 | 14 | 30>(7)
  const user = useShopStore((s) => s.user)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasMaintenance = enabledModules.includes('maintenance')

  const load = React.useCallback(async (days = chartDays) => {
    setLoading(true)
    try {
      const d = await api<DashboardData>(`/api/dashboard?days=${days}`)
      setData(d)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartDays])

  React.useEffect(() => {
    load()

    // Auto-refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000)

    // Refresh when user returns to tab
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Build sparkline data from last7DaysSales — fallback to flat array if loading
  const salesSparkData = data?.last7DaysSales?.map((d) => d.total) ?? []
  const profitSparkData = data?.last7DaysSales?.map((d) => d.profit) ?? []

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            مرحباً، {user?.name ?? 'مستخدم'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            لوحة المعلومات — نظرة سريعة على أداء المحل اليوم
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Activity className="size-4" />
          )}
          تحديث
        </Button>
      </div>

      {/* === Row 1: 4 primary KPI cards (Bento style with sparklines) ===
          These are the most-watched metrics — they get sparklines to show
          7-day trend at a glance. Layout: 1 col on mobile, 2 on tablet, 4 on desktop. */}
      <BentoGrid cols={4}>
        <BentoCell className="animate-in-up stagger-1">
          <KpiCard
            title="مبيعات اليوم"
            value={loading ? '...' : formatCurrency(data?.todaySales ?? 0)}
            delta={{ value: 'اليوم', direction: 'up', label: `${data?.todaySalesCount ?? 0} فاتورة` }}
            icon={<Banknote />}
            variant="primary"
            sparkline={salesSparkData.length > 0 ? <Sparkline data={salesSparkData} /> : undefined}
          />
        </BentoCell>
        <BentoCell className="animate-in-up stagger-2">
          <KpiCard
            title="ربح اليوم"
            value={loading ? '...' : formatCurrency(data?.todayProfit ?? 0)}
            delta={{ value: 'صافي', direction: 'up' }}
            icon={<TrendingUp />}
            variant="success"
            sparkline={profitSparkData.length > 0 ? <Sparkline data={profitSparkData} color="var(--success)" /> : undefined}
          />
        </BentoCell>
        <BentoCell className="animate-in-up stagger-3">
          <KpiCard
            title="رصيد الخزنة"
            value={loading ? '...' : formatCurrency(data?.cashBalance ?? 0)}
            icon={<Wallet />}
            variant="default"
          />
        </BentoCell>
        <BentoCell className="animate-in-up stagger-4">
          <KpiCard
            title="تنبيهات مخزون"
            value={loading ? '...' : String(data?.lowStockCount ?? 0)}
            icon={<AlertTriangle />}
            variant="warning"
          />
        </BentoCell>
      </BentoGrid>

      {/* === Row 2: secondary KPIs (smaller, no sparklines) ===
          Monthly aggregates + customer/maintenance counts. */}
      <BentoGrid cols={hasMaintenance ? 4 : 3}>
        <BentoCell>
          <KpiCard
            title="مبيعات الشهر"
            value={loading ? '...' : formatCurrency(data?.monthSales ?? 0)}
            icon={<ShoppingBag />}
            variant="default"
          />
        </BentoCell>
        <BentoCell>
          <KpiCard
            title="ربح الشهر"
            value={loading ? '...' : formatCurrency(data?.monthProfit ?? 0)}
            icon={<TrendingUp />}
            variant="success"
          />
        </BentoCell>
        <BentoCell>
          <KpiCard
            title="العملاء"
            value={loading ? '...' : String(data?.customersCount ?? 0)}
            icon={<Users />}
            variant="info"
          />
        </BentoCell>
        {hasMaintenance && (
          <BentoCell>
            <KpiCard
              title="صيانة نشطة"
              value={loading ? '...' : String(data?.activeMaintenance ?? 0)}
              icon={<Wrench />}
              variant="info"
            />
          </BentoCell>
        )}
      </BentoGrid>

      {/* === Row 3: Bento layout — chart (2 cols) + top products (1 col, 2 rows) ===
          The chart shows 7-day sales trend; top products sits beside it
          spanning the same height for visual balance. */}
      <BentoGrid cols={3}>
        <BentoCell colSpan={2} className="animate-in-up stagger-2">
          <Card variant="bento" className="h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" />
                مبيعات آخر {chartDays} أيام
              </CardTitle>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setChartDays(d)
                      load(d)
                    }}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      chartDays === d
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d}ي
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={data?.last7DaysSales ?? []}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} />
                      <Tooltip
                        cursor={{ fill: 'oklch(0.57 0.18 162 / 0.08)' }}
                        formatter={(v: any) => [formatCurrency(Number(v)), 'المبيعات']}
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--popover)',
                          color: 'var(--popover-foreground)',
                          fontFamily: 'inherit',
                        }}
                      />
                      <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </BentoCell>

        <BentoCell rowSpan={2} className="animate-in-up stagger-3">
          <Card variant="bento" className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="size-4 text-accent2-500" />
                أكثر المنتجات مبيعاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : data?.topProducts?.length ? (
                <ol className="space-y-2">
                  {data.topProducts.map((p, i) => (
                    <li
                      key={p.name + i}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card-muted/40 p-2.5 transition-colors hover:bg-muted"
                    >
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold border tabular-nums',
                          rankBadgeStyle(i + 1)
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
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <span className="text-3xl">🛍️</span>
                  <p className="text-sm font-medium text-muted-foreground">لا توجد مبيعات خلال آخر 30 يوماً</p>
                  <a href="/pos" className="text-xs text-primary hover:underline">ابدأ البيع من نقطة البيع</a>
                </div>
              )}
            </CardContent>
          </Card>
        </BentoCell>

        {/* === Row 4: Low stock + Active maintenance (2 cells side by side) === */}
        <BentoCell className="animate-in-up stagger-4">
          <Card variant="bento" className="h-full border-destructive/20">
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
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : data?.lowStockProducts?.length ? (
                <ul className="space-y-1.5">
                  {data.lowStockProducts.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2.5 rounded-lg bg-destructive-subtle/40 px-3 py-2 text-sm"
                    >
                      <StatusDot status="danger" pulse />
                      <span className="font-medium flex-1 truncate">{p.name}</span>
                      <span className="font-mono text-xs text-destructive-subtle-foreground tabular-nums shrink-0">
                        {p.quantity} / {p.minQuantity}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <span className="text-3xl">✅</span>
                  <p className="text-sm font-medium text-muted-foreground">المخزون في مستوى جيد</p>
                  <p className="text-xs text-muted-foreground/70">لا توجد منتجات تحت الحد الأدنى</p>
                </div>
              )}
            </CardContent>
          </Card>
        </BentoCell>

        {hasMaintenance && (
          <BentoCell className="animate-in-up stagger-5">
            <Card variant="bento" className="h-full">
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
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : data?.activeMaintenanceOrders?.length ? (
                  <ul className="space-y-1.5">
                    {data.activeMaintenanceOrders.map((o) => {
                      const statusVariant = maintenanceStatusVariant(o.status)
                      return (
                        <li
                          key={o.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card-muted/40 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              #{o.id} {o.customerName} — {o.device}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <DateTimeCell date={o.receivedAt} />
                            </p>
                          </div>
                          <Badge variant={statusVariant.variant} size="sm">
                            {o.status}
                          </Badge>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <span className="text-3xl">🔧</span>
                    <p className="text-sm font-medium text-muted-foreground">لا توجد أوامر صيانة نشطة</p>
                    <a href="/maintenance" className="text-xs text-primary hover:underline">إضافة أمر صيانة جديد</a>
                  </div>
                )}
              </CardContent>
            </Card>
          </BentoCell>
        )}
      </BentoGrid>

      {/* === Row 5: Stock value summary (5 small KPIs) ===
          Financial overview: stock value at cost vs. price, daily invoice count,
          customer debt, supplier debt. These are secondary metrics so they get
          plain StatCards (no sparklines). */}
      <BentoGrid cols={4}>
        <BentoCell>
          <KpiCard
            title="قيمة المخزون (تكلفة)"
            value={loading ? '...' : formatCurrency(data?.stockValueCost ?? 0)}
            icon={<Boxes />}
            variant="default"
          />
        </BentoCell>
        <BentoCell>
          <KpiCard
            title="قيمة المخزون (بيع)"
            value={loading ? '...' : formatCurrency(data?.stockValuePrice ?? 0)}
            icon={<Boxes />}
            variant="primary"
          />
        </BentoCell>
        <BentoCell>
          <KpiCard
            title="ديون العملاء"
            value={loading ? '...' : formatCurrency(data?.totalOutstandingDebt ?? 0)}
            icon={<AlertTriangle />}
            variant="warning"
          />
        </BentoCell>
        <BentoCell>
          <KpiCard
            title="مستحق الموردين"
            value={loading ? '...' : formatCurrency(data?.totalSupplierDebt ?? 0)}
            icon={<Truck />}
            variant="warning"
          />
        </BentoCell>
      </BentoGrid>

      {/* === Row 6: Last 10 sales table === */}
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
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead className="w-28">الفاتورة</TableHead>
                      <TableHead className="w-40">العميل</TableHead>
                      <TableHead className="w-52">الوقت</TableHead>
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
                          <TableCell className="text-muted-foreground text-sm max-w-[160px] truncate">
                            {s.customerName ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            <DateTimeCell date={s.createdAt} />
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {formatCurrency(s.total)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                s.status === 'مرتجعة' ? 'danger' :
                                s.status === 'مكتملة' ? 'success' : 'secondary'
                              }
                              size="sm"
                            >
                              {s.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-muted-foreground"
                        >
                          📊 لا توجد مبيعات بعد
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/*
                نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg.
              */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
                {data?.last10Sales?.length ? (
                  data.last10Sales.map((s, index) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{index + 1}
                          </span>
                          <p className="truncate text-sm font-medium leading-tight">
                            {s.invoiceNo ?? `#${s.id}`}
                          </p>
                        </div>
                        {s.customerName && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                            {s.customerName}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          <DateTimeCell date={s.createdAt} />
                        </p>
                      </div>
                      <div className="shrink-0 text-left">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(s.total)}
                        </p>
                        <Badge
                          variant={
                            s.status === 'مرتجعة' ? 'danger' :
                            s.status === 'مكتملة' ? 'success' : 'secondary'
                          }
                          size="sm"
                        >
                          {s.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="col-span-full py-8 text-center text-muted-foreground">
                    📊 لا توجد مبيعات بعد
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
