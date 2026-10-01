'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import type { ShiftSummary } from '@/lib/pos/pricing'

export interface ShiftRow {
  id: number
  openedAt: string
  closedAt?: string | null
  openingCash: number
  expectedCash?: number | null
  countedCash?: number | null
  difference?: number | null
  note?: string | null
  userName?: string | null
  /** Opened while offline — the server will create the real one on sync. */
  local?: boolean
}

const key = (tenant?: string, user?: string) => `pos-shift-v1:${tenant ?? 'anon'}:${user ?? ''}`

/** The signed-in cashier's open shift (cached so the POS knows it while offline). */
export function useShift() {
  const user = useShopStore((s) => s.user)
  const [shift, setShift] = React.useState<ShiftRow | null>(null)
  const [summary, setSummary] = React.useState<ShiftSummary | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const k = key(user?.tenantId, user?.userId)

  const persist = React.useCallback((s: ShiftRow | null) => {
    try { s ? localStorage.setItem(k, JSON.stringify(s)) : localStorage.removeItem(k) } catch { /* best-effort */ }
  }, [k])

  const refresh = React.useCallback(async () => {
    try {
      const r = await api<{ shift: ShiftRow | null; summary?: ShiftSummary; offline?: boolean }>('/api/pos/shift')
      if (r && 'shift' in r) {
        setShift(r.shift)
        setSummary(r.summary ?? null)
        persist(r.shift)
      }
    } catch {
      try {
        const c = localStorage.getItem(k)
        if (c) setShift(JSON.parse(c))
      } catch { /* none */ }
    } finally {
      setLoaded(true)
    }
  }, [k, persist])

  React.useEffect(() => {
    try {
      const c = localStorage.getItem(k)
      if (c) setShift(JSON.parse(c))
    } catch { /* ignore */ }
    void refresh()
  }, [k, refresh])

  const open = React.useCallback(
    async (openingCash: number) => {
      const r = await api<any>('/api/pos/shift', { method: 'POST', body: { action: 'open', openingCash } })
      if (r?.offline || !r?.shift) {
        // Queued for later: let the cashier start selling now; the server creates the shift on sync.
        const local: ShiftRow = { id: 0, openedAt: new Date().toISOString(), openingCash, local: true }
        setShift(local)
        persist(local)
        return local
      }
      setShift(r.shift)
      persist(r.shift)
      void refresh()
      return r.shift as ShiftRow
    },
    [persist, refresh],
  )

  const close = React.useCallback(
    async (countedCash: number, note?: string) => {
      const r = await api<{ shift: ShiftRow; summary: ShiftSummary }>('/api/pos/shift', {
        method: 'POST',
        body: { action: 'close', countedCash, note: note || undefined },
      })
      setShift(null)
      setSummary(null)
      persist(null)
      return r
    },
    [persist],
  )

  return { shift, summary, loaded, refresh, open, close }
}
