'use client'

/**
 * 🔬 مختبر مسار التحويل — Conversion Funnel Analysis
 *
 * تصميم full-width بمستوى منصات تحليل تجربة المستخدم الاحترافية:
 *  1. هيرو تشخيصي مع مؤشر صحة القمع في صف واحد
 *  2. خريطة القمع تأخذ العرض الكامل — لا ريل جانبي يضغطها
 *  3. ثلاث لوحات تحليلية (رؤى · أولوية · فرضيات) في صف واحد أسفل القمع
 *  4. منهجية القياس كتذييل موحّد full-width
 *
 * نفس الـ API: /api/admin/tracking/funnel — بدون مكتبات إضافية.
 */

import * as React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  ArrowDownRight, ArrowUpRight, Minus, Users, UserPlus, FlaskConical, ShoppingCart, BadgeCheck,
  Sparkles, RefreshCw, Radio, BarChart3, Table2, Target, FlaskRound, ShieldAlert, Gauge,
  TrendingDown, Activity, Layers, Compass, Lightbulb, Info, Eye, Zap,
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

/* ═══════════════════════════════════════════════════════════════
   هوية الصفحة — «مسطرة القياس»
   ═══════════════════════════════════════════════════════════════ */
const THEME_CSS = `
.fx-root{
  --fx-surface:#ffffff; --fx-surface-2:#f4f5ff; --fx-surface-3:#ebedff;
  --fx-ink:#111134; --fx-ink-2:#3d3d68; --fx-muted:#6b6f93;
  --fx-line:rgba(79,70,229,.12); --fx-line-strong:rgba(79,70,229,.24);
  --fx-a:#4f46e5; --fx-b:#06b6d4; --fx-c:#8b5cf6;
  --fx-loss:#e11d48; --fx-warn:#d97706; --fx-gain:#059669; --fx-info:#0284c7;
  --fx-glow:rgba(99,102,241,.16); --fx-grid:rgba(79,70,229,.055);
}
:is(.dark) .fx-root{
  --fx-surface:#0e1128; --fx-surface-2:#151a3a; --fx-surface-3:#1c2247;
  --fx-ink:#eceeff; --fx-ink-2:#c7cbf0; --fx-muted:#9aa0cf;
  --fx-line:rgba(129,140,248,.18); --fx-line-strong:rgba(129,140,248,.34);
  --fx-a:#818cf8; --fx-b:#22d3ee; --fx-c:#a78bfa;
  --fx-loss:#fb7185; --fx-warn:#fbbf24; --fx-gain:#34d399; --fx-info:#38bdf8;
  --fx-glow:rgba(99,102,241,.28); --fx-grid:rgba(129,140,248,.075);
}

.fx-root{color:var(--fx-ink)}
.fx-panel{background:var(--fx-surface);border:1px solid var(--fx-line);border-radius:20px;color:var(--fx-ink)}
.fx-muted{color:var(--fx-muted)}
.fx-ink-2{color:var(--fx-ink-2)}

.fx-hero{
  position:relative;overflow:hidden;border-radius:24px;border:1px solid var(--fx-line);
  background:
    radial-gradient(900px 260px at 0% 0%, var(--fx-glow), transparent 62%),
    radial-gradient(700px 240px at 100% 100%, color-mix(in oklab, var(--fx-b) 22%, transparent), transparent 62%),
    linear-gradient(var(--fx-grid) 1px, transparent 1px) 0 0/100% 28px,
    var(--fx-surface);
}
.fx-grad-text{background:linear-gradient(90deg,var(--fx-a),var(--fx-b));-webkit-background-clip:text;background-clip:text;color:transparent}

.fx-bar{transform-origin:right center;animation:fxGrow .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes fxGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fxRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fx-rise{animation:fxRise .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes fxPulse{0%,100%{opacity:1}50%{opacity:.45}}
.fx-pulse{animation:fxPulse 2.2s ease-in-out infinite}

@media (prefers-reduced-motion:reduce){
  .fx-bar,.fx-rise,.fx-pulse{animation:none}
}
`

/* ═══════════════════════════════════════════════════════════════
   بيانات المراحل
   ═══════════════════════════════════════════════════════════════ */
