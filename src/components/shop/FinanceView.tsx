'use client'

import * as React from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatCurrency, formatDate } from '@/lib/format'

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
  vodafone_cash: 'فودافون كاش',
  instapay: 'انستاباي',
  fawry: 'فوري',
}

export function FinanceView() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">المعاملات المالية</h1>
        <p className="text-sm text-muted-foreground">
          فودافون كاش — انستاباي — فوري
        </p>
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
                  <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
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
                <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-36">التاريخ</TableHead>
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
                          {formatDate(t.createdAt)}
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
        </CardContent>
      </Card>
    </div>
  )
}
