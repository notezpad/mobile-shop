'use client'

import * as React from 'react'
import { FileText, Loader2, Plus, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatArabicDateTime } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { printListReportHtml, openPrintWindow } from '@/lib/print'
import { useShopStore } from '@/lib/store'

interface Txn {
  id: number
  method: string
  kind: string
  amount: number
  commission: number
  note: string | null
  userName?: string | null
  createdAt: string
}

const METHOD_LABEL: Record<string, string> = {
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}

export function FinanceView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const [rows, setRows] = React.useState<Txn[]>([])
  const [loading, setLoading] = React.useState(true)
  const [method, setMethod] = React.useState('vodafone_cash')
  const [kind, setKind] = React.useState('deposit')
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [filterMethod, setFilterMethod] = React.useState('all')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (filterMethod && filterMethod !== 'all')
        params.set('method', filterMethod)
      const data = await api<Txn[]>(`/api/finance?${params.toString()}`)
      setRows(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }, [from, to, filterMethod])

  React.useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('المبلغ غير صالح')
      return
    }
    setSaving(true)
    try {
      await api('/api/finance', {
        method: 'POST',
        body: { method, kind, amount: amt, note: note.trim() || null },
      })
      toast.success('تمت إضافة المعاملة')
      setAmount('')
      setNote('')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const exportPdf = () => {
    const totalDeposit = rows.filter((t) => t.kind === 'deposit').reduce((s, t) => s + t.amount, 0)
    const totalWithdraw = rows.filter((t) => t.kind === 'withdraw').reduce((s, t) => s + t.amount, 0)
    const totalCommission = rows.reduce((s, t) => s + t.commission, 0)

    const html = printListReportHtml(
      {
        title: 'المعاملات المالية',
        subtitle: 'محافظ إلكترونية متعددة',
        columns: [
          { header: '#' },
          { header: 'التاريخ' },
          { header: 'الوسيلة' },
          { header: 'بواسطة' },
          { header: 'النوع' },
          { header: 'المبلغ' },
          { header: 'العمولة' },
          { header: 'الصافي' },
          { header: 'ملاحظات', align: 'right' },
        ],
        rows: rows.map((t, i) => [
          String(i + 1),
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{formatArabicDateTime(t.createdAt)}</span>,
          METHOD_LABEL[t.method] ?? t.method,
          t.userName ?? '—',
          t.kind === 'deposit' ? 'إيداع' : 'سحب',
          formatCurrency(t.amount),
          formatCurrency(t.commission),
          formatCurrency((t.kind === 'deposit' ? t.amount : -t.amount) + t.commission),
          t.note ?? '—',
        ]),
        kpis: [
          { label: 'إجمالي الإيداعات', value: formatCurrency(totalDeposit) },
          { label: 'إجمالي السحوبات', value: formatCurrency(totalWithdraw) },
          { label: 'إجمالي العمولات', value: formatCurrency(totalCommission), emphasize: true },
          { label: 'عدد المعاملات', value: String(rows.length) },
        ],
        note:
          from || to
            ? `الفترة: من ${from || 'البداية'} إلى ${to || 'اليوم'}`
            : 'الفترة: كل الفترات',
        emptyMessage: 'لا توجد معاملات',
      },
      {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
        logo: shopBranding.logoPath || undefined,
      }
    )
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">المعاملات المالية</h1>
          <p className="text-sm text-muted-foreground">
            محافظ إلكترونية متعددة
          </p>
        </div>
        <Button variant="outline" onClick={exportPdf} disabled={loading}>
          <FileText className="size-4" />
          تصدير PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إضافة معاملة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>الوسيلة</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vodafone_cash">محافظ إلكترونية</SelectItem>
                  <SelectItem value="instapay">انستاباي</SelectItem>
                  <SelectItem value="fawry">فوري</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>النوع</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">إيداع للعميل</SelectItem>
                  <SelectItem value="withdraw">سحب للعميل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={submit} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                حفظ
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">من تاريخ</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الوسيلة</Label>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="vodafone_cash">محافظ إلكترونية</SelectItem>
                <SelectItem value="instapay">انستاباي</SelectItem>
                <SelectItem value="fawry">فوري</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={load}>
            <Search className="size-4" />
            تصفية
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="hidden overflow-x-auto lg:block" dir="ltr">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-52">التاريخ</TableHead>
                    <TableHead className="w-32">الوسيلة</TableHead>
                    <TableHead className="w-28">بواسطة</TableHead>
                    <TableHead className="w-24 text-center">النوع</TableHead>
                    <TableHead className="w-32 text-center">المبلغ</TableHead>
                    <TableHead className="w-28 text-center">العمولة</TableHead>
                    <TableHead className="w-32 text-center">الصافي</TableHead>
                    <TableHead>ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد معاملات
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((t, index) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-center font-mono text-xs">{index + 1}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <DateTimeCell date={t.createdAt} />
                        </TableCell>
                        <TableCell>
                          {METHOD_LABEL[t.method] ?? t.method}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {t.userName ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {t.kind === 'deposit' ? 'إيداع' : 'سحب'}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {formatCurrency(t.amount)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-primary">
                          {formatCurrency(t.commission)}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {formatCurrency(
                            (t.kind === 'deposit' ? t.amount : -t.amount) +
                              t.commission
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {t.note ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg.
          */}
          {!loading && (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
              {rows.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا توجد معاملات
                </p>
              ) : (
                rows.map((t, index) => (
                  <div key={t.id} className="rounded-lg border bg-card p-3 hover:bg-muted/30 dark:hover:bg-muted/20">
                    {/* رأس الكارت: الوسيلة + نوع المعاملة */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{index + 1}
                          </span>
                          <p className="font-medium leading-tight">
                            {METHOD_LABEL[t.method] ?? t.method}
                          </p>
                          <Badge
                            variant={t.kind === 'deposit' ? 'secondary' : 'destructive'}
                            className="text-[10px]"
                          >
                            {t.kind === 'deposit' ? 'إيداع' : 'سحب'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <DateTimeCell date={t.createdAt} />
                        </p>
                      </div>
                    </div>

                    {/* شبكة البيانات: مبلغ/عمولة/صافي */}
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">المبلغ</p>
                        <p className="text-xs font-semibold tabular-nums">
                          {formatCurrency(t.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">العمولة</p>
                        <p className="text-xs tabular-nums text-primary">
                          {formatCurrency(t.commission)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">الصافي</p>
                        <p className="text-xs font-semibold tabular-nums">
                          {formatCurrency(
                            (t.kind === 'deposit' ? t.amount : -t.amount) +
                              t.commission
                          )}
                        </p>
                      </div>
                    </div>

                    {/* ملاحظة + بواسطة */}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>بواسطة: {t.userName ?? '—'}</span>
                      {t.note && <span className="truncate" title={t.note}>{t.note}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
