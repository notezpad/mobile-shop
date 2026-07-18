'use client'

import * as React from 'react'
import { Printer, Minus, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { printBarcodeLabels } from '@/lib/print-client'
import { cn } from '@/lib/utils'

export interface LabelProduct {
  id: number
  name: string
  barcode: string | null
  price: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: LabelProduct[]
}

const ROLL_PRESETS: Record<string, { label: string; widthMm: number; heightMm: number }> = {
  '40x30': { label: '40 × 30 مم (الأكثر شيوعًا)', widthMm: 40, heightMm: 30 },
  '50x30': { label: '50 × 30 مم', widthMm: 50, heightMm: 30 },
  '30x20': { label: '30 × 20 مم (صغير)', widthMm: 30, heightMm: 20 },
  custom: { label: 'مقاس مخصص...', widthMm: 40, heightMm: 30 },
}

export function PrintLabelsDialog({ open, onOpenChange, products }: Props) {
  const [qty, setQty] = React.useState<Record<number, number>>({})
  const [showPrice, setShowPrice] = React.useState(true)
  const [printMode, setPrintMode] = React.useState<'sheet' | 'roll'>('sheet')
  const [rollPreset, setRollPreset] = React.useState<keyof typeof ROLL_PRESETS>('40x30')
  const [customWidth, setCustomWidth] = React.useState(40)
  const [customHeight, setCustomHeight] = React.useState(30)

  // reset quantities to 1 for every product whenever the dialog is opened with a new selection
  React.useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(products.map((p) => [p.id, 1])))
    }
  }, [open, products])

  const withBarcode = products.filter((p) => p.barcode)
  const withoutBarcode = products.filter((p) => !p.barcode)
  const totalLabels = withBarcode.reduce((s, p) => s + (qty[p.id] ?? 1), 0)

  const setProductQty = (id: number, value: number) => {
    setQty((prev) => ({ ...prev, [id]: Math.max(1, Math.min(200, Math.floor(value) || 1)) }))
  }

  const handlePrint = () => {
    if (withBarcode.length === 0) {
      toast.error('لا توجد منتجات لها باركود ضمن المحدد')
      return
    }
    const rollSize =
      rollPreset === 'custom'
        ? { widthMm: Math.max(10, customWidth), heightMm: Math.max(10, customHeight) }
        : { widthMm: ROLL_PRESETS[rollPreset].widthMm, heightMm: ROLL_PRESETS[rollPreset].heightMm }
    printBarcodeLabels(
      withBarcode.map((p) => ({
        name: p.name,
        barcode: p.barcode as string,
        price: p.price,
        quantity: qty[p.id] ?? 1,
      })),
      { showPrice, mode: printMode, rollSize }
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            طباعة ملصقات الباركود
          </DialogTitle>
          <DialogDescription>
            حددي عدد النسخ لكل منتج، هيتفتح لك ملف الطباعة في نافذة جديدة.
          </DialogDescription>
        </DialogHeader>

        {withoutBarcode.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            المنتجات دي مالهاش باركود فمش هتتطبعلها ملصقات: {withoutBarcode.map((p) => p.name).join('، ')}
            <br />
            افتحي المنتج ودوسي على زرار توليد الباركود الأول لو عايزة تطبعيله ملصق.
          </div>
        )}

        {/* Print method: A4 sheet vs. direct thermal label roll printer */}
        <div className="space-y-2">
          <Label className="text-xs">طريقة الطباعة</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPrintMode('sheet')}
              className={cn(
                'rounded-md border p-2.5 text-right text-xs transition-colors',
                printMode === 'sheet'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:bg-accent'
              )}
            >
              <div className="font-semibold">ورقة عادية (A4)</div>
              <div className="mt-0.5 text-muted-foreground">
                شبكة ملصقات على ورق عادي، وتقصيها بنفسك بعد الطباعة
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('roll')}
              className={cn(
                'rounded-md border p-2.5 text-right text-xs transition-colors',
                printMode === 'roll'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:bg-accent'
              )}
            >
              <div className="font-semibold">طابعة ملصقات (رول لاصق)</div>
              <div className="mt-0.5 text-muted-foreground">
                ملصق واحد بمقاس مضبوط لكل طباعة، بدون قص
              </div>
            </button>
          </div>

          {printMode === 'roll' && (
            <div className="flex items-end gap-2 rounded-md border bg-muted/30 p-2.5">
              <div className="flex-1">
                <Label className="mb-1.5 block text-xs">مقاس الملصق</Label>
                <Select
                  value={rollPreset}
                  onValueChange={(v) => setRollPreset(v as keyof typeof ROLL_PRESETS)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLL_PRESETS).map(([key, p]) => (
                      <SelectItem key={key} value={key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {rollPreset === 'custom' && (
                <>
                  <div>
                    <Label className="mb-1.5 block text-xs">العرض (مم)</Label>
                    <Input
                      type="number"
                      min={10}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value) || 10)}
                      className="h-8 w-16 text-center"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">الارتفاع (مم)</Label>
                    <Input
                      type="number"
                      min={10}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value) || 10)}
                      className="h-8 w-16 text-center"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {withBarcode.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            لا توجد منتجات بباركود ضمن المحدد
          </p>
        ) : (
          <div className="space-y-2">
            {withBarcode.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                    {p.barcode}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-7"
                    onClick={() => setProductQty(p.id, (qty[p.id] ?? 1) - 1)}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={qty[p.id] ?? 1}
                    onChange={(e) => setProductQty(p.id, Number(e.target.value))}
                    className="h-7 w-14 text-center tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-7"
                    onClick={() => setProductQty(p.id, (qty[p.id] ?? 1) + 1)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t pt-3">
          <Checkbox
            id="show-price"
            checked={showPrice}
            onCheckedChange={(v) => setShowPrice(v === true)}
          />
          <Label htmlFor="show-price" className="text-sm font-normal">
            إظهار السعر على الملصق
          </Label>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            إجمالي الملصقات: {totalLabels}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button onClick={handlePrint} disabled={withBarcode.length === 0}>
              <Printer className="size-4" />
              طباعة {totalLabels > 0 ? `(${totalLabels})` : ''}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
