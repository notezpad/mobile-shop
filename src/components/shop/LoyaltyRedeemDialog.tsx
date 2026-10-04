'use client'

import * as React from 'react'
import { Loader2, Star } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
import { Field, InkInput, LockedNote, QuickChip } from './product-dialog-ui'
import { DialogHero } from './customer-dialog-ui'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  customer: { id: number; name: string; loyaltyPoints: number } | null
  onDone?: () => void
}

export function LoyaltyRedeemDialog({ open, onOpenChange, customer, onDone }: Props) {
  const [points, setPoints] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('loyalty')

  React.useEffect(() => {
    if (open) setPoints(0)
  }, [open])

  const balance = customer?.loyaltyPoints ?? 0
  const invalid = points > balance
  const remaining = balance - (points > 0 && !invalid ? points : 0)

  const submit = async () => {
    if (!customer) return
    if (points <= 0 || points > customer.loyaltyPoints) {
      toast.error('نقاط غير صحيحة')
      return
    }
    setSaving(true)
    try {
      await api(`/api/customers/${customer.id}/loyalty/redeem`, {
        method: 'POST',
        body: { points },
      })
      toast.success(`تم استبدال ${points} نقطة (${points} ج خصم)`)
      onOpenChange(false)
      onDone?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الاستبدال')
    } finally {
      setSaving(false)
    }
  }

  const chips = [100, 500, 1000].filter((n) => n < balance)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero icon={Star} title="استبدال نقاط الولاء" chip={customer?.name} subtitle="١ نقطة = ١ جنيه خصم" />
        <DialogBody className="space-y-4">
          {!enabled ? (
            <LockedNote>نظام الولاء متاح في باقة الملابس الاحترافية فقط.</LockedNote>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-dashed border-foreground/25 bg-card px-4 py-3">
                <span className="text-xs font-bold text-foreground/70">رصيد النقاط الحالي</span>
                <span className="text-xl font-extrabold tabular-nums">
                  {balance} <span className="text-xs font-bold text-foreground/60">نقطة</span>
                </span>
              </div>

              <Field
                label="عدد النقاط للاستبدال"
                htmlFor="loy-points"
                hint={invalid ? undefined : 'كل نقطة بتتحول لخصم جنيه واحد'}
              >
                <InkInput
                  id="loy-points"
                  num
                  suffix="نقطة"
                  type="number"
                  min={0}
                  max={balance}
                  value={points || ''}
                  placeholder="0"
                  aria-invalid={invalid}
                  onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                  className={cn(invalid && 'border-destructive focus:border-destructive focus:ring-destructive/15')}
                />
                {invalid && (
                  <p className="text-[11px] font-bold text-destructive">الرقم أكبر من رصيد العميل ({balance})</p>
                )}
              </Field>

              <div className="flex flex-wrap gap-2">
                {chips.map((n) => (
                  <QuickChip key={n} onClick={() => setPoints(n)} active={points === n}>
                    {n}
                  </QuickChip>
                ))}
                <QuickChip onClick={() => setPoints(balance)} active={points === balance && balance > 0} disabled={balance <= 0}>
                  كل الرصيد
                </QuickChip>
              </div>

              {points > 0 && !invalid && (
                <div className="space-y-1.5 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-foreground/65">قيمة الخصم</span>
                    <b className="tabular-nums">{points} ج</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground/65">الرصيد بعد الاستبدال</span>
                    <b className="tabular-nums">{remaining} نقطة</b>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="flex-row gap-2 border-t px-4 py-3 sm:px-6">
          {enabled && (
            <Button
              onClick={submit}
              disabled={saving || points <= 0 || invalid}
              className={cn('h-11 flex-1 rounded-xl font-extrabold', INK_BTN)}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              استبدال
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={cn('h-11 rounded-xl', INK_BTN_OUTLINE, !enabled && 'flex-1')}
          >
            {enabled ? 'إلغاء' : 'إغلاق'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
