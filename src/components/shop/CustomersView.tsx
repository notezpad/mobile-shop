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
import { formatCurrency } from '@/lib/format'
import { CustomerDetailDialog } from './CustomerDetailDialog'

interface Customer {
  id: number
  name: string
  phone: string | null
  balance: number
  _count?: { sales: number }
}

export function CustomersView() {
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = React.useState<Customer | null>(
    null
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = search.trim()
        ? `?search=${encodeURIComponent(search.trim())}`
        : ''
      const data = await api<Customer[]>(`/api/customers${params}`)
      setCustomers(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل العملاء')
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const remove = async (id: number) => {
    if (!confirm('حذف العميل؟')) return
    try {
      await api(`/api/customers/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
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
            <div className="flex size-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <Badge variant="outline" className="border-0 bg-transparent p-0 text-sm">
                ✓
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عملاء مسوّون</p>
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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">الرقم</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>الرصيد</TableHead>
                    <TableHead>عدد المبيعات</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا يوجد عملاء
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c, index) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.phone ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              c.balance > 0
                                ? 'border-destructive/20 bg-destructive/5 text-destructive tabular-nums'
                                : 'border-green-200 bg-green-50 text-green-700 tabular-nums'
                            }
                          >
                            {formatCurrency(c.balance)}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {c._count?.sales ?? 0}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
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
        </CardContent>
      </Card>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={load}
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
