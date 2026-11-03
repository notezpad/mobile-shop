'use client'

/**
 * 💰 2026-11-01 (التحديث الثالث عشر) — شاشة «عمولات البائعين».
 *
 * تقرير شهري لكل بائع: عدد الفواتير، المبيعات، المرتجعات، الصافي، النسبة،
 * التارجت (لو موجود)، العمولة المستحقة، وحالة التسوية — مع زر «صرف»
 * يسجل التسوية النهائية (لقطة مغلقة مينفعش تتصرّف تاني).
 *
 * 🛡️ كل الأرقام بتتيجي من /api/commissions/report (بتتحسب على السيرفر من
 * سجلات المبيعات والمرتجعات نفسها) — والصرف عبر /api/commissions/payout
 * (أدمن بس على السيرفر، قيد فريد لكل بائع/شهر).
 * الصرف هنا **سجل تسوية** — مش حركة خزنة (الفلوس ممكن تتدفع برا النظام
 * أو مع الراتب).
 */

import * as React from 'react'
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  HandCoins,
  Hourglass,
  Loader2,
  Lock,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Target,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import { useDataRefresh } from '@/lib/offline/data-events'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface SellerRow {
  userId: string
  name: string
  active: boolean
  isSeller: boolean
  rate: number | null
  target: number | null
  invoices: number
  salesTotal: number
  returnsCount: number
  returnsTotal: number
  netBase: number
  commission: number
  targetMet: boolean
  payout: {
    amount: number
    adjustments: number
    viaPayroll: boolean
    method: string | null
    note: string | null
    paidAt: string
  } | null
}

interface ReportData {
  month: string
  currentMonth: string
  /** اليوم بتوقيت المحل YYYY-MM-DD (لتحديد «مبلغ مبدئي») */
  today?: string
  prevMonth: string
  nextMonth: string
  enabled: boolean
  sellers: SellerRow[]
  totals: {
    invoices: number
    salesTotal: number
    returnsTotal: number
    netBase: number
    commission: number
    paidAmount: number
  }
}

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return `${MONTH_NAMES[mm - 1] ?? mm} ${y}`
}

const PAYOUT_METHODS = [
  { id: 'cash', label: 'كاش' },
  { id: 'vodafone_cash', label: 'محفظة' },
  { id: 'instapay', label: 'انستاباي' },
  { id: 'with_salary', label: 'مع الراتب' },
]

/* ─────────────── عناصر التصميم (نفس لغة صفحات الموارد البشرية 3D) ─────────────── */

type Tone = 'sky' | 'emerald' | 'rose' | 'amber' | 'violet' | 'slate'

const TONES: Record<Tone, { grad: string; shadow: string; border: string }> = {
  sky: { grad: 'from-sky-400 to-sky-600', shadow: 'shadow-sky-500/30', border: 'border-s-sky-500' },
  emerald: { grad: 'from-emerald-400 to-emerald-600', shadow: 'shadow-emerald-500/30', border: 'border-s-emerald-500' },
  rose: { grad: 'from-rose-400 to-rose-600', shadow: 'shadow-rose-500/30', border: 'border-s-rose-500' },
  amber: { grad: 'from-amber-400 to-amber-600', shadow: 'shadow-amber-500/30', border: 'border-s-amber-500' },
  violet: { grad: 'from-violet-400 to-violet-600', shadow: 'shadow-violet-500/30', border: 'border-s-violet-500' },
  slate: { grad: 'from-slate-400 to-slate-600', shadow: 'shadow-slate-500/30', border: 'border-s-slate-500' },
}

/** أيقونة 3D: تدرّج + لمعة علوية + ظل ملوّن */
function Icon3D({ icon: Icon, tone, className }: { icon: React.ElementType; tone: Tone; className?: string }) {
  const t = TONES[tone]
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/25',
        t.grad,
        t.shadow,
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
      <Icon className="relative size-5 drop-shadow-md" strokeWidth={2.3} />
    </span>
  )
}

/** كارت رقم 3D — حافة ملوّنة + أيقونة + ظل عميق */
function StatCard({
  label, value, foot, icon, tone, valueClassName, className,
}: {
  label: string
  value: React.ReactNode
  foot?: React.ReactNode
  icon: React.ElementType
  tone: Tone
  valueClassName?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        // 🛡️ 2026-11-03: أزلنا حركات hover (translate/scale/rotate) — لما الماوس بيعدي على العناصر أثناء سكرول بالعجلة كانت بتتحرك فبيبان كأن المحتوى بيقفز. التغذية الراجعة بقت بالظل/اللون بس.
        'relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-s-4 bg-card p-4 transition-all duration-300 sm:p-5',
        'shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]',
        TONES[tone].border,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-xs font-bold text-muted-foreground">{label}</p>
          <p className={cn('break-words text-xl font-black tabular-nums leading-tight drop-shadow-sm sm:text-2xl', valueClassName)}>
            {value}
          </p>
        </div>
        <Icon3D icon={icon} tone={tone} />
      </div>
      {foot && <p className="mt-3 text-[11px] font-medium text-muted-foreground">{foot}</p>}
    </div>
  )
}

