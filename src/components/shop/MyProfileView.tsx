'use client'

/**
 * 👤 2026-11-01 (التحديث السابع عشر + الثامن عشر) — «ملفي»: الصفحة الشخصية للموظف.
 *
 * الفجوة: بيانات الموظف وصلاحياته كانت عند المدير بس — والموظف نفسه
 * ماعندوش مكان يشوف فيه نفسه: أنا مين في النظام؟ عندي إيه صلاحيات؟
 * اشتغلت النهاردة كام فاتورة بكام؟ ووردية فرعي مفتوحة ولا لأ؟ ولو
 * مربوط بملف موظف في الموارد البشرية: حضورك وإجازاتك وقسيمة راتبك
 * (بالعمولة) بتظهر هنا كمان.
 *
 * المبدأ: السيشن هو مصدر الهوية — كل رقم هنا من شغلي أنا بس (زي
 * عمولتي بالظبط)، ومفيش أي أرباح أو تكاليف أو بيانات زميل تاني.
 * كروت الصفحة:
 *   1) الهيرو     — أنا مين + «النهاردة» (فواتير اليوم باسمي + الصافي + المرتجع)
 *   2) بياناتي    — الاسم/الدور/الفرع/البريد/تاريخ العضوية/آخر دخول
 *   3) صلاحياتي   — قائمة الصلاحيات (أو «كل الصلاحيات» لو من غير قائمة)
 *   4) الوردية    — الوردية المفتوحة على فرعي دلوقتي (ومين فتحها) —
 *      ومفيش وردية؟ اللي عنده صلاحية الفتح يفتحها من هنا على طول
 *      (نفس دايلوج نقطة البيع) — وورديته المحددة في HR بتتختار له تلقائياً
 *   5) عمولتي     — لو بائع: أرقام الشهر من نفس API «عمولتي» الحالي
 *   6) ملفي في HR — لو حسابي مربوط بموظف: بياناتي الوظيفية (بورديتي 🕐)
 *      + حضوري الشهر + إجازاتي ورصيدي + آخر قسيمة راتب معتمدة (بالعمولة)
 *
 * 🎨 (التحديث الثاني والعشرين) إعادة تصميم الواجهة بنفس لغة صفحات الموارد
 * البشرية: هيرو بتدرّج أزرق/نيلي/بنفسجي، أيقونات 3D (تدرّج + لمعة + ظل
 * ملوّن)، صفحة عريضة (1600px) وخطوط أكبر وأوضح. واجهة بس — صفر تغيير في
 * المنطق أو الـ API أو الصلاحيات.
 */

import * as React from 'react'
import {
  CircleUserRound, UserRound, Ban, Mail, Building2, CalendarDays, LogIn, ReceiptText, Undo2, ShieldCheck, DoorOpen, Percent, UserCog, Briefcase, CalendarCheck, CalendarOff, Wallet, HandCoins, BadgeDollarSign, Clock, CheckCircle2, Target, Banknote, TrendingUp, Info,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
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
  new Date(iso).toLocaleString('ar-EG-u-nu-latn', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

/** أرقام لاتينية (زي صفحات HR) — الصفر العربي «٠» شكله نقطة */
const fmt = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })

/* ============================================================
   🎨 نظام الألوان والأيقونات 3D — نفس لغة صفحات الموارد البشرية
   (تدرّج 400→600 + لمعة علوية + حافة سفلية + ظل بلون الأيقونة)
   الكلاسات مكتوبة كاملة عشان Tailwind يلتقطها.
   ============================================================ */
type Tone = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'indigo' | 'teal' | 'slate'

