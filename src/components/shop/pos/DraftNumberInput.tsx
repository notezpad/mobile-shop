'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'

// Arabic-Indic / Persian digits → western, so the Arabic keyboard just works.
function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/٫/g, '.')
}

interface Props extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number
  /** Called with a valid number while typing. Never called for empty/partial text. */
  onCommit: (n: number) => void
  allowDecimal?: boolean
}

/**
 * Numeric input that lets the user clear the field and type a new number.
 * (The old <Input type=number> forced `|| 1` on every keystroke, so an empty
 * field snapped straight back to 1.) While focused it shows the raw draft;
 * on blur it snaps to the real, clamped value held by the store.
 */
export function DraftNumberInput({ value, onCommit, allowDecimal = false, onFocus, onBlur, ...rest }: Props) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const pattern = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/

  return (
    <Input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      dir="ltr"
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value))
        e.currentTarget.select()
        onFocus?.(e)
      }}
      onChange={(e) => {
        const text = normalizeDigits(e.target.value)
        if (!pattern.test(text)) return
        setDraft(text)
        if (text === '' || text === '.') return
        const n = Number(text)
        if (Number.isFinite(n)) onCommit(n)
      }}
      onBlur={(e) => {
        setDraft(null)
        onBlur?.(e)
      }}
    />
  )
}
