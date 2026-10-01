'use client'

import * as React from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface Pending {
  reason: string
  error?: string
  resolve: (pin: string | null) => void
}

/**
 * Promise-based manager approval: `const pin = await ask('خصم 20% أعلى من المسموح')` → the PIN, or null if cancelled.
 * The PIN only lives in memory for the one request — it is never stored.
 */
export function useApproval() {
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [pin, setPin] = React.useState('')

  const ask = React.useCallback(
    (reason: string, error?: string) =>
      new Promise<string | null>((resolve) => {
        setPin('')
        setPending({ reason, error, resolve })
      }),
    [],
  )

  const finish = (value: string | null) => {
    pending?.resolve(value)
    setPending(null)
    setPin('')
  }

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => !o && finish(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            موافقة المدير
          </DialogTitle>
          <DialogDescription>{pending?.reason}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pin.length >= 4) finish(pin)
          }}
          placeholder="PIN المدير"
          aria-label="PIN المدير"
          className="h-12 text-center text-2xl tracking-[0.5em]"
          dir="ltr"
        />
        {pending?.error && <p className="text-sm text-destructive">{pending.error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => finish(null)}>إلغاء</Button>
          <Button type="button" disabled={pin.length < 4} onClick={() => finish(pin)}>تأكيد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { ask, dialog }
}
