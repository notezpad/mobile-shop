'use client'

import * as React from 'react'
import {
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Eye,
  TrendingDown,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
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
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { useConfirm } from './ConfirmDialogProvider'
import { CustomerDetailDialog } from './CustomerDetailDialog'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface Customer {
  id: number
  name: string
  phone: string | null
  balance: number
  _count?: { sales: number }
  totalPurchases?: number
  lastSaleAt?: string | null
}

export function CustomersView() {
  const confirm = useConfirm()
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = React.useState<Customer | null>(
    null
  )

  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : ''
      const data = await api<Customer[]>(`/api/customers${params}`)
      if (Array.isArray(data)) setCustomers(data)
    } catch (e: any) {
      // ⚡ Offline: don't show scary error — data stays as-is
      if (!e?.message?.includes('لا توجد بيانات')) {
        toast.error(e?.message || 'فشل تحميل العملاء')
      }
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh — e.g. a payment added from
  // CustomerDetailDialog (which sits on top of this list) now updates the
  // balance shown here instantly, no hard refresh needed.
  useDataRefresh(['customers'], load)

  const exportExcel = () => {
    if (customers.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('قائمة-العملاء'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'قائمة العملاء',
      sheetName: 'العملاء',
      columns: [
        { header: 'الاسم', key: 'name', format: 'text' },
        { header: 'الهاتف', key: 'phone', format: 'text' },
        { header: 'عدد الفواتير', key: 'salesCount', format: 'int' },
        { header: 'إجمالي المشتريات', key: 'totalPurchases', format: 'currency' },
        { header: 'الرصيد المستحق', key: 'balance', format: 'currency' },
        { header: 'آخر عملية شراء', key: 'lastSaleAt', format: 'text' },
      ],
      rows: customers.map((c) => ({
        name: c.name,
        phone: c.phone || '-',
        salesCount: c._count?.sales ?? 0,
        totalPurchases: c.totalPurchases ?? 0,
        balance: c.balance,
        lastSaleAt: c.lastSaleAt ? new Date(c.lastSaleAt).toLocaleDateString('ar-EG') : '-',
      })),
      totals: {
        name: 'الإجمالي',
        totalPurchases: customers.reduce((s, c) => s + (c.totalPurchases ?? 0), 0),
        balance: customers.reduce((s, c) => s + c.balance, 0),
      },
    })
  }

  const remove = async (id: number) => {
    if (!(await confirm('حذف العميل؟'))) return
    // ⚡ Optimistic: remove from list immediately
    const removed = customers.find((c) => c.id === id)
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    try {
      await api(`/api/customers/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      if (typeof navigator === 'undefined' || navigator.onLine) load()
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم الحذف (offline — سيتم المزامنة لاحقاً)')
      } else {
        if (removed) setCustomers((prev) => [removed, ...prev])
        toast.error(e?.message || 'فشل الحذف')
      }
    }
  }

  // Total outstanding debt = sum of positive balances
  const totalDebt = React.useMemo(
    () =>
      customers.reduce(
        (s, c) => s + (c.balance > 0 ? c.balance : 0),
        0
      ),
    [customers]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">العملاء</h1>
          <p className="text-sm text-muted-foreground">
            سجل العملاء وأرصدتهم والدفعات
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={customers.length === 0}>
            <FileSpreadsheet className="size-4" />
            تصدير Excel
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            عميل جديد
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Pencil className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي العملاء</p>
              <p className="text-lg font-bold tabular-nums">
                {customers.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TrendingDown className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                إجمالي ديون العملاء
              </p>
              <p className="text-lg font-bold tabular-nums text-destructive">
                {loading ? '—' : formatCurrency(totalDebt)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success-subtle text-success-subtle-foreground">
              <Badge variant="outline" className="border-0 bg-transparent p-0 text-sm">
                ✓
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عملاء بلا ديون</p>
              <p className="text-lg font-bold tabular-nums">
                {customers.filter((c) => c.balance <= 0).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Badge variant="outline" className="border-0 bg-transparent p-0 text-sm">
                !
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عملاء عليهم آجل</p>
              <p className="text-lg font-bold tabular-nums text-destructive">
                {customers.filter((c) => c.balance > 0).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="pr-9"
            />
          </div>
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
                    <TableHead>الاسم</TableHead>
                    <TableHead className="w-36">الهاتف</TableHead>
                    <TableHead className="w-32 text-center">الرصيد</TableHead>
                    <TableHead className="w-32 text-center">إجمالي المشتريات</TableHead>
                    <TableHead className="w-24 text-center">عدد المبيعات</TableHead>
                    <TableHead className="w-52">آخر تعامل</TableHead>
                    <TableHead className="w-32 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا يوجد عملاء
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c, index) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.phone ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              c.balance > 0
                                ? 'border-destructive/20 bg-destructive/5 text-destructive tabular-nums'
                                : 'border-success-subtle bg-success-subtle text-success-subtle-foreground tabular-nums'
                            }
                          >
                            {formatCurrency(c.balance)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatCurrency(c.totalPurchases ?? 0)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {c._count?.sales ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.lastSaleAt ? <DateTimeCell date={c.lastSaleAt} /> : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setDetailCustomer(c)}
                              title="كشف حساب"
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => {
                                setEditing(c)
                                setDialogOpen(true)
                              }}
                              title="تعديل"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={() => remove(c.id)}
                              title="حذف"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
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
              {customers.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا يوجد عملاء
                </p>
              ) : (
                customers.map((c, index) => {
                  const hasDebt = c.balance > 0
                  return (
                    <div key={c.id} className="rounded-lg border bg-card p-3 hover:bg-muted/30 dark:hover:bg-muted/20">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-base font-bold text-primary-subtle-foreground">
                          {c.name?.charAt(0) ?? '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{index + 1}
                            </span>
                            <p className="truncate font-medium leading-tight">{c.name}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {c.phone ?? 'بدون هاتف'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setDetailCustomer(c)}
                            title="كشف حساب"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setEditing(c)
                              setDialogOpen(true)
                            }}
                            title="تعديل"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => remove(c.id)}
                            title="حذف"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">الرصيد</p>
                          <Badge
                            variant="outline"
                            className={
                              hasDebt
                                ? 'border-destructive/20 bg-destructive/5 text-destructive tabular-nums'
                                : 'border-success-subtle bg-success-subtle text-success-subtle-foreground tabular-nums'
                            }
                          >
                            {formatCurrency(c.balance)}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">إجمالي المشتريات</p>
                          <p className="text-xs font-semibold tabular-nums">
                            {formatCurrency(c.totalPurchases ?? 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">عدد المبيعات</p>
                          <p className="text-xs font-semibold tabular-nums">
                            {c._count?.sales ?? 0}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>آخر تعامل:</span>
                        <span className="font-medium">
                          {c.lastSaleAt ? <DateTimeCell date={c.lastSaleAt} /> : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => {
          // ⚡ Optimistic: if offline, load() will fail — but we can try
          load()
        }}
      />

      <CustomerDetailDialog
        open={detailCustomer !== null}
        onOpenChange={(o) => !o && setDetailCustomer(null)}
        customerId={detailCustomer?.id ?? null}
        customerName={detailCustomer?.name}
      />
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Customer | null
  onSaved: () => void
}

function CustomerDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setPhone(initial?.phone ?? '')
    }
  }, [open, initial])

  const submit = async () => {
    if (!name.trim()) {
      toast.error('الاسم مطلوب')
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null }
      if (initial) {
        await api(`/api/customers/${initial.id}`, {
          method: 'PUT',
          body: payload,
        })
        toast.success('تم تحديث العميل')
      } else {
        await api('/api/customers', { method: 'POST', body: payload })
        toast.success('تمت إضافة العميل')
      }
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
          <DialogTitle>{initial ? 'تعديل عميل' : 'عميل جديد'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-phone">الهاتف</Label>
            <Input
              id="c-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="اختياري"
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
