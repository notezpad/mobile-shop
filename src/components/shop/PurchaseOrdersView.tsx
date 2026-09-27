'use client'

import * as React from 'react'
import { FileSpreadsheet, Plus, RotateCcw, Search, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { PurchaseOrderDialog } from './PurchaseOrderDialog'
import { DateTimeCell } from './DateTimeCell'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'

interface OrderItem {
  id: number
  name: string
  cost: number
  quantity: number
}
interface PurchaseOrder {
  id: number
  orderNo: string | null
  total: number
  paid: number
  status: string
  createdAt: string
  userName?: string | null
  supplier: { name: string; phone?: string | null } | null
  items: OrderItem[]
}

export function PurchaseOrdersView() {
  const [orders, setOrders] = React.useState<PurchaseOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [returnId, setReturnId] = React.useState<number | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async (f?: string, t?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      const qs = params.toString()
      const data = await api<PurchaseOrder[]>(`/api/purchase-orders${qs ? `?${qs}` : ''}`)
      setOrders(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المشتريات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['purchase-orders'], () => load(from, to))

  const applyRange = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    load(f, t)
  }

  const toISODate = (d: Date) => d.toISOString().slice(0, 10)

  const quickToday = () => {
    const today = toISODate(new Date())
    applyRange(today, today)
  }
  const quickLast7Days = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    applyRange(toISODate(start), toISODate(end))
  }
  const quickThisMonth = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    applyRange(toISODate(start), toISODate(now))
  }
  const clearRange = () => applyRange('', '')

  const filtered = query.trim()
    ? orders.filter((o) => (o.orderNo ?? String(o.id)).includes(query.trim()))
    : orders

  const doReturn = async (id: number) => {
    try {
      await api(`/api/purchase-orders/${id}`, { method: 'DELETE' })
      toast.success('تم ارتجاع أمر الشراء')
      load(from, to)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإرجاع')
    } finally {
      setReturnId(null)
    }
  }

  const exportExcel = () => {
    if (filtered.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المشتريات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل أوامر الشراء',
      sheetName: 'أوامر الشراء',
      columns: [
        { header: 'رقم الأمر', key: 'orderNo', format: 'text' },
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'المورد', key: 'supplier', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'الإجمالي', key: 'total', format: 'currency' },
        { header: 'المدفوع', key: 'paid', format: 'currency' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'بواسطة', key: 'userName', format: 'text' },
      ],
      rows: filtered.map((o) => ({
        orderNo: o.orderNo || `#${o.id}`,
        date: new Date(o.createdAt).toLocaleString('ar-EG'),
        supplier: o.supplier?.name || '-',
        itemsCount: o.items.length,
        total: o.total,
        paid: o.paid,
        status: o.status,
        userName: o.userName || '-',
      })),
      totals: {
        orderNo: 'الإجمالي',
        total: filtered.reduce((s, o) => s + o.total, 0),
        paid: filtered.reduce((s, o) => s + o.paid, 0),
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">المشتريات</h1>
          <p className="text-sm text-muted-foreground">
            سجل أوامر الشراء من الموردين — كاش أو آجل
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="size-4" />
            تصدير Excel
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            أمر شراء جديد
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">بحث</Label>
            <div className="relative w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث برقم أمر الشراء..."
                className="pr-9"
              />
            </div>
          </div>
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
          <Button variant="outline" onClick={() => load(from, to)}>
            تصفية
          </Button>
          <div className="mx-1 h-8 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={quickToday}>
            اليوم
          </Button>
          <Button variant="ghost" size="sm" onClick={quickLast7Days}>
            آخر 7 أيام
          </Button>
          <Button variant="ghost" size="sm" onClick={quickThisMonth}>
            هذا الشهر
          </Button>
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={clearRange}>
              <X className="size-3.5" />
              مسح
            </Button>
          )}
        </CardContent>
      </Card>

      {(from || to) && (
        <p className="text-xs text-muted-foreground">
          عرض المشتريات من {from || 'البداية'} إلى {to || 'اليوم'} — {filtered.length} أمر
        </p>
      )}

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
                    <TableHead className="w-[132px]">رقم الأمر</TableHead>
                    <TableHead className="w-52">التاريخ</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead className="w-28">بواسطة</TableHead>
                    <TableHead className="w-28 text-center">الإجمالي</TableHead>
                    <TableHead className="w-28 text-center">المدفوع</TableHead>
                    <TableHead className="w-24 text-center">الآجل</TableHead>
                    <TableHead className="w-20 text-center">الكمية</TableHead>
                    <TableHead className="w-24 text-center">الحالة</TableHead>
                    <TableHead className="w-20 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد مشتريات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((o, index) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {o.orderNo ?? `#${o.id}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <DateTimeCell date={o.createdAt} />
                        </TableCell>
                        <TableCell>
                          {o.supplier ? (
                            o.supplier.name
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              بدون مورد
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {o.userName ?? '—'}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {formatCurrency(o.total)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatCurrency(o.paid)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-center tabular-nums font-semibold',
                            o.total - o.paid > 0 && 'text-destructive'
                          )}
                        >
                          {formatCurrency(o.total - o.paid)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {o.items.reduce((sum, it) => sum + it.quantity, 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={o.status === 'مرتجعة' ? 'destructive' : 'secondary'}
                            className={
                              o.status === 'مكتملة' ? 'bg-primary/10 text-primary' : ''
                            }
                          >
                            {o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {o.status !== 'مرتجعة' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={() => setReturnId(o.id)}
                              title="مرتجع للمورد"
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                          )}
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
              {filtered.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا توجد مشتريات
                </p>
              ) : (
                filtered.map((o, index) => {
                  const due = o.total - o.paid
                  const itemCount = o.items.reduce((sum, it) => sum + it.quantity, 0)
                  const isReturned = o.status === 'مرتجعة'
                  return (
                    <div key={o.id} className={cn('rounded-lg border bg-card p-3', isReturned && 'opacity-60')}>
                      {/* رأس الكارت: رقم الأمر + شارة الحالة */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{index + 1}
                            </span>
                            <p className="font-medium leading-tight">
                              {o.orderNo ?? `#${o.id}`}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <DateTimeCell date={o.createdAt} />
                          </p>
                        </div>
                        <Badge
                          variant={isReturned ? 'destructive' : 'secondary'}
                          className={o.status === 'مكتملة' ? 'bg-primary/10 text-primary' : ''}
                        >
                          {o.status}
                        </Badge>
                      </div>

                      {/* المورد + بواسطة */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">المورد:</span>
                        <span className="font-medium">
                          {o.supplier ? o.supplier.name : 'بدون مورد'}
                        </span>
                        {o.userName && (
                          <>
                            <span className="text-muted-foreground">بواسطة:</span>
                            <span className="font-medium">{o.userName}</span>
                          </>
                        )}
                      </div>

                      {/* شبكة البيانات: إجمالي/مدفوع/آجل */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(o.total)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">المدفوع</p>
                          <p className="tabular-nums">{formatCurrency(o.paid)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الآجل</p>
                          <p
                            className={cn(
                              'font-semibold tabular-nums',
                              due > 0 && 'text-destructive'
                            )}
                          >
                            {formatCurrency(due)}
                          </p>
                        </div>
                      </div>

                      {/* الكمية + إجراء */}
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>الكمية: {itemCount}</span>
                        {!isReturned && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => setReturnId(o.id)}
                            title="مرتجع للمورد"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {returnId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-4 p-6 text-center">
              <h3 className="text-lg font-bold">مرتجع أمر الشراء</h3>
              <p className="text-sm text-muted-foreground">
                سيتم سحب الكمية من المخزون وعكس القيود المالية المرتبطة. هل تريد
                المتابعة؟
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setReturnId(null)}>
                  إلغاء
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => returnId && doReturn(returnId)}
                >
                  تأكيد الإرجاع
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <PurchaseOrderDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={() => load(from, to)}
      />
    </div>
  )
}
