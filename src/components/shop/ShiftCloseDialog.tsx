'use client'

/**
 * 🕐 2026-10-31 (التحديث الثامن) — دايلوج «إغلاق الوردية» في نقطة البيع.
 *
 * الجرد الأعمى (Blind Count): الكاشير بيكتب اللي عدّاه في الدرج بس —
 * الشاشة ما بتوريهاش «المتوقع» ولا أي رقم من النظام، والسيرفر هو اللي
 * بيحسب الفارق ويسجله باسمه. الرد «تم» بس — حتى رسالة النجاح مفيهاش أرقام.
 *
 * 🫥 (التحديث الحادي عشر): مفتاح المالك «الجرد الأعمى للخزينة» — لما صاحب
 * المحل يقفله، الدايلوج يرجع للوضع التقليدي: المتوقع ظاهر والحقل متعبّي
 * بيه وزرار تأكيد. الحساب والفارق فضلوا على السيرفر في الوضعين — المفتاح
 * بيغير العرض للكاشير بس.
 *
 * الوردية بتتحدد تلقائياً من ساعة الجهاز حسب ورديات الفرع (وقدامه يغيّرها)،
 * والمدير بيقدر يختار الفرع لو عنده أكتر من واحد. الفرع اللي من غير ورديات
 * = رسالة إن الميزة مش مفعّلة ليه.
 */

import * as React from 'react'
import { Loader2, LockKeyhole, RotateCcw, Eye } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { detectShiftName, shiftLabel, type BranchShift } from '@/lib/branch-shifts'
import { DecimalInput, DialogHero } from './sale-dialog-ui'

interface BranchInfo {
  id: number
  name: string
  isMain: boolean
  shifts: BranchShift[]
  lastClosure: { shiftName: string | null; userName: string | null; createdAt: string } | null
  // 🫥 الوضع التقليدي بس (مفتاح الجرد الأعمى متوقّف) — المتوقع في الدرج
  expectedCash?: number
}

const pillBtn =
  'rounded-full border px-3.5 py-2 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-400/50'