const TONES: Record<Tone, { grad: string; shadow: string; border: string; text: string }> = {
  sky: { grad: 'from-sky-400 to-sky-600', shadow: 'shadow-sky-500/35', border: 'border-s-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  emerald: { grad: 'from-emerald-400 to-emerald-600', shadow: 'shadow-emerald-500/35', border: 'border-s-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  amber: { grad: 'from-amber-400 to-amber-600', shadow: 'shadow-amber-500/35', border: 'border-s-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  rose: { grad: 'from-rose-400 to-rose-600', shadow: 'shadow-rose-500/35', border: 'border-s-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  violet: { grad: 'from-violet-400 to-violet-600', shadow: 'shadow-violet-500/35', border: 'border-s-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  indigo: { grad: 'from-indigo-400 to-indigo-600', shadow: 'shadow-indigo-500/35', border: 'border-s-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  teal: { grad: 'from-teal-400 to-teal-600', shadow: 'shadow-teal-500/35', border: 'border-s-teal-500', text: 'text-teal-600 dark:text-teal-400' },
  slate: { grad: 'from-slate-400 to-slate-600', shadow: 'shadow-slate-500/30', border: 'border-s-slate-400', text: 'text-slate-600 dark:text-slate-300' },
}

const SIZES = {
  sm: { box: 'size-8 rounded-lg', icon: 'size-4' },
  md: { box: 'size-11 rounded-xl', icon: 'size-5' },
  lg: { box: 'size-14 rounded-2xl', icon: 'size-7' },
} as const

/** أيقونة 3D: تدرّج + لمعة من فوق + ظل داخلي تحت + ظل خارجي ملوّن */
function Icon3D({ icon: Icon, tone = 'sky', size = 'md', className }: {
  icon: React.ElementType; tone?: Tone; size?: keyof typeof SIZES; className?: string
}) {
  const t = TONES[tone]
  const s = SIZES[size]
  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/25',
        t.grad, t.shadow, s.box, className,
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/15 to-transparent" />
      <Icon className={cn('relative drop-shadow-md', s.icon)} strokeWidth={2.2} />
    </span>
  )
}

const CARD_CLS =
  'rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 sm:p-6'

/** كارت قسم موحّد: أيقونة 3D + عنوان كبير + محتوى */
function Card({ icon, tone = 'sky', title, subtitle, className, children }: {
  icon: React.ElementType; tone?: Tone; title: React.ReactNode; subtitle?: React.ReactNode
  className?: string; children: React.ReactNode
}) {
  return (
    <section className={cn(CARD_CLS, className)}>
      <div className="mb-5 flex items-center gap-3">
        <Icon3D icon={icon} tone={tone} />
        <div className="min-w-0">
          <h2 className="text-lg font-black leading-tight sm:text-xl">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs font-medium text-muted-foreground sm:text-sm">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

/** صف بيانات: أيقونة 3D صغيرة + عنوان + قيمة (خط واضح) */
function InfoRow({ label, value, icon, iconTone = 'sky', tone }: {
  label: string; value: string; icon: React.ElementType; iconTone?: Tone; tone?: 'emerald' | 'amber' | 'rose'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-slate-800 dark:bg-slate-800/50">
      <Icon3D icon={icon} tone={iconTone} size="sm" />
      <div className="min-w-0 flex-1">
        <dt className="truncate text-xs font-semibold text-muted-foreground sm:text-[13px]">{label}</dt>
        <dd className={cn(
          'mt-0.5 break-words text-[15px] font-extrabold leading-snug sm:text-base',
          tone === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'amber' && 'text-amber-600 dark:text-amber-400',
          tone === 'rose' && 'text-rose-600 dark:text-rose-400',
        )}>{value}</dd>
      </div>
    </div>
  )
}

/** كرت رقم — نفس شكل كروت الهيرو: شريط لون من فوق + أيقونة 3D كبيرة + الرقم في النص */
function StatTile({ label, value, icon, tone = 'sky', foot, compact }: {
  label: string; value: string; icon: React.ElementType; tone?: Tone; foot?: React.ReactNode; compact?: boolean
}) {
  return (
    <div className={cn(
      // 🛡️ 2026-11-03: أزلنا حركات hover (translate/scale/rotate) — لما الماوس بيعدي على العناصر أثناء سكرول بالعجلة كانت بتتحرك فبيبان كأن المحتوى بيقفز. التغذية الراجعة بقت بالظل/اللون بس.
      'relative flex min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900',
      compact ? 'items-center gap-3 px-3.5 pb-3.5 pt-5' : 'flex-col items-center gap-3 px-3 pb-5 pt-7 text-center',
      'shadow-[0_5px_0_rgba(15,23,42,0.08),0_14px_24px_-12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,1)] dark:shadow-[0_5px_0_rgba(0,0,0,0.35),0_14px_24px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]',
    )}>
      <TileStrip tone={tone} />
      <Icon3D icon={icon} tone={tone} size={compact ? 'md' : 'lg'} />
      <div className={cn('min-w-0', compact ? 'flex-1' : 'w-full')}>
        <p className={cn('font-bold text-muted-foreground', compact ? 'truncate text-xs sm:text-[13px]' : 'text-sm')}>{label}</p>
        <p className={cn('break-words font-black tabular-nums leading-tight text-foreground', compact ? 'text-2xl' : 'mt-1 text-3xl')}>{value}</p>
        {foot ? <div className="pt-1 text-xs font-medium text-muted-foreground">{foot}</div> : null}
      </div>
    </div>
  )
}

/** قاعدة واحدة لكل عناصر الهيرو: كارت أبيض مرتفع بحافة سفلية وظل */
const HERO_TILE =
  'rounded-2xl bg-white shadow-[0_6px_0_rgba(15,23,42,0.18),0_18px_30px_-10px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,1)] dark:bg-slate-900 dark:shadow-[0_6px_0_rgba(0,0,0,0.4),0_18px_30px_-10px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]'

/** شريط لون علوي رفيع — بيدّي كل كارت هويته */
function TileStrip({ tone }: { tone: Tone }) {
  return <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l', TONES[tone].grad)} />
}

/** هوية: أيقونة 3D كبيرة + عنوان + قيمة (الدور / الفرع / العمولة) */
function HeroInfo({ icon, tone, label, value }: {
  icon: React.ElementType; tone: Tone; label: string; value: string
}) {
  return (
    <div className={cn(HERO_TILE, 'relative flex min-w-0 items-center gap-4 overflow-hidden px-4 pb-4 pt-5 text-foreground')}>
      <TileStrip tone={tone} />
      <Icon3D icon={icon} tone={tone} size="lg" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-lg font-black leading-tight">{value}</p>
      </div>
    </div>
  )
}

/** رقم اليوم: أيقونة 3D كبيرة في النص + عنوان + رقم كبير */
function HeroStat({ icon, tone, label, value }: {
  icon: React.ElementType; tone: Tone; label: string; value: string
}) {
  return (
    <div className={cn(HERO_TILE, 'relative flex min-w-0 flex-col items-center gap-3 overflow-hidden px-3 pb-5 pt-7 text-center text-foreground')}>
      <TileStrip tone={tone} />
      <Icon3D icon={icon} tone={tone} size="lg" />
      <div className="w-full min-w-0">
        <p className="truncate text-sm font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-3xl font-black tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  )
}

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-3 min-h-screen bg-slate-50 pb-12 dark:bg-slate-950 sm:-mx-6" dir="rtl">
      {children}
    </div>
  )
}

/** «2026-11» → «نوفمبر 2026» */
const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  if (!y || !mo) return m
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('ar-EG-u-nu-latn', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/** عنوان مجموعة صغير جوه الكارت */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 ps-1 text-xs font-extrabold tracking-wide text-muted-foreground">{children}</h3>
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
      <PageWrap>
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
          <div className="h-56 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-900" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="h-72 animate-pulse rounded-3xl bg-muted lg:col-span-2" />
            <div className="h-72 animate-pulse rounded-3xl bg-muted" />
          </div>
        </div>
      </PageWrap>
    )
  }

  if (error || !data) {
    return (
      <PageWrap>
        <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
          <Icon3D icon={CircleUserRound} tone="slate" size="lg" />
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
            {error || 'مفيش بيانات'}
          </p>
        </div>
      </PageWrap>
    )
  }

  const { me, permissions, today, openShift, hr } = data
  // 🔑 نفس قاعدة POSView بالظبط: مدير / من غير قيود / عنده صلاحية 'shift_open'
  const canOpenShift = permissions.unrestricted || permissions.list.includes('shift_open')
  const showComm = !!(me.isSeller && comm)
  // «ملفي» هي الصفحة نفسها — مالهاش لازمة في قائمة صلاحياتي
  const shownPerms = permissions.list.filter((p) => p !== 'my_profile')

  // 🕐 ورديتي المحددة في HR (نص واحد يتعرض في مكان واحد بس: كارت الوردية)
  const assignedShift = hr
    ? hr.myShift
      ? shiftLabel(hr.myShift)
      : hr.shiftName
        ? `${hr.shiftName} (مش موجودة في ورديات الفرع حاليًا)`
        : null
    : null

  return (
    <PageWrap>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">

        {/* ================= الهيرو: أنا مين | شغلي النهاردة ================= */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.3)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-cyan-300/30 blur-[80px]" />

          <div className="relative flex flex-col gap-10 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:p-10">
            {/* الهوية */}
            <div className="z-10 min-w-0 flex-1">
              <div className="flex items-center gap-5">
                <span className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-[28px] border border-t-white/50 border-l-white/30 border-b-black/20 border-r-black/10 bg-gradient-to-br from-white/35 to-white/10 text-white shadow-[0_20px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.45)] ring-1 ring-white/30 backdrop-blur-md sm:size-28">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
                  <UserRound className="relative size-12 drop-shadow-lg sm:size-14" strokeWidth={1.8} aria-hidden />
                </span>
                <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight drop-shadow-md sm:text-4xl lg:text-5xl">
                  {me.name}
                </h1>
              </div>

              <div className="mt-7 grid gap-4 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
                <HeroInfo icon={UserCog} tone="violet" label="الدور" value={ROLE_LABELS[me.role] ?? me.role} />
                <HeroInfo icon={Building2} tone="teal" label="الفرع" value={me.branchName ?? 'كل الفروع'} />
                {!me.active ? (
                  <HeroInfo icon={Ban} tone="rose" label="الحساب" value="موقوف" />
                ) : me.isSeller ? (
                  <HeroInfo icon={Percent} tone="amber" label="العمولة" value="بائع بعمولة" />
                ) : null}
              </div>
            </div>

            {/* شغلي النهاردة */}
            <div className="z-10 w-full lg:w-[580px] lg:shrink-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-lg font-black drop-shadow-md sm:text-xl">
                  <Icon3D icon={CalendarCheck} tone="amber" size="sm" />
                  شغلي النهاردة
                </h2>
                <span className="rounded-lg border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-bold tabular-nums">{today.date}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 min-[460px]:grid-cols-3">
                <HeroStat icon={ReceiptText} tone="emerald" label="فواتير" value={String(today.invoices)} />
                <HeroStat icon={TrendingUp} tone="sky" label="صافي المبيعات (ج.م)" value={fmt(today.netTotal)} />
                <HeroStat icon={Undo2} tone={today.refunded > 0 ? 'rose' : 'amber'} label="مرتجعات (ج.م)" value={fmt(today.refunded)} />
              </div>
              <p className="mt-3 text-xs text-white/75">فواتيرك أنت بس بتوقيت المحل</p>
            </div>
          </div>
        </section>

        {/* ================= شبكة واحدة: عمود رئيسي | عمود جانبي (من غير فراغات) ================= */}
        <div className="grid items-stretch gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2 [&>section:last-child]:flex-1">
            {/* بياناتي — كل معلومة مرة واحدة، مقسّمة: الحساب | الوظيفة */}
            <Card icon={CircleUserRound} tone="sky" title="بياناتي">
              <div className={cn('grid gap-x-8 gap-y-6', hr && 'md:grid-cols-2')}>
                <div>
                  <GroupTitle>الحساب</GroupTitle>
                  <dl className="space-y-2.5">
                    <InfoRow label="البريد الإلكتروني" value={me.email} icon={Mail} iconTone="indigo" />
                    <InfoRow label="عضو منذ" value={fmtDay(me.createdAt)} icon={CalendarDays} iconTone="amber" />
                    <InfoRow label="آخر دخول" value={me.lastLoginAt ? fmtWhen(me.lastLoginAt) : '—'} icon={LogIn} iconTone="rose" />
                  </dl>
                </div>
                {hr ? (
                  <div>
                    <GroupTitle>الوظيفة</GroupTitle>
                    <dl className="space-y-2.5">
                      <InfoRow label="المسمى الوظيفي" value={hr.jobTitle ?? '—'} icon={Briefcase} iconTone="violet" />
                      <InfoRow label="الراتب الأساسي" value={`${fmt(hr.baseSalary)} ج.م`} icon={Wallet} iconTone="emerald" />
                      {/* التعيين + الراحة جنب بعض — عشان المجموعتين يبقوا 3 صفوف متساوية */}
                      <div className="grid gap-2.5 min-[480px]:grid-cols-2">
                        <InfoRow label="تاريخ التعيين" value={fmtDay(hr.hireDate)} icon={CalendarDays} iconTone="teal" />
                        <InfoRow label="الراحة الأسبوعية" value={WEEK_DAYS[hr.weeklyOffDay] ?? '—'} icon={CalendarOff} iconTone="sky" />
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* عمولتي (البائع بس) */}
            {showComm && comm ? (
              <Card icon={Percent} tone="amber" title="عمولتي" subtitle={fmtMonth(comm.month)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <StatTile label="مبيعات الشهر (ج.م)" value={fmt(comm.netBase)} icon={ReceiptText} tone="emerald" />
                  <StatTile
                    label="العمولة التقديرية (ج.م)"
                    value={fmt(comm.commission)}
                    icon={Percent}
                    tone={comm.targetMet ? 'emerald' : 'amber'}
                  />
                </div>
                {comm.target != null ? (
                  <div className={cn(
                    'mt-4 flex items-center gap-3 rounded-2xl border px-3.5 py-3',
                    comm.targetMet
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50',
                  )}>
                    <Icon3D icon={Target} tone={comm.targetMet ? 'emerald' : 'slate'} size="sm" />
                    <p className={cn('text-sm font-bold sm:text-[15px]', comm.targetMet ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
                      التارجت {fmt(comm.target)} ج.م — {comm.targetMet ? 'حققته' : 'لسه ماوصلتش'}
                    </p>
                  </div>
                ) : null}
                {comm.payout ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <Icon3D icon={Banknote} tone="violet" size="sm" />
                    <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                      اتصرفت لك عمولة <strong className="text-foreground">{fmt(comm.payout.amount)} ج.م</strong> عن الشهر ده (
                      {comm.payout.viaPayroll ? 'مع الراتب' : comm.payout.method ?? 'صرف مباشر'})
                    </p>
                  </div>
                ) : null}
              </Card>
            ) : null}
            {hr && !showComm ? (
              <Card icon={CalendarCheck} tone="amber" title="حضوري" subtitle={fmtMonth(hr.attendance.month)}>
                <div className="grid grid-cols-2 gap-3.5">
                  <StatTile compact label="أيام حضور" value={String(hr.attendance.present)} icon={CalendarCheck} tone="emerald" />
                  <StatTile
                    compact
                    label="تأخير (دقيقة)"
                    value={String(hr.attendance.lateMinutes)}
                    icon={Clock}
                    tone={hr.attendance.lateMinutes > 0 ? 'amber' : 'slate'}
                  />
                  <StatTile
                    compact
                    label="أيام غياب"
                    value={String(hr.attendance.absent)}
                    icon={CalendarOff}
                    tone={hr.attendance.absent > 0 ? 'rose' : 'slate'}
                  />
                  <StatTile compact label="أيام إجازة" value={String(hr.attendance.leave)} icon={CalendarDays} tone="sky" />
                </div>
              </Card>
            ) : null}
          </div>

          <div className="flex flex-col gap-6">
            {/* ورديتي — الوردية المحددة + حالة درج الفرع في كارت واحد (من غير رسائل متناقضة) */}
            <Card icon={Clock} tone="amber" title={hr ? 'ورديتي' : 'وردية الفرع'}>
              <div className="space-y-3">
                {hr ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
                    <Icon3D icon={Clock} tone="emerald" size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground sm:text-[13px]">وردية شغلي</p>
                      <p className="break-words text-[15px] font-extrabold sm:text-base">
                        {assignedShift ?? 'لسه متحددتش — اطلب من المدير'}
                      </p>
                    </div>
                  </div>
                ) : null}

                {openShift ? (
                  <div className={cn(
                    'flex items-start gap-3 rounded-2xl border p-3.5',
                    openShift.mine
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-amber-500/40 bg-amber-500/10',
                  )}>
                    <Icon3D icon={openShift.mine ? CheckCircle2 : DoorOpen} tone={openShift.mine ? 'emerald' : 'amber'} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground sm:text-[13px]">درج الفرع</p>
                      <p className="text-[15px] font-extrabold sm:text-base">
                        {openShift.shiftName} مفتوحة {openShift.mine ? 'باسمك' : openShift.userName ? `— فتحها ${openShift.userName}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground sm:text-[13px]">
                        من {fmtWhen(openShift.createdAt)}
                      </p>
                    </div>
                  </div>
                ) : canOpenShift ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <p className="text-sm font-bold text-muted-foreground sm:text-[15px]">درج الفرع مقفول</p>
                    <button
                      type="button"
                      onClick={() => setShiftOpenOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-[0_5px_0_rgba(0,0,0,0.15)] transition-all hover:bg-primary/90 hover:shadow-[0_2px_0_rgba(0,0,0,0.15)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-400/40"
                    >
                      <DoorOpen className="size-4" aria-hidden />
                      افتح وردية
                    </button>
                  </div>
                ) : !hr ? (
                  <p className="text-sm text-muted-foreground sm:text-[15px]">مفيش وردية مفتوحة على الفرع حاليًا.</p>
                ) : null}
              </div>
            </Card>

            {/* صلاحياتي — بتختفي لو مفيش حاجة تتعرض */}
            {(permissions.unrestricted || shownPerms.length > 0) ? (
              <Card icon={ShieldCheck} tone="emerald" title="صلاحياتي">
                {permissions.unrestricted ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                    <Icon3D icon={CheckCircle2} tone="emerald" size="sm" />
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 sm:text-[15px]">
                      كل الصلاحيات متاحة لك
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {shownPerms.map((p) => (
                      <li
                        key={p}
                        className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 py-1.5 ps-1.5 pe-3 text-sm font-bold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200"
                      >
                        <Icon3D icon={CheckCircle2} tone="emerald" size="sm" className="size-6 rounded-md" />
                        {PERM_LABELS[p] ?? p}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
            {/* إجازاتي */}
            {hr ? (
              <Card icon={CalendarOff} tone="teal" title="إجازاتي">
                {(() => {
                  const { annualRemaining: rem, annualTotal: total, annualUsed: used } = hr.leaves
                  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
                  const low = total > 0 && rem / total <= 0.2
                  return (
                    <div className="mb-4 rounded-2xl border border-teal-500/25 bg-teal-500/10 px-4 py-4">
                      <div className="flex items-baseline gap-2">
                        <span className={cn('text-5xl font-black tabular-nums leading-none', low ? 'text-rose-600 dark:text-rose-400' : 'text-teal-600 dark:text-teal-400')}>{rem}</span>
                        <span className="text-sm font-extrabold sm:text-[15px]">يوم متبقي</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={used}
                        aria-label="الإجازات المستخدمة من الرصيد السنوي"
                        className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/70 ring-1 ring-inset ring-teal-500/20 dark:bg-slate-800"
                      >
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-l transition-all', low ? 'from-rose-400 to-rose-600' : 'from-teal-400 to-teal-600')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-muted-foreground sm:text-[13px]">
                        استخدمت {used} من {total}
                      </p>
                    </div>
                  )
                })()}
                {hr.leaves.recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground sm:text-[15px]">مفيش إجازات مسجّلة.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {hr.leaves.recent.map((l, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-sm dark:border-slate-800 dark:bg-slate-800/50">
                        <span className="font-extrabold">{LEAVE_TYPES[l.type] ?? l.type}</span>
                        <span className="text-end text-xs font-medium text-muted-foreground sm:text-[13px]">
                          {l.startDate}{l.endDate !== l.startDate ? ` ← ${l.endDate}` : ''}
                          {' · '}{l.hours != null ? `${l.hours} ساعة` : `${l.days} يوم`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
            {hr && showComm ? (
              <Card icon={CalendarCheck} tone="amber" title="حضوري" subtitle={fmtMonth(hr.attendance.month)}>
                <div className="grid grid-cols-2 gap-3.5">
                  <StatTile compact label="أيام حضور" value={String(hr.attendance.present)} icon={CalendarCheck} tone="emerald" />
                  <StatTile
                    compact
                    label="تأخير (دقيقة)"
                    value={String(hr.attendance.lateMinutes)}
                    icon={Clock}
                    tone={hr.attendance.lateMinutes > 0 ? 'amber' : 'slate'}
                  />
                  <StatTile
                    compact
                    label="أيام غياب"
                    value={String(hr.attendance.absent)}
                    icon={CalendarOff}
                    tone={hr.attendance.absent > 0 ? 'rose' : 'slate'}
                  />
                  <StatTile compact label="أيام إجازة" value={String(hr.attendance.leave)} icon={CalendarDays} tone="sky" />
                </div>
              </Card>
            ) : null}
          </div>
        </div>

        {/* ================= قسيمة راتبي — بعرض الصفحة كلها في الآخر ================= */}
        {hr ? (
        <Card
          icon={BadgeDollarSign}
          tone="emerald"
          title="قسيمة راتبي"
          subtitle={hr.payslip
            ? `${fmtMonth(hr.payslip.month)}${hr.payslip.paidAt ? ` · اتصرفت ${fmtWhen(hr.payslip.paidAt)}` : ''}`
            : undefined}
        >
          {hr.payslip ? (
            <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-w-0 flex-col gap-3">
              <dl className="grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2 [&>div]:py-4">
                <InfoRow label="الأساسي المستحق" value={`${fmt(hr.payslip.payableBase)} ج.م`} icon={Wallet} iconTone="sky" />
                {hr.payslip.absenceDeduction > 0 ? (
                  <InfoRow label="خصم الغياب" value={`− ${fmt(hr.payslip.absenceDeduction)}`} icon={CalendarOff} iconTone="rose" tone="rose" />
                ) : null}
                {hr.payslip.lateDeduction > 0 ? (
                  <InfoRow label={`خصم التأخير (${hr.payslip.lateMinutes} دقيقة)`} value={`− ${fmt(hr.payslip.lateDeduction)}`} icon={Clock} iconTone="rose" tone="rose" />
                ) : null}
                {hr.payslip.bonus > 0 ? (
                  <InfoRow label="حوافز" value={`+ ${fmt(hr.payslip.bonus)}`} icon={HandCoins} iconTone="emerald" tone="emerald" />
                ) : null}
                {hr.payslip.penalty > 0 ? (
                  <InfoRow label="جزاءات" value={`− ${fmt(hr.payslip.penalty)}`} icon={CalendarOff} iconTone="rose" tone="rose" />
                ) : null}
                {/* 💰 عمود العمولة — عمولة مبيعات الشهر نزلت على الراتب */}
                {hr.payslip.commission !== 0 ? (
                  <InfoRow
                    label="عمولة المبيعات"
                    value={hr.payslip.commission > 0 ? `+ ${fmt(hr.payslip.commission)}` : `− ${fmt(Math.abs(hr.payslip.commission))}`}
                    icon={Percent}
                    iconTone={hr.payslip.commission > 0 ? 'emerald' : 'rose'}
                    tone={hr.payslip.commission > 0 ? 'emerald' : 'rose'}
                  />
                ) : null}
                {hr.payslip.advanceDeduction > 0 ? (
                  <InfoRow label="قسط السلف" value={`− ${fmt(hr.payslip.advanceDeduction)}`} icon={HandCoins} iconTone="amber" tone="amber" />
                ) : null}
              </dl>
              {hr.payslip.payableBase < hr.baseSalary && hr.hireDate.slice(0, 7) === hr.payslip.month ? (
                <p className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-300 sm:text-[13px]">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    الأساسي المستحق أقل من راتبك الأساسي ({fmt(hr.baseSalary)} ج.م) لأنك اتعيّنت يوم {fmtDay(hr.hireDate)} — بيتحسب من تاريخ التعيين لآخر الشهر.
                  </span>
                </p>
              ) : null}
              </div>

              {/* الصافي — بلوك بارز على جنب */}
              <div className="relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 py-7 text-center text-white shadow-[0_6px_0_rgba(4,120,87,0.55),0_20px_40px_-15px_rgba(16,185,129,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]">
                <div aria-hidden className="absolute -top-16 -right-16 size-48 rounded-full bg-white/20 blur-[50px]" />
                <div aria-hidden className="absolute -bottom-20 -left-16 size-44 rounded-full bg-cyan-200/20 blur-[50px]" />
                <span aria-hidden className="relative grid size-14 place-items-center overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-white/35 to-white/10 shadow-[inset_0_2px_8px_rgba(255,255,255,0.4)] backdrop-blur-md">
                  <BadgeDollarSign className="size-7 drop-shadow-md" strokeWidth={2.1} />
                </span>
                <p className="relative text-base font-bold text-emerald-50">صافي الراتب</p>
                <p className="relative break-words text-5xl font-black tabular-nums leading-none drop-shadow-md">
                  {fmt(hr.payslip.net)}
                </p>
                <p className="relative text-sm font-bold text-emerald-100">جنيه مصري</p>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              مفيش قسيمة معتمدة لسه — هتظهر هنا أول ما المدير يعتمد الرواتب.
            </p>
          )}
        </Card>
        ) : null}
      </div>

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
    </PageWrap>
  )
}