/** حلقة تقدّم 3D للهيرو */
function ProgressRing({ value, size = 112, stroke = 11 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className="relative grid place-items-center drop-shadow-[0_10px_15px_rgba(0,0,0,0.25)]" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/15" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          strokeLinecap="round"
          className="stroke-white transition-[stroke-dashoffset] duration-1000 ease-out"
          style={{ filter: 'drop-shadow(0px 0px 8px rgba(255,255,255,0.55))' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-black tabular-nums leading-none drop-shadow-md">{clamped}%</p>
          <p className="mt-1 text-[10px] font-bold text-white/75">اتصرف</p>
        </div>
      </div>
    </div>
  )
}

/** زرار تنقّل زجاجي 3D للهيرو */
const GLASS_BTN =
  'grid size-10 shrink-0 place-items-center rounded-xl border border-white/30 bg-white/10 text-white backdrop-blur-md transition-all ' +
  'shadow-[0_5px_0_rgba(255,255,255,0.12)] hover:bg-white/20 hover:shadow-[0_3px_0_rgba(255,255,255,0.12)] ' +
  'active:translate-y-[5px] active:shadow-none disabled:pointer-events-none disabled:opacity-40'

const MEDALS = [
  { grad: 'from-amber-300 to-amber-500', ring: 'ring-amber-300/60', label: 'المركز الأول' },
  { grad: 'from-slate-200 to-slate-400', ring: 'ring-slate-300/60', label: 'المركز الثاني' },
  { grad: 'from-orange-300 to-orange-600', ring: 'ring-orange-300/60', label: 'المركز الثالث' },
]

const initial = (name: string) => name.trim().charAt(0) || '؟'

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-8 sm:px-8" dir="rtl" aria-busy>
      <div className="h-56 animate-pulse rounded-3xl bg-muted/60" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-3xl bg-muted/60" />
        ))}
      </div>
    </div>
  )
}

/** أول كام يوم من الشهر الجديد بنعتبر فيها رقم الشهر اللي فات «لسه مبدئي» (مرتجعات آخر الشهر ممكن توصل) */
const GRACE_DAYS = 2