interface StageMeta {
  color: string
  icon: React.ElementType
  short: string
  question: string
  hypotheses: string[]
}

const STAGES: Record<string, StageMeta> = {
  visitors: {
    color: '#06b6d4', icon: Users, short: 'زيارة',
    question: 'هل نستقطب الجمهور المناسب، وبجودة كافية للتفاعل؟',
    hypotheses: [
      'مراجعة مصادر الزيارات واستبعاد القنوات ذات الارتداد المرتفع.',
      'مواءمة رسالة الحملة مع عنوان صفحة الهبوط لضمان اتساق الوعد.',
    ],
  },
  registrations: {
    color: '#3b82f6', icon: UserPlus, short: 'تسجيل',
    question: 'هل الوعد الأولي كافٍ لدفع الزائر لإنشاء حساب؟',
    hypotheses: [
      'تقليل حقول التسجيل إلى الحد الأدنى مع إتاحة الدخول السريع.',
      'إبراز إثبات اجتماعي (عدد العملاء، آراء) بجوار زر التسجيل.',
      'توضيح صريح أن التجربة مجانية دون الحاجة لبطاقة دفع.',
    ],
  },
  trials: {
    color: '#6366f1', icon: FlaskConical, short: 'تجربة',
    question: 'هل يصل المسجّل إلى أول لحظة قيمة داخل المنتج؟',
    hypotheses: [
      'أتمتة تفعيل التجربة بدل خطوة يدوية منفصلة.',
      'رسالة ترحيب بثلاث خطوات فقط، مع قياس الوصول إلى لحظة الإدراك.',
    ],
  },
  checkouts: {
    color: '#8b5cf6', icon: ShoppingCart, short: 'دفع',
    question: 'هل التجربة تُقنع المستخدم بقيمة الباقة المدفوعة؟',
    hypotheses: [
      'تذكيرات مبنية على السلوك — لا على الوقت فقط — قبل انتهاء التجربة.',
      'مقارنة باقات واضحة تُبرز الأنسب لنمط استخدام المستخدم الفعلي.',
    ],
  },
  purchases: {
    color: '#c026d3', icon: BadgeCheck, short: 'إتمام',
    question: 'هل تُنهى عملية الدفع دون احتكاك؟',
    hypotheses: [
      'تقليل خطوات الدفع وتنويع وسائل الدفع المحلية.',
      'استرجاع عمليات الدفع غير المكتملة برسالة متابعة خلال 24 ساعة.',
    ],
  },
}
const FALLBACK_STAGE: StageMeta = { color: '#6366f1', icon: Sparkles, short: '', question: '', hypotheses: [] }
const stageOf = (k: string): StageMeta => STAGES[k] ?? FALLBACK_STAGE

/* ═══════════════════════════════════════════════════════════════
   أدوات
   ═══════════════════════════════════════════════════════════════ */

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

function relChange(now: number, prev?: number | null): number | null {
  if (prev == null) return null
  if (prev === 0) return now === 0 ? 0 : null
  return (now - prev) / prev
}

function healthOf(rate: number | null): { label: string; tone: 'risk' | 'warn' | 'info' | 'good'; score: number } {
  if (rate == null) return { label: 'لا يوجد قياس', tone: 'info', score: 0 }
  const pctVal = rate * 100
  if (pctVal < 0.5) return { label: 'ضعيف', tone: 'risk', score: Math.min(100, pctVal * 80) }
  if (pctVal < 1.5) return { label: 'مقبول', tone: 'warn', score: 40 + (pctVal - 0.5) * 20 }
  if (pctVal < 3) return { label: 'جيد', tone: 'info', score: 60 + (pctVal - 1.5) * 15 }
  if (pctVal < 6) return { label: 'قوي', tone: 'good', score: 82 + (pctVal - 3) * 4 }
  return { label: 'ممتاز', tone: 'good', score: 100 }
}

const TONE_VAR = {
  risk: 'var(--fx-loss)',
  warn: 'var(--fx-warn)',
  info: 'var(--fx-info)',
  good: 'var(--fx-gain)',
} as const

/* ═══════════════════════════════════════════════════════════════
   مقاييس مصغّرة
   ═══════════════════════════════════════════════════════════════ */

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

