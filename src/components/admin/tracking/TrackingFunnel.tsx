'use client'

/**
 * 🔬 تحليل مسار التحويل — Visitors → Registrations → Trials → Checkouts → Purchases
 * تصميم مضغوط بعرض كامل (إعادة بناء من الصفر):
 *   1) شريط ملخص موحّد: التحويل الكلي + عدد كل مرحلة ونسبة إكمالها
 *   2) مسار التحويل في صفوف أفقية (أو جدول) + عمود جانبي: ترتيب التسرّب والفرصة الأولى
 *   3) ملاحظات تحليلية في شبكة بعرض الصفحة
 * نفس الـ API: /api/admin/tracking/funnel — كل الألوان من توكنز النظام، بلا مكتبات إضافية.
 */

import * as React from 'react'
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
  DataIssueBanner,
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

/* ───────── مكوّنات الواجهة ───────── */

/** لوح موحّد: رأس بعنوان + جسم — بدون هوامش ضخمة */
function Panel({ title, icon: Icon, tone = 'text-primary', subtitle, action, className, children }: {
  title: string; icon: React.ElementType; tone?: string; subtitle?: string
  action?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Icon className={cn('size-4 shrink-0', tone)} />
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function EmptyBlock({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon className="size-7 text-muted-foreground/50" />
      <p className="text-sm font-medium text-muted-foreground">{text}</p>
    </div>
  )
}

/** شريط الملخص: التحويل الكلي + خلية لكل مرحلة (فواصل بـ gap-px) */
function SummaryStrip({ steps, prevMap, hasPrev, bottleneckKey, data, overallPct, overallDelta }: {
  steps: FunnelStep[]; prevMap: Record<string, number>; hasPrev: boolean; bottleneckKey: string | null
  data: FunnelData; overallPct: number; overallDelta: number | null
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-sm sm:grid-cols-3 xl:grid-cols-6">
      {/* التحويل الكلي */}
      <div className="col-span-2 min-w-0 bg-primary-subtle/40 p-4 sm:col-span-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          التحويل الكلي
        </p>
        <p className="mt-2 flex items-baseline gap-1 leading-none">
          <span className="text-3xl font-extrabold tabular-nums tracking-tight">{overallPct.toFixed(1)}</span>
          <span className="text-sm font-semibold text-muted-foreground">%</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>{num(data.purchases)} من {num(data.visitors)} زائر</span>
          <Delta value={overallDelta} unit="pp" />
        </div>
      </div>

      {steps.map((s, i) => {
        const meta = stageOf(s.key)
        const Icon = meta.icon
        const isBn = bottleneckKey === s.key
        return (
          <div key={s.key} className="min-w-0 bg-card p-4 last:col-span-2 sm:last:col-span-1">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-md bg-muted', meta.text)}>
                <Icon className="size-3.5" />
              </span>
              <span className="truncate">{s.label}</span>
            </p>
            <p className="mt-2 text-2xl font-extrabold leading-none tabular-nums tracking-tight">{num(s.count)}</p>
            <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1 text-[11px]">
              {i === 0 ? (
                <span className="text-muted-foreground">نقطة البداية</span>
              ) : (
                <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold tabular-nums', isBn ? TONE.danger.chip : TONE.neutral.chip)}>
                  <TrendingDown className="size-3" />
                  يكمل {fmtPct(s.fromPrev)}
                </span>
              )}
              {hasPrev && <Delta value={relChange(s.count, prevMap[s.key])} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** المسار: صف أفقي لكل مرحلة — الاسم | الشريط + تفاصيل التسرّب | العدد */
function FunnelRows({ steps, prevMap, bottleneckKey }: {
  steps: FunnelStep[]; prevMap: Record<string, number>; bottleneckKey: string | null
}) {
  const max = Math.max(steps[0]?.count ?? 0, ...steps.map((s) => prevMap[s.key] ?? 0), 1)
  return (
    <>
      <ul className="divide-y divide-border">
        {steps.map((s, i) => {
          const meta = stageOf(s.key)
          const Icon = meta.icon
          const prevCount = prevMap[s.key]
          const prevPct = prevCount != null ? Math.min(prevCount / max, 1) * 100 : null
          const lost = i > 0 ? Math.max(steps[i - 1].count - s.count, 0) : 0
          const isBn = bottleneckKey === s.key
          const odd = s.fromPrev != null && s.fromPrev > 1
          return (
            <li key={s.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex w-28 shrink-0 items-center gap-2 pt-px sm:w-36">
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg bg-muted', meta.text)}>
                  <Icon className="size-3.5" />
                </span>
                <span className="truncate text-sm font-semibold">{s.label}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
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
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  {i > 0 && (
                    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold tabular-nums', isBn ? TONE.danger.chip : TONE.neutral.chip)}>
                      <TrendingDown className="size-3" />
                      {s.fromPrev == null ? '—' : `يكمل ${fmtPct(s.fromPrev)}`}
                    </span>
                  )}
                  {i > 0 && <span className="tabular-nums">فقد {num(lost)}</span>}
                  {isBn && <span className="font-bold text-destructive">أكبر تسرّب</span>}
                  {prevCount != null && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
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

              <div className="w-20 shrink-0 text-end sm:w-24">
                <p className="text-lg font-extrabold leading-tight tabular-nums">{num(s.count)}</p>
                {i > 0 && steps[0].count > 0 && (
                  <p className="text-[11px] tabular-nums text-muted-foreground">{fmtPct(s.count / steps[0].count)} من الزوار</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">الخط الرأسي على الشريط = قيمة نفس المرحلة في الفترة السابقة.</p>
    </>
  )
}

function FunnelTable({ steps, prevMap, bottleneckKey }: {
  steps: FunnelStep[]; prevMap: Record<string, number>; bottleneckKey: string | null
}) {
  const first = steps[0]?.count ?? 0
  const last = steps[steps.length - 1]?.count ?? 0
  const overall = first > 0 ? last / first : null
  const th = 'px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground'
  return (
    <>
    {/* 📱 الجوال: كارت لكل مرحلة */}
    <div className="-m-4 md:hidden">
      <ul className="divide-y divide-border">
        {steps.map((s, i) => {
          const meta = stageOf(s.key)
          const Icon = meta.icon
          const isBn = bottleneckKey === s.key
          const lost = i > 0 ? Math.max(steps[i - 1].count - s.count, 0) : 0
          const share = first > 0 ? Math.min(s.count / first, 1) : null
          const r = s.fromPrev
          const rateTone: Tone = r == null ? 'neutral' : r < 0.2 ? 'danger' : r < 0.5 ? 'warning' : 'success'
          const prevCount = prevMap[s.key]
          return (
            <li key={s.key} className={cn('space-y-2.5 p-3.5', isBn && 'bg-destructive-subtle/30')}>
              <div className="flex items-center gap-2.5">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-muted', meta.text)}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.label}</p>
                  {isBn && (
                    <span className={cn('mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold', TONE.danger.chip)}>أكبر تسرّب</span>
                  )}
                </div>
                <p className="text-xl font-extrabold leading-none tabular-nums">{num(s.count)}</p>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>من الزوار</span>
                  <span className="font-semibold tabular-nums text-foreground">{fmtPct(share)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${share != null && share > 0 ? Math.max(share * 100, 3) : 0}%` }} />
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-lg bg-muted/50 px-1.5 py-2">
                  <dt className="text-muted-foreground">من السابقة</dt>
                  <dd className="mt-1">
                    {i === 0 || r == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={cn('inline-block rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums', TONE[rateTone].chip)}>
                        {fmtPct(r)}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-1.5 py-2">
                  <dt className="text-muted-foreground">الفقد</dt>
                  <dd className="mt-1 text-xs tabular-nums">
                    {i === 0 || lost === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="font-bold text-destructive">−{num(lost)}</span>
                    )}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-1.5 py-2">
                  <dt className="text-muted-foreground">الفترة السابقة</dt>
                  <dd className="mt-1 flex flex-wrap items-center justify-center gap-1 text-xs">
                    <span className="tabular-nums text-muted-foreground">{prevCount != null ? num(prevCount) : '—'}</span>
                    <Delta value={relChange(s.count, prevCount)} />
                  </dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 px-4 py-3 text-xs">
        <span className="font-medium text-muted-foreground">التحويل الكلي (زائر ← عميل مدفوع)</span>
        <span className="text-sm font-extrabold tabular-nums text-primary">{fmtPct(overall)}</span>
      </div>
    </div>

    {/* 🖥️ الشاشات الأكبر: الجدول — -m-4 يلغي بادينج اللوح فيمتد الجدول لحواف البطاقة */}
    <div className="-m-4 hidden overflow-x-auto md:block">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className={cn(th, 'ps-4 text-start')}>المرحلة</th>
            <th className={th}>العدد</th>
            <th className={th}>من السابقة</th>
            <th className={th}>من الزوار</th>
            <th className={th}>الفقد</th>
            <th className={cn(th, 'pe-4')}>الفترة السابقة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {steps.map((s, i) => {
            const meta = stageOf(s.key)
            const Icon = meta.icon
            const isBn = bottleneckKey === s.key
            const lost = i > 0 ? Math.max(steps[i - 1].count - s.count, 0) : 0
            const share = first > 0 ? Math.min(s.count / first, 1) : null
            const r = s.fromPrev
            const rateTone: Tone = r == null ? 'neutral' : r < 0.2 ? 'danger' : r < 0.5 ? 'warning' : 'success'
            const prevCount = prevMap[s.key]
            return (
              <tr key={s.key} className={cn('transition-colors hover:bg-muted/40', isBn && 'bg-destructive-subtle/30')}>
                {/* المرحلة */}
                <td className="py-3 ps-4 pe-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg bg-muted', meta.text)}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="font-semibold">{s.label}</span>
                    {isBn && (
                      <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', TONE.danger.chip)}>أكبر تسرّب</span>
                    )}
                  </div>
                </td>

                {/* العدد */}
                <td className="px-3 py-3 text-center text-base font-extrabold tabular-nums">{num(s.count)}</td>

                {/* من السابقة */}
                <td className="px-3 py-3 text-center">
                  {i === 0 || r == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn('inline-block min-w-14 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums', TONE[rateTone].chip)}>
                      {fmtPct(r)}
                    </span>
                  )}
                </td>

                {/* من الزوار + شريط صغير */}
                <td className="px-3 py-3">
                  <div className="mx-auto w-24">
                    <p className="text-center text-xs font-semibold tabular-nums">{fmtPct(share)}</p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share != null && share > 0 ? Math.max(share * 100, 3) : 0}%` }} />
                    </div>
                  </div>
                </td>

                {/* الفقد */}
                <td className="px-3 py-3 text-center tabular-nums">
                  {i === 0 || lost === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="font-semibold text-destructive">−{num(lost)}</span>
                  )}
                </td>

                {/* الفترة السابقة: الرقم ثم شارة التغيّر */}
                <td className="py-3 ps-3 pe-4">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="tabular-nums text-muted-foreground">{prevCount != null ? num(prevCount) : '—'}</span>
                    <Delta value={relChange(s.count, prevCount)} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/50">
            <td colSpan={6} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-muted-foreground">التحويل الكلي (زائر ← عميل مدفوع)</span>
                <span className="text-sm font-extrabold tabular-nums text-primary">{fmtPct(overall)}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
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
    <div className="w-full min-w-0 space-y-3 sm:space-y-4" dir="rtl">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">
            تحليل <span className="text-primary">مسار التحويل</span>
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
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
      <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      {data?.dataReady === false && <DataIssueBanner errorDetail={data.errorDetail} />}
      {data?.degraded && <DataIssueBanner degraded errorDetail={data.errorDetail} />}

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid gap-3 xl:grid-cols-3">
            <Skeleton className="h-72 rounded-xl xl:col-span-2" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-10 text-center shadow-sm">
          <Funnel className="size-9 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-muted-foreground">لا توجد بيانات كافية في هذه الفترة</p>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            وسّع النطاق الزمني أو أزل فلاتر الحملة. يبدأ احتساب الزوار من لحظة تفعيل التتبع، وتُقرأ التسجيلات والمدفوعات من أحداث حقيقية.
          </p>
          <a href="/?view=tracking-settings" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            مراجعة إعدادات التتبع <ArrowUpLeft className="size-3" />
          </a>
        </div>
      ) : (
        <>
          {/* 1) شريط الملخص */}
          <SummaryStrip
            steps={steps}
            prevMap={prevMap}
            hasPrev={!!prev}
            bottleneckKey={bottleneck?.key ?? null}
            data={data!}
            overallPct={overallPct}
            overallDelta={overallDelta}
          />

          {/* 2) المسار + العمود الجانبي */}
          <div className="grid items-start gap-3 sm:gap-4 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="مسار التحويل"
              icon={Activity}
              subtitle="حجم كل مرحلة ونسبة إكمالها من التي قبلها"
              action={
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
                  {([['funnel', 'المسار', BarChart3], ['table', 'الجدول', Table2]] as const).map(([k, l, I]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setView(k)}
                      className={cn(
                        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                        view === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <I className="size-3.5" /> {l}
                    </button>
                  ))}
                </div>
              }
            >
              {view === 'funnel' ? (
                <FunnelRows steps={steps} prevMap={prevMap} bottleneckKey={bottleneck?.key ?? null} />
              ) : (
                <FunnelTable steps={steps} prevMap={prevMap} bottleneckKey={bottleneck?.key ?? null} />
              )}
            </Panel>

            <div className="grid min-w-0 gap-3 sm:gap-4">
              <Panel title="ترتيب التسرّب" icon={TrendingDown} tone="text-destructive" subtitle="الانتقالات من الأضعف إلى الأقوى">
                {transitions.length ? (
                  <ol className="divide-y divide-border">
                    {transitions.map((t, i) => {
                      const r = t.rate ?? 0
                      const tone: Tone = r < 0.2 ? 'danger' : r < 0.5 ? 'warning' : 'success'
                      return (
                        <li key={t.to.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums', i === 0 ? TONE.danger.chip : TONE.neutral.chip)}>
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
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">فقد {num(t.lost)}</span>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <EmptyBlock icon={Funnel} text="لا توجد انتقالات كافية للمقارنة" />
                )}
              </Panel>

              <Panel
                title="فرصة التحسين الأولى"
                icon={Target}
                subtitle={bottleneck ? `الخطوة المستهدفة: ${bottleneck.label}` : 'تظهر عند توفر بيانات كافية'}
              >
                {bottleneck ? (
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      السؤال التحليلي: <b className="text-foreground">{stageOf(bottleneck.key).question}</b>
                    </p>
                    {opportunity != null && (
                      <div className={cn('rounded-lg px-3 py-2.5', TONE.success.row)}>
                        <p className="text-lg font-extrabold tabular-nums text-success">+{num(opportunity)} عملية دفع</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          أثر تقديري لو تحسّن معدل «{bottleneck.label}» بنسبة 10% نسبياً مع ثبات بقية المسار.
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold"><FlaskRound className="size-3.5 text-primary" /> فرضيات للاختبار</p>
                      <ul className="space-y-1.5">
                        {stageOf(bottleneck.key).hypotheses.map((h, i) => (
                          <li key={i} className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <EmptyBlock icon={Target} text="لا توجد خطوة ضعيفة محددة بعد" />
                )}
              </Panel>
            </div>
          </div>

          {/* 3) الملاحظات التحليلية */}
          <Panel title="ملاحظات تحليلية" icon={Sparkles} subtitle="مولّدة تلقائياً من بيانات هذه الفترة">
            <ul className="grid gap-2 md:grid-cols-2">
              {insights.map((it, i) => (
                <li key={i} className={cn('rounded-lg px-3 py-2.5', TONE[it.tone].row)}>
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <span className={cn('size-1.5 shrink-0 rounded-full', TONE[it.tone].dot)} />
                    {it.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.body}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            تُحسب كل مرحلة بمعرّفات فريدة من أحداث التتبع الفعلية (دون تكرار المزوّدين)، والزوار من جلسات التصفح الداخلية. الأثر التقديري افتراضي ويحتاج اختباراً للتأكد.
          </p>
        </>
      )}
    </div>
  )
}
