'use client'

import { Clock, Pause, ShoppingCart, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePosStore } from '@/lib/pos/store'
import { useHeldStore } from '@/lib/pos/held'
import type { CustomerLite } from '@/lib/pos/types'
import { CustomerPicker } from './CustomerPicker'
import { PayPanel } from './PayPanel'
import { TicketLine } from './TicketLine'

interface Props {
  customers: CustomerLite[]
  selectedBalance: number | null
  submitting: boolean
  onCheckout: () => void
  onCustomerCreated: () => void
  customerOpen: boolean
  onCustomerOpenChange: (o: boolean) => void
  discountOpen: boolean
  onDiscountOpenChange: (o: boolean) => void
  activeKey: string | null
  onActivate: (key: string) => void
  onHold: () => void
  onShowHeld: () => void
  onClear: () => void
  className?: string
}

/** The ticket: header (hold · held · clear) → customer → lines → totals/payment. One surface, one primary action. */
export function Ticket(p: Props) {
  const lines = usePosStore((s) => s.lines)
  const heldCount = useHeldStore((s) => s.held.length)

  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm ${p.className ?? ''}`} aria-label="الفاتورة">
      <header className="flex items-center justify-between gap-1 border-b px-3 py-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <ShoppingCart className="size-4 text-primary" />
          الفاتورة
          {lines.length > 0 && <Badge variant="subtle">{lines.length}</Badge>}
        </h2>
        <div className="flex items-center gap-0.5">
          {heldCount > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={p.onShowHeld}>
              <Clock className="size-3.5" />
              معلّقة
              <Badge variant="warning">{heldCount}</Badge>
            </Button>
          )}
          {lines.length > 0 && (
            <>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={p.onHold} title="تعليق (F8)">
                <Pause className="size-3.5" />
                تعليق
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={p.onClear}>
                <Trash2 className="size-3.5" />
                مسح
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="border-b p-3">
        <CustomerPicker
          customers={p.customers}
          selectedBalance={p.selectedBalance}
          open={p.customerOpen}
          onOpenChange={p.onCustomerOpenChange}
          onCreated={p.onCustomerCreated}
        />
      </div>

      <ul className="min-h-24 flex-1 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <li>
            <EmptyState
              icon={<ShoppingCart />}
              title="الفاتورة فاضية"
              hint="امسح باركود أو اختار منتج للبدء"
              action={
                heldCount > 0 ? (
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={p.onShowHeld}>
                    <Clock className="size-4" /> فواتير معلّقة ({heldCount})
                  </Button>
                ) : undefined
              }
            />
          </li>
        ) : (
          lines.map((l) => (
            <TicketLine key={l.cartKey} line={l} active={lines.length > 1 && l.cartKey === p.activeKey} onActivate={() => p.onActivate(l.cartKey)} />
          ))
        )}
      </ul>

      <PayPanel submitting={p.submitting} onCheckout={p.onCheckout} discountOpen={p.discountOpen} onDiscountOpenChange={p.onDiscountOpenChange} />
    </section>
  )
}
