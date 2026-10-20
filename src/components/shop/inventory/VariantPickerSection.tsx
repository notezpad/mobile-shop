'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Swatch, normAr } from '@/lib/color-swatch'
import { groupByColor, normalizeDigits } from '@/lib/variant-sort'
import { TONE, STOCK_FIELD, STOCK_RING, type StockTone } from './stock-dialog-ui'

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
    <div className="space-y-3">
      {groups.length > 1 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-foreground/65">١) اختار اللون</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
            {groups.map((g) => {
              const on = activeKey === g.color
              return (
                <button
                  key={g.color || '_none'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setQ('')
                    setColor(g.color)
                    // لون مالوش مقاسات → يتختار علطول
                    if (g.items.length === 1 && !(g.items[0].size ?? '').trim()) onPick(g.items[0].id)
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-start transition-colors',
                    STOCK_RING,
                    dim(g.total <= 0),
                    on ? cn('border-transparent', TONE[tone].btn) : 'bg-background hover:bg-muted'
                  )}
                >
                  {g.color ? <Swatch name={g.color} className="size-4" /> : null}
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs font-extrabold">{g.color || 'بدون لون'}</span>
                    <span className={cn('text-[10px] font-semibold tabular-nums', on ? 'opacity-85' : 'text-foreground/60')}>
                      {g.total} قطعة
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {active ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/65">
              {groups.length > 1 ? '٢) اختار المقاس' : 'اختار المقاس'}
              {active.color ? (
                <span className="flex items-center gap-1 text-foreground/80">
                  — <Swatch name={active.color} className="size-3.5" /> {active.color}
                </span>
              ) : null}
            </p>
            <span className="text-[10px] font-semibold tabular-nums text-foreground/55">
              {active.items.length} مقاس · {active.total} قطعة
            </span>
          </div>

          {showSearch && (
            <div className="relative mb-2">
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

          <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-4">
            {sizes.map((v) => {
              const on = variantId === v.id
              const empty = v.quantity <= 0
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(v.id)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-center transition-colors',
                    STOCK_RING,
                    dim(empty),
                    on ? cn('border-transparent', TONE[tone].btn) : 'bg-background hover:bg-muted'
                  )}
                >
                  <span className={cn('text-[10px] font-semibold', on ? 'opacity-85' : 'text-foreground/55')}>مقاس</span>
                  <span className="text-base font-extrabold leading-none">{v.size || v.color || `#${v.id}`}</span>
                  <span
                    className={cn(
                      'mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                      on ? 'bg-white/20' : empty ? 'bg-danger-subtle text-danger-subtle-foreground' : 'bg-muted text-foreground/70'
                    )}
                  >
                    {empty ? 'نفد' : `متاح ${v.quantity}`}
                  </span>
                </button>
              )
            })}
            {sizes.length === 0 && <p className="col-span-full py-1 text-xs font-medium text-foreground/60">مفيش نتائج</p>}
          </div>
        </div>
      ) : (
        <p className="text-xs font-medium text-foreground/60">اختار اللون الأول وهتظهرلك مقاساته.</p>
      )}
    </div>
  )
}
