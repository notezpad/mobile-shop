'use client'

import * as React from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  FileText,
  Package,
  PackageX,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { BRAND, baseDocStyles, fmt as fmtMoney, openPrintWindow } from '@/lib/print'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Branch {
  id: number
  name: string
}

interface Report {
  from: string | null
  to: string | null
  branches: Branch[]

  totalSales: number
  totalProfit: number
  profitMargin: number
  salesCount: number
  avgOrderValue: number
  maintenanceRevenue: number
  maintenanceCount: number
  totalExpenses: number
  netProfit: number

  changes: {
    totalSales: number | null
    totalProfit: number | null
    salesCount: number | null
    netProfit: number | null
  }

  salesTrend: { date: string; total: number; profit: number }[]
  topProducts: { name: string; qty: number; total: number; profit: number }[]
  categoryBreakdown: { category: string; total: number }[]
  topCustomers: { name: string; total: number; salesCount: number }[]
  paymentMethods: { method: string; amount: number }[]

  financeIn: number
  financeOut: number
  cashBalance: number
  expensesByCategory: { category: string; amount: number }[]
  customersReceivable: number
  suppliersPayable: number

  stockValueCost: number
  stockValuePrice: number
  lowStockCount: number
  lowStockProducts: { name: string; quantity: number; minQuantity: number }[]

  totalPurchases: number
  purchasesCount: number
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'محافظ إلكترونية',
  fawry: 'محفظة إلكترونية',
}

function pad(d: Date) {
  const x = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${x(d.getMonth() + 1)}-${x(d.getDate())}`
}

function shortDate(iso: string) {
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}`
}

