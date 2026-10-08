'use client'

/**
 * 📊 القمع التحليلي 2026 — Visitors → Registrations → Trials → Checkouts → Purchases
 * - قمع مرئي حقيقي (SVG متدرج الشكل) بدل الأشرطة التقليدية
 * - بطاقات KPI حديثة مع مقارنة تلقائية بالفترة السابقة
 * - كشف تلقائي لعنق الزجاجة + توصيات ذكية لكل مرحلة
 * - تحديث مباشر اختياري كل 60 ثانية + تبديل عرض (قمع / جدول)
 * بدون أي مكتبات إضافية — يعتمد على نفس الـ API: /api/admin/tracking/funnel
 */

import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  TrendingUp, TrendingDown, Minus, Users, UserPlus, FlaskConical, ShoppingCart, BadgeCheck,
  AlertTriangle, Sparkles, RefreshCw, Radio, BarChart3, Table2, Lightbulb,
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

const STAGES: Record<string, { color: string; icon: React.ElementType; tip: string }> = {
  visitors: { color: '#0ea5e9', icon: Users, tip: 'زد الزيارات عبر حملات UTM مستهدفة ومحتوى SEO.' },
  registrations: { color: '#14b8a6', icon: UserPlus, tip: 'بسّط نموذج التسجيل وأضف الدخول بجوجل وإثبات اجتماعي في الصفحة الرئيسية.' },
  trials: { color: '#22c55e', icon: FlaskConical, tip: 'فعّل التجربة تلقائياً بعد التسجيل وأرسل رسالة ترحيب بخطوات البدء.' },
  checkouts: { color: '#f59e0b', icon: ShoppingCart, tip: 'ذكّر المستخدم قبل انتهاء التجربة واعرض قيمة الباقة بوضوح.' },
  purchases: { color: '#ef4444', icon: BadgeCheck, tip: 'قلل خطوات الدفع، ونوّع وسائل الدفع، وتابع السلات المتروكة.' },
}
const stageOf = (k: string) => STAGES[k] ?? { color: '#6366f1', icon: Sparkles, tip: '' }

/** يحسب نطاق الفترة السابقة بنفس الطول للمقارنة */
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

function useCountUp(target: number, ms = 700) {
  const [v, setV] = React.useState(0)
  React.useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = 0
    const tick = (t: number) => {
      const p = Math.min((t - start) / ms, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (target - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

function Delta({ now, prev }: { now: number; prev?: number }) {
  if (prev == null) return null
  if (prev === 0 && now === 0) return <span className="text-[11px] text-muted-foreground">—</span>
  const d = prev === 0 ? 1 : (now - prev) / prev
  const up = d > 0.001
  const down = d < -0.001
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        up ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : down ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          : 'bg-muted text-muted-foreground'
      }`}
      title="مقارنة بالفترة السابقة"
    >
      <Icon className="size-3" />
      {(Math.abs(d) * 100).toFixed(0)}%
    </span>
  )
}

function KpiCard({ step, prev, index }: { step: FunnelStep; prev?: number; index: number }) {
  const s = stageOf(step.key)
  const Icon = s.icon
  const n = useCountUp(step.count)
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border bg-card/60 p-3.5 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-lg animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40" style={{ background: s.color }} />
      <div className="flex items-center justify-between">
        <span className="flex size-8 items-center justify-center rounded-xl" style={{ background: `${s.color}22`, color: s.color }}>
          <Icon className="size-4" />
        </span>
        <Delta now={step.count} prev={prev} />
      </div>
      <div className="mt-2.5 font-mono text-2xl font-bold tabular-nums tracking-tight">{fmtNum(n)}</div>
      <div className="text-xs text-muted-foreground">{step.label}</div>
      {step.fromPrev != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(step.fromPrev * 100, 100)}%`, background: s.color }} />
        </div>
      )}
    </div>
  )
}

