'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import type { CustomerLite } from '@/lib/pos/types'

/** Loads customers (re-fetched when `refresh()` is called after a sale) + balance of the current pick. */
export function usePosCustomers(selectedCustomerId: number | null, customerName: string) {
  const [customers, setCustomers] = React.useState<CustomerLite[]>([])
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    let alive = true
    api<CustomerLite[]>('/api/customers')
      .then((d) => {
        if (alive) setCustomers(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [version])

  const selectedBalance = React.useMemo(() => {
    if (selectedCustomerId) {
      const c = customers.find((x) => x.id === selectedCustomerId)
      if (c) return c.balance
    }
    const trimmed = customerName.trim()
    if (trimmed) {
      const c = customers.find((x) => x.name.trim() === trimmed)
      if (c) return c.balance
    }
    return null
  }, [selectedCustomerId, customerName, customers])

  const refresh = React.useCallback(() => setVersion((v) => v + 1), [])
  return { customers, selectedBalance, refresh }
}
