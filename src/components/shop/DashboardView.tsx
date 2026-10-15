'use client'

import * as React from 'react'
import { useVocab, foodTerm } from '@/lib/vocab'
import { formatQtyUnit } from '@/lib/unit-label'
import {
  Wallet,
  TrendingUp,
  Banknote,
  AlertTriangle,
  Loader2,
  PackageX,
  Activity,
  ShoppingBag,
  Users,
  Wrench,
  Trophy,
  AlertCircle,
  Boxes,
  Truck,
  CalendarDays,
  ArrowUpLeft,
  RefreshCw,
  CheckCircle2,
  Check,
  Undo2,
  Clock,
  Receipt,
  Minus,
  TrendingDown,
} from 'lucide-react'
import Link from 'next/link'
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { useDataRefresh } from '@/lib/offline/data-events'
import { useIsMobile } from '@/hooks/use-mobile'

interface DashboardData {
  todaySales: number
  todayProfit: number
  todaySalesCount: number
  cashBalance: number
  lowStockCount: number
  monthSales: number
  monthProfit: number
  customersCount: number
  activeMaintenance: number
  stockValueCost: number
  stockValuePrice: number
  totalOutstandingDebt: number
  totalSupplierDebt: number
  last7DaysSales: { date: string; total: number; profit: number | null }[]
  canViewProfits?: boolean
  topProducts: { name: string; quantity: number; total: number; unitLabel?: string | null }[]
  last10Sales: Array<{
    id: number
    invoiceNo: string | null
    createdAt: string
    total: number
    paid: number
    status: string
    customerName: string | null
  }>
  lowStockProducts: {
    id: number
    name: string
    quantity: number
    minQuantity: number
  }[]
  activeMaintenanceOrders: {
    id: number
    customerName: string
    device: string
    status: string
    receivedAt: string
  }[]
  overdueInvoices: Array<{
    id: number
    invoiceNo: string | null
    remaining: number
    dueDate: string | null
    customerName: string | null
    customerPhone: string | null
  }>
}

/* اختصار الأرقام للمحور وفوق الأعمدة: 2,000,330 → 2M */
function compactNum(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`
  return String(Math.round(v))
}

/* ───────── تاريخ ووقت بتوقيت المحل — نص هادي من غير كبسولة ───────── */

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

function wallParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour') % 24, mi: g('minute') }
}

function stampOf(iso: string | null | undefined, tz: string) {
  const dt = iso ? new Date(iso) : null
  if (!dt || isNaN(dt.getTime())) return null
  const w = wallParts(dt, tz)
  const key = `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`
  const now = wallParts(new Date(), tz)
  const yest = wallParts(new Date(Date.now() - 864e5), tz)
  const k = (p: { y: number; mo: number; d: number }) => `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
  const day =
    key === k(now) ? 'اليوم'
    : key === k(yest) ? 'أمس'
    : `${w.d} ${AR_MONTHS[w.mo - 1]}${w.y !== now.y ? ` ${w.y}` : ''}`
  const h12 = w.h % 12 || 12
  return { key, day, time: `${h12}:${String(w.mi).padStart(2, '0')}`, period: w.h >= 12 ? 'م' : 'ص' }
}

function DateStamp({ iso, tz, className }: { iso: string | null | undefined; tz: string; className?: string }) {
  const st = stampOf(iso, tz)
  if (!st) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 whitespace-nowrap text-xs', className)}>
      <span className="font-semibold text-foreground/75">{st.day}</span>
      <span className="text-muted-foreground">
        <span dir="ltr" className="tabular-nums">{st.time}</span> {st.period}
      </span>
    </span>
  )
}

/* حالة بنقطة + نص — بدل الشارات الصلبة القديمة */
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral'
const TONE: Record<Tone, { chip: string; dot: string }> = {
  success: { chip: 'bg-success-subtle text-success-subtle-foreground', dot: 'bg-success' },
  warning: { chip: 'bg-warning-subtle text-warning-subtle-foreground', dot: 'bg-warning' },
  danger: { chip: 'bg-destructive-subtle text-destructive-subtle-foreground', dot: 'bg-destructive' },
  info: { chip: 'bg-info-subtle text-info-subtle-foreground', dot: 'bg-info' },
  primary: { chip: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary' },
  neutral: { chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
}

function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold', TONE[tone].chip)}>
      <span className={cn('size-1.5 rounded-full', TONE[tone].dot)} />
      {children}
    </span>
  )
}

