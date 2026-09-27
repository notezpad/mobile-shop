'use client'

import * as React from 'react'
import { Loader2, Plus, Trash2, ReceiptText, TrendingDown, FileSpreadsheet } from 'lucide-react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

const CATEGORIES = [
  'إيجار',
  'كهرباء ومياه',
  'مرتبات',
  'نقل ومواصلات',
  'صيانة المحل',
  'إنترنت واتصالات',
  'ضيافة',
  'أخرى',
]

interface ExpenseRow {
  id: number
  category: string
  amount: number
  note: string | null
  userName?: string | null
  createdAt: string
}

interface ExpensesResponse {
  expenses: ExpenseRow[]
  total: number
  byCategory: Record<string, number>
}

export function ExpensesView() {
  const [data, setData] = React.useState<ExpensesResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  // add form
  const [category, setCategory] = React.useState(CATEGORIES[0])
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // filters
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [filterCategory, setFilterCategory] = React.useState('all')

  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (filterCategory !== 'all') params.set('category', filterCategory)
      const res = await api<ExpensesResponse>(`/api/expenses?${params.toString()}`)
      setData(res)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المصروفات')
    } finally {
      setLoading(false)
    }
  }, [from, to, filterCategory])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['expenses'], load)

  const submit = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    setSaving(true)
    // ⚡ Optimistic: add to local list immediately
    const tempId = Date.now()
    const newExpense = {
      id: tempId,
      category,
      amount: amt,
      note: note.trim() || null,
      userName: null,
      createdAt: new Date().toISOString(),
    }
    setData((prev) => prev ? {
      ...prev,
      expenses: [newExpense, ...(prev.expenses || [])],
      total: (prev.total || 0) + amt,
      byCategory: {
        ...(prev.byCategory || {}),
        [category]: (prev.byCategory?.[category] || 0) + amt,
      },
    } : prev)

    try {
      await api('/api/expenses', {
        method: 'POST',
        body: { category, amount: amt, note: note.trim() || null },
      })
      toast.success('تم تسجيل المصروف')
      setAmount('')
      setNote('')
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم تسجيل المصروف (offline — سيتم المزامنة لاحقاً)')
        setAmount('')
        setNote('')
      } else {
        // Revert on real error
        setData((prev) => prev ? {
          ...prev,
          expenses: (prev.expenses || []).filter((e: any) => e.id !== tempId),
        } : prev)
        toast.error(e?.message || 'فشل الحفظ')
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    // ⚡ Optimistic: remove from list immediately
    const deleted = data?.expenses?.find((e: any) => e.id === deleteId)
    setData((prev) => prev ? {
      ...prev,
      expenses: (prev.expenses || []).filter((e: any) => e.id !== deleteId),
      total: Math.max(0, (prev.total || 0) - (deleted?.amount || 0)),
    } : prev)

    try {
      await api(`/api/expenses/${deleteId}`, { method: 'DELETE' })
      toast.success('تم حذف المصروف')
      setDeleteId(null)
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم حذف المصروف (offline — سيتم المزامنة لاحقاً)')
        setDeleteId(null)
      } else {
        // Revert
        if (deleted) setData((prev) => prev ? { ...prev, expenses: [deleted, ...(prev.expenses || [])] } : prev)
        toast.error(e?.message || 'فشل الحذف')
      }
    } finally {
      setDeleting(false)
    }
  }

  const topCategories = data
    ? Object.entries(data.byCategory).sort((a, b) => b[1] - a[1])
    : []

  const exportExcel = () => {
    if (!data || data.expenses.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المصروفات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل المصروفات',
      periodLabel: from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : undefined,
      sheetName: 'المصروفات',
      columns: [
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'التصنيف', key: 'category', format: 'text' },
        { header: 'المبلغ', key: 'amount', format: 'currency' },
        { header: 'ملاحظة', key: 'note', format: 'text' },
        { header: 'بواسطة', key: 'user', format: 'text' },
      ],
      rows: data.expenses.map((e) => ({
        date: new Date(e.createdAt).toLocaleString('ar-EG'),
        category: e.category,
        amount: e.amount,
        note: e.note || '-',
        user: e.userName || '-',
      })),
      totals: { date: 'الإجمالي', amount: data.total },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">المصروفات</h1>
          <p className="text-sm text-muted-foreground">
            مصاريف تشغيل المحل — إيجار، مرتبات، فواتير، وغيرها
          </p>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={!data || data.expenses.length === 0}>
          <FileSpreadsheet className="size-4" />
          تصدير Excel
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-destructive/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TrendingDown className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
              <p className="text-lg font-bold tabular-nums text-destructive">
                {loading ? '—' : formatCurrency(data?.total ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardContent className="p-4">
            <p className="mb-2 text-xs text-muted-foreground">أعلى الأنواع</p>
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مصروفات بعد</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topCategories.slice(0, 4).map(([cat, amt]) => (
                  <span
                    key={cat}
                    className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium"
                  >
                    {cat}: <span className="tabular-nums">{formatCurrency(amt)}</span>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add expense */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-4" />
            تسجيل مصروف جديد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-2.5">
              <Label>النوع</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2.5">
              <Label htmlFor="exp-amount">المبلغ</Label>
              <Input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2.5 sm:col-span-2">
              <Label htmlFor="exp-note">ملاحظات</Label>
              <div className="flex gap-2">
                <Input
                  id="exp-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="اختياري"
                />
                <Button onClick={submit} disabled={saving} className="shrink-0">
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  حفظ
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-2.5">
            <Label htmlFor="exp-from">من تاريخ</Label>
            <Input
              id="exp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="exp-to">إلى تاريخ</Label>
            <Input
              id="exp-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-2.5">
            <Label>النوع</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(from || to || filterCategory !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom('')
                setTo('')
                setFilterCategory('all')
              }}
            >
              مسح الفلاتر
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
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
                    <TableHead className="w-36">النوع</TableHead>
                    <TableHead className="w-28 text-center">المبلغ</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead className="w-28">بواسطة</TableHead>
                    <TableHead className="w-16 text-center">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!data || data.expenses.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد المصروفات — سجّل أول مصروف بالأعلى
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.expenses.map((e, index) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <DateTimeCell date={e.createdAt} />
                        </TableCell>
                        <TableCell className="font-medium">{e.category}</TableCell>
                        <TableCell className="text-center font-semibold tabular-nums text-destructive">
                          {formatCurrency(e.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.note ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.userName ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteId(e.id)}
                            title="حذف"
                          >
                            <Trash2 className="size-4" />
                          </Button>
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
          {!loading && data && (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
              {data.expenses.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا توجد المصروفات — سجّل أول مصروف بالأعلى
                </p>
              ) : (
                data.expenses.map((e, index) => (
                  <div key={e.id} className="rounded-lg border bg-card p-3 hover:bg-muted/30 dark:hover:bg-muted/20">
                    {/* رأس الكارت: التصنيف + المبلغ */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{index + 1}
                          </span>
                          <p className="font-medium leading-tight">{e.category}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <DateTimeCell date={e.createdAt} />
                        </p>
                      </div>
                      <p className="shrink-0 text-base font-bold tabular-nums text-destructive">
                        {formatCurrency(e.amount)}
                      </p>
                    </div>

                    {/* ملاحظة + بواسطة */}
                    {e.note && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {e.note}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>بواسطة: {e.userName ?? '—'}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteId(e.id)}
                        title="حذف"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم عكس القيد في الخزنة وإرجاع المبلغ. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
