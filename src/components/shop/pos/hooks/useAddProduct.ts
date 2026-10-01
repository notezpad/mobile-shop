'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { usePosStore } from '@/lib/pos/store'
import { piecePrice, variantLabelOf } from '@/lib/pos/totals'
import { pushRecent } from '@/lib/pos/recent'
import type { PosUnit, PosVariant, ProductLite } from '@/lib/pos/types'

// piecePrice is re-exported for callers that display prices
export { piecePrice }

/**
 * Product selection flow: fetch units/variants → (variant picker) → add to cart.
 * Port of the legacy handleProductSelect / handleVariantPick — behaviour unchanged,
 * except the out-of-stock toast now fires outside of a state updater (no double toast).
 */
export function useAddProduct(onSelected: () => void) {
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const hasUnitsCap = capabilities.includes('multi_unit')
  const hasVariantsCap = capabilities.includes('variants')
  const addLine = usePosStore((s) => s.addLine)

  const [adding, setAdding] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerProduct, setPickerProduct] = React.useState<ProductLite | null>(null)
  const [pickerVariants, setPickerVariants] = React.useState<PosVariant[]>([])
  const [pickerUnits, setPickerUnits] = React.useState<PosUnit[]>([])

  const addDirect = React.useCallback(
    (
      product: ProductLite,
      maxQuantity: number,
      availableUnits: PosUnit[],
      variant: PosVariant | null = null,
      availableVariants: PosVariant[] = [],
    ) => {
      const label = variant ? variantLabelOf(variant) : null
      const ok = addLine({
        product,
        unitId: null,
        unitLabel: null,
        maxQuantity,
        availableUnits,
        variantId: variant?.id ?? null,
        variantLabel: label,
        availableVariants,
      })
      if (ok) pushRecent(product.id)
      if (!ok) {
        toast.error(
          label
            ? `الكمية غير متوفرة لهذا اللون/المقاس (${label})`
            : 'الكمية غير متوفرة لهذا المنتج',
        )
      }
    },
    [addLine],
  )

  const closePicker = React.useCallback(() => {
    setPickerOpen(false)
    setPickerProduct(null)
    setPickerVariants([])
    setPickerUnits([])
  }, [])

  const selectProduct = React.useCallback(
    async (p: ProductLite, preselectedVariantId?: number | null) => {
      onSelected()
      if (adding) return
      setAdding(true)
      try {
        const [unitData, variantData] = await Promise.all([
          hasUnitsCap
            ? api<any[]>(`/api/products/${p.id}/units`)
                .then((d) => d.map((u: any): PosUnit => ({ id: u.id, name: u.name, price: u.price, factor: u.factor })))
                .catch(() => [] as PosUnit[])
            : Promise.resolve([] as PosUnit[]),
          hasVariantsCap
            ? api<any[]>(`/api/products/${p.id}/variants`)
                .then((d) => d.map((v: any): PosVariant => ({ id: v.id, size: v.size, color: v.color, quantity: v.quantity })))
                .catch(() => [] as PosVariant[])
            : Promise.resolve([] as PosVariant[]),
        ])

        if (variantData.length > 0) {
          // Scanning a variant's own barcode already says which color/size — add it directly.
          if (preselectedVariantId) {
            const v = variantData.find((x) => x.id === preselectedVariantId)
            if (v) {
              addDirect(p, v.quantity, unitData, v, variantData)
              return
            }
          }
          // Otherwise the cashier must pick the exact color/size before it goes in the cart.
          setPickerProduct(p)
          setPickerUnits(unitData)
          setPickerVariants(variantData)
          setPickerOpen(true)
          return
        }
        addDirect(p, p.quantity, unitData)
      } catch (e: any) {
        toast.error(e?.message || 'فشل تحميل بيانات المنتج')
      } finally {
        setAdding(false)
      }
    },
    [adding, hasUnitsCap, hasVariantsCap, addDirect, onSelected],
  )

  const pickVariant = React.useCallback(
    (variant: PosVariant) => {
      if (!pickerProduct) return
      addDirect(pickerProduct, variant.quantity, pickerUnits, variant, pickerVariants)
      closePicker()
    },
    [pickerProduct, pickerUnits, pickerVariants, addDirect, closePicker],
  )

  return { adding, selectProduct, picker: { open: pickerOpen, product: pickerProduct, variants: pickerVariants, pick: pickVariant, close: closePicker } }
}
