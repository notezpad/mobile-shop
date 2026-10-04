'use client'

import * as React from 'react'
import {
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  Receipt,
  Wallet,
  TrendingDown,
  TrendingUp,
  Undo2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { useDataRefresh } from '@/lib/offline/data-events'
import { useShopStore } from '@/lib/store'
import { formatCurrency, formatDate } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { SupplierPaymentDialog } from './SupplierPaymentDialog'
import { PurchaseOrderDialog } from './PurchaseOrderDialog'
import { PurchaseReturnDialog } from './PurchaseReturnDialog'

// 🎨 هوية صفحة الموردين (stone + orange) على التاب النشط — نفس بصمة باقي دايلوجات الصفحة
const TAB_TRIGGER_CLS =
  'flex-1 rounded-lg ' +
  'data-[state=active]:border-orange-200 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 ' +
  'dark:data-[state=active]:border-orange-500/30 dark:data-[state=active]:bg-orange-500/15 dark:data-[state=active]:text-orange-300'

const METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محافظ إلكترونية',
  instapay: 'انستاباي',
  fawry: 'محفظة إلكترونية',
}

function methodBadgeClass(method: string): string {
  switch (method) {
    case 'cash':
      return 'bg-success-subtle text-success-subtle-foreground border-success-subtle'
    case 'vodafone_cash':
      return 'bg-destructive-subtle text-destructive-subtle-foreground border-red-200'
    case 'instapay':
      return 'bg-info-subtle text-info-subtle-foreground border-info-subtle'
    case 'fawry':
      return 'bg-warning-subtle text-warning-subtle-foreground border-warning-subtle'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

interface OrderItem {
  id: number
  name: string
  cost: number
  quantity: number
  returnedQty?: number
}
interface PurchaseOrder {
  id: number
  orderNo: string | null
  total: number
  paid: number
  paymentMethod?: string | null
  refunded?: number
  status: string
  createdAt: string
  returnedValue?: number
  items: OrderItem[]
}
interface Payment {
  id: number
  amount: number
  method: string
  note: string | null
  status?: string // 'active' | 'cancelled'
  cancelledAt?: string | null
  createdAt: string
}

interface SupplierDetail {
  id: number
  name: string
  phone: string | null
  balance: number
  createdAt: string
  purchaseOrders: PurchaseOrder[]
  payments: Payment[]
  summary: {
    totalPurchases: number // صافي بعد المرتجعات
    totalReturns: number
    totalPaid: number
    totalDebt: number
    balance: number
  }
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  supplierId: number | null
  supplierName?: string
}

type TimelineRow =
  | {
      kind: 'purchase'
      date: string
      orderNo: string | null
      orderId: number
      items: OrderItem[]
      total: number
      paid: number
      refunded: number
      returnedValue: number
      status: string
    }
  | {
      kind: 'payment'
      date: string
      amount: number
      method: string
      note: string | null
    }


/** ملخص أصناف الحركة: أول صنفين + عدّاد الباقي (فواتير الجملة فيها ٣٠–٥٠ صنف) */
function itemsPreview(items: { name: string; quantity: number }[]): string {
  const head = items.slice(0, 2).map((it) => `${it.name}×${it.quantity}`).join('، ')
  if (items.length <= 2) return head
  const pieces = items.reduce((n, it) => n + it.quantity, 0)
  return `${head} +${items.length - 2} صنف (${items.length} صنف · ${pieces} قطعة)`
}

function StatBox({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: 'default' | 'success' | 'danger'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success-subtle-foreground bg-success-subtle border-success-subtle'
      : tone === 'danger'
        ? 'text-destructive bg-destructive/5 border-destructive/20'
        : 'text-foreground bg-muted/40 border-border'
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 opacity-70" />
        <p className="text-xs font-medium opacity-80">{label}</p>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

export function SupplierDetailDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName: initialName,
}: Props) {
  const role = useShopStore((s) => s.user?.role)
  const canCancelPayment = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const [detail, setDetail] = React.useState<SupplierDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [tab, setTab] = React.useState('account')
  const [payOpen, setPayOpen] = React.useState(false)
  const [newOrderOpen, setNewOrderOpen] = React.useState(false)
  const [deletePaymentId, setDeletePaymentId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [returnOrderId, setReturnOrderId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    if (!supplierId) return
    setLoading(true)
    try {
      const d = await api<SupplierDetail>(`/api/suppliers/${supplierId}`)
      setDetail(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل بيانات المورد')
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  React.useEffect(() => {
    if (open && supplierId) {
      load()
      setTab('account')
    } else if (!open) {
      setDetail(null)
    }
  }, [open, supplierId, load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['suppliers'], load, open && !!supplierId)

  const balance = detail?.balance ?? 0

  const timeline: TimelineRow[] = React.useMemo(() => {
    if (!detail) return []
    const purchaseRows: TimelineRow[] = detail.purchaseOrders.map((o) => ({
      kind: 'purchase' as const,
      date: o.createdAt,
      orderNo: o.orderNo,
      orderId: o.id,
      items: o.items,
      total: o.total,
      paid: o.paid,
      refunded: o.refunded ?? 0,
      returnedValue: o.returnedValue ?? 0,
      status: o.status,
    }))
    const paymentRows: TimelineRow[] = detail.payments
      .filter((p) => p.status !== 'cancelled')
      .map((p) => ({
      kind: 'payment' as const,
      date: p.createdAt,
      amount: p.amount,
      method: p.method,
      note: p.note,
      }))
    return [...purchaseRows, ...paymentRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [detail])

  const confirmDelete = async () => {
    if (!deletePaymentId) return
    setDeleting(true)
    try {
      await api(`/api/supplier-payments/${deletePaymentId}`, { method: 'DELETE' })
      toast.success('تم إلغاء الدفعة')
      setDeletePaymentId(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل إلغاء الدفعة')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden bg-background p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-5xl"
      >
        {/* ═════════ الهيدر: هوية الموردين (حجري غامق + برتقالي) — نفس تركيبة supplier-dialog-ui ═════════ */}
        <DialogHeader className="relative shrink-0 gap-0 border-b border-stone-800 bg-stone-900 px-4 pb-4 pt-4 text-start text-stone-50 sm:px-6 sm:pt-5">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-stone-700/70 text-lg font-extrabold text-white ring-1 ring-orange-600/60">
                {(detail?.name ?? initialName ?? '—').trim().charAt(0) || '?'}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-lg font-extrabold text-stone-50 sm:text-xl">
                  {detail?.name ?? initialName ?? '—'}
                </span>
                <span className="flex items-center gap-1 text-xs font-normal text-stone-300/80">
                  {detail?.phone ? (
                    <span dir="ltr" className="tabular-nums">{detail.phone}</span>
                  ) : (
                    'لا يوجد رقم هاتف'
                  )}
                </span>
              </div>
            </div>
            <div className="min-w-[150px] rounded-2xl bg-stone-800/80 px-4 py-2.5 ring-1 ring-orange-600/50">
              <p className="text-[11px] font-medium text-stone-300/80">المستحق حالياً</p>
              <p
                className={`text-xl font-extrabold tabular-nums sm:text-2xl ${
                  balance > 0
                    ? 'text-orange-300'
                    : balance < 0
                      ? 'text-emerald-300'
                      : 'text-stone-100'
                }`}
              >
                {formatCurrency(balance)}
              </p>
              {balance > 0 ? (
                <span className="text-[11px] font-semibold text-orange-300/90">لنا آجل عليه</span>
              ) : balance < 0 ? (
                <span className="text-[11px] font-semibold text-emerald-300/90">دفعنا زيادة</span>
              ) : (
                <span className="text-[11px] text-stone-300/70">مسوّى</span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            كشف حساب المورد مع أوامر الشراء والدفعات
          </DialogDescription>
          {/* خط برتقالي مائل — بصمة هوية الموردين (زي باقي دايلوجات الصفحة) */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(-45deg,rgba(234,88,12,.85)_0_6px,transparent_6px_12px)]"
          />
        </DialogHeader>

        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-4 pb-6 sm:px-6">
          {loading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !detail ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              لا توجد بيانات
            </p>
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="sticky top-0 z-10 mb-3 h-11 w-full rounded-xl border bg-muted/60 p-1 backdrop-blur">
                <TabsTrigger value="account" className={TAB_TRIGGER_CLS}>
                  <Receipt className="size-4" />
                  كشف حساب
                </TabsTrigger>
                <TabsTrigger value="orders" className={TAB_TRIGGER_CLS}>
                  <ClipboardList className="size-4" />
                  أوامر الشراء
                </TabsTrigger>
                <TabsTrigger value="payments" className={TAB_TRIGGER_CLS}>
                  <Wallet className="size-4" />
                  الدفعات
                </TabsTrigger>
              </TabsList>

              {/* ===== Account Summary Tab ===== */}
              <TabsContent value="account" className="space-y-3">
                {/* 🛡️ 2026-09-30: الأرقام صافية بعد المرتجعات والمستردات — بتطابق الرصيد */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  <StatBox
                    icon={TrendingUp}
                    label="إجمالي المشتريات"
                    value={formatCurrency(detail.summary.totalPurchases)}
                  />
                  <StatBox
                    icon={Undo2}
                    label="إجمالي المرتجعات"
                    value={formatCurrency(detail.summary.totalReturns)}
                  />
                  <StatBox
                    icon={Wallet}
                    label="إجمالي المدفوع"
                    value={formatCurrency(detail.summary.totalPaid)}
                    tone="success"
                  />
                  <StatBox
                    icon={TrendingDown}
                    label="المستحق حالياً"
                    value={formatCurrency(detail.balance)}
                    tone={detail.balance > 0 ? 'danger' : 'success'}
                  />
                </div>

                <Card className="hidden overflow-hidden py-0 md:block">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" dir="ltr">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-52">التاريخ</TableHead>
                            <TableHead className="w-20">النوع</TableHead>
                            <TableHead>التفاصيل</TableHead>
                            <TableHead className="w-28 text-center">علينا</TableHead>
                            <TableHead className="w-28 text-center">دفعنا</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {timeline.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="py-8 text-center text-muted-foreground"
                              >
                                لا توجد حركات
                              </TableCell>
                            </TableRow>
                          ) : (
                            timeline.map((row, i) => {
                              if (row.kind === 'purchase') {
                                const itemsText = itemsPreview(row.items)
                                // 🛡️ علينا = صافي الفاتورة بعد المرتجعات − الصافي المدفوع فعلاً
                                const paidNet = Math.max(0, row.paid - row.refunded)
                                const debt = Math.max(
                                  0,
                                  row.total - row.returnedValue - paidNet,
                                )
                                return (
                                  <TableRow key={`o-${row.orderId}-${i}`}>
                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                      <DateTimeCell date={row.date} />
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className="bg-info-subtle text-info-subtle-foreground border-info-subtle"
                                      >
                                        شراء
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      <span className="font-medium">
                                        {row.orderNo ?? `#${row.orderId}`}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {' '}
                                        — {itemsText}
                                      </span>
                                      {row.paid > 0 && (
                                        <span className="text-xs text-success-subtle-foreground">
                                          {' '}
                                          (دفعنا كاش: {formatCurrency(row.paid)})
                                        </span>
                                      )}
                                      {row.returnedValue > 0 && (
                                        <span className="text-xs text-info-subtle-foreground">
                                          {' '}
                                          (مرتجع: {formatCurrency(row.returnedValue)})
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center font-semibold tabular-nums text-destructive">
                                      {formatCurrency(debt)}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums text-muted-foreground">
                                      —
                                    </TableCell>
                                  </TableRow>
                                )
                              }
                              // payment row
                              return (
                                <TableRow key={`p-${i}`}>
                                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                    <DateTimeCell date={row.date} />
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className="bg-success-subtle text-success-subtle-foreground border-success-subtle"
                                    >
                                      دفعة
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <span
                                      className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${methodBadgeClass(
                                        row.method
                                      )}`}
                                    >
                                      {METHOD_LABELS[row.method] || row.method}
                                    </span>
                                    {row.note && (
                                      <span className="text-muted-foreground">
                                        {' '}
                                        — {row.note}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground">
                                    —
                                  </TableCell>
                                  <TableCell className="text-center font-semibold tabular-nums text-success-subtle-foreground">
                                    {formatCurrency(row.amount)}
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                {/* موبايل: كروت بدل الجدول */}
                <div className="space-y-2 md:hidden">
                  {timeline.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حركات</p>
                  ) : (
                    timeline.map((row, i) => {
                      if (row.kind === 'purchase') {
                        const itemsText = itemsPreview(row.items)
                        // 🛡️ علينا = صافي الفاتورة بعد المرتجعات − الصافي المدفوع فعلاً
                        const paidNet = Math.max(0, row.paid - row.refunded)
                        const debt = Math.max(0, row.total - row.returnedValue - paidNet)
                        return (
                          <div key={`mo-${row.orderId}-${i}`} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                            <Badge variant="outline" className="mt-0.5 shrink-0 bg-info-subtle text-info-subtle-foreground border-info-subtle">
                              شراء
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm">
                                <span className="font-medium">{row.orderNo ?? `#${row.orderId}`}</span>
                                <span className="text-muted-foreground"> — {itemsText}</span>
                              </p>
                              {row.paid > 0 && (
                                <p className="mt-0.5 text-xs text-success-subtle-foreground">
                                  دفعنا كاش: {formatCurrency(row.paid)}
                                </p>
                              )}
                              {row.returnedValue > 0 && (
                                <p className="mt-0.5 text-xs text-info-subtle-foreground">
                                  مرتجع: {formatCurrency(row.returnedValue)}
                                </p>
                              )}
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                <DateTimeCell date={row.date} />
                              </p>
                            </div>
                            <div className="shrink-0 text-left">
                              <span className="inline-block whitespace-nowrap rounded-md bg-destructive/10 px-2 py-1 text-sm font-bold tabular-nums text-destructive">
                                {formatCurrency(debt)}
                              </span>
                              <p className="mt-1 text-[10px] text-muted-foreground">علينا</p>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={`mp-${i}`} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                          <Badge variant="outline" className="mt-0.5 shrink-0 bg-success-subtle text-success-subtle-foreground border-success-subtle">
                            دفعة
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${methodBadgeClass(row.method)}`}>
                                {METHOD_LABELS[row.method] || row.method}
                              </span>
                              {row.note && <span className="text-muted-foreground"> — {row.note}</span>}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              <DateTimeCell date={row.date} />
                            </p>
                          </div>
                          <div className="shrink-0 text-left">
                            <span className="inline-block whitespace-nowrap rounded-md bg-success-subtle px-2 py-1 text-sm font-bold tabular-nums text-success-subtle-foreground">
                              {formatCurrency(row.amount)}
                            </span>
                            <p className="mt-1 text-[10px] text-muted-foreground">دفعنا</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </TabsContent>

              {/* ===== Purchase Orders Tab ===== */}
              <TabsContent value="orders" className="space-y-3">
                <div className="flex items-center justify-end">
                  <Button size="sm" onClick={() => setNewOrderOpen(true)}>
                    <Plus className="size-4" />
                    أمر شراء جديد
                  </Button>
                </div>
                <Card className="hidden overflow-hidden py-0 md:block">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" dir="ltr">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>الأمر</TableHead>
                            <TableHead className="w-52">التاريخ</TableHead>
                            <TableHead className="w-28 text-center">عدد الأصناف</TableHead>
                            <TableHead className="w-28 text-center">الإجمالي</TableHead>
                            <TableHead className="w-28 text-center">المدفوع</TableHead>
                            <TableHead className="w-24 text-center">الحالة</TableHead>
                            <TableHead className="w-16 text-center">مرتجع</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.purchaseOrders.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={7}
                                className="py-8 text-center text-muted-foreground"
                              >
                                لا توجد أوامر شراء
                              </TableCell>
                            </TableRow>
                          ) : (
                            detail.purchaseOrders.map((o) => (
                              <TableRow key={o.id}>
                                <TableCell className="font-medium">
                                  {o.orderNo ?? `#${o.id}`}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  <DateTimeCell date={o.createdAt} />
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {o.items.length}
                                </TableCell>
                                <TableCell className="text-center font-semibold tabular-nums">
                                  {formatCurrency(o.total)}
                                </TableCell>
                                <TableCell className="text-center tabular-nums text-success-subtle-foreground">
                                  {formatCurrency(o.paid)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant={
                                      o.status === 'مرتجعة' ? 'destructive' : 'secondary'
                                    }
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
                                      onClick={() => setReturnOrderId(o.id)}
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
                  </CardContent>
                </Card>
                {/* موبايل: كروت بدل الجدول */}
                <div className="space-y-2 md:hidden">
                  {detail.purchaseOrders.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">لا توجد أوامر شراء</p>
                  ) : (
                    detail.purchaseOrders.map((o) => (
                      <div key={o.id} className="rounded-lg border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{o.orderNo ?? `#${o.id}`}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              <DateTimeCell date={o.createdAt} />
                            </p>
                          </div>
                          <Badge
                            variant={o.status === 'مرتجعة' ? 'destructive' : 'secondary'}
                            className={o.status === 'مكتملة' ? 'bg-primary/10 text-primary' : ''}
                          >
                            {o.status}
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                          <div>
                            <p className="text-muted-foreground">الأصناف</p>
                            <p className="font-semibold tabular-nums">{o.items.length}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">الإجمالي</p>
                            <p className="font-semibold tabular-nums">{formatCurrency(o.total)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">المدفوع</p>
                            <p className="font-semibold tabular-nums text-success-subtle-foreground">{formatCurrency(o.paid)}</p>
                          </div>
                        </div>
                        {o.status !== 'مرتجعة' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full text-destructive hover:text-destructive"
                            onClick={() => setReturnOrderId(o.id)}
                          >
                            <RotateCcw className="size-3.5" />
                            مرتجع للمورد
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* ===== Payments Tab ===== */}
              <TabsContent value="payments" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    إجمالي الدفعات:{' '}
                    <span className="font-semibold text-success-subtle-foreground tabular-nums">
                      {formatCurrency(
                        detail.payments
                          .filter((p) => p.status !== 'cancelled')
                          .reduce((s, p) => s + p.amount, 0)
                      )}
                    </span>
                  </p>
                  <Button size="sm" onClick={() => setPayOpen(true)} disabled={!detail}>
                    <Plus className="size-4" />
                    تسجيل دفعة
                  </Button>
                </div>
                <Card className="hidden overflow-hidden py-0 md:block">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" dir="ltr">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-52">التاريخ</TableHead>
                            <TableHead className="w-28 text-center">المبلغ</TableHead>
                            <TableHead className="w-28 text-center">الطريقة</TableHead>
                            <TableHead>ملاحظات</TableHead>
                            <TableHead className="w-20 text-center">إجراء</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.payments.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="py-8 text-center text-muted-foreground"
                              >
                                لا توجد دفعات — سجّل أول دفعة الآن
                              </TableCell>
                            </TableRow>
                          ) : (
                            detail.payments.map((p) => (
                              <TableRow key={p.id} className={p.status === 'cancelled' ? 'opacity-60' : undefined}>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  <DateTimeCell date={p.createdAt} />
                                </TableCell>
                                <TableCell className={`text-center font-semibold tabular-nums ${p.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-success-subtle-foreground'}`}>
                                  {formatCurrency(p.amount)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span
                                    className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${methodBadgeClass(
                                      p.method
                                    )}`}
                                  >
                                    {METHOD_LABELS[p.method] || p.method}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {p.status === 'cancelled' && (
                                    <Badge variant="outline" className="me-2 border-destructive/40 text-destructive">
                                      ملغية
                                    </Badge>
                                  )}
                                  {p.note ?? '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  {canCancelPayment && p.status !== 'cancelled' && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => setDeletePaymentId(p.id)}
                                      title="إلغاء الدفعة"
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                {/* موبايل: كروت بدل الجدول */}
                <div className="space-y-2 md:hidden">
                  {detail.payments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      لا توجد دفعات — سجّل أول دفعة الآن
                    </p>
                  ) : (
                    detail.payments.map((p) => (
                      <div key={p.id} className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${p.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${methodBadgeClass(p.method)}`}
                            >
                              {METHOD_LABELS[p.method] || p.method}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              <DateTimeCell date={p.createdAt} />
                            </span>
                            {p.status === 'cancelled' && (
                              <Badge variant="outline" className="border-destructive/40 text-destructive">
                                ملغية
                              </Badge>
                            )}
                          </div>
                          {p.note && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">{p.note}</p>
                          )}
                        </div>
                        <span className={`shrink-0 text-sm font-bold tabular-nums ${p.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-success-subtle-foreground'}`}>
                          {formatCurrency(p.amount)}
                        </span>
                        {canCancelPayment && p.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeletePaymentId(p.id)}
                            title="إلغاء الدفعة"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Payment dialog nested */}
        <SupplierPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          supplierId={supplierId}
          supplierName={detail?.name ?? initialName ?? ''}
          currentBalance={detail?.balance ?? 0}
          onSaved={() => {
            load()
          }}
        />

        {/* Purchase return (partial / full) nested */}
        <PurchaseReturnDialog
          open={returnOrderId !== null}
          onOpenChange={(o) => {
            if (!o) setReturnOrderId(null)
          }}
          order={detail?.purchaseOrders.find((o) => o.id === returnOrderId) ?? null}
          hasSupplier={true}
          onDone={() => {
            load()
          }}
        />

        {/* New purchase order dialog nested */}
        <PurchaseOrderDialog
          open={newOrderOpen}
          onOpenChange={setNewOrderOpen}
          defaultSupplierId={supplierId}
          onSaved={() => {
            load()
          }}
        />

        {/* Delete confirm */}
        <AlertDialog
          open={deletePaymentId !== null}
          onOpenChange={(o) => !o && setDeletePaymentId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد إلغاء الدفعة</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم تعليم الدفعة "ملغية" (تفضل ظاهرة في السجل) وإرجاع المبلغ لحساب المورد وعكس قيد الخزنة بنفس طريقة الدفع.
                لا يمكن التراجع عن هذا الإجراء.
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
                إلغاء الدفعة
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 🛡️ 2026-09-13: Close button (replaces the X icon we removed). */}
        <div className="flex justify-end border-t px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
