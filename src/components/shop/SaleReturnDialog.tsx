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
import { formatCurrency } from '@/lib/format'

export interface SaleReturnItem {
  id: number
  productId?: number | null
  name: string
  price: number
  quantity: number
  returnedQty?: number
  unitLabel?: string | null
  unitQuantity?: number | null
}

export interface SaleReturnSaleInfo {
  id: number
  invoiceNo?: string | null
  customerId?: number | null
  customerName?: string | null
  /** الكاش اللي دخل الخزنة فعلاً على الفاتورة دي لحد الآن */
  paid: number
  /** الكاش اللي خرج بالفعل عبر مرتجعات سابقة */
  refunded?: number
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  sale: SaleReturnSaleInfo
  items: SaleReturnItem[]
  onDone?: () => void
}

const REFUND_METHODS = [
  { value: 'cash', label: 'كاش' },
  { value: 'vodafone_cash', label: 'محفظة إلكترونية' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'محفظة إلكترونية (فوري)' },
]

/**
 * 🛡️ 2026-09-30 (C9/C10): حوار المرتجع الجزئي الجديد.
 *
 *  - مبطّق أخيراً في شاشة سجل المبيعات (كان موجود كملف ولا حد بيناديه).
 *  - مفيش أي إدخال حر للفلوس: السيرفر هو اللي بيحسب قيمة المرتجع من سعر
 *    البيع الفعلي، والـ refund محدود بـ (المدفوع − المسترد).
 *  - افتراضياً القيمة بتحول على حساب العميل؛ "رد كاش دلوقتي" اختياري بطريقة محددة.
 */
export function SaleReturnDialog({ open, onOpenChange, sale, items, onDone }: Props) {
  const [saleItemId, setSaleItemId] = React.useState<number | null>(null)
  const [quantity, setQuantity] = React.useState(1)
  const [refund, setRefund] = React.useState(0)
  const [refundMethod, setRefundMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const maxRemaining = (it: SaleReturnItem | undefined) =>
    it ? Math.max(0, it.quantity - (it.returnedQty ?? 0)) : 0

  React.useEffect(() => {
    if (open && items.length > 0) {
      const first = items.find((i) => i.quantity - (i.returnedQty ?? 0) > 0) ?? items[0]
      setSaleItemId(first.id)
      setQuantity(1)
      setRefund(0)
      setNote('')
    }
  }, [open, items])

  const selected = items.find((i) => i.id === saleItemId)
  const remaining = maxRemaining(selected)

  React.useEffect(() => {
    if (quantity > remaining) setQuantity(Math.max(1, remaining))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  const returnValue = selected ? Math.round(selected.price * quantity * 100) / 100 : 0
  const paidNotRefunded = Math.max(0, (sale.paid ?? 0) - (sale.refunded ?? 0))
  const maxRefund = Math.min(returnValue, paidNotRefunded)
  const creditPart = Math.max(0, Math.round((returnValue - refund) * 100) / 100)

  const submit = async () => {
    if (!saleItemId || quantity <= 0 || quantity > remaining) return
    if (refund > maxRefund + 0.005) {
      toast.error(`المسترد مينفعش يعدّي ${formatCurrency(maxRefund)} (المدفوع غير المسترد على الفاتورة)`)
      return
    }
    setSaving(true)
    try {
      await api('/api/sales/returns', {
        method: 'POST',
        body: {
          saleId: sale.id,
          lines: [{ saleItemId, quantity }],
          refund,
          refundMethod: refund > 0 ? refundMethod : undefined,
          note: note.trim() || undefined,
        },
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
            مرتجع من فاتورة #{sale.invoiceNo ?? sale.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>الصنف</Label>
            <select
              value={saleItemId ?? ''}
              onChange={(e) => {
                setSaleItemId(parseInt(e.target.value))
                setQuantity(1)
              }}
              className="w-full rounded-md border bg-background p-2 text-sm"
            >
              {items.map((it) => {
                const rem = it.quantity - (it.returnedQty ?? 0)
                return (
                  <option key={it.id} value={it.id} disabled={rem <= 0}>
                    {it.name} — متاح للإرجاع: {rem} (الأصلي {it.quantity})
                  </option>
                )
              })}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>الكمية المرتجعة</Label>
            <Input
              type="number"
              min={1}
              max={remaining}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">قيمة المرتجع (سعر البيع الفعلي):</span>
              <span className="font-semibold tabular-nums">{formatCurrency(returnValue)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              السيرفر بيحسب القيمة من سعر الفاتورة نفسه — مفيش أي تعديل يدوي على المبلغ.
            </p>
          </div>

          {sale.customerId ? (
            <div className="flex flex-col gap-1.5">
              <Label>
                الرد كاش دلوقتي (اختياري — الحد الأقصى {formatCurrency(maxRefund)})
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={maxRefund}
                value={refund}
                onChange={(e) => setRefund(Math.max(0, Math.min(maxRefund, Number(e.target.value) || 0)))}
              />
              <div className="flex flex-col gap-1.5">
                <Label>طريقة الرد</Label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  disabled={refund <= 0}
                  className="w-full rounded-md border bg-background p-2 text-sm disabled:opacity-50"
                >
                  {REFUND_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {creditPart > 0 && (
                <p className="text-xs text-muted-foreground">
                  الباقي ({formatCurrency(creditPart)}) هيتخصم من حساب العميل{' '}
                  {sale.customerName ? `(${sale.customerName})` : ''} تلقائياً.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-warning-subtle bg-warning-subtle/20 p-3 text-xs">
              فاتورة بدون عميل — قيمة المرتجع كلها هترجع كاش للعميل دلوقتي
              {paidNotRefunded < returnValue && ' (ملحوظة: المدفوع على الفاتورة أقل من قيمة المرتجع — سيُرد المدفوع المتاح)'}
              .
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>سبب/ملاحظة المرتجع (اختياري)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: صنف تالف / العميل غيّر رأيه"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={saving || remaining <= 0}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            تأكيد المرتجع
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
