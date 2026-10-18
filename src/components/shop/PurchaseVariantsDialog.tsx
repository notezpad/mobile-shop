'use client'

/**
 * 🎨 2026-10-18 — شبكة الألوان × المقاسات لأمر الشراء.
 *
 * المنتج اللي له ألوان/مقاسات لازم الشراء يتسجّل على كل لون/مقاس لوحده — عشان
 * المخزون يدخل على الـ variant نفسه (وكمية المنتج = مجموعهم). قبل كده الكمية كانت
 * بتتضاف على المنتج بس فتضيع عند أول بيعة.
 *
 * التاجر بيكتب الكمية في الخلية المطلوبة بس (أسود/40 = 12، كحلي/42 = 6 ...) وسعر
 * التكلفة مرة واحدة لكل المنتج، والخلايا الفاضية مش بتدخل الفاتورة.
 */

import * as React from 'react'
import { Grid3x3, Shirt } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DecimalInput, DialogHero, normalizeDigits } from './purchase-dialog-ui'

export interface PurchaseVariantLite {
  id: number
  size: string | null
  color: string | null
  /** باركود اللون/المقاس (لو متسجل) */
  barcode?: string | null
  quantity: number
}

export interface PurchaseVariantsResult {
  /** variantId → الكمية (الخلايا الفاضية مش موجودة؛ والصفر موجود بس لو allowZero) */
  qty: Record<number, number>
  /** تكلفة القطعة (واحدة لكل المنتج) — 0 لو showCost=false */
  cost: number
}

const LETTER_LADDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL']

function sizeRank(a: string): [number, number | string] {
  const n = Number(normalizeDigits(a))
  if (Number.isFinite(n) && a.trim() !== '') return [0, n]
  const i = LETTER_LADDER.indexOf(a.trim().toUpperCase())
  if (i >= 0) return [1, i]
  return [2, a]
}
function compareSizes(a: string, b: string) {
  const [ga, va] = sizeRank(a)
  const [gb, vb] = sizeRank(b)
  if (ga !== gb) return ga - gb
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'ar')
}

