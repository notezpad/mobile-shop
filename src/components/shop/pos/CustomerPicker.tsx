'use client'

import * as React from 'react'
import { AlertTriangle, ChevronDown, Loader2, UserPlus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCurrency } from '@/lib/format'
import { usePosStore } from '@/lib/pos/store'
import type { CustomerLite } from '@/lib/pos/types'

interface Props {
  customers: CustomerLite[]
  selectedBalance: number | null
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Called after a customer was created so the list can be refetched. */
  onCreated: () => void
}

/**
 * Customer is optional → collapsed into one row (progressive disclosure).
 * A previous balance is ALWAYS surfaced on the row itself, popover open or not.
 */
export function CustomerPicker({ customers, selectedBalance, open, onOpenChange: setOpen, onCreated }: Props) {
  const name = usePosStore((s) => s.customerName)
  const phone = usePosStore((s) => s.customerPhone)
  const setCustomer = usePosStore((s) => s.setCustomer)
  const [creating, setCreating] = React.useState(false)

  const q = name.trim()
  const exact = q ? customers.some((c) => c.name.trim() === q) : true
  const canCreate = !!q && !exact

  const createCustomer = async () => {
    setCreating(true)
    try {
      const c = await api<any>('/api/customers', { method: 'POST', body: { name: q, phone: phone.trim() || undefined } })
      if (c?.id) {
        setCustomer({ id: c.id, name: c.name, phone: c.phone ?? '' })
        onCreated()
        setOpen(false)
      } else {
        // Offline: saved to the outbox, no id yet — the name stays on the ticket but can't carry credit until synced.
        toast.success('اتحفظ العميل محلياً — هيتربط بعد المزامنة')
        setOpen(false)
      }
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر إضافة العميل')
    } finally {
      setCreating(false)
    }
  }

  const list = q
    ? customers.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q)).slice(0, 6)
    : customers.slice(0, 6)

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-11 w-full justify-between gap-2 rounded-xl px-3 font-normal">
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <span className={name ? 'truncate font-medium' : 'text-muted-foreground'}>{name || 'عميل (اختياري)'}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 space-y-2 p-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setCustomer({ name: e.target.value, id: null })}
            placeholder="اسم العميل"
            aria-label="اسم العميل"
          />
          <Input
            value={phone}
            onChange={(e) => setCustomer({ phone: e.target.value })}
            placeholder="رقم الهاتف (اختياري)"
            inputMode="tel"
            dir="ltr"
            className="text-start"
            aria-label="رقم الهاتف"
          />
          {canCreate && (
            <Button type="button" variant="secondary" size="sm" className="w-full gap-1.5" disabled={creating} onClick={() => void createCustomer()}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              إضافة «{q}» كعميل جديد
            </Button>
          )}
          <ul className="max-h-48 overflow-y-auto">
            {list.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">
                {q ? 'لا يوجد عميل بهذا الاسم — سيُسجل بدون عميل' : 'لا يوجد عملاء لسه'}
              </li>
            ) : (
              list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer({ id: c.id, name: c.name, phone: c.phone ?? '' })
                      setOpen(false)
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-start text-sm hover:bg-accent"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {c.balance > 0 && <span className="tabular-nums text-destructive">عليه {formatCurrency(c.balance)}</span>}
                      {c.phone && <span className="tabular-nums text-muted-foreground">{c.phone}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {name && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => {
                setCustomer({ id: null, name: '', phone: '' })
                setOpen(false)
              }}
            >
              إزالة العميل
            </Button>
          )}
        </PopoverContent>
      </Popover>

      {selectedBalance !== null && selectedBalance > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg border border-warning-subtle bg-warning-subtle px-2.5 py-1.5 text-xs text-warning-subtle-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            عليه رصيد سابق: <span className="font-bold tabular-nums">{formatCurrency(selectedBalance)}</span>
          </span>
        </div>
      )}
    </div>
  )
}
