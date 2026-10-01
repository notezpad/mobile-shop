'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { usePosStore } from '@/lib/pos/store'
import { displayQty, displayUnitPrice } from '@/lib/pos/totals'
import type { CartLine } from '@/lib/pos/types'
import { DraftNumberInput } from './DraftNumberInput'
import { QtyStepper } from './QtyStepper'
import { UnitPicker } from './UnitPicker'
import { VariantPicker } from './VariantPicker'

/** One ticket line — grid layout (no table), RTL-native, works at any width. */
export function TicketLine({ line, active, onActivate }: { line: CartLine; active?: boolean; onActivate?: () => void }) {
  const setQty = usePosStore((s) => s.setQty)
  const setPrice = usePosStore((s) => s.setPrice)
  const removeLine = usePosStore((s) => s.removeLine)
  const setUnit = usePosStore((s) => s.setUnit)
  const setVariant = usePosStore((s) => s.setVariant)

  const factor = line.unitFactor || 1
  const maxShown = line.unitId ? Math.floor(line.maxQuantity / factor) : line.maxQuantity

  return (
    <li
      onClick={onActivate}
      onFocusCapture={onActivate}
      data-active={active ? 'true' : undefined}
      className="animate-in-up space-y-2 border-b border-border/60 px-3 py-3 transition-colors last:border-b-0 data-[active=true]:bg-primary-subtle/40 motion-reduce:animate-none"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{line.product.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">متاح: {maxShown}{line.unitLabel ? ` ${line.unitLabel}` : ''}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => removeLine(line.cartKey)}
          aria-label={`حذف ${line.product.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {line.availableVariants.length > 0 && (
        <VariantPicker line={line} onChange={(v) => setVariant(line.cartKey, v)} />
      )}
      <UnitPicker line={line} onChange={(u) => setUnit(line.cartKey, u)} />

      <div className="flex items-end justify-between gap-2">
        <QtyStepper
          value={displayQty(line)}
          max={maxShown}
          onChange={(n) => setQty(line.cartKey, n * factor)}
        />
        <div className="flex flex-col items-end gap-0.5">
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {line.unitLabel ? `سعر ${line.unitLabel}` : 'السعر'}
            <DraftNumberInput
              allowDecimal
              value={displayUnitPrice(line)}
              onCommit={(n) => setPrice(line.cartKey, n / factor)}
              className="h-7 w-16 px-1 text-center text-xs tabular-nums"
              aria-label="السعر"
            />
          </label>
          <span className="text-base font-bold tabular-nums">{formatCurrency(line.price * line.quantity)}</span>
        </div>
      </div>
    </li>
  )
}
