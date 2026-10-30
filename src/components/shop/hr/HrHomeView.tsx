'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, Award, BadgeCheck, CalendarDays, Check, Fingerprint, HandCoins, MonitorSmartphone,
  UserCheck, Users, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmptyState, HR_THEMES, ListSkeleton, PageShell, Ring, dayLabel, hrGet, money, monthLabel } from './hr-ui'

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
interface AttData {
  employees: { id: number; name: string; jobTitle?: string | null; weeklyOffDay: number }[]
  records: { employeeId: number; date: string; status: 'present' | 'late' | 'absent' | 'leave'; lateMinutes: number; checkIn?: string | null }[]
}

type Face = 'absent' | 'late' | 'none' | 'present' | 'leave' | 'off'
const FACE: Record<Face, { label: string; ring: string; dot: string; order: number }> = {
  absent: { label: 'غائب', ring: 'ring-rose-500', dot: 'bg-rose-500', order: 0 },
  late: { label: 'متأخر', ring: 'ring-amber-500', dot: 'bg-amber-500', order: 1 },
  none: { label: 'لسه', ring: 'ring-slate-300 dark:ring-slate-600', dot: 'bg-slate-400', order: 2 },
  present: { label: 'حاضر', ring: 'ring-emerald-500', dot: 'bg-emerald-500', order: 3 },
  leave: { label: 'إجازة', ring: 'ring-sky-500', dot: 'bg-sky-500', order: 4 },
  off: { label: 'راحة', ring: 'ring-violet-400', dot: 'bg-violet-400', order: 5 },
}

const MODULES = [
  { href: '/hr/employees', icon: Users, theme: 'employees' as const, title: 'الموظفين', desc: 'الراتب والوظيفة والـ PIN' },
  { href: '/hr/attendance', icon: Fingerprint, theme: 'attendance' as const, title: 'الحضور والانصراف', desc: 'أساس حساب الرواتب' },
  { href: '/hr/leaves', icon: CalendarDays, theme: 'leaves' as const, title: 'الإجازات والأذونات', desc: 'الأرصدة السنوية' },
  { href: '/hr/evaluations', icon: Award, theme: 'evaluations' as const, title: 'التقييمات', desc: 'حافز عادل' },
  { href: '/hr/advances', icon: HandCoins, theme: 'advances' as const, title: 'السلف', desc: 'بتتخصم بالقسط' },
  { href: '/hr/payroll', icon: Wallet, theme: 'payroll' as const, title: 'الرواتب', desc: 'مسودة ← مراجعة ← صرف' },
]

const timeOf = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }) : ''
const weekdayOfDate = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()

