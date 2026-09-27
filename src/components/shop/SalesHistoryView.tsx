'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Printer, RotateCcw, Search, X } from 'lucide-react'
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
import { printSale, exportSalePdf } from '@/lib/print-client'
import { useShopStore } from '@/lib/store'
import { DateTimeCell } from './DateTimeCell'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { getLocalDateStr } from '@/lib/dateUtils'
import { useDataRefresh } from '@/lib/offline/data-events'

interface SaleItem {
  id: number
  name: string
  price: number
  quantity: number
  cost: number
  unitLabel?: string | null
  unitQuantity?: number | null
}
interface Sale {
  id: number
  invoiceNo: string | null
  total: number
  paid: number
  status: string
  createdAt: string
  userName?: string | null
  customer: { name: string; phone?: string | null } | null
  items: SaleItem[]
}

export function SalesHistoryView() {
  const [sales, setSales] = React.useState<Sale[]>([])
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [refundId, setRefundId] = React.useState<number | null>(null)
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const PAGE_SIZE = 50

  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

  const load = React.useCallback(async (f?: string, t?: string, p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      params.set('page', String(p))
      params.set('limit', String(PAGE_SIZE))
      const qs = params.toString()
      const res = await api<{ data: Sale[]; total: number; totalPages: number }>(`/api/sales${qs ? `?${qs}` : ''}`)
      setSales(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(p)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المبيعات')
    } finally {
      setLoading(false)
    }
  }, [PAGE_SIZE])

  React.useEffect(() => {
    load(from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['sales'], () => load(from, to, page))

  const applyRange = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    load(f, t, 1)
  }

  // ✅ الأزرار دي بس بتملأ حقول التاريخ باقتراح مبدئي (بتوقيت المتصفح).
  //    الفلترة الفعلية بتتحول على السيرفر بتوقيت *المحل* نفسه (مش المتصفح
  //    ومش UTC) — راجع src/lib/tenantTime.ts و /api/sales.

  const quickToday = () => {
    const today = getLocalDateStr(new Date())
    applyRange(today, today)
  }
  const quickLast7Days = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    applyRange(getLocalDateStr(start), getLocalDateStr(end))
  }
  const quickThisMonth = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    applyRange(getLocalDateStr(start), getLocalDateStr(now))
  }
  const clearRange = () => applyRange('', '')

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
        items: s.items.map((it) => {
          // Same conversion as POSView: it.price/it.quantity are stored PER PIECE,
          // so when a wholesale unit (دستة/كرتون...) was used, show the unit's
          // quantity and its full price, not the piece price times unit count.
          const hasUnit = it.unitQuantity != null && it.unitQuantity > 0
          const displayQty = hasUnit ? it.unitQuantity! : it.quantity
          const displayPrice = hasUnit ? (it.price * it.quantity) / it.unitQuantity! : it.price
          const unitSuffix = it.unitLabel ? ` (${displayQty} ${it.unitLabel})` : ''
          return {
            name: it.name + unitSuffix,
            price: displayPrice,
            quantity: displayQty,
          }
        }),
        customer: s.customer
          ? { name: s.customer.name, phone: s.customer.phone }
          : null,
      },
      { name: shopName, phone: shopBranding.phone || undefined, address: shopBranding.address || undefined, logo: shopBranding.logoPath || undefined, invoicePrefix: shopBranding.invoicePrefix }
    )
  }

  const exportPdf = (s: Sale) => {
    exportSalePdf(
      {
        id: s.id,
        invoiceNo: s.invoiceNo,
        total: s.total,
        paid: s.paid,
        status: s.status,
        createdAt: s.createdAt,
        items: s.items.map((it) => {
          const hasUnit = it.unitQuantity != null && it.unitQuantity > 0
          const displayQty = hasUnit ? it.unitQuantity! : it.quantity
          const displayPrice = hasUnit ? (it.price * it.quantity) / it.unitQuantity! : it.price
          const unitSuffix = it.unitLabel ? ` (${displayQty} ${it.unitLabel})` : ''
          return { name: it.name + unitSuffix, price: displayPrice, quantity: displayQty }
        }),
        customer: s.customer ? { name: s.customer.name, phone: s.customer.phone } : null,
      },
      { name: shopName, phone: shopBranding.phone || undefined, address: shopBranding.address || undefined, logo: shopBranding.logoPath || undefined, invoicePrefix: shopBranding.invoicePrefix }
    )
  }

  const exportExcel = () => {
    if (filtered.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('سجل-المبيعات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'سجل المبيعات',
      sheetName: 'الفواتير',
      columns: [
        { header: 'رقم الفاتورة', key: 'invoiceNo', format: 'text' },
        { header: 'التاريخ', key: 'date', format: 'text' },
        { header: 'العميل', key: 'customer', format: 'text' },
        { header: 'عدد الأصناف', key: 'itemsCount', format: 'int' },
        { header: 'الإجمالي', key: 'total', format: 'currency' },
        { header: 'المدفوع', key: 'paid', format: 'currency' },
        { header: 'الحالة', key: 'status', format: 'text' },
        { header: 'الكاشير', key: 'userName', format: 'text' },
      ],
      rows: filtered.map((s) => ({
        invoiceNo: s.invoiceNo || `#${s.id}`,
        date: new Date(s.createdAt).toLocaleString('ar-EG'),
        customer: s.customer?.name || 'عميل نقدي',
        itemsCount: s.items.length,
        total: s.total,
        paid: s.paid,
        status: s.status,
        userName: s.userName || '-',
      })),
      totals: {
        invoiceNo: 'الإجمالي',
        total: filtered.reduce((sum, s) => sum + s.total, 0),
        paid: filtered.reduce((sum, s) => sum + s.paid, 0),
      },
    })
  }

  const doRefund = async (id: number) => {
    try {
      await api(`/api/sales/${id}`, { method: 'DELETE' })
      toast.success('تم ارتجاع الفاتورة')
      load(from, to)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإرجاع')
    } finally {
      setRefundId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">سجل المبيعات</h1>
          <p className="text-sm text-muted-foreground">
            استعراض الفواتير وإعادة الطباعة والإرجاع
          </p>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={sales.length === 0}>
          <FileSpreadsheet className="size-4" />
          تصدير Excel
        </Button>
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
                placeholder="بحث برقم الفاتورة..."
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
          عرض المبيعات من {from || 'البداية'} إلى {to || 'اليوم'} — {total} فاتورة
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
                    <TableHead className="w-28">رقم الفاتورة</TableHead>
                    <TableHead className="w-52">التاريخ</TableHead>
                    <TableHead className="w-40">العميل</TableHead>
                    <TableHead className="w-28">البائع</TableHead>
                    <TableHead className="w-28 text-center">الإجمالي</TableHead>
                    <TableHead className="w-28 text-center">المدفوع</TableHead>
                    <TableHead className="w-24 text-center">الباقي</TableHead>
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
                        لا توجد مبيعات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((s, index) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-center font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {s.invoiceNo ?? `#${s.id}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          <DateTimeCell date={s.createdAt} />
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
                        <TableCell className="text-muted-foreground text-xs">
                          {s.userName ?? '—'}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {formatCurrency(s.total)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatCurrency(s.paid)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-center tabular-nums font-semibold',
                            s.total - s.paid > 0 && 'text-destructive'
                          )}
                        >
                          {formatCurrency(s.total - s.paid)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {s.items.reduce((sum, it) => sum + it.quantity, 0)}
                        </TableCell>
                        <TableCell className="text-center">
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
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
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
                                title="مرتجع الفاتورة كاملة"
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

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg (لابتوب صغير،
            تابلت، موبايل). كل فاتورة بقى كارت مستقل تُعرض فيه البيانات
            الأساسية رأسيًا بدل صف عريض في جدول يحتاج سكرول أفقي ليُقرأ.
          */}
          {!loading && (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
              {filtered.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا توجد مبيعات
                </p>
              ) : (
                filtered.map((s, index) => {
                  const due = s.total - s.paid
                  const itemCount = s.items.reduce((sum, it) => sum + it.quantity, 0)
                  const isReturned = s.status === 'مرتجعة'
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'rounded-lg border bg-card p-3',
                        isReturned && 'opacity-60'
                      )}
                    >
                      {/* رأس الكارت: رقم الفاتورة + شارة الحالة */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{index + 1}
                            </span>
                            <p className="font-medium leading-tight">
                              {s.invoiceNo ?? `#${s.id}`}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <DateTimeCell date={s.createdAt} />
                          </p>
                        </div>
                        <Badge
                          variant={isReturned ? 'destructive' : 'secondary'}
                          className={
                            s.status === 'مكتملة'
                              ? 'bg-primary/10 text-primary'
                              : ''
                          }
                        >
                          {s.status}
                        </Badge>
                      </div>

                      {/* العميل والبائع */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">العميل:</span>
                        <span className="font-medium">
                          {s.customer ? s.customer.name : 'بدون عميل'}
                        </span>
                        {s.userName && (
                          <>
                            <span className="text-muted-foreground">البائع:</span>
                            <span className="font-medium">{s.userName}</span>
                          </>
                        )}
                      </div>

                      {/* شبكة البيانات: إجمالي/مدفوع/باقي + كمية/حالة */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(s.total)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">المدفوع</p>
                          <p className="tabular-nums">{formatCurrency(s.paid)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الباقي</p>
                          <p
                            className={cn(
                              'font-semibold tabular-nums',
                              due > 0 && 'text-destructive'
                            )}
                          >
                            {formatCurrency(due)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الكمية</p>
                          <p className="tabular-nums text-muted-foreground">
                            {itemCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الحالة</p>
                          <p
                            className={cn(
                              'text-xs font-medium',
                              isReturned ? 'text-destructive' : 'text-success'
                            )}
                          >
                            {s.status}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">إجراءات</p>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => reprint(s)}
                              title="إعادة طباعة"
                            >
                              <Printer className="size-3.5" />
                            </Button>
                            {!isReturned && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => setRefundId(s.id)}
                                title="مرتجع الفاتورة كاملة"
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-2">
          <p className="text-sm text-muted-foreground">
            صفحة {page} من {totalPages} — إجمالي {total} فاتورة
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page <= 1}
              onClick={() => load(from, to, page - 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const half = Math.floor(Math.min(5, totalPages) / 2)
              let start = Math.max(1, page - half)
              const end = Math.min(totalPages, start + Math.min(5, totalPages) - 1)
              start = Math.max(1, end - Math.min(5, totalPages) + 1)
              return start + i
            }).map((p) => (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="icon"
                className="size-8 text-xs"
                onClick={() => load(from, to, p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page >= totalPages}
              onClick={() => load(from, to, page + 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
      )}

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
