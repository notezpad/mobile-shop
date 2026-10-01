'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'

export interface PosSettings {
  requireShift: boolean
  /** Cashier limit in %. 100 = no limit. */
  employeeMaxDiscountPct: number
  hasPin: boolean
  pinLocked?: boolean
}

export const DEFAULT_SETTINGS: PosSettings = { requireShift: false, employeeMaxDiscountPct: 100, hasPin: false }

const key = (tenant?: string) => `pos-settings-v1:${tenant ?? 'anon'}`

/**
 * POS behaviour settings. Cached per tenant so the discount limit & shift rule are still known when the
 * network drops mid-day (the limit must be enforced offline too — a sale queued over the limit would be
 * rejected on sync and could be lost).
 */
export function usePosSettings() {
  const user = useShopStore((s) => s.user)
  const tenantId = user?.tenantId
  const [settings, setSettings] = React.useState<PosSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = React.useState(false)

  const refresh = React.useCallback(async () => {
    try {
      const s = await api<PosSettings>('/api/pos/settings')
      if (s && typeof s.employeeMaxDiscountPct === 'number') {
        setSettings(s)
        try { localStorage.setItem(key(tenantId), JSON.stringify(s)) } catch { /* cache is best-effort */ }
      }
    } catch {
      try {
        const cached = localStorage.getItem(key(tenantId))
        if (cached) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(cached) })
      } catch { /* keep defaults */ }
    } finally {
      setLoaded(true)
    }
  }, [tenantId])

  React.useEffect(() => {
    try {
      const cached = localStorage.getItem(key(tenantId))
      if (cached) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(cached) })
    } catch { /* ignore */ }
    void refresh()
  }, [tenantId, refresh])

  return { settings, loaded, refresh, role: user?.role ?? 'EMPLOYEE' }
}
