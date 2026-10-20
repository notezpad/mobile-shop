'use client'

import * as React from 'react'
import { ArrowRight, Search, Shirt } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Swatch } from '@/lib/color-swatch'
import { compareSizes } from '@/lib/variant-sort'
import { INK_BTN_OUTLINE } from './settings-ui'
import { INK_RING, InkInput } from './product-dialog-ui'
import { DialogHero } from './sale-dialog-ui'

export interface PickerVariantLite {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

const LOW = 3

function labelOf(v: PickerVariantLite) {
  return [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
}

interface ColorGroup {
  key: string
  color: string
  variants: PickerVariantLite[]
  total: number
}

function QtyBadge({ qty }: { qty: number }) {
  const out = qty <= 0
  const low = !out && qty <= LOW
  return (
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
      {out ? 'نفد' : low ? `باقي ${qty}` : `متاح ${qty}`}
    </span>
  )
}

/**
 * اختيار اللون/المقاس في نقطة البيع على خطوتين:
 *  ١ اللون (يتخطى لو المنتج له لون واحد أو من غير ألوان) ← ٢ المقاس (الضغط عليه يضيفه للسلة).
 */
export function POSVariantPickerDialog({
  open,
  onOpenChange,
  productName,
  variants,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  productName?: string
  variants: PickerVariantLite[]
  onPick: (v: PickerVariantLite) => void
}) {
  const [q, setQ] = React.useState('')
  const [colorKey, setColorKey] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (open) {
      setQ('')
      setColorKey(null)
    }
  }, [open])

  const groups = React.useMemo<ColorGroup[]>(() => {
    const map = new Map<string, ColorGroup>()
    for (const v of variants) {
      const key = (v.color ?? '').trim()
      let g = map.get(key)
      if (!g) {
        g = { key, color: key, variants: [], total: 0 }
        map.set(key, g)
      }
      g.variants.push(v)
      g.total += Math.max(0, v.quantity)
    }
    return Array.from(map.values())
  }, [variants])

  const skipColorStep = groups.length <= 1
  const activeKey = skipColorStep ? (groups[0]?.key ?? null) : colorKey
  const activeGroup = groups.find((g) => g.key === activeKey) ?? null
  const step: 1 | 2 = activeGroup ? 2 : 1

  const sizeList = React.useMemo(() => {
    if (!activeGroup) return []
    const sorted = [...activeGroup.variants].sort(compareSizes)
    const s = q.trim().toLowerCase()
    return s ? sorted.filter((v) => (v.size ?? '').toLowerCase().includes(s)) : sorted
  }, [activeGroup, q])

  const pickColor = (g: ColorGroup) => {
    // لون من غير مقاسات: الضغط عليه يضيف المتغير مباشرة
    if (g.variants.length === 1 && !g.variants[0].size) {
      if (g.variants[0].quantity > 0) onPick(g.variants[0])
      return
    }
    setQ('')
    setColorKey(g.key)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={Shirt}
          title={step === 1 ? 'اختار اللون' : 'اختار المقاس'}
          chip={skipColorStep ? undefined : step === 1 ? '١ اللون' : '٢ المقاس'}
          subtitle={productName}
        />
        <DialogBody className="space-y-3">
          {variants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا يوجد ألوان/مقاسات مسجلة لهذا المنتج
            </p>
          ) : step === 1 ? (
            <ul className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pb-1 sm:grid-cols-3">
              {groups.map((g) => {
                const out = g.total <= 0
                return (
                  <li key={g.key || 'none'}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => pickColor(g)}
                      className={cn(
                        'flex w-full flex-col items-start gap-2 rounded-2xl border bg-background px-3 py-3 text-start transition-colors',
                        INK_RING,
                        out
                          ? 'cursor-not-allowed opacity-45'
                          : 'hover:border-foreground hover:bg-muted/60 active:scale-[0.98]'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Swatch name={g.color} className="size-5" />
                        <span className="text-sm font-extrabold leading-tight">{g.color || 'بدون لون'}</span>
                      </span>
                      <QtyBadge qty={g.total} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <>
              {!skipColorStep && activeGroup && (
                <button
                  type="button"
                  onClick={() => {
                    setQ('')
                    setColorKey(null)
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-bold transition-colors hover:bg-muted/60',
                    INK_RING
                  )}
                >
                  <ArrowRight className="size-4" />
                  <Swatch name={activeGroup.color} className="size-4" />
                  {activeGroup.color || 'بدون لون'}
                </button>
              )}
              {activeGroup && activeGroup.variants.length > 8 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/50" />
                  <InkInput
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ابحث بالمقاس…"
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
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          disabled={out}
                          onClick={() => onPick(v)}
                          aria-label={labelOf(v)}
                          className={cn(
                            'flex w-full flex-col items-center gap-1.5 rounded-2xl border bg-background px-2 py-3 transition-colors',
                            INK_RING,
                            out
                              ? 'cursor-not-allowed opacity-45'
                              : 'hover:border-foreground hover:bg-muted/60 active:scale-[0.98]'
                          )}
                        >
                          <span className="text-base font-extrabold leading-tight tabular-nums">
                            {v.size || labelOf(v)}
                          </span>
                          <QtyBadge qty={v.quantity} />
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
