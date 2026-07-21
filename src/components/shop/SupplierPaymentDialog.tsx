'use client'

import * as React from 'react'
import { Loader2, Truck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'cash', label: 'كاش' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'فوري' },
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  supplierId: number | null
  supplierName: string
  currentBalance: number
  onSaved?: (newBalance: number) => void
}

export function SupplierPaymentDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  currentBalance,
  onSaved,
}: Props) {
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setAmount('')
      setMethod('cash')
      setNote('')
    }
  }, [open, supplierId])

  const submit = async () => {
    if (!supplierId) {
      toast.error('المورد غير محدد')
      return
    }
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    setSaving(true)
    try {
      const created = await api<{ id: number; amount: number; supplier: { balance: number } }>(
        '/api/supplier-payments',
        {
          method: 'POST',
          body: {
            supplierId,
            amount: num,
            method,
            note: note.trim() || null,
          },
        }
      )
      const newBalance = created?.supplier?.balance ?? currentBalance - num
      toast.success(`تم تسجيل الدفعة بنجاح — الرصيد الجديد: ${formatCurrency(newBalance)}`)
      onSaved?.(newBalance)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل الدفعة')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            تسجيل دفعة لمورد
          </DialogTitle>
          <DialogDescription className="sr-only">
            نموذج تسجيل دفعة جديدة للمورد
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Supplier name (read-only) */}
          <div className="space-y-1.5">
            <Label>المورد</Label>
            <Input value={supplierName} readOnly disabled className="bg-muted/40" />
          </div>

          {/* Current balance (read-only) */}
          <div className="space-y-1.5">
            <Label>المبلغ المستحق حالياً</Label>
            <Input
              value={formatCurrency(currentBalance)}
              readOnly
              disabled
              className={
                currentBalance > 0
                  ? 'bg-muted/40 font-semibold text-destructive tabular-nums'
                  : 'bg-muted/40 font-semibold text-success-subtle-foreground tabular-nums'
              }
            />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="sp-amount">
              المبلغ المدفوع <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sp-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0.01}
              step="0.01"
              placeholder="0.00"
              autoFocus
              dir="ltr"
              className="text-left"
            />
          </div>

          {/* Method */}
          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر الطريقة" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="sp-note">ملاحظات</Label>
            <Input
              id="sp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: رقم عملية فودافون — 12345"
            />
          </div>

          {/* Hint */}
          <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            💡 المبلغ سيُخصم من الخزنة ويقلل المستحق للمورد
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving || !supplierId}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            💾 حفظ الدفعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
