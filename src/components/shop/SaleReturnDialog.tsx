'use client'

import * as React from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
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
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'

interface SaleItem {
  id: number
  productId: number
  name: string
  price: number
  quantity: number
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  saleInvoice?: string | number
  items: SaleItem[]
  onDone?: () => void
}

export function SaleReturnDialog({ open, onOpenChange, saleInvoice, items, onDone }: Props) {
  const [saleItemId, setSaleItemId] = React.useState<number | null>(null)
  const [quantity, setQuantity] = React.useState(1)
  const [cashDelta, setCashDelta] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('returns_exchange')

  React.useEffect(() => {
    if (open && items.length > 0) {
      setSaleItemId(items[0].id)
      setQuantity(1)
      setCashDelta(-items[0].price)
    }
  }, [open, items])

  const selected = items.find((i) => i.id === saleItemId)

  React.useEffect(() => {
    if (selected) setCashDelta(-selected.price * quantity)
  }, [selected, quantity])

  const submit = async () => {
    if (!saleItemId || quantity <= 0) return
    setSaving(true)
    try {
      await api('/api/sales/returns', {
        method: 'POST',
        body: { saleItemId, quantity, cashDelta },
      })
      toast.success('تم تسجيل المرتجع')
      onOpenChange(false)
      onDone?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل المرتجع')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            مرتجع فاتورة #{saleInvoice}
          </DialogTitle>
        </DialogHeader>

        {!enabled ? (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground dark:border-warning-subtle dark:bg-warning-subtle/20 dark:text-warning-subtle-foreground">
            ميزة الإرجاع/الاستبدال متاحة في باقة الملابس الاحترافية فقط.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>الصنف</Label>
              <select
                value={saleItemId ?? ''}
                onChange={(e) => setSaleItemId(parseInt(e.target.value))}
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} — كمية أصلية: {it.quantity}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>الكمية المرتجعة</Label>
              <Input
                type="number"
                min={1}
                max={selected?.quantity ?? 1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label>المبلغ النقدي المسترد (سالب = رد نقدي للعميل)</Label>
              <Input
                type="number"
                step="0.01"
                value={cashDelta}
                onChange={(e) => setCashDelta(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          {enabled && (
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              تأكيد المرتجع
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
