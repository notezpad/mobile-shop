'use client'

import * as React from 'react'
import { Loader2, Star } from 'lucide-react'
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-4 text-accent2-500" />
            استبدال نقاط الولاء — {customer?.name}
          </DialogTitle>
        </DialogHeader>
        {!enabled ? (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground dark:border-warning-subtle dark:bg-warning-subtle/20 dark:text-warning-subtle-foreground">
            نظام الولاء متاح في باقة الملابس الاحترافية فقط.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              رصيد النقاط الحالي:{' '}
              <span className="font-bold text-accent2-600">
                {customer?.loyaltyPoints ?? 0} نقطة
              </span>
            </p>
            <div>
              <Label>عدد النقاط للاستبدال (1 نقطة = 1 جنيه)</Label>
              <Input
                type="number"
                min={0}
                max={customer?.loyaltyPoints ?? 0}
                value={points}
                onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          {enabled && (
            <Button onClick={submit} disabled={saving || points <= 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              استبدال
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
