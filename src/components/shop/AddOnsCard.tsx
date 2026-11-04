'use client'

import * as React from 'react'
import {
  Puzzle,
  CheckCircle2,
  Info,
  Minus,
  Plus,
  ArrowLeft,
  Sparkles,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel, Led, INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { formatNumber } from '@/lib/format'

/**
 * 🧩 2026-11-04 (التحديث 25): AddOnsCard — كارت «إضافات الباقة» في الإعدادات.
 *
 * ده نص الإجابة على سؤال «الإضافة بتتباع إزاي؟»:
 *   - كتالوج ثابت من src/lib/addons.ts + أسعار حقيقية من /api/addons.
 *   - كل إضافة ليها حالة: مشمولة في الباقة (احترافية + HR) / مفعّلة بتاريخ
 *     انتهاء مستقل / غير مفعّلة.
 *   - زر الشراء بيفتح صفحة الدفع نفسها (/checkout?addon=...) وبتدفع عبر
 *     Paymob — بعد التأكيد الـ webhook بيفعّل الإضافة والموديول/الحد الجديد
 *     بيبان في القايمة خلال ثواني (إبطال كاش فوري).
 *   - الإضافة ليها تاريخ انتهاء مستقل عن الاشتراك — التجديد من نفس الكارت.
 *
 * شروط الشراء (متطبقة على السيرفر برضه): اشتراك مدفوع شغّال — مش تجربة.
 */

interface AddOnItem {
  key: string
  name: string
  desc: string
  unitLabel: string
  quantifiable: boolean
  maxQuantity: number
  priceMonthly: number
  priceYearly: number
  included: boolean
  active: boolean
  quantity: number
  endDate: string | null
  daysLeft: number | null
  period: string | null
}

interface AddOnsResponse {
  ok: boolean
  isPlatform?: boolean
  planCode: string | null
  businessType: string
  hasPaidSub: boolean
  subEndDate: string | null
  items: AddOnItem[]
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function AddOnsCard() {
  const role = useShopStore((s) => s.user?.role)
  const [data, setData] = React.useState<AddOnsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [cycle, setCycle] = React.useState<'monthly' | 'yearly'>('monthly')
  // الكمية المختارة لكل إضافة قابلة للتكميم (فروع/مستخدمين)
  const [qty, setQty] = React.useState<Record<string, number>>({})

  const load = React.useCallback(async () => {
    try {
      const d = await api<AddOnsResponse>('/api/addons')
      setData(d)
    } catch {
      // فشل التحميل — الكارت يفضل فاضي بدون كراش
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (role === 'ADMIN') load()
    else setLoading(false)
  }, [role, load])

  if (role !== 'ADMIN') return null
  if (loading) {
    return (
      <Panel tag="05 / Add-ons" title="إضافات الباقة" icon={Puzzle} className="lg:col-span-12" bodyClassName="space-y-3">
        <SkeletonRow />
      </Panel>
    )
  }
  if (!data || data.isPlatform) return null

  const items = data.items ?? []
  if (items.length === 0) return null

  const getQty = (key: string, max: number) => Math.max(1, Math.min(max, qty[key] ?? 1))

  const setQtyFor = (key: string, max: number, next: number) => {
    setQty((m) => ({ ...m, [key]: Math.max(1, Math.min(max, next)) }))
  }

  return (
    <Panel
      tag="05 / Add-ons"
      title="إضافات الباقة"
      hint="زوّد ميزات وحدود باقتك بمقابل — من غير ما تغيّر الباقة كلها. كل إضافة ليها تاريخ انتهاء مستقل بتتجدد من هنا."
      icon={Puzzle}
      className="lg:col-span-12"
      bodyClassName="space-y-4"
      aside={
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {(['monthly', 'yearly'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={
                'rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ' +
                (cycle === c ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {c === 'monthly' ? 'شهري' : 'سنوي'}
            </button>
          ))}
        </div>
      }
    >
      {/* ── شرط الاشتراك المدفوع ── */}
      {!data.hasPaidSub && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            الإضافات بتتفعل مع الاشتراك المدفوع الشغّال — اشترك أو جدّد باقتك الأول من{' '}
            <a href="/pricing" className="font-bold underline underline-offset-2">صفحة الأسعار</a>، وبعدها الكارت ده هيفتح.
          </span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const price = cycle === 'monthly' ? item.priceMonthly : item.priceYearly
          const cycleNote = cycle === 'yearly' ? 'سنوياً — وفّر شهرين' : 'شهرياً'
          const q = item.quantifiable ? getQty(item.key, item.maxQuantity) : 1
          const total = Math.round(price * q * 100) / 100
          const disabled = item.included || !data.hasPaidSub
          const href = `/checkout?addon=${item.key}&qty=${q}&cycle=${cycle}`
          return (
            <div
              key={item.key}
              className={
                'flex flex-col gap-2.5 rounded-xl border p-3.5 transition-colors ' +
                (item.included || item.active
                  ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
                  : 'border-foreground/15 bg-muted/30 hover:border-foreground/30')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold leading-tight">{item.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
                {item.included ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" />
                    مشمولة
                  </span>
                ) : item.active ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <Led tone="on" className="size-1.5 shadow-none" />
                    مفعّلة
                  </span>
                ) : null}
              </div>

              {/* حالة الإضافة النشطة */}
              {item.active && item.endDate && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed border-emerald-500/40 px-2.5 py-1.5 text-[11px]">
                  <CalendarDays className="size-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-muted-foreground">تنتهي</span>
                  <b className="tabular-nums">{fmtDate(item.endDate)}</b>
                  {item.daysLeft != null && (
                    <span className="text-muted-foreground">({formatNumber(item.daysLeft)} يوم)</span>
                  )}
                  {item.quantifiable && item.quantity > 0 && (
                    <span className="ms-auto rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                      +{formatNumber(item.quantity)} {item.unitLabel}
                    </span>
                  )}
                </div>
              )}

              {/* السعر */}
              <div className="mt-auto space-y-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-extrabold tabular-nums">{formatNumber(price)}</span>
                  <span className="text-[10px] text-muted-foreground">جنيه {cycleNote}</span>
                </div>

                {/* الكمية للفروع/المستخدمين */}
                {item.quantifiable && !item.included && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">الكمية ({item.unitLabel})</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 rounded-lg p-0"
                        disabled={disabled || q <= 1}
                        onClick={() => setQtyFor(item.key, item.maxQuantity, q - 1)}
                        aria-label="تقليل الكمية"
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-extrabold tabular-nums">{formatNumber(q)}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 rounded-lg p-0"
                        disabled={disabled || q >= item.maxQuantity}
                        onClick={() => setQtyFor(item.key, item.maxQuantity, q + 1)}
                        aria-label="زيادة الكمية"
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {item.included ? (
                  <Button variant="outline" disabled className={`w-full gap-1.5 rounded-xl ${INK_BTN_OUTLINE}`} size="sm">
                    <CheckCircle2 className="size-3.5" />
                    مشمولة في باقتك الاحترافية
                  </Button>
                ) : (
                  <a
                    href={disabled ? '/pricing' : href}
                    className={
                      'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition-colors ' +
                      (disabled ? INK_BTN_OUTLINE + ' pointer-events-none opacity-50' : INK_BTN)
                    }
                  >
                    <Sparkles className="size-3.5" />
                    {item.active ? `تجديد / زيادة (${formatNumber(total)} جنيه)` : `اشترِ الآن — ${formatNumber(total)} جنيه`}
                    {!disabled && <ArrowLeft className="size-3.5" />}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <span>
          ملاحظة: الإضافة ليها تاريخ انتهاء مستقل عن اشتراك الباقة — التجديد بيتم من الكارت ده في أي وقت،
          والتمديد بيتحسب من تاريخ انتهاء الإضافة الحالي (مش من تاريخ الدفع). بعد الدفع القسم الجديد
          بيظهر في القايمة خلال ثواني.
        </span>
      </p>
    </Panel>
  )
}

function SkeletonRow() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-dashed bg-muted/40" />
      ))}
    </div>
  )
}
