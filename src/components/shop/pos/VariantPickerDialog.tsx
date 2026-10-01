'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PosVariant, ProductLite } from '@/lib/pos/types'
import { VariantGrid } from './VariantGrid'

interface Props {
  open: boolean
  product: ProductLite | null
  variants: PosVariant[]
  onPick: (v: PosVariant) => void
  onClose: () => void
}

/** Color/size picker shown before a variant-product is added to the cart. */
export function VariantPickerDialog({ open, product, variants, onPick, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>اختار اللون/المقاس — {product?.name}</DialogTitle>
        </DialogHeader>
        {variants.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">لا يوجد ألوان/مقاسات مسجلة لهذا المنتج</p>
        ) : (
          <VariantGrid variants={variants} onPick={onPick} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
