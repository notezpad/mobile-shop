'use client'

/**
 * 👤 2026-11-01 (التحديث السابع عشر + الثامن عشر) — «ملفي»: الصفحة الشخصية للموظف.
 *
 * الفجوة: بيانات الموظف وصلاحياته كانت عند المدير بس — والموظف نفسه
 * ماعندوش مكان يشمّ فيه نفسه: أنا مين في النظام؟ عندي إيه صلاحيات؟
 * اشتغلت النهاردة كام فاتورة بكام؟ ووردية فرعي مفتوحة ولا لأ؟ ولو
 * مربوط بملف موظف في الموارد البشرية: حضورك وإجازاتك وقسيمة راتبك
 * (بالعمولة) بتظهر هنا كمان.
 *
 * المبدأ: السيشن هو مصدر الهوية — كل رقم هنا من شغلي أنا بس (زي
 * عمولتي بالظبط)، ومفيش أي أرباح أو تكاليف أو بيانات زميل تاني.
 * كروت الصفحة:
 *   1) بياناتي    — الاسم/الدور/الفرع/البريد/تاريخ العضوية/آخر دخول
 *   2) النهاردة   — فواتير اليوم باسمي + الصافي + المرتجع
 *   3) صلاحياتي   — قائمة الصلاحيات (أو «كل الصلاحيات» لو من غير قائمة)
 *   4) الوردية    — الوردية المفتوحة على فرعي دلوقتي (ومين فتحها) —
 *      ومفيش وردية؟ اللي عنده صلاحية الفتح يفتحها من هنا على طول
 *      (نفس دايلوج نقطة البيع) — وورديته المحددة في HR بتتختار له تلقائياً
 *   5) عمولتي     — لو بائع: أرقام الشهر من نفس API «عمولتي» الحالي
 *   6) ملفي في HR — لو حسابي مربوط بموظف: بياناتي الوظيفية (بورديتي 🕐)
 *      + حضوري الشهر + إجازاتي ورصيدي + آخر قسيمة راتب معتمدة (بالعمولة)
 */

import * as React from 'react'
import {
  CircleUserRound, Mail, Building2, CalendarDays, LogIn, Loader2,
  ReceiptText, Undo2, ShieldCheck, DoorOpen, Percent, Eye, EyeOff,
  UserCog, Sparkles, Briefcase, CalendarCheck, CalendarOff, Wallet,
  HandCoins, BadgeDollarSign, Clock, Link2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmt } from '@/lib/print'
import { shiftLabel } from '@/lib/branch-shifts'
import { ShiftOpenDialog } from './ShiftOpenDialog'

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
  // 🕐 (التحديث الحادي والعشرين) ورديتي المحددة — الاسم + تعريفه بأوقاته
  // (myShift null لو الاسم مش موجود في ورديات الفرع حالياً)
  shiftName: string | null
  myShift: { name: string; from: string; to: string } | null
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

