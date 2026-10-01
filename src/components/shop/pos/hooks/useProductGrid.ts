'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useDataRefresh } from '@/lib/offline/data-events'
import { getRecentIds, sortByRecent } from '@/lib/pos/recent'
import type { ProductLite } from '@/lib/pos/types'

const LIMIT = 36

/** Catalog grid: products of one category (or all), recent-first, always re-fetched fresh (stock!). */
export function useProductGrid(category: string) {
  const [items, setItems] = React.useState<ProductLite[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const seq = React.useRef(0)

  const load = React.useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    try {
      const qs = new URLSearchParams({ limit: String(LIMIT) })
      if (category !== 'all') qs.set('category', category)
      const res = await api<{ data: ProductLite[] } | ProductLite[]>(`/api/products?${qs}`)
      if (my !== seq.current) return // a newer request superseded this one
      const data = Array.isArray(res) ? res : (res as any)?.data ?? []
      setItems(category === 'all' ? sortByRecent(data, getRecentIds()) : data)
      setError(false)
    } catch {
      if (my === seq.current) setError(true)
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [category])

  React.useEffect(() => {
    void load()
  }, [load])

  // Sales/purchases/syncs change stock → refetch live.
  useDataRefresh(['products'], load)

  return { items, loading, error, reload: load }
}
