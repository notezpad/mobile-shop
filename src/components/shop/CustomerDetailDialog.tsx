'use client'

import * as React from 'react'
import {
  Loader2,
  Plus,
  Trash2,
  Receipt,
  Wallet,
  TrendingDown,
  TrendingUp,
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
import { formatCurrency, formatDate } from '@/lib/format'
import { DateTimeCell } from './DateTimeCell'
import { PaymentDialog } from './PaymentDialog'

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
  items: SaleItem[]
}
interface Payment {
  id: number
  amount: number
  method: string
  note: string | null
  createdAt: string
}

interface CustomerDetail {
  id: number
  name: string
  phone: string | null
  balance: number
  createdAt: string
  sales: Sale[]
  payments: Payment[]
  summary: {
    totalPurchases: number
    totalPaid: number
    totalDebt: number
    balance: number
  }
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  customerId: number | null
  customerName?: string
}

type TimelineRow =
  | {
      kind: 'sale'
      date: string
      invoiceNo: string | null
      saleId: number
      items: SaleItem[]
      total: number
      paid: number
    }
  | {
      kind: 'payment'
      date: string
      amount: number
      method: string
      note: string | null
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

export function CustomerDetailDialog({
  open,
  onOpenChange,
  customerId,
  customerName: initialName,
}: Props) {
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [tab, setTab] = React.useState('account')
  const [payOpen, setPayOpen] = React.useState(false)
  const [deletePaymentId, setDeletePaymentId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const d = await api<CustomerDetail>(`/api/customers/${customerId}`)
      setDetail(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل بيانات العميل')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  React.useEffect(() => {
    if (open && customerId) {
      load()
      setTab('account')
    } else if (!open) {
      setDetail(null)
    }
  }, [open, customerId, load])

  // 🛡️ ROOT FIX (2026-09-27): stay live while open — e.g. if a payment for
  // this same customer is somehow recorded elsewhere while this dialog is
  // open, or after an offline-queued payment finally syncs.
  useDataRefresh(['customers'], load, open && !!customerId)

  const balance = detail?.balance ?? 0
  const balanceTone =
    balance > 0 ? 'text-destructive' : balance < 0 ? 'text-success-subtle-foreground' : 'text-foreground'

  const timeline: TimelineRow[] = React.useMemo(() => {
    if (!detail) return []
    const salesRows: TimelineRow[] = detail.sales.map((s) => ({
      kind: 'sale' as const,
      date: s.createdAt,
      invoiceNo: s.invoiceNo,
      saleId: s.id,
      items: s.items,
      total: s.total,
      paid: s.paid,
    }))
    const paymentRows: TimelineRow[] = detail.payments.map((p) => ({
      kind: 'payment' as const,
      date: p.createdAt,
      amount: p.amount,
      method: p.method,
      note: p.note,
    }))
    return [...salesRows, ...paymentRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [detail])

  const confirmDelete = async () => {
    if (!deletePaymentId) return
    setDeleting(true)
    try {
      await api(`/api/payments/${deletePaymentId}`, { method: 'DELETE' })
      toast.success('تم حذف الدفعة')
      setDeletePaymentId(null)
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden bg-background p-0 sm:max-w-4xl">
        <DialogHeader className="border-b bg-background px-6 pt-6 pb-4">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xl font-bold">
                {detail?.name ?? initialName ?? '—'}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {detail?.phone ? (
                  <span dir="ltr">{detail.phone}</span>
                ) : (
                  'لا يوجد رقم هاتف'
                )}
              </span>
            </div>
            <div className="text-left">
              <p className="text-[11px] font-medium text-muted-foreground">الرصيد الحالي</p>
              <p className={`text-2xl font-extrabold tabular-nums ${balanceTone}`}>
                {formatCurrency(balance)}
              </p>
              {balance > 0 ? (
                <span className="text-[11px] text-destructive">مدين</span>
              ) : balance < 0 ? (
                <span className="text-[11px] text-success-subtle-foreground">له رصيد دائن</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">مسوّى</span>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            كشف حساب العميل مع المبيعات والدفعات
          </DialogDescription>
        </DialogHeader>

        {/* 🛡️ 2026-09-15: Added relative + z-[1] to ensure content stays
            above background page elements (fixes "items inside each other"
            visual bug where background table text bleeds through). */}
        <div className="relative z-[1] max-h-[calc(90vh-110px)] overflow-y-auto bg-background px-6 pb-6">
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
              <TabsList className="mb-3 w-full">
                <TabsTrigger value="account" className="flex-1">
                  <Receipt className="size-4" />
                  كشف حساب
                </TabsTrigger>
                <TabsTrigger value="sales" className="flex-1">
                  المبيعات
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex-1">
                  الدفعات
                </TabsTrigger>
              </TabsList>

              {/* ===== Account Summary Tab ===== */}
              <TabsContent value="account" className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatBox
                    icon={TrendingUp}
                    label="إجمالي المشتريات"
                    value={formatCurrency(detail.summary.totalPurchases)}
                  />
                  <StatBox
                    icon={Wallet}
                    label="إجمالي المدفوع"
                    value={formatCurrency(detail.summary.totalPaid)}
                    tone="success"
                  />
                  <StatBox
                    icon={TrendingDown}
                    label="الرصيد الحالي"
                    value={formatCurrency(detail.balance)}
                    tone={detail.balance > 0 ? 'danger' : 'success'}
                  />
                </div>

                {/* 🛡️ 2026-09-15: Card-based timeline instead of table —
                    prevents column overlap on narrow dialogs. */}
                <div className="space-y-2">
                  {timeline.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حركات</p>
                  ) : (
                    timeline.map((row, i) => {
                      if (row.kind === 'sale') {
                        const itemsText = row.items
                          .map((it) => `${it.name}×${it.quantity}`)
                          .join('، ')
                        const debt = Math.max(0, row.total - row.paid)
                        return (
                          <div
                            key={`s-${row.saleId}-${i}`}
                            className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                          >
                            {/* Type badge */}
                            <Badge
                              variant="outline"
                              className="mt-0.5 shrink-0 bg-info-subtle text-info-subtle-foreground border-info-subtle"
                            >
                              بيع
                            </Badge>
                            {/* Details */}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm">
                                <span className="font-medium">{row.invoiceNo ?? `#${row.saleId}`}</span>
                                <span className="text-muted-foreground"> — {itemsText}</span>
                              </p>
                              {row.paid > 0 && (
                                <p className="mt-0.5 text-xs text-success-subtle-foreground">
                                  دفع كاش: {formatCurrency(row.paid)}
                                </p>
                              )}
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                <DateTimeCell date={row.date} />
                              </p>
                            </div>
                            {/* Amount — right side, never overlaps */}
                            <div className="shrink-0 text-left">
                              {debt > 0 ? (
                                <span className="inline-block rounded-md bg-destructive/10 px-2 py-1 text-sm font-bold tabular-nums text-destructive whitespace-nowrap">
                                  {formatCurrency(debt)}
                                </span>
                              ) : (
                                <span className="inline-block rounded-md bg-muted px-2 py-1 text-sm font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                                  مسوّى
                                </span>
                              )}
                              <p className="mt-1 text-[10px] text-muted-foreground">مدين</p>
                            </div>
                          </div>
                        )
                      }
                      // payment row
                      return (
                        <div
                          key={`p-${i}`}
                          className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                        >
                          <Badge
                            variant="outline"
                            className="mt-0.5 shrink-0 bg-success-subtle text-success-subtle-foreground border-success-subtle"
                          >
                            دفعة
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span
                                className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${methodBadgeClass(
                                  row.method
                                )}`}
                              >
                                {METHOD_LABELS[row.method] || row.method}
                              </span>
                              {row.note && (
                                <span className="text-muted-foreground"> — {row.note}</span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              <DateTimeCell date={row.date} />
                            </p>
                          </div>
                          <div className="shrink-0 text-left">
                            <span className="inline-block rounded-md bg-success-subtle px-2 py-1 text-sm font-bold tabular-nums text-success-subtle-foreground whitespace-nowrap">
                              {formatCurrency(row.amount)}
                            </span>
                            <p className="mt-1 text-[10px] text-muted-foreground">دائن</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </TabsContent>

              {/* ===== Sales Tab ===== */}
              <TabsContent value="sales">
                <Card className="overflow-hidden py-0">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" dir="ltr">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[80px] w-[80px]">الفاتورة</TableHead>
                            <TableHead className="min-w-[180px] w-[180px] whitespace-nowrap">التاريخ</TableHead>
                            <TableHead className="min-w-[80px] w-[80px] text-center whitespace-nowrap">الأصناف</TableHead>
                            <TableHead className="min-w-[90px] w-[90px] text-center whitespace-nowrap">الإجمالي</TableHead>
                            <TableHead className="min-w-[90px] w-[90px] text-center whitespace-nowrap">المدفوع</TableHead>
                            <TableHead className="min-w-[80px] w-[80px] text-center">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.sales.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="py-8 text-center text-muted-foreground"
                              >
                                لا توجد مبيعات
                              </TableCell>
                            </TableRow>
                          ) : (
                            detail.sales.map((s) => (
                              <TableRow key={s.id}>
                                <TableCell className="font-medium">
                                  {s.invoiceNo ?? `#${s.id}`}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  <DateTimeCell date={s.createdAt} />
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {s.items.length}
                                </TableCell>
                                <TableCell className="text-center font-semibold tabular-nums">
                                  {formatCurrency(s.total)}
                                </TableCell>
                                <TableCell className="text-center tabular-nums text-success-subtle-foreground">
                                  {formatCurrency(s.paid)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant={
                                      s.status === 'مرتجعة'
                                        ? 'destructive'
                                        : 'secondary'
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
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ===== Payments Tab ===== */}
              <TabsContent value="payments" className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    إجمالي الدفعات:{' '}
                    <span className="font-semibold text-success-subtle-foreground tabular-nums">
                      {formatCurrency(
                        detail.payments.reduce((s, p) => s + p.amount, 0)
                      )}
                    </span>
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setPayOpen(true)}
                    disabled={!detail}
                  >
                    <Plus className="size-4" />
                    تسجيل دفعة
                  </Button>
                </div>
                <Card className="overflow-hidden py-0">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" dir="ltr">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[160px] w-[160px] whitespace-nowrap">التاريخ</TableHead>
                            <TableHead className="min-w-[90px] w-[90px] text-center whitespace-nowrap">المبلغ</TableHead>
                            <TableHead className="min-w-[90px] w-[90px] text-center whitespace-nowrap">الطريقة</TableHead>
                            <TableHead className="min-w-[100px] w-[100px]">ملاحظات</TableHead>
                            <TableHead className="min-w-[60px] w-[60px] text-center">إجراء</TableHead>
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
                              <TableRow key={p.id}>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                  <DateTimeCell date={p.createdAt} />
                                </TableCell>
                                <TableCell className="text-center font-semibold tabular-nums text-success-subtle-foreground">
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
                                  {p.note ?? '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setDeletePaymentId(p.id)}
                                    title="حذف الدفعة"
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
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Payment dialog nested */}
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          customerId={customerId}
          customerName={detail?.name ?? initialName ?? ''}
          currentBalance={detail?.balance ?? 0}
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
              <AlertDialogTitle>تأكيد حذف الدفعة</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إلغاء الدفعة وإرجاع المبلغ لرصيد العميل وعكس القيود في الخزنة.
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
                حذف
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
