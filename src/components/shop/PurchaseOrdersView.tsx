'use client'

import * as React from 'react'
import { FileSpreadsheet, Plus, RotateCcw, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [returnId, setReturnId] = React.useState<number | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<PurchaseOrder[]>('/api/purchase-orders')
      setOrders(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المشتريات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const filtered = query.trim()
    ? orders.filter((o) => (o.orderNo ?? String(o.id)).includes(query.trim()))
    : orders

  const doReturn = async (id: number) => {
    try {
      await api(`/api/purchase-orders/${id}`, { method: 'DELETE' })
      toast.success('تم ارتجاع أمر الشراء')
      load()
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
        <CardContent className="p-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث برقم أمر الشراء..."
              className="pr-9"
            />
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
                    <TableHead className="w-28">رقم الأمر</TableHead>
                    <TableHead className="w-36">التاريخ</TableHead>
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
        onSaved={load}
      />
    </div>
  )
}