function prevMonthOf(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mm - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * هل رقم العمولة لسه مبدئي؟
 *  - open : الشهر الحالي مفتوح (مبيعات ومرتجعات جاية)
 *  - grace: أول يومين من الشهر الجديد للشهر اللي فات (فترة المرتجعات لسه ما عدّتش)
 */
function provisionalState(month: string, currentMonth: string, today?: string): 'open' | 'grace' | null {
  if (!month || !currentMonth) return null
  if (month >= currentMonth) return 'open'
  const day = today ? Number(today.slice(8, 10)) : NaN
  if (month === prevMonthOf(currentMonth) && Number.isFinite(day) && day <= GRACE_DAYS) return 'grace'
  return null
}

const STATUS_STYLES: Record<string, string> = {
  'مكتملة': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  'مرتجعة جزئياً': 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  'مرتجعة': 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  'مرتجع': 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
}

interface InvoiceRow {
  kind: 'sale' | 'return'
  id: number
  invoiceNo: string | null
  at: string
  amount: number
  commission: number
  status: string
  /** مرتجع فقط: تاريخ الفاتورة الأصلية + هل هي من شهر أقدم من الشهر المعروض */
  saleAt?: string
  fromPrevMonth?: boolean
}

/** جدول فواتير ومرتجعات البائع في الشهر — بيتحمّل عند الفتح (الأرقام من /api/commissions/invoices) */
function InvoicesPanel({
  userId, month, count, defaultOpen,
}: { userId: string; month: string; count: number; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [rows, setRows] = React.useState<InvoiceRow[] | null>(null)
  const [truncated, setTruncated] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || rows || error) return
    let alive = true
    api<{ rows: InvoiceRow[]; truncated: boolean }>(
      `/api/commissions/invoices?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`,
    )
      .then((r) => {
        if (!alive) return
        setRows(r.rows ?? [])
        setTruncated(!!r.truncated)
      })
      .catch((e: any) => alive && setError(e?.message || 'فشل تحميل الفواتير'))
    return () => {
      alive = false
    }
  }, [open, rows, error, userId, month])

  const total = rows ? Math.round(rows.reduce((a, r) => a + r.commission, 0) * 100) / 100 : 0
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' })
  const fmtMonthYear = (iso: string) => new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' })
  const hasOldReturns = !!rows?.some((r) => r.fromPrevMonth)
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="mt-4 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-foreground/80 transition-colors hover:bg-muted/60"
      >
        <span className="flex items-center gap-2">
          <Receipt className="size-4 text-emerald-600 dark:text-emerald-400" />
          تفاصيل الفواتير والمرتجعات
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">{count}</span>
        </span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-2">
          {error ? (
            <p className="rounded-xl bg-rose-500/10 p-3 text-xs font-bold text-rose-700 dark:text-rose-400">{error}</p>
          ) : !rows ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-muted/60" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-4 text-center text-xs font-bold text-muted-foreground">مفيش فواتير ولا مرتجعات للبائع ده في الشهر ده</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 text-start font-bold">التاريخ</th>
                    <th className="px-3 py-2 text-start font-bold">الفاتورة</th>
                    <th className="px-3 py-2 text-center font-bold">النوع</th>
                    <th className="px-3 py-2 text-end font-bold">المبلغ</th>
                    <th className="px-3 py-2 text-end font-bold">العمولة</th>
                    <th className="px-3 py-2 text-center font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-bold tabular-nums">{fmtDay(r.at)}</p>
                        <p className="text-[10px] tabular-nums text-muted-foreground">{fmtTime(r.at)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-bold tabular-nums">#{r.invoiceNo ?? r.id}</p>
                        {r.kind === 'return' && r.saleAt && (
                          <p
                            className={cn(
                              'mt-0.5 text-[10px] font-bold',
                              r.fromPrevMonth ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                            )}
                          >
                            {r.fromPrevMonth
                              ? `فاتورة من ${fmtMonthYear(r.saleAt)} — بتتخصم هنا`
                              : `على فاتورة ${fmtDay(r.saleAt)}`}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', r.kind === 'sale' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400')}>
                          {r.kind === 'sale' ? 'بيع' : 'مرتجع'}
                        </span>
                      </td>
                      <td className={cn('px-3 py-2.5 text-end font-bold tabular-nums', r.kind === 'return' && 'text-rose-600 dark:text-rose-400')}>
                        {r.kind === 'return' ? `-${formatCurrency(r.amount)}` : formatCurrency(r.amount)}
                      </td>
                      <td className={cn('px-3 py-2.5 text-end font-black tabular-nums', r.commission < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        {r.commission > 0 ? '+' : ''}{formatCurrency(r.commission)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_STYLES[r.status] ?? 'bg-muted text-muted-foreground')}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-muted-foreground">إجمالي العمولة قبل بوابة التارجت</td>
                    <td className="px-3 py-2.5 text-end text-base font-black tabular-nums">{formatCurrency(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {hasOldReturns && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              المرتجع على فاتورة من شهر سابق بيتخصم من عمولة الشهر اللي اتعمل فيه المرتجع (مش شهر الفاتورة)، وبنسبة الفاتورة الأصلية.
            </p>
          )}
          {truncated && <p className="mt-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">معروض آخر 300 حركة فقط — الإجمالي في الكارت هو الرقم الكامل.</p>}
        </div>
      )}
    </div>
  )
}