function maintenanceTone(s: string): Tone {
  switch (s) {
    case 'مستلم': return 'info'
    case 'قيد العمل': return 'warning'
    case 'مكتمل': return 'primary'
    case 'مُسلَّم': return 'success'
    default: return 'neutral'
  }
}

/* maintenanceStatusVariant — maps Arabic maintenance status strings to
 * badge variants. These strings come from the database (receivedAt, status)
 * and are user-facing, so they stay in Arabic. */
function maintenanceStatusVariant(s: string): { variant: 'info' | 'warning' | 'default' | 'success' | 'outline' } {
  switch (s) {
    case 'مستلم':
      return { variant: 'info' }
    case 'قيد العمل':
      return { variant: 'warning' }
    case 'مكتمل':
      return { variant: 'default' }
    case 'مُسلَّم':
      return { variant: 'success' }
    default:
      return { variant: 'outline' }
  }
}

/* rankBadgeStyle — gold/silver/bronze for top-3 products.
 * Returns inline classes since these are one-off colors not in the token system. */
function rankBadgeStyle(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-accent2-100 text-accent2-600 border-accent2-200'
    case 2:
      return 'bg-muted text-muted-foreground border-border'
    case 3:
      return 'bg-accent2-50 text-accent2-500 border-accent2-100'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

/* شريط أرقام: خلية بخط رفيع بدل كارت مستقل */
function StatCell({
  label,
  value,
  foot,
  dot,
  loading,
  className,
}: {
  label: string
  value: string
  foot?: React.ReactNode
  dot?: string
  loading?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0 p-3.5 sm:p-5', className)}>
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} />}
        <span className="truncate">{label}</span>
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="mt-1.5 break-words text-[17px] font-extrabold leading-snug tracking-tight tabular-nums text-foreground min-[400px]:text-xl sm:text-2xl">
          {value}
        </p>
      )}
      {foot && <div className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{foot}</div>}
    </div>
  )
}

/* صف مؤشر للجوال: الاسم يمين، الرقم + الوحدة شمال في نفس السطر (مفيش لف ولا قص) */
function MobileStat({
  label, value, unit, dot, sub, href, loading,
}: {
  label: string
  value: string
  unit?: string
  dot: string
  sub?: React.ReactNode
  href?: string
  loading?: boolean
}) {
  const body = (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <span className={cn('size-2 shrink-0 rounded-full', dot)} />
          <span className="truncate">{label}</span>
        </p>
        {sub && <p className="mt-0.5 ps-4 text-[11px] text-muted-foreground/80">{sub}</p>}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-24 shrink-0" />
      ) : (
        <p className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
          <span className="text-lg font-extrabold tabular-nums text-foreground">{value}</span>
          {unit && <span className="text-[11px] font-semibold text-muted-foreground">{unit}</span>}
          {href && <ArrowUpLeft className="size-3.5 self-center text-muted-foreground/60" />}
        </p>
      )}
    </div>
  )
  return href ? (
    <Link href={href} className="block transition-colors active:bg-muted/50">{body}</Link>
  ) : (
    body
  )
}

/* عنوان قسم موحّد */
function PanelTitle({
  icon: Icon,
  title,
  tone = 'text-primary',
  action,
}: {
  icon: React.ElementType
  title: string
  tone?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Icon className={cn('size-4', tone)} />
        {title}
      </h2>
      {action}
    </div>
  )
}

