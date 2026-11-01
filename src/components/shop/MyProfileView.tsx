'use client'

import * as React from 'react'
import {
  CircleUserRound, Mail, Building2, CalendarDays, LogIn, Loader2,
  ReceiptText, Undo2, ShieldCheck, DoorOpen, Percent, Eye, EyeOff,
  UserCog, Sparkles, Briefcase, CalendarCheck, CalendarOff, Wallet,
  HandCoins, BadgeDollarSign, Clock, Link2, CheckCircle2, User, UserRound
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

const isFemaleName = (name: string) => {
  const n = name.trim();
  if (!n) return false;
  if (/[ةى]$/.test(n) || /[اء]$/.test(n)) return true;
  const femaleNames = ['مريم', 'سارة', 'نور', 'هند', 'زينب', 'رنا', 'ريم', 'لينا', 'جنى', 'حبيبة', 'ملك', 'ياسمين', 'دينا', 'نهى', 'منى', 'سلمى', 'ليلى', 'شروق', 'أمل', 'إيمان', 'هدى', 'رؤى', 'آية', 'إسراء', 'هبة', 'شيماء', 'بسمة', 'عبير', 'سماح', 'نادية', 'نرمين', 'سمر', 'رغد', 'رهف', 'جواهر', 'فاطمة', 'عائشة', 'خديجة'];
  return femaleNames.some(fn => n.includes(fn));
};

function LedgerRow({ label, value, icon: Icon, tone }: { label: string; value: string; icon?: React.ElementType; tone?: 'emerald' | 'amber' | 'rose' | 'sky' }) {
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      {Icon ? <Icon className="size-4 shrink-0 text-slate-400" aria-hidden /> : <div className="size-4" />}
      <dt className="shrink-0 font-semibold text-slate-500">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dashed border-slate-200 dark:border-slate-700/80 mx-1" />
      <dd className={cn(
        'max-w-[60%] truncate font-bold text-slate-800 dark:text-slate-200',
        tone === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'amber' && 'text-amber-600 dark:text-amber-400',
        tone === 'rose' && 'text-rose-600 dark:text-rose-400',
        tone === 'sky' && 'text-sky-600 dark:text-sky-400',
      )}>{value}</dd>
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <CircleUserRound className="size-10 text-slate-400" />
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error || 'مفيش بيانات'}
        </p>
      </div>
    )
  }

  const { me, permissions, today, openShift, hr } = data
  const initial = (me.name || '؟').trim().charAt(0)
  const isFemale = isFemaleName(me.name)

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو (أزرق ملكي مع ذهبي 3D) ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-blue-500/20 blur-[100px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-amber-500/10 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center gap-6 p-6 sm:p-8">
            {/* الأفاتار 3D */}
            <div className="relative shrink-0 z-10">
              <div className="size-24 sm:size-28 rounded-[2rem] bg-gradient-to-br from-blue-400 to-indigo-600 p-1.5 shadow-2xl ring-4 ring-white/10 backdrop-blur-md">
                <div className="size-full rounded-[1.5rem] bg-slate-900/50 flex items-center justify-center text-white shadow-inner backdrop-blur-sm">
                  {isFemale ? <UserRound className="size-12 sm:size-14 drop-shadow-lg" strokeWidth={2.5} /> : <User className="size-12 sm:size-14 drop-shadow-lg" strokeWidth={2.5} />}
                </div>
              </div>
              <span className="absolute -bottom-2 -right-2 grid size-8 place-items-center rounded-xl bg-emerald-500 text-white shadow-lg ring-2 ring-slate-950">
                <CheckCircle2 className="size-5" />
              </span>
            </div>

            {/* البيانات */}
            <div className="flex-1 z-10">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-md">{me.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                <Mail className="size-4 text-slate-400" />
                {me.email}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  <UserCog className="size-3.5 text-blue-300" /> {ROLE_LABELS[me.role] ?? me.role}
                </span>
                {me.branchName && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                    <Building2 className="size-3.5 text-blue-300" /> {me.branchName}
                  </span>
                )}
                {me.isSeller && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-200 backdrop-blur-md">
                    <Percent className="size-3.5 text-amber-400" /> بائع
                  </span>
                )}
                {hr && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/20 px-3 py-1 text-xs font-bold text-sky-200 backdrop-blur-md">
                    <Link2 className="size-3.5 text-sky-400" /> {hr.jobTitle || 'موظف HR'}
                  </span>
                )}
                {!me.active && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-200 backdrop-blur-md">
                    الحساب موقوف
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================= النهاردة ================= */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 px-1 text-lg font-black text-slate-800 dark:text-slate-100">
            <Sparkles className="size-5 text-amber-500" /> إحصائيات اليوم
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center gap-4 hover:-translate-y-1 transition-transform">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30">
                <ReceiptText className="size-6 drop-shadow-md" />
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-500">فواتير سجلتها</span>
                <span className="text-2xl font-black mt-0.5">{today.invoices}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center gap-4 hover:-translate-y-1 transition-transform">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-500/30">
                <Wallet className="size-6 drop-shadow-md" />
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-500">صافي مبيعاتي (ج.م)</span>
                <span className="text-2xl font-black mt-0.5 text-blue-600">{fmt(today.netTotal)}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center gap-4 hover:-translate-y-1 transition-transform">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/30">
                <Undo2 className="size-6 drop-shadow-md" />
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-500">مرتجعات (ج.م)</span>
                <span className={cn("text-2xl font-black mt-0.5", today.refunded > 0 ? "text-amber-600" : "text-slate-400")}>{fmt(today.refunded)}</span>
              </div>
            </div>
          </div>
          <p className="px-1 text-[11px] font-semibold text-slate-500">
            الأرقام دي من فواتير سجلتها أنت بس يوم {today.date} بتوقيت المحل.
          </p>
        </section>

        {/* ================= بياناتي + صلاحياتي ================= */}
        <div className="grid gap-4 md:grid-cols-2">
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="mb-4 text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <CircleUserRound className="size-5 text-blue-500" /> بياناتي الأساسية
            </h2>
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

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-black text-slate-800 dark:text-slate-100">
              <ShieldCheck className="size-5 text-emerald-500" /> صلاحياتي
            </h2>
            {permissions.unrestricted ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="size-5 shrink-0" /> عندك كل الصلاحيات — كل شاشات النظام متاحة لك.
              </div>
            ) : permissions.list.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">مفيش صلاحيات محددة — كلم المدير.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {permissions.list.map((p) => (
                  <span key={p} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                    {PERM_LABELS[p] ?? p}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ================= الوردية المفتوحة ================= */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-black text-slate-800 dark:text-slate-100">
            <DoorOpen className="size-5 text-indigo-500" /> وردية فرعي
          </h2>
          {openShift ? (
            <div className={cn(
              'rounded-xl border px-4 py-4 text-sm leading-relaxed flex items-start gap-3',
              openShift.mine ? 'border-emerald-500/30 bg-emerald-50' : 'border-amber-500/30 bg-amber-50'
            )}>
              <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg mt-0.5", openShift.mine ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600")}>
                <DoorOpen className="size-4" />
              </div>
              <div>
                <p className="font-bold text-slate-800">
                  {openShift.shiftName}
                  {openShift.mine ? ' — الوردية دي باسمك ✅' : openShift.userName ? ` — فتحها ${openShift.userName}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  مفتوحة من {fmtWhen(openShift.createdAt)} · الإغلاق بيحسب على الوردية نفسها وعلى اللي فتحها
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 flex items-center gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-200 text-slate-500">
                <DoorOpen className="size-4" />
              </div>
              <p>
                مفيش وردية مفتوحة على فرعك دلوقتي — افتح وردية باسمك من أدوات نقطة البيع (
                <Link href="/pos" className="font-bold text-blue-600 underline underline-offset-4">نقطة البيع</Link>
                ).
              </p>
            </div>
          )}
        </section>

        {/* ================= عمولتي (البائع) ================= */}
        {me.isSeller && comm ? (
          <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-black rounded-2xl border border-slate-800 p-5 shadow-lg text-white">
            <div className="absolute -top-10 -right-10 size-32 rounded-full bg-amber-500/20 blur-2xl" />
            <h2 className="relative mb-4 flex items-center gap-2 text-lg font-black">
              <Percent className="size-5 text-amber-400" /> عمولتي — {comm.month}
            </h2>
            <div className="relative grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs font-bold text-slate-400 mb-1">مبيعات الشهر (ج.م)</p>
                <p className="text-2xl font-black tabular-nums text-emerald-400">{fmt(comm.netBase)}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs font-bold text-slate-400 mb-1">العمولة التقديرية (ج.م)</p>
                <p className={cn("text-2xl font-black tabular-nums", comm.targetMet ? "text-amber-400" : "text-white")}>{fmt(comm.commission)}</p>
              </div>
            </div>
            {comm.target != null && (
              <p className={cn('mt-3 text-xs font-bold', comm.targetMet ? 'text-emerald-400' : 'text-slate-400')}>
                التارجت: {fmt(comm.target)} ج.م — {comm.targetMet ? 'حققته 🎉' : 'لسه ماوصلتش'}
              </p>
            )}
            {comm.payout && (
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                اتصرفت لك عمولة {fmt(comm.payout.amount)} ج.م عن الشهر ده ({comm.payout.viaPayroll ? 'مع الراتب' : comm.payout.method ?? 'صرف مباشر'})
              </p>
            )}
          </section>
        ) : null}

        {/* ================= ملفي في الموارد البشرية ================= */}
        {hr ? (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 px-1 text-lg font-black text-slate-800 dark:text-slate-100">
              <Briefcase className="size-5 text-sky-500" /> ملفي في الموارد البشرية
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2">
              {/* بياناتي الوظيفية */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-black flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Briefcase className="size-4 text-slate-400" /> بياناتي الوظيفية
                </h3>
                <dl className="space-y-3">
                  <LedgerRow label="الاسم في الملف" value={hr.name} />
                  <LedgerRow label="الوظيفة" value={hr.jobTitle ?? '—'} icon={Briefcase} />
                  <LedgerRow label="الراتب الأساسي" value={`${fmt(hr.baseSalary)} ج.م`} icon={Wallet} />
                  <LedgerRow label="الفرع" value={hr.branchName ?? '—'} icon={Building2} />
                  <LedgerRow label="الراحة الأسبوعية" value={WEEK_DAYS[hr.weeklyOffDay] ?? '—'} icon={CalendarOff} />
                  <LedgerRow label="تاريخ التعيين" value={fmtDay(hr.hireDate)} icon={CalendarDays} />
                </dl>
              </div>

              {/* حضوري الشهر */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                  <CalendarCheck className="size-4 text-sky-500" /> حضوري — {hr.attendance.month}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-emerald-700">أيام حضور</span>
                    <span className="text-xl font-black text-emerald-600">{hr.attendance.present}</span>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-amber-700">تأخير (دقيقة)</span>
                    <span className="text-xl font-black text-amber-600">{hr.attendance.lateMinutes}</span>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-rose-700">أيام غياب</span>
                    <span className="text-xl font-black text-rose-600">{hr.attendance.absent}</span>
                  </div>
                  <div className="bg-sky-50 rounded-xl p-3 border border-sky-100 flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-[10px] font-bold text-sky-700">أيام إجازة</span>
                    <span className="text-xl font-black text-sky-600">{hr.attendance.leave}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* إجازاتي */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                  <CalendarOff className="size-4 text-sky-500" /> إجازاتي
                </h3>
                <div className="mb-4 rounded-xl bg-sky-50 border border-sky-100 p-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-800">رصيد السنة</span>
                  <span className="text-sm font-black text-sky-600">{hr.leaves.annualRemaining} يوم متبقي</span>
                </div>
                {hr.leaves.recent.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">مفيش إجازات مسجّلة لسه.</p>
                ) : (
                  <ul className="space-y-2">
                    {hr.leaves.recent.map((l, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                        <span className="font-bold text-slate-700">{LEAVE_TYPES[l.type] ?? l.type}</span>
                        <span className="text-slate-500">
                          {l.startDate}{l.endDate !== l.startDate ? ` ← ${l.endDate}` : ''}
                          {' · '}{l.hours != null ? `${l.hours} ساعة` : `${l.days} يوم`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* قسيمة راتبي (Receipt Style) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 flex items-center gap-2">
                  <BadgeDollarSign className="size-4 text-emerald-500" />
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">قسيمة راتبي</h3>
                </div>
                
                {hr.payslip ? (
                  <div className="p-5 flex flex-col flex-1">
                    <p className="mb-4 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded w-fit">
                      شهر {hr.payslip.month} — معتمدة ومدفوعة {hr.payslip.paidAt ? `· ${fmtWhen(hr.payslip.paidAt)}` : ''}
                    </p>
                    <dl className="space-y-2.5 flex-1">
                      <LedgerRow label="الأساسي المستحق" value={`${fmt(hr.payslip.payableBase)} ج.م`} icon={Wallet} />
                      {hr.payslip.absenceDeduction > 0 && (
                        <LedgerRow label="خصم الغياب" value={`− ${fmt(hr.payslip.absenceDeduction)}`} tone="rose" />
                      )}
                      {hr.payslip.lateDeduction > 0 && (
                        <LedgerRow label={`خصم التأخير (${hr.payslip.lateMinutes} دقيقة)`} value={`− ${fmt(hr.payslip.lateDeduction)}`} tone="rose" />
                      )}
                      {hr.payslip.bonus > 0 && (
                        <LedgerRow label="حوافز" value={`+ ${fmt(hr.payslip.bonus)}`} icon={HandCoins} tone="emerald" />
                      )}
                      {hr.payslip.penalty > 0 && (
                        <LedgerRow label="جزاءات" value={`− ${fmt(hr.payslip.penalty)}`} tone="rose" />
                      )}
                      {hr.payslip.commission !== 0 && (
                        <LedgerRow
                          label="عمولة المبيعات 💰"
                          value={hr.payslip.commission > 0 ? `+ ${fmt(hr.payslip.commission)}` : `− ${fmt(Math.abs(hr.payslip.commission))}`}
                          icon={Percent}
                          tone={hr.payslip.commission > 0 ? 'emerald' : 'rose'}
                        />
                      )}
                      {hr.payslip.advanceDeduction > 0 && (
                        <LedgerRow label="قسط السلف" value={`− ${fmt(hr.payslip.advanceDeduction)}`} icon={HandCoins} tone="amber" />
                      )}
                    </dl>
                    
                    {/* الصافي (Footer) */}
                    <div className="mt-5 pt-4 border-t-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-sm font-black text-slate-600 dark:text-slate-300">الصافي</span>
                      <span className="inline-flex items-center rounded-xl bg-slate-900 px-5 py-2.5 text-xl font-black tabular-nums text-emerald-400 shadow-inner">
                        {fmt(hr.payslip.net)} <span className="text-xs font-bold text-slate-400 ms-1">ج.م</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-sm leading-relaxed text-slate-500">
                      مفيش قسيمة راتب معتمدة لسه — أول ما المدير يعتمد الرواتب، قسيمتك هتظهر هنا بالتفصيل (ومنها عمولة مبيعاتك لو بائع).
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}