export function ShiftCloseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [loading, setLoading] = React.useState(false)
  const [branches, setBranches] = React.useState<BranchInfo[]>([])
  const [branchId, setBranchId] = React.useState<number | null>(null)
  const [shiftName, setShiftName] = React.useState<string | null>(null)
  const [counted, setCounted] = React.useState(0)
  const [note, setNote] = React.useState('')
  const [zeroArmed, setZeroArmed] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // 🫥 مفتاح المالك — بييجي من الـ GET (افتراضي: أعمي = الوضع الحالي)
  const [blindCash, setBlindCash] = React.useState(true)
  const inFlight = React.useRef(false)

  // كل مرة يفتح: نبدأ نضيف وننجيب ورديات الفرع/الفروع
  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setBranches([])
    setBranchId(null)
    setShiftName(null)
    setCounted(0)
    setNote('')
    setZeroArmed(false)
    let alive = true
    api<{ branches: BranchInfo[]; blindCash?: boolean }>('/api/shifts/close')
      .then((res) => {
        if (!alive) return
        const bs = Array.isArray(res?.branches) ? res.branches : []
        const bc = res?.blindCash !== false
        setBlindCash(bc)
        setBranches(bs)
        const first = bs[0] ?? null
        setBranchId(first?.id ?? null)
        setShiftName(first ? detectShiftName(first.shifts) : null)
        // 🫥 الوضع التقليدي: الحقل متعبّي بالمترقب من الأول
        if (!bc && first && typeof first.expectedCash === 'number') setCounted(first.expectedCash)
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'حصل خطأ — جرّب تاني')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open])

  const branch = branches.find((b) => b.id === branchId) ?? null

  const pickBranch = (id: number) => {
    setBranchId(id)
    setShiftName(detectShiftName(branches.find((b) => b.id === id)?.shifts ?? []))
    setZeroArmed(false)
    // 🫥 الوضع التقليدي: تعبئة الحقل بمتوقع الفرع الجديد
    if (!blindCash) {
      const b = branches.find((x) => x.id === id)
      if (b && typeof b.expectedCash === 'number') setCounted(b.expectedCash)
    }
  }

  const submit = async () => {
    if (inFlight.current || saving) return
    if (!branch || !shiftName) {
      toast.error('اختار الوردية الأول')
      return
    }
    if (counted <= 0 && !zeroArmed) {
      // الدرج فاضي؟ ممكن تكون حقيقية — بس مش بالغلط
      setZeroArmed(true)
      toast.warning('الدرج فاضي؟ دوس «تسجيل الإغلاق» تاني للتأكيد')
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      await api('/api/shifts/close', {
        method: 'POST',
        body: { branchId: branch.id, shiftName, counted, note: note.trim() || undefined },
      })
      // 🛡️ عمداً من غير أي أرقام — الجرد الأعمى
      toast.success('تم تسجيل إغلاق الوردية ✅')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل الإغلاق — جرّب تاني')
      inFlight.current = false
    } finally {
      setSaving(false)
    }
  }

  const fmtLast = (iso: string) =>
    new Date(iso).toLocaleString('ar-EG', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={blindCash ? LockKeyhole : Eye}
          title="إغلاق الوردية"
          subtitle={
            blindCash
              ? 'عدّ الفلوس اللي في الدرج دلوقتي واكتبها — من غير ما تشوف أي رقم من النظام. الفارق بيتسجل للمدير.'
              : 'الوضع التقليدي: المترقب في الدرج ظاهر تحت — راجعه أو عدّ بنفسك واكتب اللي لقيته، والفارق بيتسجل للمدير.'
          }
        />

        {loading ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
              {error}
            </p>
          </div>
        ) : !branch ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <RotateCcw className="size-6 text-muted-foreground" />
            <p className="text-sm font-bold">مفيش فرع مرتبط بحسابك</p>
            <p className="text-xs text-muted-foreground">كلم المدير يظبط فرعك من شاشة المستخدمين</p>
          </div>
        ) : branch.shifts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <LockKeyhole className="size-6 text-muted-foreground" />
            <p className="text-sm font-bold">الفرع ده مفيش ورديات معرفة</p>
            <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
              المدير يضيف ورديات الفرع من صفحة الفروع (أو من الإعدادات في المحل الفرع الواحد) — وبعدها الزرار ده هيشتغل.
            </p>
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {/* اختيار الفرع (للمدير مع أكتر من فرع) */}
            {branches.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-foreground/80">الفرع</p>
                <div className="flex flex-wrap gap-2">
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => pickBranch(b.id)}
                      aria-pressed={branchId === b.id}
                      className={cn(
                        pillBtn,
                        branchId === b.id
                          ? 'border-emerald-500 bg-emerald-400/15 text-foreground'
                          : 'text-foreground/75'
                      )}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* اختيار الوردية — متحددة تلقائياً من الساعة */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground/80">الوردية</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الوردية">
                {branch.shifts.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    role="radio"
                    aria-checked={shiftName === s.name}
                    onClick={() => {
                      setShiftName(s.name)
                      setZeroArmed(false)
                    }}
                    className={cn(
                      pillBtn,
                      shiftName === s.name
                        ? 'border-emerald-500 bg-emerald-400/15 text-foreground'
                        : 'text-foreground/75'
                    )}
                  >
                    {shiftLabel(s)}
                  </button>
                ))}
              </div>
              {branch.lastClosure && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  آخر إغلاق للفرع ده:{' '}
                  <b className="font-bold text-foreground/70">
                    {branch.lastClosure.shiftName ?? '—'}
                  </b>{' '}
                  · {fmtLast(branch.lastClosure.createdAt)}
                  {branch.lastClosure.userName ? ` · ${branch.lastClosure.userName}` : ''}
                </p>
              )}
            </div>

            {/* 🫥 الوضع التقليدي (مفتاح المالك متوقّف): المتوقع ظاهر في صندوق مستقل */}
            {!blindCash && branch && typeof branch.expectedCash === 'number' && (
              <div className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-300">
                  <Eye className="size-4" />
                  المتوقع في الدرج (حسب النظام)
                </span>
                <b dir="ltr" className="font-mono text-lg font-black tabular-nums text-sky-700 dark:text-sky-300">
                  {branch.expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </b>
              </div>
            )}

            {/* الجرد الأعمى — الحقل الوحيد */}
            <div className="space-y-2">
              <label htmlFor="shift-counted" className="text-xs font-bold text-foreground/80">
                المبلغ النقدي الموجود في الدرج دلوقتي
              </label>
              <DecimalInput
                id="shift-counted"
                value={counted}
                onChange={(n) => {
                  setCounted(n)
                  setZeroArmed(false)
                }}
                min={0}
                suffix="ج.م"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {blindCash
                  ? 'عدّ الأوراق والفكة اللي في الدرج واكتب الرقم زي ما هو — متخمّنش ولا تخمّن. النظام مش هيقولك المتوقع كام، والفارق بيتسجل باسمك عند المدير.'
                  : 'الحقل متعبّي بالمترقب — عدّ الدرج بنفسك، ولو الرقم مختلف اكتب اللي لقيته بالظبط. الفارق بيتحسب على السيرفر وبيتسجل للمدير.'}
              </p>
            </div>

            {/* ملاحظة اختيارية */}
            <div className="space-y-1.5">
              <label htmlFor="shift-note" className="text-xs font-bold text-foreground/80">
                ملاحظة (اختياري)
              </label>
              <input
                id="shift-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: فيه فكة من وردية أمس"
                maxLength={200}
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-400/30"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={saving || !shiftName}
              className="mt-auto w-full"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
              تسجيل الإغلاق
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