/** نفس تسميات شاشة المستخدمين بالظبط — عشان الموظف يشوف نفس أسماء صلاحياته */
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
    <div className="flex items-center gap-2 text-[13px]">
      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dotted border-border" />
      <dd className={cn(
        'max-w-[60%] truncate font-bold',
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
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          tone === 'emerald' && 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
          tone === 'amber' && 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
          tone === 'rose' && 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
          tone === 'default' && 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-extrabold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

export function MyProfileView() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<ProfileResponse | null>(null)
  const [comm, setComm] = React.useState<CommissionData | null>(null)
  // 🔗 2026-11-01 (التحديث العشرين) — فتح الوردية من «ملفي» نفسه:
  // مفيش معنى نبعّت الموظف يدوّر على نقطة البيع — الصفحة دي بيوّته هي.
  const [shiftOpenOpen, setShiftOpenOpen] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api<ProfileResponse>('/api/me/profile')
      .then((res) => {
        if (!alive) return
        setData(res)
        // 💰 بائع؟ نجيب عمولته الشهر الحالية من نفس API «عمولتي»
        if (res?.me?.isSeller) {
          api<CommissionData>('/api/commissions/my')
            .then((c) => { if (alive && c?.enabled) setComm(c) })
            .catch(() => { /* العمولة استكمالية — فشلها مش بيكسر الصفحة */ })
        }
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'حصل خطأ في تحميل ملفك — جرّب تاني')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // 🔗 تحديث صامت بعد فتح الوردية من الدايلوج — من غير سبينر بيقلّب الصفحة
  const reloadAfterShift = async () => {
    try {
      const res = await api<ProfileResponse>('/api/me/profile')
      setData(res)
    } catch { /* الصفحة القديمة ستة — المستخدم يحدّث بنفسه لو حاجات */ }
  }

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
  // 🔑 نفس قاعدة POSView بالظبط: مدير / من غير قيود / عنده صلاحية 'shift_open'
  const canOpenShift = permissions.unrestricted || permissions.list.includes('shift_open')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-5" dir="rtl">
      {/* ── الهيرو: أنا مين ── */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-5">
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
              {hr?.shiftName ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                  <Clock className="size-3" aria-hidden />
                  {hr.myShift ? shiftLabel(hr.myShift) : hr.shiftName}
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
          <StatTile
            label="فواتير سجّلتها"
            value={String(today.invoices)}
            icon={ReceiptText}
            tone="emerald"
          />
          <StatTile
            label="صافي مبيعاتي (ج.م)"
            value={fmt(today.netTotal)}
            icon={CircleUserRound}
          />
          <StatTile
            label="مرتجعات (ج.م)"
            value={fmt(today.refunded)}
            icon={Undo2}
            tone={today.refunded > 0 ? 'amber' : 'default'}
          />
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          الأرقام دي من فواتير سجّلتها أنت بس يوم {today.date} بتوقيت المحل — مبيعات زمايلك عند المدير.
        </p>
      </section>

      {/* ── بياناتي + صلاحياتي ── */}
      <div className="grid gap-2.5 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-extrabold">بياناتي</h2>
          <dl className="space-y-2.5">
            <LedgerRow label="الاسم" value={me.name} />
            <LedgerRow label="البريد" value={me.email} icon={Mail} />
            <LedgerRow label="الدور" value={ROLE_LABELS[me.role] ?? me.role} icon={UserCog} />
            <LedgerRow label="الفرع" value={me.branchName ?? '— كل الفروع'} icon={Building2} />
            <LedgerRow
              label="عرض الأرباح والتكاليف"
              value={me.canViewProfits ? 'مسموح' : 'مخفي'}
              icon={me.canViewProfits ? Eye : EyeOff}
            />
            <LedgerRow label="عضو منذ" value={fmtDay(me.createdAt)} icon={CalendarDays} />
            <LedgerRow label="آخر دخول" value={me.lastLoginAt ? fmtWhen(me.lastLoginAt) : '—'} icon={LogIn} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold">
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
                <li
                  key={p}
                  className="rounded-full border bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-foreground/80"
                >
                  {PERM_LABELS[p] ?? p}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── الوردية المفتوحة على فرعي ── */}
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold">
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
        ) : canOpenShift ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              مفيش وردية مفتوحة على فرعك دلوقتي — سجّل بداية شغلك من هنا على طول:
            </p>
            {/* 🕐 ورديتك المحددة في HR بتتختار لك تلقائياً في الدايلوج */}
            {hr?.myShift ? (
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                ورديتك المحددة: {shiftLabel(hr.myShift)} — هتتختار لك تلقائياً تحت
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setShiftOpenOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-400/40"
            >
              <DoorOpen className="size-4" aria-hidden />
              افتح وردية باسمك
            </button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              نفس الخطوات المعهودة: تختار الوردية وتكتب العهدة الافتتاحية — وشغلك على الدرج يتسجل باسمك.
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            مفيش وردية مفتوحة على فرعك دلوقتي — أول ما تتفتح وردية على الفرع هتشوفها هنا باسم اللي فتحها.
          </p>
        )}
      </section>

      {/* ── عمولتي (البائع بس) ── */}
      {me.isSeller && comm ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold">
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
            <p className={cn('mt-2 px-1 text-[11px] font-bold', comm.targetMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
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
            <h2 className="flex items-center gap-1.5 px-1 text-sm font-extrabold">
              <Briefcase className="size-4 text-sky-500" aria-hidden />
              ملفي في الموارد البشرية
            </h2>
            <div className="grid gap-2.5 md:grid-cols-2">
              {/* بياناتي الوظيفية */}
              <section className="rounded-2xl border bg-card p-4">
                <h3 className="mb-3 text-sm font-extrabold">بياناتي الوظيفية</h3>
                <dl className="space-y-2.5">
                  <LedgerRow label="الاسم في الملف" value={hr.name} />
                  <LedgerRow label="الوظيفة" value={hr.jobTitle ?? '—'} icon={Briefcase} />
                  <LedgerRow label="الراتب الأساسي" value={`${fmt(hr.baseSalary)} ج.م`} icon={Wallet} />
                  <LedgerRow label="الفرع" value={hr.branchName ?? '—'} icon={Building2} />
                  {/* 🕐 ورديتي المحددة في الموارد البشرية (التحديث الحادي والعشرين) */}
                  <LedgerRow
                    label="ورديتي"
                    value={hr.myShift
                      ? shiftLabel(hr.myShift)
                      : hr.shiftName
                        ? `${hr.shiftName} (مش موجودة في ورديات الفرع دلوقتي)`
                        : 'لسه متحددتش — اطلب من المدير'}
                    icon={Clock}
                  />
                  <LedgerRow label="الراحة الأسبوعية" value={WEEK_DAYS[hr.weeklyOffDay] ?? '—'} icon={CalendarOff} />
                  <LedgerRow label="تاريخ التعيين" value={fmtDay(hr.hireDate)} icon={CalendarDays} />
                </dl>
              </section>

              {/* حضوري الشهر */}
              <section className="rounded-2xl border bg-card p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold">
                  <CalendarCheck className="size-4 text-sky-500" aria-hidden />
                  حضوري — {hr.attendance.month}
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <StatTile label="أيام حضور" value={String(hr.attendance.present)} icon={CalendarCheck} tone="emerald" />
                  <StatTile
                    label="تأخير (دقيقة)"
                    value={String(hr.attendance.lateMinutes)}
                    icon={Clock}
                    tone={hr.attendance.lateMinutes > 0 ? 'amber' : 'default'}
                  />
                  <StatTile
                    label="أيام غياب"
                    value={String(hr.attendance.absent)}
                    icon={CalendarOff}
                    tone={hr.attendance.absent > 0 ? 'rose' : 'default'}
                  />
                  <StatTile label="أيام إجازة" value={String(hr.attendance.leave)} icon={CalendarDays} />
                </div>
              </section>
            </div>
          </section>

          <div className="grid gap-2.5 md:grid-cols-2">
            {/* إجازاتي */}
            <section className="rounded-2xl border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold">
                <CalendarOff className="size-4 text-sky-500" aria-hidden />
                إجازاتي
              </h3>
              <p className="mb-3 text-[13px] font-bold">
                رصيد السنة: <span className="text-sky-600 dark:text-sky-400">{hr.leaves.annualRemaining} يوم</span>
                {' '}متبقي من {hr.leaves.annualTotal} (استخدمت {hr.leaves.annualUsed})
              </p>
              {hr.leaves.recent.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">مفيش إجازات مسجّلة لسه.</p>
              ) : (
                <ul className="space-y-2">
                  {hr.leaves.recent.map((l, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[12px]">
                      <span className="font-bold">{LEAVE_TYPES[l.type] ?? l.type}</span>
                      <span className="text-muted-foreground">
                        {l.startDate}{l.endDate !== l.startDate ? ` ← ${l.endDate}` : ''}
                        {' · '}{l.hours != null ? `${l.hours} ساعة` : `${l.days} يوم`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* قسيمة راتبي */}
            <section className="rounded-2xl border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold">
                <BadgeDollarSign className="size-4 text-sky-500" aria-hidden />
                قسيمة راتبي
              </h3>
              {hr.payslip ? (
                <>
                  <p className="mb-2.5 text-[11px] font-bold text-muted-foreground">
                    شهر {hr.payslip.month} — معتمدة ومدفوعة
                    {hr.payslip.paidAt ? ` · ${fmtWhen(hr.payslip.paidAt)}` : ''}
                  </p>
                  <dl className="space-y-2">
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
                    {/* 💰 عمود العمولة — عمولة مبيعات الشهر نزلت على الراتب */}
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
                    <div className="border-t pt-2">
                      <LedgerRow label="الصافي" value={`${fmt(hr.payslip.net)} ج.م`} icon={BadgeDollarSign} tone="emerald" />
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  مفيش قسيمة راتب معتمدة لسه — أول ما المدير يعتمد الرواتب، قسيمتك هتظهر هنا بالتفصيل
                  (ومنها عمولة مبيعاتك لو بائع).
                </p>
              )}
            </section>
          </div>
        </>
      ) : null}

      {/* 🔗 دايلوج فتح الوردية — نفس دايلوج نقطة البيع بالظبط، وبيتحدّث الكارت بعده.
          🕐 ورديتي المحددة في HR بتتقدّم كاختيار مبدئي جوه الدايلوج */}
      <ShiftOpenDialog
        open={shiftOpenOpen}
        onOpenChange={(o) => {
          setShiftOpenOpen(o)
          if (!o) void reloadAfterShift()
        }}
        preferredShiftName={hr?.myShift?.name ?? null}
      />
    </div>
  )
}
