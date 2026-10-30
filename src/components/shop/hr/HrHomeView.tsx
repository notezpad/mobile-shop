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
  EmptyState, HR_THEMES, HrHero, ListSkeleton, PageShell, PanelTitle, Pill, StatCell, StatStrip, StatusChip,
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

  return (
    <PageShell>
      <HrHero
        theme="home"
        icon={HeartHandshake}
        kicker="لوحة التحكم"
        title="الموارد البشرية"
        subtitle={s ? dayLabel(s.today) : 'حضور، إجازات، سلف، ورواتب — من مكان واحد.'}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4" />كشك الحضور</Link></Button>
            <Button asChild size="sm" className="gap-1.5"><Link href="/hr/attendance"><UserCheck className="size-4" />سجّل الحضور</Link></Button>
          </div>
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
        <div className="space-y-4 sm:space-y-5">
          {/* النهارده */}
          <section>
            <PanelTitle icon={Fingerprint} title="حضور النهارده" action={<StatusChip tone={s.notRecorded > 0 ? 'amber' : 'emerald'}>{s.notRecorded > 0 ? `${s.notRecorded} لسه ماتسجّلوش` : 'كل حاجة مسجّلة'}</StatusChip>} />
            <StatStrip>
              <StatCell label="حاضر" dot="bg-emerald-500" value={s.present} foot={s.onOff > 0 ? `${s.onOff} في إجازتهم الأسبوعية` : undefined} />
              <StatCell label="متأخر" dot="bg-amber-500" value={s.late.length} />
              <StatCell label="غائب" dot="bg-rose-500" value={s.absent.length} />
              <StatCell label="لسه ماتسجّلش" dot="bg-muted-foreground/60" value={s.notRecorded} foot={`إجمالي الفريق: ${s.employeesCount}`} />
            </StatStrip>
            {(s.late.length > 0 || s.absent.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {s.late.map((e) => <Pill key={`l${e.id}`} tone="amber">{e.name} — متأخر {e.lateMinutes} د</Pill>)}
                {s.absent.map((e) => <Pill key={`a${e.id}`} tone="rose">{e.name} — غائب</Pill>)}
              </div>
            )}
          </section>

          {/* تنبيهات */}
          {s.alerts.length > 0 && (
            <section className="overflow-hidden rounded-3xl border border-amber-500/40 bg-warning-subtle shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-amber-500/20 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground">
                  <AlertTriangle className="size-4" strokeWidth={2.4} />
                </span>
                <h2 className="text-sm font-bold text-warning-subtle-foreground">يستاهل انتباهك</h2>
              </div>
              <ul className="divide-y divide-border/60 px-4 py-1 text-sm">
                {s.alerts.map((a) => (
                  <li key={`${a.kind}${a.id}`} className="py-2"><b>{a.name}</b> — {a.text}</li>
                ))}
              </ul>
            </section>
          )}

          {/* وحدات الموارد البشرية */}
          <section>
            <PanelTitle icon={HeartHandshake} title="وحدات الموارد البشرية" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => {
                const t = HR_THEMES[m.theme]
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    className="group relative overflow-hidden rounded-3xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
                    style={{ background: `radial-gradient(340px 130px at 100% 0%, color-mix(in srgb, ${t.varName} 9%, transparent), transparent)` }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-[3px]"
                      style={{ background: `linear-gradient(to left, color-mix(in srgb, ${t.varName} 70%, transparent), transparent)` }}
                    />
                    <div className="flex items-start gap-3">
                      <span className={cn('grid size-10 shrink-0 place-items-center rounded-2xl shadow-sm', t.solid, t.solidFg)}>
                        <m.icon className="size-5" strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center justify-between gap-2 font-extrabold">
                          {m.title}
                          <ArrowUpLeft className="size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:text-primary" />
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* الفلوس */}
          <section>
            <PanelTitle icon={TrendingUp} title={`فلوس الشهر — ${monthLabel(s.month)}`} />
            <StatStrip>
              <StatCell
                label={s.payroll.isEstimate ? 'تكلفة العمالة (تقديرية)' : 'تكلفة العمالة'} dot="bg-primary"
                value={money(s.payroll.laborCost)}
              />
              <StatCell
                label="من كل 100 جنيه بيع" dot="bg-info"
                value={s.laborPct === null ? '—' : `${s.laborPct} جنيه`}
                foot={s.laborPct === null ? 'مفيش مبيعات الشهر ده لسه' : `مبيعات الشهر ${money(s.salesThisMonth)}`}
              />
              <StatCell label="سلف على الموظفين" dot="bg-violet-500" value={money(s.advances.remaining)} foot={`${s.advances.count} سلفة جارية`} />
              <div className="flex flex-col justify-between p-3.5 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                  <span className="size-2 rounded-full bg-amber-500" />رواتب الشهر
                </div>
                <div className="my-1.5">
                  {s.payroll.status === 'paid' ? (
                    <StatusChip tone="emerald">اتصرفت</StatusChip>
                  ) : s.payroll.status === 'draft' ? (
                    <StatusChip tone="amber">مسودة جاهزة</StatusChip>
                  ) : (
                    <StatusChip tone="slate">لسه ماتجهزتش</StatusChip>
                  )}
                </div>
                <Button asChild size="sm" variant={s.payroll.status === 'paid' ? 'outline' : 'default'} className="gap-1.5">
                  <Link href="/hr/payroll"><Wallet className="size-4" />{s.payroll.status === 'paid' ? 'عرض' : 'جهّز / اعتمد'}</Link>
                </Button>
              </div>
            </StatStrip>
          </section>
        </div>
      )}
    </PageShell>
  )
}