const labelOf = (v: PurchaseVariantLite) => [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
/** '' → undefined (خلية فاضية)، غير كده عدد صحيح ≥ 0 */
const parseCell = (s: string): number | undefined => {
  const digits = normalizeDigits(s).replace(/[^\d]/g, '')
  if (digits === '') return undefined
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : undefined
}

export function PurchaseVariantsDialog({
  open,
  onOpenChange,
  productName,
  variants,
  initialQty,
  initialCost,
  onConfirm,
  showCost = true,
  allowZero = false,
  maxByStock = false,
  title = 'الكمية لكل لون ومقاس',
  confirmLabel = 'أضف للسلة',
  emptyHint = 'اكتب الكمية في الخلايا اللي هتشتريها',
  stockLabel = 'مخزون',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  productName: string
  variants: PurchaseVariantLite[]
  /** كميات موجودة بالفعل في السلة لنفس المنتج (للتعديل) */
  initialQty?: Record<number, number>
  initialCost: number
  onConfirm: (r: PurchaseVariantsResult) => void
  /** إظهار حقل تكلفة القطعة (الشراء فقط) */
  showCost?: boolean
  /** الجرد: الصفر «معدود وملقيتش منه» مختلف عن الخلية الفاضية «ماتعدّتش» */
  allowZero?: boolean
  /** التحويل: الكمية ماتتعداش مخزون اللون/المقاس */
  maxByStock?: boolean
  title?: string
  confirmLabel?: string
  emptyHint?: string
  stockLabel?: string
}) {
  const [qty, setQty] = React.useState<Record<number, number>>({})
  const [cost, setCost] = React.useState(0)
  const [fillAll, setFillAll] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setQty({ ...(initialQty ?? {}) })
    setCost(initialCost || 0)
    setFillAll('')
  }, [open, initialQty, initialCost])

  const colors = React.useMemo(
    () => [...new Set(variants.map((v) => v.color ?? ''))],
    [variants],
  )
  const sizes = React.useMemo(
    () => [...new Set(variants.map((v) => v.size ?? ''))].sort(compareSizes),
    [variants],
  )
  // شبكة كاملة لو في لون ومقاس معاً — غير كده قايمة بسيطة
  const isGrid = variants.some((v) => v.color) && variants.some((v) => v.size)
  const byKey = React.useMemo(() => {
    const m = new Map<string, PurchaseVariantLite>()
    for (const v of variants) m.set(`${v.color ?? ''}|${v.size ?? ''}`, v)
    return m
  }, [variants])

  const stockOf = (id: number) => variants.find((v) => v.id === id)?.quantity ?? 0
  const clamp = (id: number, n: number) => (maxByStock ? Math.min(n, stockOf(id)) : n)
  // خلية فاضية (undefined) أو صفر في وضع الشراء/التحويل = مش داخلة في العملية
  const counts = (n: number | undefined): n is number => n !== undefined && (allowZero ? n >= 0 : n > 0)

  const setOne = (id: number, n: number | undefined) =>
    setQty((p) => {
      const next = { ...p }
      if (n === undefined) delete next[id]
      else next[id] = clamp(id, n)
      return next
    })
  const lines = Object.values(qty).filter(counts).length
  const total = Object.values(qty).reduce((s, n) => s + (counts(n) ? n : 0), 0)

  const applyFill = () => {
    const n = parseCell(fillAll)
    if (n === undefined || (!allowZero && n === 0)) return
    setQty(Object.fromEntries(variants.map((v) => [v.id, clamp(v.id, n)])))
  }
  const clearAll = () => setQty({})

  const confirm = () => {
    const out: Record<number, number> = {}
    for (const [k, n] of Object.entries(qty)) if (counts(n)) out[Number(k)] = n
    onConfirm({ qty: out, cost: showCost ? cost : 0 })
  }

  const cell = (v: PurchaseVariantLite | undefined) => {
    if (!v) {
      return <div className="h-12 rounded-xl border border-dashed bg-muted/30" aria-hidden />
    }
    const n = qty[v.id]
    const filled = counts(n)
    return (
      <label
        className={cn(
          'flex h-12 flex-col items-center justify-center rounded-xl border bg-card px-1 transition-colors focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25',
          filled && 'border-cyan-600/60 bg-cyan-600/[0.08]',
        )}
      >
        <input
          inputMode="numeric"
          dir="ltr"
          value={n === undefined ? '' : String(n)}
          placeholder={allowZero ? '—' : '0'}
          onChange={(e) => setOne(v.id, parseCell(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`كمية ${labelOf(v)}`}
          className="h-6 w-full bg-transparent text-center text-sm font-extrabold tabular-nums outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-[10px] font-medium tabular-nums text-foreground/55">{stockLabel} {v.quantity}</span>
      </label>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHero
          icon={isGrid ? Grid3x3 : Shirt}
          title={title}
          subtitle={productName}
        />
        <DialogBody className="space-y-4">
          {/* أدوات سريعة */}
          <div className="flex flex-wrap items-end gap-3">
            {showCost && (
              <div className="min-w-[9rem] flex-1">
                <span className="mb-1 block text-[11px] font-semibold text-foreground/60">تكلفة القطعة (لكل المنتج)</span>
                <DecimalInput value={cost} onChange={setCost} label="تكلفة القطعة" suffix="جنيه" />
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="w-24">
                <span className="mb-1 block text-[11px] font-semibold text-foreground/60">نفس الكمية للكل</span>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  value={fillAll}
                  onChange={(e) => setFillAll(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyFill()
                    }
                  }}
                  placeholder="مثلاً 3"
                  className="h-11 w-full rounded-xl border bg-card px-2 text-center text-sm font-bold tabular-nums outline-none focus:border-cyan-600 focus:ring-[3px] focus:ring-cyan-600/25"
                />
              </div>
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={applyFill}>
                تطبيق
              </Button>
              <Button type="button" variant="ghost" className="h-11 rounded-xl text-foreground/70" onClick={clearAll}>
                تصفير
              </Button>
            </div>
          </div>

          {/* الشبكة */}
          {isGrid ? (
            <div className="overflow-x-auto rounded-2xl border bg-muted/20 p-2">
              <table className="w-full min-w-max border-separate border-spacing-1.5">
                <thead>
                  <tr>
                    <th className="w-24 text-start text-[11px] font-bold text-foreground/60">اللون \ المقاس</th>
                    {sizes.map((sz) => (
                      <th key={sz} className="min-w-[4.25rem] text-center text-xs font-extrabold tabular-nums">
                        {sz || '—'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colors.map((c) => (
                    <tr key={c}>
                      <th className="text-start text-xs font-extrabold">{c || '—'}</th>
                      {sizes.map((sz) => (
                        <td key={sz}>{cell(byKey.get(`${c}|${sz}`))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {variants.map((v) => (
                <li key={v.id} className="flex items-center gap-3 rounded-xl border bg-card p-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{labelOf(v)}</span>
                  <div className="w-20">{cell(v)}</div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter className="flex-row items-center gap-3 border-t bg-card px-4 py-3 sm:px-6">
          <p className="min-w-0 flex-1 text-xs font-semibold tabular-nums text-foreground/70">
            {lines > 0 ? (
              <>
                <b className="text-base font-extrabold text-foreground">{total}</b> قطعة · {lines} لون/مقاس
              </>
            ) : (
              emptyHint
            )}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-5">
            إلغاء
          </Button>
          <Button
            onClick={confirm}
            disabled={lines === 0}
            className="h-11 rounded-xl bg-cyan-700 px-6 font-bold text-white hover:bg-cyan-600 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
