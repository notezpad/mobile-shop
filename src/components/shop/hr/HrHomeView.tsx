'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, MonitorSmartphone, Wallet, Sparkles, Coins, Percent,
  HandCoins, PartyPopper, UserPlus, UsersRound, Clock3,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import { dayLabel, hrGet, money, monthLabel } from './hr-ui'
import { KioskAutoFlush } from './KioskQueueBanner'

interface Summary {
  today: string; month: string; employeesCount: number; present: number
  late: { id: number; name: string; lateMinutes: number }[]
  absent: { id: number; name: string }[]
  leave: { id: number; name: string }[]
  onOff: number; notRecorded: number
  advances: { count: number; remaining: number }
  payroll: { runId: number | null; status: 'draft' | 'paid' | null; estimated: number; laborCost: number; isEstimate: boolean }
  salesThisMonth: number; laborPct: number | null
  alerts: { kind: 'attendance' | 'advance'; id: number; name: string; text: string }[]
}

/* ============================================================
   أدوات صغيرة
   ============================================================ */

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
const initial = (name: string) => name.trim().charAt(0) || '؟'

/* ============================================================
   الحلقة الدائرية — نسبة الحضور (هيرو)
   ============================================================ */

function ProgressRing({ value, size = 128, stroke = 10 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, value))
  const offset = c - (clamped / 100) * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/20" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        className="stroke-white transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  )
}

/* ============================================================
   شريط الحضور المجزّأ (stacked bar) + ليجند
   ============================================================ */

