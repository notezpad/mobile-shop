'use client'

/**
 * دفعة عميل — واجهة بهوية صفحة العملاء (سماوي/نيلي).
 * المنطق والـ API والتحقق زي ما هم: POST /api/payments { customerId, amount, method, note }.
 * اتغيّر الشكل بس، وزاد: اختصار "كل المستحق"، وملخص "بعد الدفعة" قبل التأكيد.
 */

import * as React from 'react'
import { Check, Info, Loader2, Users, Wallet } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DecimalInput, DialogHero, MethodPills, SectionTitle } from './customer-dialog-ui'

// الطرق المتاحة في الدفعات: كاش + محفظة إلكترونية فقط
const PAYMENT_METHODS = ['cash', 'fawry'] as const

const QUICK_AMOUNTS = [100, 500, 1000, 5000]

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

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
  const [amount, setAmount] = React.useState(0)
  const [method, setMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setAmount(0)
      setMethod('cash')
      setNote('')
    }
  }, [open, customerId])

  const owed = currentBalance > 0
  const after = r2(currentBalance - amount)
  const over = owed && amount > currentBalance + 0.005

  const submit = async () => {
    if (!customerId) {
      toast.error('العميل غير محدد')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
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
            amount,
            method,
            note: note.trim() || null,
          },
        }
      )
      const newBalance = created?.customer?.balance ?? currentBalance - amount
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
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        mobileSheet
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          if (typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches) {
            document.getElementById('pay-amount')?.focus()
          }
        }}
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHero
          icon={Wallet}
          title="تسجيل دفعة عميل"
          subtitle="المبلغ بيدخل الخزنة ويتخصم من رصيد العميل."
        />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {/* العميل + الرصيد */}
          <section>
            <SectionTitle n={1}>العميل</SectionTitle>
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-950 text-lg font-extrabold text-sky-50 dark:bg-sky-700">
                {customerName.trim().charAt(0) || <Users className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold leading-tight">{customerName || '—'}</p>
                <p
                  className={cn(
                    'mt-0.5 text-xs font-semibold tabular-nums',
                    owed ? 'text-rose-600 dark:text-rose-300' : 'text-foreground/65'
                  )}
                >
                  {owed
                    ? `عليه ${formatCurrency(currentBalance)}`
                    : currentBalance < 0
                      ? `له رصيد دائن ${formatCurrency(Math.abs(currentBalance))}`
                      : 'حسابه مسوّى'}
                </p>
              </div>
            </div>
          </section>

          {/* المبلغ */}
          <section>
            <SectionTitle n={2}>المبلغ</SectionTitle>
            <label htmlFor="pay-amount" className="sr-only">
              المبلغ المدفوع
            </label>
            <DecimalInput
              id="pay-amount"
              value={amount}
              onChange={setAmount}
              suffix="جنيه"
              invalid={false}
              className="[&_input]:h-14 [&_input]:text-2xl"
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {owed && (
                <button
                  type="button"
                  onClick={() => setAmount(r2(currentBalance))}
                  disabled={amount === r2(currentBalance)}
                  className="h-8 whitespace-nowrap rounded-full border border-sky-700 bg-sky-700 px-3 text-xs font-bold text-white transition-colors hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-600/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  كل المديونية ({formatCurrency(currentBalance)})
                </button>
              )}
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(r2(amount + a))}
                  className="h-8 whitespace-nowrap rounded-full border bg-background px-3 text-xs font-bold tabular-nums text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-600/40"
                >
                  + {a}
                </button>
              ))}
              {amount > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(0)}
                  className="h-8 rounded-full px-3 text-xs font-bold text-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-sky-600/40"
                >
                  مسح
                </button>
              )}
            </div>
          </section>

          {/* الطريقة + ملاحظة */}
          <section>
            <SectionTitle n={3}>استلمت إزاي؟</SectionTitle>
            <MethodPills value={method} onChange={setMethod} label="طريقة الدفع" methods={PAYMENT_METHODS} />
            <input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة (اختياري) — مثال: رقم عملية فودافون 12345"
              aria-label="ملاحظات"
              className="mt-3 h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-sky-600 focus:ring-[3px] focus:ring-sky-600/25"
            />
          </section>

          {/* بعد التأكيد */}
          {amount > 0 && (
            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="space-y-2.5 bg-muted/30 p-4">
                <p className="text-xs font-bold text-foreground/70">بعد التأكيد</p>
                <ul className="space-y-2 text-sm">
                  <ResultLine dot="bg-sky-600" label="يدخل الخزنة" value={formatCurrency(amount)} />
                  <ResultLine
                    dot="bg-indigo-400"
                    label={
                      after > 0
                        ? 'هيفضل عليه'
                        : after < 0
                          ? 'هيبقى له رصيد دائن'
                          : 'حسابه هيتسوّى'
                    }
                    value={formatCurrency(Math.abs(after))}
                  />
                </ul>
              </div>
            </section>
          )}

          {over && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              الدفعة أكبر من مديونية العميل ({formatCurrency(currentBalance)}) — الفرق هيبقى رصيد دائن لصالح العميل (المحل بيبقى مديون له).
            </p>
          )}
        </div>

        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-foreground/60">المبلغ</p>
              <p className="truncate text-lg font-extrabold tabular-nums">{formatCurrency(amount)}</p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="h-11 rounded-xl px-5">
              إلغاء
            </Button>
            <Button
              onClick={submit}
              disabled={saving || !customerId || amount <= 0}
              className="h-11 rounded-xl bg-sky-700 px-6 font-bold text-white hover:bg-sky-600 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              حفظ الدفعة
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResultLine({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', dot)} />
      <span className="font-semibold text-foreground/80">{label}</span>
      <span aria-hidden className="mb-0.5 h-px flex-1 border-b border-dotted border-foreground/25" />
      <b className="font-extrabold tabular-nums">{value}</b>
    </li>
  )
}
