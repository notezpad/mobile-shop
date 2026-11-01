'use client'

import * as React from 'react'
import {
  CircleUserRound, Mail, Building2, CalendarDays, LogIn, Loader2,
  ReceiptText, Undo2, ShieldCheck, DoorOpen, Percent, Eye, EyeOff,
  UserCog, Sparkles, Briefcase, CalendarCheck, CalendarOff, Wallet,
  HandCoins, BadgeDollarSign, Clock, Link2, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmt } from '@/lib/print'

interface MeData {
  name: string
  email: string
  role: string
  active: boolean
  branchName: string | null
  isSeller: boolean
  canViewProfits: boolean
  createdAt: string
  lastLoginAt: string | null
}

interface HrData {
  employeeId: number
  name: string
  jobTitle: string | null
  baseSalary: number
  hireDate: string
  weeklyOffDay: number
  active: boolean
  branchName: string | null
  attendance: { month: string; present: number; late: number; absent: number; leave: number; lateMinutes: number }
  leaves: {
    annualTotal: number
    annualUsed: number
    annualRemaining: number
    recent: { type: string; startDate: string; endDate: string; days: number; hours: number | null }[]
  }
  payslip: {
    month: string
    baseSalary: number
    payableBase: number
    absentDays: number
    absenceDeduction: number
    lateMinutes: number
    lateDeduction: number
    bonus: number
    penalty: number
    advanceDeduction: number
    commission: number
    net: number
    paidAt: string | null
  } | null
}

interface ProfileResponse {
  me: MeData
  permissions: { unrestricted: boolean; list: string[] }
  today: { date: string; invoices: number; grossTotal: number; refunded: number; netTotal: number }
  openShift: { shiftName: string; userName: string | null; createdAt: string; mine: boolean } | null
  hr: HrData | null
}

interface CommissionData {
  month: string
  enabled: boolean
  invoices: number
  salesTotal: number
  returnsTotal: number
  netBase: number
  commission: number
  target: number | null
  targetMet: boolean
  payout: { amount: number; viaPayroll: boolean; method: string | null; paidAt: string } | null
}

const PERM_LABELS: Record<string, string> = {
  dashboard: 'لوحة المعلومات', pos: 'نقطة البيع', products: 'المنتجات',
  sales: 'سجل المبيعات', maintenance: 'الصيانة', customers: 'العملاء',
  suppliers: 'الموردين', purchases: 'المشتريات', inventory: 'المخزون',
  finance: 'المعاملات المالية', expenses: 'المصروفات', cash: 'الخزنة',
  reports: 'التقارير', settings: 'الإعدادات', users: 'المستخدمين',
  branches: 'الفروع', hr: 'الموارد البشرية',
  returns: 'المرتجعات (من نقطة البيع)',
  shift_close: 'إغلاق الوردية (جرد الدرج الأعمى)',
  shift_open: 'فتح الوردية',
  blind_stocktake: 'الجرد الأعمي',
  commissions: 'عمولات البائعين',
  hr_attendance: 'الحضور والإجازات (مشرف)',
  my_profile: 'ملفي',
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدير',
  EMPLOYEE: 'موظف',
  SUPER_ADMIN: 'مدير النظام',
}

const LEAVE_TYPES: Record<string, string> = {
  annual: 'سنوية (بمرتب)',
  sick: 'مرضية (بمرتب)',
  unpaid: 'بدون مرتب',
  permission: 'إذن ساعات',
}

const WEEK_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })

function LedgerRow({ label, value, icon: Icon, tone }: { label: string; value: string; icon?: React.ElementType; tone?: 'emerald' | 'amber' | 'rose' }) {
  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      {Icon ? <Icon className="size-4 shrink-0 text-slate-400" aria-hidden /> : <div className="size-4" />}
      <dt className="shrink-0 font-semibold text-slate-500">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dashed border-slate-200 dark:border-slate-700/80 mx-1" />
      <dd className={cn(
        'max-w-[60%] truncate font-bold text-slate-800 dark:text-slate-200',
        tone === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'amber' && 'text-amber-600 dark:text-amber-400',
        tone === 'rose' && 'text-rose-600 dark:text-rose-400',
      )}>{value}</dd>
    </div>
  )
}