export function CommissionsView() {
  const isAdmin = useShopStore((s) => s.user?.role === 'ADMIN' || s.user?.role === 'SUPER_ADMIN')
  const [month, setMonth] = React.useState<string>('')
  const [currentMonth, setCurrentMonth] = React.useState<string>('')
  const [data, setData] = React.useState<ReportData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [payTarget, setPayTarget] = React.useState<SellerRow | null>(null)

  const load = React.useCallback(async (m: string, silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const r = await api<ReportData>(`/api/commissions/report?month=${encodeURIComponent(m)}`)
      setData(r)
      setMonth(r.month)
      setCurrentMonth(r.currentMonth)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل تقرير العمولات')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // 🔄 بيع جديد أو صرف عمولة → التقرير يتحدث لحظياً (بدون سبينر)
  useDataRefresh(['commissions'], () => void load(month, true))

  React.useEffect(() => {
    // أول تحميل: الشهر الحالي — الـ API بيرجّع الشهر الصحيح بتوقيت المحل لو فاضية
    void load('')
  }, [load])

  const goMonth = (m: string) => {
    if (!m) return
    void load(m)
  }

  // ترتيب لوحة الشرف: الأعلى صافي مبيعات أولًا (نسخة — مش بنغيّر ترتيب الـ API)
  const ranked = React.useMemo(
    () => [...(data?.sellers ?? [])].sort((a, b) => b.netBase - a.netBase),
    [data],
  )

  // أول تحميل بس: هيكل عظمي بنفس أبعاد الصفحة (من غير قفزة). تغيير الشهر بيعتّم المحتوى الحالي.
  if (loading && !data) return <PageSkeleton />

  const enabled = data?.enabled === true
  const totals = data?.totals
  const switching = loading && !!data
  const paidPct =
    totals && totals.commission > 0
      ? Math.min(100, Math.max(0, Math.round((totals.paidAmount / totals.commission) * 100)))
      : 0
  const provisional = provisionalState(month, currentMonth, data?.today)
  const dueLeft = totals ? Math.max(0, Math.round((totals.commission - totals.paidAmount) * 100) / 100) : 0

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-8 sm:px-8" dir="rtl">
      {/* ═════════ الهيرو 3D ═════════ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.3)]">
        <div aria-hidden className="absolute -right-32 -top-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
        <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-amber-300/30 blur-[80px]" />
        <div
          aria-hidden
          className="pointer-events-none absolute -end-10 -top-14 size-44 rounded-full border-[12px] border-white/[0.07]"
        />

        <div className="relative flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="z-10 min-w-0 max-w-xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 shadow-inner backdrop-blur-md">
              <Sparkles className="size-3.5 text-white" />
              <span className="text-xs font-bold text-white">مكافآت الفريق</span>
            </div>
            <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight drop-shadow-md sm:text-3xl lg:text-4xl">
              عمولات البائعين
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-emerald-50/90 sm:text-base">
              نسبة عمولة شهرية لكل بائع على مبيعاته. المرتجع بيتخصم بنسبة الفاتورة الأصلية، والاستبدال بيتحسب بالفرق الصافي. الحساب كله على السيرفر من الفواتير نفسها.
            </p>

            {/* تنقّل الشهور */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={GLASS_BTN}
                aria-label="الشهر السابق"
                disabled={loading}
                onClick={() => goMonth(data?.prevMonth ?? '')}
              >
                <ChevronRight className="size-5" />
              </button>
              <div className="min-w-36 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-center shadow-inner backdrop-blur-md">
                <p className="text-[10px] font-bold text-white/70">الشهر</p>
                <p className="text-sm font-black tabular-nums">{month ? monthLabel(month) : '—'}</p>
              </div>
              <button
                type="button"
                className={GLASS_BTN}
                aria-label="الشهر التالي"
                disabled={loading || !data || data.month >= data.currentMonth}
                onClick={() => goMonth(data?.nextMonth ?? '')}
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                className={GLASS_BTN}
                aria-label="تحديث"
                disabled={refreshing || loading}
                onClick={() => month && load(month, true)}
              >
                {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </button>
              {month && currentMonth && month !== currentMonth && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => goMonth(currentMonth)}
                  className="h-10 rounded-xl bg-white px-4 text-xs font-extrabold text-teal-700 shadow-[0_5px_0_rgb(203,213,225)] transition-all hover:shadow-[0_3px_0_rgb(203,213,225)] active:translate-y-[5px] active:shadow-none disabled:opacity-50"
                >
                  الشهر الحالي
                </button>
              )}
            </div>
          </div>

          {/* لوحة الإجمالي الزجاجية */}
          {enabled && totals && (
            <div className="z-10 flex items-center gap-5 rounded-3xl border border-white/20 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-md sm:p-5">
              <ProgressRing value={paidPct} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white/75">إجمالي العمولات المستحقة{provisional ? ' (مبدئي)' : ''}</p>
                <p className="mt-0.5 text-2xl font-black tabular-nums drop-shadow-md sm:text-3xl">
                  {formatCurrency(totals.commission)}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                  <CheckCircle2 className="size-3.5" />
                  تم صرف {paidPct}% من العمولات ({formatCurrency(totals.paidAmount)})
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-amber-200">
                  {dueLeft > 0 ? `متبقي ${formatCurrency(dueLeft)}` : totals.commission > 0 ? 'الكل اتصرف ✓' : 'لا يوجد مستحق'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className={cn('space-y-5 transition-opacity', switching && 'pointer-events-none opacity-50')}>
        {/* ⏳ مبلغ مبدئي: الشهر مفتوح أو فترة مرتجعات آخر الشهر لسه ما عدّتش */}
        {enabled && provisional && (
          <div className="relative flex items-start gap-3.5 overflow-hidden rounded-3xl border border-s-4 border-amber-500/30 border-s-amber-500 bg-card p-4 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] sm:p-5">
            <Icon3D icon={Hourglass} tone="amber" />
            <div className="min-w-0">
              <p className="text-base font-black">
                مبلغ مبدئي {provisional === 'open' ? '— الشهر لسه مفتوح' : '— فترة المرتجعات لسه ما خلصتش'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {provisional === 'open'
                  ? 'أي مبيعات أو مرتجعات جديدة هتغيّر الأرقام. لو صرفت دلوقتي هتتسجل لقطة نهائية بالأرقام الحالية، ومينفعش تتعدّل بعد كده.'
                  : 'مرتجعات فواتير آخر الشهر ممكن لسه توصل وتخصم من العمولة. الأفضل تستنى كام يوم قبل الصرف.'}
              </p>
            </div>
          </div>
        )}

        {/* الميزة مقفولة */}
        {!enabled && (
          <div className="relative flex items-start gap-3.5 overflow-hidden rounded-3xl border border-s-4 border-amber-500/30 border-s-amber-500 bg-card p-5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]">
            <Icon3D icon={AlertTriangle} tone="amber" />
            <div className="min-w-0">
              <p className="text-base font-black">ميزة عمولات البائعين متوقفة</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                فعّلها من <b>الإعدادات ← عمولات البائعين</b> (حدّد النسبة العامة ثم فعّل المفتاح)،
                وعلّم «بائع» على الموظفين من شاشة المستخدمين.
              </p>
            </div>
          </div>
        )}

        {/* إجماليات الشهر — كروت 3D */}
        {enabled && totals && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <StatCard label="فواتير البائعين" value={totals.invoices} icon={Receipt} tone="sky" foot="فواتير بإسناد بائع" />
            <StatCard
              label="المبيعات"
              value={formatCurrency(totals.salesTotal)}
              icon={ShoppingBag}
              tone="emerald"
              foot={`الصافي ${formatCurrency(totals.netBase)}`}
            />
            <StatCard
              label="المرتجعات"
              value={formatCurrency(totals.returnsTotal)}
              icon={Undo2}
              tone="rose"
              valueClassName={totals.returnsTotal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}
              foot={totals.returnsTotal > 0 ? 'بتخصم من أساس العمولة' : 'مفيش مرتجعات الشهر ده'}
            />
            <StatCard
              label="عمولات مستحقة"
              value={formatCurrency(totals.commission)}
              icon={HandCoins}
              tone="amber"
              valueClassName="text-emerald-600 dark:text-emerald-400"
              foot="قبل الصرف"
            />
            <StatCard
              label="تم صرفه"
              value={formatCurrency(totals.paidAmount)}
              icon={Wallet}
              tone="violet"
              valueClassName={totals.paidAmount > 0 ? undefined : 'text-muted-foreground'}
              className="col-span-2 lg:col-span-1"
              foot={totals.commission > 0 ? `${paidPct}% من المستحق` : undefined}
            />
          </div>
        )}

        {/* لوحة البائعين */}
        {enabled &&
          (ranked.length === 0 ? (
            <div className="relative overflow-hidden rounded-3xl border border-dashed bg-card/60 px-6 py-12 text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(420px 170px at 50% 0%, color-mix(in srgb, var(--primary) 10%, transparent), transparent)' }}
              />
              <Icon3D icon={Users} tone="emerald" className="relative mx-auto mb-3 size-14 rounded-2xl [&>svg]:size-7" />
              <p className="relative text-base font-black">مفيش بائعين لسه</p>
              <p className="relative mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                علّم «بائع» على الموظفين من شاشة المستخدمين، ومع أول فاتورة بإسناد بائع هتلاقي أرقامهم هنا.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {ranked.map((s, idx) => {
                const paid = !!s.payout
                const disabled = paid || !s.targetMet || s.commission === 0
                const targetPct = s.target && s.target > 0 ? Math.min(100, Math.round((s.netBase / s.target) * 100)) : null
                const medal = ranked.length > 1 && s.netBase > 0 && idx < 3 ? MEDALS[idx] : null
                const negative = s.commission < 0
                const heroGrad = negative
                  ? 'from-rose-500 to-rose-700'
                  : !s.targetMet
                    ? 'from-amber-500 to-orange-600'
                    : 'from-emerald-500 to-teal-600'
                return (
                  <article
                    key={s.userId}
                    className={cn(
                      'relative overflow-hidden rounded-3xl border bg-card p-4 transition-all duration-300 sm:p-5',
                      'shadow-[0_4px_0_rgba(15,23,42,0.05),0_18px_36px_-18px_rgba(0,0,0,0.25)] dark:shadow-[0_4px_0_rgba(0,0,0,0.3),0_18px_36px_-18px_rgba(0,0,0,0.6)]',
                      !s.active && 'opacity-80',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-0 top-0 h-1 bg-gradient-to-l',
                        paid ? 'from-violet-400 to-violet-600' : 'from-emerald-400 to-teal-500',
                      )}
                    />

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-8">
                    <div className="min-w-0">
                    {/* الرأس: الأفاتار + الاسم + شارات */}
                    <header className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <span className="relative grid size-12 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-lg font-black text-white shadow-lg shadow-emerald-500/30 ring-1 ring-inset ring-white/25">
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                          <span className="relative drop-shadow-md">{initial(s.name)}</span>
                        </span>
                        {medal && (
                          <span
                            title={medal.label}
                            className={cn(
                              'absolute -bottom-1.5 -start-1.5 grid size-6 place-items-center rounded-full bg-gradient-to-br text-white shadow-md ring-2',
                              medal.grad,
                              medal.ring,
                            )}
                          >
                            {idx === 0 ? <Crown className="size-3.5" /> : <span className="text-[11px] font-black">{idx + 1}</span>}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-lg font-black leading-snug sm:text-xl">{s.name}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {s.rate != null && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                              نسبة {s.rate}%
                            </span>
                          )}
                          {!s.active && (
                            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">موقوف</span>
                          )}
                          {!s.isSeller && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">مش معلّم بائع</span>
                          )}
                        </div>
                      </div>
                    </header>

                    {/* العمولة — لوحة ملوّنة 3D */}
                    <div
                      className={cn(
                        'relative mt-4 flex items-end justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-inner ring-1 ring-inset ring-white/20',
                        heroGrad,
                      )}
                    >
                      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
                      <div className="relative min-w-0">
                        <p className="text-[11px] font-bold text-white/80">العمولة المستحقة{provisional ? ' (مبدئية)' : ''}</p>
                        <p className="text-3xl font-black tabular-nums leading-tight drop-shadow-md sm:text-4xl">
                          {formatCurrency(s.commission)}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-white/75">من صافي {formatCurrency(s.netBase)}</p>
                      </div>
                      {s.targetMet && provisional && (
                        <span className="relative flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold backdrop-blur">
                          <Hourglass className="size-3" />
                          مبدئي
                        </span>
                      )}
                      {!s.targetMet && (
                        <span className="relative shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-extrabold backdrop-blur">
                          ما حققش التارجت
                        </span>
                      )}
                    </div>

                    </div>
                    <div className="flex min-w-0 flex-col justify-center">
                    {/* الأرقام */}
                    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-xl bg-muted/50 p-3">
                        <dt className="text-[10px] font-bold text-muted-foreground">فواتير</dt>
                        <dd className="mt-0.5 text-base font-black tabular-nums">{s.invoices}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-3">
                        <dt className="text-[10px] font-bold text-muted-foreground">مبيعات</dt>
                        <dd className="mt-0.5 break-words text-base font-black tabular-nums">{formatCurrency(s.salesTotal)}</dd>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-3">
                        <dt className="text-[10px] font-bold text-muted-foreground">مرتجعات</dt>
                        <dd
                          className={cn(
                            'mt-0.5 break-words text-base font-black tabular-nums',
                            s.returnsTotal > 0 && 'text-rose-600 dark:text-rose-400',
                            s.returnsTotal < 0 && 'text-emerald-600 dark:text-emerald-400',
                            s.returnsTotal === 0 && 'text-muted-foreground',
                          )}
                        >
                          {s.returnsTotal > 0
                            ? `-${formatCurrency(s.returnsTotal)}`
                            : s.returnsTotal < 0
                              ? `+${formatCurrency(Math.abs(s.returnsTotal))}`
                              : formatCurrency(0)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-3">
                        <dt className="text-[10px] font-bold text-muted-foreground">الصافي</dt>
                        <dd className="mt-0.5 break-words text-base font-black tabular-nums">{formatCurrency(s.netBase)}</dd>
                      </div>
                    </dl>

                    {/* التارجت */}
                    <div className="mt-3.5">
                      {s.target != null && targetPct != null ? (
                        <>
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold">
                            <span
                              className={cn(
                                'flex items-center gap-1.5',
                                s.targetMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                              )}
                            >
                              <Target className="size-3.5" />
                              {s.targetMet ? 'حقق التارجت' : 'لسه ما حققش التارجت'}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {formatCurrency(s.netBase)} من {formatCurrency(s.target)}
                              {s.targetMet && s.netBase > s.target ? ` (زيادة ${formatCurrency(s.netBase - s.target)})` : ` · ${targetPct}%`}
                            </span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted shadow-inner">
                            <div
                              className={cn(
                                'h-full rounded-full bg-gradient-to-l shadow-[0_0_8px_rgba(0,0,0,0.15)] transition-all duration-700',
                                s.targetMet ? 'from-emerald-400 to-emerald-600' : 'from-amber-400 to-orange-500',
                              )}
                              style={{ width: `${targetPct}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                          <Target className="size-3.5" />
                          من غير تارجت — العمولة على كل المبيعات
                        </p>
                      )}
                    </div>

                    {/* الصرف */}
                    {(paid || isAdmin) && (
                      <div className="mt-4 border-t pt-4">
                        {paid ? (
                          <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2.5">
                            <span className="flex items-center gap-2 text-sm font-extrabold text-violet-700 dark:text-violet-300">
                              <Lock className="size-4" />
                              {s.payout!.viaPayroll ? 'اتصرف مع الراتب' : 'تم الصرف'}
                            </span>
                            {isAdmin && (
                              <span className="text-end text-[11px] font-bold leading-tight text-muted-foreground">
                                {formatCurrency(s.payout!.amount)}
                                {s.payout!.method
                                  ? ` · ${PAYOUT_METHODS.find((m) => m.id === s.payout!.method)?.label ?? s.payout!.method}`
                                  : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setPayTarget(s)}
                            title={
                              disabled
                                ? !s.targetMet
                                  ? 'لسه ما حققش التارجت'
                                  : 'مفيش عمولة تتصرف'
                                : undefined
                            }
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 py-2.5 text-sm font-extrabold text-white shadow-[0_5px_0_rgb(15,118,110)] transition-all hover:shadow-[0_3px_0_rgb(15,118,110)] active:translate-y-[5px] active:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:text-white/90 disabled:shadow-[0_5px_0_rgb(148,163,184)] dark:disabled:from-slate-600 dark:disabled:to-slate-700 dark:disabled:shadow-[0_5px_0_rgb(51,65,85)]"
                          >
                            <BadgeDollarSign className="size-4" />
                            صرف العمولة
                          </button>
                        )}
                      </div>
                    )}
                    </div>
                    </div>
                    <InvoicesPanel
                      key={`${s.userId}-${month}`}
                      userId={s.userId}
                      month={month}
                      count={s.invoices + s.returnsCount}
                      defaultOpen={ranked.length === 1}
                    />
                  </article>
                )
              })}
            </div>
          ))}
      </div>

      <PayoutDialog
        target={payTarget}
        month={month}
        monthLabel={month ? monthLabel(month) : ''}
        provisional={provisional}
        onClose={() => setPayTarget(null)}
        onDone={() => {
          setPayTarget(null)
          if (month) void load(month, true)
        }}
      />
    </div>
  )
}

/* ─────────────── دايلوج الصرف ─────────────── */

function PayoutDialog({
  target,
  month,
  monthLabel,
  provisional,
  onClose,
  onDone,
}: {
  target: SellerRow | null
  month: string
  monthLabel: string
  provisional: 'open' | 'grace' | null
  onClose: () => void
  onDone: () => void
}) {
  const [adjustments, setAdjustments] = React.useState('')
  const [method, setMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  // 🛡️ تأكيد صريح لو الرقم مبدئي + قفل متزامن ضد الضغطتين المتتاليتين (state لوحده مش كفاية قبل إعادة الرسم)
  const [ack, setAck] = React.useState(false)
  const busyRef = React.useRef(false)

  React.useEffect(() => {
    if (target) {
      setAck(false)
      setAdjustments('')
      setMethod('cash')
      setNote('')
    }
  }, [target])

  if (!target) return null

  const adjNum = adjustments.trim() === '' ? 0 : Number(adjustments)
  const finalAmount = Math.round(((target.commission || 0) + (Number.isFinite(adjNum) ? adjNum : 0)) * 100) / 100

  const submit = async () => {
    if (busyRef.current || saving) return
    if (provisional && !ack) {
      toast.error('أكّد إنك فاهم إن الرقم مبدئي قبل الصرف')
      return
    }
    if (finalAmount < 0 && !note.trim()) {
      toast.error('الخصم لازم له سبب — اكتب ملاحظة')
      return
    }
    busyRef.current = true
    setSaving(true)
    try {
      await api('/api/commissions/payout', {
        method: 'POST',
        body: {
          userId: target.userId,
          month,
          adjustments: Number.isFinite(adjNum) ? adjNum : 0,
          method,
          note: note.trim() || null,
        },
      })
      toast.success(`تم تسجيل صرف عمولة ${target.name} عن ${monthLabel}`)
      onDone()
    } catch (e: any) {
      const msg: string = e?.message || ''
      // القيد الفريد على السيرفر (بائع/شهر) — لو اتصرفت قبل كده نحدّث الصفحة بدل ما نظهر خطأ مربك
      if (msg.includes('اتصرفت بالفعل')) {
        toast.info('عمولة الشهر ده اتصرفت قبل كده — اتحدّثت الصفحة')
        onDone()
      } else {
        toast.error(msg || 'فشل تسجيل الصرف')
      }
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md overflow-hidden rounded-3xl p-0" dir="rtl">
        {/* ترويسة متدرّجة */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
          <div aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-white/20 blur-[60px]" />
          <div className="relative flex items-center gap-3">
            <Icon3D icon={BadgeDollarSign} tone="amber" />
            <div className="min-w-0">
              <h2 className="text-base font-black leading-snug drop-shadow-md">صرف عمولة {target.name}</h2>
              <p className="text-xs font-bold text-white/80">{monthLabel}</p>
            </div>
          </div>
          <p className="relative mt-3 text-[11px] leading-relaxed text-emerald-50/90">
            بتسجل لقطة نهائية مغلقة: الأرقام بتتحسب لحظة التأكيد، والشهر بيتقفل للبائع ده (مستحيل يتصرّف تاني).
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5 rounded-2xl border bg-muted/30 p-3.5 text-sm shadow-inner">
            <div className="flex justify-between"><span className="text-muted-foreground">فواتير</span><b className="tabular-nums">{target.invoices}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">مبيعات</span><b className="tabular-nums">{formatCurrency(target.salesTotal)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">مرتجعات</span><b className="tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(target.returnsTotal)}</b></div>
            <div className="flex justify-between border-t pt-1.5"><span className="text-muted-foreground">الصافي</span><b className="tabular-nums">{formatCurrency(target.netBase)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">النسبة</span><b className="tabular-nums">{target.rate != null ? `${target.rate}%` : '—'}</b></div>
            <div className="flex justify-between border-t pt-1.5 text-base"><span className="font-bold">العمولة</span><b className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(target.commission)}</b></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">إضافات / خصومات (+/-)</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={adjustments}
                onChange={(e) => setAdjustments(e.target.value)}
                dir="ltr"
                className="h-11 rounded-xl bg-slate-50 text-left font-semibold shadow-inner dark:bg-slate-800/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">وسيلة الصرف</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50 font-semibold shadow-inner dark:bg-slate-800/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">ملاحظة (إجبارية مع الخصم)</Label>
            <Textarea
              rows={2}
              placeholder="مثال: سلفة على العمولة 500 ج..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl bg-slate-50 shadow-inner dark:bg-slate-800/50"
            />
          </div>

          {provisional && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-amber-600"
              />
              <span className="text-xs leading-relaxed">
                <b className="text-amber-700 dark:text-amber-400">الرقم ده مبدئي.</b>{' '}
                {provisional === 'open'
                  ? 'الشهر لسه مفتوح وممكن تيجي مبيعات ومرتجعات بعد الصرف.'
                  : 'مرتجعات آخر الشهر ممكن لسه توصل.'}{' '}
                فاهم إن الصرف بيسجّل لقطة نهائية ومش هتتعدّل.
              </span>
            </label>
          )}

          <div
            className={cn(
              'relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-inner ring-1 ring-inset ring-white/20',
              finalAmount < 0 ? 'from-rose-500 to-rose-700' : 'from-emerald-500 to-teal-600',
            )}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
            <span className="relative text-sm font-bold">الصافي المصروف</span>
            <span className="relative text-2xl font-black tabular-nums drop-shadow-md">{formatCurrency(finalAmount)}</span>
          </div>

          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={onClose} disabled={saving} className="h-11 rounded-xl px-5 font-bold">
              إلغاء
            </Button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || (!!provisional && !ack)}
              className="flex h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-5 text-sm font-extrabold text-white shadow-[0_5px_0_rgb(15,118,110)] transition-all hover:shadow-[0_3px_0_rgb(15,118,110)] active:translate-y-[5px] active:shadow-none disabled:translate-y-0 disabled:opacity-60 disabled:shadow-[0_5px_0_rgb(15,118,110)]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
              تأكيد صرف {formatCurrency(finalAmount)}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
