'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { DraftNumberInput } from './DraftNumberInput'
import type { PosSettings } from './hooks/usePosSettings'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  settings: PosSettings
  onSaved: () => void
}

/** Managers only. Everything is OFF/unlimited by default — shops opt in. */
export function PosSettingsDialog({ open, onOpenChange, settings, onSaved }: Props) {
  const [requireShift, setRequireShift] = React.useState(false)
  const [maxPct, setMaxPct] = React.useState(100)
  const [pin, setPin] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setRequireShift(settings.requireShift)
    setMaxPct(settings.employeeMaxDiscountPct)
    setPin('')
  }, [open, settings])

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true)
    try {
      const r = await api<{ warning?: string | null }>('/api/pos/settings', {
        method: 'PUT',
        body: { requireShift, employeeMaxDiscountPct: maxPct, ...extra },
      })
      if (r?.warning) toast.warning(r.warning)
      else toast.success('اتحفظت الإعدادات')
      setPin('')
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إعدادات نقطة البيع</DialogTitle>
          <DialogDescription>للمدير فقط. الافتراضي: مفيش وردية إجبارية ومفيش حد للخصم.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <Label htmlFor="req-shift" className="text-sm font-semibold">وردية إجبارية</Label>
              <p className="text-xs text-muted-foreground">الكاشير لازم يفتح وردية قبل البيع.</p>
            </div>
            <Switch id="req-shift" checked={requireShift} onCheckedChange={setRequireShift} />
          </div>

          <div className="space-y-1.5 rounded-xl border p-3">
            <Label className="text-sm font-semibold">أقصى خصم للكاشير (%)</Label>
            <p className="text-xs text-muted-foreground">
              فوق الحد ده (خصم أو تعديل سعر لأقل من سعر الرف) لازم PIN المدير. <b>100</b> = بدون حد.
            </p>
            <DraftNumberInput allowDecimal value={maxPct} onCommit={(n) => setMaxPct(Math.min(100, n))} className="h-10 w-28 text-center tabular-nums" aria-label="أقصى خصم للكاشير" />
          </div>

          <div className="space-y-2 rounded-xl border p-3">
            <Label className="text-sm font-semibold">PIN المدير {settings.hasPin ? '(متسجّل ✓)' : '(مش متسجّل)'}</Label>
            <p className="text-xs text-muted-foreground">من 4 إلى 8 أرقام. بيُطلب للخصم فوق الحد ولمرتجعات الكاشير. 5 محاولات غلط = قفل 15 دقيقة.</p>
            <div className="flex gap-2">
              <Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} dir="ltr" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder={settings.hasPin ? 'PIN جديد' : 'اكتب PIN'} className="text-center tracking-widest" aria-label="PIN" />
              <Button type="button" variant="secondary" disabled={saving || pin.length < 4} onClick={() => void save({ pin })}>حفظ PIN</Button>
            </div>
            {settings.hasPin && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={saving} onClick={() => void save({ clearPin: true })}>إزالة PIN</Button>
            )}
          </div>

          <Button type="button" className="w-full" size="lg" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="size-4 animate-spin" />} حفظ الإعدادات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
