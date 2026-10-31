'use client'

/**
 * 🕐 2026-10-31 (التحديث الثامن) — كارت «ورديات المحل» في الإعدادات.
 *
 * للفرع الواحد: صفحة الفروع مش ظاهرة أصلاً (مربوطة بالباقة)، فالمدير بظبط
 * ورديات المحل من هنا بنفس محرر صفحة الفروع. عند أكتر من فرع: بنورّحه
 * لصفحة الفروع (عشان يظبط كل فرع لوحده هناك).
 *
 * 🫥 (التحديث الحادي عشر): مفتاح «الجرد الأعمى للخزينة» — صاحب المحل هو اللي
 * بيقرر: مفعّل (افتراضي) = الكاشير يعدّ الدرج من غير ما يشوف المتوقع؛
 * متوقّف = الوضع التقليدي (المتوقع ظاهر والحقل متعبّي + تأكيد).
 * الحساب والفارق على السيرفر في الوضعين.
 *
 * البيانات بتتيجي من GET /api/shifts/close (شغالة حتى لو موديول الفروع
 * مش في الباقة) والحفظ عبر PATCH /api/branches/[id]، والمفتاح عبر PUT /api/tenant.
 */

import * as React from 'react'
import { Check, Clock, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { shiftLabel, type BranchShift } from '@/lib/branch-shifts'
import { BranchShiftsEditor } from './BranchShiftsEditor'

interface BranchInfo {
  id: number
  name: string
  isMain: boolean
  shifts: BranchShift[]
}

export function ShiftSettingsCard() {
  const [loading, setLoading] = React.useState(true)
  const [branches, setBranches] = React.useState<BranchInfo[]>([])
  const [shifts, setShifts] = React.useState<BranchShift[]>([])
  const [saving, setSaving] = React.useState(false)
  // 🫥 مفتاح المالك: الجرد الأعمى للخزينة (افتراضي: مفعّل)
  const [blindCash, setBlindCash] = React.useState(true)
  const [togglingBlind, setTogglingBlind] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api<{ branches: BranchInfo[] }>('/api/shifts/close').catch(() => null),
      api<{ blindCashEnabled?: boolean }>('/api/tenant').catch(() => null),
    ])
      .then(([shiftsRes, tenantRes]) => {
        if (!alive) return
        const bs = Array.isArray(shiftsRes?.branches) ? shiftsRes.branches : []
        setBranches(bs)
        setShifts(bs[0]?.shifts ?? [])
        if (tenantRes && typeof tenantRes.blindCashEnabled === 'boolean') {
          setBlindCash(tenantRes.blindCashEnabled)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    const b = branches[0]
    if (!b || saving) return
    setSaving(true)
    try {
      await api(`/api/branches/${b.id}`, { method: 'PATCH', body: { shifts } })
      toast.success('تم حفظ ورديات المحل')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // 🫥 تبديل مفتاح الجرد الأعمى للخزينة — حفظ فوري في إعدادات المحل
  const toggleBlindCash = async (on: boolean) => {
    if (togglingBlind) return
    const prev = blindCash
    setBlindCash(on)
    setTogglingBlind(true)
    try {
      await api('/api/tenant', { method: 'PUT', body: { blindCashEnabled: on } })
      toast.success(
        on
          ? 'الجرد الأعمى للخزينة مفعّل — الكاشير يعدّ من غير ما يشوف المتوقع'
          : 'اترجع للوضع التقليدي — الكاشير بيشوف المتوقع ويأكد عليه',
      )
    } catch (e: any) {
      setBlindCash(prev)
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setTogglingBlind(false)
    }
  }

  if (loading || branches.length === 0) return null

  const multi = branches.length > 1

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="ورديات المحل">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          <Clock className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold sm:text-base">ورديات المحل — إغلاق الوردية</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            حدد ورديات المحل، والكاشير اللي معاه صلاحية «إغلاق الوردية» هيلاقي زرار في نقطة
            البيع يقفل بيه الوردية — والفارق (عجز/زيادة) يظهرلك في صفحة الخزنة.
          </p>
        </div>
      </header>

      {/* 🫥 مفتاح المالك: الجرد الأعمى للخزينة */}
      <div className="mb-4 rounded-xl border bg-background p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-extrabold">
              {blindCash ? <EyeOff className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Eye className="size-4 text-sky-600 dark:text-sky-400" />}
              الجرد الأعمى للخزينة
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {blindCash
                ? 'مفعّل: الكاشير يعدّ الدرج من غير ما يشوف المبلغ المتوقع — ويكتب اللي عدّاه بس، والفارق يظهرلك انت.'
                : 'متوقّف (الوضع التقليدي): الكاشير بيشوف المبلغ المتوقع في الدرج والحقل متعبّي بيه — ويضغط تأكيد بس.'}
            </p>
          </div>
          <Switch
            checked={blindCash}
            onCheckedChange={(v) => void toggleBlindCash(v)}
            disabled={togglingBlind}
            aria-label="تفعيل الجرد الأعمى للخزينة"
          />
        </div>
      </div>

      {multi ? (
        <div className="space-y-2">
          <p className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-xs font-medium leading-relaxed text-foreground/70">
            عندك أكتر من فرع — ظبّط ورديات كل فرع من صفحة «الفروع» (من نافذة تعديل الفرع).
          </p>
          <ul className="space-y-1.5">
            {branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-xs">
                <span className="min-w-0 truncate font-bold">
                  {b.name}
                  {b.isMain && <span className="ms-1.5 text-[10px] font-bold text-muted-foreground">(الرئيسي)</span>}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {b.shifts.length > 0
                    ? b.shifts.map((s) => shiftLabel(s)).join(' · ')
                    : 'من غير ورديات — الميزة متوقفة'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <BranchShiftsEditor shifts={shifts} onChange={setShifts} />
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="min-w-28">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              حفظ الورديات
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
