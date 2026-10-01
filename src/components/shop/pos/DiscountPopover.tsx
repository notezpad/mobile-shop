'use client'

import { Percent, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { usePosStore } from '@/lib/pos/store'
import { DraftNumberInput } from './DraftNumberInput'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Validation message for the current discount (from selectPayable), or null. */
  error: string | null
  disabled?: boolean
}

/** "+ خصم" — closed by default (progressive disclosure). % or fixed amount, on the whole invoice. */
export function DiscountPopover({ open, onOpenChange, error, disabled }: Props) {
  const discount = usePosStore((s) => s.discount)
  const setDiscount = usePosStore((s) => s.setDiscount)
  const type = discount?.type ?? 'pct'

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="h-9 gap-1.5 rounded-full px-3 text-xs">
          <Tag className="size-3.5" />
          {discount ? `خصم ${discount.value}${discount.type === 'pct' ? '%' : ''}` : '+ خصم'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setDiscount({ type: v as 'pct' | 'amount', value: discount?.value ?? 0 })}
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          aria-label="نوع الخصم"
        >
          <ToggleGroupItem value="pct" className="h-8 gap-1 rounded-md text-xs data-[state=on]:bg-card data-[state=on]:shadow-xs">
            <Percent className="size-3.5" /> نسبة
          </ToggleGroupItem>
          <ToggleGroupItem value="amount" className="h-8 rounded-md text-xs data-[state=on]:bg-card data-[state=on]:shadow-xs">
            مبلغ (ج.م)
          </ToggleGroupItem>
        </ToggleGroup>
        <DraftNumberInput
          autoFocus
          allowDecimal
          value={discount?.value ?? 0}
          onCommit={(n) => setDiscount({ type, value: n })}
          className="h-11 text-center text-lg font-semibold tabular-nums"
          aria-label="قيمة الخصم"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>تم</Button>
          {discount && (
            <Button type="button" size="sm" variant="outline" onClick={() => { setDiscount(null); onOpenChange(false) }}>
              <X className="size-4" /> إزالة
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