function MicroBar({ value, tone = 'var(--fx-a)' }: { value: number; tone?: string }) {
  const pct = Math.max(2, Math.min(100, value))
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--fx-surface-3)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: tone }} />
    </div>
  )
}

function SignalDot({ tone = 'info' }: { tone?: 'risk' | 'warn' | 'info' | 'good' }) {
  return (
    <span className="relative inline-flex size-2" title={`قوة الإشارة: ${tone}`}>
      <span className="absolute inline-flex size-full rounded-full opacity-40" style={{ background: TONE_VAR[tone] }} />
      <span className="relative inline-flex size-2 rounded-full" style={{ background: TONE_VAR[tone] }} />
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════
   بطاقة مقياس
   ═══════════════════════════════════════════════════════════════ */

function Metric({
  index, label, value, hint, delta, deltaUnit = 'pp', progress, tone = 'var(--fx-a)', icon: Icon,
}: {
  index: number
  label: string
  value: string
  hint: string
  delta?: number | null
  deltaUnit?: '%' | 'pp'
  progress?: number | null
  tone?: string
  icon?: React.ElementType
}) {
  return (
    <div className="fx-panel fx-rise relative overflow-hidden p-4" style={{ animationDelay: `${index * 70}ms` }}>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tone }} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {Icon && (
            <span className="flex size-6 items-center justify-center rounded-md" style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}>
              <Icon className="size-3.5" />
            </span>
          )}
          <span className="text-[11.5px] font-semibold fx-muted">{label}</span>
        </div>
        {delta !== undefined && <Change value={delta} unit={deltaUnit} />}
      </div>
      <div className="mt-2.5 font-mono text-[28px] font-extrabold leading-none tabular-nums tracking-tight">{value}</div>
      {progress != null && <div className="mt-2.5"><MicroBar value={progress} tone={tone} /></div>}
      <p className="mt-2 text-[11px] leading-relaxed fx-muted">{hint}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   القمع الأفقي — نسخة العرض الكامل
   ═══════════════════════════════════════════════════════════════ */

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
        const lostPct = prevStep && prevStep.count > 0 ? lost / prevStep.count : 0
        const isBn = bottleneck === s.key
        const anomaly = s.fromPrev != null && s.fromPrev > 1

        return (
          <React.Fragment key={s.key}>
            {prevStep && (
              <div className="relative flex items-center gap-3 py-2 pe-2 ps-16" style={{ opacity: dim ? 0.35 : 1, transition: 'opacity .2s' }}>
                <span className="h-8 w-px" style={{ background: 'var(--fx-line)' }} />
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-semibold tabular-nums"
                  style={{
                    color: isBn ? 'var(--fx-loss)' : 'var(--fx-ink-2)',
                    background: isBn ? 'color-mix(in oklab, var(--fx-loss) 11%, transparent)' : 'var(--fx-surface-2)',
                    border: `1px solid ${isBn ? 'color-mix(in oklab, var(--fx-loss) 38%, transparent)' : 'var(--fx-line)'}`,
                  }}
                >
                  <TrendingDown className="size-3.5" />
                  <span>يكمل <b>{s.fromPrev == null ? '—' : fmtPct(s.fromPrev)}</b></span>
                  <span className="fx-muted font-normal">· فقد {fmtNum(lost)} ({fmtPct(lostPct)})</span>
                  {isBn && (
                    <span className="rounded px-1.5 text-[9.5px] font-bold text-white" style={{ background: 'var(--fx-loss)' }}>
                      أعلى تسرّب
                    </span>
                  )}
                </span>
              </div>
            )}

            <div
              className="fx-rise grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl p-3 transition-all"
              style={{ animationDelay: `${i * 80}ms`, opacity: dim ? 0.45 : 1, background: hover === s.key ? 'var(--fx-surface-2)' : 'transparent' }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className="flex size-11 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in oklab, ${meta.color} 15%, transparent)`, color: meta.color }}
              >
                <Icon className="size-5" />
              </span>

              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[14px] font-semibold">{s.label}</span>
                    <span className="text-[10px] font-medium uppercase tracking-wider fx-muted">{meta.short}</span>
                  </div>
                  <span className="flex items-center gap-3 text-[11.5px] fx-muted">
                    {share != null && i > 0 && (
                      <span>
                        <b className="font-mono tabular-nums" style={{ color: 'var(--fx-ink)' }}>{fmtPct(share)}</b> من الزوار
                      </span>
                    )}
                    {prevCount != null && (
                      <span className="inline-flex items-center gap-1.5">
                        <span>قبلها <b className="font-mono tabular-nums" style={{ color: 'var(--fx-ink-2)' }}>{fmtNum(prevCount)}</b></span>
                        <Change value={relChange(s.count, prevCount)} />
                      </span>
                    )}
                  </span>
                </div>

                <div className="relative h-9 rounded-lg" style={{ background: 'var(--fx-surface-2)' }}>
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
                      className="absolute inset-y-[-4px] w-[2px] rounded-full"
                      style={{ right: `${Math.min(prevPct, 1) * 100}%`, background: 'var(--fx-ink)', opacity: 0.55 }}
                      title={`الفترة السابقة: ${fmtNum(prevCount)}`}
                    />
                  )}
                  <span className="absolute inset-y-0 start-3.5 flex items-center font-mono text-[14px] font-bold tabular-nums" style={{ color: 'var(--fx-ink)' }}>
                    {fmtNum(s.count)}
                  </span>
                </div>

                {anomaly && (
                  <p className="mt-1.5 flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--fx-warn)' }}>
                    <ShieldAlert className="size-3" />
                    العدد أكبر من المرحلة السابقة — غالباً مستخدمون دخلوا من مسار آخر أو قياس غير متزامن.
                  </p>
                )}
              </div>
            </div>
          </React.Fragment>
        )
      })}
      <p className="pt-3 text-[10.5px] fx-muted">
        <Info className="me-1 inline size-3 -translate-y-px" />
        الخط الداكن على الشريط = قيمة نفس المرحلة في الفترة السابقة.
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   الرؤى
   ═══════════════════════════════════════════════════════════════ */

