'use client'

import * as React from 'react'
import { Info, Loader2, Percent } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { DialogHero, Field, InkInput, LockedNote, QuickChip, SectionTitle } from './product-dialog-ui'
import { INK_BTN } from './settings-ui'

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

  const invalid = percent < 1 || percent >= 90

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={Percent}
          title="خصم جماعي على كوليكشن"
          subtitle="بيتطبق على أسعار كل منتجات الكوليكشن مرة واحدة."
        />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {!enabled ? (
            <LockedNote>ميزة الخصم الجماعي على الكوليكشن متاحة في باقة الملابس الاحترافية فقط.</LockedNote>
          ) : (
            <>
              <section>
                <SectionTitle n={1}>الكوليكشن</SectionTitle>
                <Field label="اسم الكوليكشن" htmlFor="cd-collection" required>
                  <InkInput
                    id="cd-collection"
                    list="collections-list"
                    value={collection}
                    onChange={(e) => setCollection(e.target.value)}
                    placeholder="صيف 2026"
                  />
                </Field>
                <datalist id="collections-list">
                  {collections.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {collections.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {collections.slice(0, 8).map((c) => (
                      <QuickChip key={c} active={collection === c} onClick={() => setCollection(c)}>
                        {c}
                      </QuickChip>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionTitle n={2}>نسبة الخصم</SectionTitle>
                <InkInput
                  id="cd-percent"
                  num
                  type="number"
                  min={1}
                  max={89}
                  suffix="٪"
                  aria-label="نسبة الخصم"
                  value={percent}
                  onChange={(e) => setPercent(parseInt(e.target.value) || 0)}
                  className={cn('h-14 text-2xl', invalid && 'border-destructive focus:border-destructive focus:ring-destructive/20')}
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {[10, 20, 30, 50].map((p) => (
                    <QuickChip key={p} active={percent === p} onClick={() => setPercent(p)}>
                      {p}٪
                    </QuickChip>
                  ))}
                </div>
                {invalid && (
                  <p className="mt-2 text-xs font-semibold text-destructive">النسبة لازم بين 1 و 89</p>
                )}
              </section>

              <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                الأسعار في المنتجات كلها هتتحدّث فورًا — عملية لا رجعة فيها.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-5">
              إلغاء
            </Button>
            {enabled && (
              <Button
                onClick={submit}
                disabled={saving || !collection.trim() || invalid}
                className={cn('h-11 rounded-xl px-6 font-bold', INK_BTN)}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                تطبيق الخصم
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
