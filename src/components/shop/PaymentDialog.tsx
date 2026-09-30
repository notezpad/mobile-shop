'use client'

import * as React from 'react'
import { Loader2, Wallet, Check, Banknote, Smartphone, Landmark, CreditCard, AlertTriangle } from 'lucide-react'
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
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'cash', label: 'كاش' },
  { value: 'vodafone_cash', label: 'محافظ إلكترونية' },
  { value: 'instapay', label: 'انستاباي' },
  { value: 'fawry', label: 'محفظة إلكترونية' },
]

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  vodafone_cash: Smartphone,
  instapay: Landmark,
  fawry: CreditCard,
}

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000]

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

  const overpay =
    currentBalance > 0 && parseFloat(amount) > currentBalance + 0.005

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[460px]">
        <DialogHeader className="border-b bg-gradient-to-br from-emerald-500/10 to-sky-500/10 p-5 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Wallet className="size-5" />
            </span>
            تسجيل دفعة عميل
          </DialogTitle>
          <DialogDescription>
            المبلغ هيتضاف للخزنة ويتخصم من رصيد العميل.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 p-5">
          {/* العميل + الرصيد الحالي (للقراءة فقط) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-2xl border bg-muted/40 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">العميل</p>
              <p className="mt-0.5 truncate text-sm font-bold">{customerName || '—'}</p>
            </div>
            <div
              className={cn(
                'min-w-0 rounded-2xl border p-3',
                currentBalance > 0 ? 'border-rose-500/25 bg-rose-500/5' : 'border-emerald-500/25 bg-emerald-500/5',
              )}
            >
              <p className="text-[11px] font-medium text-muted-foreground">الرصيد الحالي</p>
              <p
                className={cn(
                  'mt-0.5 truncate text-sm font-extrabold tabular-nums',
                  currentBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {formatCurrency(currentBalance)}
              </p>
            </div>
          </div>

          {/* المبلغ */}
          <div className="space-y-2">
            <Label htmlFor="pay-amount">
              المبلغ المدفوع <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !saving && customerId && submit()}
                min={0.01}
                step="0.01"
                placeholder="0.00"
                autoFocus={typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches}
                dir="ltr"
                className="h-14 pe-16 text-left text-2xl font-bold tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                جنيه
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(String((parseFloat(amount) || 0) + a))}
                  className="rounded-full border bg-background px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:border-primary hover:bg-primary-subtle hover:text-primary-subtle-foreground"
                >
                  + {a}
                </button>
              ))}
            </div>
          </div>

          {/* طريقة الدفع */}
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <div className="grid grid-cols-2 gap-2">
              {METHOD_OPTIONS.map((m) => {
                const active = method === m.value
                const Icon = METHOD_ICONS[m.value] ?? Banknote
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-2.5 text-start text-xs font-medium transition-all',
                      active
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 shadow-sm dark:text-emerald-300'
                        : 'bg-background text-muted-foreground hover:bg-muted/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-emerald-500/15' : 'bg-muted',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex-1 leading-tight">{m.label}</span>
                    {active && <Check className="size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ملاحظات */}
          <div className="space-y-2">
            <Label htmlFor="pay-note">ملاحظات</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: رقم عملية فودافون — 12345"
            />
          </div>

          {/* 🛡️ 2026-09-30 (N6): تحذير لو الدفعة أكبر من مديونية العميل */}
          {overpay && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                الدفعة أكبر من مديونية العميل ({formatCurrency(currentBalance)}) —
                الفرق هيبقى رصيد دائن لصالح العميل (المحل بيبقى مديون له).
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="gradient" size="lg" onClick={submit} disabled={saving || !customerId} className="min-w-36">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            حفظ الدفعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
