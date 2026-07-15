'use client'

import * as React from 'react'
import { CalendarDays, FileSpreadsheet, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

interface Report {
  from: string | null
  to: string | null
  totalSales: number
  totalProfit: number
  salesCount: number
  maintenanceCount: number
  maintenanceRevenue: number
  financeIn: number
  financeOut: number
  cashBalance: number
  lowStockCount: number
  stockValueCost: number
  stockValuePrice: number
  topProducts: Array<{ name: string; qty: number; total: number }>
}

function pad(d: Date) {
  const x = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${x(d.getMonth() + 1)}-${x(d.getDate())}`
}

export function ReportsView() {
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [report, setReport] = React.useState<Report | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const data = await api<Report>(`/api/reports?${params.toString()}`)
      setReport(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل التقرير')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  React.useEffect(() => {
    load()
  }, [load])

  const setQuickRange = (preset: 'today' | 'week' | 'month') => {
    const now = new Date()
    if (preset === 'today') {
      setFrom(pad(now))
      setTo(pad(now))
    } else if (preset === 'week') {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      setFrom(pad(start))
      setTo(pad(now))
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setFrom(pad(start))
      setTo(pad(now))
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
      ['صافي الربح', report.totalProfit.toFixed(2)],
      ['عدد المبيعات', String(report.salesCount)],
      ['عدد أوامر الصيانة', String(report.maintenanceCount)],
      ['إيراد الصيانة', report.maintenanceRevenue.toFixed(2)],
      ['إيداعات مالية', report.financeIn.toFixed(2)],
      ['سحوبات مالية', report.financeOut.toFixed(2)],
      ['رصيد الخزنة', report.cashBalance.toFixed(2)],
      ['تنبيهات المخزون', String(report.lowStockCount)],
      ['قيمة المخزون (تكلفة)', report.stockValueCost.toFixed(2)],
      ['قيمة المخزون (بيع)', report.stockValuePrice.toFixed(2)],
      ['', ''],
      ['أفضل المنتجات', ''],
      ...report.topProducts.map((p) => [p.name, String(p.qty)]),
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">التقارير</h1>
        <p className="text-sm text-muted-foreground">
          ملخص الأداء في فترة محددة
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuickRange('today')}>
              <CalendarDays className="size-4" />
              اليوم
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange('week')}>
              أسبوع
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange('month')}>
              شهر
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">من</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">إلى</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <Button variant="outline" onClick={load}>
            تصفية
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="إجمالي المبيعات" value={formatCurrency(report?.totalSales ?? 0)} loading={loading} tone="primary" />
        <KpiCard label="صافي الربح" value={formatCurrency(report?.totalProfit ?? 0)} loading={loading} tone="primary" />
        <KpiCard label="عدد المبيعات" value={String(report?.salesCount ?? 0)} loading={loading} />
        <KpiCard label="أوامر الصيانة" value={String(report?.maintenanceCount ?? 0)} loading={loading} />
        <KpiCard label="إيراد الصيانة" value={formatCurrency(report?.maintenanceRevenue ?? 0)} loading={loading} tone="primary" />
        <KpiCard label="رصيد الخزنة" value={formatCurrency(report?.cashBalance ?? 0)} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">أفضل 5 منتجات مبيعاً</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : report?.topProducts.length ? (
            <ul className="space-y-2">
              {report.topProducts.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between border-b border-dashed pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-medium">
                    <span className="me-2 inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    {p.name}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {p.qty} وحدة — {formatCurrency(p.total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا توجد مبيعات في هذه الفترة
            </p>
          )}
        </CardContent>
      </Card>

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
  )
}

function KpiCard({
  label,
  value,
  loading,
  tone,
}: {
  label: string
  value: string
  loading?: boolean
  tone?: 'primary'
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-28" />
        ) : (
          <p
            className={
              'mt-1 text-xl font-bold tabular-nums' +
              (tone === 'primary' ? ' text-primary' : '')
            }
          >
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function buildReportHtml(r: Report, from: string, to: string): string {
  const range = `${from || 'البداية'} ← ${to || 'الآن'}`
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>تقرير ${range}</title>
<style>
  body { font-family: 'Cairo','Tahoma',sans-serif; padding: 24px; color: #111; }
  h1 { color: #2f9e44; margin: 0 0 4px; }
  .range { color: #666; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 600px; }
  .item { border: 1px solid #ddd; padding: 12px; border-radius: 8px; }
  .item .lbl { color: #666; font-size: 12px; }
  .item .val { font-size: 18px; font-weight: 800; color: #2f9e44; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>تقرير المحل</h1>
  <div class="range">الفترة: ${range}</div>
  <div class="grid">
    <div class="item"><div class="lbl">إجمالي المبيعات</div><div class="val">${formatCurrency(r.totalSales)}</div></div>
    <div class="item"><div class="lbl">صافي الربح</div><div class="val">${formatCurrency(r.totalProfit)}</div></div>
    <div class="item"><div class="lbl">عدد المبيعات</div><div class="val">${r.salesCount}</div></div>
    <div class="item"><div class="lbl">أوامر الصيانة</div><div class="val">${r.maintenanceCount}</div></div>
    <div class="item"><div class="lbl">إيراد الصيانة</div><div class="val">${formatCurrency(r.maintenanceRevenue)}</div></div>
    <div class="item"><div class="lbl">رصيد الخزنة</div><div class="val">${formatCurrency(r.cashBalance)}</div></div>
    <div class="item"><div class="lbl">إيداعات مالية</div><div class="val">${formatCurrency(r.financeIn)}</div></div>
    <div class="item"><div class="lbl">سحوبات مالية</div><div class="val">${formatCurrency(r.financeOut)}</div></div>
    <div class="item"><div class="lbl">قيمة المخزون (تكلفة)</div><div class="val">${formatCurrency(r.stockValueCost)}</div></div>
    <div class="item"><div class="lbl">قيمة المخزون (بيع)</div><div class="val">${formatCurrency(r.stockValuePrice)}</div></div>
  </div>
</body></html>`
}

