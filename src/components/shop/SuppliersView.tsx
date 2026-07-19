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
import { SupplierDetailDialog } from './SupplierDetailDialog'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'

interface Supplier {
  id: number
  name: string
  phone: string | null
  balance: number
  _count?: { purchaseOrders: number }
  totalPurchases?: number
  lastPurchaseAt?: string | null
}

export function SuppliersView() {
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = React.useState<Supplier | null>(
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
      const data = await api<Supplier[]>(`/api/suppliers${params}`)
      setSuppliers(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الموردين')
    } finally {
      setLoading(false)
    }
  }, [search])

  React.useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const exportExcel = () => {
    if (suppliers.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('قائمة-الموردين'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'قائمة الموردين',
      sheetName: 'الموردين',
      columns: [
        { header: 'الاسم', key: 'name', format: 'text' },
        { header: 'الهاتف', key: 'phone', format: 'text' },
        { header: 'عدد أوامر الشراء', key: 'ordersCount', format: 'int' },
        { header: 'إجمالي المشتريات', key: 'totalPurchases', format: 'currency' },
        { header: 'الرصيد المستحق للمورد', key: 'balance', format: 'currency' },
        { header: 'آخر عملية شراء', key: 'lastPurchaseAt', format: 'text' },
      ],
      rows: suppliers.map((s) => ({
        name: s.name,
        phone: s.phone || '-',
        ordersCount: s._count?.purchaseOrders ?? 0,
        totalPurchases: s.totalPurchases ?? 0,
        balance: s.balance,
        lastPurchaseAt: s.lastPurchaseAt ? new Date(s.lastPurchaseAt).toLocaleDateString('ar-EG') : '-',
      })),
      totals: {
        name: 'الإجمالي',
        totalPurchases: suppliers.reduce((sum, s) => sum + (s.totalPurchases ?? 0), 0),
        balance: suppliers.reduce((sum, s) => sum + s.balance, 0),
      },
    })
  }

  const remove = async (id: number) => {
    if (!confirm('حذف المورد؟')) return
    try {
      await api(`/api/suppliers/${id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  // Total we owe suppliers = sum of positive balances
  const totalOwed = React.useMemo(
    () =>
      suppliers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0),
    [suppliers]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">الموردين</h1>
          <p className="text-sm text-muted-foreground">
            سجل الموردين وأرصدتهم والدفعات الآجلة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={suppliers.length === 0}>
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
            مورد جديد
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
              <p className="text-xs text-muted-foreground">إجمالي الموردين</p>
              <p className="text-lg font-bold tabular-nums">
                {suppliers.length}
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
                إجمالي المستحق للموردين
              </p>
              <p className="text-lg font-bold tabular-nums text-destructive">
                {loading ? '—' : formatCurrency(totalOwed)}
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
              <p className="text-xs text-muted-foreground">موردين مسوّون</p>
              <p className="text-lg font-bold tabular-nums">
                {suppliers.filter((c) => c.balance <= 0).length}
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
              <p className="text-xs text-muted-foreground">موردين عليهم مستحق</p>
              <p className="text-lg font-bold tabular-nums text-destructive">
                {suppliers.filter((c) => c.balance > 0).length}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead className="w-36">الهاتف</TableHead>
                    <TableHead className="w-32 text-center">المستحق له</TableHead>
                    <TableHead className="w-32 text-center">إجمالي المشتريات</TableHead>
                    <TableHead className="w-24 text-center">عدد الأوامر</TableHead>
                    <TableHead className="w-36">آخر تعامل</TableHead>
                    <TableHead className="w-32 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا يوجد موردين
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((c, index) => (
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
                                : 'border-green-200 bg-green-50 text-green-700 tabular-nums'
                            }
                          >
                            {formatCurrency(c.balance)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatCurrency(c.totalPurchases ?? 0)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {c._count?.purchaseOrders ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setDetailSupplier(c)}
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

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={load}
      />

      <SupplierDetailDialog
        open={detailSupplier !== null}
        onOpenChange={(o) => !o && setDetailSupplier(null)}
        supplierId={detailSupplier?.id ?? null}
        supplierName={detailSupplier?.name}
      />
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Supplier | null
  onSaved: () => void
}

function SupplierDialog({ open, onOpenChange, initial, onSaved }: Props) {
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
        await api(`/api/suppliers/${initial.id}`, {
          method: 'PUT',
          body: payload,
        })
        toast.success('تم تحديث المورد')
      } else {
        await api('/api/suppliers', { method: 'POST', body: payload })
        toast.success('تمت إضافة المورد')
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
          <DialogTitle>{initial ? 'تعديل مورد' : 'مورد جديد'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-phone">الهاتف</Label>
            <Input
              id="s-phone"
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
