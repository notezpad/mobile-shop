'use client'

import { Banknote, CreditCard, Smartphone, Landmark } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PAY_METHODS, PAY_METHOD_LABELS, type PayMethod } from '@/lib/pos/pricing'

const ICONS: Record<PayMethod, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  vodafone_cash: Smartphone,
  instapay: Landmark,
  card: CreditCard,
}

/** How the customer pays. Same method keys the cash drawer already aggregates by. */
export function PayMethodBar({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as PayMethod)}
      className="grid w-full grid-cols-4 gap-1.5"
      aria-label="طريقة الدفع"
    >
      {PAY_METHODS.map((m) => {
        const Icon = ICONS[m]
        return (
          <ToggleGroupItem
            key={m}
            value={m}
            className="h-auto min-h-12 flex-col gap-0.5 rounded-xl border border-border px-1 py-1.5 text-[11px] leading-tight data-[state=on]:border-primary data-[state=on]:bg-primary-subtle data-[state=on]:text-primary-subtle-foreground"
          >
            <Icon className="size-4" />
            <span className="truncate">{PAY_METHOD_LABELS[m]}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
