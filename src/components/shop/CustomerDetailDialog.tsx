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
  ShoppingBag,
  Phone,
  HandCoins,
  Scale,
  Check,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
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
import { formatCurrency } from '@/lib/format'
import { useShopStore } from '@/lib/store'
import { DateTimeCell } from './DateTimeCell'
import { PaymentDialog } from './PaymentDialog'
import { BalanceAdjustDialog } from './BalanceAdjustDialog'

// 🎨 هوية صفحة العملاء (sky) على التاب النشط — نفس بصمة باقي دايلوجات الصفحة
const TAB_TRIGGER_CLS =
  'group h-11 flex-1 gap-2 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-sm font-bold text-muted-foreground shadow-none ' +
  'hover:text-foreground ' +
  'data-[state=active]:border-sky-600 data-[state=active]:bg-sky-500/[0.06] data-[state=active]:text-sky-700 data-[state=active]:shadow-none ' +
  'dark:data-[state=active]:border-sky-400 dark:data-[state=active]:bg-sky-500/10 dark:data-[state=active]:text-sky-300'

const TAB_COUNT_CLS =
  'rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-black leading-none tabular-nums text-muted-foreground ' +
  'group-data-[state=active]:bg-sky-600 group-data-[state=active]:text-white'

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
      return 'bg-destructive-subtle text-destructive-subtle-foreground border-transparent'
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
  /** 🎨 اللون/المقاس لو السطر على variant */
  variantLabel?: string | null
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

// 🆕 2026-10-22: قيود الرصيد الافتتاحي والتسويات
interface BalanceEntryLite {
  id: number
  delta: number
  reason: string
  createdBy: string | null
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
  balanceEntries?: BalanceEntryLite[]
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
  | {
      kind: 'entry'
      date: string
      delta: number
      reason: string
      createdBy: string | null
    }

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })


