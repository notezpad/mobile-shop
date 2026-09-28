'use client'

import * as React from 'react'
import { Loader2, Wallet } from 'lucide-react'
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
  { value: 'vodafone_cash', label: 'محافظ إلكترونية' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'محفظة إلكترونية' },
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  customerId: number | null
  customerName: string
  currentBalance: number
  onSaved?: (newBalance: number) => void
}

export function PaymentDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
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
  }, [open, customerId])

  const submit = async () => {
    if (!customerId) {
      toast.error('العميل غير محدد')
      return
    }
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر')
      return
    }
    setSaving(true)
    try {
      const created = await api<{ id: number; amount: number; customer: { balance: number } }>(
        '/api/payments',
        {
          method: 'POST',
          body: {
            customerId,
            amount: num,
            method,
            note: note.trim() || null,
          },
        }
      )
      const newBalance = created?.customer?.balance ?? currentBalance - num
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
            <Wallet className="size-5 text-primary" />
            تسجيل دفعة عميل
          </DialogTitle>
          <DialogDescription className="sr-only">
            نموذج تسجيل دفعة جديدة من العميل
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer name (read-only) */}
          <div className="space-y-1.5">
            <Label>العميل</Label>
            <Input value={customerName} readOnly disabled className="bg-muted/40" />
          </div>

          {/* Current balance (read-only) */}
          <div className="space-y-1.5">
            <Label>الرصيد الحالي</Label>
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
            <Label htmlFor="pay-amount">
              المبلغ المدفوع <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0.01}
              step="0.01"
              placeholder="0.00"
              autoFocus={typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches}
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
            <Label htmlFor="pay-note">ملاحظات</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: رقم عملية فودافون — 12345"
            />
          </div>

          {/* Hint */}
          <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            💡 المبلغ سيُضاف للخزنة ويخصم من رصيد العميل
            {method !== 'cash' && (
              <span className="mt-0.5 block text-warning-subtle-foreground">
                سيُحتسب عمولة على هذه الدفعة حسب إعدادات المحل
              </span>
            )}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={saving || !customerId}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            💾 حفظ الدفعة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
