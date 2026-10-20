'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Swatch, normAr } from '@/lib/color-swatch'
import { groupByColor, normalizeDigits } from '@/lib/variant-sort'
import { Pill, STOCK_FIELD, type StockTone } from './stock-dialog-ui'

export interface VariantPickItem {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

const SEARCH_MIN_SIZES = 8

/**
 * اختيار لون/مقاس لحركة المخزون: صف ألوان الأول، وبعدها مقاسات اللون المختار بس (مرتبة رقميًا ثم بالحروف).
 * منتج بلون واحد (أو من غير ألوان) → المقاسات تظهر علطول. بدل ١٥٠ زرار ورا بعض.
 * `dimEmpty`: يخفّت المقاس/اللون اللي كميته صفر (للإخراج والهالك — مفيش حاجة تتخصم منه).
 */
export function VariantPickerSection({
  variants,
  variantId,
  onPick,
  tone,
  dimEmpty,
}: {
  variants: VariantPickItem[]
  variantId: number | null
  onPick: (id: number) => void
  tone: StockTone
  dimEmpty?: boolean
}) {
  const groups = React.useMemo(() => groupByColor(variants), [variants])
  const [color, setColor] = React.useState<string | null>(null)
  const [q, setQ] = React.useState('')

  // منتج تاني / تحميل جديد → نبدأ من الأول
  React.useEffect(() => {
    setColor(null)
    setQ('')
  }, [variants])

  const selected = variantId != null ? variants.find((v) => v.id === variantId) : undefined
  const activeKey =
    groups.length === 1 ? groups[0].color : color ?? (selected ? (selected.color ?? '').trim() : null)
  const active = activeKey == null ? null : groups.find((g) => g.color === activeKey) ?? null

  const showSearch = (active?.items.length ?? 0) > SEARCH_MIN_SIZES
  const sizes = React.useMemo(() => {
    if (!active) return []
    const s = normAr(normalizeDigits(q))
    if (!showSearch || !s) return active.items
    return active.items.filter((v) => normAr(normalizeDigits(v.size ?? '')).includes(s))
  }, [active, q, showSearch])

  const dim = (empty: boolean) => (dimEmpty && empty ? 'opacity-45' : '')

  return (
    <div className="space-y-2.5">
      {groups.length > 1 && (
        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
          {groups.map((g) => (
            <span key={g.color || '_none'} className={dim(g.total <= 0)}>
              <Pill
                tone={tone}
                active={activeKey === g.color}
                onClick={() => {
                  setQ('')
                  setColor(g.color)
                  // لون مالوش مقاسات → يتختار علطول
                  if (g.items.length === 1 && !(g.items[0].size ?? '').trim()) onPick(g.items[0].id)
                }}
              >
                {g.color ? <Swatch name={g.color} className="me-1.5 size-3.5" /> : null}
                {g.color || 'بدون لون'} · {g.total}
              </Pill>
            </span>
          ))}
        </div>
      )}

      {active ? (
        <>
          {showSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/50" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالمقاس…"
                aria-label="بحث بالمقاس"
                className={cn(STOCK_FIELD, 'h-10 ps-9')}
              />
            </div>
          )}
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
            {sizes.map((v) => (
              <span key={v.id} className={dim(v.quantity <= 0)}>
                <Pill tone={tone} active={variantId === v.id} onClick={() => onPick(v.id)}>
                  {v.size || v.color || `#${v.id}`} · {v.quantity}
                </Pill>
              </span>
            ))}
            {sizes.length === 0 && <p className="py-1 text-xs font-medium text-foreground/60">مفيش نتائج</p>}
          </div>
        </>
      ) : (
        <p className="text-xs font-medium text-foreground/60">اختار اللون الأول وهتظهرلك مقاساته.</p>
      )}
    </div>
  )
}
