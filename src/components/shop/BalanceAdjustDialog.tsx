'use client'

/**
 * 🆕 2026-10-22: دايلوج تسوية الرصيد (أدمن فقط) — مشترك بين العملاء والموردين.
 * بيحدد الرصيد الجديد + سبب إجباري، والسيرفر بيحسب الفرق ويسجله كقيد موثّق
 * (BalanceEntry) يظهر في كشف الحساب. مفيش كاش بيتحرك هنا — حركة دفاتر محضة.
 */

import * as React from 'react'
import { Loader2, Check, Scale } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function BalanceAdjustDialog({
  open,
  onOpenChange,
  kind,
  refId,
  entityName,
  currentBalance,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kind: 'customer' | 'supplier'
  refId: number | null
  entityName: string
  currentBalance: number
  onSaved: () => void
}) {
  const [newBalance, setNewBalance] = React.useState(0)
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setNewBalance(Math.round((currentBalance + Number.EPSILON) * 100) / 100)
      setReason('')
    }
  }, [open, currentBalance])

  const delta = React.useMemo(
    () => Math.round((newBalance - currentBalance + Number.EPSILON) * 100) / 100,
    [newBalance, currentBalance],
  )

  const submit = async () => {
    if (!refId) return
    if (Math.abs(delta) < 0.005) {
      toast.error('الرصيد منضبط على القيمة دي أصلاً')
      return
    }
    if (reason.trim().length < 3) {
      toast.error('سبب التسوية مطلوب (3 حروف على الأقل)')
      return
    }
    setSaving(true)
    try {
      // 🛡️ 2026-10-22 (مراجعة): بنبعت الرصيد اللي شافه المستخدم (expectedBalance) —
      // لو حصلت مبيعات/دفعات في الأثناء والرصيد على السيرفر اختلف، السيرفر بيرفض
      // 409 بدل ما يضبط الرصيد فوق حركات جديدة. والتسوية أونلاين فقط — مبتتحطش
      // في طابور الأوفلاين (api-offline بيرمي خطأ واضح لو النت مقطوع).
      await api('/api/balance-entries', {
        method: 'POST',
        body: { kind, refId, newBalance, expectedBalance: currentBalance, reason: reason.trim() },
      })
      toast.success('تم تسجيل التسوية — هتظهر في كشف الحساب فوراً')
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل التسوية')
    } finally {
      setSaving(false)
    }
  }

  const isCustomer = kind === 'customer'

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent mobileSheet className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-violet-500/20 bg-violet-500/[0.07] p-5 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Scale className="size-5" />
            </span>
            تسوية رصيد {isCustomer ? 'العميل' : 'المورد'}
          </DialogTitle>
          <DialogDescription>
            {entityName} — الرصيد الحالي {formatCurrency(currentBalance)}. التسوية بتتسجل كقيد موثّق في كشف الحساب.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-2">
            <Label htmlFor="ba-new-balance">الرصيد الجديد الصحيح</Label>
            <DecimalInput
              id="ba-new-balance"
              value={newBalance}
              onChange={setNewBalance}
              min={-999999999}
              label="الرصيد الجديد"
              suffix="جنيه"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {isCustomer
                ? 'اكتب الرصيد الصح: موجب = عليه ليك، سالب = له رصيد دائن (اكتب السالب في الخانة).'
                : 'اكتب الرصيد الصح: موجب = عليك له، سالب = لنا عنده (اكتب السالب في الخانة).'}
            </p>
          </div>

          <div
            className={cn(
              'rounded-xl border p-3 text-sm',
              Math.abs(delta) < 0.005
                ? 'border-border bg-muted/40 text-muted-foreground'
                : delta > 0
                  ? 'border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                  : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
            )}
          >
            {Math.abs(delta) < 0.005 ? (
              'الرصيد هيفضل زي ما هو — مفيش فرق.'
            ) : (
              <>
                الفرق: <b className="tabular-nums">{delta > 0 ? '+' : '−'}{num(Math.abs(delta))}</b> جنيه{' '}
                {isCustomer
                  ? delta > 0
                    ? '— دين العميل هيزيد.'
                    : '— دين العميل هيقل.'
                  : delta > 0
                    ? '— اللي عليك للمورد هيزيد.'
                    : '— اللي عليك للمورد هيقل.'}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ba-reason">
              سبب التسوية <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ba-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
              placeholder="إجباري — مثال: فرق مطابقة يوم الصفر مع كشف النظام القديم"
              className="h-11"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-row gap-2 border-t bg-muted/30 p-4 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button
            size="lg"
            onClick={submit}
            disabled={saving || Math.abs(delta) < 0.005 || reason.trim().length < 3}
            className="min-w-32 border-0 bg-violet-700 text-white hover:bg-violet-600"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            تسجيل التسوية
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* حقل مبلغ بسيط هنا بدل استيراد DecimalInput من ملف هوية معين — عشان الدايلوج مشترك */
function DecimalInput({
  value,
  onChange,
  min = 0,
  id,
  label,
  suffix,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  id?: string
  label?: string
  suffix?: string
}) {
  const [focus, setFocus] = React.useState(false)
  const [text, setText] = React.useState('')
  const normalize = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100
  return (
    <div className="relative">
      <input
        id={id}
        dir="ltr"
        inputMode="decimal"
        aria-label={label}
        value={focus ? text : String(r2(value))}
        onFocus={(e) => {
          setFocus(true)
          setText(String(r2(value)))
          e.currentTarget.select()
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          let raw = normalize(e.target.value).replace(/[^0-9.\-]/g, '')
          const dot = raw.indexOf('.')
          if (dot !== -1) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '')
          setText(raw)
          const n = parseFloat(raw)
          onChange(Number.isFinite(n) ? Math.max(min, n) : 0)
        }}
        className={cn(
          'w-full rounded-xl border bg-background h-11 text-base text-left font-extrabold tabular-nums outline-none transition-shadow',
          suffix ? 'pl-3 pr-14' : 'px-3',
          'focus:border-violet-600 focus:ring-[3px] focus:ring-violet-600/25',
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-foreground/55">
          {suffix}
        </span>
      )}
    </div>
  )
}