export function ReportsView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasFinance = enabledModules.includes('finance')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [branchId, setBranchId] = React.useState<string>('all')
  const [report, setReport] = React.useState<Report | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [activePreset, setActivePreset] = React.useState<'today' | 'week' | 'month' | 'all' | null>('month')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (branchId !== 'all') params.set('branchId', branchId)
      const data = await api<Report>(`/api/reports?${params.toString()}`)
      setReport(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }, [from, to, branchId])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh — this report aggregates sales,
  // expenses, cash and products, so refetch when any of those change.
  useDataRefresh(['sales', 'expenses', 'cash', 'products'], load)

  const setQuickRange = (preset: 'today' | 'week' | 'month' | 'all') => {
    setActivePreset(preset)
    const now = new Date()
    if (preset === 'today') {
      setFrom(pad(now))
      setTo(pad(now))
    } else if (preset === 'week') {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      setFrom(pad(start))
      setTo(pad(now))
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setFrom(pad(start))
      setTo(pad(now))
    } else {
      setFrom('')
      setTo('')
    }
  }

  const exportPdf = () => {
    if (!report) return
    const html = buildReportHtml(report, from, to, {
      name: shopName,
      phone: shopBranding.phone || undefined,
      address: shopBranding.address || undefined,
      logo: shopBranding.logoPath || undefined,
    })
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  const maxCategory = Math.max(1, ...(report?.categoryBreakdown.map((c) => c.total) ?? [1]))
  const maxMethod = Math.max(1, ...(report?.paymentMethods.map((m) => m.amount) ?? [1]))
  const maxExpense = Math.max(1, ...(report?.expensesByCategory.map((e) => e.amount) ?? [1]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">التقارير</h1>
          <p className="text-sm text-muted-foreground">
            نظرة شاملة على أداء المحل: المبيعات، المخزون، والمالية
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportPdf} disabled={loading || !report}>
            <FileText className="size-4" />
            تصدير PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex flex-wrap gap-2">
            {(['today', 'week', 'month', 'all'] as const).map((p) => (
              <Button
                key={p}
                variant={activePreset === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setQuickRange(p)}
              >
                {p === 'today' && <CalendarDays className="size-4" />}
                {p === 'today' ? 'اليوم' : p === 'week' ? 'أسبوع' : p === 'month' ? 'شهر' : 'كل الفترة'}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">من</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setActivePreset(null)
              }}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">إلى</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setActivePreset(null)
              }}
              className="w-[160px]"
            />
          </div>
          {report && report.branches.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">الفرع</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {report.branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" onClick={load}>
            تصفية
          </Button>
        </CardContent>
      </Card>

      {/* Top KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Wallet}
          label="إجمالي المبيعات"
          value={formatCurrency(report?.totalSales ?? 0)}
          change={report?.changes.totalSales ?? null}
          loading={loading}
        />
        <KpiCard
          icon={TrendingUp}
          label="صافي الربح"
          value={formatCurrency(report?.netProfit ?? 0)}
          change={report?.changes.netProfit ?? null}
          loading={loading}
          tone="primary"
        />
        <KpiCard
          icon={ShoppingCart}
          label="عدد الفواتير"
          value={formatNumber(report?.salesCount ?? 0)}
          change={report?.changes.salesCount ?? null}
          loading={loading}
        />
        <KpiCard
          icon={ReceiptText}
          label="متوسط الفاتورة"
          value={formatCurrency(report?.avgOrderValue ?? 0)}
          loading={loading}
        />
      </div>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="sales">المبيعات</TabsTrigger>
          <TabsTrigger value="inventory">المخزون</TabsTrigger>
          {hasFinance && <TabsTrigger value="finance">المالية</TabsTrigger>}
        </TabsList>

        {/* ===================== Overview ===================== */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-primary" />
                اتجاه المبيعات والربح
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-72 w-full" />
              ) : report && report.salesTrend.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={report.salesTrend}
                      margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDate}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                      />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={55} />
                      <Tooltip
                        labelFormatter={(v) => shortDate(String(v))}
                        formatter={(v: any, name: string) => [
                          formatCurrency(Number(v)),
                          name === 'total' ? 'المبيعات' : 'الربح',
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid oklch(0.9 0.005 95)',
                          fontFamily: 'inherit',
                        }}
                      />
                      <Bar dataKey="total" fill="oklch(0.55 0.18 142 / 0.35)" radius={[6, 6, 0, 0]} />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="oklch(0.55 0.18 142)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  لا توجد مبيعات في هذه الفترة
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat icon={Wrench} label="أوامر صيانة" value={formatNumber(report?.maintenanceCount ?? 0)} loading={loading} />
            <MiniStat icon={Banknote} label="إيراد الصيانة" value={formatCurrency(report?.maintenanceRevenue ?? 0)} loading={loading} />
            <MiniStat icon={Package} label="إجمالي المشتريات" value={formatCurrency(report?.totalPurchases ?? 0)} loading={loading} />
            <MiniStat
              icon={PackageX}
              label="تنبيهات نقص مخزون"
              value={formatNumber(report?.lowStockCount ?? 0)}
              loading={loading}
              tone={report && report.lowStockCount > 0 ? 'warn' : undefined}
            />
          </div>
        </TabsContent>

        {/* ===================== Sales ===================== */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="size-4 text-accent2-500" />
                  أفضل المنتجات مبيعاً
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-56 w-full" />
                ) : report && report.topProducts.length > 0 ? (
                  <>
                    {/* جدول — يظهر على lg+ */}
                    <div className="hidden lg:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المنتج</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-center">الإيراد</TableHead>
                            <TableHead className="text-center">الربح</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.topProducts.map((p, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-center tabular-nums">{formatNumber(p.qty)}</TableCell>
                              <TableCell className="text-center tabular-nums">{formatCurrency(p.total)}</TableCell>
                              <TableCell className="text-center tabular-nums text-primary">
                                {formatCurrency(p.profit)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* كروت — تظهر تحت lg */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
                      {report.topProducts.map((p, i) => (
                        <div key={i} className="rounded-lg border bg-card p-2.5 hover:bg-muted/30 dark:hover:bg-muted/20">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                              {p.name}
                            </p>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {formatNumber(p.qty)}
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1 text-center text-xs">
                            <div>
                              <p className="text-[10px] text-muted-foreground">الإيراد</p>
                              <p className="tabular-nums">{formatCurrency(p.total)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">الربح</p>
                              <p className="tabular-nums text-primary">{formatCurrency(p.profit)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-primary" />
                  أفضل العملاء
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-56 w-full" />
                ) : report && report.topCustomers.length > 0 ? (
                  <ul className="space-y-2">
                    {report.topCustomers.map((c, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between border-b border-dashed pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-medium">
                          <span className="me-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                          {c.name}
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {c.salesCount} فاتورة — {formatCurrency(c.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    لا توجد مبيعات مرتبطة بعملاء في هذه الفترة
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">المبيعات حسب التصنيف</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-40 w-full" />
                ) : report && report.categoryBreakdown.length > 0 ? (
                  <BarList
                    items={report.categoryBreakdown.map((c) => ({ label: c.category, value: c.total }))}
                    max={maxCategory}
                    formatValue={formatCurrency}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">طرق الدفع (المقبوضات)</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-40 w-full" />
                ) : report && report.paymentMethods.length > 0 ? (
                  <BarList
                    items={report.paymentMethods.map((m) => ({
                      label: METHOD_LABELS[m.method] ?? m.method,
                      value: m.amount,
                    }))}
                    max={maxMethod}
                    formatValue={formatCurrency}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===================== Inventory ===================== */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat icon={Package} label="قيمة المخزون (تكلفة)" value={formatCurrency(report?.stockValueCost ?? 0)} loading={loading} />
            <MiniStat icon={Wallet} label="قيمة المخزون (سعر البيع)" value={formatCurrency(report?.stockValuePrice ?? 0)} loading={loading} tone="primary" />
            <MiniStat
              icon={PackageX}
              label="أصناف تحت الحد الأدنى"
              value={formatNumber(report?.lowStockCount ?? 0)}
              loading={loading}
              tone={report && report.lowStockCount > 0 ? 'warn' : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageX className="size-4 text-destructive" />
                منتجات محتاجة تزويد
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : report && report.lowStockProducts.length > 0 ? (
                <>
                  {/* جدول — يظهر على lg+ */}
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المنتج</TableHead>
                          <TableHead className="text-center">الكمية الحالية</TableHead>
                          <TableHead className="text-center">الحد الأدنى</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.lowStockProducts.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-center tabular-nums">
                              <Badge variant={p.quantity === 0 ? 'destructive' : 'secondary'}>
                                {formatNumber(p.quantity)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center tabular-nums text-muted-foreground">
                              {formatNumber(p.minQuantity)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* كروت — تظهر تحت lg */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
                    {report.lowStockProducts.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                          {p.name}
                        </p>
                        <div className="shrink-0 text-left">
                          <Badge variant={p.quantity === 0 ? 'destructive' : 'secondary'} className="text-[10px]">
                            {formatNumber(p.quantity)}
                          </Badge>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            الأدنى: {formatNumber(p.minQuantity)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  كل المنتجات فوق الحد الأدنى للمخزون 👍
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== Finance ===================== */}
        <TabsContent value="finance" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat icon={Wallet} label="رصيد الخزنة" value={formatCurrency(report?.cashBalance ?? 0)} loading={loading} tone="primary" />
            <MiniStat icon={ArrowDownRight} label="إيداعات مالية" value={formatCurrency(report?.financeIn ?? 0)} loading={loading} />
            <MiniStat icon={ArrowUpRight} label="سحوبات مالية" value={formatCurrency(report?.financeOut ?? 0)} loading={loading} />
            <MiniStat icon={ReceiptText} label="إجمالي الالمعاملات المالية" value={formatCurrency(report?.totalExpenses ?? 0)} loading={loading} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">صافي الربح</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <>
                    <FormulaRow label="هامش ربح المبيعات" value={report?.totalProfit ?? 0} />
                    <FormulaRow label="+ إيراد الصيانة" value={report?.maintenanceRevenue ?? 0} />
                    <FormulaRow label="− الالمعاملات المالية" value={-(report?.totalExpenses ?? 0)} negative />
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                      <span className="font-semibold">= صافي الربح</span>
                      <span
                        className={cn(
                          'text-lg font-bold tabular-nums',
                          (report?.netProfit ?? 0) >= 0 ? 'text-primary' : 'text-destructive'
                        )}
                      >
                        {formatCurrency(report?.netProfit ?? 0)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">مستحقات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <span className="text-sm">مستحقات على العملاء (لصالحك)</span>
                      <span className="font-semibold tabular-nums text-primary">
                        {formatCurrency(report?.customersReceivable ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <span className="text-sm">مستحقات للموردين (عليك)</span>
                      <span className="font-semibold tabular-nums text-destructive">
                        {formatCurrency(report?.suppliersPayable ?? 0)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">الالمعاملات المالية حسب التصنيف</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-40 w-full" />
                ) : report && report.expensesByCategory.length > 0 ? (
                  <BarList
                    items={report.expensesByCategory.map((e) => ({ label: e.category, value: e.amount }))}
                    max={maxExpense}
                    formatValue={formatCurrency}
                    tone="destructive"
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    لا توجد المعاملات المالية مسجلة في هذه الفترة
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  loading,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  change?: number | null
  loading?: boolean
  tone?: 'primary'
}) {
  return (
    <Card variant="bento">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className={cn('text-xl font-bold tabular-nums truncate', tone === 'primary' && 'text-primary')}>
                {value}
              </p>
            )}
          </div>
          {Icon && (
            <div className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              tone === 'primary' ? 'bg-primary-subtle text-primary-subtle-foreground' : 'bg-muted text-muted-foreground'
            )}>
              <Icon className="size-4" />
            </div>
          )}
        </div>
        {change != null && !loading && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
                change >= 0
                  ? 'bg-success-subtle text-success-subtle-foreground'
                  : 'bg-destructive-subtle text-destructive-subtle-foreground'
              )}
            >
              {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(change).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">عن الفترة السابقة</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  loading?: boolean
  tone?: 'primary' | 'warn'
}) {
  return (
    <Card variant="bento">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5',
            tone === 'primary' && 'bg-primary-subtle text-primary-subtle-foreground',
            tone === 'warn' && 'bg-warning-subtle text-warning-subtle-foreground',
            !tone && 'bg-muted text-muted-foreground'
          )}
        >
          <Icon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-20" />
          ) : (
            <p className="font-bold tabular-nums">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BarList({
  items,
  max,
  formatValue,
  tone,
}: {
  items: { label: string; value: number }[]
  max: number
  formatValue: (n: number) => string
  tone?: 'destructive'
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">{it.label}</span>
            <span className="tabular-nums text-muted-foreground">{formatValue(it.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', tone === 'destructive' ? 'bg-destructive/70' : 'bg-primary')}
              style={{ width: `${Math.max(4, (it.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function FormulaRow({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums font-medium', negative && 'text-destructive')}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}

function section(title: string, inner: string, accent?: string) {
  return `
    <div class="rpt-section">
      <div class="rpt-section-title" ${accent ? `style="border-inline-start-color:${accent}"` : ''}>${title}</div>
      ${inner}
    </div>
  `
}

function kpi(label: string, value: string, big?: boolean) {
  return `
    <div class="kpi-card ${big ? 'kpi-card-big' : ''}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
    </div>
  `
}

function emptyRow(colspan: number, text: string) {
  return `<tr><td colspan="${colspan}" style="color:${BRAND.sub};padding:16px">${text}</td></tr>`
}

function barRow(label: string, value: number, max: number, formatted: string, tone?: 'destructive') {
  const pct = Math.max(4, Math.round((value / max) * 100))
  const color = tone === 'destructive' ? BRAND.red : BRAND.primary
  return `
    <div class="bar-row">
      <div class="bar-row-top"><span>${label}</span><span>${formatted}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>
  `
}

function buildReportHtml(
  r: Report,
  from: string,
  to: string,
  shop?: { name?: string; phone?: string; address?: string; logo?: string }
): string {
  const range = `${from || 'بداية النشاط'}  ←  ${to || 'الآن'}`
  const generatedAt = fmtDateTime(new Date())

  const maxCategory = Math.max(1, ...(r.categoryBreakdown.map((c) => c.total) || [1]))
  const maxMethod = Math.max(1, ...(r.paymentMethods.map((m) => m.amount) || [1]))
  const maxExpense = Math.max(1, ...(r.expensesByCategory.map((e) => e.amount) || [1]))

  const topProductsRows = r.topProducts.length
    ? r.topProducts
        .map(
          (p, i) => `
        <tr>
          <td style="color:${BRAND.sub}">${i + 1}</td>
          <td style="text-align:right;font-weight:600">${escapeHtml(p.name)}</td>
          <td>${formatNumber(p.qty)}</td>
          <td>${fmtMoney(p.total)}</td>
          <td style="font-weight:700;color:${BRAND.primaryDark}">${fmtMoney(p.profit)}</td>
        </tr>`
        )
        .join('')
    : emptyRow(5, 'لا توجد مبيعات في هذه الفترة')

  const topCustomersRows = r.topCustomers.length
    ? r.topCustomers
        .map(
          (c, i) => `
        <tr>
          <td style="color:${BRAND.sub}">${i + 1}</td>
          <td style="text-align:right;font-weight:600">${escapeHtml(c.name)}</td>
          <td>${formatNumber(c.salesCount)}</td>
          <td style="font-weight:700">${fmtMoney(c.total)}</td>
        </tr>`
        )
        .join('')
    : emptyRow(4, 'لا توجد مبيعات مرتبطة بعملاء في هذه الفترة')

  const lowStockRows = r.lowStockProducts.length
    ? r.lowStockProducts
        .map(
          (p) => `
        <tr>
          <td style="text-align:right;font-weight:600">${escapeHtml(p.name)}</td>
          <td style="font-weight:700;color:${p.quantity === 0 ? BRAND.red : BRAND.amber}">${formatNumber(p.quantity)}</td>
          <td style="color:${BRAND.sub}">${formatNumber(p.minQuantity)}</td>
        </tr>`
        )
        .join('')
    : emptyRow(3, 'كل المنتجات فوق الحد الأدنى للمخزون 👍')

  const expenseRows = r.expensesByCategory.length
    ? r.expensesByCategory
        .map((e) => `<tr><td style="text-align:right;font-weight:600">${escapeHtml(e.category)}</td><td style="font-weight:700;color:${BRAND.red}">${fmtMoney(e.amount)}</td></tr>`)
        .join('')
    : emptyRow(2, 'لا توجد المعاملات المالية مسجلة في هذه الفترة')

  const categoryBars = r.categoryBreakdown.length
    ? r.categoryBreakdown.map((c) => barRow(escapeHtml(c.category), c.total, maxCategory, fmtMoney(c.total))).join('')
    : `<p style="color:${BRAND.sub};font-size:12.5px">لا توجد بيانات</p>`

  const methodBars = r.paymentMethods.length
    ? r.paymentMethods
        .map((m) => barRow(escapeHtml(METHOD_LABELS[m.method] ?? m.method), m.amount, maxMethod, fmtMoney(m.amount)))
        .join('')
    : `<p style="color:${BRAND.sub};font-size:12.5px">لا توجد بيانات</p>`

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>تقرير المحل ${range}</title>
<style>
  ${baseDocStyles()}
  .cover {
    background: linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary});
    color: #fff; border-radius: 12px; padding: 22px 26px; margin-bottom: 22px;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .cover .shop-logo { height: 50px; width: 50px; object-fit: contain; border-radius: 10px; background: #fff; border: none; }
  .cover-title { font-size: 21px; font-weight: 800; }
  .cover-sub { font-size: 12px; opacity: .9; margin-top: 4px; }
  .cover-meta { text-align: left; font-size: 12px; opacity: .95; }
  .cover-meta b { font-size: 14px; display: block; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi-card { border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 13px; background: #fafcfa; }
  .kpi-card-big { background: ${BRAND.primaryLight}; border-color: ${BRAND.primary}; }
  .kpi-label { font-size: 10.5px; color: ${BRAND.sub}; margin-bottom: 5px; }
  .kpi-value { font-size: 16.5px; font-weight: 800; color: ${BRAND.ink}; }
  .kpi-card-big .kpi-value { color: ${BRAND.primaryDark}; }
  .rpt-section { margin-bottom: 20px; break-inside: avoid; }
  .rpt-section-title {
    font-size: 13.5px; font-weight: 800; color: ${BRAND.ink}; margin-bottom: 10px;
    padding-inline-start: 10px; border-inline-start: 4px solid ${BRAND.primary};
  }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .bar-row { margin-bottom: 9px; }
  .bar-row-top { display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; }
  .bar-track { height: 7px; border-radius: 99px; background: ${BRAND.border}; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 99px; }
  .formula-box { border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 14px 16px; font-size: 12.5px; }
  .formula-row { display: flex; justify-content: space-between; padding: 5px 0; }
  .formula-row.total { border-top: 2px solid ${BRAND.primaryLight}; margin-top: 4px; padding-top: 9px; font-weight: 800; font-size: 14px; color: ${BRAND.primaryDark}; }
  @media print {
    .rpt-section { page-break-inside: avoid; }
    .doc-footer::after {
      content: "صفحة " counter(page) " من " counter(pages);
      display: block; margin-top: 4px; font-size: 10px;
    }
  }
</style>
</head>
<body>
  <div class="brand-bar"></div>
  <div class="page">
    <div class="cover">
      <div style="display:flex;align-items:center;gap:12px">
        ${shop?.logo ? `<img src="${shop.logo}" class="shop-logo" />` : ''}
        <div>
          <div class="cover-title">تقرير أداء المحل</div>
          <div class="cover-sub">${escapeHtml(shop?.name || 'محل الاتصالات')}${shop?.phone ? ` — ${escapeHtml(shop.phone)}` : ''}</div>
        </div>
      </div>
      <div class="cover-meta">
        <b>${escapeHtml(range)}</b>
        تم إنشاؤه: ${generatedAt}
      </div>
    </div>

    <div class="kpi-grid">
      ${kpi('إجمالي المبيعات', fmtMoney(r.totalSales) + ' ')}
      ${kpi('صافي الربح', fmtMoney(r.netProfit) + ' ', true)}
      ${kpi('عدد الفواتير', formatNumber(r.salesCount))}
      ${kpi('متوسط الفاتورة', fmtMoney(r.avgOrderValue) + ' ')}
      ${kpi('إيراد الصيانة', fmtMoney(r.maintenanceRevenue) + ' ')}
      ${kpi('إجمالي الالمعاملات المالية', fmtMoney(r.totalExpenses) + ' ')}
      ${kpi('رصيد الخزنة', fmtMoney(r.cashBalance) + ' ', true)}
      ${kpi('إجمالي المشتريات', fmtMoney(r.totalPurchases) + ' ')}
    </div>

    ${section(
      'أفضل المنتجات مبيعاً',
      `<table><thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإيراد</th><th>الربح</th></tr></thead><tbody>${topProductsRows}</tbody></table>`
    )}

    <div class="two-col">
      ${section(
        'أفضل العملاء',
        `<table><thead><tr><th>#</th><th>العميل</th><th>الفواتير</th><th>الإجمالي</th></tr></thead><tbody>${topCustomersRows}</tbody></table>`
      )}
      ${section('المبيعات حسب التصنيف', `<div style="padding-top:2px">${categoryBars}</div>`)}
    </div>

    <div class="two-col">
      ${section('طرق الدفع (المقبوضات)', `<div style="padding-top:2px">${methodBars}</div>`)}
      ${section(
        'الالمعاملات المالية حسب التصنيف',
        `<table><thead><tr><th>التصنيف</th><th>المبلغ</th></tr></thead><tbody>${expenseRows}</tbody></table>`
      )}
    </div>

    ${section(
      'تنبيهات نقص المخزون',
      `<table><thead><tr><th>المنتج</th><th>الكمية الحالية</th><th>الحد الأدنى</th></tr></thead><tbody>${lowStockRows}</tbody></table>`,
      BRAND.amber
    )}

    ${section(
      'الملخص المالي',
      `<div class="two-col">
        <div class="formula-box">
          <div class="formula-row"><span>هامش ربح المبيعات</span><span>${fmtMoney(r.totalProfit)} </span></div>
          <div class="formula-row"><span>+ إيراد الصيانة</span><span>${fmtMoney(r.maintenanceRevenue)} </span></div>
          <div class="formula-row"><span>− الالمعاملات المالية</span><span style="color:${BRAND.red}">${fmtMoney(r.totalExpenses)} </span></div>
          <div class="formula-row total"><span>= صافي الربح</span><span>${fmtMoney(r.netProfit)} </span></div>
        </div>
        <div class="formula-box">
          <div class="formula-row"><span>إيداعات مالية</span><span>${fmtMoney(r.financeIn)} </span></div>
          <div class="formula-row"><span>سحوبات مالية</span><span>${fmtMoney(r.financeOut)} </span></div>
          <div class="formula-row"><span>مستحقات على العملاء</span><span>${fmtMoney(r.customersReceivable)} </span></div>
          <div class="formula-row"><span>مستحقات للموردين</span><span style="color:${BRAND.red}">${fmtMoney(r.suppliersPayable)} </span></div>
        </div>
      </div>`
    )}

    <div class="doc-footer">
      <div class="thanks">${escapeHtml(shop?.name || 'محل الاتصالات')}</div>
      <div>تقرير آلي تم إصداره بواسطة نظام إدارة المحل — ${generatedAt}</div>
    </div>
  </div>
</body>
</html>`
}

function fmtDateTime(d: Date) {
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
