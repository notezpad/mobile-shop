'use client'

/**
 * 🛡️ 2026-09-30 (C9/C10 — إعادة بناء بنموذج الموردين):
 * مرتجع عميل جزئي/كلي مربوط بالفاتورة — زي PurchaseReturnDialog بالظبط:
 *   - كل أصناف الفاتورة ظاهرة قدام بعض، ولكل سطر حقل كميته المرتجعة (0 … المتبقي).
 *   - زرار "إرجاع كل المتبقي" = مرتجع كلي للفاتورة.
 *   - الفاتورة الآجلة: القيمة بتخصم من حساب العميل (الدين بيقل)، والرد الكاش
 *     اختياري ومحدود بـ(المدفوع − المسترد) — السيرفر هو اللي بيحسب وبيحدد.
 *   - فاتورة بدون عميل: القيمة كلها ترجع كاش (محدود بالمدفوع الفعلي).
 */

import * as React from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
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
  /** طريقة دفع الفاتورة — بتكون الطريقة الافتراضية للرد */
  paymentMethod?: string | null
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

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function SaleReturnDialog({ open, onOpenChange, sale, items, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* DialogContent بيفك التركيب لما يقفل، فالفورم بيبدأ نضيف كل مرة؛
            key بيغطي تبديل الفواتير. */}
        <ReturnForm
          key={sale.id}
          sale={sale}
          items={items}
          onClose={() => onOpenChange(false)}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  )
}

