'use client'

import { Clock, PlayCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/format'
import { resumeTicket, useHeldStore } from '@/lib/pos/held'
import { selectPayable } from '@/lib/pos/totals'

function ago(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (m < 1) return 'دلوقتي'
  if (m < 60) return `من ${m} دقيقة`
  return `من ${Math.floor(m / 60)} ساعة`
}

/** Parked invoices: resume (current ticket is parked automatically, nothing lost) or delete. */
export function HeldTicketsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const held = useHeldStore((s) => s.held)
  const remove = useHeldStore((s) => s.remove)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>الفواتير المعلّقة</DialogTitle>
          <DialogDescription>بتفضل محفوظة 24 ساعة على الجهاز ده.</DialogDescription>
        </DialogHeader>
        {held.length === 0 ? (
          <EmptyState icon={<Clock />} title="مفيش فواتير معلّقة" hint="اضغط «تعليق» (F8) لتوقيف الفاتورة الحالية" />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto overscroll-contain">
            {held.map((h) => {
              const { total } = selectPayable(h.ticket.lines, h.ticket.discount)
              return (
                <li key={h.id} className="flex items-center gap-2 rounded-xl border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{h.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.ticket.lines.length} {h.ticket.lines.length === 1 ? 'صنف' : 'أصناف'} · {ago(h.at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{formatCurrency(total)}</span>
                  <Button type="button" size="sm" className="h-9 gap-1" onClick={() => { if (resumeTicket(h.id)) onOpenChange(false) }}>
                    <PlayCircle className="size-4" /> استرجاع
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="size-9 text-muted-foreground hover:text-destructive" onClick={() => remove(h.id)} aria-label="حذف">
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
