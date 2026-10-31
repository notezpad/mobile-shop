'use client'

/**
 * 💰 2026-11-01 (التحديث الثالث عشر) — شاشة «عمولات البائعين».
 *
 * تقرير شهري لكل بائع: عدد الفواتير، المبيعات، المرتجعات، الصافي، النسبة،
 * التارجت (لو موجود)، العمولة المستحقة، وحالة التسوية — مع زر «صرف»
 * يسجل التسوية النهائية (لقطة مغلقة مينفعش تتصرّف تاني).
 *
 * 🛡️ كل الأرقام بتتيجي من /api/commissions/report (بتتحسب على السيرفر من
 * سجلات المبيعات والمرتجعات نفسها) — والصرف عبر /api/commissions/payout
 * (أدمن بس على السيرفر، قيد فريد لكل بائع/شهر).
 * الصرف هنا **سجل تسوية** — مش حركة خزنة (الفلوس ممكن تتدفع برا النظام
 * أو مع الراتب).
 */

import * as React from 'react'
import {
  AlertTriangle,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Info,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MyCommissionCard } from './MyCommissionCard'

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

export function CommissionsView() {
  const user = useShopStore((s) => s.user)
  const isAdmin = useShopStore((s) => s.user?.role === 'ADMIN' || s.user?.role === 'SUPER_ADMIN')
  // 💰 وضع «عمولتي»: بائع مقيد بقائمة صلاحيات من غير 'commissions' —
  // مش هنادّي تقرير المحل خالص (السيرفر بيرد 403 عليه) — بنعرض أرقامه هو بس
  // من /api/commissions/my. (نفس شرط sellerOnlyMode في السايدبار.)
  const sellerOnly =
    !isAdmin &&
    user?.isSeller === true &&
    !!user.permissions && user.permissions.length > 0 &&
    !user.permissions.includes('commissions')
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
    // 💰 وضع «عمولتي» — مفيش تقرير محل يتندّى (الـ API هيرد 403)
    if (sellerOnly) return
    // أول تحميل: الشهر الحالي — الـ API بيرجّع الشهر الصحيح بتوقيت المحل لو فاضية
    void load('')
  }, [load, sellerOnly])

  const goMonth = (m: string) => {
    if (!m) return
    void load(m)
  }

  // 💰 وضع «عمولتي» — صفحة البائع الشخصية: أرقامه هو بس (قبل فحص loading
  // عشان التقرير عمره ما يتندّى في الوضع ده)
  if (sellerOnly) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-3 sm:p-5" dir="rtl">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
            <HandCoins className="size-5 text-amber-600 dark:text-amber-400" />
            عمولتي
          </h1>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            عمولتك على مبيعاتك أنت — بتتحسب على السيرفر من فواتيرك (المرتجع بيخصم بالعكس)،
            والتسوية الشهرية بيقوم بيها مالك المحل.
          </p>
        </div>
        <MyCommissionCard />
        <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            الأرقام بتتحدّث مع كل فاتورة بتتسجل في نقطة البيع — والعمولة النهائية بتتقفل
            لما المالك يصرفها (منفصلة أو مع الراتب) وساعتها بتشوف بشارة التأكيد بالقيمة المصروفة.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const enabled = data?.enabled === true
  const sellers = data?.sellers ?? []
  const totals = data?.totals

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5" dir="rtl">
      {/* الترويسة + تنقّل الشهور */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-extrabold sm:text-xl">
            <HandCoins className="size-5 text-amber-600 dark:text-amber-400" />
            عمولات البائعين
          </h1>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            نسبة عمولة شهرية لكل بائع على مبيعاته (المرتجع بيخصم بالعكس) — الحساب على السيرفر
            من الفواتير نفسها.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" aria-label="الشهر السابق" onClick={() => goMonth(data?.prevMonth ?? '')}>
            <ChevronRight className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-extrabold tabular-nums">
            {month ? monthLabel(month) : '—'}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="الشهر التالي"
            disabled={!data || data.month >= data.currentMonth}
            onClick={() => goMonth(data?.nextMonth ?? '')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="تحديث" onClick={() => month && load(month, true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      {/* الميزة مقفولة */}
      {!enabled && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-extrabold">ميزة عمولات البائعين متوقفة</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              فعّلها من <b>الإعدادات ← عمولات البائعين</b> (حدّد النسبة العامة ثم فعّل المفتاح)،
              وعلّم «بائع» على الموظفين من شاشة المستخدمين.
            </p>
          </div>
        </div>
      )}

      {/* إجماليات الشهر */}
      {enabled && totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-[11px] font-bold text-muted-foreground">فواتير البائعين</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{totals.invoices}</p>
          </div>
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-[11px] font-bold text-muted-foreground">مبيعات</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{formatCurrency(totals.salesTotal)}</p>
          </div>
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-[11px] font-bold text-muted-foreground">مرتجعات</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-rose-600 dark:text-rose-400">
              {formatCurrency(totals.returnsTotal)}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-[11px] font-bold text-muted-foreground">عمولات مستحقة</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totals.commission)}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl border bg-card p-3 sm:col-span-1">
            <p className="text-[11px] font-bold text-muted-foreground">تم صرفه</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{formatCurrency(totals.paidAmount)}</p>
          </div>
        </div>
      )}

      {/* جدول البائعين */}
      {enabled && (
        sellers.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            مفيش بائعين لسه — علّم «بائع» على الموظفين من شاشة المستخدمين، ومع أول فاتورة
            بإسناد بائع هتلاقي أرقامهم هنا.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 text-start font-bold">البائع</th>
                    <th className="px-3 py-2.5 text-center font-bold">فواتير</th>
                    <th className="px-3 py-2.5 text-end font-bold">مبيعات</th>
                    <th className="px-3 py-2.5 text-end font-bold">مرتجعات</th>
                    <th className="px-3 py-2.5 text-end font-bold">الصافي</th>
                    <th className="px-3 py-2.5 text-center font-bold">النسبة</th>
                    <th className="px-3 py-2.5 text-end font-bold">التارجت</th>
                    <th className="px-3 py-2.5 text-end font-bold">العمولة</th>
                    <th className="px-3 py-2.5 text-center font-bold">الحالة</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((s) => {
                    const paid = !!s.payout
                    const disabled = paid || !s.targetMet || (s.commission === 0)
                    const targetPct = s.target && s.target > 0 ? Math.min(100, Math.round((s.netBase / s.target) * 100)) : null
                    return (
                      <tr key={s.userId} className="border-b last:border-b-0">
                        <td className="px-3 py-2.5">
                          <p className="font-extrabold">{s.name}</p>
                          {!s.active && <span className="text-[10px] font-bold text-rose-500">موقوف</span>}
                          {!s.isSeller && <span className="ms-1 text-[10px] font-bold text-muted-foreground">(مش معلّم بائع)</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{s.invoices}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatCurrency(s.salesTotal)}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-rose-600 dark:text-rose-400">
                          {s.returnsTotal > 0 ? `-${formatCurrency(s.returnsTotal)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-end font-bold tabular-nums">{formatCurrency(s.netBase)}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{s.rate != null ? `${s.rate}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-end">
                          {s.target != null ? (
                            <div className="min-w-24">
                              <p className={cn('text-xs font-bold tabular-nums', s.targetMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                                {targetPct}%
                              </p>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn('h-full rounded-full', s.targetMet ? 'bg-emerald-500' : 'bg-amber-500')}
                                  style={{ width: `${targetPct}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={cn('px-3 py-2.5 text-end font-extrabold tabular-nums', s.commission < 0 && 'text-rose-600 dark:text-rose-400')}>
                          {formatCurrency(s.commission)}
                          {!s.targetMet && (
                            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">ما حققش التارجت</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {paid ? (
                            <Badge variant="outline" className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              <Lock className="size-3" />
                              {s.payout!.viaPayroll ? 'مع الراتب' : 'تم الصرف'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {isAdmin && !paid && (
                            <Button
                              size="sm"
                              className="min-w-20"
                              disabled={disabled}
                              onClick={() => setPayTarget(s)}
                            >
                              صرف
                            </Button>
                          )}
                          {isAdmin && paid && (
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              {formatCurrency(s.payout!.amount)}
                              {s.payout!.method ? ` · ${PAYOUT_METHODS.find((m) => m.id === s.payout!.method)?.label ?? s.payout!.method}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
  )
}

/* ─────────────── دايلوج الصرف ─────────────── */

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
      <DialogContent className="max-w-md" dir="rtl">
        <div className="space-y-4 p-1">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold">
              <BadgeDollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
              صرف عمولة {target.name} — {monthLabel}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              بتسجل لقطة نهائية مغلقة: الأرقام بتتحسب لحظة التأكيد، والشهر بيتقفل للبائع ده
              (مستحيل يتصرّف تاني).
            </p>
          </div>

          <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">فواتير</span><b className="tabular-nums">{target.invoices}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">مبيعات</span><b className="tabular-nums">{formatCurrency(target.salesTotal)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">مرتجعات</span><b className="tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(target.returnsTotal)}</b></div>
            <div className="flex justify-between border-t pt-1.5"><span className="text-muted-foreground">الصافي</span><b className="tabular-nums">{formatCurrency(target.netBase)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">النسبة</span><b className="tabular-nums">{target.rate != null ? `${target.rate}%` : '—'}</b></div>
            <div className="flex justify-between border-t pt-1.5 text-base"><span className="font-bold">العمولة</span><b className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(target.commission)}</b></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">إضافات / خصومات (+/-)</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={adjustments}
                onChange={(e) => setAdjustments(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">وسيلة الصرف</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">ملاحظة (إجبارية مع الخصم)</Label>
            <Textarea
              rows={2}
              placeholder="مثال: سلفة على العمولة 500 ج..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
            <span className="text-sm font-bold">الصافي المصروف</span>
            <span className={cn('text-xl font-extrabold tabular-nums', finalAmount < 0 && 'text-rose-600 dark:text-rose-400')}>
              {formatCurrency(finalAmount)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
            <Button onClick={submit} disabled={saving} className="min-w-28">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
              تأكيد الصرف
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
