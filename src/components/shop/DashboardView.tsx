'use client'

import * as React from 'react'
import { useVocab } from '@/lib/vocab'
import { formatQtyUnit } from '@/lib/unit-label'
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
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
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { runCycleCountAutomation } from '@/lib/cycle-count-client'
import { MyCommissionCard } from './MyCommissionCard'
import { useDataRefresh } from '@/lib/offline/data-events'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Chip,
  EmptyState,
  Icon3D,
  Meter,
  PANEL,
  PanelHeader,
  SoftLink,
  StatCell,
  TONE3D,
  StatStrip,
  type ChipTone,
  type Tone3D,
} from './dashboard-ui'

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

/* رقم فلوس موحّد: من غير كسور لو صحيح، وإلا قرشين ثابتين (59,837.30 مش 59,837.3) */
function fmtMoney(v: number | null | undefined): string {
  const x = Number(v ?? 0)
  return x.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 })
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

/* عدد الفواتير المعروضة في «آخر المبيعات» — الباقي في سجل المبيعات */
const RECENT_SALES_LIMIT = 6

/* أيقونة حالة صغيرة مسطّحة — بتظهر بس للفواتير اللي حالتها تستاهل الانتباه (مرتجعة / متبقي) */
function StatusGlyph({ icon: Icon, tone }: { icon: React.ElementType; tone: Tone3D }) {
  return (
    <span aria-hidden className={cn('grid size-6 shrink-0 place-items-center rounded-md [&_svg]:size-3.5', TONE3D[tone].soft)}>
      <Icon strokeWidth={2.4} />
    </span>
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
      return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
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
   
  }, [chartDays])

  React.useEffect(() => {
    load()

    // 🔄 (التحديث الثاني عشر) محرك الجرد الدوري المجدول: أول فتح للداشبورد
    // بيشغّل الفحص (بخصر 10 دقايق لكل جلسة) — الأوراق المستحقة بتتولّد تلقائياً
    void runCycleCountAutomation()

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
    const rows = (data?.last10Sales ?? []).slice(0, RECENT_SALES_LIMIT)
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

  const hasRemaining = (data?.last10Sales ?? []).slice(0, RECENT_SALES_LIMIT).some(
    (r) => r.status !== 'مرتجعة' && Math.max(0, (r.total ?? 0) - (r.paid ?? 0)) > 0,
  )

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

  const monthMargin = (data?.monthSales ?? 0) > 0 ? Math.round(((data?.monthProfit ?? 0) / (data?.monthSales ?? 1)) * 100) : null
  const avgDaily = days.length ? weekTotal / days.length : 0
  const bestDay = days.reduce<(typeof days)[number] | null>((b, d) => (!b || d.total > b.total ? d : b), null)
  const todayDate = days.length ? days[days.length - 1].date : ''
  // تيك المحور السيني: آخر يوم يظهر «اليوم» بلون الهوية
  const renderTick = (p: { x?: number; y?: number; payload?: { value: string } }) => {
    const isToday = p.payload?.value === todayDate
    return (
      <text
        x={p.x}
        y={(p.y ?? 0) + 10}
        textAnchor="middle"
        fontSize={isMobile ? 10 : 11}
        className={isToday ? 'fill-primary font-extrabold' : 'fill-muted-foreground'}
      >
        {isToday ? 'اليوم' : p.payload?.value}
      </text>
    )
  }

  // 🛡️ ملخص الفواتير المتأخرة (لو موجودة)
  const overdueTotal = (data?.overdueInvoices ?? []).reduce((a, i) => a + i.remaining, 0)
  const hasOverdue = (data?.overdueInvoices?.length ?? 0) > 0

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      {/* ═════════ 💰 عمولتي (التحديث الثالث عشر) — للبائع بس ═════════ */}
      <MyCommissionCard />

      {/* ═════════ Hero — سطح واحد: مبيعات اليوم + منحنى الأيام (من غير كروت متداخلة) ═════════ */}
      <section className={cn(PANEL, 'overflow-hidden')}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
              {greeting}، <span className="text-primary">{user?.name ?? 'مستخدم'}</span>
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">{todayAr}</p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="تحديث"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-bold text-foreground/80 transition-colors hover:bg-muted/60 disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>

        <div className="grid grid-cols-1 border-t lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* مبيعات اليوم */}
          <div className="flex min-w-0 flex-col gap-5 bg-gradient-to-bl from-primary/[0.05] to-transparent p-4 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <ShoppingBag className="size-4" strokeWidth={2.2} />
              </span>
              <div>
                <p className="text-sm font-extrabold">مبيعات اليوم</p>
                {/* 🛡️ ج-2: الأرقام صافي بعد المرتجعات — عشان المدير يعرف المعيار */}
                <p className="text-[11px] font-medium text-muted-foreground">صافي بعد المرتجعات</p>
              </div>
            </div>

            <div className="my-auto flex flex-col gap-5">
            {loadingFirst ? (
              <Skeleton className="h-14 w-56" />
            ) : (
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="text-5xl font-black leading-none tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-6xl">
                  {fmtMoney(data?.todaySales)}
                </span>
                <span className="text-base font-bold text-muted-foreground">جنيه</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {insight && (
                <Chip tone={insight.tone === 'success' ? 'success' : insight.tone === 'warning' ? 'warning' : 'neutral'} className="gap-1 font-semibold">
                  {insight.tone === 'success' && <TrendingUp className="size-3" />}
                  {insight.tone === 'warning' && <TrendingDown className="size-3" />}
                  {insight.tone === 'neutral' && <Minus className="size-3" />}
                  {insight.text}
                </Chip>
              )}
              <Chip tone="neutral" className="gap-1.5 font-semibold">
                <Receipt className="size-3.5" />
                {data?.todaySalesCount ?? 0} فاتورة
              </Chip>
              {data?.canViewProfits !== false && (() => {
                const pr = data?.todayProfit ?? 0
                const tone: ChipTone = pr > 0 ? 'success' : pr < 0 ? 'danger' : 'neutral'
                return (
                  <Chip tone={tone} className="gap-1 font-semibold">
                    ربح {formatCurrency(pr)}
                  </Chip>
                )
              })()}
            </div>
            </div>

            {compareRows.length > 0 && (
              <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card/70 [&>div+div]:border-s">
                {compareRows.filter((r) => !r.strong).map((r) => (
                  <div key={r.label} className="min-w-0 px-3 py-2.5">
                    <dt className={cn('truncate text-[11px]', r.strong ? 'font-extrabold text-primary' : 'font-medium text-muted-foreground')}>{r.label}</dt>
                    <dd className="mt-0.5 truncate text-sm font-extrabold tabular-nums">{fmtMoney(Math.round(r.v))}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* منحنى المبيعات */}
          <div className="min-w-0 border-t p-4 sm:p-6 lg:border-s lg:border-t-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <Activity className="size-4" strokeWidth={2.2} />
                </span>
                <h2 className="text-sm font-extrabold">{`مبيعات آخر ${chartDays} يوم`}</h2>
              </div>
              <div role="tablist" className="flex items-center gap-0.5 rounded-xl bg-muted p-0.5">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={chartDays === d}
                    onClick={() => {
                      setChartDays(d)
                      load(d)
                    }}
                    className={cn(
                      'whitespace-nowrap rounded-lg px-3 py-1 text-xs font-bold transition-all',
                      chartDays === d ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d} يوم
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-4 h-52 w-full sm:h-60">
              {loadingFirst ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={days} margin={{ top: showBarLabels ? 20 : 8, right: 8, left: isMobile ? 8 : 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" className="stroke-border" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} ticks={xTicks} interval={0} tickMargin={6} tick={renderTick} />
                      <YAxis
                        hide={isMobile}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={40}
                        tickCount={4}
                        tick={{ fill: 'var(--muted-foreground)' }}
                        tickFormatter={compactNum}
                      />
                      <Tooltip
                        cursor={{ fill: 'color-mix(in srgb, var(--primary) 7%, transparent)', radius: 10 }}
                        content={({ active, payload }) => {
                          const row = active ? (payload?.[0]?.payload as { date: string; total: number; profit: number } | undefined) : undefined
                          if (!row) return null
                          return (
                            <div className="rounded-2xl border bg-popover px-3.5 py-2.5 text-xs text-popover-foreground shadow-lg">
                              <p className="mb-1.5 font-extrabold tabular-nums">{row.date}</p>
                              <p className="flex items-center justify-between gap-5">
                                <span className="text-muted-foreground">المبيعات</span>
                                <span className="font-extrabold tabular-nums">{formatCurrency(row.total)}</span>
                              </p>
                              {showProfits && (
                                <p className="mt-0.5 flex items-center justify-between gap-5">
                                  <span className="text-muted-foreground">الربح</span>
                                  <span className="font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(row.profit ?? 0)}</span>
                                </p>
                              )}
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="total" name="المبيعات" radius={[8, 8, 3, 3]} maxBarSize={44} minPointSize={3}>
                        {days.map((d, i) => (
                          <Cell
                            key={i}
                            fill={
                              i === days.length - 1
                                ? 'var(--primary)'
                                : d.total > 0
                                  ? 'color-mix(in srgb, var(--primary) 50%, transparent)'
                                  : 'var(--border)'
                            }
                          />
                        ))}
                        {showBarLabels && (
                          <LabelList
                            dataKey="total"
                            position="top"
                            fontSize={10}
                            className="fill-muted-foreground font-bold"
                            formatter={(v: number) => (v > 0 ? compactNum(v) : '')}
                          />
                        )}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                  {weekTotal === 0 && (
                    <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs font-semibold text-muted-foreground">
                      مفيش مبيعات في الفترة دي
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ملخص الفترة بدل سطر «مرّر الماوس» */}
            <dl className={cn('mt-4 grid grid-cols-2 gap-y-3 border-t pt-4 text-xs sm:[&>div+div]:border-s sm:[&>div]:px-4 sm:[&>div:first-child]:ps-0', showProfits ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
              {[
                { k: 'إجمالي الفترة', v: fmtMoney(weekTotal) },
                { k: 'متوسط يومي', v: fmtMoney(Math.round(avgDaily)) },
                { k: 'أفضل يوم', v: bestDay && bestDay.total > 0 ? `${fmtMoney(bestDay.total)}` : '—', sub: bestDay && bestDay.total > 0 ? bestDay.date : undefined },
                ...(showProfits ? [{ k: 'ربح الفترة', v: fmtMoney(weekProfit) }] : []),
              ].map((s) => (
                <div key={s.k} className="min-w-0">
                  <dt className="text-[11px] font-medium text-muted-foreground">{s.k}</dt>
                  <dd className="mt-0.5 truncate text-sm font-extrabold tabular-nums">{s.v}</dd>
                  <dd className="h-4 text-[11px] font-medium tabular-nums text-muted-foreground">{'sub' in s && s.sub ? s.sub : ''}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ═════════ كروت المؤشرات ═════════ */}
      {(() => {
        const n = fmtMoney
        const low = data?.lowStockCount ?? 0
        const cellCount = 4 + (showProfits ? 1 : 0) + (hasMaintenance ? 1 : 0)
        return (
          <>
            {/* الجوال: صفوف بعرض كامل */}
            <div className={cn(PANEL, 'divide-y divide-border overflow-hidden sm:hidden')}>
              {[
                { label: 'رصيد الخزنة', value: n(data?.cashBalance), unit: 'جنيه', icon: Wallet, tone: 'sky' as Tone3D },
                { label: 'مبيعات الشهر', value: n(data?.monthSales), unit: 'جنيه', icon: ShoppingBag, tone: 'emerald' as Tone3D },
                ...(showProfits
                  ? [{
                      label: 'ربح الشهر', value: n(data?.monthProfit), unit: 'جنيه', icon: TrendingUp, tone: 'teal' as Tone3D,
                      sub: monthMargin !== null ? `هامش الربح ${monthMargin}%` : undefined,
                    }]
                  : []),
                { label: 'العملاء', value: String(data?.customersCount ?? 0), icon: Users, tone: 'violet' as Tone3D, href: '/customers' },
                ...(hasMaintenance
                  ? [{ label: 'صيانة نشطة', value: String(data?.activeMaintenance ?? 0), icon: Wrench, tone: 'sky' as Tone3D, href: '/maintenance' }]
                  : []),
                {
                  label: 'تنبيهات المخزون', value: String(low), icon: AlertTriangle, tone: (low > 0 ? 'amber' : 'emerald') as Tone3D,
                  sub: low > 0 ? 'مراجعة المخزون' : t('كل المنتجات فوق الحد الأدنى'), href: low > 0 ? '/inventory' : undefined,
                },
              ].map((r) => {
                const body = (
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <Icon3D icon={r.icon} tone={r.tone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-muted-foreground">{r.label}</p>
                      {'sub' in r && r.sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{r.sub}</p>}
                    </div>
                    {loadingFirst ? (
                      <Skeleton className="h-6 w-24 shrink-0" />
                    ) : (
                      <p className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
                        <span className="text-lg font-black tabular-nums">{r.value}</span>
                        {'unit' in r && r.unit && <span className="text-[11px] font-semibold text-muted-foreground">{r.unit}</span>}
                        {'href' in r && r.href && <ArrowUpLeft className="size-3.5 self-center text-muted-foreground/60" />}
                      </p>
                    )}
                  </div>
                )
                return 'href' in r && r.href ? (
                  <Link key={r.label} href={r.href} className="block transition-colors active:bg-muted/50">{body}</Link>
                ) : (
                  <div key={r.label}>{body}</div>
                )
              })}
            </div>
            {/* الشاشات الأكبر: شريط مؤشرات بسطح واحد */}
            <StatStrip className={cn('hidden grid-cols-2 sm:grid', ({ 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' } as Record<number, string>)[cellCount])}>
              <StatCell label="رصيد الخزنة" value={n(data?.cashBalance)} unit="جنيه" icon={Wallet} tone="sky" loading={loadingFirst} foot="الرصيد الحالي" />
              <StatCell label="مبيعات الشهر" value={n(data?.monthSales)} unit="جنيه" icon={ShoppingBag} tone="emerald" loading={loadingFirst} foot="صافي بعد المرتجعات" />
              {showProfits && (
                <StatCell
                  label="ربح الشهر"
                  value={n(data?.monthProfit)}
                  unit="جنيه"
                  icon={TrendingUp}
                  tone="teal"
                  loading={loadingFirst}
                  foot={monthMargin !== null ? `هامش الربح ${monthMargin}%` : 'الربح التقديري'}
                />
              )}
              <StatCell
                label="العملاء"
                value={String(data?.customersCount ?? 0)}
                icon={Users}
                tone="violet"
                loading={loadingFirst}
                href="/customers"
                foot={<><span className="font-bold text-primary">عرض العملاء</span><ArrowUpLeft className="size-3 text-primary" /></>}
              />
              {hasMaintenance && (
                <StatCell
                  label="صيانة نشطة"
                  value={String(data?.activeMaintenance ?? 0)}
                  icon={Wrench}
                  tone="sky"
                  loading={loadingFirst}
                  href="/maintenance"
                  foot={<><span className="font-bold text-primary">أوامر الصيانة</span><ArrowUpLeft className="size-3 text-primary" /></>}
                />
              )}
              <StatCell
                className={cellCount % 2 === 1 ? 'col-span-2 lg:col-span-1' : undefined}
                label="تنبيهات المخزون"
                value={String(low)}
                icon={AlertTriangle}
                tone={low > 0 ? 'amber' : 'emerald'}
                loading={loadingFirst}
                href={low > 0 ? '/inventory' : undefined}
                foot={
                  low > 0 ? (
                    <><span className="font-bold text-primary">مراجعة المخزون</span><ArrowUpLeft className="size-3 text-primary" /></>
                  ) : (
                    <span>{t('كل المنتجات فوق الحد الأدنى')}</span>
                  )
                }
              />
            </StatStrip>
          </>
        )
      })()}

      {/* ═════════ بانر الفواتير المتأخرة — يظهر بس لو فيه متأخرات ═════════ */}
      {hasOverdue && (
        <section className={cn(PANEL, 'overflow-hidden border-amber-300/50 bg-gradient-to-l from-amber-50/70 via-card to-card dark:border-amber-500/25 dark:from-amber-500/10')}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/40 px-5 py-4 dark:border-amber-500/15">
            <PanelHeader
              icon={AlertTriangle}
              tone="amber"
              title="فواتير متأخرة محتاجة تحصيل"
              subtitle={
                <>
                  {data!.overdueInvoices.length} فاتورة • إجمالي{' '}
                  <span className="font-extrabold text-amber-700 dark:text-amber-300">{formatCurrency(overdueTotal)}</span>
                </>
              }
            />
            <SoftLink href="/sales">عرض الكل</SoftLink>
          </div>
          <ul className="divide-y divide-border/70">
            {data!.overdueInvoices.slice(0, 3).map((inv) => {
              const days = inv.dueDate
                ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000))
                : 0
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-amber-500/5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{inv.customerName ?? 'عميل'}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{inv.invoiceNo ?? `#${inv.id}`}</span>
                      {days > 0 && <Chip tone="warning" className="px-1.5 py-0.5">متأخرة {days} يوم</Chip>}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-black tabular-nums">{formatCurrency(inv.remaining)}</p>
                </li>
              )
            })}
            {data!.overdueInvoices.length > 3 && (
              <li className="px-5 py-2.5 text-center text-[11px] font-bold text-amber-700 dark:text-amber-300">
                + {data!.overdueInvoices.length - 3} فواتير أخرى
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ═════════ أكثر المنتجات + المخزون المنخفض ═════════ */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {/* أكثر المنتجات مبيعاً */}
        <section className={cn(PANEL, 'min-w-0 p-5')}>
          <PanelHeader icon={Trophy} tone="amber" title={t('أكثر المنتجات مبيعاً')} subtitle="آخر 30 يوم" />
          <div className="mt-4">
            {loading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : data?.topProducts?.length ? (
              <ol className="space-y-1">
                {data.topProducts.slice(0, 5).map((p, i) => {
                  const maxQty = data.topProducts[0]?.quantity || 1
                  const medal = [
                    'from-amber-300 to-amber-500 shadow-amber-500/30',
                    'from-slate-300 to-slate-400 shadow-slate-500/25',
                    'from-orange-300 to-orange-500 shadow-orange-500/25',
                  ][i]
                  return (
                    <li key={p.name + i} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/50">
                      {medal ? (
                        <span className={cn('relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br text-xs font-black text-white shadow-md ring-1 ring-inset ring-white/30', medal)}>
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                          <span className="relative drop-shadow">{i + 1}</span>
                        </span>
                      ) : (
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-bold">{p.name}</p>
                          <p className="shrink-0 text-xs font-extrabold tabular-nums">{formatCurrency(p.total)}</p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Meter pct={Math.max(6, (p.quantity / maxQty) * 100)} tone="emerald" className="h-1.5 flex-1" />
                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {formatQtyUnit(p.quantity, p.unitLabel)}
                          </span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <EmptyState
                icon={ShoppingBag}
                tone="amber"
                title="لا توجد مبيعات خلال آخر 30 يوم"
                action={
                  <Link href="/pos" className="text-xs font-bold text-primary hover:underline">
                    ابدأ البيع من نقطة البيع
                  </Link>
                }
              />
            )}
          </div>
        </section>

        {/* مخزون منخفض */}
        <section className={cn(PANEL, 'min-w-0 p-5')}>
          <PanelHeader
            icon={AlertCircle}
            tone="rose"
            title="مخزون منخفض"
            subtitle={t('المنتجات تحت الحد الأدنى')}
            action={(data?.lowStockProducts?.length ?? 0) > 0 ? <SoftLink href="/inventory">عرض الكل</SoftLink> : undefined}
          />
          <div className="mt-4">
            {loading && !data ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : data?.lowStockProducts?.length ? (
              <>
                <ul className="divide-y divide-border/70">
                  {data.lowStockProducts.slice(0, 5).map((p) => {
                    const out = p.quantity <= 0
                    const pct = p.minQuantity > 0 ? (p.quantity / p.minQuantity) * 100 : 0
                    return (
                      <li key={p.id} className="px-2 py-3 transition-colors hover:bg-muted/50">
                        <div className="flex items-center justify-between gap-2.5">
                          <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</span>
                          {out ? (
                            <Chip tone="danger" dot>نفد</Chip>
                          ) : (
                            <span className="shrink-0 text-xs font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
                              {p.quantity} / {p.minQuantity}
                            </span>
                          )}
                        </div>
                        <Meter pct={out ? 0 : Math.max(5, pct)} tone="rose" className="mt-2 h-1.5" />
                      </li>
                    )
                  })}
                </ul>
                {data.lowStockProducts.length > 5 && (
                  <Link href="/inventory" className="mt-3 block text-center text-xs font-bold text-primary hover:underline">
                    + {data.lowStockProducts.length - 5} منتج آخر — عرض الكل
                  </Link>
                )}
              </>
            ) : (
              <EmptyState icon={CheckCircle2} tone="emerald" title="المخزون في مستوى جيد" hint="لا توجد منتجات تحت الحد الأدنى" />
            )}
          </div>
        </section>
      </div>

      {/* ═════════ آخر المبيعات + المركز المالي ═════════ */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ═════════ آخر المبيعات — جدول حديث مجمّع بالأيام ═════════ */}
        <section className={cn(PANEL, 'min-w-0 overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <PanelHeader
              icon={Receipt}
              tone="emerald"
              title="آخر المبيعات"
              subtitle={saleGroups.count > 0 ? `آخر ${saleGroups.count} فاتورة` : 'لسه مفيش فواتير'}
            />
            <div className="flex items-center gap-4">
              {saleGroups.groups.length > 1 && (
                <div className="text-end">
                  <p className="text-[11px] font-medium text-muted-foreground">إجمالي المعروض</p>
                  <p className="text-lg font-black leading-tight tabular-nums">{formatCurrency(saleGroups.total)}</p>
                </div>
              )}
              <SoftLink href="/sales">سجل المبيعات</SoftLink>
            </div>
          </div>

          <div>
            {loading && !data ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : saleGroups.count === 0 ? (
              <EmptyState
                icon={Receipt}
                tone="emerald"
                title="لا توجد مبيعات بعد"
                action={
                  <Link href="/pos" className="text-xs font-bold text-primary hover:underline">
                    ابدأ أول فاتورة من نقطة البيع
                  </Link>
                }
              />
            ) : (
              <>
                {/* الشاشات المتوسطة فأكبر: جدول */}
                <table className="hidden w-full text-sm md:table">
                  <thead>
                    <tr className="border-b text-[11px] font-bold text-muted-foreground">
                      <th className="px-5 py-2.5 text-start font-bold">الفاتورة</th>
                      <th className="px-3 py-2.5 text-start font-bold">العميل</th>
                      <th className="px-3 py-2.5 text-start font-bold">الوقت</th>
                      <th className="px-3 py-2.5 text-center font-bold">الحالة</th>
                      <th className="px-3 py-2.5 text-end font-bold">الإجمالي</th>
                      {hasRemaining && <th className="px-5 py-2.5 text-end font-bold">المتبقي</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {saleGroups.groups.map((g) => (
                      <React.Fragment key={g.key}>
                        <tr>
                          <td colSpan={hasRemaining ? 6 : 5} className="border-b bg-muted/40 px-5 py-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-extrabold text-foreground/80">{g.label}</span>
                              <span className="flex items-center gap-3 text-muted-foreground">
                                <span>{g.rows.length} فاتورة</span>
                                <span className="font-extrabold tabular-nums text-foreground/80">{formatCurrency(g.total)}</span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.rows.map((s) => {
                          const returned = s.status === 'مرتجعة'
                          const done = s.status === 'مكتملة'
                          const remaining = Math.max(0, (s.total ?? 0) - (s.paid ?? 0))
                          const Icon = returned ? Undo2 : done ? Check : Clock
                          const tone: Tone3D = returned ? 'rose' : done ? 'emerald' : 'amber'
                          const chipTone: ChipTone = returned ? 'danger' : done ? 'success' : 'warning'
                          return (
                            <tr key={s.id} className="border-b border-border/70 transition-colors last:border-b-0 hover:bg-muted/40">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="font-extrabold tabular-nums">{s.invoiceNo ?? `#${s.id}`}</span>
                                  {!done && <StatusGlyph icon={Icon} tone={tone} />}
                                </div>
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-3 text-muted-foreground">{s.customerName ?? 'بدون عميل'}</td>
                              <td className="px-3 py-3"><DateStamp iso={s.createdAt} tz={tz} /></td>
                              <td className="px-3 py-3 text-center"><Chip tone={chipTone} dot>{s.status}</Chip></td>
                              <td className={cn('px-3 py-3 text-end text-[15px] font-black tabular-nums', returned && 'text-muted-foreground line-through decoration-rose-500/60')}>
                                {formatCurrency(s.total)}
                              </td>
                              {hasRemaining && (
                                <td className="px-5 py-3 text-end tabular-nums">
                                  {!returned && remaining > 0 ? (
                                    <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{formatCurrency(remaining)}</span>
                                  ) : (
                                    <span className="text-muted-foreground/50">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>

                {/* الجوال: قائمة */}
                <div className="md:hidden">
                  {saleGroups.groups.map((g) => (
                    <div key={g.key}>
                      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-xs">
                        <span className="font-extrabold text-foreground/80">{g.label}</span>
                        <span className="flex items-center gap-3 text-muted-foreground">
                          <span>{g.rows.length} فاتورة</span>
                          <span className="font-extrabold tabular-nums text-foreground/80">{formatCurrency(g.total)}</span>
                        </span>
                      </div>
                      <ul className="divide-y divide-border/70">
                        {g.rows.map((s) => {
                          const returned = s.status === 'مرتجعة'
                          const done = s.status === 'مكتملة'
                          const remaining = Math.max(0, (s.total ?? 0) - (s.paid ?? 0))
                          const Icon = returned ? Undo2 : done ? Check : Clock
                          const tone: Tone3D = returned ? 'rose' : done ? 'emerald' : 'amber'
                          return (
                            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2 text-sm font-extrabold tabular-nums">
                                  <span className="truncate">{s.invoiceNo ?? `#${s.id}`}</span>
                                  {!done && <StatusGlyph icon={Icon} tone={tone} />}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.customerName ?? 'بدون عميل'}</p>
                              </div>
                              <div className="text-end">
                                <p className={cn('text-[15px] font-black tabular-nums', returned && 'text-muted-foreground line-through decoration-rose-500/60')}>
                                  {formatCurrency(s.total)}
                                </p>
                                {returned ? (
                                  <p className="mt-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">مرتجعة</p>
                                ) : remaining > 0 ? (
                                  <p className="mt-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">متبقي {formatCurrency(remaining)}</p>
                                ) : (
                                  <DateStamp iso={s.createdAt} tz={tz} />
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ═════════ المركز المالي — عمود جانبي ═════════ */}
        <section className={cn(PANEL, 'min-w-0 overflow-hidden')}>
          <div className="border-b px-5 py-4">
            <PanelHeader icon={Boxes} tone="violet" title="المركز المالي" subtitle="قيمة المخزون والمديونيات" />
          </div>
          <ul className="divide-y divide-border/70">
            {[
              { label: 'المخزون (تكلفة)', v: data?.stockValueCost ?? 0, icon: Boxes, tone: 'slate' as Tone3D },
              { label: 'المخزون (بيع)', v: data?.stockValuePrice ?? 0, icon: ShoppingBag, tone: 'emerald' as Tone3D },
              { label: 'ديون العملاء', v: data?.totalOutstandingDebt ?? 0, icon: Users, tone: 'amber' as Tone3D },
              { label: 'مستحق الموردين', v: data?.totalSupplierDebt ?? 0, icon: Truck, tone: 'rose' as Tone3D },
            ].map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40">
                <span className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                  <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4', TONE3D[r.tone].soft)}>
                    <r.icon strokeWidth={2.2} />
                  </span>
                  {r.label}
                </span>
                {loadingFirst ? (
                  <Skeleton className="h-5 w-20" />
                ) : (
                  <span className="text-base font-black tabular-nums">{formatCurrency(r.v)}</span>
                )}
              </li>
            ))}
          </ul>
          {showProfits && (
            <div className="m-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-l from-emerald-500/10 to-emerald-500/[0.03] px-4 py-3.5">
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <TrendingUp className="size-4" />
                الربح المتوقع من المخزون
              </span>
              <span className="text-base font-black tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatCurrency((data?.stockValuePrice ?? 0) - (data?.stockValueCost ?? 0))}
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
