'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowUpLeft, Award, CalendarDays, Fingerprint, HandCoins, HeartHandshake,
  MonitorSmartphone, TrendingUp, UserCheck, Users, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import {
  CountUp, EmptyState, GlassRail, GlassStat, HR_THEMES, HrHero, ListSkeleton, ModuleDock,
  PageShell, PanelTitle, Pill, Reveal, Ring, StatusChip, dayLabel, hrGet, ink, money, monthLabel, num, tint,
} from './hr-ui'

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

/** وحدات الموارد البشرية — لكل وحدة هويتها اللونية */
const MODULES = [
  { href: '/hr/employees', icon: Users, theme: 'employees' as const, title: 'الموظفين', desc: 'ملف كل موظف: الراتب، الوظيفة، والـ PIN' },
  { href: '/hr/attendance', icon: Fingerprint, theme: 'attendance' as const, title: 'الحضور والانصراف', desc: 'سجّل يوم بيوم — أساس حساب الرواتب' },
  { href: '/hr/leaves', icon: CalendarDays, theme: 'leaves' as const, title: 'الإجازات والأذونات', desc: 'إجازة بمرتب أو بدون، والأرصدة السنوية' },
  { href: '/hr/evaluations', icon: Award, theme: 'evaluations' as const, title: 'التقييمات', desc: 'درجة الحضور + تقييمك = حافز عادل' },
  { href: '/hr/advances', icon: HandCoins, theme: 'advances' as const, title: 'السلف', desc: 'سلفة بتتخصم من الراتب بالقسط' },
  { href: '/hr/payroll', icon: Wallet, theme: 'payroll' as const, title: 'الرواتب', desc: 'مسودة بضغطة، تراجعها، واعتمدها' },
]

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

  const eligible = s ? Math.max(1, s.employeesCount) : 1
  const presencePct = s ? Math.round((s.present / eligible) * 100) : 0

  return (
    <PageShell>
      <ModuleDock exclude="home" />

      <HrHero
        theme="home"
        icon={HeartHandshake}
        kicker="غرفة عمليات الفريق"
        title="الموارد البشرية"
        subtitle={s ? dayLabel(s.today) : 'حضور، إجازات، سلف، ورواتب — من مكان واحد.'}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4" />كشك الحضور</Link></Button>
            <Button asChild size="sm" className="gap-1.5"><Link href="/hr/attendance"><UserCheck className="size-4" />سجّل الحضور</Link></Button>
          </div>
        }
      >
        {s && s.employeesCount > 0 && (
          <GlassRail>
            <GlassStat label="حاضر النهارده" value={<CountUp value={s.present} />} foot={`من ${s.employeesCount} موظف`} />
            <GlassStat label="متأخر / غائب" value={<span>{s.late.length} <span className="text-muted-foreground/60">/</span> {s.absent.length}</span>} foot="متابعة فورية" />
            <GlassStat label="تكلفة عمالة الشهر" value={<span className="whitespace-nowrap">{num(s.payroll.laborCost)} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} foot={s.payroll.isEstimate ? 'تقديري لحد النهارده' : 'نهائي'} />
            <GlassStat label="سلف جارية" value={<span className="whitespace-nowrap">{num(s.advances.remaining)} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} foot={`${s.advances.count} سلفة`} />
          </GlassRail>
        )}
      </HrHero>

      {loading || !s ? (
        <ListSkeleton />
      ) : s.employeesCount === 0 ? (
        <EmptyState
          theme="home"
          icon={Users}
          title="ابدأ بإضافة موظفيك"
          hint="اسم وراتب لكل موظف — وبعدها الحضور والرواتب بضغطة."
          action={<Button asChild><Link href="/hr/employees">ضيف أول موظف</Link></Button>}
        />
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {/* ════ الصف الأول: حضور النهارده + فلوس الشهر ════ */}
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <Reveal className="min-w-0">
              <section className="relative h-full overflow-hidden rounded-[28px] border bg-card shadow-sm">
                <div aria-hidden className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-20 -end-16 size-56 rounded-full opacity-[0.08] blur-3xl" style={{ background: HR_THEMES.home.hex }} />
                  <Fingerprint aria-hidden className="absolute -bottom-7 -start-4 size-36 rotate-6 opacity-[0.045]" strokeWidth={0.9} />
                </div>

                <div className="relative flex items-center justify-between gap-2 px-4 pt-4 sm:px-5">
                  <PanelTitle icon={Fingerprint} hex={HR_THEMES.home.hex} title="حضور النهارده" className="mb-0" />
                  <StatusChip tone={s.notRecorded > 0 ? 'amber' : 'emerald'}>
                    {s.notRecorded > 0 ? `${s.notRecorded} لسه ماتسجّلوش` : 'كل حاجة مسجّلة'}
                  </StatusChip>
                </div>

                <div className="relative flex flex-col items-center gap-5 p-4 sm:flex-row sm:px-5 sm:py-5">
                  {/* الحلقة */}
                  <div className="relative shrink-0">
                    <Ring value={presencePct} size={148} stroke={13} hex={HR_THEMES.home.hex}>
                      <div>
                        <div className="text-3xl font-black tabular-nums leading-none">
                          <CountUp value={s.present} />
                        </div>
                        <div className="mt-1 text-[11px] font-bold text-muted-foreground">حاضر من {s.employeesCount}</div>
                      </div>
                    </Ring>
                  </div>

                  {/* الشبكة */}
                  <div className="grid w-full min-w-0 flex-1 grid-cols-2 gap-2">
                    <MiniStat hex={HR_THEMES.attendance.hex} label="متأخر" value={s.late.length} />
                    <MiniStat hex="#f43f5e" label="غائب" value={s.absent.length} />
                    <MiniStat hex="#0ea5e9" label="في إجازتهم الأسبوعية" value={s.onOff} />
                    <MiniStat hex="#64748b" label="لسه ماتسجّلش" value={s.notRecorded} />
                  </div>
                </div>

                {(s.late.length > 0 || s.absent.length > 0) && (
                  <div className="relative flex flex-wrap gap-1.5 px-4 pb-4 sm:px-5">
                    {s.late.map((e) => <Pill key={`l${e.id}`} tone="amber">{e.name} — متأخر {e.lateMinutes} د</Pill>)}
                    {s.absent.map((e) => <Pill key={`a${e.id}`} tone="rose">{e.name} — غائب</Pill>)}
                  </div>
                )}
              </section>
            </Reveal>

            <Reveal delay={70} className="min-w-0">
              <section className="relative h-full overflow-hidden rounded-[28px] border bg-card shadow-sm">
                <div aria-hidden className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-24 -start-10 size-64 rounded-full opacity-[0.12] blur-3xl" style={{ background: HR_THEMES.payroll.hex }} />
                  <Wallet aria-hidden className="absolute -bottom-8 -end-6 size-40 -rotate-6 opacity-[0.05]" strokeWidth={0.9} />
                </div>

                <div className="relative px-4 pt-4 sm:px-5">
                  <PanelTitle icon={TrendingUp} hex={HR_THEMES.payroll.hex} title={`فلوس الشهر — ${monthLabel(s.month)}`} className="mb-0" />
                </div>

                <div className="relative flex h-[calc(100%-52px)] flex-col justify-between gap-4 p-4 sm:px-5 sm:py-5">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
                        <CountUp value={s.payroll.laborCost} />
                      </span>
                      <span className="text-sm font-bold text-muted-foreground">جنيه</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.payroll.isEstimate ? 'تكلفة العمالة التقديرية لحد النهارده' : 'تكلفة العمالة الفعلية'}
                    </p>

                    {/* نسبة العمالة من المبيعات */}
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-muted-foreground">من كل 100 جنيه بيع</span>
                        <span className="font-black tabular-nums" style={{ color: ink(HR_THEMES.payroll.hex, 82) }}>
                          {s.laborPct === null ? '—' : `${s.laborPct} جنيه`}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{
                            width: `${Math.min(100, s.laborPct ?? 0)}%`,
                            background: `linear-gradient(to left, ${HR_THEMES.payroll.hex}, color-mix(in srgb, ${HR_THEMES.payroll.hex} 55%, white))`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {s.laborPct === null ? 'مفيش مبيعات الشهر ده لسه' : `مبيعات الشهر ${money(s.salesThisMonth)}`}
                      </p>
                    </div>
                  </div>

                  {/* حالة الرواتب */}
                  <div className="flex items-center justify-between gap-2 rounded-2xl border bg-background/60 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-amber-500" />رواتب الشهر
                      </p>
                      <div className="mt-1">
                        {s.payroll.status === 'paid' ? <StatusChip tone="emerald">اتصرفت</StatusChip>
                          : s.payroll.status === 'draft' ? <StatusChip tone="amber">مسودة جاهزة</StatusChip>
                          : <StatusChip tone="slate">لسه ماتجهزتش</StatusChip>}
                      </div>
                    </div>
                    <Button asChild size="sm" variant={s.payroll.status === 'paid' ? 'outline' : 'default'} className="shrink-0 gap-1.5">
                      <Link href="/hr/payroll"><Wallet className="size-4" />{s.payroll.status === 'paid' ? 'عرض' : 'جهّز / اعتمد'}</Link>
                    </Button>
                  </div>
                </div>
              </section>
            </Reveal>
          </div>

          {/* ════ التنبيهات ════ */}
          {s.alerts.length > 0 && (
            <Reveal delay={100}>
              <section className="relative overflow-hidden rounded-[28px] border border-amber-500/40 bg-warning-subtle shadow-sm">
                <AlertTriangle aria-hidden className="pointer-events-none absolute -bottom-6 -start-4 size-28 rotate-6 text-amber-500/10" strokeWidth={1} />
                <div className="flex items-center gap-2.5 border-b border-amber-500/20 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground">
                    <AlertTriangle className="size-4" strokeWidth={2.4} />
                  </span>
                  <h2 className="text-sm font-bold text-warning-subtle-foreground">يستاهل انتباهك</h2>
                </div>
                <ul className="grid gap-x-6 px-4 py-1.5 text-sm sm:grid-cols-2">
                  {s.alerts.map((a) => (
                    <li key={`${a.kind}${a.id}`} className="flex items-start gap-2 border-b border-amber-500/10 py-2 last:border-0 sm:border-b-0">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span><b>{a.name}</b> — {a.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </Reveal>
          )}

          {/* ════ الوحدات — مشغّل التطبيقات ════ */}
          <Reveal delay={s.alerts.length > 0 ? 140 : 100}>
            <section>
              <PanelTitle icon={HeartHandshake} hex={HR_THEMES.home.hex} title="وحدات الموارد البشرية" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((m, idx) => {
                  const t = HR_THEMES[m.theme]
                  return (
                    <Link
                      key={m.href}
                      href={m.href}
                      className="group relative overflow-hidden rounded-3xl border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      {/* توهج هوية الوحدة */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -end-10 -top-14 size-32 rounded-full opacity-[0.06] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
                        style={{ background: t.hex }}
                      />
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-[3px] transition-transform duration-300 group-hover:scale-x-105"
                        style={{ background: `linear-gradient(to left, ${t.hex}, ${tint(t.hex, 20)})` }}
                      />
                      <div className="relative flex items-start gap-3">
                        <span
                          className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-md transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
                          style={{ background: `linear-gradient(140deg, ${t.hex}, color-mix(in srgb, ${t.hex} 66%, black))` }}
                        >
                          <m.icon className="size-5" strokeWidth={2.2} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="flex items-center justify-between gap-2 font-extrabold">
                            {m.title}
                            <span
                              className="grid size-6 shrink-0 place-items-center rounded-full opacity-40 transition-all duration-300 group-hover:opacity-100 group-hover:-translate-y-0.5"
                              style={{ background: tint(t.hex, 14), color: ink(t.hex, 85) }}
                            >
                              <ArrowUpLeft className="size-3.5" strokeWidth={2.5} />
                            </span>
                          </h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          </Reveal>
        </div>
      )}
    </PageShell>
  )
}

/** خلية إحصائية صغيرة بلون هوية */
function MiniStat({ hex, label, value }: { hex: string; label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-background/50 px-3 py-2.5 transition-colors hover:bg-muted/40">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ background: hex }} />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-xl font-black tabular-nums leading-none" style={{ color: ink(hex, 82) }}>
        <CountUp value={value} duration={650} />
      </p>
    </div>
  )
}
