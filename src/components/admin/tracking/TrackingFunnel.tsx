'use client'

/**
 * 🔬 تحليل مسار التحويل — Visitors → Registrations → Trials → Checkouts → Purchases
 * بنفس لغة تصميم لوحة المستخدم (DashboardView): Hero بالرقم الأساسي + شريط أرقام +
 * بطاقات rounded-3xl بقوائم مرتبة وأشرطة تقدم، وكل الألوان من توكنز النظام.
 * - مقارنة تلقائية بالفترة السابقة (بالنقاط المئوية للنسب)
 * - ترتيب نقاط التسرّب + ملاحظات تحليلية مولّدة من البيانات
 * - تقدير أثر الفرصة الأولى + فرضيات اختبار
 * نفس الـ API: /api/admin/tracking/funnel — بدون أي مكتبات إضافية.
 */

import * as React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  TrendingUp, TrendingDown, Minus, Users, UserPlus, FlaskConical, ShoppingCart, BadgeCheck,
  RefreshCw, Radio, Activity, Table2, BarChart3, Target, Sparkles, ShieldAlert, FlaskRound,
  CalendarDays, Funnel, ArrowUpLeft,
} from 'lucide-react'
import {
  FilterBar, RangeFilterState, initialRange, rangeParams, presetRange, fetchJson, fmtPct,
  EmptyHint, DataIssueBanner,
} from './shared'

interface FunnelStep { key: string; label: string; count: number; fromPrev: number | null }
interface FunnelData {
  visitors: number
  registrations: number
  trials: number
  checkouts: number
  purchases: number
  steps: FunnelStep[]
  overallFromVisitors: number | null
  overallFromRegistrations: number | null
  dataReady?: boolean
  degraded?: boolean
  errorDetail?: string
}

/* ───────── مراحل المسار ───────── */

interface StageMeta {
  icon: React.ElementType
  dot: string
  text: string
  question: string
  hypotheses: string[]
}

const STAGES: Record<string, StageMeta> = {
  visitors: {
    icon: Users, dot: 'bg-sky-500', text: 'text-sky-500',
    question: 'هل نصل إلى الجمهور المناسب بجودة كافية؟',
    hypotheses: [
      'قسّم الزيارات حسب المصدر وأوقف القنوات ذات الارتداد المرتفع.',
      'وحّد وعد الإعلان مع عنوان صفحة الهبوط.',
    ],
  },
  registrations: {
    icon: UserPlus, dot: 'bg-teal-500', text: 'text-teal-500',
    question: 'هل القيمة المعروضة كافية لإقناع الزائر بإنشاء حساب؟',
    hypotheses: [
      'اختبار A/B: تقليل حقول التسجيل مع إضافة الدخول بجوجل.',
      'إضافة إثبات اجتماعي (أعداد العملاء وآراؤهم) بجوار زر التسجيل.',
      'توضيح أن التجربة مجانية دون بطاقة دفع في أول شاشة.',
    ],
  },
  trials: {
    icon: FlaskConical, dot: 'bg-emerald-500', text: 'text-emerald-500',
    question: 'هل ينتقل المسجّل إلى أول تجربة فعلية للمنتج؟',
    hypotheses: [
      'فعّل التجربة تلقائياً بعد التسجيل بدل خطوة يدوية منفصلة.',
      'أرسل رسالة ترحيب بأهم 3 خطوات وقِس الوصول إلى أول نتيجة مفيدة.',
    ],
  },
  checkouts: {
    icon: ShoppingCart, dot: 'bg-amber-500', text: 'text-amber-500',
    question: 'هل تقنع التجربة المستخدم بقيمة الباقة المدفوعة؟',
    hypotheses: [
      'تذكيرات مبنية على السلوك قبل انتهاء التجربة وليس على الوقت فقط.',
      'اعرض مقارنة الباقات بوضوح وأبرز الأنسب لنشاط المستخدم.',
    ],
  },
  purchases: {
    icon: BadgeCheck, dot: 'bg-primary', text: 'text-primary',
    question: 'هل تُنهى عملية الدفع دون احتكاك؟',
    hypotheses: [
      'قلّل خطوات الدفع ونوّع وسائل الدفع المحلية.',
      'تابع عمليات الدفع غير المكتملة برسالة خلال 24 ساعة.',
    ],
  },
}
const FALLBACK: StageMeta = { icon: Activity, dot: 'bg-primary', text: 'text-primary', question: '', hypotheses: [] }
const stageOf = (k: string) => STAGES[k] ?? FALLBACK

