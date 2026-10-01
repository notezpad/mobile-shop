'use client'

import * as React from 'react'
import { CheckCircle2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'

export interface LastSale {
  invoiceNo: string
  total: number
  /** Cash change handed back to the customer (0 = none). */
  change: number
  /** Saved locally, not yet on the server. */
  offline: boolean
  raw: any
}

interface Props {
  sale: LastSale | null
  onReprint: () => void
  onDismiss: () => void
}

// Long enough to hand back change; a sale with change stays until dismissed.
const AUTO_HIDE_MS = 20_000

/** After a sale: confirmation + reprint, so a failed print never leaves the cashier stuck. Auto-hides after 20s (unless there is change to hand back). */
export function LastSaleStrip({ sale, onReprint, onDismiss }: Props) {
  React.useEffect(() => {
    if (!sale || sale.change > 0) return
    const t = setTimeout(onDismiss, AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [sale, onDismiss])

  if (!sale) return null
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-success-subtle bg-success-subtle px-3 py-2 text-sm text-success-subtle-foreground animate-in-up motion-reduce:animate-none"
    >
      <CheckCircle2 className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {sale.offline ? 'اتحفظت محلياً · بانتظار المزامنة' : 'تم البيع'} · <span className="font-semibold tabular-nums">{sale.invoiceNo}</span> ·{' '}
          <span className="font-semibold tabular-nums">{formatCurrency(sale.total)}</span>
        </span>
        {sale.change > 0 && (
          <span className="block text-base font-bold tabular-nums">الباقي للعميل: {formatCurrency(sale.change)}</span>
        )}
      </span>
      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={onReprint}>
        <Printer className="size-4" />
        إعادة طباعة
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onDismiss} aria-label="إغلاق">
        <X className="size-4" />
      </Button>
    </div>
  )
}