/** ملخص أصناف الحركة: أول صنفين + عدّاد الباقي (فواتير الجملة فيها ٣٠–٥٠ صنف) */
function itemsPreview(items: { name: string; quantity: number; variantLabel?: string | null }[]): string {
  const head = items
    .slice(0, 2)
    .map((it) => `${it.name}${it.variantLabel ? ` — ${it.variantLabel}` : ''}×${it.quantity}`)
    .join('، ')
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
  const color = tone === 'success' ? '#10b981' : tone === 'danger' ? '#f43f5e' : '#0ea5e9'
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1c`, color }}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-lg font-extrabold leading-tight tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  )
}

/** أيقونة نوع الحركة داخل مربع ملوّن */
function KindIcon({ kind }: { kind: 'sale' | 'payment' | 'entry' }) {
  const color = kind === 'sale' ? '#0ea5e9' : kind === 'payment' ? '#10b981' : '#8b5cf6'
  const Icon = kind === 'sale' ? ShoppingBag : kind === 'payment' ? HandCoins : Scale
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
      style={{ backgroundColor: `${color}1c`, color }}
    >
      <Icon className="size-5" />
    </span>
  )
}

const colorOf = (name: string) => {
  const colors = ['#0ea5e9', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#f97316']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
      <Receipt className="size-6 opacity-50" />
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === 'مرتجعة' ? 'danger' : status === 'مكتملة' ? 'success' : 'secondary'}
      size="sm"
    >
      {status}
    </Badge>
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
  // 🆕 2026-10-22: تسوية الرصيد (أدمن فقط)
  const [adjustOpen, setAdjustOpen] = React.useState(false)
  const role = useShopStore((s) => s.user?.role)
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'
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
    // 🆕 2026-10-22: قيود الرصيد الافتتاحي والتسويات — أول القيود الموثقة للحساب
    const entryRows: TimelineRow[] = (detail.balanceEntries ?? []).map((b) => ({
      kind: 'entry' as const,
      date: b.createdAt,
      delta: b.delta,
      reason: b.reason,
      createdBy: b.createdBy,
    }))
    return [...salesRows, ...paymentRows, ...entryRows].sort(
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

  const avatarColor = colorOf(detail?.name ?? initialName ?? '')
  const displayName = detail?.name ?? initialName ?? '—'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden bg-background p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl"
      >
        {/* ═════════ الهيدر: هوية العملاء (سماوي) + بطاقة الرصيد ═════════
            التدرج سماوي بهوية صفحة العملاء (زي دايلوج "عميل جديد" و"تسجيل دفعة")
            — اللون المميز للعميل نفسه بيفضل على الأفاتار فقط، عشان الهيدر
            ميتعارضش مع هوية الصفحة مهما كان لون العميل. */}
        <DialogHeader
          className="shrink-0 border-b border-sky-500/20 p-4 text-start sm:p-6"
          style={{
            background:
              'linear-gradient(135deg, rgba(14,165,233,0.16), rgba(14,165,233,0.04) 70%)',
          }}
        >
          <DialogTitle className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className="flex size-16 shrink-0 items-center justify-center rounded-3xl text-2xl font-extrabold text-white ring-4 ring-background"
                style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}bb)`, boxShadow: `0 10px 24px -8px ${avatarColor}99` }}
              >
                {displayName.trim().charAt(0) || '?'}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-lg font-extrabold sm:text-xl">{displayName}</span>
                <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <Phone className="size-3" />
                  {detail?.phone ? (
                    <span dir="ltr" className="tabular-nums">{detail.phone}</span>
                  ) : (
                    'لا يوجد رقم هاتف'
                  )}
                </span>
              </div>
            </div>

            <div
              className={cn(
                'min-w-[150px] rounded-2xl border px-4 py-2.5 text-start',
                balance > 0
                  ? 'border-rose-500/25 bg-rose-500/5'
                  : balance < 0
                    ? 'border-sky-500/25 bg-sky-500/5'
                    : 'bg-muted/40',
              )}
            >
              <p className="text-[11px] font-medium text-muted-foreground">الرصيد الحالي</p>
              <div className="flex items-baseline gap-1.5">
                <span className={cn('text-2xl font-extrabold tabular-nums sm:text-3xl', balanceTone)}>
                  {formatCurrency(balance)}
                </span>
              </div>
              {balance > 0 ? (
                <Badge variant="danger" size="sm" className="mt-1">مدين</Badge>
              ) : balance < 0 ? (
                <Badge variant="info" size="sm" className="mt-1">له رصيد دائن</Badge>
              ) : (
                <Badge variant="secondary" size="sm" className="mt-1">مسوّى</Badge>
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
        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-4 pb-6 pt-0 sm:px-6">
          {loading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !detail ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              لا توجد بيانات
            </p>
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="sticky top-0 z-20 -mx-4 mb-4 flex h-auto w-[calc(100%+2rem)] items-stretch gap-0 rounded-none border-b bg-background p-0 px-4 pt-3 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6">
                <TabsTrigger value="account" className={TAB_TRIGGER_CLS}>
                  <Receipt className="size-4" />
                  كشف حساب
                  <span className={TAB_COUNT_CLS}>{timeline.length}</span>
                </TabsTrigger>
                <TabsTrigger value="sales" className={TAB_TRIGGER_CLS}>
                  <ShoppingBag className="size-4" />
                  المبيعات
                  <span className={TAB_COUNT_CLS}>{detail.sales.length}</span>
                </TabsTrigger>
                <TabsTrigger value="payments" className={TAB_TRIGGER_CLS}>
                  <Wallet className="size-4" />
                  الدفعات
                  <span className={TAB_COUNT_CLS}>{detail.payments.length}</span>
                </TabsTrigger>
              </TabsList>

              {/* ===== Account Summary Tab ===== */}
              <TabsContent value="account" className="space-y-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
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
                <div className="overflow-hidden rounded-2xl border bg-card">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-bold">سجل الحركات</h3>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg px-2.5 text-xs"
                          onClick={() => setAdjustOpen(true)}
                        >
                          <Scale className="size-3.5" />
                          تسوية رصيد
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground">{timeline.length} حركة</span>
                    </div>
                  </div>
                  {timeline.length === 0 ? (
                    <div className="p-4"><EmptyNote>لا توجد حركات</EmptyNote></div>
                  ) : (
                    <div className="divide-y">
                      {timeline.map((row, i) => {
                        // 🆕 2026-10-22: قيد رصيد افتتاحي / تسوية — أول القيود الموثقة
                        if (row.kind === 'entry') {
                          const isOpening = row.reason.includes('افتتاحي')
                          return (
                            <div
                              key={`b-${i}`}
                              className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40"
                            >
                              <KindIcon kind="entry" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <p className="font-semibold leading-tight">{isOpening ? 'رصيد افتتاحي' : 'تسوية رصيد'}</p>
                                  <Badge
                                    variant={isOpening ? 'info' : 'secondary'}
                                    size="sm"
                                  >
                                    {isOpening ? 'ترحيل' : 'تسوية'}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{row.reason}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  <DateTimeCell date={row.date} />
                                  {row.createdBy ? ` · ${row.createdBy}` : ''}
                                </p>
                              </div>
                              <div className="shrink-0 text-end">
                                <p
                                  className={cn(
                                    'whitespace-nowrap text-base font-extrabold tabular-nums',
                                    row.delta > 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-emerald-600 dark:text-emerald-400',
                                  )}
                                >
                                  <span className="me-0.5">{row.delta > 0 ? '+' : '−'}</span>
                                  {num(Math.abs(row.delta))}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {row.delta > 0 ? 'زاد الرصيد' : 'قلل الرصيد'}
                                </p>
                              </div>
                            </div>
                          )
                        }
                        if (row.kind === 'sale') {
                          const itemsText = itemsPreview(row.items)
                          const debt = Math.max(0, row.total - row.paid)
                          return (
                            <div
                              key={`s-${row.saleId}-${i}`}
                              className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40"
                            >
                              <KindIcon kind="sale" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <p className="font-semibold leading-tight">{row.invoiceNo ?? `#${row.saleId}`}</p>
                                  <Badge variant="info" size="sm">بيع</Badge>
                                </div>
                                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{itemsText}</p>
                                {row.paid > 0 && (
                                  <p className="mt-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    دفع كاش: {formatCurrency(row.paid)}
                                  </p>
                                )}
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  <DateTimeCell date={row.date} />
                                </p>
                              </div>
                              <div className="shrink-0 text-end">
                                {debt > 0 ? (
                                  <p className="whitespace-nowrap text-base font-extrabold tabular-nums text-rose-600 dark:text-rose-400">
                                    <span className="me-0.5">+</span>
                                    {num(debt)}
                                  </p>
                                ) : (
                                  <p className="whitespace-nowrap text-sm font-semibold text-muted-foreground">مسوّى</p>
                                )}
                                <p className="text-[10px] text-muted-foreground">مدين</p>
                              </div>
                            </div>
                          )
                        }
                        // payment row
                        return (
                          <div
                            key={`p-${i}`}
                            className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40"
                          >
                            <KindIcon kind="payment" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="font-semibold leading-tight">دفعة</p>
                                <span
                                  className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${methodBadgeClass(
                                    row.method
                                  )}`}
                                >
                                  {METHOD_LABELS[row.method] || row.method}
                                </span>
                              </div>
                              {row.note && (
                                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{row.note}</p>
                              )}
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                <DateTimeCell date={row.date} />
                              </p>
                            </div>
                            <div className="shrink-0 text-end">
                              <p className="whitespace-nowrap text-base font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                                <span className="me-0.5">−</span>
                                {num(row.amount)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">دائن</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ===== Sales Tab ===== */}
              <TabsContent value="sales">
                <div className="overflow-hidden rounded-2xl border bg-card">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-bold">فواتير العميل</h3>
                    <span className="text-xs text-muted-foreground">{detail.sales.length} فاتورة</span>
                  </div>
                  {detail.sales.length === 0 ? (
                    <div className="p-4"><EmptyNote>لا توجد مبيعات</EmptyNote></div>
                  ) : (
                    <div className="divide-y">
                      {detail.sales.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40"
                        >
                          <KindIcon kind="sale" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="font-semibold leading-tight">{s.invoiceNo ?? `#${s.id}`}</p>
                              <StatusBadge status={s.status} />
                            </div>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              <span className="tabular-nums">{s.items.length}</span> {s.items.length > 2 && s.items.length < 11 ? 'أصناف' : 'صنف'}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              <DateTimeCell date={s.createdAt} />
                            </p>
                          </div>
                          <div className="shrink-0 text-end">
                            <p className="whitespace-nowrap text-base font-extrabold tabular-nums text-foreground">
                              {num(s.total)}
                              <span className="ms-1 text-[10px] font-medium text-muted-foreground">جنيه</span>
                            </p>
                            <p className="whitespace-nowrap text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                              مدفوع {num(s.paid)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ===== Payments Tab ===== */}
              <TabsContent value="payments" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <HandCoins className="size-5" />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground">إجمالي الدفعات</p>
                      <p className="text-lg font-extrabold leading-tight tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(
                          detail.payments.reduce((s, p) => s + p.amount, 0)
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="gradient"
                    onClick={() => setPayOpen(true)}
                    disabled={!detail}
                  >
                    <Plus className="size-4" />
                    تسجيل دفعة
                  </Button>
                </div>

                <div className="overflow-hidden rounded-2xl border bg-card">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-bold">سجل الدفعات</h3>
                    <span className="text-xs text-muted-foreground">{detail.payments.length} دفعة</span>
                  </div>
                  {detail.payments.length === 0 ? (
                    <div className="p-4"><EmptyNote>لا توجد دفعات — سجّل أول دفعة الآن</EmptyNote></div>
                  ) : (
                    <div className="divide-y">
                      {detail.payments.map((p) => (
                        <div
                          key={p.id}
                          className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40"
                        >
                          <KindIcon kind="payment" />
                          <div className="min-w-0 flex-1">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium ${methodBadgeClass(
                                p.method
                              )}`}
                            >
                              {METHOD_LABELS[p.method] || p.method}
                            </span>
                            {p.note && (
                              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{p.note}</p>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              <DateTimeCell date={p.createdAt} />
                            </p>
                          </div>
                          <p className="shrink-0 whitespace-nowrap text-base font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {num(p.amount)}
                            <span className="ms-1 text-[10px] font-medium text-muted-foreground">جنيه</span>
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeletePaymentId(p.id)}
                            title="حذف الدفعة"
                            aria-label="حذف الدفعة"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

        {/* 🆕 2026-10-22: تسوية الرصيد — أدمن فقط (الرصيد الافتتاحي / تصحيح فرق) */}
        <BalanceAdjustDialog
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          kind="customer"
          refId={customerId}
          entityName={detail?.name ?? initialName ?? ''}
          currentBalance={detail?.balance ?? 0}
          onSaved={load}
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
        <div className="flex shrink-0 justify-end border-t bg-muted/30 px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