const RANGE_LABEL: Record<string, string> = { today: 'اليوم', '7d': 'آخر 7 أيام', '30d': 'آخر 30 يوم', custom: 'فترة مخصصة' }
const SMALL_SAMPLE = 30
const num = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'))

/* ───────── أدوات ───────── */

function previousParams(f: RangeFilterState): URLSearchParams {
  const p = rangeParams(f)
  const { from, to } = presetRange(f.preset, f.fromStr, f.toStr)
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  const len = Math.max(b - a, 864e5)
  p.set('from', new Date(a - len).toISOString())
  p.set('to', new Date(a).toISOString())
  return p
}

function relChange(now: number, prev?: number | null): number | null {
  if (prev == null) return null
  if (prev === 0) return now === 0 ? 0 : null
  return (now - prev) / prev
}
const pp = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null ? (a - b) * 100 : null)

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral'
const TONE: Record<Tone, { chip: string; dot: string; row: string }> = {
  success: { chip: 'bg-success-subtle text-success-subtle-foreground', dot: 'bg-success', row: 'bg-success-subtle/50' },
  warning: { chip: 'bg-warning-subtle text-warning-subtle-foreground', dot: 'bg-warning', row: 'bg-warning-subtle/50' },
  danger: { chip: 'bg-destructive-subtle text-destructive-subtle-foreground', dot: 'bg-destructive', row: 'bg-destructive-subtle/50' },
  info: { chip: 'bg-info-subtle text-info-subtle-foreground', dot: 'bg-info', row: 'bg-info-subtle/50' },
  primary: { chip: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary', row: 'bg-primary-subtle/50' },
  neutral: { chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60', row: 'bg-muted/50' },
}

/** شارة تغيّر: نسبي للأعداد أو بالنقاط المئوية للنسب */
function Delta({ value, unit = '%' }: { value: number | null; unit?: '%' | 'pp' }) {
  if (value == null) return null
  const flat = Math.abs(value) < (unit === '%' ? 0.005 : 0.05)
  const tone: Tone = flat ? 'neutral' : value > 0 ? 'success' : 'danger'
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown
  const text = unit === '%' ? `${Math.abs(value * 100).toFixed(0)}%` : `${Math.abs(value).toFixed(1)} نقطة`
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', TONE[tone].chip)}
      title="مقارنة بالفترة السابقة بنفس الطول"
    >
      <Icon className="size-3" />
      {text}
    </span>
  )
}

function PanelTitle({ icon: Icon, title, tone = 'text-primary', action }: {
  icon: React.ElementType; title: string; tone?: string; action?: React.ReactNode
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

function useCountUp(target: number, ms = 800) {
  const [v, setV] = React.useState(target)
  React.useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / ms, 1)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/* ───────── أشرطة المسار ───────── */

function StageBars({ steps, prevMap, bottleneck }: { steps: FunnelStep[]; prevMap: Record<string, number>; bottleneck: string | null }) {
  const max = Math.max(steps[0]?.count ?? 0, ...steps.map((s) => prevMap[s.key] ?? 0), 1)
  return (
    <div>
      {steps.map((s, i) => {
        const meta = stageOf(s.key)
        const Icon = meta.icon
        const prevCount = prevMap[s.key]
        const prevPct = prevCount != null ? Math.min(prevCount / max, 1) * 100 : null
        const lost = i > 0 ? Math.max(steps[i - 1].count - s.count, 0) : 0
        const isBn = bottleneck === s.key
        const odd = s.fromPrev != null && s.fromPrev > 1
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-1.5 ps-10">
                <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold', isBn ? TONE.danger.chip : TONE.neutral.chip)}>
                  <TrendingDown className="size-3" />
                  {s.fromPrev == null ? '—' : `يكمل ${fmtPct(s.fromPrev)}`}
                  <span className="font-medium opacity-80">· فقد {num(lost)}</span>
                </span>
                {isBn && <span className="text-[11px] font-bold text-destructive">أكبر تسرّب</span>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl bg-muted', meta.text)}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{s.label}</p>
                  <p className="shrink-0 text-sm font-extrabold tabular-nums">{num(s.count)}</p>
                </div>
                <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${s.count > 0 ? Math.max((s.count / max) * 100, 2) : 0}%`,
                      background: `color-mix(in srgb, var(--primary) ${Math.max(100 - i * 15, 40)}%, transparent)`,
                    }}
                  />
                  {prevPct != null && prevPct > 0 && (
                    <span className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ insetInlineStart: `${prevPct}%` }} title={`الفترة السابقة: ${num(prevCount)}`} />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {steps[0].count > 0 && i > 0 && <span>{fmtPct(s.count / steps[0].count)} من الزوار</span>}
                  {prevCount != null && (
                    <span className="inline-flex items-center gap-1">
                      السابقة {num(prevCount)} <Delta value={relChange(s.count, prevCount)} />
                    </span>
                  )}
                  {odd && (
                    <span className="inline-flex items-center gap-1 font-semibold text-warning-subtle-foreground">
                      <ShieldAlert className="size-3" /> أكبر من المرحلة السابقة — راجع مسارات الدخول
                    </span>
                  )}
                </div>
              </div>
            </div>
          </React.Fragment>
        )
      })}
      <p className="mt-4 text-[11px] text-muted-foreground">الخط الرأسي على الشريط = قيمة نفس المرحلة في الفترة السابقة.</p>
    </div>
  )
}

/* قمع أفقي بأعمدة — للشاشات العريضة */
function FunnelColumns({ steps, prevMap, hasPrev, bottleneck }: {
  steps: FunnelStep[]; prevMap: Record<string, number>; hasPrev: boolean; bottleneck: string | null
}) {
  const max = Math.max(steps[0]?.count ?? 0, ...steps.map((s) => prevMap[s.key] ?? 0), 1)
  return (
    <div className="grid grid-cols-5 gap-3">
      {steps.map((s, i) => {
        const meta = stageOf(s.key)
        const Icon = meta.icon
        const h = s.count > 0 ? Math.max((s.count / max) * 100, 3) : 0
        const prevCount = prevMap[s.key]
        const prevH = hasPrev && prevCount != null && prevCount > 0 ? Math.min(prevCount / max, 1) * 100 : null
        const lost = i > 0 ? Math.max(steps[i - 1].count - s.count, 0) : 0
        const isBn = bottleneck === s.key
        return (
          <div key={s.key} className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg bg-muted', meta.text)}>
                <Icon className="size-3.5" />
              </span>
              <span className="truncate text-sm font-semibold">{s.label}</span>
            </div>
            <p className="mt-2.5 text-3xl font-extrabold leading-none tracking-tight tabular-nums">{num(s.count)}</p>
            <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1">
              {i === 0 ? (
                <span className="text-[11px] text-muted-foreground">نقطة البداية</span>
              ) : (
                <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums', isBn ? TONE.danger.chip : TONE.neutral.chip)}>
                  <TrendingDown className="size-3" />
                  يكمل {fmtPct(s.fromPrev)}
                </span>
              )}
              {hasPrev && <Delta value={relChange(s.count, prevCount)} />}
            </div>
            <div className="relative mt-3 h-60 overflow-hidden rounded-2xl bg-muted/40">
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-xl transition-all duration-700"
                style={{ height: `${h}%`, background: `color-mix(in srgb, var(--primary) ${Math.max(100 - i * 15, 40)}%, transparent)` }}
              />
              {prevH != null && (
                <span
                  className="absolute inset-x-0 border-t-2 border-dashed border-foreground/50"
                  style={{ bottom: `${prevH}%` }}
                  title={`الفترة السابقة: ${num(prevCount)}`}
                />
              )}
            </div>
            <p className="mt-2 min-h-4 text-[11px] text-muted-foreground">
              {i > 0 ? `فقد ${num(lost)} · ${steps[0].count > 0 ? fmtPct(s.count / steps[0].count) : '—'} من الزوار` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/* ───────── الملاحظات التحليلية ───────── */

interface Insight { tone: Tone; title: string; body: string }

function buildInsights(data: FunnelData, prev: FunnelData | null, bn: FunnelStep | null): Insight[] {
  const out: Insight[] = []
  const steps = data.steps

  if (bn && bn.fromPrev != null) {
    const i = steps.findIndex((s) => s.key === bn.key)
    const from = steps[i - 1]
    out.push({
      tone: bn.fromPrev < 0.2 ? 'danger' : 'warning',
      title: `أكبر تسرّب: ${from.label} ← ${bn.label}`,
      body: `من كل 100 في «${from.label}» ينتقل ${(bn.fromPrev * 100).toFixed(0)} فقط إلى «${bn.label}». فُقد ${num(Math.max(from.count - bn.count, 0))} في هذه الخطوة وحدها.`,
    })
  }

  const prevOverall = prev?.overallFromVisitors ?? null
  const d = pp(data.overallFromVisitors, prevOverall)
  if (d != null && Math.abs(d) >= 0.05) {
    out.push({
      tone: d > 0 ? 'success' : 'danger',
      title: d > 0 ? 'تحسّن في التحويل الكلي' : 'تراجع في التحويل الكلي',
      body: `من ${fmtPct(prevOverall)} إلى ${fmtPct(data.overallFromVisitors)} (${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} نقطة) مقارنة بالفترة السابقة.`,
    })
  }

  if (prev) {
    let best: { s: FunnelStep; d: number } | null = null
    let worst: { s: FunnelStep; d: number } | null = null
    for (const s of steps.slice(1)) {
      const p = prev.steps.find((x) => x.key === s.key)
      if (s.fromPrev == null || p?.fromPrev == null) continue
      const dd = (s.fromPrev - p.fromPrev) * 100
      if (!best || dd > best.d) best = { s, d: dd }
      if (!worst || dd < worst.d) worst = { s, d: dd }
    }
    if (worst && worst.d <= -3) out.push({ tone: 'danger', title: `تدهور عند «${worst.s.label}»`, body: `انخفض معدل الانتقال ${Math.abs(worst.d).toFixed(1)} نقطة عن الفترة السابقة — راجع أي تغيير حديث في هذه الخطوة.` })
    if (best && best.d >= 3) out.push({ tone: 'success', title: `تحسّن عند «${best.s.label}»`, body: `ارتفع معدل الانتقال ${best.d.toFixed(1)} نقطة — وثّق ما تغيّر لتكراره في مراحل أخرى.` })
  }

  const small = steps.filter((s) => s.count > 0 && s.count < SMALL_SAMPLE)
  if (small.length) {
    out.push({ tone: 'info', title: 'حجم العينة محدود', body: `مراحل (${small.map((s) => s.label).join('، ')}) أقل من ${SMALL_SAMPLE}. النسب تقريبية ولا تصلح لقرارات حاسمة قبل توسيع الفترة.` })
  }
  if (!out.length) out.push({ tone: 'neutral', title: 'لا توجد إشارات حرجة', body: 'المسار مستقر نسبياً. وسّع الفترة أو قارن بين المصادر لاكتشاف فروق أدق.' })
  return out.slice(0, 4)
}

/* ───────── الصفحة ───────── */

export function TrackingFunnel() {
  const [filters, setFilters] = React.useState<RangeFilterState>(initialRange)
  const [data, setData] = React.useState<FunnelData | null>(null)
  const [prev, setPrev] = React.useState<FunnelData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [live, setLive] = React.useState(false)
  const [view, setView] = React.useState<'funnel' | 'table'>('funnel')
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [cur, old] = await Promise.all([
        fetchJson<FunnelData>(`/api/admin/tracking/funnel?${rangeParams(filters).toString()}`),
        fetchJson<FunnelData>(`/api/admin/tracking/funnel?${previousParams(filters).toString()}`).catch(() => null),
      ])
      setData(cur)
      setPrev(old)
      setUpdatedAt(new Date())
    } catch (e: any) {
      if (!silent) toast.error(e?.message || 'تعذّر تحميل بيانات المسار')
    } finally {
      setLoading(false)
    }
  }, [filters])

  React.useEffect(() => { void Promise.resolve().then(() => load()) }, [load])
  React.useEffect(() => {
    if (!live) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 60_000)
    return () => clearInterval(id)
  }, [live, load])

  const steps = data?.steps ?? []
  const prevMap = React.useMemo(() => Object.fromEntries((prev?.steps ?? []).map((s) => [s.key, s.count])), [prev])

  const transitions = React.useMemo(
    () => steps.slice(1)
      .map((s, i) => ({ from: steps[i], to: s, lost: Math.max(steps[i].count - s.count, 0), rate: s.fromPrev }))
      .filter((t) => t.rate != null && t.from.count > 0)
      .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1)),
    [steps],
  )
  const bottleneck = transitions[0]?.to ?? null

  const empty = !data || (data.visitors === 0 && data.registrations === 0 && data.purchases === 0)
  const insights = React.useMemo(() => (data && !empty ? buildInsights(data, prev, bottleneck) : []), [data, prev, bottleneck, empty])
  const opportunity = data && bottleneck && data.purchases > 0 ? Math.max(Math.round(data.purchases * 0.1), 1) : null

  const overallPct = useCountUp((data?.overallFromVisitors ?? 0) * 100)
  const overallDelta = pp(data?.overallFromVisitors, prev?.overallFromVisitors)
  const rangeLabel = RANGE_LABEL[filters.preset] ?? ''
  const maxLoss = Math.max(...transitions.map((t) => t.lost), 1)

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5" dir="rtl">
      {/* ترويسة الصفحة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            تحليل <span className="text-primary">مسار التحويل</span>
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground sm:text-sm">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{rangeLabel}</span>
            <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
            <span>مقارنة بفترة سابقة مطابقة في الطول</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLive((v) => !v)}
            title={updatedAt ? `آخر تحديث ${updatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : undefined}
            className={cn('gap-1.5', live && 'border-success/50 bg-success-subtle text-success-subtle-foreground')}
          >
            <Radio className={cn('size-3.5', live && 'animate-pulse')} />
            {live ? 'تحديث مباشر' : 'تحديث تلقائي'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-2">
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            تحديث
          </Button>
        </div>
      </div>

      {/* الفلاتر */}
      <Card className="gap-0 rounded-3xl py-3 shadow-sm sm:py-4">
        <CardContent className="px-4 sm:px-5">
          <FilterBar value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      {data?.dataReady === false && <DataIssueBanner errorDetail={data.errorDetail} />}
      {data?.degraded && <DataIssueBanner degraded errorDetail={data.errorDetail} />}

      {loading && !data ? (
        <div className="space-y-4">
          <Skeleton className="h-80 w-full rounded-3xl" />
          <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-3xl" />)}</div>
        </div>
      ) : empty ? (
        <Card className="rounded-3xl py-10 shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <Funnel className="size-9 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground">لا توجد بيانات كافية في هذه الفترة</p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              وسّع النطاق الزمني أو أزل فلاتر الحملة. يبدأ احتساب الزوار من لحظة تفعيل التتبع، وتُقرأ التسجيلات والمدفوعات من أحداث حقيقية.
            </p>
            <a href="/?view=tracking-settings" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              مراجعة إعدادات التتبع <ArrowUpLeft className="size-3" />
            </a>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ═════════ Hero — التحويل الكلي + حجم المراحل ═════════ */}
          <section className="overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm">
            <div
              className="grid grid-cols-1 gap-6 p-4 sm:p-7 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
              style={{ background: 'radial-gradient(560px 220px at 100% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent)' }}
            >
              {/* الرقم الأساسي */}
              <div className="flex min-w-0 flex-col justify-between gap-5">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <span className="size-2 rounded-full bg-primary" />
                    التحويل الكلي (زائر ← عميل مدفوع)
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-[2.35rem] font-extrabold leading-tight tracking-tight tabular-nums min-[380px]:text-5xl sm:text-6xl">
                      {overallPct.toFixed(1)}
                    </span>
                    <span className="text-lg font-semibold text-muted-foreground">%</span>
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{num(data!.purchases)} دفعة من {num(data!.visitors)} زائر</span>
                    <Delta value={overallDelta} unit="pp" />
                  </p>
                </div>

                {/* معدلات الانتقال */}
                <div className="space-y-2.5 border-t border-border pt-4">
                  {steps.slice(1).map((s, i) => {
                    const isBn = bottleneck?.key === s.key
                    const r = s.fromPrev ?? 0
                    return (
                      <div key={s.key} className="flex items-center gap-3 text-xs">
                        <span className={cn('w-28 shrink-0 truncate', isBn ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                          {steps[i].label} ← {s.label}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', isBn ? 'bg-destructive' : 'bg-primary')}
                            style={{ width: r > 0 ? `${Math.max(3, Math.min(r, 1) * 100)}%` : '0%' }}
                          />
                        </div>
                        <span className={cn('w-14 shrink-0 text-end font-bold tabular-nums', isBn && 'text-destructive')}>{fmtPct(s.fromPrev)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* حجم المراحل */}
              <div className="min-w-0">
                <PanelTitle
                  icon={Activity}
                  title="حجم كل مرحلة"
                  action={
                    <div className="flex items-center gap-0.5 rounded-xl border border-border bg-muted/50 p-0.5">
                      {([['funnel', 'المسار', BarChart3], ['table', 'الجدول', Table2]] as const).map(([k, l, I]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setView(k)}
                          className={cn(
                            'inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                            view === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <I className="size-3.5" /> {l}
                        </button>
                      ))}
                    </div>
                  }
                />
                <div className="mt-4">
                  {view === 'funnel' ? (
                    <>
                      <div className="hidden xl:block">
                        <FunnelColumns steps={steps} prevMap={prevMap} hasPrev={!!prev} bottleneck={bottleneck?.key ?? null} />
                        <p className="mt-3 text-[11px] text-muted-foreground">الخط المتقطع على العمود = قيمة نفس المرحلة في الفترة السابقة.</p>
                      </div>
                      <div className="xl:hidden">
                        <StageBars steps={steps} prevMap={prevMap} bottleneck={bottleneck?.key ?? null} />
                      </div>
                    </>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            {['المرحلة', 'العدد', 'من السابقة', 'من الزوار', 'الفقد', 'السابقة'].map((h) => (
                              <th key={h} className="py-2 text-right font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {steps.map((s, i) => (
                            <tr key={s.key} className="border-b border-border last:border-0">
                              <td className="py-2.5"><span className="inline-flex items-center gap-2"><span className={cn('size-2 rounded-full', stageOf(s.key).dot)} />{s.label}</span></td>
                              <td className="py-2.5 font-bold tabular-nums">{num(s.count)}</td>
                              <td className={cn('py-2.5 tabular-nums', bottleneck?.key === s.key && 'font-bold text-destructive')}>{fmtPct(s.fromPrev)}</td>
                              <td className="py-2.5 tabular-nums">{fmtPct(steps[0].count ? s.count / steps[0].count : null)}</td>
                              <td className="py-2.5 tabular-nums text-muted-foreground">{i === 0 ? '—' : num(Math.max(steps[i - 1].count - s.count, 0))}</td>
                              <td className="py-2.5"><span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">{num(prevMap[s.key])}<Delta value={relChange(s.count, prevMap[s.key])} /></span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </section>

          {/* ═════════ تسرّب + ملاحظات + فرصة ═════════ */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* ترتيب التسرّب */}
            <Card className="min-w-0 gap-4 rounded-3xl py-5 shadow-sm">
              <CardHeader className="px-5">
                <PanelTitle icon={TrendingDown} title="ترتيب التسرّب" tone="text-destructive" />
                <p className="text-xs text-muted-foreground">الانتقالات من الأضعف إلى الأقوى</p>
              </CardHeader>
              <CardContent className="px-5">
                {transitions.length ? (
                  <ol className="divide-y divide-border">
                    {transitions.map((t, i) => {
                      const r = t.rate ?? 0
                      const tone: Tone = r < 0.2 ? 'danger' : r < 0.5 ? 'warning' : 'success'
                      return (
                        <li key={t.to.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums', i === 0 ? TONE.danger.chip : TONE.neutral.chip)}>
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-semibold">{t.from.label} ← {t.to.label}</p>
                              <p className="shrink-0 text-xs font-bold tabular-nums">{fmtPct(t.rate)}</p>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div className={cn('h-full rounded-full', TONE[tone].dot)} style={{ width: `${Math.max(4, (t.lost / maxLoss) * 100)}%` }} />
                              </div>
                              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">فقد {num(t.lost)}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Funnel className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">لا توجد انتقالات كافية للمقارنة</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ملاحظات تحليلية */}
            <Card className="min-w-0 gap-4 rounded-3xl py-5 shadow-sm">
              <CardHeader className="px-5">
                <PanelTitle icon={Sparkles} title="ملاحظات تحليلية" />
                <p className="text-xs text-muted-foreground">مولّدة تلقائياً من بيانات هذه الفترة</p>
              </CardHeader>
              <CardContent className="px-5">
                <ul className="space-y-1.5">
                  {insights.map((it, i) => (
                    <li key={i} className={cn('rounded-xl px-3 py-2.5', TONE[it.tone].row)}>
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <span className={cn('size-1.5 shrink-0 rounded-full', TONE[it.tone].dot)} />
                        {it.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.body}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* الفرصة الأولى */}
            <Card className="min-w-0 gap-4 rounded-3xl py-5 shadow-sm md:col-span-2 xl:col-span-1">
              <CardHeader className="px-5">
                <PanelTitle icon={Target} title="فرصة التحسين الأولى" tone="text-primary" />
                <p className="text-xs text-muted-foreground">
                  {bottleneck ? `الخطوة المستهدفة: ${bottleneck.label}` : 'تظهر عند توفر بيانات كافية'}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                {bottleneck ? (
                  <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      السؤال التحليلي: <b className="text-foreground">{stageOf(bottleneck.key).question}</b>
                    </p>
                    {opportunity != null && (
                      <div className={cn('rounded-xl px-3 py-2.5', TONE.success.row)}>
                        <p className="text-lg font-extrabold tabular-nums text-success">+{num(opportunity)} عملية دفع</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          أثر تقديري لو تحسّن معدل «{bottleneck.label}» بنسبة 10% نسبياً مع ثبات بقية المسار.
                        </p>
                      </div>
                    )}
                    <p className="flex items-center gap-1.5 text-xs font-bold"><FlaskRound className="size-3.5 text-primary" /> فرضيات للاختبار</p>
                    <ul className="space-y-1.5">
                      {stageOf(bottleneck.key).hypotheses.map((h, i) => (
                        <li key={i} className="flex gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Target className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">لا توجد خطوة ضعيفة محددة بعد</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            تُحسب كل مرحلة بمعرّفات فريدة من أحداث التتبع الفعلية (دون تكرار المزوّدين)، والزوار من جلسات التصفح الداخلية. الأثر التقديري افتراضي ويحتاج اختباراً للتأكد.
          </p>
        </>
      )}
    </div>
  )
}
