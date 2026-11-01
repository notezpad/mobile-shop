'use client'

/**
 * 💰 2026-11-01 (التحديث الثالث عشر) — شاشة «عمولات البائعين».
 *
 * تقرير شهري لكل بائع: عدد الفواتير، المبيعات، المرتجعات، الصافي، النسبة،
 * التارجت (لو موجود)، العمولة المستحقة، وحالة التسوية — مع زر «صرف»
 * يسجل التسوية النهائية (لقطة مغلقة مينفعش تتصرّف تاني).
 */

import * as React from 'react'
import {
  AlertTriangle, BadgeDollarSign, ChevronLeft, ChevronRight, HandCoins,
  Loader2, Lock, RefreshCw, Trophy, Target, TrendingUp, Receipt, User, UserRound,
  Wallet, ArrowDownRight, CheckCircle2, FileText
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface SellerRow {
  userId: string
  name: string
  active: boolean
  isSeller: boolean
  rate: number | null
  target: number | null
  invoices: number
  salesTotal: number
  returnsCount: number
  returnsTotal: number
  netBase: number
  commission: number
  targetMet: boolean
  payout: {
    amount: number
    adjustments: number
    viaPayroll: boolean
    method: string | null
    note: string | null
    paidAt: string
  } | null
}

interface ReportData {
  month: string
  currentMonth: string
  prevMonth: string
  nextMonth: string
  enabled: boolean
  sellers: SellerRow[]
  totals: {
    invoices: number
    salesTotal: number
    returnsTotal: number
    netBase: number
    commission: number
    paidAmount: number
  }
}

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return `${MONTH_NAMES[mm - 1] ?? mm} ${y}`
}

const PAYOUT_METHODS = [
  { id: 'cash', label: 'كاش' },
  { id: 'vodafone_cash', label: 'محفظة' },
  { id: 'instapay', label: 'انستاباي' },
  { id: 'with_salary', label: 'مع الراتب' },
]

const AVATAR_THEMES = [
  'from-emerald-400 to-emerald-600 shadow-emerald-500/30',
  'from-teal-400 to-teal-600 shadow-teal-500/30',
  'from-amber-400 to-amber-600 shadow-amber-500/30',
  'from-blue-400 to-blue-600 shadow-blue-500/30',
]

const isFemaleName = (name: string) => {
  const n = name.trim();
  if (!n) return false;
  if (/[ةى]$/.test(n) || /[اء]$/.test(n)) return true;
  const femaleNames = ['مريم', 'سارة', 'نور', 'هند', 'زينب', 'رنا', 'ريم', 'لينا', 'جنى', 'حبيبة', 'ملك', 'ياسمين', 'دينا', 'نهى', 'منى', 'سلمى', 'ليلى', 'شروق', 'أمل', 'إيمان', 'هدى', 'رؤى', 'آية', 'إسراء', 'هبة', 'شيماء', 'بسمة', 'عبير', 'سماح', 'نادية', 'نرمين', 'سمر', 'رغد', 'رهف', 'جواهر', 'فاطمة', 'عائشة', 'خديجة'];
  return femaleNames.some(fn => n.includes(fn));
};

