'use client'

import * as React from 'react'
import { Banknote, Loader2, MessageSquareText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCurrency } from '@/lib/format'
import { PAY_METHODS, PAY_METHOD_LABELS, quickCashAmounts, resolveTender, type PayMethod } from '@/lib/pos/pricing'
import { usePosStore, type PayMode } from '@/lib/pos/store'
import { selectPayable } from '@/lib/pos/totals'
import { DiscountPopover } from './DiscountPopover'
import { DraftNumberInput } from './DraftNumberInput'
import { PayMethodBar } from './PayMethodBar'

interface Props {
  submitting: boolean
  onCheckout: () => void
  discountOpen: boolean
  onDiscountOpenChange: (o: boolean) => void
}

/** Footer of the ticket: totals → discount/note → how it's paid → the single primary action. */
export function PayPanel({ submitting, onCheckout, discountOpen, onDiscountOpenChange }: Props) {
  const s = usePosStore()
  const payable = React.useMemo(() => selectPayable(s.lines, s.discount), [s.lines, s.discount])
  const { subtotal, discountAmount, total, discountError } = payable

  const tender = React.useMemo(
    () => resolveTender(total, { split: s.split, paidFull: s.paidFull, payMethod: s.payMethod, cashGiven: s.cashGiven, paidAmount: s.paidAmount, splitAmounts: s.splitAmounts }),
    [total, s.split, s.paidFull, s.payMethod, s.cashGiven, s.paidAmount, s.splitAmounts],
  )
  const needsCustomer = tender.credit > 0 && !s.selectedCustomerId && !s.customerName.trim()
  const blocked = s.lines.length === 0 || !!discountError || !!tender.error || needsCustomer
  const mode: PayMode = s.split ? 'split' : s.paidFull ? 'full' : 'partial'
  const itemCount = s.lines.length
  const quick = quickCashAmounts(total)
  const splitPaid = tender.paid

  return (
    <div className="space-y-3 border-t bg-muted/30 p-3">
      {/* Totals */}
      <div className="space-y-1">
        {discountAmount > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>المجموع</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-destructive">
              <span>خصم</span>
              <span className="tabular-nums">− {formatCurrency(discountAmount)}</span>
            </div>
          </>
        )}
        <div className="flex items-end justify-between">
          <span className="text-sm text-muted-foreground">
            الإجمالي <span className="text-xs">({itemCount} {itemCount === 1 ? 'صنف' : 'أصناف'})</span>
          </span>
          <span className="text-3xl font-extrabold leading-none tabular-nums text-primary" aria-live="polite">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* Optional extras — collapsed */}
      <div className="flex flex-wrap items-center gap-2">
        <DiscountPopover open={discountOpen} onOpenChange={onDiscountOpenChange} error={discountError} disabled={s.lines.length === 0} />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3 text-xs">
              <MessageSquareText className="size-3.5" />
              {s.note.trim() ? 'ملاحظة ✓' : '+ ملاحظة'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-2 p-3">
            <Input autoFocus value={s.note} maxLength={200} onChange={(e) => s.setNote(e.target.value)} placeholder="ملاحظة على الفاتورة" aria-label="ملاحظة على الفاتورة" />
            {s.note && (
              <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => s.setNote('')}>
                <X className="size-4" /> مسح الملاحظة
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* How it's paid */}
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && s.setPayMode(v as PayMode, total)}
        className="grid w-full grid-cols-3 gap-1 rounded-xl bg-muted p-1"
        aria-label="طريقة السداد"
      >
        {([['full', 'سداد كامل'], ['partial', 'جزئي / آجل'], ['split', 'مقسّم']] as const).map(([v, label]) => (
          <ToggleGroupItem key={v} value={v} className="h-9 rounded-lg px-1 text-xs data-[state=on]:bg-card data-[state=on]:shadow-xs">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {mode !== 'split' && <PayMethodBar value={s.payMethod} onChange={s.setPayMethod} />}

      {/* Full + cash → cash given / change */}
      {mode === 'full' && s.payMethod === 'cash' && total > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant={s.cashGiven === 0 ? 'default' : 'outline'} className="h-9 rounded-full px-3 text-xs" onClick={() => s.setCashGiven(0)}>
              المضبوط
            </Button>
            {quick.map((q) => (
              <Button key={q} type="button" size="sm" variant={s.cashGiven === q ? 'default' : 'outline'} className="h-9 rounded-full px-3 text-xs tabular-nums" onClick={() => s.setCashGiven(q)}>
                {q}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">المستلم</Label>
            <DraftNumberInput allowDecimal value={s.cashGiven} onCommit={s.setCashGiven} className="h-10 flex-1 text-center font-semibold tabular-nums" aria-label="المبلغ المستلم" />
          </div>
          {tender.change > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-success-subtle px-3 py-2 text-success-subtle-foreground">
              <span className="text-sm">الباقي للعميل</span>
              <span className="text-xl font-extrabold tabular-nums">{formatCurrency(tender.change)}</span>
            </div>
          )}
        </div>
      )}

      {/* Partial → amount */}
      {mode === 'partial' && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">المبلغ المدفوع ({PAY_METHOD_LABELS[s.payMethod]})</Label>
          <DraftNumberInput allowDecimal value={s.paidAmount} onCommit={s.setPaidAmount} className="h-11 text-lg font-semibold tabular-nums" aria-label="المبلغ المدفوع" />
          {tender.credit > 0 && <p className="text-xs text-destructive">المتبقي (آجل): {formatCurrency(tender.credit)}</p>}
        </div>
      )}

      {/* Split → one amount per method */}
      {mode === 'split' && (
        <div className="space-y-1.5">
          {PAY_METHODS.map((m: PayMethod) => (
            <div key={m} className="flex items-center gap-2">
              <Label className="w-24 shrink-0 text-xs text-muted-foreground">{PAY_METHOD_LABELS[m]}</Label>
              <DraftNumberInput allowDecimal value={s.splitAmounts[m] ?? 0} onCommit={(n) => s.setSplitAmount(m, n)} className="h-9 flex-1 text-center tabular-nums" aria-label={PAY_METHOD_LABELS[m]} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs"
                onClick={() => s.setSplitAmount(m, Math.max(0, Math.round((total - splitPaid + (s.splitAmounts[m] ?? 0)) * 100) / 100))}
              >
                الباقي
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">المدفوع {formatCurrency(splitPaid)}</span>
            {tender.credit > 0 ? <span className="text-destructive">آجل {formatCurrency(tender.credit)}</span> : tender.change > 0 ? <span className="font-semibold text-success-subtle-foreground">الباقي للعميل {formatCurrency(tender.change)}</span> : null}
          </div>
        </div>
      )}

      {/* Problems that block payment */}
      {(discountError || tender.error) && <p className="text-xs text-destructive">{discountError ?? tender.error}</p>}
      {needsCustomer && <p className="text-xs text-destructive">البيع بالآجل لازم يكون مرتبط بعميل</p>}

      <Button type="button" variant="gradient" className="h-14 w-full justify-between rounded-xl px-5 text-lg" onClick={onCheckout} disabled={submitting || blocked}>
        <span className="flex items-center gap-2">
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
          دفع وطباعة
        </span>
        <kbd className="hidden rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium lg:inline" dir="ltr">F9</kbd>
      </Button>
    </div>
  )
}
