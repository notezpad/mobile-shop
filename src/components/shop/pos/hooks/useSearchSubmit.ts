'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ProductLite } from '@/lib/pos/types'
import type { useProductSearch } from './useProductSearch'

type Search = ReturnType<typeof useProductSearch>

/**
 * Enter / scan handler (port of the legacy handleSearchSubmit):
 * exact product barcode → add; a variant's own barcode → add that color/size;
 * single result → add; several → show the list; none → error toast.
 */
export function useSearchSubmit(
  search: Search,
  onSelect: (p: ProductLite, variantId?: number | null) => void | Promise<void>,
) {
  const { setLoading, setResults, setOpen } = search
  return React.useCallback(
    async (raw: string) => {
      const q = raw.trim()
      if (!q) return
      setLoading(true)
      try {
        const res = await api<{ data: ProductLite[] } | ProductLite[]>(`/api/products?search=${encodeURIComponent(q)}`)
        const data: ProductLite[] = Array.isArray(res) ? res : (res as any)?.data ?? []
        const exact = data.find((r) => r.barcode === q)
        const variantExact = data.find((r) => r.matchedVariantId != null)
        if (exact) await onSelect(exact)
        else if (variantExact) await onSelect(variantExact, variantExact.matchedVariantId)
        else if (data.length === 1) await onSelect(data[0])
        else if (data.length > 1) {
          setResults(data)
          setOpen(true)
        } else {
          toast.error('لا يوجد منتج بهذا الاسم أو الباركود')
          setResults([])
          setOpen(false)
        }
      } catch {
        toast.error('فشل البحث عن المنتج')
      } finally {
        setLoading(false)
      }
    },
    [onSelect, setLoading, setResults, setOpen],
  )
}
