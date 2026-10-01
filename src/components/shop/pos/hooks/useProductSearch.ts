'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import type { ProductLite } from '@/lib/pos/types'

/**
 * Debounced product search — retries once on a network/server hiccup and
 * ignores stale responses so an old empty result never overwrites a newer one.
 * (Port of the legacy POSView effect — behaviour unchanged.)
 */
export function useProductSearch() {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<ProductLite[]>([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setOpen(false)
      setError(false)
      return
    }
    setLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const url = `/api/products?search=${encodeURIComponent(q)}&limit=20`
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await api<{ data: ProductLite[] } | ProductLite[]>(url)
          if (cancelled) return
          const data = Array.isArray(res) ? res : (res as any)?.data ?? []
          setResults(data)
          setError(false)
          setOpen(true)
          setLoading(false)
          return
        } catch {
          if (cancelled) return
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!cancelled) {
        setResults([])
        setError(true)
        setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const clear = React.useCallback(() => {
    setQuery('')
    setResults([])
    setOpen(false)
  }, [])

  return { query, setQuery, results, setResults, open, setOpen, loading, setLoading, error, clear }
}
