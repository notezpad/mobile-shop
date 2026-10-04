'use client'

import * as React from 'react'
import { AlertTriangle, Loader2, Minus, Plus, ShoppingBasket } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
import { DialogHero, Field, INK_RING, InkInput, SectionTitle } from './product-dialog-ui'
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

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 items-center whitespace-nowrap rounded-xl border px-4 text-sm font-bold transition-colors',
        INK_RING,
        active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted'
      )}
    >
      {children}
    </button>
  )

  const showVariants = !isAssortment && variants.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={ShoppingBasket}
          title={product.name}
          chip="١ اختر"
          subtitle={`السعر الأساسي ${formatCurrency(product.price)}`}
        />

        <DialogBody className="space-y-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {units.length > 0 && (
                <section>
                  <SectionTitle>وحدة البيع</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    <Pill active={selectedUnit === PIECE_UNIT} onClick={() => handleUnitChange(PIECE_UNIT)}>
                      قطعة
                    </Pill>
                    {units.map((u) => (
                      <Pill key={u.id} active={selectedUnit === String(u.id)} onClick={() => handleUnitChange(String(u.id))}>
                        {u.name}
                      </Pill>
                    ))}
                  </div>
                  {!isAssortment && unit && (
                    <p className="mt-2 text-xs font-medium text-foreground/65">
                      كل {unit.name} = {factor} قطعة — إجمالي: {totalPieces} قطعة
                    </p>
                  )}
                </section>
              )}

              {isAssortment && (
                <div className="rounded-2xl border border-dashed border-foreground/25 bg-card p-3.5 text-sm">
                  <p className="mb-1.5 font-extrabold">{unit!.name} دي بتشمل:</p>
                  <p className="font-medium text-foreground/70">
                    {unit!.items.map((it) => `${it.quantity} ${variantLabelOf(it.variant)}`).join(' + ')}
                  </p>
                  {lowStockWarnings.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-warning-subtle px-2.5 py-2 text-warning-subtle-foreground">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <p className="text-xs font-medium">
                        تنبيه: مخزون {lowStockWarnings.join('، ')} هيوصل لحد قريب من الصفر بعد البيع ده
                      </p>
                    </div>
                  )}
                </div>
              )}

              {showVariants && (
                <section>
                  <SectionTitle>المقاس / اللون</SectionTitle>
                  <ul className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto overscroll-contain pb-1">
                    {variants.map((v) => {
                      const active = String(v.id) === selectedVariantId
                      const out = v.quantity <= 0
                      return (
                        <li key={v.id}>
                          <button
                            type="button"
                            disabled={out}
                            onClick={() => setSelectedVariantId(String(v.id))}
                            aria-pressed={active}
                            className={cn(
                              'flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-start transition-colors',
                              INK_RING,
                              out && 'cursor-not-allowed opacity-45',
                              active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted/60'
                            )}
                          >
                            <span className="text-sm font-extrabold">{variantLabelOf(v)}</span>
                            <span className={cn('text-[11px] font-bold tabular-nums', active ? 'text-background/70' : 'text-foreground/60')}>
                              {out ? 'نفد' : `متاح ${v.quantity}`}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              <section>
                <SectionTitle>الكمية والسعر</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`الكمية ${unit ? `(${unit.name})` : ''}`} hint={`متاح: ${maxQuantity}`}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="إنقاص"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background hover:bg-muted', INK_RING)}
                      >
                        <Minus className="size-4" />
                      </button>
                      <InkInput
                        num
                        type="number"
                        min={1}
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        wrapperClassName="min-w-0 flex-1"
                        className="px-1 text-center"
                      />
                      <button
                        type="button"
                        aria-label="زيادة"
                        onClick={() => setQty((q) => q + 1)}
                        className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background hover:bg-muted', INK_RING)}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </Field>
                  <Field label={`السعر ${unit ? '(للوحدة)' : ''}`}>
                    <InkInput
                      num
                      type="number"
                      min={0}
                      suffix="ج"
                      value={price}
                      onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </Field>
                </div>
              </section>
            </>
          )}
        </DialogBody>

        <DialogFooter className="flex-row items-center gap-2 border-t px-4 py-3 sm:px-6">
          <div className="me-auto leading-tight">
            <p className="text-[11px] font-bold text-foreground/60">الإجمالي</p>
            <p className="text-lg font-extrabold tabular-nums">{formatCurrency(price * qty)}</p>
          </div>
          <Button variant="outline" className={cn('h-11 rounded-xl', INK_BTN_OUTLINE)} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={confirm} disabled={loading || maxQuantity <= 0} className={cn('h-11 rounded-xl px-5 font-extrabold', INK_BTN)}>
            إضافة للسلة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
