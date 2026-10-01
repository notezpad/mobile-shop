'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { piecePrice } from '@/lib/pos/totals'
import type { ProductLite } from '@/lib/pos/types'

interface Props {
  product: ProductLite
  onSelect: (p: ProductLite) => void
}

export function ProductTile({ product: p, onSelect }: Props) {
  const [imgError, setImgError] = React.useState(false)
  const out = p.quantity <= 0
  const low = !out && p.minQuantity != null && p.quantity <= p.minQuantity

  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      className={cn(
        'group flex min-h-11 flex-col overflow-hidden rounded-xl border bg-card text-start shadow-xs transition-all',
        'hover:border-primary/40 hover:shadow-md active:scale-[0.98] motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        out && 'opacity-60',
      )}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-muted">
        {p.imagePath && !imgError ? (
          <img
            src={p.imagePath}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-3xl font-bold text-muted-foreground/40" aria-hidden>
            {p.name.trim().charAt(0) || '؟'}
          </span>
        )}
        {(out || low) && (
          <Badge variant={out ? 'danger' : 'warning'} className="absolute end-1.5 top-1.5">
            {out ? 'نفد' : 'قليل'}
          </Badge>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
        <p className="text-sm font-bold tabular-nums text-primary">{formatCurrency(piecePrice(p))}</p>
      </div>
    </button>
  )
}
