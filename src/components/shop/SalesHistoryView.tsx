'use client'

import * as React from 'react'
import { Printer, RotateCcw, Search } from 'lucide-react'
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
import { formatCurrency, formatDate } from '@/lib/format'
import { printSale } from '@/lib/print-client'
import { useShopStore } from '@/lib/store'

interface SaleItem {
  id: number
  name: string
  price: number
  quantity: number
  cost: number
}
interface Sale {
  id: number
  invoiceNo: string | null
  total: number
  paid: number
  status: string
  createdAt: string
  customer: { name: string; phone?: string | null } | null
  items: SaleItem[]
}

export function SalesHistoryView() {
  const [sales, setSales] = React.useState<Sale[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [refundId, setRefundId] = React.useState<number | null>(null)
  const shopName = useShopStore((s) => s.shopName)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<Sale[]>('/api/sales')
      setSales(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المبيعات')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const filtered = query.trim()
    ? sales.filter((s) =>
        (s.invoiceNo ?? String(s.id)).includes(query.trim())
      )
    : sales

  const reprint = (s: Sale) => {
    printSale(
      {
        id: s.id,
        invoiceNo: s.invoiceNo,
        total: s.total,
        paid: s.paid,
        status: s.status,
        createdAt: s.createdAt,
        items: s.items.map((it) => ({
          name: it.name,
          price: it.price,
          quantity: it.quantity,
        })),
        customer: s.customer
          ? { name: s.customer.name, phone: s.customer.phone }
          : null,
      },
      { name: shopName }
    )
  }

  const doRefund = async (id: number) => {
    try {
      await api(`/api/sales/${id}`, { method: 'DELETE' })
      toast.success('تم ارتجاع الفاتورة')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإرجاع')
    } finally {
      setRefundId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">سجل المبيعات</h1>
        <p className="text-sm text-muted-foreground">
          استعراض الفواتير وإعادة الطباعة والإرجاع
        </p>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة..."
              className="pr-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">الرقم</TableHead>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد مبيعات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((s, index) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.invoiceNo ?? `#${s.id}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDate(s.createdAt)}
                        </TableCell>
                        <TableCell>
                          {s.customer ? (
                            s.customer.name
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              بدون عميل
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">
                          {formatCurrency(s.total)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCurrency(s.paid)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              s.status === 'مرتجعة' ? 'destructive' : 'secondary'
                            }
                            className={
                              s.status === 'مكتملة'
                                ? 'bg-primary/10 text-primary'
                                : ''
                            }
                          >
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => reprint(s)}
                              title="إعادة طباعة"
                            >
                              <Printer className="size-4" />
                            </Button>
                            {s.status !== 'مرتجعة' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                onClick={() => setRefundId(s.id)}
                                title="مرتجع"
                              >
                                <RotateCcw className="size-4" />
                              </Button>
                            )}
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

      {refundId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-4 p-6 text-center">
              <h3 className="text-lg font-bold">مرتجع الفاتورة</h3>
              <p className="text-sm text-muted-foreground">
                سيتم استرجاع الكميات للمخزون وإنشاء قيد خزنة سلبي. متابعة؟
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setRefundId(null)}>
                  إلغاء
                </Button>
                <Button variant="destructive" onClick={() => doRefund(refundId)}>
                  تأكيد المرتجع
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
