'use client'

import { cn } from '@/lib/utils'
import { variantLabelOf } from '@/lib/pos/totals'
import type { PosVariant } from '@/lib/pos/types'

interface Props {
  variants: PosVariant[]
  selectedId?: number | null
  onPick: (v: PosVariant) => void
}

/** Color/size chips grid. Out-of-stock chips are disabled and marked. Shared by the add-dialog and the in-cart popover. */
export function VariantGrid({ variants, selectedId, onPick }: Props) {
  return (
    <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-3">
      {variants.map((v) => {
        const out = v.quantity <= 0
        const active = v.id === selectedId
        return (
          <button
            key={v.id}
            type="button"
            disabled={out}
            onClick={() => onPick(v)}
            aria-pressed={active}
            className={cn(
              'flex min-h-11 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-sm transition-colors',
              'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active && 'border-primary bg-primary-subtle text-primary-subtle-foreground',
              out && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            <span className="font-medium">{variantLabelOf(v)}</span>
            <span className={cn('text-[10px]', out ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {out ? 'نفد' : `متاح ${v.quantity}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
