'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DraftNumberInput } from './DraftNumberInput'

interface Props {
  value: number
  min?: number
  max: number
  onChange: (n: number) => void
  className?: string
}

/** [−] n [+] — touch-sized, clamped, and the field can be cleared and retyped. */
export function QtyStepper({ value, min = 1, max, onChange, className }: Props) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)} dir="ltr">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0 rounded-lg"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="تقليل الكمية"
      >
        <Minus className="size-4" />
      </Button>
      <DraftNumberInput
        value={value}
        onCommit={(n) => onChange(Math.min(max, Math.max(min, n)))}
        className="h-9 w-14 text-center font-semibold tabular-nums"
        aria-label="الكمية"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0 rounded-lg"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="زيادة الكمية"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