/** قمع SVG حقيقي — كل مرحلة شبه منحرف عرضه يتناسب مع العدد */
function FunnelChart({ steps, bottleneck }: { steps: FunnelStep[]; bottleneck: string | null }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const W = 640, ROW = 64, GAP = 6, MIN = 0.08
  const max = Math.max(steps[0]?.count ?? 0, 1)
  const widths = steps.map((s) => Math.max(s.count / max, s.count > 0 ? MIN : 0.03) * W)
  const H = steps.length * (ROW + GAP)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="قمع التحويل">
        <defs>
          {steps.map((s) => {
            const c = stageOf(s.key).color
            return (
              <linearGradient key={s.key} id={`fg-${s.key}`} x1="0" x2="1">
                <stop offset="0%" stopColor={c} stopOpacity="0.55" />
                <stop offset="50%" stopColor={c} stopOpacity="0.95" />
                <stop offset="100%" stopColor={c} stopOpacity="0.55" />
              </linearGradient>
            )
          })}
        </defs>
        {steps.map((s, i) => {
          const top = widths[i]
          const bot = widths[i + 1] ?? widths[i] * 0.85
          const y = i * (ROW + GAP)
          const pts = [
            [(W - top) / 2, y], [(W + top) / 2, y],
            [(W + bot) / 2, y + ROW], [(W - bot) / 2, y + ROW],
          ].map((p) => p.join(',')).join(' ')
          const dim = hover != null && hover !== i
          const isBn = bottleneck === s.key
          return (
            <g
              key={s.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer"
              style={{ opacity: dim ? 0.35 : 1, transition: 'opacity .25s' }}
            >
              <polygon
                points={pts}
                fill={`url(#fg-${s.key})`}
                stroke={isBn ? '#f43f5e' : 'transparent'}
                strokeWidth={isBn ? 2 : 0}
                strokeDasharray={isBn ? '6 4' : undefined}
                style={{ transformOrigin: `${W / 2}px ${y}px`, animation: `funnelIn .6s ${i * 90}ms both cubic-bezier(.2,.8,.2,1)` }}
              />
              <text x={W / 2} y={y + ROW / 2 - 4} textAnchor="middle" className="fill-white text-[15px] font-bold" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.25)', strokeWidth: 3 }}>
                {fmtNum(s.count)}
              </text>
              <text x={W / 2} y={y + ROW / 2 + 14} textAnchor="middle" className="fill-white text-[11px]" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.25)', strokeWidth: 3 }}>
                {s.label}
              </text>
            </g>
          )
        })}
      </svg>
      <style>{`@keyframes funnelIn{from{opacity:0;transform:scaleX(.2)}to{opacity:1;transform:scaleX(1)}}`}</style>

      {hover != null && steps[hover] && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur animate-in fade-in zoom-in-95">
          <div className="font-semibold">{steps[hover].label}</div>
          <div className="mt-0.5 text-muted-foreground">
            العدد: <b className="text-foreground">{fmtNum(steps[hover].count)}</b>
            {' · '}من الإجمالي: <b className="text-foreground">{fmtPct(steps[hover].count / max)}</b>
            {steps[hover].fromPrev != null && <> · من السابقة: <b className="text-foreground">{fmtPct(steps[hover].fromPrev)}</b></>}
          </div>
        </div>
      )}
    </div>
  )
}

