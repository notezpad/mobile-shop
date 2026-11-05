'use client'

import * as React from 'react'
import { ArrowRight, Search, Shirt } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { INK_BTN_OUTLINE } from './settings-ui'
import { INK_RING, InkInput } from './product-dialog-ui'
import { DialogHero } from './sale-dialog-ui'
import { Swatch, normAr } from '@/lib/color-swatch'
import { groupByColor, normalizeDigits } from '@/lib/variant-sort'
import { KIND_META, detectElectronicsKind } from '@/lib/electronics-variants'
import { CONDITION_LABEL } from '@/lib/variant-condition'

export interface PickerVariantLite {
  id: number
  size: string | null
  color: string | null
  quantity: number
  /** 💰 التحديث 28: سعر المواصفة — null = سعر المنتج العام */
  price?: number | null
  /** 📱 التحديث 30: حالة الجهاز (new/used/null) */
  condition?: string | null
}

const LOW = 3
const SEARCH_MIN_SIZES = 8

/**
 * 📱 التحديث 28: في محلات الإلكترونيات (موبايلات/كمبيوتر) الخانتين بتتعرض
 * باسم «المواصفة 1 / المواصفة 2» بدل اللون/المقاس — نفس الترتيب والسلوك حرفيًا.
 */
const NO_COLOR = 'بدون لون'
const NO_OPTION_ELECTRONICS = 'بدون مواصفة'

/**
 * اختيار اللون/المقاس (أو المواصفات) في نقطة البيع — خطوتين:
 *   ١ اللون (عينة اللون + إجمالي المتاح)  ←  ٢ مقاسات اللون ده بس (مرتبة رقميًا ثم بالحروف).
 * • منتج بلون واحد أو من غير ألوان → يفتح على المقاسات علطول.
 * • لون من غير مقاسات → الضغط عليه يختاره علطول.
 * • اللون/المقاس اللي خلص: باهت ومتعطل.
 * • البحث بالمقاس بيظهر بس لو اللون فيه أكتر من ٨ مقاسات.
 * • 💰 التحديث 28: كل خيار بيعرض سعره الفعلي (سعر المواصفة أو سعر المنتج لو فاضي).
 * `selectedId` (اختياري) بيفتح الدايلوج على مقاسات لون المتغير الحالي (لتغيير المتغير من السلة).
 */
