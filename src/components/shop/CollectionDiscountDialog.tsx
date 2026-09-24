'use client'

import * as React from 'react'
import { Loader2, Percent } from 'lucide-react'
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
  collections?: string[]
  onDone?: () => void
}

export function CollectionDiscountDialog({
  open,
  onOpenChange,
  collections = [],
  onDone,
}: Props) {
  const [collection, setCollection] = React.useState('')
  const [percent, setPercent] = React.useState(10)
  const [saving, setSaving] = React.useState(false)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('collections')

  const submit = async () => {
    if (!collection.trim()) {
      toast.error('اسم الكوليكشن مطلوب')
      return
    }
    if (percent < 1 || percent >= 90) {
      toast.error('النسبة لازم بين 1 و 89')
      return
    }
    setSaving(true)
    try {
      const res = await api<{ updated: number }>('/api/products/collections/discount', {
        method: 'POST',
        body: { collection: collection.trim(), percent },
      })
      toast.success(`تم تطبيق الخصم على ${res.updated} منتج`)
      onOpenChange(false)
      onDone?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تطبيق الخصم')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Percent className="size-4" />
            خصم جماعي على كوليكشن
          </DialogTitle>
        </DialogHeader>
        {!enabled ? (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground dark:border-warning-subtle dark:bg-warning-subtle/20 dark:text-warning-subtle-foreground">
            ميزة الخصم الجماعي على الكوليكشن متاحة في باقة الملابس الاحترافية فقط.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label className="mb-1.5 block">الكوليكشن</Label>
              <Input
                list="collections-list"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="صيف 2026"
              />
              <datalist id="collections-list">
                {collections.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="mb-1.5 block">نسبة الخصم %</Label>
              <Input
                type="number"
                min={1}
                max={89}
                value={percent}
                onChange={(e) => setPercent(parseInt(e.target.value) || 0)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              الأسعار في المنتجات كلها هتتحدّث فورًا — عملية لا رجعة فيها.
            </p>
          </div>
        )}
        <DialogFooter>
          {enabled && (
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              تطبيق الخصم
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
