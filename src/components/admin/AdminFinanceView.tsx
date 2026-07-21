'use client'

import * as React from 'react'
import {
  Wallet,
  Calendar,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  Download,
  Loader2,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatCurrency, formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

interface FinanceData {
  dailyRevenue: number
  monthlyRevenue: number
  yearlyRevenue: number
  totalRevenue: number
  avgMonthly: number
  monthly: Array<{ month: string; revenue: number; count: number }>
  methodBreakdown: Array<{ method: string; revenue: number; count: number }>
  transactions: Array<{
    id: number
    date: string
    shopName: string
    planName: string
    amount: number
    method: string
    status: string
  }>
  count: number
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستا باي',
  fawry: 'فوري',
  manual: 'يدوي',
  code: 'كود',
}

const METHOD_COLORS = ['#22c55e', '#0ea5e9', '#a855f7', '#f59e0b', '#64748b', '#ef4444']

export function AdminFinanceView() {
  const [data, setData] = React.useState<FinanceData | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<FinanceData>('/api/admin/finance')
      setData(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل البيانات المالية')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const exportCSV = () => {
    if (!data) return
    const csv = ['Date,Tenant,Plan,Amount,Method,Status']
    for (const t of data.transactions) {
      csv.push(
        `${new Date(t.date).toLocaleString('en-GB')},${t.shopName},${t.planName},${t.amount},${t.method},${t.status}`
      )
    }
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير التقرير')
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-subtle text-success-subtle-foreground">
              <Calendar className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">إيرادات اليوم</p>
              {loading ? <Skeleton className="h-6 w-24" /> : <p className="text-base font-bold">{formatCurrency(data?.dailyRevenue ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <CalendarDays className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">إيرادات الشهر</p>
              {loading ? <Skeleton className="h-6 w-24" /> : <p className="text-base font-bold">{formatCurrency(data?.monthlyRevenue ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-chart-4/15 text-chart-4">
              <CalendarRange className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">إيرادات السنة</p>
              {loading ? <Skeleton className="h-6 w-24" /> : <p className="text-base font-bold">{formatCurrency(data?.yearlyRevenue ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning-subtle text-warning-subtle-foreground dark:text-warning-subtle-foreground">
              <TrendingUp className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">متوسط الشهري</p>
              {loading ? <Skeleton className="h-6 w-24" /> : <p className="text-base font-bold">{formatCurrency(data?.avgMonthly ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الإيرادات الشهرية (آخر 12 شهر)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data?.monthly ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.6)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.6)" />
                  <Tooltip
                    formatter={(v: any) => formatCurrency(Number(v))}
                    contentStyle={{
                      background: 'rgba(15,23,42,0.92)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" name="الإيراد" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">طرق الدفع</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data?.methodBreakdown ?? []}
                    dataKey="revenue"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label={(entry) => METHOD_LABEL[entry.method] ?? entry.method}
                  >
                    {(data?.methodBreakdown ?? []).map((_, i) => (
                      <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => formatCurrency(Number(v))}
                    contentStyle={{
                      background: 'rgba(15,23,42,0.92)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">آخر 100 معاملة</CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCSV}>
              <Download className="size-3.5" />
              تصدير CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-32">التاريخ</TableHead>
                    <TableHead>المحل</TableHead>
                    <TableHead className="w-32">الباقة</TableHead>
                    <TableHead className="w-28 text-center">المبلغ</TableHead>
                    <TableHead className="w-32">طريقة الدفع</TableHead>
                    <TableHead className="w-28 text-center">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.transactions ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        لا توجد معاملات
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.transactions ?? []).map((t, i) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs">{formatShortDate(t.date)}</TableCell>
                        <TableCell className="font-medium">{t.shopName}</TableCell>
                        <TableCell className="text-xs">{t.planName}</TableCell>
                        <TableCell className="text-xs font-medium text-center">{formatCurrency(t.amount)}</TableCell>
                        <TableCell className="text-xs">{METHOD_LABEL[t.method] ?? t.method}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
