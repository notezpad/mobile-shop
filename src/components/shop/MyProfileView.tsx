'use client'

/**
 * 🪪 2026-11-01 (التحديث الرابع عشر) — شاشة «ملفي» — الصفحة الشخصية للموظف.
 *
 * ملف واحد موحّد لكل موظف عنده حساب دخول — الأقسام بتظهر حسب الموجود فعلاً:
 *   - كارت «النهاردة»: حضورك النهاردة (دخول/انصراف/تأخير) + فواتير البائع.
 *   - كارت «عمولتي» (للبائع — بيجيب نفسه من /api/commissions/my).
 *   - «حضوري»: تقويم الشهر يوم بيوم + ملخص.
 *   - «رواتبي»: قسائم الرواتب المعتمدة (بعد الصرف بس).
 *   - «سلفي» + «إجازاتي» + «تقييماتي».
 *
 * 🛡️ الأرقام كلها من /api/me/profile — السيشن هي الهوية (مفيش اختيار
 * مستخدم)، والحساب غير المربوط بسجل موظف يعرض رسالة إرشادية.
 */

import * as React from 'react'
import {
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  HandCoins,
  Info,
  Loader2,
  RefreshCw,
  UserRound,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { HR_STATUS_LABEL, weekdayOf, daysInMonthOf, type HrStatus } from '@/lib/hr'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MyCommissionCard } from './MyCommissionCard'

/* ─────────────────────── أنواع البيانات ─────────────────────── */

interface TodayAttendance {
  status: string
  checkIn: string | null
  checkOut: string | null
  lateMinutes: number
  note: string | null
}

interface AttendanceRec {
  date: string
  status: string
  checkIn: string | null
  checkOut: string | null
  lateMinutes: number
  note: string | null
}

interface ProfileData {
  linked: boolean
  month: string
  currentMonth: string
  prevMonth: string
  nextMonth?: string
  today: string
  employee?: {
    name: string
    jobTitle: string | null
    baseSalary: number
    hireDate: string | null
    weeklyOffDay: number
    active: boolean
  }
  todayData?: {
    attendance: TodayAttendance | null
    sales: { invoices: number; sales: number; returns: number } | null
  }
  attendanceMonth?: {
    month: string
    summary: { present: number; late: number; absent: number; leave: number; lateMinutesTotal: number }
    records: AttendanceRec[]
  }
  payslips?: {
    month: string
    net: number
    payableBase: number
    absentDays: number
    absenceDeduction: number
    lateMinutes: number
    lateDeduction: number
    bonus: number
    penalty: number
    advanceDeduction: number
    commission: number
    note: string | null
    method: string | null
    paidAt: string | null
  }[]
  advances?: {
    id: number
    amount: number
    installment: number
    remaining: number
    status: string
    method: string
    note: string | null
    createdAt: string | null
  }[]
  leaves?: { id: number; type: string; startDate: string; endDate: string; days: number; hours: number | null; note: string | null }[]
  evaluations?: {
    month: string
    overall: number
    attendanceScore: number
    perfScore: number
    customerScore: number
    teamScore: number
    bonus: number
  }[]
}

/* ─────────────────────── مساعدات العرض ─────────────────────── */

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]
const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return `${MONTH_NAMES[mm - 1] ?? mm} ${y}`
}

function dateLabelAr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return `${d} ${MONTH_NAMES[m - 1] ?? m} ${y}`
}

const PAY_METHOD_LABEL: Record<string, string> = {
  cash: 'كاش',
  vodafone_cash: 'محفظة',
  instapay: 'انستاباي',
  fawry: 'فوري',
  bank: 'بنك',
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: 'إجازة سنوية (مدفوعة)',
  sick: 'إجازة مرضية',
  unpaid: 'إجازة بدون مرتب',
  permission: 'إذن ساعات',
}

/** ألوان حالة الحضور — شارة + نقطة يوم في التقويم */
const STATUS_CHIP: Record<string, string> = {
  present: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  late: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  absent: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  leave: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400',
}
const STATUS_DOT: Record<string, string> = {
  present: 'bg-emerald-500',
  late: 'bg-amber-500',
  absent: 'bg-rose-500',
  leave: 'bg-sky-500',
}

function statusChipCls(status: string): string {
  return STATUS_CHIP[status] ?? 'border-border bg-muted/50 text-muted-foreground'
}
function statusLabel(status: string): string {
  return HR_STATUS_LABEL[status as HrStatus] ?? 'بدون سجل'
}

