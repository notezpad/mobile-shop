'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowUpLeft, Award, Banknote, CalendarDays, FileClock, Fingerprint, HandCoins, HeartHandshake,
  MonitorSmartphone, PiggyBank, Percent, UserCheck, Users, Wallet, BadgeCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import {
  EmptyState, HR_THEMES, HrHero, HrKpi, KpiGrid, ListSkeleton, PageShell, Panel, PanelTitle, Pill, SegBar, StatusChip,
  dayLabel, hrGet, money, monthLabel,
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

  const total = s?.employeesCount ?? 0
  const lateN = s?.late.length ?? 0
  const absentN = s?.absent.length ?? 0
  const leaveN = s?.leave.length ?? 0
  const moduleChip = (href: string): string | null => {
    if (!s) return null
    switch (href) {
      case '/hr/employees': return `${s.employeesCount} موظف`
      case '/hr/attendance': return s.notRecorded > 0 ? `${s.notRecorded} لسه ماتسجّلوش` : 'كله مسجّل ✓'
      case '/hr/leaves': return leaveN > 0 ? `${leaveN} في إجازة النهارده` : null
      case '/hr/advances': return s.advances.count > 0 ? `${s.advances.count} جارية` : null
      case '/hr/payroll': return s.payroll.status === 'paid' ? 'اتصرفت' : s.payroll.status === 'draft' ? 'مسودة جاهزة' : 'لسه ماتجهزتش'
      default: return null
    }
  }

  return (
    <PageShell>
      <HrHero
        theme="home"
        icon={HeartHandshake}
        kicker="لوحة التحكم"
        title="الموارد البشرية"
        subtitle={s ? dayLabel(s.today) : 'حضور، إجازات، سلف، ورواتب — من مكان واحد.'}
        actions={
          <>
            <Button asChild variant="outline" className="h-11 flex-1 gap-1.5 bg-background/70 sm:flex-none"><Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4" />كشك الحضور</Link></Button>
            <Button asChild className="h-11 flex-1 gap-1.5 sm:flex-none"><Link href="/hr/attendance"><UserCheck className="size-4" />سجّل الحضور</Link></Button>
          </>
        }
        metric={{
          label: 'حاضرين النهارده',
          value: s ? s.present : '—',
          unit: s ? `من ${total} موظف` : undefined,
          loading: loading || !s,
          foot: s
            ? (s.notRecorded > 0 ? `${s.notRecorded} لسه ماتسجّلوش${s.onOff ? ` · ${s.onOff} في إجازتهم الأسبوعية` : ''}` : 'كل الفريق متسجّل ✓')
            : undefined,
        }}
        viz={
          s && total > 0 ? (
            <SegBar
              title="حالة الفريق النهارده"
              segments={[
                { label: 'حاضر', value: s.present, tone: 'emerald' },
                { label: 'متأخر', value: lateN, tone: 'amber' },
                { label: 'غائب', value: absentN, tone: 'rose' },
                { label: 'إجازة', value: leaveN, tone: 'sky' },
                { label: 'إجازة أسبوعية', value: s.onOff, tone: 'violet' },
                { label: 'لسه', value: s.notRecorded, tone: 'slate' },
              ]}
            />
          ) : undefined
        }
        kpis={
          s && total > 0 ? (
            <KpiGrid>
              <HrKpi tone="emerald" icon={Banknote} label={s.payroll.isEstimate ? 'تكلفة العمالة (تقديرية)' : 'تكلفة العمالة'} value={money(s.payroll.laborCost)} sub={monthLabel(s.month)} />
              <HrKpi tone="sky" icon={Percent} label="من كل 100 جنيه بيع" value={s.laborPct === null ? '—' : `${s.laborPct} جنيه`} sub={s.laborPct === null ? 'مفيش مبيعات الشهر ده لسه' : `مبيعات الشهر ${money(s.salesThisMonth)}`} progress={s.laborPct ?? undefined} progressLabel={s.laborPct === null ? undefined : `${s.laborPct}%`} />
              <HrKpi tone="violet" icon={PiggyBank} label="سلف على الموظفين" value={money(s.advances.remaining)} sub={`${s.advances.count} سلفة جارية`} />
              <HrKpi
                tone={s.payroll.status === 'paid' ? 'emerald' : s.payroll.status === 'draft' ? 'amber' : 'slate'}
                icon={s.payroll.status === 'paid' ? BadgeCheck : FileClock}
                label="رواتب الشهر"
                value={s.payroll.status === 'paid' ? 'اتصرفت' : s.payroll.status === 'draft' ? 'مسودة جاهزة' : 'لسه ماتجهزتش'}
                sub={s.payroll.status === 'paid' ? 'تم الصرف' : 'افتح الرواتب للمراجعة'}
              />
            </KpiGrid>
          ) : undefined
        }
      />

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
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ───── وحدات الموارد البشرية ───── */}
          <section className="min-w-0">
            <PanelTitle icon={HeartHandshake} title="وحدات الموارد البشرية" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {MODULES.map((m) => {
                const t = HR_THEMES[m.theme]
                const chip = moduleChip(m.href)
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    className="animate-in-up motion-reduce:animate-none group relative flex min-h-[148px] flex-col overflow-hidden rounded-3xl border bg-card p-4 shadow-sm transition-all duration-base hover:-translate-y-1.5 hover:shadow-xl"
                    style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${t.varName} 11%, var(--card)), var(--card) 65%)` }}
                  >
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(to left, ${t.varName}, transparent)` }} />
                    <m.icon aria-hidden strokeWidth={1.1} className="pointer-events-none absolute -bottom-5 -start-4 size-28 opacity-[0.07] transition-transform duration-slow group-hover:scale-110" style={{ color: t.varName }} />
                    <div className="relative flex items-start justify-between gap-2">
                      <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl shadow-md', t.solid, t.solidFg)}>
                        <m.icon className="size-6" strokeWidth={2.1} />
                      </span>
                      <ArrowUpLeft className="size-5 shrink-0 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:text-foreground" />
                    </div>
                    <h3 className="relative mt-3 text-lg font-extrabold">{m.title}</h3>
                    <p className="relative mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
                    {chip && (
                      <span className="relative mt-auto pt-3">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold', t.subtle)}>{chip}</span>
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>

          {/* ───── اللي محتاج انتباهك ───── */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
            {s.alerts.length > 0 && (
              <section className="overflow-hidden rounded-3xl border border-amber-500/40 bg-warning-subtle shadow-sm">
                <div className="flex items-center gap-2.5 border-b border-amber-500/20 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground">
                    <AlertTriangle className="size-4" strokeWidth={2.4} />
                  </span>
                  <h2 className="text-sm font-bold text-warning-subtle-foreground">يستاهل انتباهك</h2>
                  <span className="ms-auto rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-warning-foreground">{s.alerts.length}</span>
                </div>
                <ul className="divide-y divide-border/60 px-4 py-1 text-sm">
                  {s.alerts.map((a) => (
                    <li key={`${a.kind}${a.id}`} className="py-2.5"><b>{a.name}</b> — {a.text}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <PanelTitle
                icon={Fingerprint}
                title="حضور النهارده"
                action={<StatusChip tone={s.notRecorded > 0 ? 'amber' : 'emerald'}>{s.notRecorded > 0 ? `${s.notRecorded} لسه ماتسجّلوش` : 'كل حاجة مسجّلة'}</StatusChip>}
              />
              <Panel>
                {lateN === 0 && absentN === 0 ? (
                  <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <BadgeCheck className="size-5 text-emerald-600" />مفيش متأخرين ولا غايبين النهارده.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {s.late.map((e) => (
                      <li key={`l${e.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span className="truncate font-bold">{e.name}</span>
                        <Pill tone="amber">متأخر {e.lateMinutes} د</Pill>
                      </li>
                    ))}
                    {s.absent.map((e) => (
                      <li key={`a${e.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span className="truncate font-bold">{e.name}</span>
                        <Pill tone="rose">غائب</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </section>
          </aside>
        </div>
      )}
    </PageShell>
  )
}
