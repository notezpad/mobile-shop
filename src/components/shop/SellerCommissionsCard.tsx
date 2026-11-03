'use client'

/**
 * 💰 2026-11-01 (التحديث الثالث عشر) — كارت «عمولات البائعين» في الإعدادات.
 *
 * صاحب المحل هو المتحكم الأول والأخير:
 *  - مفتاح تشغيل/إيقاف الميزة كلها (متوقفة افتراضياً).
 *  - النسبة العامة (%) — لكل بائع استثناء من شاشة المستخدمين.
 *  - التارجت الشهري العام (اختياري) — البائع اللي ما يحققوش ما ياخدش عمولة
 *    الشهر، واللي يحققه بياخد العمولة على مبيعات الشهر كلها.
 *
 * 🛡️ الحساب كله على السيرفر — الإعدادات دي بتتحفظ في Tenant عبر PUT /api/tenant
 * بنفس تحقق normalizeCommissionSettings الصارم.
 * البائع بيتم تعليمه من «المستخدمين» (علم «بائع») — شوف UsersView.
 */

import * as React from 'react'
import { Check, HandCoins, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export function SellerCommissionsCard() {
  const [loading, setLoading] = React.useState(true)
  const [enabled, setEnabled] = React.useState(false)
  const [rate, setRate] = React.useState('')
  const [target, setTarget] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    api<{
      sellerCommissionsEnabled?: boolean
      sellerCommissionRate?: number | null
      sellerCommissionTarget?: number | null
    }>('/api/tenant')
      .then((t) => {
        if (!alive) return
        setEnabled(t?.sellerCommissionsEnabled === true)
        setRate(t?.sellerCommissionRate != null ? String(t.sellerCommissionRate) : '')
        setTarget(t?.sellerCommissionTarget != null ? String(t.sellerCommissionTarget) : '')
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    if (saving) return
    const rateNum = rate.trim() === '' ? null : Number(rate)
    const targetNum = target.trim() === '' ? null : Number(target)
    if (enabled && (rateNum == null || !Number.isFinite(rateNum) || rateNum <= 0)) {
      toast.error('لازم تحدد النسبة العامة قبل التفعيل (مثال: 3 يعني 3%)')
      return
    }
    setSaving(true)
    try {
      await api('/api/tenant', {
        method: 'PUT',
        body: {
          sellerCommissionsEnabled: enabled,
          sellerCommissionRate: rateNum,
          sellerCommissionTarget: targetNum,
        },
      })
      toast.success(
        enabled
          ? 'عمولات البائعين مفعّلة — خانة «البائع» ظهرت في نقطة البيع'
          : 'عمولات البائعين متوقفة — خانة البائع اختفت من نقطة البيع',
      )
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="عمولات البائعين">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <HandCoins className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold sm:text-base">عمولات البائعين — نسبة على المبيعات</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            نسبة عمولة لكل بائع على فواتيره — منفصلة تماماً عن الكاشير. بتتحسب أوتوماتيك على
            السيرفر، والمرتجع بيخصم بالعكس، والتسوية شهرياً من شاشة «عمولات البائعين» أو جوه
            مسلوب الرواتب.
          </p>
        </div>
      </header>

      <div className="space-y-3.5">
        {/* المفتاح العام */}
        <div className="flex items-start justify-between gap-3 rounded-xl border bg-background p-3.5">
          <div className="min-w-0">
            <p className="text-sm font-extrabold">تفعيل عمولات البائعين</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {enabled
                ? 'مفعّلة: الكاشير بيختار البائع مع كل فاتورة — والأرقام بتتحسب على السيرفر.'
                : 'متوقفة: مفيش خانة بائع في نقطة البيع، ومفيش أي عمولة بتتحسب.'}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="تفعيل عمولات البائعين" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="seller-rate" className="text-xs font-bold">
              النسبة العامة (%) <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="seller-rate"
              type="number"
              min="0"
              max="100"
              step="0.25"
              inputMode="decimal"
              placeholder="مثال: 3 يعني 3%"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              dir="ltr"
              className="text-left"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              إجبارية عند التفعيل. لكل بائع ممكن استثناء من شاشة المستخدمين.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seller-target" className="text-xs font-bold">
              التارجت الشهري العام (اختياري)
            </Label>
            <Input
              id="seller-target"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="مثال: 100000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              dir="ltr"
              className="text-left"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              البائع اللي ما يحققش التارجت (على الصافي بعد المرتجعات) ما ياخدش عمولة الشهر.
              اتركه فاضي = بدون تارجت.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-foreground/70">
          <b>خطوات التفعيل:</b> حدّد النسبة ← فعّل المفتاح ← احفظ ← من شاشة «المستخدمين» علّم
          «بائع» على الموظفين المستحقين (مع نسبة/تارجت استثناء لو حبيت). الكاشير هيلاقي خانة
          «البائع» في شاشة الدفع، وأنت بتتابع وتصرف من شاشة «عمولات البائعين».
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="min-w-28">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            حفظ الإعدادات
          </Button>
        </div>
      </div>
    </section>
  )
}