export function HrHomeView() {
  const [s, setS] = React.useState<Summary | null>(null)
  const [att, setAtt] = React.useState<AttData | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    const [sum, a] = await Promise.allSettled([hrGet<Summary>('/api/hr/summary'), hrGet<AttData>('/api/hr/attendance')])
    if (sum.status === 'fulfilled') setS(sum.value)
    else toast.error((sum.reason as any)?.message || 'فشل تحميل الملخص')
    if (a.status === 'fulfilled') setAtt(a.value)
    setLoading(false)
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const faces = React.useMemo(() => {
    if (!s || !att) return []
    const rec = new Map(att.records.filter((r) => r.date === s.today).map((r) => [r.employeeId, r]))
    return att.employees
      .map((e) => {
        const r = rec.get(e.id)
        const kind: Face = r ? r.status : weekdayOfDate(s.today) === e.weeklyOffDay ? 'off' : 'none'
        const caption =
          kind === 'late' ? `متأخر ${r!.lateMinutes} د` : kind === 'present' ? (timeOf(r?.checkIn) || 'حاضر') : FACE[kind].label
        return { id: e.id, name: e.name, kind, caption }
      })
      .sort((x, y) => FACE[x.kind].order - FACE[y.kind].order)
  }, [s, att])

  const total = s?.employeesCount ?? 0
  const lateN = s?.late.length ?? 0
  const absentN = s?.absent.length ?? 0
  const leaveN = s?.leave.length ?? 0
  const here = (s?.present ?? 0) + lateN
  const pct = total ? Math.round((here / total) * 100) : 0
  const step = s?.payroll.status === 'paid' ? 3 : s?.payroll.status === 'draft' ? 1 : 0
  const steps = ['تجهيز المسودة', 'مراجعة واعتماد', 'صرف الرواتب']
  const cta = step === 0 ? 'جهّز مسودة الرواتب' : step === 1 ? 'راجع واعتمد' : 'عرض كشف الشهر'
  const alertHref = (k: 'attendance' | 'advance') => (k === 'advance' ? '/hr/advances' : '/hr/attendance')
  const moduleChip = (href: string): string | null => {
    if (!s) return null
    switch (href) {
      case '/hr/employees': return `${s.employeesCount} موظف`
      case '/hr/attendance': return s.notRecorded > 0 ? `${s.notRecorded} لسه` : 'كله مسجّل'
      case '/hr/leaves': return leaveN > 0 ? `${leaveN} النهارده` : null
      case '/hr/advances': return s.advances.count > 0 ? `${s.advances.count} جارية` : null
      case '/hr/payroll': return step === 3 ? 'اتصرفت' : step === 1 ? 'مسودة' : 'لسه'
      default: return null
    }
  }

  return (
    <PageShell>
      {/* ───── رأس بسيط: بدون هيرو ───── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-muted-foreground">{s ? dayLabel(s.today) : 'الموارد البشرية'}</p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight sm:text-3xl">غرفة عمليات الفريق</h1>
          {s && total > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              <b className="text-foreground">{here}</b> من {total} حاضرين
              {lateN > 0 && <> · <b className="text-amber-600 dark:text-amber-400">{lateN} متأخر</b></>}
              {absentN > 0 && <> · <b className="text-rose-600 dark:text-rose-400">{absentN} غائب</b></>}
            </p>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button asChild variant="outline" className="h-11 flex-1 gap-1.5 sm:flex-none"><Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4" />كشك الحضور</Link></Button>
          <Button asChild className="h-11 flex-1 gap-1.5 sm:flex-none"><Link href="/hr/attendance"><UserCheck className="size-4" />سجّل الحضور</Link></Button>
        </div>
      </header>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : !s ? (
        <EmptyState theme="home" icon={Users} title="تعذّر تحميل الملخص" hint="اتأكد من الاتصال وحدّث الصفحة." />
      ) : s.employeesCount === 0 ? (
        <EmptyState
          theme="home"
          icon={Users}
          title="ابدأ بإضافة موظفيك"
          hint="اسم وراتب لكل موظف — وبعدها الحضور والرواتب بضغطة."
          action={<Button asChild><Link href="/hr/employees">ضيف أول موظف</Link></Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* ───── الفريق النهارده: وشوش ───── */}
            <section className="flex min-w-0 flex-col rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-4">
                <Ring value={pct} tone={pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'} size={92} stroke={10}>
                  <div className="leading-none">
                    <div className="text-2xl font-extrabold tabular-nums">{here}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">من {total}</div>
                  </div>
                </Ring>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-extrabold">الفريق النهارده</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.notRecorded > 0 ? `${s.notRecorded} لسه ماتسجّلوش — اضغط على أي واحد لتسجيله` : 'كل الفريق متسجّل ✓'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold">
                    {(['present', 'late', 'absent', 'leave', 'off'] as Face[]).map((k) => {
                      const n = faces.filter((f) => f.kind === k).length
                      return n > 0 ? (
                        <span key={k} className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className={cn('size-2 rounded-full', FACE[k].dot)} />{FACE[k].label} <b className="tabular-nums text-foreground">{n}</b>
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              </div>

              {faces.length > 0 && (
                <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5 border-t pt-4">
                  {faces.map((f) => (
                    <li key={f.id}>
                      <Link
                        href="/hr/attendance"
                        className={cn(
                          'group flex flex-col items-center gap-1.5 rounded-2xl px-1.5 py-2.5 text-center transition-all hover:-translate-y-0.5 hover:bg-muted/60',
                          (f.kind === 'off' || f.kind === 'leave') && 'opacity-70',
                        )}
                      >
                        <span className={cn('relative grid size-14 place-items-center rounded-full bg-muted text-lg font-extrabold ring-[3px] ring-offset-2 ring-offset-card', FACE[f.kind].ring, f.kind === 'none' && 'ring-dashed')}>
                          {f.name.charAt(0)}
                          <span className={cn('absolute -bottom-0.5 -end-0.5 grid size-5 place-items-center rounded-full border-2 border-card text-white', FACE[f.kind].dot)}>
                            {f.kind === 'present' && <Check className="size-3" strokeWidth={3.5} />}
                            {f.kind === 'late' && <span className="text-[9px] font-black">!</span>}
                            {f.kind === 'absent' && <span className="text-[10px] font-black">×</span>}
                          </span>
                        </span>
                        <span className="w-full truncate text-xs font-bold">{f.name.split(' ')[0]}</span>
                        <span className={cn('w-full truncate text-[10px] tabular-nums', f.kind === 'late' ? 'font-bold text-amber-600 dark:text-amber-400' : f.kind === 'absent' ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>{f.caption}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/hr/attendance" className="mt-auto flex items-center justify-between gap-2 border-t pt-3.5 text-sm font-bold text-primary transition-colors hover:text-primary/80">
                افتح سجل الحضور الكامل وسجّل الباقي<ArrowLeft className="size-4" />
              </Link>
            </section>

            {/* ───── فلوس الشهر ───── */}
            <section className="min-w-0 overflow-hidden rounded-3xl border bg-card shadow-sm">
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold">فلوس {monthLabel(s.month)}</h2>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{s.payroll.isEstimate ? 'تقديري' : 'فعلي'}</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">تكلفة العمالة</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tabular-nums tracking-tight">{money(s.payroll.laborCost).replace(' جنيه', '')}</span>
                  <span className="text-sm font-semibold text-muted-foreground">جنيه</span>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">نسبة العمالة من المبيعات</span>
                    <b className="tabular-nums">{s.laborPct === null ? '—' : `${s.laborPct}%`}</b>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-l from-sky-500 to-emerald-500 transition-[width] duration-slow" style={{ width: `${Math.min(100, s.laborPct ?? 0)}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {s.laborPct === null ? 'مفيش مبيعات الشهر ده لسه' : `من كل 100 جنيه بيع بيروح ${s.laborPct} للعمالة · مبيعات ${money(s.salesThisMonth)}`}
                  </p>
                </div>
              </div>

              {/* مراحل الرواتب */}
              <div className="border-t bg-muted/30 p-4 sm:p-5">
                <p className="mb-3 text-xs font-bold text-muted-foreground">مراحل رواتب الشهر</p>
                <ol className="flex items-start">
                  {steps.map((label, i) => {
                    const done = i < step
                    const current = i === step
                    return (
                      <li key={label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                        <div className="flex w-full items-center">
                          <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done || current ? 'bg-emerald-500' : 'bg-border')} />
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold', done ? 'border-emerald-500 bg-emerald-500 text-white' : current ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground')}>
                            {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                          </span>
                          <span className={cn('h-0.5 flex-1', i === steps.length - 1 ? 'bg-transparent' : done ? 'bg-emerald-500' : 'bg-border')} />
                        </div>
                        <span className={cn('text-[11px] leading-tight', current ? 'font-extrabold text-foreground' : 'text-muted-foreground')}>{label}</span>
                      </li>
                    )
                  })}
                </ol>
                <Button asChild className="mt-4 h-11 w-full gap-1.5"><Link href="/hr/payroll">{cta}<ArrowLeft className="size-4" /></Link></Button>
                <Link href="/hr/advances" className="mt-3 flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/50">
                  <span className="flex items-center gap-2 font-bold"><HandCoins className="size-4 text-violet-600 dark:text-violet-400" />سلف على الموظفين</span>
                  <span className="tabular-nums"><b>{money(s.advances.remaining)}</b> <span className="text-xs text-muted-foreground">· {s.advances.count} سلفة</span></span>
                </Link>
              </div>
            </section>
          </div>

          {/* ───── محتاج قرار ───── */}
          <section>
            <h2 className="mb-2.5 flex items-center gap-2 text-sm font-extrabold">
              <AlertTriangle className="size-4 text-amber-500" />محتاج قرارك
              {s.alerts.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] text-white">{s.alerts.length}</span>}
            </h2>
            {s.alerts.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-4 py-4 text-sm text-muted-foreground">
                <BadgeCheck className="size-5 text-emerald-600" />مفيش حاجة معلّقة — الفريق ماشي تمام.
              </p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {s.alerts.map((a) => (
                  <li key={`${a.kind}${a.id}`}>
                    <Link href={alertHref(a.kind)} className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-card p-3.5 ps-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <span aria-hidden className={cn('absolute inset-y-0 start-0 w-1', a.kind === 'advance' ? 'bg-violet-500' : 'bg-amber-500')} />
                      <span className="min-w-0 flex-1 text-sm"><b>{a.name}</b><span className="text-muted-foreground"> — {a.text}</span></span>
                      <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ───── تنقّل سريع ───── */}
          <section>
            <h2 className="mb-2.5 text-sm font-extrabold">روح لـ</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {MODULES.map((m) => {
                const t = HR_THEMES[m.theme]
                const chip = moduleChip(m.href)
                return (
                  <Link key={m.href} href={m.href} className="group flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', t.solid, t.solidFg)}><m.icon className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{m.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{m.desc}</span>
                    </span>
                    {chip && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${t.varName} 15%, transparent)`, color: `color-mix(in srgb, ${t.varName} 75%, var(--foreground))` }}>{chip}</span>}
                  </Link>
                )
              })}
            </div>
          </section>
        </>
      )}
    </PageShell>
  )
}