function ReturnForm({
  sale,
  items,
  onClose,
  onDone,
}: {
  sale: SaleReturnSaleInfo
  items: SaleReturnItem[]
  onClose: () => void
  onDone?: () => void
}) {
  const [qtys, setQtys] = React.useState<Record<number, string>>({})
  const [refund, setRefund] = React.useState('')
  const [refundTouched, setRefundTouched] = React.useState(false)
  const [refundMethod, setRefundMethod] = React.useState(sale.paymentMethod || 'cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const inFlight = React.useRef(false) // حاجز صلب ضد الدوس المزدوج

  const remainingOf = (it: SaleReturnItem) => Math.max(0, it.quantity - (it.returnedQty ?? 0))

  const lines = React.useMemo(() => {
    return items
      .map((it) => {
        const max = Math.max(0, it.quantity - (it.returnedQty ?? 0))
        const q = Math.min(max, Math.max(0, Math.floor(Number(qtys[it.id]) || 0)))
        return { it, q }
      })
      .filter((l) => l.q > 0)
  }, [items, qtys])

  const returnValue = round2(lines.reduce((s, l) => s + l.it.price * l.q, 0))

  // 🛡️ الرد الكاش مبيتأكدش أبداً: الافتراضي 0 → القيمة بتخصم من حساب العميل
  // والخزنة متلمسهاش. لو العميل هياخد فلوس فعلاً المستخدم يكتبها (أو يدوس
  // الاختصار). فاتورة بدون عميل = القيمة كلها ترجع كاش.
  const hasCustomer = !!sale.customerId
  const paidNotRefunded = Math.max(0, round2((sale.paid ?? 0) - (sale.refunded ?? 0)))
  const maxRefund = Math.min(returnValue, paidNotRefunded)
  const defaultRefund = hasCustomer ? 0 : maxRefund
  const refundNum = hasCustomer
    ? refundTouched
      ? Number(refund) || 0
      : defaultRefund
    : maxRefund
  const refundInvalid =
    refundNum < 0 ||
    round2(refundNum) > round2(maxRefund) ||
    (!hasCustomer && round2(refundNum) !== round2(maxRefund))
  const balanceDrop = round2(returnValue - refundNum)
  const cashShort = !hasCustomer && paidNotRefunded < returnValue

  const setAll = () => {
    const next: Record<number, string> = {}
    for (const it of items) {
      const r = remainingOf(it)
      if (r > 0) next[it.id] = String(r)
    }
    setQtys(next)
  }

  const anyRemaining = items.some((it) => remainingOf(it) > 0)

  const submit = async () => {
    if (inFlight.current) return
    if (lines.length === 0) {
      toast.error('اختر كمية للإرجاع من صنف واحد على الأقل')
      return
    }
    if (refundInvalid) {
      toast.error(
        !hasCustomer
          ? `فاتورة بدون عميل — المسترد لازم يساوي المدفوع المتاح (${formatCurrency(maxRefund)})`
          : `المسترد لازم يكون بين صفر و ${formatCurrency(maxRefund)} (المدفوع فعلاً على الفاتورة ولم يُسترد)`,
      )
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      await api('/api/sales/returns', {
        method: 'POST',
        body: {
          saleId: sale.id,
          lines: lines.map((l) => ({ saleItemId: l.it.id, quantity: l.q })),
          refund: round2(refundNum),
          refundMethod: refundNum > 0 ? refundMethod : undefined,
          note: note.trim() || undefined,
        },
      })
      toast.success('تم تسجيل مرتجع العميل')
      onDone?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل المرتجع')
      inFlight.current = false
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <RotateCcw className="size-5 text-destructive" />
          مرتجع عميل — {sale.invoiceNo ?? `#${sale.id}`}
        </DialogTitle>
        <DialogDescription>
          حدّد الأصناف والكميات المرتجعة (جزئي أو الفاتورة كلها). الكمية بترجع للمخزن.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">أصناف الفاتورة</span>
          {anyRemaining && (
            <Button type="button" variant="outline" size="sm" onClick={setAll}>
              إرجاع كل المتبقي
            </Button>
          )}
        </div>

        <div className="divide-y rounded-lg border">
          {items.map((it) => {
            const remaining = remainingOf(it)
            return (
              <div key={it.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatCurrency(it.price)} × {it.quantity}
                    {(it.returnedQty ?? 0) > 0 && (
                      <span className="text-destructive"> — مرتجع سابقاً: {it.returnedQty}</span>
                    )}
                  </p>
                </div>
                {remaining > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={remaining}
                      step={1}
                      dir="ltr"
                      value={qtys[it.id] ?? ''}
                      placeholder="0"
                      onChange={(e) => setQtys((p) => ({ ...p, [it.id]: e.target.value }))}
                      className="h-9 w-20 text-center tabular-nums"
                      aria-label={`كمية مرتجع ${it.name}`}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">/ {remaining}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">مرتجع بالكامل</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span>قيمة المرتجع (سعر البيع الفعلي)</span>
            <span className="font-semibold tabular-nums">{formatCurrency(returnValue)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            السيرفر بيحسب القيمة من سعر الفاتورة نفسه — مفيش أي تعديل يدوي على المبلغ.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="sr-refund">
              {hasCustomer
                ? `الرد كاش دلوقتي (سيبها 0 لو بتخصم من حساب العميل بس) — الحد ${formatCurrency(maxRefund)}`
                : 'المبلغ المسترد للعميل (كاش)'}
            </Label>
            <Input
              id="sr-refund"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              className="text-left tabular-nums"
              value={refundTouched ? refund : String(round2(defaultRefund))}
              disabled={!hasCustomer}
              onChange={(e) => {
                setRefundTouched(true)
                setRefund(e.target.value)
              }}
            />
            {hasCustomer && maxRefund > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRefundTouched(true)
                  setRefund(String(round2(maxRefund)))
                }}
              >
                العميل استلم كل المبلغ ({formatCurrency(maxRefund)})
              </Button>
            )}
            {refundInvalid && returnValue > 0 && (
              <p className="text-xs text-destructive">
                المبلغ لازم يكون بين صفر و {formatCurrency(maxRefund)}
              </p>
            )}
          </div>

          {refundNum > 0 && (
            <div className="space-y-1.5">
              <Label>طريقة رد المبلغ</Label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                {REFUND_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>يخرج من الخزنة (رد كاش)</span>
              <span className="tabular-nums">{formatCurrency(refundNum > 0 ? refundNum : 0)}</span>
            </div>
            {hasCustomer && (
              <div className="flex justify-between">
                <span>يخصم من حساب العميل {sale.customerName ? `(${sale.customerName})` : ''}</span>
                <span className="tabular-nums">{formatCurrency(balanceDrop)}</span>
              </div>
            )}
          </div>

          {cashShort && (
            <p className="rounded-md border border-warning-subtle bg-warning-subtle/20 p-2 text-xs">
              فاتورة بدون عميل والمدفوع عليها أقل من قيمة المرتجع — سيُرد المدفوع المتاح (
              {formatCurrency(paidNotRefunded)}) والباقي يتسجل كقيمة مرتجعة بدون رد نقدي.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sr-note">سبب/ملاحظة المرتجع (اختياري)</Label>
          <Input
            id="sr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثال: صنف تالف / العميل غيّر رأيه"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="destructive" onClick={submit} disabled={saving || lines.length === 0 || refundInvalid}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          تأكيد المرتجع
        </Button>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  )
}
