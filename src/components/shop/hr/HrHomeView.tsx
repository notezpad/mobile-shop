'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle, MonitorSmartphone, Sparkles, Coins, Percent,
  HandCoins, UserPlus, UsersRound, Clock3, ClipboardCheck,
  CalendarDays, Award, ArrowUpRight, Banknote, ShieldCheck, CheckCircle2
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

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
const initial = (name: string) => name.trim().charAt(0) || '؟'

/* ============================================================
   الحلقة الدائرية (Progress Ring) - 3D
   ============================================================ */
function ProgressRing({ value, size = 110, stroke = 10 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, value))
  const offset = c - (clamped / 100) * c
  return (
    <div className="relative drop-shadow-[0_10px_15px_rgba(0,0,0,0.2)]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          className="stroke-white transition-[stroke-dashoffset] duration-1000 ease-out"
          style={{ filter: 'drop-shadow(0px 0px 8px rgba(255,255,255,0.5))' }}
        />
      </svg>
    </div>
  )
}

/* ============================================================
   الهيرو (Hero) - Premium 3D Glass
   ============================================================ */
function Hero({ s }: { s: Summary }) {
  const presentPct = pct(s.present, s.employeesCount)
  const needsAttention = s.late.length + s.absent.length

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
      <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
      <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-cyan-300/30 blur-[80px]" />
      
      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-10">
        <div className="z-10 max-w-lg animate-in-up">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-md shadow-inner">
            <Sparkles className="size-3 text-white" />
            <span className="text-xs font-bold text-white">{dayLabel(s.today)}</span>
          </div>
          
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">
            نظرة عامة على <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">الموارد البشرية</span>
          </h1>
          
          <p className="mt-3 text-sm leading-relaxed text-blue-50/90 sm:text-base">
            يوجد لديك <strong className="text-white">{s.employeesCount} موظف</strong>. اليوم <strong className="text-white">{s.present} حاضر</strong>.
            {needsAttention > 0 ? ` ويوجد ${needsAttention} بحاجة إلى متابعة.` : ' الفريق منتظم بالكامل.'}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="bg-white text-indigo-700 font-bold shadow-[0_6px_0_rgb(226,232,240)] hover:bg-white hover:text-indigo-700 hover:shadow-[0_2px_0_rgb(226,232,240)] hover:translate-y-[4px] transition-all">
              <Link href="/hr/attendance">تسجيل الحضور</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white hover:border-white/40 shadow-[0_6px_0_rgba(255,255,255,0.1)] hover:shadow-[0_2px_0_rgba(255,255,255,0.1)] hover:translate-y-[4px] transition-all">
              <Link href="/hr/attendance?kiosk=1"><MonitorSmartphone className="size-4 me-2" />كشك الحضور</Link>
            </Button>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-[380px] overflow-hidden rounded-3xl border border-t-white/40 border-l-white/20 border-b-black/20 border-r-black/10 bg-white/10 p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4),inset_0_2px_5px_rgba(255,255,255,0.3)] backdrop-blur-2xl sm:p-6">
          <div className="relative flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white drop-shadow-md">ملخص الحضور اليومي</span>
              <span className="flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> مباشر
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative grid shrink-0 place-items-center">
                <ProgressRing value={presentPct} />
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-black tabular-nums text-white drop-shadow-lg">{presentPct}%</span>
                  <span className="text-[9px] font-bold text-white/80">حضور</span>
                </div>
              </div>
              
              <div className="grid flex-1 grid-cols-2 gap-2">
                {[
                  { label: 'حاضر', val: s.present, color: 'text-emerald-300' },
                  { label: 'متأخر', val: s.late.length, color: 'text-amber-300' },
                  { label: 'غائب', val: s.absent.length, color: 'text-rose-300' },
                  { label: 'لم يسجل', val: s.notRecorded, color: 'text-white/80' },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl border border-t-white/20 border-l-white/10 border-b-black/20 bg-white/5 p-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
                    <div className="mb-0.5 text-[10px] font-bold text-white/70">{item.label}</div>
                    <div className={cn("text-lg font-black drop-shadow-sm", item.color)}>{item.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================
   لوحة الإجراءات السريعة (Action Center) - 3D Buttons
   ============================================================ */
const QUICK_LINKS = [
  { href: '/hr/attendance', icon: ClipboardCheck, title: 'الحضور والانصراف', desc: 'تسجيل ومتابعة', cls: 'from-amber-400 to-amber-600 shadow-amber-500/40' },
  { href: '/hr/employees', icon: UsersRound, title: 'الموظفين', desc: 'بيانات الفريق', cls: 'from-sky-400 to-sky-600 shadow-sky-500/40' },
  { href: '/hr/payroll', icon: Banknote, title: 'الرواتب', desc: 'مسير الرواتب', cls: 'from-emerald-400 to-emerald-600 shadow-emerald-500/40' },
  { href: '/hr/advances', icon: HandCoins, title: 'السلف', desc: 'العهد والخصومات', cls: 'from-rose-400 to-rose-600 shadow-rose-500/40' },
  { href: '/hr/leaves', icon: CalendarDays, title: 'الإجازات', desc: 'الأرصدة والأذونات', cls: 'from-teal-400 to-teal-600 shadow-teal-500/40' },
  { href: '/hr/evaluations', icon: Award, title: 'التقييمات', desc: 'الأداء والمكافآت', cls: 'from-violet-400 to-violet-600 shadow-violet-500/40' },
] as const

function QuickActions() {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-lg font-black">إجراءات سريعة</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-5 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] dark:border-white/10 dark:bg-slate-900/80 backdrop-blur-xl"
          >
            <div className={cn('grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110', link.cls)}>
              <link.icon className="size-6 drop-shadow-md" strokeWidth={2} />
            </div>
            <div>
              <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{link.title}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">{link.desc}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

/* ============================================================
   كروت المال (Bento Finance Tiles) - Soft 3D Shadows
   ============================================================ */
const TILE_TONE = {
  violet: { border: 'border-s-violet-500', iconBg: 'bg-gradient-to-br from-violet-400 to-violet-600', bar: 'bg-violet-500', shadow: 'shadow-violet-500/30' },
  sky: { border: 'border-s-sky-500', iconBg: 'bg-gradient-to-br from-sky-400 to-sky-600', bar: 'bg-sky-500', shadow: 'shadow-sky-500/30' },
  amber: { border: 'border-s-amber-500', iconBg: 'bg-gradient-to-br from-amber-400 to-amber-600', bar: 'bg-amber-500', shadow: 'shadow-amber-500/30' },
  emerald: { border: 'border-s-emerald-500', iconBg: 'bg-gradient-to-br from-emerald-400 to-emerald-600', bar: 'bg-emerald-500', shadow: 'shadow-emerald-500/30' },
  slate: { border: 'border-s-slate-300', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-600', bar: 'bg-slate-400', shadow: 'shadow-slate-500/30' },
} as const

function Tile({ icon: Icon, tone, label, value, hint, footer, progress }: any) {
  const t = TILE_TONE[tone as keyof typeof TILE_TONE]
  return (
    <div className={cn(
      'relative flex flex-col justify-between overflow-hidden rounded-2xl border border-s-4 bg-white dark:bg-slate-900 p-5 transition-all duration-300 hover:-translate-y-1',
      'shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,1)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]',
      t.border
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold text-muted-foreground">{label}</p>
          <div className="text-2xl font-black tabular-nums text-foreground sm:text-3xl drop-shadow-sm">{value}</div>
        </div>
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-lg', t.iconBg, t.shadow)}>
          <Icon className="size-5 drop-shadow-md" />
        </span>
      </div>
      
      {progress !== null && progress !== undefined && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 shadow-inner relative">
          {/* تم إزالة minWidth العشوائي اللي كان بيعمل نقطة غريبة */}
          <div 
            className={cn('h-full rounded-full transition-all duration-1000 shadow-sm', t.bar)} 
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} 
          />
        </div>
      )}
      
      <div className="mt-4">
        {hint && <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">{hint}</p>}
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ============================================================
   شريط الحضور المجزأ - Engraved Effect
   ============================================================ */
const SEG_TONE = {
  present: { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  late: { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  absent: { bar: 'bg-rose-500', dot: 'bg-rose-500' },
  leave: { bar: 'bg-sky-500', dot: 'bg-sky-500' },
  off: { bar: 'bg-slate-300 dark:bg-slate-700', dot: 'bg-slate-300 dark:bg-slate-700' },
  pending: { bar: 'bg-muted-foreground/20', dot: 'bg-muted-foreground/40' },
} as const

function AttendanceBar({ segments }: { segments: any[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
        {segments.filter((s) => s.value > 0).map((s) => (
          <div
            key={s.key}
            className={cn('h-full transition-all duration-700 hover:opacity-80 shadow-sm', SEG_TONE[s.key as keyof typeof SEG_TONE].bar)}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {/* تعديل الفلتر عشان يبان كبيانات مش كخانات إدخال */}
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2 border border-slate-100 dark:border-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className={cn('size-2 rounded-full shadow-sm', SEG_TONE[s.key as keyof typeof SEG_TONE].dot)} />
              {s.label}
            </span>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100 tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function NameChip({ name, tone, note }: { name: string; tone: 'amber' | 'rose'; note: string }) {
  const bg = tone === 'amber' ? 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/30' : 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/30'
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200/60 bg-white py-1.5 ps-1.5 pe-3 shadow-sm">
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white shadow-md', bg)}>
        {initial(name)}
      </span>
      <div className="leading-tight">
        <div className="whitespace-nowrap text-xs font-bold text-slate-800">{name}</div>
        <div className="whitespace-nowrap text-[10px] font-medium text-slate-500">{note}</div>
      </div>
    </div>
  )
}

/* ============================================================
   Skeleton & Empty States
   ============================================================ */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="h-[280px] w-full animate-pulse bg-slate-200 dark:bg-slate-900" />
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-8">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted shadow-sm" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted shadow-sm" />)}
        </div>
      </div>
    </div>
  )
}

function EmptyHero({ today }: { today: string }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white min-h-[70vh] flex items-center justify-center">
      <div className="relative flex flex-col items-center gap-6 text-center px-4">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-white/20 shadow-[0_20px_40px_rgba(0,0,0,0.2),inset_0_2px_10px_rgba(255,255,255,0.4)] backdrop-blur-md ring-1 ring-white/30">
          <UserPlus className="size-10 text-white drop-shadow-lg" />
        </span>
        <h1 className="text-3xl font-black sm:text-4xl drop-shadow-md">مرحباً بك في نظام الموارد البشرية</h1>
        <p className="max-w-md text-blue-100">ابدأ بإضافة موظفيك لتتمكن من تسجيل الحضور، إدارة الإجازات، وإصدار مسير الرواتب.</p>
        <Button asChild size="lg" className="mt-4 bg-white text-indigo-700 shadow-[0_6px_0_rgb(224,231,255)] hover:bg-white hover:shadow-[0_2px_0_rgb(224,231,255)] hover:translate-y-[4px] transition-all">
          <Link href="/hr/employees">إضافة أول موظف</Link>
        </Button>
      </div>
    </section>
  )
}

/* ============================================================
   الصفحة الرئيسية
   ============================================================ */
export function HrHomeView() {
  const [s, setS] = React.useState<Summary | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try { setS(await hrGet<Summary>('/api/hr/summary')) }
    catch (e: any) { toast.error(e?.message || 'فشل تحميل البيانات') }
    finally { setLoading(false) }
  }, [])
  
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const payrollTone = s?.payroll.status === 'paid' ? 'emerald' : s?.payroll.status === 'draft' ? 'sky' : 'slate'
  const payrollLabel = s?.payroll.status === 'paid' ? 'تم الصرف' : s?.payroll.status === 'draft' ? 'مسودة جاهزة' : 'غير مجهزة'
  const payrollHint = s?.payroll.status === 'draft' ? `المتوقع ${money(s.payroll.estimated)}` : s?.payroll.status === 'paid' ? 'تم الاعتماد والصرف' : 'قم بتجهيز مسير الرواتب'

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <KioskAutoFlush />

      {loading || !s ? (
        <LoadingSkeleton />
      ) : s.employeesCount === 0 ? (
        <EmptyHero today={s.today} />
      ) : (
        <>
          <Hero s={s} />

          <div className="mx-auto max-w-[1600px] space-y-10 px-4 py-8 sm:px-8">
            
            <QuickActions />

            <section>
              <div className="mb-4 flex items-center gap-2">
                <Coins className="size-5 text-primary" />
                <h2 className="text-lg font-black">المؤشرات المالية — {monthLabel(s.month)}</h2>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Tile
                  icon={Coins} tone="violet"
                  label="تكلفة العمالة" value={money(s.payroll.laborCost)}
                  hint={s.payroll.isEstimate ? 'تقديرية بناءً على الحضور' : 'شاملة الأساسي والبدلات'}
                />
                <Tile
                  icon={Percent} tone="sky"
                  label="نسبة العمالة للمبيعات" value={s.laborPct === null ? '—' : `${s.laborPct}%`}
                  hint={`إجمالي المبيعات: ${money(s.salesThisMonth)}`}
                  progress={s.laborPct}
                />
                <Tile
                  icon={HandCoins} tone="amber"
                  label="السلف المتبقية" value={money(s.advances.remaining)}
                  hint={`${s.advances.count} سلفة جارية`}
                />
                <Tile
                  icon={Banknote} tone={payrollTone as any}
                  label="رواتب الشهر" value={payrollLabel} hint={payrollHint}
                  footer={
                    <Button asChild size="sm" variant={s.payroll.status === 'paid' ? 'outline' : 'default'} className="w-fit px-4 text-xs font-bold mt-1 shadow-[0_4px_0_rgba(0,0,0,0.1)] hover:shadow-[0_2px_0_rgba(0,0,0,0.1)] hover:translate-y-[2px] transition-all">
                      <Link href="/hr/payroll">{s.payroll.status === 'paid' ? 'عرض التفاصيل' : 'تجهيز الآن'}</Link>
                    </Button>
                  }
                />
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-white/60 bg-white/80 dark:border-white/10 dark:bg-slate-900/80 p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] backdrop-blur-xl lg:col-span-2">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black flex items-center gap-2">
                      <Clock3 className="size-5 text-indigo-500" />
                      سجل الحضور اليومي
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">{dayLabel(s.today)}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="gap-1.5 bg-white shadow-sm hover:bg-slate-50 border-slate-200">
                    <Link href="/hr/attendance">عرض السجلات <ArrowUpRight className="size-4" /></Link>
                  </Button>
                </div>
                
                <AttendanceBar
                  segments={[
                    { key: 'present', label: 'حاضر', value: s.present },
                    { key: 'late', label: 'متأخر', value: s.late.length },
                    { key: 'absent', label: 'غائب', value: s.absent.length },
                    { key: 'leave', label: 'إجازة', value: s.leave.length },
                    { key: 'off', label: 'إجازة أسبوعية', value: s.onOff },
                    { key: 'pending', label: 'لم يسجل بعد', value: s.notRecorded },
                  ]}
                />

                {(s.late.length > 0 || s.absent.length > 0) && (
                  <div className="mt-6 border-t pt-5 border-dashed border-slate-200 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">بحاجة إلى متابعة</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {s.late.map((e) => <NameChip key={`l${e.id}`} name={e.name} tone="amber" note={`تأخير ${e.lateMinutes} دقيقة`} />)}
                      {s.absent.map((e) => <NameChip key={`a${e.id}`} name={e.name} tone="rose" note="غياب" />)}
                    </div>
                  </div>
                )}
              </div>

              {/* كارت التنبيهات - بيتحول لأخضر لما يكون فاضي ولأصفر لما يكون فيه تنبيه */}
              <div className={cn(
                'rounded-3xl border p-6 backdrop-blur-xl transition-all duration-300',
                s.alerts.length > 0 
                  ? 'border-amber-500/30 bg-gradient-to-b from-amber-50/80 to-white/80 dark:from-amber-950/20 dark:to-slate-900/80 shadow-[0_20px_40px_-15px_rgba(245,158,11,0.1)]' 
                  : 'border-emerald-500/30 bg-gradient-to-b from-emerald-50/80 to-white/80 dark:from-emerald-950/20 dark:to-slate-900/80 shadow-[0_20px_40px_-15px_rgba(16,185,129,0.1)]'
              )}>
                <div className="mb-5 flex items-center gap-3">
                  <span className={cn('grid size-11 place-items-center rounded-xl shadow-lg', s.alerts.length > 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-500/30' : 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/30')}>
                    {s.alerts.length > 0 ? <AlertTriangle className="size-5 drop-shadow-md" /> : <ShieldCheck className="size-5 drop-shadow-md" />}
                  </span>
                  <div>
                    <h3 className="font-black">{s.alerts.length > 0 ? 'يتطلب انتباهك' : 'لا توجد تنبيهات'}</h3>
                    <p className="text-xs text-muted-foreground">{s.alerts.length > 0 ? `${s.alerts.length} تنبيهات هامة` : 'جميع الإجراءات منتظمة'}</p>
                  </div>
                </div>
                
                {s.alerts.length > 0 ? (
                  <ul className="space-y-3">
                    {s.alerts.map((a) => (
                      <li key={`${a.kind}${a.id}`} className="flex items-start gap-2 rounded-xl bg-white/60 dark:bg-slate-900/50 p-3 text-sm border border-amber-500/10 shadow-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span className="leading-snug"><b>{a.name}</b> — {a.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="relative mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                      <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400 drop-shadow-sm" />
                      <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping opacity-20" />
                    </div>
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">كل شيء يسير بشكل ممتاز</p>
                    <p className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/70">لا توجد إجراءات معلقة</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}