function StatTile({ label, value, icon: Icon, tone = 'default' }: {
  label: string; value: string; icon: React.ElementType; tone?: 'default' | 'amber' | 'emerald' | 'rose'
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm">
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-xl shadow-sm',
          tone === 'emerald' && 'bg-emerald-50 text-emerald-600',
          tone === 'amber' && 'bg-amber-50 text-amber-600',
          tone === 'rose' && 'bg-rose-50 text-rose-600',
          tone === 'default' && 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-slate-500 mb-0.5">{label}</p>
        <p className="truncate text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{value}</p>
      </div>
    </div>
  )
}

export function MyProfileView() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<ProfileResponse | null>(null)
  const [comm, setComm] = React.useState<CommissionData | null>(null)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api<ProfileResponse>('/api/me/profile')
      .then((res) => {
        if (!alive) return
        setData(res)
        if (res?.me?.isSeller) {
          api<CommissionData>('/api/commissions/my')
            .then((c) => { if (alive && c?.enabled) setComm(c) })
            .catch(() => { /* العمولة استكمالية */ })
        }
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'حصل خطأ في تحميل ملفك — جرّب تاني')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" dir="rtl">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl">
        <CircleUserRound className="size-8 text-muted-foreground" />
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
          {error || 'مفيش بيانات'}
        </p>
      </div>
    )
  }

  const { me, permissions, today, openShift, hr } = data
  const initial = (me.name || '؟').trim().charAt(0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-5" dir="rtl">
      {/* ── الهيرو: أنا مين ── */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-500/[0.07] to-transparent" />
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground shadow-sm">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold">{me.name}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Mail className="size-3.5 shrink-0" aria-hidden />
              {me.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-extrabold text-primary">
                <UserCog className="size-3" aria-hidden />
                {ROLE_LABELS[me.role] ?? me.role}
              </span>
              {me.branchName ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground/80">
                  <Building2 className="size-3" aria-hidden />
                  {me.branchName}
                </span>
              ) : null}
              {me.isSeller ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-400">
                  <Percent className="size-3" aria-hidden />
                  بائع
                </span>
              ) : null}
              {hr ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-extrabold text-sky-700 dark:text-sky-300">
                  <Link2 className="size-3" aria-hidden />
                  {hr.jobTitle || 'موظف — الموارد البشرية'}
                </span>
              ) : null}
              {!me.active ? (
                <span className="inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-extrabold text-destructive">
                  الحساب موقوف
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── النهاردة: شغلي أنا بس ── */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 px-1 text-sm font-extrabold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          النهاردة
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <StatTile label="فواتير سجّلتها" value={String(today.invoices)} icon={ReceiptText} tone="emerald" />
          <StatTile label="صافي مبيعاتي (ج.م)" value={fmt(today.netTotal)} icon={CircleUserRound} />
          <StatTile label="مرتجعات (ج.م)" value={fmt(today.refunded)} icon={Undo2} tone={today.refunded > 0 ? 'amber' : 'default'} />
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          الأرقام دي من فواتير سجّلتها أنت بس يوم {today.date} بتوقيت المحل — مبيعات زمايلك عند المدير.
        </p>
      </section>

      {/* ── بياناتي + صلاحياتي ── */}
      <div className="grid gap-2.5 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-extrabold">بياناتي</h2>
          <dl className="space-y-3">
            <LedgerRow label="الاسم" value={me.name} />
            <LedgerRow label="البريد" value={me.email} icon={Mail} />
            <LedgerRow label="الدور" value={ROLE_LABELS[me.role] ?? me.role} icon={UserCog} />
            <LedgerRow label="الفرع" value={me.branchName ?? '— كل الفروع'} icon={Building2} />
            <LedgerRow label="عرض الأرباح" value={me.canViewProfits ? 'مسموح' : 'مخفي'} icon={me.canViewProfits ? Eye : EyeOff} tone={me.canViewProfits ? 'emerald' : 'rose'} />
            <LedgerRow label="عضو منذ" value={fmtDay(me.createdAt)} icon={CalendarDays} />
            <LedgerRow label="آخر دخول" value={me.lastLoginAt ? fmtWhen(me.lastLoginAt) : '—'} icon={LogIn} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-extrabold">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            صلاحياتي
          </h2>
          {permissions.unrestricted ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-[13px] font-bold leading-relaxed text-emerald-700 dark:text-emerald-300">
              عندك كل الصلاحيات — كل شاشات النظام المفتوحة لباقتك متاحة لك.
            </div>
          ) : permissions.list.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">مفيش صلاحيات محددة — كلم المدير.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {permissions.list.map((p) => (
                <li key={p} className="rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-foreground/80">
                  {PERM_LABELS[p] ?? p}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── الوردية المفتوحة على فرعي ── */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-extrabold">
          <DoorOpen className="size-4 text-primary" aria-hidden />
          وردية فرعي
        </h2>
        {openShift ? (
          <div className={cn(
            'rounded-xl border px-3 py-3 text-[13px] leading-relaxed',
            openShift.mine
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-amber-500/40 bg-amber-500/10',
          )}>
            <p className="font-extrabold">
              {openShift.shiftName}
              {openShift.mine ? ' — الوردية دي باسمك ✅' : openShift.userName ? ` — فتحها ${openShift.userName}` : ''}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              مفتوحة من {fmtWhen(openShift.createdAt)} · الإغلاق بيحسب على الوردية نفسها وعلى اللي فتحها
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            مفيش وردية مفتوحة على فرعك دلوقتي — افتح وردية باسمك من أدوات نقطة البيع (
            <Link href="/pos" className="font-bold text-primary underline underline-offset-4">نقطة البيع</Link>
            ) عشان شغلك على الدرج يتسجل باسمك.
          </p>
        )}
      </section>

      {/* ── عمولتي (البائع بس) ── */}
      {me.isSeller && comm ? (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-extrabold">
            <Percent className="size-4 text-amber-500" aria-hidden />
            عمولتي — {comm.month}
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <StatTile label="مبيعات الشهر (ج.م)" value={fmt(comm.netBase)} icon={ReceiptText} tone="emerald" />
            <StatTile
              label="العمولة التقديرية (ج.م)"
              value={fmt(comm.commission)}
              icon={Percent}
              tone={comm.targetMet ? 'emerald' : 'default'}
            />
          </div>
          {comm.target != null ? (
            <p className={cn('mt-3 px-1 text-[11px] font-bold', comm.targetMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
              التارجت: {fmt(comm.target)} ج.م — {comm.targetMet ? 'حققته 🎉' : 'لسه ماوصلتش'}
            </p>
          ) : null}
          {comm.payout ? (
            <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
              اتصرفت لك عمولة {fmt(comm.payout.amount)} ج.م عن الشهر ده (
              {comm.payout.viaPayroll ? 'مع الراتب' : comm.payout.method ?? 'صرف مباشر'})
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── 🏢 ملفي في الموارد البشرية (لو حسابي مربوط بموظف) ── */}
      {hr ? (
        <>
          <section className="space-y-2">
            <h2 className="flex items-center gap-1.5 px-1 text-sm font-extrabold pt-2">
              <Briefcase className="size-4 text-sky-500" aria-hidden />
              ملفي في الموارد البشرية
            </h2>
            <div className="grid gap-2.5 md:grid-cols-2">
              {/* بياناتي الوظيفية */}
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-extrabold">بياناتي الوظيفية</h3>
                <dl className="space-y-3">
                  <LedgerRow label="الاسم في الملف" value={hr.name} />
                  <LedgerRow label="الوظيفة" value={hr.jobTitle ?? '—'} icon={Briefcase} />
                  <LedgerRow label="الراتب الأساسي" value={`${fmt(hr.baseSalary)} ج.م`} icon={Wallet} />
                  <LedgerRow label="الفرع" value={hr.branchName ?? '—'} icon={Building2} />
                  <LedgerRow label="الراحة الأسبوعية" value={WEEK_DAYS[hr.weeklyOffDay] ?? '—'} icon={CalendarOff} />
                  <LedgerRow label="تاريخ التعيين" value={fmtDay(hr.hireDate)} icon={CalendarDays} />
                </dl>
              </section>

              {/* حضوري الشهر */}
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-1.5 text-sm font-extrabold">
                  <CalendarCheck className="size-4 text-sky-500" aria-hidden />
                  حضوري — {hr.attendance.month}
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[11px] font-bold text-emerald-700">أيام حضور</span>
                    <span className="text-2xl font-black text-emerald-600">{hr.attendance.present}</span>
                  </div>
                  <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[11px] font-bold text-amber-700">تأخير (دقيقة)</span>
                    <span className="text-2xl font-black text-amber-600">{hr.attendance.lateMinutes}</span>
                  </div>
                  <div className="bg-rose-50/50 rounded-xl p-3 border border-rose-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[11px] font-bold text-rose-700">أيام غياب</span>
                    <span className="text-2xl font-black text-rose-600">{hr.attendance.absent}</span>
                  </div>
                  <div className="bg-sky-50/50 rounded-xl p-3 border border-sky-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[11px] font-bold text-sky-700">أيام إجازة</span>
                    <span className="text-2xl font-black text-sky-600">{hr.attendance.leave}</span>
                  </div>
                </div>
              </section>
            </div>
          </section>

          <div className="grid gap-2.5 md:grid-cols-2">
            {/* إجازاتي */}
            <section className="rounded-2xl border bg-card p-5 shadow-sm flex flex-col">
              <h3 className="mb-4 flex items-center gap-1.5 text-sm font-extrabold">
                <CalendarOff className="size-4 text-sky-500" aria-hidden />
                إجازاتي
              </h3>
              <p className="mb-4 text-[13px] font-bold">
                رصيد السنة: <span className="text-sky-600 dark:text-sky-400">{hr.leaves.annualRemaining} يوم</span>
                {' '}متبقي من {hr.leaves.annualTotal} (استخدمت {hr.leaves.annualUsed})
              </p>
              {hr.leaves.recent.length === 0 ? (
                <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 py-6">
                  <p className="text-[13px] text-muted-foreground">مفيش إجازات مسجّلة لسه.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {hr.leaves.recent.map((l, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[12px]">
                      <span className="font-bold">{LEAVE_TYPES[l.type] ?? l.type}</span>
                      <span className="text-muted-foreground font-semibold">
                        {l.startDate}{l.endDate !== l.startDate ? ` ← ${l.endDate}` : ''}
                        {' · '}{l.hours != null ? `${l.hours} ساعة` : `${l.days} يوم`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* قسيمة راتبي */}
            <section className="rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center gap-1.5">
                <BadgeDollarSign className="size-4 text-sky-500" aria-hidden />
                <h3 className="text-sm font-extrabold">قسيمة راتبي</h3>
              </div>
              {hr.payslip ? (
                <div className="p-5 flex flex-col flex-1">
                  <p className="mb-4 text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-lg w-fit">
                    شهر {hr.payslip.month} — معتمدة ومدفوعة
                    {hr.payslip.paidAt ? ` · ${fmtWhen(hr.payslip.paidAt)}` : ''}
                  </p>
                  <dl className="space-y-3 flex-1">
                    <LedgerRow label="الأساسي المستحق" value={`${fmt(hr.payslip.payableBase)} ج.م`} icon={Wallet} />
                    {hr.payslip.absenceDeduction > 0 ? (
                      <LedgerRow label="خصم الغياب" value={`− ${fmt(hr.payslip.absenceDeduction)}`} tone="rose" />
                    ) : null}
                    {hr.payslip.lateDeduction > 0 ? (
                      <LedgerRow label={`خصم التأخير (${hr.payslip.lateMinutes} دقيقة)`} value={`− ${fmt(hr.payslip.lateDeduction)}`} tone="rose" />
                    ) : null}
                    {hr.payslip.bonus > 0 ? (
                      <LedgerRow label="حوافز" value={`+ ${fmt(hr.payslip.bonus)}`} icon={HandCoins} tone="emerald" />
                    ) : null}
                    {hr.payslip.penalty > 0 ? (
                      <LedgerRow label="جزاءات" value={`− ${fmt(hr.payslip.penalty)}`} tone="rose" />
                    ) : null}
                    {hr.payslip.commission !== 0 ? (
                      <LedgerRow
                        label="عمولة المبيعات 💰"
                        value={hr.payslip.commission > 0 ? `+ ${fmt(hr.payslip.commission)}` : `− ${fmt(Math.abs(hr.payslip.commission))}`}
                        icon={Percent}
                        tone={hr.payslip.commission > 0 ? 'emerald' : 'rose'}
                      />
                    ) : null}
                    {hr.payslip.advanceDeduction > 0 ? (
                      <LedgerRow label="قسط السلف" value={`− ${fmt(hr.payslip.advanceDeduction)}`} icon={HandCoins} tone="amber" />
                    ) : null}
                  </dl>
                  
                  <div className="mt-5 pt-4 border-t border-dashed border-border/80 flex items-center justify-between">
                    <span className="text-sm font-extrabold text-foreground/80">الصافي</span>
                    <span className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-lg font-black tabular-nums text-emerald-400 shadow-sm">
                      {fmt(hr.payslip.net)} <span className="text-[10px] text-slate-400 ms-1">ج.م</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex-1 flex flex-col items-center justify-center text-center">
                  <div className="size-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                    <ReceiptText className="size-6 text-slate-400" />
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    مفيش قسيمة راتب معتمدة لسه — أول ما المدير يعتمد الرواتب، قسيمتك هتظهر هنا بالتفصيل.
                  </p>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}