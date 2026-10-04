'use client'

import * as React from 'react'
import { Search, Shirt } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { INK_BTN_OUTLINE } from './settings-ui'
import { INK_RING, InkInput } from './product-dialog-ui'
import { DialogHero } from './sale-dialog-ui'

export interface PickerVariantLite {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

const LOW = 3

function labelOf(v: PickerVariantLite) {
  return [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
}

/** اختيار اللون/المقاس في نقطة البيع — الخطوة ١ «اختر». نفس المنطق القديم: الضغط على مقاس يضيفه للسلة. */
export function POSVariantPickerDialog({
  open,
  onOpenChange,
  productName,
  variants,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  productName?: string
  variants: PickerVariantLite[]
  onPick: (v: PickerVariantLite) => void
}) {
  const [q, setQ] = React.useState('')
  React.useEffect(() => {
    if (open) setQ('')
  }, [open])

  const many = variants.length > 8
  const list = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? variants.filter((v) => labelOf(v).toLowerCase().includes(s)) : variants
  }, [variants, q])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHero
          icon={Shirt}
          title="اختار اللون / المقاس"
          chip="١ اختر"
          subtitle={productName}
        />
        <DialogBody className="space-y-3">
          {variants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا يوجد ألوان/مقاسات مسجلة لهذا المنتج
            </p>
          ) : (
            <>
              {many && (
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/50" />
                  <InkInput
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ابحث بالمقاس أو اللون…"
                    className="ps-9"
                  />
                </div>
              )}
              {list.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">مفيش نتائج</p>
              ) : (
                <ul className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pb-1">
                  {list.map((v) => {
                    const out = v.quantity <= 0
                    const low = !out && v.quantity <= LOW
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          disabled={out}
                          onClick={() => onPick(v)}
                          className={cn(
                            'flex w-full flex-col items-start gap-1.5 rounded-2xl border bg-background px-3 py-3 text-start transition-colors',
                            INK_RING,
                            out
                              ? 'cursor-not-allowed opacity-45'
                              : 'hover:border-foreground hover:bg-muted/60 active:scale-[0.98]'
                          )}
                        >
                          <span className="text-sm font-extrabold leading-tight">{labelOf(v)}</span>
                          <span
                            className={cn(
                              'whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                              out
                                ? 'bg-danger-subtle text-danger-subtle-foreground'
                                : low
                                  ? 'bg-warning-subtle text-warning-subtle-foreground'
                                  : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {out ? 'نفد' : low ? `باقي ${v.quantity}` : `متاح ${v.quantity}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button variant="outline" className={cn('h-11 rounded-xl', INK_BTN_OUTLINE)} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
