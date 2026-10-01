'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CartLine, PosVariant } from '@/lib/pos/types'
import { VariantGrid } from './VariantGrid'

interface Props {
  line: CartLine
  onChange: (v: PosVariant) => void
}

/** In-cart color/size switcher: one button showing the current pick, chips grid in a popover. */
export function VariantPicker({ line, onChange }: Props) {
  const [open, setOpen] = React.useState(false)
  if (line.availableVariants.length === 0) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 max-w-full gap-1 rounded-full px-3 text-xs">
          <span className="truncate">{line.variantLabel ?? 'اختار اللون/المقاس'}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <VariantGrid
          variants={line.availableVariants}
          selectedId={line.variantId}
          onPick={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