type Tone = 'risk' | 'warn' | 'good' | 'info'
interface Insight { tone: Tone; title: string; body: string; kind: 'خطر' | 'فرصة' | 'إشارة' | 'معلومة' }

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
      kind: 'خطر',
      title: `أعلى تسرّب: ${from.label} ← ${bottleneck.label}`,
      body: `من كل 100 مستخدم في «${from.label}» ينتقل ${(bottleneck.fromPrev * 100).toFixed(0)} فقط إلى «${bottleneck.label}» — أي فقد صافٍ ${fmtNum(Math.max(from.count - bottleneck.count, 0))} مستخدماً في هذه الخطوة وحدها.`,
    })
  }

  if (data.overallFromVisitors != null && prevOverall != null) {
    const dpp = (data.overallFromVisitors - prevOverall) * 100
    if (Math.abs(dpp) >= 0.05) {
      out.push({
        tone: dpp > 0 ? 'good' : 'risk',
        kind: dpp > 0 ? 'فرصة' : 'خطر',
        title: dpp > 0 ? 'زخم إيجابي في القمع الكلي' : 'تراجع في القمع الكلي',
        body: `انتقل معدل التحويل من الزيارة إلى الدفع من ${fmtPct(prevOverall)} إلى ${fmtPct(data.overallFromVisitors)} (${dpp > 0 ? '+' : '−'}${Math.abs(dpp).toFixed(1)} نقطة مئوية).`,
      })
    }
  }

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
      out.push({
        tone: 'risk', kind: 'خطر',
        title: `تدهور عند «${worst.s.label}»`,
        body: `انخفض معدل الانتقال إلى هذه المرحلة ${Math.abs(worst.d).toFixed(1)} نقطة عن الفترة السابقة — راجع أي تغيير حديث في هذه الخطوة.`,
      })
    }
    if (best && best.d >= 3) {
      out.push({
        tone: 'good', kind: 'فرصة',
        title: `تحسّن عند «${best.s.label}»`,
        body: `ارتفع معدل الانتقال ${best.d.toFixed(1)} نقطة — وثّق ما تغيّر لتكراره في مراحل أخرى.`,
      })
    }
  }

  const small = steps.filter((s) => s.count > 0 && s.count < SMALL_SAMPLE)
  if (small.length) {
    out.push({
      tone: 'warn', kind: 'إشارة',
      title: 'قوة الإشارة منخفضة',
      body: `مراحل (${small.map((s) => s.label).join('، ')}) أقل من ${SMALL_SAMPLE} مستخدماً — النسب تقريبية، ولا تصلح لقرارات حاسمة قبل توسيع النافذة الزمنية.`,
    })
  }

  if (!out.length) {
    out.push({
      tone: 'info', kind: 'معلومة',
      title: 'لا توجد إشارات حرجة',
      body: 'المسار مستقر نسبياً في هذه النافذة. وسّع الفترة أو قسّمها حسب مصدر الزيارات لاكتشاف فروق أدق.',
    })
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
            style={{
              animationDelay: `${i * 70}ms`,
              background: `color-mix(in oklab, ${t.c} 7%, transparent)`,
              border: `1px solid color-mix(in oklab, ${t.c} 26%, transparent)`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: t.c }}>
                <Icon className="size-3.5" />
                {it.title}
              </div>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                style={{ color: t.c, background: `color-mix(in oklab, ${t.c} 14%, transparent)` }}
              >
                {it.kind}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed fx-ink-2">{it.body}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   الصفحة
   ═══════════════════════════════════════════════════════════════ */

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

  const opportunity = data && bottleneck && data.purchases > 0 ? Math.max(Math.round(data.purchases * 0.1), 1) : null
  const overallCount = useCountUp(data?.purchases ?? 0)
  const health = healthOf(data?.overallFromVisitors ?? null)

  const bnIdx = bottleneck ? steps.findIndex((s) => s.key === bottleneck.key) : -1
  const bnMeta = bottleneck ? stageOf(bottleneck.key) : null

  const hasSignal = data && !empty && (data.visitors >= SMALL_SAMPLE || data.registrations >= SMALL_SAMPLE)

  return (
    <div className="fx-root space-y-4" dir="rtl">
      <style>{THEME_CSS}</style>

      {/* ═══════ الهيرو — full-width بصفين متوازنين ═══════ */}
      <div className="fx-hero p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: 'var(--fx-surface-2)', border: '1px solid var(--fx-line)', color: 'var(--fx-a)' }}
              >
                <Layers className="size-3.5" />
                تحليل قمع التحويل
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                style={{ background: 'color-mix(in oklab, var(--fx-b) 10%, transparent)', color: 'var(--fx-b)', border: '1px solid color-mix(in oklab, var(--fx-b) 28%, transparent)' }}
              >
                <Compass className="size-3" />
                قراءة تشخيصية
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-extrabold leading-tight sm:text-[34px]">
              أين يضيع النمو <span className="fx-grad-text">بين الزيارة والدفع؟</span>
            </h2>
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed fx-muted">
              تشخيص كامل لمسار التحويل: نحدّد الحلقة الأعلى فقداً، نقيس أثرها الفعلي، ونقترح أول اختبار قابل للقياس.
            </p>
          </div>

          {!empty && data && (
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <div className="min-w-[180px]">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold fx-muted">
                  <Gauge className="size-3" />
                  التحويل الكلي من زائر إلى عميل
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="fx-grad-text font-mono text-[46px] font-black leading-none tabular-nums">{fmtPct(data.overallFromVisitors)}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ color: TONE_VAR[health.tone], background: `color-mix(in oklab, ${TONE_VAR[health.tone]} 14%, transparent)` }}
                  >
                    {health.label}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] fx-muted">
                  <Change value={pp(data.overallFromVisitors, prevOverall)} unit="pp" />
                  <span>مقابل الفترة السابقة</span>
                </div>
              </div>

              <div className="hidden h-16 w-px self-center bg-[var(--fx-line)] sm:block" />

              <div className="min-w-[140px]">
                <div className="text-[11px] font-semibold fx-muted">عمليات الدفع</div>
                <div className="mt-1.5 font-mono text-[32px] font-extrabold leading-none tabular-nums">
                  {fmtNum(overallCount)}
                </div>
                <div className="mt-1 text-[11px] fx-muted">في النافذة الزمنية الحالية</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ شريط التحكم ═══════ */}
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
                    style={view === k
                      ? { background: 'var(--fx-surface)', color: 'var(--fx-a)', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }
                      : { color: 'var(--fx-muted)' }}
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
                <Radio className={`size-3.5 ${live ? 'fx-pulse' : ''}`} /> {live ? 'مباشر' : 'تحديث دوري'}
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
          لا توجد بيانات كافية في هذه النافذة.
          <br />
          <span className="text-xs">
            وسّع النافذة الزمنية أو أزل فلاتر الحملة. يبدأ احتساب الزوار من لحظة تفعيل التتبع، وتُقرأ التسجيلات والمدفوعات من أحداث حقيقية.
          </span>
        </EmptyHint>
      ) : (
        <>
          {/* ═══════ المؤشرات الرئيسية — 4 أعمدة full-width ═══════ */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              index={0}
              icon={UserPlus}
              label="كفاءة الاستحواذ"
              value={fmtPct(visitorToReg)}
              hint="من زيارة إلى تسجيل — مؤشر جودة الجمهور ووضوح الوعد الأولي."
              delta={pp(visitorToReg, prevVisitorToReg)}
              progress={(visitorToReg ?? 0) * 100}
              tone="var(--fx-b)"
            />
            <Metric
              index={1}
              icon={FlaskConical}
              label="تحويل التجربة"
              value={fmtPct(trialToPaid)}
              hint="من تجربة إلى دفع — قدرة المنتج على إثبات قيمته داخل النافذة."
              delta={pp(trialToPaid, prevTrialToPaid)}
              progress={(trialToPaid ?? 0) * 100}
              tone="var(--fx-c)"
            />
            <Metric
              index={2}
              icon={BadgeCheck}
              label="قيمة المسجّل"
              value={fmtPct(data!.overallFromRegistrations)}
              hint="من تسجيل إلى دفع — القيمة الصافية لكل مستخدم مسجّل."
              delta={pp(data!.overallFromRegistrations, prev?.overallFromRegistrations ?? null)}
              progress={(data!.overallFromRegistrations ?? 0) * 100}
              tone="var(--fx-a)"
            />
            <Metric
              index={3}
              icon={Target}
              label="الحلقة الحرجة"
              value={bottleneck ? fmtPct(bottleneck.fromPrev) : '—'}
              hint={bottleneck && bnIdx > 0 ? `${steps[bnIdx - 1].label} ← ${bottleneck.label}` : 'لا توجد حلقة ضعيفة محددة.'}
              tone="var(--fx-loss)"
            />
          </div>

          {/* ═══════ خريطة القمع — العرض الكامل ═══════ */}
          <div className="fx-panel p-4 sm:p-6 lg:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-bold">
                  <Gauge className="size-4" style={{ color: 'var(--fx-a)' }} />
                  خريطة القمع
                </h3>
                <p className="mt-0.5 text-[11.5px] fx-muted">
                  نسبة كل مرحلة من المرحلة السابقة، مع مقارنة مرجعية بالفترة السابقة.
                </p>
              </div>
              {hasSignal && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-semibold fx-muted"
                  style={{ background: 'var(--fx-surface-2)', border: '1px solid var(--fx-line)' }}
                >
                  <SignalDot tone="good" /> إشارة قوية
                </span>
              )}
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
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2.5 rounded-full" style={{ background: stageOf(s.key).color }} />
                            {s.label}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono font-bold tabular-nums">{fmtNum(s.count)}</td>
                        <td className="py-2.5 font-mono tabular-nums" style={bottleneck?.key === s.key ? { color: 'var(--fx-loss)', fontWeight: 700 } : undefined}>{fmtPct(s.fromPrev)}</td>
                        <td className="py-2.5 font-mono tabular-nums">{fmtPct(steps[0].count ? s.count / steps[0].count : null)}</td>
                        <td className="py-2.5 font-mono tabular-nums fx-muted">{i === 0 ? '—' : fmtNum(Math.max(steps[i - 1].count - s.count, 0))}</td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums fx-muted">
                            {fmtNum(prevMap[s.key])}
                            <Change value={relChange(s.count, prevMap[s.key])} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ═══════ صف تحليلي — 3 لوحات متساوية full-width ═══════ */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* قراءة المحلل */}
            <div className="fx-panel p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-[14px] font-bold">
                <Sparkles className="size-4" style={{ color: 'var(--fx-a)' }} />
                قراءة المحلل
              </div>
              <InsightList items={insights} />
            </div>

            {/* أولوية التنفيذ */}
            {bottleneck && bnMeta ? (
              <div className="fx-panel p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[14px] font-bold">
                  <Target className="size-4" style={{ color: 'var(--fx-loss)' }} />
                  أولوية التنفيذ
                </div>

                <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--fx-surface-2)', border: '1px solid var(--fx-line)' }}>
                  <div className="flex items-center gap-2 text-[11.5px] font-bold" style={{ color: bnMeta.color }}>
                    <Eye className="size-3.5" />
                    السؤال التشخيصي
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed fx-ink-2">{bnMeta.question}</p>
                </div>

                {opportunity != null && (
                  <div
                    className="mt-3 rounded-xl p-3"
                    style={{
                      background: 'color-mix(in oklab, var(--fx-gain) 8%, transparent)',
                      border: '1px solid color-mix(in oklab, var(--fx-gain) 28%, transparent)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--fx-gain)' }}>
                      <Zap className="size-3.5" />
                      الأثر المرصود المتوقع
                    </div>
                    <div className="mt-1 font-mono text-[22px] font-extrabold tabular-nums" style={{ color: 'var(--fx-gain)' }}>
                      +{fmtNum(opportunity)} عملية دفع
                    </div>
                    <div className="mt-1 text-[10.5px] leading-relaxed fx-muted">
                      تقدير مبني على تحسّن نسبي 10٪ في معدل «{bottleneck.label}» مع ثبات بقية المراحل.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="fx-panel flex items-center justify-center p-4 sm:p-5">
                <p className="text-center text-[12px] fx-muted">لا توجد حلقة حرجة — المسار متوازن في النافذة الحالية.</p>
              </div>
            )}

            {/* فرضيات قابلة للاختبار */}
            {bottleneck && bnMeta ? (
              <div className="fx-panel p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[14px] font-bold">
                  <FlaskRound className="size-4" style={{ color: 'var(--fx-a)' }} />
                  فرضيات قابلة للاختبار
                </div>
                <ul className="mt-3 space-y-2.5">
                  {bnMeta.hypotheses.map((h, i) => (
                    <li key={i} className="flex gap-2.5 text-[12px] leading-relaxed fx-ink-2">
                      <span
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                        style={{ background: `color-mix(in oklab, ${bnMeta.color} 16%, transparent)`, color: bnMeta.color }}
                      >
                        {i + 1}
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <div
                  className="mt-4 flex items-start gap-2 rounded-xl p-2.5 text-[10.5px] leading-relaxed"
                  style={{ background: 'color-mix(in oklab, var(--fx-a) 7%, transparent)', color: 'var(--fx-ink-2)' }}
                >
                  <Lightbulb className="mt-0.5 size-3 shrink-0" style={{ color: 'var(--fx-a)' }} />
                  <span>ابدأ بأول فرضية فقط، وقِس أثرها أسبوعاً قبل الانتقال للتالية.</span>
                </div>
              </div>
            ) : (
              <div className="fx-panel flex items-center justify-center p-4 sm:p-5">
                <p className="text-center text-[12px] fx-muted">لا توجد فرضيات — أضف بيانات كافية أولاً.</p>
              </div>
            )}
          </div>

          {/* ═══════ المنهجية — full-width ═══════ */}
          <div className="fx-panel flex items-start gap-3 p-4">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--fx-surface-2)', color: 'var(--fx-muted)' }}
            >
              <Info className="size-4" />
            </span>
            <div className="min-w-0 text-[11.5px] leading-relaxed fx-muted">
              <b className="fx-ink-2">منهجية القياس — </b>
              تُحسب كل مرحلة بمعرّفات فريدة من أحداث التتبع الفعلية (دون تكرار المزوّدين)، والزوار من جلسات التصفح الداخلية.
              المقارنة تتم مع فترة سابقة مطابقة في الطول. الأثر المُقدَّر نموذج افتراضي ويحتاج إلى اختبار A/B للتأكد منه.
            </div>
          </div>
        </>
      )}
    </div>
  )
}