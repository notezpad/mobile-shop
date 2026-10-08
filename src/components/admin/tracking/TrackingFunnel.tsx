'use client'

/**
 * 🔬 مختبر مسار التحويل — Conversion Funnel Analysis
 * صفحة تحليلية بهوية مستقلة (أنديجو ← سماوي) على نمط أدوات تحليل تجربة المستخدم العالمية:
 *  - ملخص تنفيذي بمؤشرات رئيسية ومقارنة بالفترة السابقة (بالنقاط المئوية)
 *  - قمع أفقي بعلامة مرجعية للفترة السابقة + فقد وتحويل بين كل مرحلتين
 *  - ملاحظات تحليلية مولّدة من البيانات + فرص تحسين مقدّرة الأثر + فرضيات اختبار
 *  - تحذيرات موثوقية (حجم العينة، تناقضات القياس)
 * نفس الـ API: /api/admin/tracking/funnel — بدون أي مكتبات إضافية.
 */

import * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  ArrowDownRight, ArrowUpRight, Minus, Users, UserPlus, FlaskConical, ShoppingCart, BadgeCheck,
  Sparkles, RefreshCw, Radio, BarChart3, Table2, Target, FlaskRound, ShieldAlert, Gauge,
  TrendingDown, Activity, Layers,
} from 'lucide-react'
import {
  FilterBar, RangeFilterState, initialRange, rangeParams, presetRange, fetchJson, fmtNum, fmtPct,
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

/* ─────────────── هوية الصفحة (ألوان معزولة عن باقي لوحة التحكم) ─────────────── */

const THEME_CSS = `
.fx-root{
  --fx-surface:#ffffff; --fx-surface-2:#f5f6ff; --fx-ink:#1b1a3a; --fx-muted:#6b6f93;
  --fx-line:rgba(79,70,229,.14); --fx-a:#4f46e5; --fx-b:#06b6d4;
  --fx-loss:#e11d48; --fx-gain:#059669; --fx-warn:#d97706; --fx-glow:rgba(99,102,241,.16);
  --fx-grid:rgba(79,70,229,.06);
}
:is(.dark) .fx-root{
  --fx-surface:#0e1128; --fx-surface-2:#151a3a; --fx-ink:#eceeff; --fx-muted:#9aa0cf;
  --fx-line:rgba(129,140,248,.2); --fx-a:#818cf8; --fx-b:#22d3ee;
  --fx-loss:#fb7185; --fx-gain:#34d399; --fx-warn:#fbbf24; --fx-glow:rgba(99,102,241,.28);
  --fx-grid:rgba(129,140,248,.07);
}
.fx-root .fx-panel{background:var(--fx-surface);border:1px solid var(--fx-line);border-radius:20px;color:var(--fx-ink)}
.fx-root .fx-muted{color:var(--fx-muted)}
.fx-root .fx-hero{
  position:relative;overflow:hidden;border-radius:24px;border:1px solid var(--fx-line);
  background:
    radial-gradient(900px 260px at 0% 0%, var(--fx-glow), transparent 60%),
    radial-gradient(700px 240px at 100% 100%, color-mix(in oklab, var(--fx-b) 22%, transparent), transparent 60%),
    linear-gradient(var(--fx-grid) 1px, transparent 1px) 0 0/100% 28px,
    var(--fx-surface);
  color:var(--fx-ink);
}
.fx-root .fx-grad-text{background:linear-gradient(90deg,var(--fx-a),var(--fx-b));-webkit-background-clip:text;background-clip:text;color:transparent}
.fx-root .fx-bar{transform-origin:right center;animation:fxGrow .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes fxGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fxRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fx-root .fx-rise{animation:fxRise .5s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.fx-root .fx-bar,.fx-root .fx-rise{animation:none}}
`

interface StageMeta {
  color: string
  icon: React.ElementType
  short: string
  question: string
  hypotheses: string[]
}

// تدرّج لوني متسلسل (بارد ← دافئ) يعبّر عن التقدم داخل المسار
const STAGES: Record<string, StageMeta> = {
  visitors: {
    color: '#06b6d4', icon: Users, short: 'زائر',
    question: 'هل نصل إلى الجمهور المناسب بجودة كافية؟',
    hypotheses: [
      'تقسيم الزيارات حسب المصدر وإيقاف القنوات ذات الارتداد المرتفع.',
      'مواءمة رسالة الإعلان مع عنوان صفحة الهبوط (اتساق الوعد).',
    ],
  },
  registrations: {
    color: '#3b82f6', icon: UserPlus, short: 'تسجيل',
    question: 'هل القيمة المعروضة كافية لإقناع الزائر بإنشاء حساب؟',
    hypotheses: [
      'اختبار A/B: تقليل حقول التسجيل إلى الحد الأدنى مع إضافة الدخول بجوجل.',
      'إضافة إثبات اجتماعي (أعداد العملاء، آراء) بجوار زر التسجيل.',
      'توضيح أن التجربة مجانية دون بطاقة دفع في أول شاشة.',
    ],
  },
  trials: {
    color: '#6366f1', icon: FlaskConical, short: 'تجربة',
    question: 'هل ينتقل المسجّل إلى أول تجربة فعلية للمنتج؟',
    hypotheses: [
      'تفعيل التجربة تلقائياً بعد التسجيل بدل خطوة يدوية منفصلة.',
      'رسالة ترحيب بخطوات البدء الثلاث الأهم وقياس الوصول إلى لحظة «الإدراك» (Aha moment).',
    ],
  },
  checkouts: {
    color: '#8b5cf6', icon: ShoppingCart, short: 'بدء دفع',
    question: 'هل تقنع التجربة المستخدم بقيمة الباقة المدفوعة؟',
    hypotheses: [
      'تذكيرات مبنية على السلوك قبل انتهاء التجربة (وليس على الوقت فقط).',
      'عرض مقارنة الباقات بوضوح مع إبراز الباقة الأنسب لنشاط المستخدم.',
    ],
  },
  purchases: {
    color: '#c026d3', icon: BadgeCheck, short: 'دفع',
    question: 'هل تُنهى عملية الدفع دون احتكاك؟',
    hypotheses: [
      'تقليل خطوات الدفع وتنويع وسائل الدفع المحلية.',
      'استرجاع عمليات الدفع غير المكتملة برسالة متابعة خلال 24 ساعة.',
    ],
  },
}
const FALLBACK_STAGE: StageMeta = { color: '#6366f1', icon: Sparkles, short: '', question: '', hypotheses: [] }
const stageOf = (k: string): StageMeta => STAGES[k] ?? FALLBACK_STAGE

/* ─────────────── أدوات مساعدة ─────────────── */

/** نطاق الفترة السابقة بنفس الطول للمقارنة */
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

function useCountUp(target: number, ms = 800) {
  const [v, setV] = React.useState(0)
  React.useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - start) / ms, 1)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

