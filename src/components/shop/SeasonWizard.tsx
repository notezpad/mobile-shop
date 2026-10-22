'use client'

/**
 * 👕 2026-10-22 — معالج «المواسم» (باقات الملابس فقط): إغلاق موسم / فتح موسم.
 *
 * الإغلاق: كل المعروض من أصناف الموسم بيدخل المخزن الداخلي بحركة واحدة موثقة
 * (زر واحد بدل 500 عملية يدوية) — ملخص بالأرقام قبل التنفيذ.
 * الفتح: الأصناف النايمة في المخزن بتظهر مع خانة «اعرض كام» لكل صنف
 * (الافتراضي: الكل — ومنتجات المقاسات بتتفتح كاملة).
 *
 * القاعدة المحاسبية: حركة موقع مش حركة مال — صفر شراء، صفر بيع، صفر كاش.
 */

import * as React from 'react'
import { Snowflake, Sun, Warehouse, PackageOpen, Loader2, CheckCircle2, ArrowLeftRight, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { num } from './inventory/shared'

type Season = 'SUMMER' | 'WINTER'

const SEASON_META: Record<Season, { label: string; icon: typeof Sun; hint: string }> = {
  SUMMER: { label: 'صيفي', icon: Sun, hint: 'اللي فاضل من صيف يدخل المخزن' },
  WINTER: { label: 'شتوي', icon: Snowflake, hint: 'اللي فاضل من شتا يدخل المخزن' },
}

interface ClosePreview {
  season: Season
  label: string
  products: number
  pieces: number
  value: number
  /** 🧠 هل الموسم التاني مقفول برضه؟ (تحذير ذكي داخل المعالج) */
  otherSeasonClosed?: boolean
}

interface OpenItem {
  id: number
  name: string
  quantity: number
  displayQty: number
  warehouseQty: number
  variantCount: number
}

export function SeasonWizard({
  open,
  onOpenChange,
  onChanged,
  initialTab = 'close',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged: () => void
  /** 🧠 التبويب المبدئي — بانر الفلتر الذكي بيفتحه على «فتح موسم» مباشرة */
  initialTab?: 'close' | 'open'
}) {
  const [tab, setTab] = React.useState<'close' | 'open'>('close')
  const [season, setSeason] = React.useState<Season>('SUMMER')
  const [busy, setBusy] = React.useState(false)
  const [closePreview, setClosePreview] = React.useState<ClosePreview | null>(null)
  const [openItems, setOpenItems] = React.useState<OpenItem[] | null>(null)
  const [qtys, setQtys] = React.useState<Record<number, number>>({})
  const [done, setDone] = React.useState<string | null>(null)

  const reset = React.useCallback(() => {
    setClosePreview(null)
    setOpenItems(null)
    setQtys({})
    setDone(null)
  }, [])

  // تحميل الملخص/القايمة كل ما التبويب أو الموسم يتغير (والدايلوج بيتفتح)
  React.useEffect(() => {
    if (!open) return
    setTab(initialTab)
  }, [open, initialTab])

  React.useEffect(() => {
    if (!open) return
    reset()
    setBusy(true)
    const url =
      tab === 'close'
        ? `/api/products/seasonal?season=${season}`
        : `/api/products/seasonal?mode=open&season=${season}`
    api<ClosePreview | { items: OpenItem[] }>(url)
      .then((res: any) => {
        if (tab === 'close') setClosePreview(res as ClosePreview)
        else {
          const items: OpenItem[] = ((res as any).items ?? []) as OpenItem[]
          setOpenItems(items)
          // الافتراضي: اعرض الكل
          setQtys(Object.fromEntries(items.map((it: OpenItem) => [it.id, it.warehouseQty])))
        }
      })
      .catch((e: any) => toast.error(e?.message || 'فشل تحميل بيانات الموسم'))
      .finally(() => setBusy(false))
  }, [open, tab, season, reset])

  const closeSeason = async () => {
    setBusy(true)
    try {
      const res = await api<{ message: string }>('/api/products/seasonal', {
        method: 'POST',
        body: { action: 'close', season } as any,
      })
      setDone(res.message || 'تم إغلاق الموسم')
      toast.success(res.message || 'تم إغلاق الموسم')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل إغلاق الموسم')
    } finally {
      setBusy(false)
    }
  }

  const openSeason = async () => {
    const items = (openItems ?? [])
      .map((it) => ({ productId: it.id, qty: Number(qtys[it.id]) || 0 }))
      .filter((x) => x.qty > 0)
    if (items.length === 0) {
      toast.warning('مفيش كمية محددة للعرض — اكتب الكميات الأول')
      return
    }
    setBusy(true)
    try {
      const res = await api<{ message: string }>('/api/products/seasonal', {
        method: 'POST',
        body: { action: 'open', season, items } as any,
      })
      setDone(res.message || 'تم فتح الموسم')
      toast.success(res.message || 'تم فتح الموسم')
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل فتح الموسم')
    } finally {
      setBusy(false)
    }
  }

  const openSelectedPieces = (openItems ?? []).reduce(
    (s, it) => s + Math.max(0, Number(qtys[it.id]) || 0),
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Warehouse className="size-5" />
            </span>
            المواسم والمخزن الداخلي
          </DialogTitle>
          <DialogDescription>
            النقل بين العرض والمخزن الداخلي حركة موقع مش حركة مال — مفيش شراء ولا بيع ولا كاش
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <p className="text-lg font-extrabold">{done}</p>
            <p className="text-sm text-muted-foreground">
              كل حركة اتسجلت في «دفتر حركات المخزون» — تلاقيها تحت نوع «نقل للمخزن الداخلي» أو «نقل للعرض»
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDone(null)
                  setTab(tab === 'close' ? 'open' : 'close')
                }}
              >
                <ArrowLeftRight className="size-4" />
                {tab === 'close' ? 'فتح موسم تاني' : 'إغلاق موسم تاني'}
              </Button>
              <Button onClick={() => onOpenChange(false)}>تمام</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* التبويبان */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
              {(
                [
                  ['close', 'إغلاق موسم', Warehouse],
                  ['open', 'فتح موسم', PackageOpen],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={tab === v}
                  onClick={() => setTab(v)}
                  className={cn(
                    'flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors',
                    tab === v ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* اختيار الموسم */}
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SEASON_META) as Season[]).map((s) => {
                const meta = SEASON_META[s]
                const Icon = meta.icon
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={season === s}
                    onClick={() => setSeason(s)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border p-3 text-start transition-colors',
                      season === s
                        ? 'border-brand-600/60 bg-brand-600/5 ring-2 ring-brand-600/30'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg',
                        s === 'SUMMER' ? 'bg-amber-500/15 text-amber-600' : 'bg-sky-500/15 text-sky-600'
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-extrabold">{meta.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {busy ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                جارٍ الحساب…
              </div>
            ) : tab === 'close' && closePreview ? (
              /* ── ملخص الإغلاق ── */
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="mb-2 text-sm font-bold">اللي هيحصل لما تقفل موسم {closePreview.label}:</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-background p-2.5">
                      <p className="text-lg font-black tabular-nums">{num(closePreview.products)}</p>
                      <p className="text-[11px] text-muted-foreground">صنف</p>
                    </div>
                    <div className="rounded-xl bg-background p-2.5">
                      <p className="text-lg font-black tabular-nums">{num(closePreview.pieces)}</p>
                      <p className="text-[11px] text-muted-foreground">قطعة معروضة</p>
                    </div>
                    <div className="rounded-xl bg-background p-2.5">
                      <p className="text-lg font-black tabular-nums">{num(Math.round(closePreview.value))}</p>
                      <p className="text-[11px] text-muted-foreground">جنيه بالتكلفة</p>
                    </div>
                  </div>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  الأصناف دي هتختفي من نقطة البيع وتبقى «في المخزن الداخلي» — وأصناف «طوال السنة» مش هتتأثر خالص
                </p>
                {closePreview.otherSeasonClosed && (
                  <p className="flex items-start gap-1.5 rounded-xl bg-sky-500/10 p-2.5 text-xs font-bold text-sky-700 dark:text-sky-400">
                    <Snowflake className="mt-0.5 size-3.5 shrink-0" />
                    الموسم التاني مقفول برضه — لو قفلت {closePreview.label} كمان، العرض الافتراضي هيبقى على «طوال السنة» بس
                  </p>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  disabled={closePreview.products === 0 || busy}
                  onClick={closeSeason}
                >
                  <Warehouse className="size-4" />
                  {closePreview.products === 0
                    ? `مفيش أصناف ${closePreview.label} معروضة`
                    : `إغلاق موسم ${closePreview.label} ونقل ${num(closePreview.pieces)} قطعة للمخزن`}
                </Button>
              </div>
            ) : tab === 'open' && openItems ? (
              /* ── قائمة الفتح ── */
              <div className="space-y-3">
                {openItems.length === 0 ? (
                  <p className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                    مفيش أصناف {SEASON_META[season].label} واقفة في المخزن الداخلي — كله معروض بالفعل
                  </p>
                ) : (
                  <>
                    <ScrollArea className="h-64 rounded-xl border">
                      <div className="divide-y">
                        {openItems.map((it) => (
                          <div key={it.id} className="flex items-center gap-2 p-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{it.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                في المخزن: {num(it.warehouseQty)}
                                {it.variantCount > 0 ? ' · بمقاسات — بيتفتح كامل' : ''}
                              </p>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              max={it.warehouseQty}
                              step={1}
                              value={String(qtys[it.id] ?? 0)}
                              disabled={it.variantCount > 0}
                              onChange={(e) =>
                                setQtys((prev) => ({
                                  ...prev,
                                  [it.id]: Math.max(0, Math.min(Number(e.target.value) || 0, it.warehouseQty)),
                                }))
                              }
                              aria-label={`الكمية المعروضة من ${it.name}`}
                              className="h-9 w-24 text-center font-bold tabular-nums"
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button className="w-full" size="lg" disabled={busy || openSelectedPieces <= 0} onClick={openSeason}>
                      <PackageOpen className="size-4" />
                      إرجاع {num(openSelectedPieces)} قطعة للعرض
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
