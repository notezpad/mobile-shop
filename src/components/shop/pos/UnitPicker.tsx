'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCurrency } from '@/lib/format'
import { perPiecePriceFor } from '@/lib/pos/totals'
import type { CartLine, PosUnit } from '@/lib/pos/types'

interface Props {
  line: CartLine
  onChange: (unit: PosUnit | null) => void
}

/** Wholesale/retail unit chips (قطعة · نص دستة · دستة …) — replaces the native <select>. */
export function UnitPicker({ line, onChange }: Props) {
  if (line.availableUnits.length === 0) return null
  const current = line.unitId == null ? 'piece' : String(line.unitId)

  return (
    <ToggleGroup
      type="single"
      value={current}
      onValueChange={(v) => {
        if (!v) return // radix sends '' when the active chip is clicked again — keep the selection
        onChange(v === 'piece' ? null : line.availableUnits.find((u) => String(u.id) === v) ?? null)
      }}
      className="flex w-full flex-wrap gap-1.5"
      aria-label="الوحدة"
    >
      <Chip value="piece" label="قطعة" price={perPiecePriceFor(line.product, null)} />
      {line.availableUnits.map((u) => (
        <Chip
          key={u.id}
          value={String(u.id)}
          label={u.name}
          price={perPiecePriceFor(line.product, u) * (u.factor || 1)}
        />
      ))}
    </ToggleGroup>
  )
}

function Chip({ value, label, price }: { value: string; label: string; price: number }) {
  return (
    <ToggleGroupItem
      value={value}
      className="h-auto min-h-9 flex-col gap-0 rounded-lg border border-border px-2.5 py-1 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary-subtle data-[state=on]:text-primary-subtle-foreground"
    >
      <span className="font-semibold">{label}</span>
      <span className="text-[10px] tabular-nums opacity-70">{formatCurrency(price)}</span>
    </ToggleGroupItem>
  )
}