const SMALL_SAMPLE = 30

/** تغيّر نسبي بين فترتين */
function relChange(now: number, prev?: number | null): number | null {
  if (prev == null) return null
  if (prev === 0) return now === 0 ? 0 : null
  return (now - prev) / prev
}

/** شارة تغيّر: نسبي للأعداد، أو بالنقاط المئوية للنسب */
function Change({ value, unit = '%', invert = false }: { value: number | null; unit?: '%' | 'pp'; invert?: boolean }) {
  if (value == null) return <span className="fx-muted text-[11px]">—</span>
  const flat = Math.abs(value) < (unit === '%' ? 0.005 : 0.05)
  const good = invert ? value < 0 : value > 0
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  const color = flat ? 'var(--fx-muted)' : good ? 'var(--fx-gain)' : 'var(--fx-loss)'
  const text = unit === '%' ? `${Math.abs(value * 100).toFixed(0)}%` : `${Math.abs(value).toFixed(1)} نقطة`
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums"
      style={{ color, background: `color-mix(in oklab, ${color} 13%, transparent)` }}
      title="مقارنة بالفترة السابقة بنفس الطول"
    >
      <Icon className="size-3" />
      {text}
    </span>
  )
}

/* ─────────────── الملخص التنفيذي ─────────────── */