const SEG_TONE = {
  present: { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  late: { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  absent: { bar: 'bg-rose-500', dot: 'bg-rose-500' },
  leave: { bar: 'bg-sky-500', dot: 'bg-sky-500' },
  off: { bar: 'bg-violet-400', dot: 'bg-violet-400' },
  pending: { bar: 'bg-muted-foreground/25', dot: 'bg-muted-foreground/40' },
} as const

type SegKey = keyof typeof SEG_TONE

function AttendanceBar({ segments }: { segments: { key: SegKey; label: string; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.filter((s) => s.value > 0).map((s) => (
          <div
            key={s.key}
            className={cn('h-full transition-all duration-700 ease-out', SEG_TONE[s.key].bar)}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 rounded-full bg-muted/70 py-1 ps-1 pe-2.5 text-xs font-semibold text-muted-foreground">
            <span className={cn('size-2 shrink-0 rounded-full', SEG_TONE[s.key].dot)} />
            {s.label} <span className="tabular-nums font-extrabold text-foreground">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NameChip({ name, tone, note }: { name: string; tone: 'amber' | 'rose'; note: string }) {
  const badge = tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border bg-card/60 py-1.5 ps-1.5 pe-3">
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white', badge)}>
        {initial(name)}
      </span>
      <div className="leading-tight">
        <div className="whitespace-nowrap text-xs font-bold">{name}</div>
        <div className="whitespace-nowrap text-[10px] text-muted-foreground">{note}</div>
      </div>
    </div>
  )
}

/* ============================================================
   كارت بنتو عام (مال الشهر)
   ============================================================ */

const TILE_TONE = {
  violet: {
    card: 'from-violet-50 to-white dark:from-violet-950/30 dark:to-card border-t-violet-500',
    badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    wm: 'text-violet-500',
  },
  sky: {
    card: 'from-sky-50 to-white dark:from-sky-950/30 dark:to-card border-t-sky-500',
    badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    wm: 'text-sky-500',
  },
  amber: {
    card: 'from-amber-50 to-white dark:from-amber-950/30 dark:to-card border-t-amber-500',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    wm: 'text-amber-500',
  },
  emerald: {
    card: 'from-emerald-50 to-white dark:from-emerald-950/30 dark:to-card border-t-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    wm: 'text-emerald-500',
  },
  slate: {
    card: 'from-muted to-card border-t-border-strong',
    badge: 'bg-muted text-muted-foreground',
    wm: 'text-muted-foreground',
  },
} as const

/** كارت بنتو بهوية بصرية — تدرّج خفيف + إطار علوي ملوّن + أيقونة واترمارك كبيرة (نفس لغة الكاش والموردين) */
function Tile({
  icon: Icon, tone, label, value, hint, footer,
}: {
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof TILE_TONE
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  footer?: React.ReactNode
}) {
  const t = TILE_TONE[tone]
  return (
    <div className={cn('relative flex flex-col justify-between overflow-hidden rounded-2xl border border-t-2 bg-gradient-to-br p-4 shadow-xs transition-shadow hover:shadow-md sm:p-5', t.card)}>
      <Icon aria-hidden className={cn('pointer-events-none absolute -bottom-4 -start-3 size-20 opacity-[0.08] sm:size-24', t.wm)} strokeWidth={1.25} />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', t.badge)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="relative my-2 text-2xl font-extrabold tabular-nums sm:text-[26px]">{value}</div>
      <div className="relative">{footer ?? (hint && <div className="text-xs text-muted-foreground">{hint}</div>)}</div>
    </div>
  )
}

/* ============================================================
   الهيرو
   ============================================================ */

function Hero({ s }: { s: Summary }) {
  const presentPct = pct(s.present, s.employeesCount)
  const needsAttention = s.late.length + s.absent.length
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 text-white dark:from-indigo-900 dark:via-violet-900 dark:to-sky-950">
      {/* توهّج دافئ متباين — يفصل هوية الموارد البشرية عن أخضر المحل */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-[26rem] rounded-full bg-amber-400/30 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 -left-20 size-72 rounded-full bg-fuchsia-500/25 blur-[80px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-1/4 size-96 rounded-full bg-sky-400/20 blur-[100px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1.2px)',
          backgroundSize: '20px 20px',
          maskImage: 'linear-gradient(to bottom, black, transparent 80%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 80%)',
        }}
      />

      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-9 sm:px-6 sm:py-11 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="min-w-0 animate-in-up">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-white/15 shadow-lg shadow-black/10 ring-1 ring-white/20 backdrop-blur-sm">
              <UsersRound className="size-5" />
            </span>
            <div className="flex items-center gap-1.5 text-white/75">
              <Sparkles className="size-3.5" />
              <span className="text-xs font-bold">{dayLabel(s.today)}</span>
            </div>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">الموارد البشرية</h1>
          <p className="mt-2.5 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
            {s.employeesCount} موظف — {s.present} حاضر النهاردة
            {needsAttention > 0 ? `، و${needsAttention} محتاجين متابعة.` : '، والفريق كله مضبوط.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button asChild size="lg" className="border-0 bg-white font-extrabold text-indigo-700 shadow-lg shadow-black/15 hover:bg-white/90 hover:text-indigo-700">
              <Link href="/hr/attendance">سجّل الحضور</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/10 text-white backdrop-blur-sm hover:border-white/40 hover:bg-white/20 hover:text-white">
              <Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4" />كشك الحضور</Link>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-5 rounded-3xl border border-white/15 bg-white/10 p-5 shadow-xl shadow-black/10 backdrop-blur-md sm:gap-7 sm:p-6">
          <div className="relative grid shrink-0 place-items-center">
            <ProgressRing value={presentPct} />
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-extrabold tabular-nums sm:text-3xl">{presentPct}%</span>
              <span className="text-[11px] font-bold text-white/70">حاضر</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 text-sm font-bold">
            <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-white" />{s.present} حاضر</div>
            <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-amber-300" />{s.late.length} متأخر</div>
            <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-300" />{s.absent.length} غائب</div>
            <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-white/40" />{s.notRecorded} لسه ماتسجّلش</div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   سكيلتون التحميل — بنفس تناسب الشاشة النهائية
   ============================================================ */

function LoadingSkeleton() {
  return (
    <div>
      <div className="h-[260px] w-full animate-pulse bg-gradient-to-br from-indigo-600/40 via-violet-600/30 to-sky-600/40 sm:h-[220px]" />
      <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-40 animate-pulse rounded-2xl bg-muted/60 lg:col-span-2" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />)}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   حالة عدم وجود موظفين
   ============================================================ */

function EmptyHero({ today }: { today: string }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 text-white dark:from-indigo-900 dark:via-violet-900 dark:to-sky-950">
      <div aria-hidden className="pointer-events-none absolute -top-20 -right-10 size-80 rounded-full bg-amber-400/25 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-72 rounded-full bg-fuchsia-500/20 blur-[80px]" />
      <div className="relative mx-auto flex max-w-[1600px] flex-col items-center gap-5 px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-white/70">
          <Sparkles className="size-4" />
          <span className="text-xs font-bold">{dayLabel(today)}</span>
        </div>
        <span className="flex size-16 items-center justify-center rounded-2xl bg-white/15 shadow-lg shadow-black/10 ring-1 ring-white/20 backdrop-blur-sm">
          <UserPlus className="size-7" />
        </span>
        <h1 className="text-2xl font-extrabold sm:text-3xl">ابدأ بإضافة موظفيك</h1>
        <p className="max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
          اسم وراتب ويوم إجازة لكل موظف — وبعدها تسجّل الحضور وتحسب الرواتب بضغطة.
        </p>
        <Button asChild size="lg" className="mt-1 border-0 bg-white font-extrabold text-indigo-700 shadow-lg shadow-black/10 hover:bg-white/90 hover:text-indigo-700">
          <Link href="/hr/employees">ضيف أول موظف</Link>
        </Button>
      </div>
    </section>
  )
}

/* ============================================================
   الصفحة
   ============================================================ */

export function HrHomeView() {
  const [s, setS] = React.useState<Summary | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try { setS(await hrGet<Summary>('/api/hr/summary')) }
    catch (e: any) { toast.error(e?.message || 'فشل تحميل الملخص') }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const payrollTone: keyof typeof TILE_TONE =
    s?.payroll.status === 'paid' ? 'emerald' : s?.payroll.status === 'draft' ? 'sky' : 'slate'

  return (
    <div className="-mx-3 sm:-mx-6">
      <KioskAutoFlush />

      {loading || !s ? (
        <LoadingSkeleton />
      ) : s.employeesCount === 0 ? (
        <EmptyHero today={s.today} />
      ) : (
        <>
          <Hero s={s} />

          <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
            {/* ─── تفاصيل الحضور + تنبيهات ─── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className="relative overflow-hidden rounded-2xl border border-t-2 border-t-indigo-500 bg-card p-4 sm:p-5 lg:col-span-2">
                <div className="mb-3.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <Clock3 className="size-4" />
                    </span>
                    <h2 className="text-sm font-extrabold">تفاصيل الحضور النهاردة</h2>
                  </div>
                  <Link href="/hr/attendance" className="text-xs font-bold text-primary hover:underline">
                    كل السجلات
                  </Link>
                </div>
                <AttendanceBar
                  segments={[
                    { key: 'present', label: 'حاضر', value: s.present },
                    { key: 'late', label: 'متأخر', value: s.late.length },
                    { key: 'absent', label: 'غائب', value: s.absent.length },
                    { key: 'leave', label: 'إجازة', value: s.leave.length },
                    { key: 'off', label: 'إجازة أسبوعية', value: s.onOff },
                    { key: 'pending', label: 'لسه ماتسجّلش', value: s.notRecorded },
                  ]}
                />
                {(s.late.length > 0 || s.absent.length > 0) && (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {s.late.map((e) => (
                      <NameChip key={`l${e.id}`} name={e.name} tone="amber" note={`متأخر ${e.lateMinutes} د`} />
                    ))}
                    {s.absent.map((e) => (
                      <NameChip key={`a${e.id}`} name={e.name} tone="rose" note="غائب" />
                    ))}
                  </div>
                )}
              </section>

              <section
                className={cn(
                  'relative overflow-hidden rounded-2xl border border-t-2 p-4 sm:p-5',
                  s.alerts.length > 0 ? 'border-t-amber-500 bg-amber-500/5' : 'border-t-emerald-500 bg-card',
                )}
              >
                <div className="mb-3.5 flex items-center gap-2.5">
                  <span className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-xl',
                    s.alerts.length > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                  )}>
                    {s.alerts.length > 0 ? <AlertTriangle className="size-4" /> : <PartyPopper className="size-4" />}
                  </span>
                  <h2 className="text-sm font-extrabold">يستاهل انتباهك</h2>
                </div>
                {s.alerts.length > 0 ? (
                  <ul className="space-y-2.5">
                    {s.alerts.map((a) => (
                      <li key={`${a.kind}${a.id}`} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span><b className="font-extrabold">{a.name}</b> — {a.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">مفيش حاجة تستاهل قلق دلوقتي — كل حاجة ماشية تمام.</p>
                )}
              </section>
            </div>

            {/* ─── فلوس الشهر ─── */}
            <section>
              <h2 className="mb-3 text-sm font-extrabold">فلوس الشهر — {monthLabel(s.month)}</h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <Tile
                  icon={Coins}
                  tone="violet"
                  label={s.payroll.isEstimate ? 'تكلفة العمالة (تقديرية)' : 'تكلفة العمالة'}
                  value={money(s.payroll.laborCost)}
                />
                <Tile
                  icon={Percent}
                  tone="sky"
                  label="من كل 100 جنيه بيع"
                  value={s.laborPct === null ? '—' : `${s.laborPct} جنيه`}
                  hint={s.laborPct === null ? 'مفيش مبيعات الشهر ده لسه' : `مبيعات الشهر ${money(s.salesThisMonth)}`}
                />
                <Tile
                  icon={HandCoins}
                  tone="amber"
                  label="سلف على الموظفين"
                  value={money(s.advances.remaining)}
                  hint={`${s.advances.count} سلفة جارية`}
                />
                <Tile
                  icon={Wallet}
                  tone={payrollTone}
                  label="رواتب الشهر"
                  value={s.payroll.status === 'paid' ? 'اتصرفت ✅' : s.payroll.status === 'draft' ? 'مسودة جاهزة' : 'لسه ماتجهزتش'}
                  footer={
                    <Button asChild size="sm" variant={s.payroll.status === 'paid' ? 'outline' : 'default'} className="mt-2 w-full gap-1.5">
                      <Link href="/hr/payroll">{s.payroll.status === 'paid' ? 'عرض' : 'جهّز / اعتمد'}</Link>
                    </Button>
                  }
                />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
