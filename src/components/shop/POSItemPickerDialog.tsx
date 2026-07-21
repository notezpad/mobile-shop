'use client'

import * as React from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

export interface PickerVariant {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

export interface PickerUnit {
  id: number
  name: string
  price: number | null
  factor: number | null
  items: Array<{ id: number; variantId: number; quantity: number; variant: PickerVariant }>
}

interface ProductForPicker {
  id: number
  name: string
  price: number
  quantity: number
}

export interface ResolvedPick {
  productId: number
  productName: string
  price: number
  quantity: number // number of units if unitId set, otherwise pieces
  unitId: number | null
  unitLabel: string | null
  totalPieces: number // for display + stock-cap purposes only
  variantId: number | null
  variantLabel: string | null
  maxQuantity: number // best-effort available stock, expressed in the same terms as `quantity`
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: ProductForPicker | null
  onConfirm: (pick: ResolvedPick) => void
}

const PIECE_UNIT = '__piece__'

function variantLabelOf(v: PickerVariant): string {
  return [v.size, v.color].filter(Boolean).join(' / ') || `#${v.id}`
}

export function POSItemPickerDialog({ open, onOpenChange, product, onConfirm }: Props) {
  const [loading, setLoading] = React.useState(false)
  const [units, setUnits] = React.useState<PickerUnit[]>([])
  const [variants, setVariants] = React.useState<PickerVariant[]>([])
  const [selectedUnit, setSelectedUnit] = React.useState<string>(PIECE_UNIT)
  const [selectedVariantId, setSelectedVariantId] = React.useState<string>('')
  const [qty, setQty] = React.useState(1)
  const [price, setPrice] = React.useState(0)

  React.useEffect(() => {
    if (!open || !product) return
    setLoading(true)
    setSelectedUnit(PIECE_UNIT)
    setSelectedVariantId('')
    setQty(1)
    setPrice(product.price)
    Promise.all([
      api<PickerUnit[]>(`/api/products/${product.id}/units`).catch(() => []),
      api<PickerVariant[]>(`/api/products/${product.id}/variants`).catch(() => []),
    ])
      .then(([u, v]) => {
        setUnits(u)
        setVariants(v)
      })
      .finally(() => setLoading(false))
  }, [open, product])

  const unit = units.find((u) => String(u.id) === selectedUnit) || null
  const isAssortment = !!unit && unit.items.length > 0
  const factor = unit?.factor && unit.factor > 0 ? unit.factor : 1

  const handleUnitChange = (val: string) => {
    setSelectedUnit(val)
    if (!product) return
    if (val === PIECE_UNIT) {
      setPrice(product.price)
    } else {
      const u = units.find((x) => String(x.id) === val)
      setPrice(u?.price ?? product.price)
    }
  }

  if (!product) return null

  const selectedVariant = variants.find((v) => String(v.id) === selectedVariantId) || null

  // How many pieces this line will actually remove from stock.
  const totalPieces = isAssortment
    ? unit!.items.reduce((s, it) => s + it.quantity * qty, 0)
    : factor * qty

  // Best-effort max for the quantity input (in "units sold" terms, or pieces if no unit).
  let maxQuantity = Infinity
  if (isAssortment) {
    // limited by the tightest variant in the assortment
    maxQuantity = Math.min(
      ...unit!.items.map((it) => Math.floor(it.variant.quantity / it.quantity))
    )
  } else if (selectedVariant) {
    maxQuantity = Math.floor(selectedVariant.quantity / factor)
  } else {
    maxQuantity = Math.floor(product.quantity / factor)
  }
  if (!isFinite(maxQuantity) || maxQuantity < 0) maxQuantity = 0

  const lowStockWarnings = isAssortment
    ? unit!.items
        .filter((it) => it.variant.quantity - it.quantity * qty <= 1)
        .map((it) => variantLabelOf(it.variant))
    : []

  const confirm = () => {
    if (qty <= 0) {
      toast.error('الكمية لازم تكون أكبر من صفر')
      return
    }
    if (variants.length > 0 && !isAssortment && !selectedVariant) {
      toast.error('اختار المقاس/اللون الأول')
      return
    }
    if (maxQuantity <= 0 || qty > maxQuantity) {
      toast.error('الكمية المطلوبة غير متوفرة في المخزون')
      return
    }
    onConfirm({
      productId: product.id,
      productName: product.name,
      price,
      quantity: qty,
      unitId: unit?.id ?? null,
      unitLabel: unit?.name ?? null,
      totalPieces,
      variantId: isAssortment ? null : (selectedVariant?.id ?? null),
      variantLabel: isAssortment ? null : selectedVariant ? variantLabelOf(selectedVariant) : null,
      maxQuantity,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {units.length > 0 && (
              <div className="space-y-1.5">
                <Label>وحدة البيع</Label>
                <Select value={selectedUnit} onValueChange={handleUnitChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PIECE_UNIT}>قطعة (أساسي)</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAssortment && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="mb-1.5 font-medium">
                  {unit!.name} دي بتشمل:
                </p>
                <p className="text-muted-foreground">
                  {unit!.items
                    .map((it) => `${it.quantity} ${variantLabelOf(it.variant)}`)
                    .join(' + ')}
                </p>
                {lowStockWarnings.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 text-warning-subtle-foreground dark:text-warning-subtle-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <p className="text-xs">
                      تنبيه: مخزون {lowStockWarnings.join('، ')} هيوصل لحد قريب من الصفر بعد البيع ده
                    </p>
                  </div>
                )}
              </div>
            )}

            {!isAssortment && variants.length > 0 && (
              <div className="space-y-1.5">
                <Label>المقاس / اللون</Label>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المقاس/اللون" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {variantLabelOf(v)} — متاح: {v.quantity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!isAssortment && unit && (
              <p className="text-xs text-muted-foreground">
                كل {unit.name} = {factor} قطعة — إجمالي: {totalPieces} قطعة
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الكمية {unit ? `(${unit.name})` : ''}</Label>
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <p className="text-xs text-muted-foreground">متاح: {maxQuantity}</p>
              </div>
              <div className="space-y-1.5">
                <Label>السعر {unit ? '(للوحدة)' : ''}</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="font-bold">{formatCurrency(price * qty)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={confirm} disabled={loading || maxQuantity <= 0}>
            إضافة للسلة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