/** شريط فقد بين المراحل */
function DropOffRail({ steps, bottleneck }: { steps: FunnelStep[]; bottleneck: string | null }) {
  return (
    <div className="space-y-2">
      {steps.slice(1).map((s, idx) => {
        const prev = steps[idx]
        const lost = Math.max(prev.count - s.count, 0)
        const rate = s.fromPrev ?? 0
        const isBn = bottleneck === s.key
        return (
          <div key={s.key} className={`rounded-xl border p-2.5 transition-colors ${isBn ? 'border-rose-500/50 bg-rose-500/5' : 'bg-muted/20'}`}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{prev.label} ← <b className="text-foreground">{s.label}</b></span>
              <span className={`font-mono font-bold tabular-nums ${rate < 0.2 ? 'text-rose-500' : rate < 0.5 ? 'text-amber-500' : 'text-emerald-500'}`}>{fmtPct(s.fromPrev)}</span>
            </div>
            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-rose-500/20">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(rate * 100, 100)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">فقد {fmtNum(lost)} شخص</div>
          </div>
        )
      })}
    </div>
  )
}

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
      if (!silent) toast.error(e?.message || 'فشل تحميل القمع')
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
    for (const s of steps.slice(1)) {
      if (s.fromPrev == null) continue
      if (!worst || s.fromPrev < (worst.fromPrev ?? 1)) worst = s
    }
    return worst
  }, [steps])

  const empty = !data || (data.visitors === 0 && data.registrations === 0 && data.purchases === 0)
  const trialToPaid = data && data.trials > 0 ? data.purchases / data.trials : null

  return (
    <div className="space-y-4" dir="rtl">
      {/* شريط التحكم */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <FilterBar
            value={filters}
            onChange={setFilters}
            trailing={
              <>
                <div className="flex rounded-xl border bg-muted/40 p-1">
                  <button type="button" onClick={() => setView('funnel')} title="عرض القمع" className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${view === 'funnel' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <BarChart3 className="size-3.5" /> قمع
                  </button>
                  <button type="button" onClick={() => setView('table')} title="عرض الجدول" className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${view === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Table2 className="size-3.5" /> جدول
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLive((v) => !v)}
                  title={updatedAt ? `آخر تحديث ${updatedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : undefined}
                  className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${live ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Radio className={`size-3.5 ${live ? 'animate-pulse' : ''}`} /> {live ? 'مباشر' : 'تلقائي'}
                </button>
                <button type="button" onClick={() => load()} className="flex size-9 items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground" aria-label="تحديث" title="تحديث الآن">
                  <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </>
            }
          />
        </CardContent>
      </Card>

      {data?.dataReady === false && <DataIssueBanner errorDetail={data.errorDetail} />}
      {data?.degraded && <DataIssueBanner degraded errorDetail={data.errorDetail} />}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : empty ? (
        <EmptyHint>
          لا توجد بيانات في هذه الفترة.
          <br />
          <span className="text-xs">احتساب الزوار يبدأ من تفعيل الميزة — التسجيلات والمدفوعات تُقرأ من أحداث التتبع الحقيقية.</span>
        </EmptyHint>
      ) : (
        <>
          {/* بطاقات المراحل */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {steps.map((s, i) => <KpiCard key={s.key} step={s} prev={prev ? prevMap[s.key] : undefined} index={i} />)}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {/* القمع / الجدول */}
            <Card className="overflow-hidden">
              <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">رحلة العميل</h3>
                    <p className="text-xs text-muted-foreground">مرّر على أي مرحلة لعرض التفاصيل</p>
                  </div>
                  <div className="text-left">
                    <div className="bg-gradient-to-l from-sky-500 to-rose-500 bg-clip-text font-mono text-3xl font-black tabular-nums text-transparent">
                      {fmtPct(data!.overallFromVisitors)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">التحويل الكلي (زائر ← دفع)</div>
                  </div>
                </div>

                {view === 'funnel' ? (
                  <FunnelChart steps={steps} bottleneck={bottleneck?.key ?? null} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="py-2 text-right font-medium">المرحلة</th>
                          <th className="py-2 text-right font-medium">العدد</th>
                          <th className="py-2 text-right font-medium">من السابقة</th>
                          <th className="py-2 text-right font-medium">من الإجمالي</th>
                          <th className="py-2 text-right font-medium">الفترة السابقة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {steps.map((s) => (
                          <tr key={s.key} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2.5"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: stageOf(s.key).color }} />{s.label}</span></td>
                            <td className="py-2.5 font-mono font-bold tabular-nums">{fmtNum(s.count)}</td>
                            <td className="py-2.5 font-mono tabular-nums">{fmtPct(s.fromPrev)}</td>
                            <td className="py-2.5 font-mono tabular-nums">{fmtPct(steps[0].count ? s.count / steps[0].count : null)}</td>
                            <td className="py-2.5"><span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-muted-foreground">{fmtNum(prevMap[s.key])}<Delta now={s.count} prev={prevMap[s.key]} /></span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* الرؤى الذكية */}
            <div className="space-y-4">
              {bottleneck && (
                <div className="relative overflow-hidden rounded-2xl border border-rose-500/40 bg-gradient-to-br from-rose-500/10 to-amber-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="size-4" /> عنق الزجاجة
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed">
                    أكبر فقد عند الانتقال إلى <b>{bottleneck.label}</b> — يكمل فقط <b>{fmtPct(bottleneck.fromPrev)}</b>.
                  </p>
                  <div className="mt-2.5 flex gap-2 rounded-xl bg-background/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    {stageOf(bottleneck.key).tip}
                  </div>
                </div>
              )}

              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> نسب رئيسية</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <div className="font-mono text-lg font-bold tabular-nums">{fmtPct(data!.overallFromRegistrations)}</div>
                      <div className="text-[10px] text-muted-foreground">تسجيل ← دفع</div>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <div className="font-mono text-lg font-bold tabular-nums">{fmtPct(trialToPaid)}</div>
                      <div className="text-[10px] text-muted-foreground">تجربة ← دفع</div>
                    </div>
                  </div>
                  <DropOffRail steps={steps} bottleneck={bottleneck?.key ?? null} />
                </CardContent>
              </Card>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            كل مرحلة تُحسب من أحداث التتبع الحقيقية بمعرفات فريدة (بدون تكرار المزودين) — والزوار من جلسات التصفح الداخلية. النسب الملونة تقارن بالفترة السابقة بنفس الطول.
          </p>
        </>
      )}
    </div>
  )
}