function HeadlineMetric({
  label, hint, value, children, accent, index,
}: { label: string; hint: string; value: string; children?: React.ReactNode; accent: string; index: number }) {
  return (
    <div className="fx-panel fx-rise relative overflow-hidden p-4" style={{ animationDelay: `${index * 70}ms` }}>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11.5px] font-semibold fx-muted">{label}</span>
        {children}
      </div>
      <div className="mt-2 font-mono text-[28px] font-extrabold leading-none tabular-nums tracking-tight">{value}</div>
      <p className="mt-2 text-[11px] leading-relaxed fx-muted">{hint}</p>
    </div>
  )
}

/* ─────────────── القمع الأفقي ─────────────── */

function FunnelBars({
  steps, prevMap, bottleneck,
}: { steps: FunnelStep[]; prevMap: Record<string, number>; bottleneck: string | null }) {
  const [hover, setHover] = React.useState<string | null>(null)
  const prevMax = Math.max(...steps.map((s) => prevMap[s.key] ?? 0), 0)
  const max = Math.max(steps[0]?.count ?? 0, prevMax, 1)

  return (
    <div className="space-y-0">
      {steps.map((s, i) => {
        const meta = stageOf(s.key)
        const Icon = meta.icon
        const pct = s.count / max
        const prevCount = prevMap[s.key]
        const prevPct = prevCount != null ? prevCount / max : null
        const share = steps[0].count > 0 ? s.count / steps[0].count : null
        const dim = hover != null && hover !== s.key
        const prevStep = steps[i - 1]
        const lost = prevStep ? Math.max(prevStep.count - s.count, 0) : 0
        const isBn = bottleneck === s.key
        const anomaly = s.fromPrev != null && s.fromPrev > 1

        return (
          <React.Fragment key={s.key}>
            {/* موصل الانتقال بين مرحلتين */}
            {prevStep && (
              <div className="flex items-center gap-2 py-1.5 pe-2 ps-12" style={{ opacity: dim ? 0.4 : 1, transition: 'opacity .2s' }}>
                <span className="h-5 w-px" style={{ background: 'var(--fx-line)' }} />
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
                  style={{
                    color: isBn ? 'var(--fx-loss)' : 'var(--fx-ink)',
                    background: isBn ? 'color-mix(in oklab, var(--fx-loss) 12%, transparent)' : 'var(--fx-surface-2)',
                    border: `1px solid ${isBn ? 'color-mix(in oklab, var(--fx-loss) 40%, transparent)' : 'var(--fx-line)'}`,
                  }}
                >
                  <TrendingDown className="size-3" />
                  {s.fromPrev == null ? '—' : `يكمل ${fmtPct(s.fromPrev)}`}
                  <span className="fx-muted font-normal">· فقد {fmtNum(lost)}</span>
                  {isBn && <span className="rounded bg-[var(--fx-loss)] px-1.5 text-[9.5px] font-bold text-white">أكبر تسرّب</span>}
                </span>
              </div>
            )}

            <div
              className="fx-rise grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl p-2 transition-all"
              style={{ animationDelay: `${i * 80}ms`, opacity: dim ? 0.45 : 1, background: hover === s.key ? 'var(--fx-surface-2)' : 'transparent' }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="flex size-9 items-center justify-center rounded-xl" style={{ background: `${meta.color}1f`, color: meta.color }}>
                <Icon className="size-[18px]" />
              </span>

              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[13px] font-semibold">{s.label}</span>
                  <span className="flex items-center gap-2 text-[11px] fx-muted">
                    {share != null && i > 0 && <span>{fmtPct(share)} من الزوار</span>}
                    {prevCount != null && (
                      <span className="inline-flex items-center gap-1">
                        قبلها {fmtNum(prevCount)} <Change value={relChange(s.count, prevCount)} />
                      </span>
                    )}
                  </span>
                </div>

                <div className="relative h-8 rounded-lg" style={{ background: 'var(--fx-surface-2)' }}>
                  <div
                    className="fx-bar absolute inset-y-0 right-0 flex items-center rounded-lg"
                    style={{
                      width: `${Math.max(Math.min(pct, 1) * 100, s.count > 0 ? 2 : 0)}%`,
                      background: `linear-gradient(270deg, ${meta.color}, color-mix(in oklab, ${meta.color} 62%, transparent))`,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                  {prevPct != null && prevPct > 0 && (
                    <span
                      className="absolute inset-y-[-3px] w-[2px] rounded-full"
                      style={{ right: `${Math.min(prevPct, 1) * 100}%`, background: 'var(--fx-ink)', opacity: 0.55 }}
                      title={`الفترة السابقة: ${fmtNum(prevCount)}`}
                    />
                  )}
                  <span className="absolute inset-y-0 start-3 flex items-center font-mono text-[13px] font-bold tabular-nums" style={{ color: 'var(--fx-ink)' }}>
                    {fmtNum(s.count)}
                  </span>
                </div>

                {anomaly && (
                  <p className="mt-1 flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--fx-warn)' }}>
                    <ShieldAlert className="size-3" /> العدد أكبر من المرحلة السابقة — غالباً مستخدمون دخلوا من مسار آخر أو قياس غير متزامن.
                  </p>
                )}
              </div>
            </div>
          </React.Fragment>
        )
      })}
      <p className="pt-3 text-[10.5px] fx-muted">الخط الداكن على الشريط = قيمة نفس المرحلة في الفترة السابقة.</p>
    </div>
  )
}

/* ─────────────── الملاحظات التحليلية ─────────────── */

type Tone = 'risk' | 'warn' | 'good' | 'info'
interface Insight { tone: Tone; title: string; body: string }

const TONE_STYLE: Record<Tone, { c: string; icon: React.ElementType }> = {
  risk: { c: 'var(--fx-loss)', icon: TrendingDown },
  warn: { c: 'var(--fx-warn)', icon: ShieldAlert },
  good: { c: 'var(--fx-gain)', icon: ArrowUpRight },
  info: { c: 'var(--fx-a)', icon: Activity },
}

function buildInsights(
  data: FunnelData, prev: FunnelData | null, bottleneck: FunnelStep | null, prevOverall: number | null,
): Insight[] {
  const out: Insight[] = []
  const steps = data.steps

  if (bottleneck && bottleneck.fromPrev != null) {
    const i = steps.findIndex((s) => s.key === bottleneck.key)
    const from = steps[i - 1]
    out.push({
      tone: bottleneck.fromPrev < 0.2 ? 'risk' : 'warn',
      title: `أكبر تسرّب: ${from.label} ← ${bottleneck.label}`,
      body: `من كل 100 في مرحلة «${from.label}» ينتقل ${(bottleneck.fromPrev * 100).toFixed(0)} فقط إلى «${bottleneck.label}»، أي فقد ${fmtNum(Math.max(from.count - bottleneck.count, 0))} مستخدماً في هذه الخطوة وحدها.`,
    })
  }

  if (data.overallFromVisitors != null && prevOverall != null) {
    const dpp = (data.overallFromVisitors - prevOverall) * 100
    if (Math.abs(dpp) >= 0.05) {
      out.push({
        tone: dpp > 0 ? 'good' : 'risk',
        title: dpp > 0 ? 'تحسّن في التحويل الكلي' : 'تراجع في التحويل الكلي',
        body: `انتقل معدل التحويل من الزيارة إلى الدفع من ${fmtPct(prevOverall)} إلى ${fmtPct(data.overallFromVisitors)} (${dpp > 0 ? '+' : '−'}${Math.abs(dpp).toFixed(1)} نقطة مئوية) مقارنة بالفترة السابقة.`,
      })
    }
  }

  // أكبر تحسّن / تدهور في معدل مرحلة بعينها
  if (prev) {
    let best: { s: FunnelStep; d: number } | null = null
    let worst: { s: FunnelStep; d: number } | null = null
    for (const s of steps.slice(1)) {
      const p = prev.steps.find((x) => x.key === s.key)
      if (s.fromPrev == null || p?.fromPrev == null) continue
      const d = (s.fromPrev - p.fromPrev) * 100
      if (!best || d > best.d) best = { s, d }
      if (!worst || d < worst.d) worst = { s, d }
    }
    if (worst && worst.d <= -3) {
      out.push({ tone: 'risk', title: `تدهور ملحوظ عند «${worst.s.label}»`, body: `انخفض معدل الانتقال إلى هذه المرحلة ${Math.abs(worst.d).toFixed(1)} نقطة عن الفترة السابقة — راجع أي تغيير حديث في هذه الخطوة.` })
    }
    if (best && best.d >= 3) {
      out.push({ tone: 'good', title: `تحسّن عند «${best.s.label}»`, body: `ارتفع معدل الانتقال ${best.d.toFixed(1)} نقطة عن الفترة السابقة — وثّق ما تغيّر لتكراره في مراحل أخرى.` })
    }
  }

  const small = steps.filter((s) => s.count > 0 && s.count < SMALL_SAMPLE)
  if (small.length) {
    out.push({
      tone: 'warn',
      title: 'حجم العينة محدود',
      body: `مراحل (${small.map((s) => s.label).join('، ')}) أقل من ${SMALL_SAMPLE} مستخدماً. النسب هنا تقريبية ولا تصلح لقرارات حاسمة قبل توسيع الفترة.`,
    })
  }

  if (!out.length) {
    out.push({ tone: 'info', title: 'لا توجد إشارات حرجة', body: 'المسار مستقر نسبياً في هذه الفترة. وسّع الفترة أو قارن بين مصادر الزيارات لاكتشاف فروق أدق.' })
  }
  return out.slice(0, 5)
}

function InsightList({ items }: { items: Insight[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => {
        const t = TONE_STYLE[it.tone]
        const Icon = t.icon
        return (
          <div
            key={i}
            className="fx-rise rounded-xl p-3"
            style={{ animationDelay: `${i * 70}ms`, background: `color-mix(in oklab, ${t.c} 8%, transparent)`, border: `1px solid color-mix(in oklab, ${t.c} 28%, transparent)` }}
          >
            <div className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: t.c }}>
              <Icon className="size-3.5" /> {it.title}
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: 'var(--fx-ink)' }}>{it.body}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── الصفحة ─────────────── */

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

  const bottleneck = React.useMemo(() => {
    let worst: FunnelStep | null = null
    for (let i = 1; i < steps.length; i++) {
      const s = steps[i]
      if (s.fromPrev == null || steps[i - 1].count === 0) continue
      if (!worst || s.fromPrev < (worst.fromPrev ?? 1)) worst = s
    }
    return worst
  }, [steps])

  const empty = !data || (data.visitors === 0 && data.registrations === 0 && data.purchases === 0)
  const trialToPaid = data && data.trials > 0 ? data.purchases / data.trials : null
  const prevTrialToPaid = prev && prev.trials > 0 ? prev.purchases / prev.trials : null
  const visitorToReg = data && data.visitors > 0 ? data.registrations / data.visitors : null
  const prevVisitorToReg = prev && prev.visitors > 0 ? prev.registrations / prev.visitors : null
  const prevOverall = prev?.overallFromVisitors ?? null
  const pp = (a: number | null, b: number | null) => (a != null && b != null ? (a - b) * 100 : null)

  const insights = React.useMemo(
    () => (data && !empty ? buildInsights(data, prev, bottleneck, prevOverall) : []),
    [data, prev, bottleneck, prevOverall, empty],
  )

  // تقدير الأثر: تحسين نسبي 10% في أضعف خطوة ينعكس خطياً على المدفوعات
  const opportunity = data && bottleneck && data.purchases > 0 ? Math.max(Math.round(data.purchases * 0.1), 1) : null
  const overallCount = useCountUp(data?.purchases ?? 0)

  const bnIdx = bottleneck ? steps.findIndex((s) => s.key === bottleneck.key) : -1
  const bnMeta = bottleneck ? stageOf(bottleneck.key) : null

  return (
    <div className="fx-root space-y-4" dir="rtl">
      <style>{THEME_CSS}</style>

      {/* ترويسة الصفحة */}
      <div className="fx-hero p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'var(--fx-surface-2)', border: '1px solid var(--fx-line)', color: 'var(--fx-a)' }}>
              <Layers className="size-3.5" /> تحليل مسار التحويل
            </span>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
              أين يتوقف المستخدمون <span className="fx-grad-text">ولماذا؟</span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed fx-muted">
              تتبّع رحلة الزائر من أول زيارة حتى الدفع، وحدّد الخطوة الأعلى فقداً، وقارنها بالفترة السابقة، ثم ابدأ بتحسين ما يحقق أكبر أثر.
            </p>
          </div>
          {!empty && data && (
            <div className="text-end">
              <div className="fx-grad-text font-mono text-5xl font-black tabular-nums leading-none">{fmtPct(data.overallFromVisitors)}</div>
              <div className="mt-1.5 text-[11.5px] fx-muted">التحويل الكلي من زائر إلى عميل مدفوع</div>
              <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] fx-muted">
                <span className="font-mono font-bold tabular-nums" style={{ color: 'var(--fx-ink)' }}>{fmtNum(overallCount)}</span> عملية دفع
                <Change value={pp(data.overallFromVisitors, prevOverall)} unit="pp" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* شريط التحكم */}
      <div className="fx-panel p-3 sm:p-4">
        <FilterBar
          value={filters}
          onChange={setFilters}
          trailing={
            <>
              <div className="flex rounded-xl p-1" style={{ background: 'var(--fx-surface-2)', border: '1px solid var(--fx-line)' }}>
                {([['funnel', 'المسار', BarChart3], ['table', 'الجدول', Table2]] as const).map(([k, l, I]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setView(k)}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                    style={view === k ? { background: 'var(--fx-surface)', color: 'var(--fx-a)', boxShadow: '0 1px 3px rgba(0,0,0,.12)' } : { color: 'var(--fx-muted)' }}
                  >
                    <I className="size-3.5" /> {l}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLive((v) => !v)}
                title={updatedAt ? `آخر تحديث ${updatedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : undefined}
                className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors"
                style={live
                  ? { color: 'var(--fx-gain)', border: '1px solid color-mix(in oklab, var(--fx-gain) 45%, transparent)', background: 'color-mix(in oklab, var(--fx-gain) 10%, transparent)' }
                  : { color: 'var(--fx-muted)', border: '1px solid var(--fx-line)' }}
              >
                <Radio className={`size-3.5 ${live ? 'animate-pulse' : ''}`} /> {live ? 'تحديث مباشر' : 'تحديث دوري'}
              </button>
              <button
                type="button"
                onClick={() => load()}
                className="flex size-9 items-center justify-center rounded-xl"
                style={{ color: 'var(--fx-muted)', border: '1px solid var(--fx-line)' }}
                aria-label="تحديث"
                title="تحديث الآن"
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          }
        />
      </div>

      {data?.dataReady === false && <DataIssueBanner errorDetail={data.errorDetail} />}
      {data?.degraded && <DataIssueBanner degraded errorDetail={data.errorDetail} />}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : empty ? (
        <EmptyHint>
          لا توجد بيانات كافية في هذه الفترة.
          <br />
          <span className="text-xs">جرّب توسيع النطاق الزمني أو إزالة فلاتر الحملة. يبدأ احتساب الزوار من لحظة تفعيل التتبع، وتُقرأ التسجيلات والمدفوعات من أحداث حقيقية.</span>
        </EmptyHint>
      ) : (
        <>
          {/* المؤشرات الرئيسية */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HeadlineMetric index={0} accent="linear-gradient(90deg,#06b6d4,#3b82f6)" label="زائر ← تسجيل" value={fmtPct(visitorToReg)} hint="جودة الزيارات ووضوح العرض في صفحة الهبوط.">
              <Change value={pp(visitorToReg, prevVisitorToReg)} unit="pp" />
            </HeadlineMetric>
            <HeadlineMetric index={1} accent="linear-gradient(90deg,#6366f1,#8b5cf6)" label="تجربة ← دفع" value={fmtPct(trialToPaid)} hint="قدرة المنتج على إثبات قيمته أثناء التجربة.">
              <Change value={pp(trialToPaid, prevTrialToPaid)} unit="pp" />
            </HeadlineMetric>
            <HeadlineMetric index={2} accent="linear-gradient(90deg,#8b5cf6,#c026d3)" label="تسجيل ← دفع" value={fmtPct(data!.overallFromRegistrations)} hint="القيمة الفعلية لكل مستخدم مسجّل.">
              <Change value={pp(data!.overallFromRegistrations, prev?.overallFromRegistrations ?? null)} unit="pp" />
            </HeadlineMetric>
            <HeadlineMetric
              index={3}
              accent="linear-gradient(90deg,#f43f5e,#f59e0b)"
              label="أضعف حلقة"
              value={bottleneck ? fmtPct(bottleneck.fromPrev) : '—'}
              hint={bottleneck && bnIdx > 0 ? `${steps[bnIdx - 1].label} ← ${bottleneck.label}` : 'لا توجد حلقة ضعيفة محددة.'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            {/* المسار / الجدول */}
            <div className="fx-panel p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold"><Gauge className="size-4" style={{ color: 'var(--fx-a)' }} /> تفصيل المسار</h3>
                  <p className="text-[11.5px] fx-muted">نسبة كل مرحلة من المرحلة السابقة، مع مقارنة بالفترة السابقة.</p>
                </div>
              </div>

              {view === 'funnel' ? (
                <FunnelBars steps={steps} prevMap={prevMap} bottleneck={bottleneck?.key ?? null} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs fx-muted" style={{ borderBottom: '1px solid var(--fx-line)' }}>
                        {['المرحلة', 'العدد', 'من السابقة', 'من الزوار', 'الفقد', 'الفترة السابقة'].map((h) => (
                          <th key={h} className="py-2 text-right font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {steps.map((s, i) => (
                        <tr key={s.key} style={{ borderBottom: '1px solid var(--fx-line)' }}>
                          <td className="py-2.5"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: stageOf(s.key).color }} />{s.label}</span></td>
                          <td className="py-2.5 font-mono font-bold tabular-nums">{fmtNum(s.count)}</td>
                          <td className="py-2.5 font-mono tabular-nums" style={bottleneck?.key === s.key ? { color: 'var(--fx-loss)', fontWeight: 700 } : undefined}>{fmtPct(s.fromPrev)}</td>
                          <td className="py-2.5 font-mono tabular-nums">{fmtPct(steps[0].count ? s.count / steps[0].count : null)}</td>
                          <td className="py-2.5 font-mono tabular-nums fx-muted">{i === 0 ? '—' : fmtNum(Math.max(steps[i - 1].count - s.count, 0))}</td>
                          <td className="py-2.5"><span className="inline-flex items-center gap-1.5 font-mono tabular-nums fx-muted">{fmtNum(prevMap[s.key])}<Change value={relChange(s.count, prevMap[s.key])} /></span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* الرؤى */}
            <div className="space-y-4">
              <div className="fx-panel p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4" style={{ color: 'var(--fx-a)' }} /> ملاحظات تحليلية</div>
                <InsightList items={insights} />
              </div>

              {bottleneck && bnMeta && (
                <div className="fx-panel p-4">
                  <div className="flex items-center gap-2 text-sm font-bold"><Target className="size-4" style={{ color: 'var(--fx-loss)' }} /> فرصة التحسين الأولى</div>
                  <p className="mt-2 text-[11.5px] leading-relaxed fx-muted">
                    السؤال التحليلي: <b style={{ color: 'var(--fx-ink)' }}>{stageOf(bottleneck.key).question}</b>
                  </p>
                  {opportunity != null && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: 'color-mix(in oklab, var(--fx-gain) 9%, transparent)', border: '1px solid color-mix(in oklab, var(--fx-gain) 30%, transparent)' }}>
                      <div className="font-mono text-xl font-extrabold tabular-nums" style={{ color: 'var(--fx-gain)' }}>+{fmtNum(opportunity)} عملية دفع</div>
                      <div className="mt-0.5 text-[11px] fx-muted">أثر تقديري لو تحسّن معدل «{bottleneck.label}» بنسبة 10% نسبياً (بثبات بقية المسار).</div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1.5 text-[11.5px] font-bold"><FlaskRound className="size-3.5" style={{ color: 'var(--fx-a)' }} /> فرضيات للاختبار</div>
                  <ul className="mt-1.5 space-y-1.5">
                    {stageOf(bottleneck.key).hypotheses.map((h, i) => (
                      <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: bnMeta.color }} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed fx-muted">
            منهجية القياس: تُحسب كل مرحلة بمعرّفات فريدة من أحداث التتبع الفعلية (دون تكرار المزوّدين)، والزوار من جلسات التصفح الداخلية. المقارنة تتم مع فترة سابقة مطابقة في الطول. الأثر التقديري افتراضي ويحتاج إلى اختبار للتأكد.
          </p>
        </>
      )}
    </div>
  )
}
