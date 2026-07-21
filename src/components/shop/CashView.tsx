'use client'

import * as React from 'react'
import { Banknote, FileText, Loader2, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { cn } from '@/lib/utils'
import { printListReportHtml, openPrintWindow } from '@/lib/print'
import { useShopStore } from '@/lib/store'

interface Entry {
  id: number
  source: string
  amount: number
  note: string | null
  userName?: string | null
  createdAt: string
}

const SOURCE_LABEL: Record<string, string> = {
  sale: 'بيع',
  refund: 'مرتجع بيع',
  maintenance: 'صيانة',
  transaction: 'معاملة مالية',
  manual: 'يدوي',
  payment: 'دفعة عميل',
  commission: 'عمولة',
  purchase: 'شراء',
  purchase_refund: 'مرتجع شراء',
  supplier_payment: 'دفعة لمورد',
  expense: 'مصروف',
}

export function CashView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const [data, setData] = React.useState<{ balance: number; entries: Entry[] } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ balance: number; entries: Entry[] }>('/api/cash')
      setData(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // Entries come newest-first from the API, and `data.balance` is the
  // authoritative running total (sum of ALL entries, not just the visible
  // page). To get a correct "balance after this row" per row even when
  // there are more than the fetched 200 entries, walk backwards from the
  // known-correct current balance, subtracting each row's amount as we go.
  const runningBalances = React.useMemo(() => {
    if (!data) return []
    let running = data.balance
    return data.entries.map((e) => {
      const after = running
      running -= e.amount
      return after
    })
  }, [data])

  const exportPdf = () => {
    if (!data) return
    const totalIn = data.entries.filter((e) => e.amount >= 0).reduce((s, e) => s + e.amount, 0)
    const totalOut = data.entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)

    const html = printListReportHtml(
      {
        title: 'الخزنة',
        subtitle: 'حركات النقدية والرصيد الحالي',
        columns: [
          { header: '#' },
          { header: 'التاريخ' },
          { header: 'المصدر' },
          { header: 'بواسطة' },
          { header: 'المبلغ' },
          { header: 'الرصيد بعد الحركة' },
          { header: 'ملاحظات', align: 'right' },
        ],
        rows: data.entries.map((e, index) => [
          String(index + 1),
          formatArabicDateTime(e.createdAt),
          SOURCE_LABEL[e.source] ?? e.source,
          e.userName ?? '—',
          `${e.amount >= 0 ? '+' : ''}${formatCurrency(e.amount)}`,
          formatCurrency(runningBalances[index] ?? 0),
          e.note ?? '—',
        ]),
        kpis: [
          { label: 'رصيد الخزنة الحالي', value: formatCurrency(data.balance), emphasize: true },
          { label: 'إجمالي الوارد', value: formatCurrency(totalIn) },
          { label: 'إجمالي الصادر', value: formatCurrency(totalOut) },
          { label: 'عدد الحركات', value: String(data.entries.length) },
        ],
        emptyMessage: 'لا توجد حركات',
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
          <h1 className="text-2xl font-bold">الخزنة</h1>
          <p className="text-sm text-muted-foreground">
            حركات النقدية والرصيد الحالي
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf} disabled={loading}>
            <FileText className="size-4" />
            تصدير PDF
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            حركة يدوية
        </Button>
        </div>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex size-14 items-center justify-center rounded-xl bg-primary-foreground/15">
            <Banknote className="size-7" />
          </div>
          <div>
            <p className="text-sm opacity-90">رصيد الخزنة الحالي</p>
            {loading ? (
              <Skeleton className="mt-1 h-8 w-40 bg-primary-foreground/20" />
            ) : (
              <p className="text-3xl font-bold tabular-nums">
                {formatCurrency(data?.balance ?? 0)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
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
                    <TableHead className="w-36">المصدر</TableHead>
                    <TableHead className="w-28">بواسطة</TableHead>
                    <TableHead className="w-32 text-center">المبلغ</TableHead>
                    <TableHead className="w-32 text-center">الرصيد بعد الحركة</TableHead>
                    <TableHead>ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.entries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد حركات
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.entries.map((e, index) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-center font-mono text-xs">{index + 1}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <DateTimeCell date={e.createdAt} />
                        </TableCell>
                        <TableCell>
                          {SOURCE_LABEL[e.source] ?? e.source}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {e.userName ?? '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-center font-semibold tabular-nums',
                            e.amount >= 0 ? 'text-primary' : 'text-destructive'
                          )}
                        >
                          {e.amount >= 0 ? '+' : ''}
                          {formatCurrency(e.amount)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {formatCurrency(runningBalances[index] ?? 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {e.note ?? '—'}
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

      <ManualDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </div>
  )
}

interface ManualProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}

function ManualDialog({ open, onOpenChange, onSaved }: ManualProps) {
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setAmount('')
      setNote('')
    }
  }, [open])

  const submit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt === 0) {
      toast.error('المبلغ غير صالح')
      return
    }
    setSaving(true)
    try {
      await api('/api/cash', {
        method: 'POST',
        body: { amount: amt, note: note.trim() || null },
      })
      toast.success('تمت إضافة الحركة')
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>حركة يدوية</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-amount">
              المبلغ <span className="text-muted-foreground text-xs">(موجب = دخل، سالب = مصروف)</span>
            </Label>
            <Input
              id="m-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مثال: 100 أو -50"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-note">ملاحظات</Label>
            <Input
              id="m-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