export function DashboardView() {
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [chartDays, setChartDays] = React.useState<7 | 14 | 30>(7)
  const isMobile = useIsMobile()
  const t = useVocab()
  const user = useShopStore((s) => s.user)
  const enabledModules = useShopStore((s) => s.plan.enabledModules)
  const hasMaintenance = enabledModules.includes('maintenance')
  const tz = useShopStore((s) => s.branding.timezone) || 'Africa/Cairo'

  // ⏰ تحية حسب ساعة المحل (بتوقيت الـ branding)
  const greeting = React.useMemo(() => {
    try {
      const h = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: tz, hour: 'numeric', hour12: false,
        }).format(new Date()),
      ) % 24
      if (h >= 5 && h < 12) return 'صباح الخير'
      if (h >= 12 && h < 17) return 'نهارك سعيد'
      if (h >= 17 && h < 21) return 'مساء الخير'
      return 'سهرة موفقة'
    } catch {
      return 'أهلاً'
    }
  }, [tz])

  // 📅 التاريخ بالعربي بتوقيت المحل
  const todayAr = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
      }).format(new Date())
    } catch {
      return ''
    }
  }, [tz])

  const load = React.useCallback(async (days = chartDays) => {
    setLoading(true)
    try {
      const d = await api<DashboardData>(`/api/dashboard?days=${days}`)
      setData(d)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartDays])

  React.useEffect(() => {
    load()

    // 🛡️ Auto-refresh every 15 minutes (كان 5) وبس لو التاب ظاهر
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      load()
    }, 15 * 60 * 1000)

    // 🛡️ الرجوع للتاب كان بيعمل ريكويست جديد في كل مرة (alt-tab storm).
    // دلوقتي مرة كل 5 دقائق كحد أقصى.
    let lastLoad = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoad < 5 * 60 * 1000) return
      lastLoad = Date.now()
      load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['dashboard'], load)

  // آخر الفواتير مجمّعة بالأيام (بتوقيت المحل) — المرتجع مش بيدخل في الإجماليات
  const saleGroups = (() => {
    const rows = data?.last10Sales ?? []
    const map = new Map<string, { key: string; label: string; rows: typeof rows; total: number }>()
    for (const r of rows) {
      const st = stampOf(r.createdAt, tz)
      const key = st?.key ?? 'unknown'
      if (!map.has(key)) map.set(key, { key, label: st?.day ?? '—', rows: [], total: 0 })
      const g = map.get(key)!
      g.rows.push(r)
      if (r.status !== 'مرتجعة') g.total += r.total ?? 0
    }
    const groups = [...map.values()]
    return { groups, count: rows.length, total: groups.reduce((a, g) => a + g.total, 0) }
  })()

  const days = data?.last7DaysSales ?? []
  // كل التواريخ ظاهرة على 7 أيام (من غير ما الرسم يخفي يوم ويوم) وتخفيف منتظم على 14/30
  // العدّ بيبدأ من النهاردة ورجوعًا، فآخر يوم دايمًا ظاهر
  const xStep = days.length <= 7 ? 1 : days.length <= 14 ? (isMobile ? 2 : 1) : isMobile ? 5 : 2
  const xTicks = days.filter((_, i) => (days.length - 1 - i) % xStep === 0).map((d) => d.date)
  // أرقام فوق الأعمدة على 7 أيام: بتخلّي الأيام الصغيرة قدام عمود ضخم مقروءة
  const showBarLabels = days.length <= 7
  const loadingFirst = loading && !data
  const weekProfit = days.reduce((a, d) => a + (Number(d.profit) || 0), 0)
  const showProfits = data?.canViewProfits !== false // 🔒 RBAC
  const weekTotal = days.reduce((a, d) => a + (d.total || 0), 0)
  // مقارنة اليوم بأمس وبمتوسط الأيام اللي قبله (من نفس بيانات المنحنى)
  const prior = days.slice(0, -1)
  const yesterdayTotal = prior.length ? prior[prior.length - 1].total : null
  const avgPrior = prior.length ? prior.reduce((a, d) => a + (d.total || 0), 0) / prior.length : null
  const compareRows =
    days.length >= 2
      ? [
          { label: 'اليوم', v: data?.todaySales ?? 0, strong: true },
          { label: 'أمس', v: yesterdayTotal ?? 0, strong: false },
          { label: `متوسط ${prior.length} يوم`, v: avgPrior ?? 0, strong: false },
        ]
      : []
  const compareMax = Math.max(1, ...compareRows.map((r) => r.v))

  // 💡 سطر ذكي: مقارنة سريعة مع أمس
  const insight = (() => {
    const today = data?.todaySales ?? 0
    if (loadingFirst) return null
    if (yesterdayTotal === null || yesterdayTotal === 0) {
      return today > 0
        ? { text: 'أول حركة بيع النهاردة — يلا نكمل', tone: 'success' as const }
        : { text: 'لسه مفيش مبيعات النهاردة', tone: 'neutral' as const }
    }
    const diff = ((today - yesterdayTotal) / yesterdayTotal) * 100
    if (Math.abs(diff) < 1) return { text: 'زي أمس بالظبط', tone: 'neutral' as const }
    if (diff > 0) return { text: `أعلى من أمس بـ ${Math.round(diff)}%`, tone: 'success' as const }
    return { text: `أقل من أمس بـ ${Math.round(Math.abs(diff))}%`, tone: 'warning' as const }
  })()

  const margin = weekTotal > 0 ? Math.round((weekProfit / weekTotal) * 100) : null

  // 🛡️ ملخص الفواتير المتأخرة (لو موجودة)
  const overdueTotal = (data?.overdueInvoices ?? []).reduce((a, i) => a + i.remaining, 0)
  const hasOverdue = (data?.overdueInvoices?.length ?? 0) > 0

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      {/* ═════════ Hero — مبيعات اليوم + منحنى الأيام الأخيرة ═════════ */}
      <section className="overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm">
        <div
          className="grid grid-cols-1 gap-6 p-4 sm:p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
          style={{ background: 'radial-gradient(560px 220px at 100% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent)' }}
        >
          {/* الرقم الأساسي */}
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                    {greeting}، <span className="text-primary">{user?.name ?? 'مستخدم'}</span>
                  </h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground sm:text-sm">
                    <span>{todayAr}</span>
                    {insight && (
                      <>
                        <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-semibold',
                            insight.tone === 'success' && 'text-success',
                            insight.tone === 'warning' && 'text-warning-subtle-foreground',
                            insight.tone === 'neutral' && 'text-muted-foreground',
                          )}
                        >
                          {insight.tone === 'success' && <TrendingUp className="size-3" />}
                          {insight.tone === 'warning' && <TrendingDown className="size-3" />}
                          {insight.tone === 'neutral' && <Minus className="size-3" />}
                          {insight.text}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load()}
                  disabled={loading}
                  className="shrink-0 gap-2"
                >
                  <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                  تحديث
                </Button>
              </div>

              <p className="mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="size-2 rounded-full bg-primary" />
                مبيعات اليوم
              </p>
              {loadingFirst ? (
                <Skeleton className="mt-3 h-14 w-56" />
              ) : (
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="max-w-full break-all text-[2.35rem] font-extrabold leading-tight tracking-tight tabular-nums min-[380px]:text-5xl sm:text-6xl">
                    {Number(data?.todaySales ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-lg font-semibold text-muted-foreground">جنيه</span>
                </div>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {data?.todaySalesCount ?? 0} فاتورة اليوم
                </span>
                {data?.canViewProfits !== false && (() => {
                  const pr = data?.todayProfit ?? 0
                  const tone = pr > 0 ? TONE.success.chip : pr < 0 ? TONE.danger.chip : TONE.neutral.chip
                  const PIcon = pr > 0 ? TrendingUp : pr < 0 ? TrendingDown : Minus
                  return (
                    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold', tone)}>
                      <PIcon className="size-3" />
                      ربح {formatCurrency(pr)}
                    </span>
                  )
                })()}
              </p>
            </div>

            {compareRows.length > 0 && (
              <div className="space-y-2.5 border-t border-border pt-4">
                {compareRows.map((r) => (
                  <div key={r.label} className="flex items-center gap-3 text-xs">
                    <span className={cn('w-24 shrink-0', r.strong ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                      {r.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', r.strong ? 'bg-primary' : 'bg-muted-foreground/35')}
                        style={{ width: r.v > 0 ? `${Math.max(3, (r.v / compareMax) * 100)}%` : '0%' }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-end font-bold tabular-nums">{formatCurrency(Math.round(r.v))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* منحنى المبيعات */}
          <div className="min-w-0">
            <PanelTitle
              icon={Activity}
              title={`مبيعات آخر ${chartDays} يوم`}
              action={
                <div className="flex items-center gap-0.5 rounded-xl border border-border bg-muted/50 p-0.5">
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setChartDays(d)
                        load(d)
                      }}
                      className={cn(
                        'whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                        chartDays === d
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {d} يوم
                    </button>
                  ))}
                </div>
              }
            />
            <div className="mt-3 h-48 w-full sm:h-52">
              {loadingFirst ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={days} margin={{ top: showBarLabels ? 20 : 8, right: 8, left: isMobile ? 8 : 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={isMobile ? 10 : 11}
                      ticks={xTicks}
                      interval={0}
                      tickMargin={6}
                    />
                    <YAxis
                      hide={isMobile}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={40}
                      tickCount={4}
                      tickFormatter={compactNum}
                    />
                    <Tooltip
                      cursor={{ fill: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
                      content={({ active, payload }) => {
                        const row = active ? (payload?.[0]?.payload as { date: string; total: number; profit: number } | undefined) : undefined
                        if (!row) return null
                        return (
                          <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                            <p className="mb-1 font-bold tabular-nums">{row.date}</p>
                            <p className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">المبيعات</span>
                              <span className="font-bold tabular-nums">{formatCurrency(row.total)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-4">
                              {showProfits && <span className="text-muted-foreground">الربح</span>}
                              {showProfits && <span className="font-bold tabular-nums text-success">{formatCurrency(row.profit ?? 0)}</span>}
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="total"
                      name="المبيعات"
                      fill="var(--primary)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={44}
                      minPointSize={(v: number) => (v > 0 ? 4 : 0)}
                    >
                      {showBarLabels && (
                        <LabelList
                          dataKey="total"
                          position="top"
                          fontSize={10}
                          className="fill-muted-foreground font-semibold"
                          formatter={(v: number) => (v > 0 ? compactNum(v) : '')}
                        />
                      )}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 ps-1 text-[11px] text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-primary" />
              مبيعات
              <span className="text-muted-foreground/60">— <span className="hidden sm:inline">مرّر الماوس</span><span className="sm:hidden">المس</span> أي يوم لعرض الربح</span>
            </div>
          </div>
        </div>

        {/* شريط الأرقام */}
        {/* الجوال: قائمة صفوف بعرض كامل */}
        <div className="divide-y divide-border border-t border-border sm:hidden">
          {(() => {
            const n = (v: number | undefined) =>
              Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
            const low = data?.lowStockCount ?? 0
            return (
              <>
                <MobileStat label="رصيد الخزنة" value={n(data?.cashBalance)} unit="جنيه" dot="bg-sky-500" loading={loadingFirst} />
                <MobileStat label="مبيعات الشهر" value={n(data?.monthSales)} unit="جنيه" dot="bg-primary" loading={loadingFirst} />
                {data?.canViewProfits !== false && (
                  <MobileStat
                    label="ربح الشهر"
                    value={n(data?.monthProfit)}
                    unit="جنيه"
                    dot="bg-emerald-500"
                    sub={showProfits && margin !== null ? `هامش آخر ${chartDays} يوم: ${margin}%` : undefined}
                    loading={loadingFirst}
                  />
                )}
                <MobileStat label="العملاء" value={String(data?.customersCount ?? 0)} dot="bg-teal-500" href="/customers" loading={loadingFirst} />
                <MobileStat
                  label="تنبيهات المخزون"
                  value={String(low)}
                  dot={low > 0 ? 'bg-amber-500' : 'bg-emerald-500'}
                  sub={low > 0 ? 'مراجعة المخزون' : t('كل المنتجات فوق الحد الأدنى')}
                  href={low > 0 ? '/inventory' : undefined}
                  loading={loadingFirst}
                />
              </>
            )
          })()}
        </div>

        {/* الشاشات الأكبر: شريط الأرقام */}
        <div className="hidden grid-cols-2 border-t border-border sm:grid lg:grid-cols-5">
          <StatCell
            className="border-b border-e lg:border-b-0"
            label="رصيد الخزنة"
            value={formatCurrency(data?.cashBalance ?? 0)}
            loading={loadingFirst}
            dot="bg-sky-500"
          />
          <StatCell
            className="border-b lg:border-b-0 lg:border-e"
            label="مبيعات الشهر"
            value={formatCurrency(data?.monthSales ?? 0)}
            loading={loadingFirst}
            dot="bg-primary"
          />
          {data?.canViewProfits !== false && (
            <StatCell
              className="border-b border-e lg:border-b-0"
              label="ربح الشهر"
              value={formatCurrency(data?.monthProfit ?? 0)}
              loading={loadingFirst}
              dot="bg-emerald-500"
              foot={margin !== null ? <span>هامش آخر {chartDays} يوم: {margin}%</span> : undefined}
            />
          )}
          <StatCell
            className="border-b lg:border-b-0 lg:border-e"
            label="العملاء"
            value={String(data?.customersCount ?? 0)}
            loading={loadingFirst}
            dot="bg-teal-500"
            foot={
              <Link href="/customers" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                عرض العملاء <ArrowUpLeft className="size-3" />
              </Link>
            }
          />
          <StatCell
            className="col-span-2 lg:col-span-1"
            label="تنبيهات المخزون"
            value={String(data?.lowStockCount ?? 0)}
            loading={loadingFirst}
            dot={(data?.lowStockCount ?? 0) > 0 ? 'bg-amber-500' : 'bg-emerald-500'}
            foot={
              (data?.lowStockCount ?? 0) > 0 ? (
                <Link href="/inventory" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  مراجعة المخزون <ArrowUpLeft className="size-3" />
                </Link>
              ) : (
                <span>{t('كل المنتجات فوق الحد الأدنى')}</span>
              )
            }
          />
        </div>
      </section>

      {/* ═════════ بانر الفواتير المتأخرة — يظهر بس لو فيه متأخرات ═════════ */}
      {hasOverdue && (
        <section className="overflow-hidden rounded-3xl border border-orange-300/60 bg-orange-50/70 dark:border-orange-500/30 dark:bg-orange-500/10 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-300/50 dark:border-orange-500/20 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
                <AlertTriangle className="size-4" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold">فواتير متأخرة محتاجة تحصيل</h2>
                <p className="text-[11px] text-muted-foreground">
                  {data!.overdueInvoices.length} فاتورة • إجمالي{' '}
                  <span className="font-bold text-orange-700 dark:text-orange-300">{formatCurrency(overdueTotal)}</span>
                </p>
              </div>
            </div>
            <Link
              href="/sales"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-orange-300/60 bg-card px-2.5 text-[11px] font-bold text-orange-700 transition-colors hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-500/10"
            >
              عرض الكل
              <ArrowUpLeft className="size-3" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {data!.overdueInvoices.slice(0, 3).map((inv) => {
              const days = inv.dueDate
                ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000))
                : 0
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{inv.customerName ?? 'عميل'}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{inv.invoiceNo ?? `#${inv.id}`}</span>
                      {days > 0 && (
                        <>
                          <span className="h-3 w-px bg-border" />
                          <span className="font-semibold text-orange-700 dark:text-orange-300">
                            متأخرة {days} يوم
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-extrabold tabular-nums">
                    {formatCurrency(inv.remaining)}
                  </p>
                </li>
              )
            })}
            {data!.overdueInvoices.length > 3 && (
              <li className="px-5 py-2 text-center text-[11px] font-semibold text-warning-subtle-foreground">
                + {data!.overdueInvoices.length - 3} فواتير أخرى
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ═════════ أكثر المنتجات + المخزون المنخفض + الصيانة ═════════ */}
      <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2', hasMaintenance ? 'xl:grid-cols-3' : 'xl:grid-cols-2')}>
        {/* أكثر المنتجات مبيعاً */}
        <Card className="min-w-0 gap-4 rounded-3xl py-5 shadow-sm">
          <CardHeader className="px-5">
            <PanelTitle icon={Trophy} title={t('أكثر المنتجات مبيعاً')} tone="text-amber-500" />
            <p className="text-xs text-muted-foreground">آخر 30 يوم</p>
          </CardHeader>
          <CardContent className="px-5">
            {loading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : data?.topProducts?.length ? (
              <ol className="divide-y divide-border">
                {data.topProducts.map((p, i) => {
                  const maxQty = data.topProducts[0]?.quantity || 1
                  return (
                    <li key={p.name + i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums',
                          rankBadgeStyle(i + 1),
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{p.name}</p>
                          <p className="shrink-0 text-xs font-semibold tabular-nums">{formatCurrency(p.total)}</p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/80"
                              style={{ width: `${Math.max(6, (p.quantity / maxQty) * 100)}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                            {formatQtyUnit(p.quantity, p.unitLabel)}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <ShoppingBag className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">لا توجد مبيعات خلال آخر 30 يوم</p>
                <Link href="/pos" className="text-xs font-semibold text-primary hover:underline">
                  ابدأ البيع من نقطة البيع
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* مخزون منخفض */}
        <Card className="min-w-0 gap-4 rounded-3xl py-5 shadow-sm">
          <CardHeader className="px-5">
            <PanelTitle
              icon={AlertCircle}
              title="مخزون منخفض"
              tone="text-destructive"
              action={
                (data?.lowStockProducts?.length ?? 0) > 0 ? (
                  <Link href="/inventory" className="text-xs font-semibold text-primary hover:underline">
                    عرض الكل
                  </Link>
                ) : undefined
              }
            />
            <p className="text-xs text-muted-foreground">{t('المنتجات تحت الحد الأدنى')}</p>
          </CardHeader>
          <CardContent className="px-5">
            {loading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : data?.lowStockProducts?.length ? (
              <>
              <ul className="space-y-1.5">
                {data.lowStockProducts.slice(0, 8).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2.5 rounded-xl bg-destructive-subtle/50 px-3 py-2.5 text-sm"
                  >
                    <StatusDot status="danger" pulse />
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-destructive-subtle-foreground">
                      {p.quantity} / {p.minQuantity}
                    </span>
                  </li>
                ))}
              </ul>
              {data.lowStockProducts.length > 8 && (
                <Link href="/inventory" className="mt-2.5 block text-center text-xs font-semibold text-primary hover:underline">
                  + {data.lowStockProducts.length - 8} منتج آخر — عرض الكل
                </Link>
              )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-8 text-success" />
                <p className="text-sm font-medium text-muted-foreground">المخزون في مستوى جيد</p>
                <p className="text-xs text-muted-foreground/70">لا توجد منتجات تحت الحد الأدنى</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* صيانة نشطة */}
        {hasMaintenance && (
          <Card className="min-w-0 gap-4 rounded-3xl py-5 shadow-sm md:col-span-2 xl:col-span-1">
            <CardHeader className="px-5">
              <PanelTitle
                icon={Wrench}
                title="صيانة نشطة"
                action={
                  <Link href="/maintenance" className="text-xs font-semibold text-primary hover:underline">
                    عرض الكل
                  </Link>
                }
              />
              <p className="text-xs text-muted-foreground">أوامر الصيانة الجارية</p>
            </CardHeader>
            <CardContent className="px-5">
              {loading && !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full" />
                  ))}
                </div>
              ) : data?.activeMaintenanceOrders?.length ? (
                <ul className="divide-y divide-border">
                  {data.activeMaintenanceOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{o.customerName}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{o.device}</span>
                          <span className="h-3 w-px shrink-0 bg-border" />
                          <DateStamp iso={o.receivedAt} tz={tz} />
                        </p>
                      </div>
                      <StatusChip tone={maintenanceTone(o.status)}>{o.status}</StatusChip>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <Wrench className="size-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">لا توجد أوامر صيانة نشطة</p>
                  <Link href="/maintenance" className="text-xs font-semibold text-primary hover:underline">
                    إضافة أمر صيانة جديد
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═════════ آخر المبيعات + المركز المالي ═════════ */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {/* ═════════ آخر المبيعات — سجل مجمّع بالأيام ═════════ */}
      <section className="min-w-0 overflow-hidden rounded-3xl border bg-card shadow-sm xl:flex xl:h-[620px] xl:flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <PanelTitle icon={Receipt} title="آخر المبيعات" />
            <p className="mt-1 text-xs text-muted-foreground">
              {saleGroups.count > 0 ? `آخر ${saleGroups.count} فاتورة` : 'لسه مفيش فواتير'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {saleGroups.groups.length > 1 && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">إجمالي المعروض</p>
                <p className="text-lg font-extrabold tabular-nums leading-tight">{formatCurrency(saleGroups.total)}</p>
              </div>
            )}
            <Link
              href="/sales"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-primary-subtle-foreground"
            >
              سجل المبيعات
              <ArrowUpLeft className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* القائمة قابلة للتمرير جوّانيًا على شاشات كبيرة */}
        <div className="min-h-0 flex-1 xl:overflow-y-auto">
          {loading && !data ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : saleGroups.count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
              <Receipt className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">لا توجد مبيعات بعد</p>
              <Link href="/pos" className="text-xs font-semibold text-primary hover:underline">
                ابدأ أول فاتورة من نقطة البيع
              </Link>
            </div>
          ) : (
            saleGroups.groups.map((g) => (
              <div key={g.key}>
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2 text-xs">
                  <span className="font-bold text-foreground/80">{g.label}</span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span>{g.rows.length} فاتورة</span>
                    <span className="font-bold tabular-nums text-foreground/80">{formatCurrency(g.total)}</span>
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {g.rows.map((s) => {
                    const returned = s.status === 'مرتجعة'
                    const done = s.status === 'مكتملة'
                    const remaining = Math.max(0, (s.total ?? 0) - (s.paid ?? 0))
                    const Icon = returned ? Undo2 : done ? Check : Clock
                    const tone: Tone = returned ? 'danger' : done ? 'success' : 'warning'
                    return (
                      <li
                        key={s.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-5 py-3.5 transition-colors hover:bg-muted/40 md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto]"
                      >
                        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', TONE[tone].chip)}>
                          <Icon className="size-4" strokeWidth={2.4} />
                          <span className="sr-only">{s.status}</span>
                        </span>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold tabular-nums">{s.invoiceNo ?? `#${s.id}`}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {s.customerName ?? 'بدون عميل'}
                          </p>
                        </div>

                        <DateStamp iso={s.createdAt} tz={tz} className="hidden md:inline-flex" />

                        <div className="text-end">
                          <p className={cn('text-[15px] font-extrabold tabular-nums', returned && 'text-muted-foreground line-through decoration-destructive/60')}>
                            {formatCurrency(s.total)}
                          </p>
                          {returned ? (
                            <p className="mt-0.5 text-[11px] font-bold text-destructive">مرتجعة</p>
                          ) : remaining > 0 ? (
                            <p className="mt-0.5 text-[11px] font-bold text-warning-subtle-foreground">
                              متبقي {formatCurrency(remaining)}
                            </p>
                          ) : (
                            <DateStamp iso={s.createdAt} tz={tz} className="md:hidden" />
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
      {/* ═════════ المركز المالي — عمود جانبي ═════════ */}
      <section className="min-w-0 overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Boxes className="size-4 text-primary" />
          <h2 className="text-[15px] font-bold">المركز المالي</h2>
        </div>
        <ul className="divide-y divide-border">
          {[
            { label: 'المخزون (تكلفة)', v: data?.stockValueCost ?? 0, dot: 'bg-slate-400' },
            { label: 'المخزون (بيع)', v: data?.stockValuePrice ?? 0, dot: 'bg-primary' },
            { label: 'ديون العملاء', v: data?.totalOutstandingDebt ?? 0, dot: 'bg-amber-500' },
            { label: 'مستحق الموردين', v: data?.totalSupplierDebt ?? 0, dot: 'bg-rose-500' },
          ].map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={cn('size-2 rounded-full', r.dot)} />
                {r.label}
              </span>
              {loadingFirst ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <span className="text-base font-extrabold tabular-nums">{formatCurrency(r.v)}</span>
              )}
            </li>
          ))}
        </ul>
        {data?.canViewProfits !== false && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-primary-subtle/60 px-5 py-3.5">
            <span className="text-xs font-semibold text-primary-subtle-foreground">الربح المتوقع من المخزون</span>
            <span className="text-base font-extrabold tabular-nums text-primary-subtle-foreground">
              {formatCurrency((data?.stockValuePrice ?? 0) - (data?.stockValueCost ?? 0))}
            </span>
          </div>
        )}
      </section>
      </div>
    </div>
  )
}