export function POSVariantPickerDialog({
  open,
  onOpenChange,
  productName,
  variants,
  onPick,
  selectedId = null,
  productPrice,
  isElectronics = false,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  productName?: string
  variants: PickerVariantLite[]
  onPick: (v: PickerVariantLite) => void
  selectedId?: number | null
  /** سعر المنتج العام — بنعرضه على الخيارات اللي ملهاش سعر خاص. */
  productPrice?: number | null
  /** 📱 عرض الخانتين باسم «المواصفة 1/2» وإخفاء عينات الألوان. */
  isElectronics?: boolean
}) {
  const groups = React.useMemo(() => groupByColor(variants), [variants])
  const singleGroup = groups.length === 1

  // 📱 التحديث 30: أسماء الخانتين بتتحدد من نوع الجهاز (موبايل: السعة ← اللون / لابتوب: الكونفيج ← اللون)
  const kindMeta = isElectronics ? KIND_META[detectElectronicsKind(productName)] : null
  const noOpt1Label = kindMeta ? kindMeta.noOpt1 : NO_COLOR
  const step1Title = kindMeta ? `اختار ${kindMeta.opt1}` : 'اختار اللون'
  const step2Title = kindMeta ? `اختار ${kindMeta.opt2}` : 'اختار المقاس'
  const chip1 = kindMeta ? `١ ${kindMeta.opt1}` : '١ اللون'
  const chip2 = kindMeta ? `٢ ${kindMeta.opt2}` : '٢ المقاس'
  // «جديد» بيظهر على الخيارات بس لو في المنتج نسخة مستعملة (عشان التفرقة)، والمستعمل بيظهر دايمًا
  const hasUsed = variants.some((x) => x.condition === 'used')

  /** السعر الفعلي المعروض على الخيار: سعر المواصفة، وإلا سعر المنتج. */
  const effPrice = (v: PickerVariantLite): number | null =>
    v.price ?? (productPrice ?? null)

  // null = خطوة الألوان، غير كده = مفتاح اللون المختار ('' = من غير لون)
  const [picked, setPicked] = React.useState<string | null>(null)
  const [q, setQ] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setQ('')
    const sel = selectedId != null ? variants.find((v) => v.id === selectedId) : undefined
    setPicked(sel ? (sel.color ?? '').trim() : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const activeKey = singleGroup ? groups[0].color : picked
  const active = activeKey == null ? null : groups.find((g) => g.color === activeKey) ?? null
  const canGoBack = !singleGroup && active != null

  const pickColor = (color: string) => {
    const g = groups.find((x) => x.color === color)
    if (!g) return
    // لون من غير مقاسات → يتضاف علطول
    if (g.items.length === 1 && !(g.items[0].size ?? '').trim()) {
      if (g.items[0].quantity > 0) onPick(g.items[0])
      return
    }
    setQ('')
    setPicked(color)
  }

  const sizeCount = active?.items.length ?? 0
  const showSearch = sizeCount > SEARCH_MIN_SIZES
  const sizeList = React.useMemo(() => {
    if (!active) return []
    const s = normAr(normalizeDigits(q))
    if (!showSearch || !s) return active.items
    return active.items.filter((v) => normAr(normalizeDigits(v.size ?? '')).includes(s))
  }, [active, q, showSearch])

  /** لو كل خيارات المجموعة بنفس السعر الفعلي نعرضه على كارت اللون، وإلا بنسيبه للخطوة التانية. */
  const groupPrice = (g: { items: PickerVariantLite[] }): number | null => {
    const prices = g.items.filter((v) => v.quantity > 0).map((v) => effPrice(v))
    if (prices.length === 0) return null
    const first = prices[0]
    if (first == null) return null
    return prices.every((p) => p != null && Math.abs((p ?? 0) - first) < 0.005) ? first : null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={Shirt}
          title={active ? step2Title : step1Title}
          chip={singleGroup ? undefined : active ? chip2 : chip1}
          subtitle={productName}
        />
        <DialogBody className="space-y-3">
          {variants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {isElectronics ? 'لا توجد مواصفات مسجلة لهذا المنتج' : 'لا يوجد ألوان/مقاسات مسجلة لهذا المنتج'}
            </p>
          ) : !active ? (
            /* ───── الخطوة ١: الألوان (المواصفة 1) ───── */
            <ul className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pb-1">
              {groups.map((g) => {
                const out = g.total <= 0
                const low = !out && g.total <= LOW
                const gPrice = out ? null : groupPrice(g)
                return (
                  <li key={g.color || '_none'}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => pickColor(g.color)}
                      className={cn(
                        'flex w-full flex-col items-start gap-1.5 rounded-2xl border bg-background px-3 py-3 text-start transition-colors',
                        INK_RING,
                        out
                          ? 'cursor-not-allowed opacity-45'
                          : 'hover:border-foreground hover:bg-muted/60 active:scale-[0.98]'
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        {g.color && !isElectronics ? <Swatch name={g.color} className="size-5" /> : null}
                        <span className="truncate text-sm font-extrabold leading-tight">{g.color || noOpt1Label}</span>
                      </span>
                      <span
                        className={cn(
                          'whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                          out
                            ? 'bg-danger-subtle text-danger-subtle-foreground'
                            : low
                              ? 'bg-warning-subtle text-warning-subtle-foreground'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {out ? 'نفد' : low ? `باقي ${g.total}` : `متاح ${g.total}`}
                      </span>
                      {gPrice != null && (
                        <span className="text-[11px] font-bold tabular-nums text-foreground/70">
                          {formatCurrency(gPrice)}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            /* ───── الخطوة ٢: مقاسات اللون (المواصفة 2) ───── */
            <>
              <div className="flex items-center gap-2">
                {canGoBack && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQ('')
                      setPicked(null)
                    }}
                    className={cn('h-9 shrink-0 gap-1 rounded-xl px-3 text-xs font-bold', INK_BTN_OUTLINE)}
                    aria-label={isElectronics ? 'رجوع للمواصفات' : 'رجوع للألوان'}
                  >
                    <ArrowRight className="size-3.5" aria-hidden />
                    {isElectronics ? 'المواصفات' : 'الألوان'}
                  </Button>
                )}
                {active.color ? (
                  <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold">
                    {!isElectronics ? <Swatch name={active.color} className="size-5" /> : null}
                    <span className="truncate">{active.color}</span>
                  </span>
                ) : null}
                <span className="ms-auto whitespace-nowrap text-xs font-semibold tabular-nums text-foreground/65">
                  {sizeCount} {kindMeta ? kindMeta.opt2Unit : 'مقاس'} · متاح {active.total}
                </span>
              </div>

              {showSearch && (
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/50" />
                  <InkInput
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={isElectronics ? 'ابحث بالمواصفة…' : 'ابحث بالمقاس…'}
                    aria-label={isElectronics ? 'بحث بالمواصفة' : 'بحث بالمقاس'}
                    className="ps-9"
                  />
                </div>
              )}

              {sizeList.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">مفيش نتائج</p>
              ) : (
                <ul className="grid max-h-[22rem] grid-cols-3 gap-2 overflow-y-auto overscroll-contain pb-1">
                  {sizeList.map((v) => {
                    const out = v.quantity <= 0
                    const low = !out && v.quantity <= LOW
                    const isCurrent = v.id === selectedId
                    const vPrice = out ? null : effPrice(v)
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          disabled={out}
                          onClick={() => onPick(v)}
                          aria-label={`${v.size ?? v.color ?? `#${v.id}`}${v.condition === 'used' ? ' مستعمل' : ''} ${out ? 'نفد' : `متاح ${v.quantity}`}${vPrice != null ? ` — ${formatCurrency(vPrice)}` : ''}`}
                          className={cn(
                            'flex w-full flex-col items-center gap-1 rounded-2xl border bg-background px-2 py-3 text-center transition-colors',
                            INK_RING,
                            isCurrent && 'border-foreground ring-2 ring-foreground/30',
                            out
                              ? 'cursor-not-allowed opacity-45'
                              : 'hover:border-foreground hover:bg-muted/60 active:scale-[0.98]'
                          )}
                        >
                          <span className="text-base font-extrabold leading-tight">
                            {v.size || v.color || `#${v.id}`}
                          </span>
                          {(v.condition === 'used' || (hasUsed && v.condition === 'new')) && (
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[11px] font-extrabold',
                                v.condition === 'used' ? 'bg-warning-subtle text-warning-subtle-foreground' : 'bg-success-subtle text-success-subtle-foreground'
                              )}
                            >
                              {CONDITION_LABEL[v.condition as 'new' | 'used']}
                            </span>
                          )}
                          <span
                            className={cn(
                              'whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                              out
                                ? 'bg-danger-subtle text-danger-subtle-foreground'
                                : low
                                  ? 'bg-warning-subtle text-warning-subtle-foreground'
                                  : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {out ? 'نفد' : low ? `باقي ${v.quantity}` : `متاح ${v.quantity}`}
                          </span>
                          {vPrice != null && (
                            <span className="text-[11px] font-bold tabular-nums text-foreground/70">
                              {formatCurrency(vPrice)}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button variant="outline" className={cn('h-11 rounded-xl', INK_BTN_OUTLINE)} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