export function CommissionsView() {
  const isAdmin = useShopStore((s) => s.user?.role === 'ADMIN' || s.user?.role === 'SUPER_ADMIN')
  const [month, setMonth] = React.useState<string>('')
  const [currentMonth, setCurrentMonth] = React.useState<string>('')
  const [data, setData] = React.useState<ReportData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [payTarget, setPayTarget] = React.useState<SellerRow | null>(null)

  const load = React.useCallback(async (m: string, silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const r = await api<ReportData>(`/api/commissions/report?month=${encodeURIComponent(m)}`)
      setData(r)
      setMonth(r.month)
      setCurrentMonth(r.currentMonth)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل تقرير العمولات')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    void load('')
  }, [load])

  const goMonth = (m: string) => {
    if (!m) return
    void load(m)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="size-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const enabled = data?.enabled === true
  const sellers = data?.sellers ?? []
  const totals = data?.totals

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو (زمردي وذهبي 3D) ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-950 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-amber-500/20 blur-[100px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-emerald-500/20 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <Trophy className="size-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-200">تقرير المبيعات</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">
                عمولات <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500">البائعين</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                نسبة عمولة شهرية لكل بائع على مبيعاته (المرتجع بيخصم بالعكس) — الحساب على السيرفر من الفواتير نفسها.
              </p>
            </div>

            <div className="z-10 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
                <Button variant="ghost" size="icon" onClick={() => goMonth(data?.prevMonth ?? '')} className="text-white hover:bg-white/20 hover:text-white rounded-xl">
                  <ChevronRight className="size-4" />
                </Button>
                <span className="min-w-[100px] text-center text-sm font-black tracking-wide">
                  {month ? monthLabel(month) : '—'}
                </span>
                <Button
                  variant="ghost" size="icon" disabled={!data || data.month >= data.currentMonth}
                  onClick={() => goMonth(data?.nextMonth ?? '')} className="text-white hover:bg-white/20 hover:text-white rounded-xl disabled:opacity-30"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="w-px h-6 bg-white/20 mx-1" />
                <Button variant="ghost" size="icon" onClick={() => month && load(month, true)} disabled={refreshing} className="text-white hover:bg-white/20 hover:text-white rounded-xl">
                  {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* الميزة مقفولة */}
        {!enabled && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-50/80 p-4 shadow-sm" dir="rtl">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="font-extrabold text-amber-900 text-sm">ميزة عمولات البائعين متوقفة</p>
              <p className="mt-1 text-xs text-amber-700/80 leading-relaxed">
                فعّلها من <b>الإعدادات ← عمولات البائعين</b> (حدّد النسبة العامة ثم فعّل المفتاح)،
                وعلّم «بائع» على الموظفين من شاشة المستخدمين.
              </p>
            </div>
          </div>
        )}

        {/* ================= إجماليات الشهر (Bento) ================= */}
        {enabled && totals && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" dir="rtl">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-500/30">
                <Receipt className="size-5 drop-shadow-sm" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500">فواتير البائعين</span>
                <span className="text-lg font-black mt-0.5">{totals.invoices}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30">
                <TrendingUp className="size-5 drop-shadow-sm" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500">إجمالي المبيعات</span>
                <span className="text-lg font-black mt-0.5 text-emerald-600">{formatCurrency(totals.salesTotal)}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/30">
                <ArrowDownRight className="size-5 drop-shadow-sm" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500">المرتجعات</span>
                <span className="text-lg font-black mt-0.5 text-rose-600">{formatCurrency(totals.returnsTotal)}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center gap-4 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-900">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/30">
                <HandCoins className="size-5 drop-shadow-sm" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-500">عمولات مستحقة</span>
                <span className="text-lg font-black mt-0.5 text-amber-600">{formatCurrency(totals.commission)}</span>
              </div>
            </div>
            <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-slate-900 to-black rounded-2xl border border-slate-800 p-4 shadow-lg flex items-center gap-4 text-white">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-900 shadow-md bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/30">
                <Wallet className="size-5 drop-shadow-sm" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-slate-400">تم صرفه</span>
                <span className="text-lg font-black mt-0.5 text-white">{formatCurrency(totals.paidAmount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= كروت البائعين (Grid of Cards) ================= */}
        {enabled && (
          sellers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm py-16 px-4 text-center" dir="rtl">
              <div className="mx-auto size-20 rounded-3xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-6 shadow-inner">
                <User className="size-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-200">مفيش بائعين لسه</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">علّم «بائع» على الموظفين من شاشة المستخدمين، ومع أول فاتورة بإسناد بائع هتلاقي أرقامهم هنا.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5" dir="rtl">
              {sellers.map((s, index) => {
                const paid = !!s.payout
                const disabled = paid || !s.targetMet || (s.commission === 0)
                const targetPct = s.target && s.target > 0 ? Math.min(100, Math.round((s.netBase / s.target) * 100)) : null
                const isFemale = isFemaleName(s.name)
                const theme = AVATAR_THEMES[index % AVATAR_THEMES.length]

                return (
                  <div key={s.userId} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col transition-all hover:shadow-md hover:-translate-y-1">
                    
                    {/* الرأس: الأفاتار والاسم */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md", theme)}>
                          {isFemale ? <UserRound className="size-6 drop-shadow-sm" /> : <User className="size-6 drop-shadow-sm" />}
                        </span>
                        <div>
                          <span className="font-black text-lg text-slate-800 dark:text-slate-100 block">{s.name}</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            {s.rate != null && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">نسبة {s.rate}%</span>}
                            {!s.active && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">موقوف</span>}
                            {!s.isSeller && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">مش بائع</span>}
                          </div>
                        </div>
                      </div>
                      
                      {paid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <Lock className="size-3" /> مصروف
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                          جاري
                        </span>
                      )}
                    </div>

                    {/* التارجت */}
                    {s.target != null && (
                      <div className="mb-4 bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><Target className="size-3" /> التارجت</span>
                          <span className={cn('text-xs font-bold', s.targetMet ? 'text-emerald-600' : 'text-amber-600')}>{targetPct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className={cn('h-full rounded-full', s.targetMet ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${Math.max(2, targetPct ?? 0)}%` }} />
                        </div>
                      </div>
                    )}

                    {/* البيانات المالية */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-500">المبيعات</span>
                        <span className="font-black text-xs text-slate-800 dark:text-slate-200">{formatCurrency(s.salesTotal)}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-500">المرتجعات</span>
                        <span className="font-bold text-xs text-rose-600">{s.returnsTotal > 0 ? `-${formatCurrency(s.returnsTotal)}` : '—'}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col justify-between col-span-2">
                        <span className="text-[10px] font-bold text-slate-500">الصافي (بعد المرتجع)</span>
                        <span className="font-black text-sm text-slate-800 dark:text-slate-200">{formatCurrency(s.netBase)}</span>
                      </div>
                    </div>

                    {/* العمولة والزرار */}
                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-500 mb-1">العمولة المستحقة</span>
                        <span className={cn("text-xl font-black tabular-nums", s.commission < 0 ? "text-rose-600" : "text-amber-500")}>
                          {formatCurrency(s.commission)}
                        </span>
                      </div>

                      {isAdmin && !paid && (
                        <Button
                          onClick={() => setPayTarget(s)}
                          disabled={disabled}
                          className={cn(
                            "h-10 px-5 gap-1.5 font-bold shadow-[0_4px_0_rgb(4,120,87)] hover:translate-y-[2px] hover:shadow-none transition-all",
                            disabled ? "bg-slate-100 text-slate-400 shadow-none hover:translate-y-0" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                          )}
                        >
                          <HandCoins className="size-4" /> صرف
                        </Button>
                      )}
                      {paid && (
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 block mb-0.5">تم صرفها</span>
                          <span className="text-xs font-bold text-emerald-600">{formatCurrency(s.payout!.amount)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        <PayoutDialog
          target={payTarget}
          month={month}
          monthLabel={month ? monthLabel(month) : ''}
          onClose={() => setPayTarget(null)}
          onDone={() => {
            setPayTarget(null)
            if (month) void load(month, true)
          }}
        />
      </div>
    </div>
  )
}

/* ─────────────── دايلوج الصرف (Premium Receipt Style) ─────────────── */

function PayoutDialog({
  target,
  month,
  monthLabel,
  onClose,
  onDone,
}: {
  target: SellerRow | null
  month: string
  monthLabel: string
  onClose: () => void
  onDone: () => void
}) {
  const [adjustments, setAdjustments] = React.useState('')
  const [method, setMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (target) {
      setAdjustments('')
      setMethod('cash')
      setNote('')
    }
  }, [target])

  if (!target) return null

  const adjNum = adjustments.trim() === '' ? 0 : Number(adjustments)
  const finalAmount = Math.round(((target.commission || 0) + (Number.isFinite(adjNum) ? adjNum : 0)) * 100) / 100

  const submit = async () => {
    if (saving) return
    if (finalAmount < 0 && !note.trim()) {
      toast.error('الخصم لازم له سبب — اكتب ملاحظة')
      return
    }
    setSaving(true)
    try {
      await api('/api/commissions/payout', {
        method: 'POST',
        body: {
          userId: target.userId,
          month,
          adjustments: Number.isFinite(adjNum) ? adjNum : 0,
          method,
          note: note.trim() || null,
        },
      })
      toast.success(`تم تسجيل صرف عمولة ${target.name} عن ${monthLabel}`)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل الصرف')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
        <div className="shrink-0 border-b px-4 pb-4 pt-6 sm:px-6 sm:pt-5 bg-emerald-50 dark:bg-emerald-950/20">
          <h2 className="flex items-center gap-2 text-lg font-black text-emerald-900 dark:text-emerald-100">
            <span className="grid size-8 place-items-center rounded-xl bg-emerald-600 text-white shadow-md">
              <BadgeDollarSign className="size-4" />
            </span>
            صرف عمولة {target.name}
          </h2>
          <p className="mt-1.5 text-xs text-emerald-700/80 font-semibold leading-relaxed">
            {monthLabel} — بتسجل لقطة نهائية مغلقة: الأرقام بتتحسب لحظة التأكيد، والشهر بيتقفل للبائع ده.
          </p>
        </div>

        <div className="space-y-4 py-5 px-4 sm:px-6">
          {/* ملخص الفاتورة */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 shadow-inner text-sm">
            <div className="flex justify-between"><span className="text-slate-500 font-semibold">فواتير</span><b className="tabular-nums">{target.invoices}</b></div>
            <div className="flex justify-between"><span className="text-slate-500 font-semibold">مبيعات</span><b className="tabular-nums">{formatCurrency(target.salesTotal)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500 font-semibold">مرتجعات</span><b className="tabular-nums text-rose-600">{formatCurrency(target.returnsTotal)}</b></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><span className="text-slate-500 font-semibold">الصافي</span><b className="tabular-nums">{formatCurrency(target.netBase)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500 font-semibold">النسبة</span><b className="tabular-nums">{target.rate != null ? `${target.rate}%` : '—'}</b></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span className="font-bold text-slate-700">العمولة</span><b className="tabular-nums text-emerald-600">{formatCurrency(target.commission)}</b></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">إضافات / خصومات (+/-)</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={adjustments}
                onChange={(e) => setAdjustments(e.target.value)}
                dir="ltr"
                className="text-left shadow-inner font-bold h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">وسيلة الصرف</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="shadow-inner h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-600">ملاحظة (إجبارية مع الخصم)</Label>
            <Textarea
              rows={2}
              placeholder="مثال: سلفة على العمولة 500 ج..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="shadow-inner text-sm"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-50 p-3.5 shadow-sm">
            <span className="text-sm font-black text-emerald-900">الصافي المصروف</span>
            <span className={cn('text-xl font-black tabular-nums', finalAmount < 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {formatCurrency(finalAmount)}
            </span>
          </div>
        </div>

        <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-10">إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5 h-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_0_rgb(4,120,87)] hover:translate-y-[2px] hover:shadow-none transition-all font-bold px-6">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
            تأكيد الصرف
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}