/** صف «الاسم ........ القيمة» بخط منقّط — نفس نمط الفواتير */
function LedgerRow({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'plus' | 'minus' }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <span aria-hidden className="flex-1 border-b border-dotted border-border" />
      <dd
        className={cn(
          'shrink-0 font-bold tabular-nums',
          tone === 'plus' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'minus' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold">{title}</h2>
          {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

/* ─────────────────────── الشاشة ─────────────────────── */

export function MyProfileView() {
  const [month, setMonth] = React.useState<string>('')
  const [data, setData] = React.useState<ProfileData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(async (m: string, silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const q = m ? `?month=${encodeURIComponent(m)}` : ''
      const r = await api<ProfileData>(`/api/me/profile${q}`)
      setData(r)
      setMonth(r.month)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل ملفك الشخصي')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    void load('')
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const emp = data?.employee
  const att = data?.attendanceMonth
  const recByDate = new Map<string, AttendanceRec>()
  if (att) for (const r of att.records) recByDate.set(r.date, r)

  // ─── الحساب مش مربوط بسجل موظف ───
  if (!data || !data.linked || !emp) {
    return (
      <div className="mx-auto w-full max-w-2xl p-3 sm:p-5" dir="rtl">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </span>
          <h1 className="text-base font-extrabold">حسابك مش مربوط بسجل موظف</h1>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            «ملفي» بيجمّع حضورك وراتبك وسلفك من سجلك كموظف في مسيير الموظفين.
            كلّم المدير عشان يربط حسابك: <b>الموارد البشرية ← الموظفين ← تعديل ← حساب الدخول</b> —
            وبعد كده الصفحة دي هتتعبّى بأرقامك تلقائياً.
          </p>
        </div>
      </div>
    )
  }

  const todayAtt = data?.todayData?.attendance ?? null
  const todaySales = data?.todayData?.sales ?? null
  const days = att ? daysInMonthOf(att.month) : 0
  const firstWeekday = att ? weekdayOf(`${att.month}-01`) : 0
  const isCurrentMonth = att?.month === data.currentMonth
  const todayNum = data.today ? Number(data.today.slice(8, 10)) : 0
  const openAdvances = (data.advances ?? []).filter((v) => v.status === 'open')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-5" dir="rtl">
      {/* ─── الترويسة ─── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
            <UserRound className="size-5 text-primary" />
            ملفي
          </h1>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {emp.name}
            {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
            {emp.hireDate ? ` · موظف منذ ${dateLabelAr(emp.hireDate)}` : ''}
            {' · '}{formatCurrency(emp.baseSalary)} أساسي
          </p>
        </div>
        <Button variant="outline" size="icon" aria-label="تحديث" onClick={() => month && load(month, true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>

      {/* ─── كارت «النهاردة» ─── */}
      <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-bl from-primary/10 via-card to-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CalendarDays className="size-[18px]" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">النهاردة — {dateLabelAr(data.today)}</h2>
              <p className="text-[11px] text-muted-foreground">
                {WEEKDAYS_SHORT[weekdayOf(data.today)]}
                {emp.weeklyOffDay === weekdayOf(data.today) ? ' · يوم راحتك الأسبوعي' : ''}
              </p>
            </div>
          </div>
          {todayAtt ? (
            <span className={cn('rounded-full border px-3 py-1 text-xs font-extrabold', statusChipCls(todayAtt.status))}>
              {statusLabel(todayAtt.status)}
              {todayAtt.status === 'late' && todayAtt.lateMinutes > 0 ? ` · ${todayAtt.lateMinutes} د تأخير` : ''}
            </span>
          ) : (
            <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-bold text-muted-foreground">
              لسه مفيش سجل حضور النهاردة
            </span>
          )}
        </div>
        {(todayAtt?.checkIn || todayAtt?.checkOut) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            {todayAtt.checkIn && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" /> دخول <b className="tabular-nums text-foreground">{todayAtt.checkIn}</b>
              </span>
            )}
            {todayAtt.checkOut && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" /> انصراف <b className="tabular-nums text-foreground">{todayAtt.checkOut}</b>
              </span>
            )}
          </div>
        )}
        {todaySales && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-dashed border-border pt-3 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-foreground/80">
              <HandCoins className="size-3.5 text-amber-600 dark:text-amber-400" />
              مبيعاتك النهاردة:
            </span>
            <span className="tabular-nums">{todaySales.invoices} فاتورة</span>
            <span className="tabular-nums">{formatCurrency(todaySales.sales)}</span>
            {todaySales.returns > 0 && (
              <span className="tabular-nums text-rose-600 dark:text-rose-400">مرتجعات {formatCurrency(todaySales.returns)}</span>
            )}
          </div>
        )}
      </section>

      {/* ─── عمولتي (للبائع — الكارت بيختفي لو مش بائع أو الميزة مقفولة) ─── */}
      <MyCommissionCard />

      {/* ─── حضوري ─── */}
      {att && (
        <SectionCard icon={<CalendarDays className="size-4" />} title="حضوري" desc="يوم بيوم — زي ما اتسجل من المدير أو كشك الحضور">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" aria-label="الشهر السابق" onClick={() => void load(data.prevMonth, true)}>
                <ChevronRight className="size-4" />
              </Button>
              <span className="min-w-24 text-center text-sm font-extrabold">{monthLabel(att.month)}</span>
              <Button
                variant="outline"
                size="icon"
                aria-label="الشهر التالي"
                disabled={att.month >= data.currentMonth}
                onClick={() => void load(data.nextMonth ?? att.month, true)}
              >
                <ChevronLeft className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">حاضر {att.summary.present}</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">متأخر {att.summary.late}</span>
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-400">غائب {att.summary.absent}</span>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-400">إجازة {att.summary.leave}</span>
              {att.summary.lateMinutesTotal > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">تأخير {att.summary.lateMinutesTotal} د</span>
              )}
            </div>
          </div>

          {/* التقويم: أعمدة أيام الأسبوع + شبكة الأيام */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground">
            {WEEKDAYS_SHORT.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const dayNum = i + 1
              const dateStr = `${att.month}-${String(dayNum).padStart(2, '0')}`
              const rec = recByDate.get(dateStr)
              const isToday = isCurrentMonth && dayNum === todayNum
              const isWeeklyOff = emp.weeklyOffDay === weekdayOf(dateStr)
              const future = isCurrentMonth ? dayNum > todayNum : att.month > data.currentMonth
              return (
                <div
                  key={dateStr}
                  title={`${dayNum} ${MONTH_NAMES[Number(att.month.slice(5, 7)) - 1]} — ${rec ? statusLabel(rec.status) : isWeeklyOff ? 'راحة أسبوعية' : 'بدون سجل'}${rec?.checkIn ? ` (دخول ${rec.checkIn})` : ''}`}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 text-[11px] font-bold tabular-nums',
                    rec ? statusChipCls(rec.status) : 'border-border/60 bg-muted/30 text-muted-foreground',
                    future && !rec && 'opacity-40',
                    isToday && 'ring-2 ring-primary/50',
                  )}
                >
                  <span>{dayNum}</span>
                  <span aria-hidden className={cn('size-1.5 rounded-full', rec ? STATUS_DOT[rec.status] : isWeeklyOff ? 'bg-border' : 'bg-transparent')} />
                </div>
              )
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Info className="size-3" />
            الحالة بتتسجل من المدير أو كشك الحضور — لو سجل غلط كلّم المدير يعدّله.
          </p>
        </SectionCard>
      )}

      {/* ─── رواتبي ─── */}
      <SectionCard
        icon={<Wallet className="size-4" />}
        title="رواتبي"
        desc="قسائم الشهور المعتمدة (بعد اعتماد الصرف) — المسودة بتظهر عند المالك بس"
      >
        {(data.payslips?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            لسه مفيش قسايم معتمدة — أول ما المالك يعتمد صرف مرتبك هتلاقي القسيمة هنا بالتفاصيل.
          </p>
        ) : (
          <ul className="space-y-2">
            {(data.payslips ?? []).map((p) => (
              <li key={p.month} className="rounded-xl border bg-background/60">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        <BadgeCheck className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-extrabold">{monthLabel(p.month)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          تم الصرف{p.paidAt ? ` · ${dateLabelAr(p.paidAt)}` : ''}
                          {p.method ? ` · ${PAY_METHOD_LABEL[p.method] ?? p.method}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="text-base font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(p.net)}</p>
                      <p className="text-[10px] font-bold text-muted-foreground">الصافي — اضغط للتفاصيل</p>
                    </div>
                  </summary>
                  <div className="border-t border-dashed border-border px-3 pb-3 pt-2">
                    <dl className="space-y-1.5">
                      <LedgerRow label="الأساسي المستحق" value={formatCurrency(p.payableBase)} />
                      {p.absenceDeduction > 0 && (
                        <LedgerRow label={`خصم غياب (${p.absentDays} يوم)`} value={`− ${formatCurrency(p.absenceDeduction)}`} tone="minus" />
                      )}
                      {p.lateDeduction > 0 && (
                        <LedgerRow label={`خصم تأخير (${p.lateMinutes} دقيقة)`} value={`− ${formatCurrency(p.lateDeduction)}`} tone="minus" />
                      )}
                      {p.bonus > 0 && <LedgerRow label="حافز" value={`+ ${formatCurrency(p.bonus)}`} tone="plus" />}
                      {p.penalty > 0 && <LedgerRow label="جزاء" value={`− ${formatCurrency(p.penalty)}`} tone="minus" />}
                      {p.commission > 0 && <LedgerRow label="عمولة مبيعات" value={`+ ${formatCurrency(p.commission)}`} tone="plus" />}
                      {p.advanceDeduction > 0 && <LedgerRow label="قسط سلفة" value={`− ${formatCurrency(p.advanceDeduction)}`} tone="minus" />}
                      <LedgerRow label="الصافي المصروف" value={formatCurrency(p.net)} />
                    </dl>
                    {p.note && <p className="mt-2 text-[11px] text-muted-foreground">ملاحظة: {p.note}</p>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ─── سلفي ─── */}
      {(data.advances?.length ?? 0) > 0 && (
        <SectionCard icon={<Wallet className="size-4" />} title="سلفي" desc="السلف المسجلة عليك والأقساط المخصومة من المرتب">
          <ul className="space-y-2">
            {(data.advances ?? []).map((v) => {
              const paid = Math.max(0, v.amount - v.remaining)
              const pct = v.amount > 0 ? Math.min(100, Math.round((paid / v.amount) * 100)) : 100
              return (
                <li key={v.id} className="rounded-xl border bg-background/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold tabular-nums">{formatCurrency(v.amount)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {v.createdAt ? `سلفة ${dateLabelAr(v.createdAt)}` : 'سلفة'}
                        {v.note ? ` · ${v.note}` : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold',
                        v.status === 'open'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : v.status === 'settled'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'border-border bg-muted/50 text-muted-foreground',
                      )}
                    >
                      {v.status === 'open' ? 'جارية' : v.status === 'settled' ? 'مسددة' : 'ملغاة'}
                    </span>
                  </div>
                  {v.status === 'open' && (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <span>مسدد {formatCurrency(paid)} · قسط شهري {formatCurrency(v.installment)}</span>
                        <span className="tabular-nums">باقي {formatCurrency(v.remaining)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {openAdvances.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">مفيش سلف جارية عليك — كله مسدد. ✓</p>
          )}
        </SectionCard>
      )}

      {/* ─── إجازاتي ─── */}
      {(data.leaves?.length ?? 0) > 0 && (
        <SectionCard icon={<CalendarDays className="size-4" />} title="إجازاتي" desc="الإجازات والأذونات المسجلة">
          <ul className="space-y-1.5">
            {(data.leaves ?? []).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/60 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-extrabold">{LEAVE_TYPE_LABEL[l.type] ?? l.type}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {dateLabelAr(l.startDate)}
                    {l.endDate !== l.startDate ? ` ← ${dateLabelAr(l.endDate)}` : ''}
                    {l.type === 'permission' && l.hours ? ` · ${l.hours} ساعات` : ''}
                    {l.type !== 'permission' ? ` · ${l.days} يوم` : ''}
                    {l.note ? ` · ${l.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ─── تقييماتي ─── */}
      {(data.evaluations?.length ?? 0) > 0 && (
        <SectionCard icon={<BadgeCheck className="size-4" />} title="تقييماتي" desc="التقييم الشهري من الإدارة — attendance + أداء + عملاء + تعاون">
          <ul className="space-y-2">
            {(data.evaluations ?? []).map((ev) => (
              <li key={ev.month} className="rounded-xl border bg-background/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-extrabold">{monthLabel(ev.month)}</p>
                  <div className="flex items-center gap-2">
                    {ev.bonus > 0 && (
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
                        حافز {formatCurrency(ev.bonus)}
                      </span>
                    )}
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-primary">
                      {Math.round(ev.overall)}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] font-bold text-muted-foreground sm:grid-cols-4">
                  <span className="rounded-lg bg-muted/50 px-2 py-1">حضور {Math.round(ev.attendanceScore)}%</span>
                  <span className="rounded-lg bg-muted/50 px-2 py-1">أداء {ev.perfScore}/5</span>
                  <span className="rounded-lg bg-muted/50 px-2 py-1">عملاء {ev.customerScore}/5</span>
                  <span className="rounded-lg bg-muted/50 px-2 py-1">تعاون {ev.teamScore}/5</span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
