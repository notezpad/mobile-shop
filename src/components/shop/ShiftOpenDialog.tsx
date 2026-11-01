'use client'

/**
 * 🔗 2026-11-01 (التحديث السادس عشر) — دايلوج «فتح الوردية» في نقطة البيع.
 *
 * الفجوة اللي بتحلها: كذا كاشير على نفس الدرج — مين كان ماسك الدرج أول
 * اليوم؟ ولو حصل عجز، مين سببه؟ الفتح بيسجل **جلسة وردية**: الفرع + الوردية
 * + مين فتح + **العهدة الافتتاحية** (اللي عدّاه في الدرج وقت الفتح — اختيارية)،
 * وعند الإغلاق المتوقع بيتحسب على الوردية نفسها بدل رصيد الدرج الكامل.
 *
 * قاعدة ثابتة: وردية مفتوحة واحدة لكل فرع — لو فيه واحدة شغالة الدايلوج
 * بيوريك مين فتحها وإمتى، والفتح بيتقفل لحد ما تتقفل هي.
 *
 * نفس انضباط الإغلاق الأعمي: مفيش أي رقم من النظام راجع للشاشة — العهدة
 * بيدخلها اللي فتح بنفسه، والسيرفر هو اللي بيربط ويحسب.
 */

import * as React from 'react'
import { DoorOpen, Loader2, LockKeyhole, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { detectShiftName, shiftLabel, type BranchShift } from '@/lib/branch-shifts'
import { DecimalInput, DialogHero } from './sale-dialog-ui'

interface OpenSessionInfo {
  id: number
  shiftName: string
  userName: string | null
  openingFloat: number | null
  createdAt: string
}

interface BranchInfo {
  id: number
  name: string
  isMain: boolean
  shifts: BranchShift[]
  openSession: OpenSessionInfo | null
}

const pillBtn =
  'rounded-full border px-3.5 py-2 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-400/50'

export function ShiftOpenDialog({
  open,
  onOpenChange,
  preferredShiftName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** 🕐 (التحديث الحادي والعشرين) وردية الموظف المحددة في HR — بتتقدّم
   *  كاختيار مبدئي بدل الكشف بالساعة لو اتنين مختلفين (اختياري) */
  preferredShiftName?: string | null
}) {
  const [loading, setLoading] = React.useState(false)
  const [branches, setBranches] = React.useState<BranchInfo[]>([])
  const [branchId, setBranchId] = React.useState<number | null>(null)
  const [shiftName, setShiftName] = React.useState<string | null>(null)
  const [openingFloat, setOpeningFloat] = React.useState<number | null>(null)
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inFlight = React.useRef(false)

  // كل مرة يفتح: نبدأ نضيف وننجيب ورديات الفروع + حالة الفتح
  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setBranches([])
    setBranchId(null)
    setShiftName(null)
    setOpeningFloat(null)
    setNote('')
    let alive = true
    api<{ branches: BranchInfo[] }>('/api/shifts/open')
      .then((res) => {
        if (!alive) return
        const bs = Array.isArray(res?.branches) ? res.branches : []
        setBranches(bs)
        const first = bs[0] ?? null
        setBranchId(first?.id ?? null)
        // 🕐 ورديته المحددة في HR أولوية — لو مش موجودة/اتشالت بنرجع للكشف بالساعة
        const detected = first ? detectShiftName(first.shifts) : null
        const preferred =
          preferredShiftName && first?.shifts.some((s) => s.name === preferredShiftName)
            ? preferredShiftName
            : null
        setShiftName(preferred ?? detected)
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
  }, [open, preferredShiftName])

  const branch = branches.find((b) => b.id === branchId) ?? null
  const openSession = branch?.openSession ?? null

  const pickBranch = (id: number) => {
    setBranchId(id)
    setShiftName(detectShiftName(branches.find((b) => b.id === id)?.shifts ?? []))
  }

  const submit = async () => {
    if (inFlight.current || saving) return
    if (!branch) return
    if (openSession) {
      toast.error('فيه وردية مفتوحة بالفعل — اقفلها الأول')
      return
    }
    if (!shiftName) {
      toast.error('اختار الوردية الأول')
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      await api('/api/shifts/open', {
        method: 'POST',
        body: {
          branchId: branch.id,
          shiftName,
          // العهدة اختيارية — الفاضي = السيرفر بيستخدم آخر إغلاق كأساس
          openingFloat: openingFloat != null ? openingFloat : undefined,
          note: note.trim() || undefined,
        },
      })
      toast.success('اتفتحت الوردية ✅ — شغلك على الدرج مسجّل باسمك من دلوقتي')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل فتح الوردية — جرّب تاني')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const fmtWhen = (iso: string) =>
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
          icon={DoorOpen}
          title="فتح الوردية"
          subtitle="سجّل بداية شغلك على الدرج: مين فتح، وأنهي وردية، والعهدة الافتتاحية — عشان الفارق وقت الإغلاق يتحسب على الوردية دي لوحدها."
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

            {/* 🔗 الوردية المفتوحة؟ مفيش فتح تاني قبل ما تتقفل */}
            {openSession ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3">
                <p className="flex items-center gap-2 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                  <LockKeyhole className="size-4" />
                  فيه وردية مفتوحة على الفرع ده دلوقتي
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-200/90">
                  <b className="font-extrabold">{openSession.shiftName}</b>
                  {openSession.userName ? ` — فتحها ${openSession.userName}` : ''} ·{' '}
                  {fmtWhen(openSession.createdAt)}
                  <br />
                  اقفلها الأول من زرار «إغلاق الوردية»، وبعدها تقدر تفتح واحدة جديدة.
                </p>
              </div>
            ) : (
              <>
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
                        onClick={() => setShiftName(s.name)}
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
                </div>

                {/* العهدة الافتتاحية — اختيارية */}
                <div className="space-y-2">
                  <label htmlFor="shift-opening-float" className="text-xs font-bold text-foreground/80">
                    العهدة الافتتاحية — فلوس الدرج دلوقتي (اختياري)
                  </label>
                  <DecimalInput
                    id="shift-opening-float"
                    value={openingFloat ?? 0}
                    onChange={(n) => setOpeningFloat(n > 0 ? n : openingFloat === 0 ? 0 : null)}
                    min={0}
                    suffix="ج.م"
                  />
                  <button
                    type="button"
                    onClick={() => setOpeningFloat(openingFloat === 0 ? null : 0)}
                    aria-pressed={openingFloat === 0}
                    className={cn(pillBtn, openingFloat === 0 ? 'border-emerald-500 bg-emerald-400/15 text-foreground' : 'text-foreground/75')}
                  >
                    {openingFloat === 0 ? '✓ الدرج فاضي (العهدة = 0)' : 'الدرج فاضي (العهدة = 0)'}
                  </button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    عدّ الأوراق والفكة اللي في الدرج دلوقتي واكتب الرقم — ده الأساس اللي هيتحسب عليه شغل الوردية.
                    لو سبتها فاضية، النظام هيستخدم آخر إغلاق مسجّل للفرع كأساس. الأرقام دي بتظهر للمدير بس.
                  </p>
                </div>

                {/* ملاحظة اختيارية */}
                <div className="space-y-1.5">
                  <label htmlFor="shift-open-note" className="text-xs font-bold text-foreground/80">
                    ملاحظة (اختياري)
                  </label>
                  <input
                    id="shift-open-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="مثال: استلمت الدرج من الورديه اللي فاتت"
                    maxLength={200}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-400/30"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={saving || !!openSession || !shiftName}
              className="mt-auto w-full"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <DoorOpen className="size-4" />}
              {openSession ? 'فيه وردية مفتوحة — اقفلها الأول' : 'فتح الوردية'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
