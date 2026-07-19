'use client'

import * as React from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  FileSpreadsheet,
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
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي',
  fawry: 'فوري',
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
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) {
      toast.error('الرجاء السماح بالنوافذ المنبثقة')
      return
    }
    const html = buildReportHtml(report, from, to)
    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      w.focus()
      w.print()
    }, 250)
  }

  const exportCsv = () => {
    if (!report) return
    const rows = [
      ['البيان', 'القيمة'],
      ['إجمالي المبيعات', report.totalSales.toFixed(2)],
      ['هامش الربح من المبيعات', report.totalProfit.toFixed(2)],
      ['نسبة هامش الربح', `${report.profitMargin.toFixed(1)}%`],
      ['عدد الفواتير', String(report.salesCount)],
      ['متوسط قيمة الفاتورة', report.avgOrderValue.toFixed(2)],
      ['إيراد الصيانة', report.maintenanceRevenue.toFixed(2)],
      ['إجمالي المصروفات', report.totalExpenses.toFixed(2)],
      ['صافي الربح', report.netProfit.toFixed(2)],
      ['إيداعات مالية', report.financeIn.toFixed(2)],
      ['سحوبات مالية', report.financeOut.toFixed(2)],
      ['رصيد الخزنة', report.cashBalance.toFixed(2)],
      ['مستحقات على العملاء', report.customersReceivable.toFixed(2)],
      ['مستحقات للموردين', report.suppliersPayable.toFixed(2)],
      ['قيمة المخزون (تكلفة)', report.stockValueCost.toFixed(2)],
      ['قيمة المخزون (بيع)', report.stockValuePrice.toFixed(2)],
      ['تنبيهات نقص المخزون', String(report.lowStockCount)],
      ['إجمالي المشتريات', report.totalPurchases.toFixed(2)],
      ['', ''],
      ['أفضل المنتجات', 'الكمية', 'الإيراد', 'الربح'],
      ...report.topProducts.map((p) => [p.name, String(p.qty), p.total.toFixed(2), p.profit.toFixed(2)]),
      ['', ''],
      ['أفضل العملاء', 'إجمالي المشتريات', 'عدد الفواتير'],
      ...report.topCustomers.map((c) => [c.name, c.total.toFixed(2), String(c.salesCount)]),
      ['', ''],
      ['المصروفات حسب التصنيف', ''],
      ...report.expensesByCategory.map((e) => [e.category, e.amount.toFixed(2)]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${from || 'all'}_${to || 'now'}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
          <Button variant="outline" onClick={exportCsv} disabled={loading || !report}>
            <FileSpreadsheet className="size-4" />
            تصدير Excel
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
          <TabsTrigger value="finance">المالية</TabsTrigger>
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
                  <Trophy className="size-4 text-amber-500" />
                  أفضل المنتجات مبيعاً
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-56 w-full" />
                ) : report && report.topProducts.length > 0 ? (
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
            <MiniStat icon={ReceiptText} label="إجمالي المصروفات" value={formatCurrency(report?.totalExpenses ?? 0)} loading={loading} />
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
                    <FormulaRow label="− المصروفات" value={-(report?.totalExpenses ?? 0)} negative />
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
                <CardTitle className="text-base">المصروفات حسب التصنيف</CardTitle>
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
                    لا توجد مصروفات مسجلة في هذه الفترة
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-28" />
        ) : (
          <div className="mt-1 flex items-baseline gap-2">
            <p className={cn('text-xl font-bold tabular-nums', tone === 'primary' && 'text-primary')}>
              {value}
            </p>
            {change != null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 text-xs font-medium tabular-nums',
                  change >= 0 ? 'text-primary' : 'text-destructive'
                )}
              >
                {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(change).toFixed(0)}%
              </span>
            )}
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
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'primary' && 'bg-primary/10 text-primary',
            tone === 'warn' && 'bg-amber-500/10 text-amber-600',
            !tone && 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
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

function buildReportHtml(r: Report, from: string, to: string): string {
  const range = `${from || 'البداية'} ← ${to || 'الآن'}`
  const topProductsRows = r.topProducts
    .map(
      (p) =>
        `<tr><td>${p.name}</td><td>${p.qty}</td><td>${formatCurrency(p.total)}</td><td>${formatCurrency(p.profit)}</td></tr>`
    )
    .join('')
  const expenseRows = r.expensesByCategory
    .map((e) => `<tr><td>${e.category}</td><td>${formatCurrency(e.amount)}</td></tr>`)
    .join('')
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>تقرير ${range}</title>
<style>
  body { font-family: 'Cairo','Tahoma',sans-serif; padding: 24px; color: #111; }
  h1 { color: #2f9e44; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; }
  .range { color: #666; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 640px; }
  .item { border: 1px solid #ddd; padding: 12px; border-radius: 8px; }
  .item .lbl { color: #666; font-size: 12px; }
  .item .val { font-size: 18px; font-weight: 800; color: #2f9e44; }
  table { border-collapse: collapse; width: 100%; max-width: 640px; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
  th { background: #f5f5f5; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>تقرير المحل</h1>
  <div class="range">الفترة: ${range}</div>
  <div class="grid">
    <div class="item"><div class="lbl">إجمالي المبيعات</div><div class="val">${formatCurrency(r.totalSales)}</div></div>
    <div class="item"><div class="lbl">صافي الربح</div><div class="val">${formatCurrency(r.netProfit)}</div></div>
    <div class="item"><div class="lbl">عدد الفواتير</div><div class="val">${r.salesCount}</div></div>
    <div class="item"><div class="lbl">متوسط الفاتورة</div><div class="val">${formatCurrency(r.avgOrderValue)}</div></div>
    <div class="item"><div class="lbl">إيراد الصيانة</div><div class="val">${formatCurrency(r.maintenanceRevenue)}</div></div>
    <div class="item"><div class="lbl">إجمالي المصروفات</div><div class="val">${formatCurrency(r.totalExpenses)}</div></div>
    <div class="item"><div class="lbl">رصيد الخزنة</div><div class="val">${formatCurrency(r.cashBalance)}</div></div>
    <div class="item"><div class="lbl">قيمة المخزون (تكلفة)</div><div class="val">${formatCurrency(r.stockValueCost)}</div></div>
  </div>
  ${
    r.topProducts.length
      ? `<h2>أفضل المنتجات</h2><table><tr><th>المنتج</th><th>الكمية</th><th>الإيراد</th><th>الربح</th></tr>${topProductsRows}</table>`
      : ''
  }
  ${
    r.expensesByCategory.length
      ? `<h2>المصروفات حسب التصنيف</h2><table><tr><th>التصنيف</th><th>المبلغ</th></tr>${expenseRows}</table>`
      : ''
  }
</body></html>`
}
