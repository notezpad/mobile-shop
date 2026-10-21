'use client'

/**
 * 🎨 2026-10-20 — إعادة تصميم كاملة: «الكمية لكل لون ومقاس» (أمر الشراء / الجرد / التحويل / تسوية المخزون).
 *
 * المشكلة في التصميم القديم: جدول واحد عرضه = عدد المقاسات (ممكن 40 مقاس) فيتقطع من الجنب
 * ويحتاج سكرول أفقي، وخلايا فاضية منقّطة لتركيبات مش موجودة، وكل خلية بنفس الوزن البصري.
 *
 * الفكرة الجديدة — الدايلوج «بيتفصّل» على حجم المنتج:
 *   • قليل (≤6 مقاسات و≤10 ألوان)  → شبكة مدمجة (ألوان × مقاسات) بعمود لون ثابت وإجمالي كل صف.
 *   • كتير                          → مجموعات: كل لون (أو كل مقاس) قسم لوحده، وجواه بلاطات
 *                                    بتلف على أسطر — مفيش سكرول أفقي ومفيش خلايا فاضية.
 *   • المجموعة تتفرد/تتطوي، وفي رأسها: عدد المعبّأ، إجمالي قطعها، و«املا الكل بـ n».
 *   • بحث فوري + «المعبّأ فقط» لمراجعة اللي اتكتب في ثانية، وتنقّل بالكيبورد (Enter / ↑ ↓).
 *   • ملخص ثابت تحت: عدد القطع + الأصناف + إجمالي التكلفة.
 *
 * الواجهة البرمجية (props) ما اتغيرتش — نفس الاستدعاءات في PurchaseOrderDialog وStockTab
 * وTransfersTab وStocktakeTab شغالة زي ما هي.
 */

import * as React from 'react'
import { ChevronDown, Grid3x3, Palette, Ruler, Search, Shirt, X } from 'lucide-react'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format'
import { DecimalInput, DialogHero, normalizeDigits } from './purchase-dialog-ui'
import { compareSizes } from '@/lib/variant-sort'
import { Swatch, normAr } from '@/lib/color-swatch'

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

const labelOf = (v: PurchaseVariantLite) => [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
/** '' → undefined (خلية فاضية)، غير كده عدد صحيح ≥ 0 */
const parseCell = (s: string): number | undefined => {
  const digits = normalizeDigits(s).replace(/[^\d]/g, '')
  if (digits === '') return undefined
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : undefined
}

/* ───────────────────────── الدايلوج ───────────────────────── */

type Mode = 'matrix' | 'color' | 'size'

interface Group {
  key: string
  /** عنوان المجموعة (لون أو مقاس) — '' = مجموعة وحيدة بدون عنوان */
  title: string
  /** نوع العنوان: لون (يظهر معاه عينة) أو مقاس */
  kind: 'color' | 'size' | 'none'
  items: PurchaseVariantLite[]
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
  const [query, setQuery] = React.useState('')
  const [onlyFilled, setOnlyFilled] = React.useState(false)
  const [userMode, setUserMode] = React.useState<Mode | null>(null)
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})
  const [rowFill, setRowFill] = React.useState<Record<string, string>>({})
  const bodyRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    setQty({ ...(initialQty ?? {}) })
    setCost(initialCost || 0)
    setFillAll('')
    setQuery('')
    setOnlyFilled(false)
    setUserMode(null)
    setRowFill({})
    // منتج كبير (أكتر من 48 لون/مقاس): نطوي المجموعات ونسيب الأولى وأي مجموعة فيها كمية مكتوبة،
    // فالتاجر يشوف كل الألوان في نظرة واحدة ويفتح اللي محتاجه
    if (variants.length > 48) {
      const filled = new Set<string>()
      for (const v of variants) {
        if ((initialQty?.[v.id] ?? 0) > 0) {
          filled.add(`c:${v.color ?? ''}`)
          filled.add(`s:${v.size ?? ''}`)
        }
      }
      const firstColor = `c:${variants[0]?.color ?? ''}`
      const next: Record<string, boolean> = {}
      for (const v of variants) {
        for (const k of [`c:${v.color ?? ''}`, `s:${v.size ?? ''}`]) {
          if (!filled.has(k) && k !== firstColor) next[k] = true
        }
      }
      setCollapsed(next)
    } else {
      setCollapsed({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQty, initialCost])

  const colors = React.useMemo(() => [...new Set(variants.map((v) => v.color ?? ''))], [variants])
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

  /* ── العرض الذكي: يتحدد من حجم المنتج، والتاجر يقدر يغيّره ── */
  const matrixFits = sizes.length <= 12
  const autoMode: Mode =
    isGrid && sizes.length <= 6 && colors.length <= 10
      ? 'matrix'
      : colors.length <= sizes.length
        ? 'color'
        : 'size'
  const mode: Mode = !isGrid ? 'color' : userMode && (userMode !== 'matrix' || matrixFits) ? userMode : autoMode

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
  const fillItems = (items: PurchaseVariantLite[], raw: string) => {
    const n = parseCell(raw)
    if (n === undefined || (!allowZero && n === 0)) return
    setQty((p) => {
      const next = { ...p }
      for (const v of items) next[v.id] = clamp(v.id, n)
      return next
    })
  }
  const clearItems = (items: PurchaseVariantLite[]) =>
    setQty((p) => {
      const next = { ...p }
      for (const v of items) delete next[v.id]
      return next
    })

  const confirm = () => {
    const out: Record<number, number> = {}
    for (const [k, n] of Object.entries(qty)) if (counts(n)) out[Number(k)] = n
    onConfirm({ qty: out, cost: showCost ? cost : 0 })
  }

  /* ── فلترة (بحث + المعبّأ فقط) ── */
  const q = normAr(normalizeDigits(query))
  const matches = React.useCallback(
    (v: PurchaseVariantLite) => {
      if (onlyFilled && !counts(qty[v.id])) return false
      if (!q) return true
      const hay = normAr(normalizeDigits(`${v.color ?? ''} ${v.size ?? ''}`))
      return hay.includes(q)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, onlyFilled, qty, allowZero],
  )

  /* ── المجموعات ── */
  const groups: Group[] = React.useMemo(() => {
    if (!isGrid) {
      const items = [...variants].sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'ar', { numeric: true }))
      return [{ key: 'all', title: '', kind: 'none', items }]
    }
    if (mode === 'size') {
      return sizes.map((sz) => ({
        key: `s:${sz}`,
        title: sz || '—',
        kind: 'size' as const,
        items: variants.filter((v) => (v.size ?? '') === sz).sort((a, b) => (a.color ?? '').localeCompare(b.color ?? '', 'ar')),
      }))
    }
    return colors.map((c) => ({
      key: `c:${c}`,
      title: c || '—',
      kind: 'color' as const,
      items: variants.filter((v) => (v.color ?? '') === c).sort((a, b) => compareSizes(a.size ?? '', b.size ?? '')),
    }))
  }, [isGrid, mode, variants, sizes, colors])

  /* ── تنقّل بالكيبورد بين الخلايا ── */
  const focusRel = (el: HTMLInputElement, dir: 1 | -1) => {
    const all = Array.from(bodyRef.current?.querySelectorAll<HTMLInputElement>('input[data-qty]:not(:disabled)') ?? [])
    const i = all.indexOf(el)
    all[i + dir]?.focus()
  }

  /* ── خلية إدخال الكمية ── */
  const qtyInput = (v: PurchaseVariantLite, extraClass?: string) => {
    const n = qty[v.id]
    const dead = maxByStock && v.quantity <= 0
    return (
      <input
        data-qty
        inputMode="numeric"
        dir="ltr"
        disabled={dead}
        value={n === undefined ? '' : String(n)}
        placeholder={allowZero ? '—' : '0'}
        onChange={(e) => setOne(v.id, parseCell(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            focusRel(e.currentTarget, e.shiftKey ? -1 : 1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setOne(v.id, (n ?? 0) + 1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (n === undefined) return
            const m = n - 1
            setOne(v.id, m < 0 ? (allowZero ? 0 : undefined) : m === 0 && !allowZero ? undefined : m)
          }
        }}
        aria-label={`كمية ${labelOf(v)}`}
        className={cn(
          // focus-visible:shadow-none → الحلقة الخضرا العامة (:focus-visible في globals.css) كانت بترسم مربع تاني جوه البلاطة؛
          // التركيز بتتكفل بيه البلاطة نفسها (focus-within سيان) فمفيش حلقة مزدوجة.
          'h-7 w-full bg-transparent text-center text-base font-extrabold tabular-nums outline-none focus-visible:shadow-none placeholder:font-semibold placeholder:text-muted-foreground/40 disabled:cursor-not-allowed',
          extraClass,
        )}
      />
    )
  }

  const tileShell = (v: PurchaseVariantLite, children: React.ReactNode, extraClass?: string) => {
    const filled = counts(qty[v.id])
    const dead = maxByStock && v.quantity <= 0
    return (
      <label
        key={v.id}
        className={cn(
          'flex cursor-text flex-col items-stretch rounded-xl border bg-card transition-all',
          'focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25',
          filled && 'border-cyan-600/70 bg-cyan-600/[0.09] shadow-[inset_0_0_0_1px_rgba(8,145,178,0.25)]',
          dead && 'opacity-45',
          extraClass,
        )}
      >
        {children}
      </label>
    )
  }

  /* ── بلاطة (وضع المجموعات) ── */
  const tile = (v: PurchaseVariantLite, group: Group) => {
    const label =
      group.kind === 'color' ? v.size || '—' : group.kind === 'size' ? v.color || '—' : labelOf(v)
    const swatchName = group.kind === 'size' ? v.color ?? '' : group.kind === 'none' ? v.color ?? '' : ''
    return tileShell(
      v,
      <>
        <span className="flex min-h-[1.75rem] items-center justify-center gap-1 px-1.5 pt-1.5 text-center text-[13px] font-extrabold leading-tight">
          {swatchName ? <Swatch name={swatchName} /> : null}
          <span className="truncate">{label}</span>
        </span>
        {qtyInput(v)}
        <span className="pb-1.5 text-center text-[10px] font-medium tabular-nums text-foreground/55">
          {stockLabel} {v.quantity}
        </span>
      </>,
    )
  }

  /* ── مجموعة (لون أو مقاس) ── */
  const renderGroup = (g: Group) => {
    const shown = g.items.filter(matches)
    if (shown.length === 0) return null
    const filledCount = g.items.filter((v) => counts(qty[v.id])).length
    const sub = g.items.reduce((s, v) => s + (counts(qty[v.id]) ? (qty[v.id] as number) : 0), 0)
    const isCollapsed = !!collapsed[g.key] && !q && !onlyFilled
    const hasHeader = g.kind !== 'none'
    return (
      <section key={g.key} className="overflow-hidden rounded-2xl border bg-card">
        {hasHeader && (
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/40 px-3 py-2">
            <button
              type="button"
              onClick={() => setCollapsed((p) => ({ ...p, [g.key]: !p[g.key] }))}
              aria-expanded={!isCollapsed}
              className="flex min-w-[13rem] flex-1 items-center gap-2 text-start"
            >
              <ChevronDown className={cn('size-4 shrink-0 text-foreground/50 transition-transform', isCollapsed && '-rotate-90')} />
              {g.kind === 'color' ? <Swatch name={g.title === '—' ? '' : g.title} className="size-4" /> : null}
              <span className="truncate text-sm font-extrabold">{g.title}</span>
              <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground/60 ring-1 ring-border">
                {filledCount}/{g.items.length}
              </span>
              {sub > 0 && (
                <span className="shrink-0 text-xs font-extrabold tabular-nums text-cyan-700 dark:text-cyan-300">{sub} قطعة</span>
              )}
            </button>
            <div className="flex items-center gap-1.5">
              <input
                inputMode="numeric"
                dir="ltr"
                value={rowFill[g.key] ?? ''}
                onChange={(e) => setRowFill((p) => ({ ...p, [g.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    fillItems(g.items, rowFill[g.key] ?? '')
                  }
                }}
                placeholder="الكل"
                aria-label={`نفس الكمية لكل ${g.title}`}
                className="h-8 w-14 rounded-lg border bg-background px-1 text-center text-xs font-bold tabular-nums outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/25"
              />
              <button
                type="button"
                onClick={() => fillItems(g.items, rowFill[g.key] ?? '')}
                className="h-8 rounded-lg border bg-background px-2.5 text-xs font-bold text-foreground/80 hover:bg-muted"
              >
                املا
              </button>
              <button
                type="button"
                onClick={() => clearItems(g.items)}
                disabled={filledCount === 0}
                aria-label={`تصفير ${g.title}`}
                className="grid size-8 place-items-center rounded-lg text-foreground/50 hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>
        )}
        {!isCollapsed && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2 p-3">
            {shown.map((v) => tile(v, g))}
          </div>
        )}
      </section>
    )
  }

  /* ── الشبكة المدمجة (منتجات صغيرة) ── */
  const renderMatrix = () => {
    const rows = colors.filter((c) => variants.some((v) => (v.color ?? '') === c && matches(v)))
    if (rows.length === 0) return null
    const cols = sizes.filter((sz) => variants.some((v) => (v.size ?? '') === sz && matches(v)))
    return (
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky start-0 z-10 min-w-[6.5rem] border-b bg-muted px-3 py-2 text-start text-[11px] font-bold text-foreground/60">
                اللون \ المقاس
              </th>
              {cols.map((sz) => (
                <th key={sz} className="min-w-[4.5rem] border-b px-1 py-2 text-center text-xs font-extrabold tabular-nums">
                  {sz || '—'}
                </th>
              ))}
              <th className="min-w-[3.5rem] border-b px-2 py-2 text-center text-[11px] font-bold text-foreground/60">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const rowItems = variants.filter((v) => (v.color ?? '') === c)
              const sub = rowItems.reduce((s, v) => s + (counts(qty[v.id]) ? (qty[v.id] as number) : 0), 0)
              return (
                <tr key={c}>
                  <th className="sticky start-0 z-10 border-b bg-card px-3 py-1.5 text-start text-xs font-extrabold">
                    <span className="flex items-center gap-1.5">
                      <Swatch name={c} className="size-3.5" />
                      <span className="truncate">{c || '—'}</span>
                    </span>
                  </th>
                  {cols.map((sz) => {
                    const v = byKey.get(`${c}|${sz}`)
                    return (
                      <td key={sz} className="border-b p-1.5">
                        {v ? (
                          tileShell(
                            v,
                            <>
                              {qtyInput(v, 'pt-1')}
                              <span className="pb-1 text-center text-[10px] font-medium tabular-nums text-foreground/55">
                                {stockLabel} {v.quantity}
                              </span>
                            </>,
                          )
                        ) : (
                          <div className="h-[3.25rem] rounded-xl bg-muted/30" aria-hidden />
                        )}
                      </td>
                    )
                  })}
                  <td className="border-b px-2 text-center text-sm font-extrabold tabular-nums text-cyan-700 dark:text-cyan-300">
                    {sub > 0 ? sub : <span className="text-foreground/25">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const shownGroups = mode === 'matrix' && isGrid ? null : groups.map(renderGroup).filter(Boolean)
  const matrixEl = mode === 'matrix' && isGrid ? renderMatrix() : null
  const nothingToShow = mode === 'matrix' && isGrid ? !matrixEl : !shownGroups || shownGroups.length === 0
  const showSearch = variants.length > 8
  const totalCost = showCost ? total * cost : 0

  const modeBtn = (m: Mode, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      key={m}
      type="button"
      onClick={() => setUserMode(m)}
      aria-pressed={mode === m}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors',
        mode === m ? 'bg-cyan-700 text-white shadow-sm' : 'text-foreground/65 hover:bg-background hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHero icon={isGrid ? Grid3x3 : Shirt} title={title} subtitle={productName} />

        {/* ───── شريط الأدوات: ثابت فوق على الشاشات الكبيرة، وجوه السكرول على الموبايل (عشان المساحة) ───── */}
        <div className="hidden shrink-0 space-y-3 border-b bg-muted/25 px-4 py-3 sm:block sm:px-6">
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

          {(showSearch || isGrid || lines > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {showSearch && (
                <label className="relative min-w-[10rem] flex-1">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/45" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث بلون أو مقاس…"
                    aria-label="بحث في الألوان والمقاسات"
                    className="h-9 w-full rounded-lg border bg-card ps-9 pe-8 text-sm outline-none focus:border-cyan-600 focus:ring-[3px] focus:ring-cyan-600/25"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="مسح البحث"
                      className="absolute end-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-foreground/50 hover:bg-muted"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </label>
              )}
              {isGrid && (
                <div className="flex items-center gap-1 rounded-xl bg-muted p-1" role="group" aria-label="طريقة العرض">
                  {modeBtn('color', 'حسب اللون', Palette)}
                  {modeBtn('size', 'حسب المقاس', Ruler)}
                  {matrixFits && modeBtn('matrix', 'شبكة', Grid3x3)}
                </div>
              )}
              {lines > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyFilled((o) => !o)}
                  aria-pressed={onlyFilled}
                  className={cn(
                    'h-9 rounded-lg border px-3 text-xs font-bold tabular-nums transition-colors',
                    onlyFilled
                      ? 'border-cyan-700 bg-cyan-700 text-white'
                      : 'bg-card text-foreground/75 hover:bg-muted',
                  )}
                >
                  المعبّأ فقط ({lines})
                </button>
              )}
            </div>
          )}
        </div>

        {/* ───── المحتوى ───── */}
        <DialogBody className="space-y-3">
          <div className="space-y-3 rounded-2xl border bg-muted/25 p-3 sm:hidden">
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
  
            {(showSearch || isGrid || lines > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {showSearch && (
                  <label className="relative min-w-[10rem] flex-1">
                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-foreground/45" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="ابحث بلون أو مقاس…"
                      aria-label="بحث في الألوان والمقاسات"
                      className="h-9 w-full rounded-lg border bg-card ps-9 pe-8 text-sm outline-none focus:border-cyan-600 focus:ring-[3px] focus:ring-cyan-600/25"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="مسح البحث"
                        className="absolute end-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-foreground/50 hover:bg-muted"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </label>
                )}
                {isGrid && (
                  <div className="flex items-center gap-1 rounded-xl bg-muted p-1" role="group" aria-label="طريقة العرض">
                    {modeBtn('color', 'حسب اللون', Palette)}
                    {modeBtn('size', 'حسب المقاس', Ruler)}
                    {matrixFits && modeBtn('matrix', 'شبكة', Grid3x3)}
                  </div>
                )}
                {lines > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlyFilled((o) => !o)}
                    aria-pressed={onlyFilled}
                    className={cn(
                      'h-9 rounded-lg border px-3 text-xs font-bold tabular-nums transition-colors',
                      onlyFilled
                        ? 'border-cyan-700 bg-cyan-700 text-white'
                        : 'bg-card text-foreground/75 hover:bg-muted',
                    )}
                  >
                    المعبّأ فقط ({lines})
                  </button>
                )}
              </div>
            )}
          </div>
          <div ref={bodyRef} className="space-y-3">
            {mode === 'matrix' && isGrid ? matrixEl : shownGroups}
            {nothingToShow && (
              <p className="rounded-2xl border border-dashed py-10 text-center text-sm font-semibold text-foreground/55">
                {onlyFilled && !query ? 'لسه ما كتبتش أي كمية' : 'مفيش نتائج للبحث ده'}
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="flex-row items-center gap-3 border-t bg-card px-4 py-3 sm:px-6">
          <p className="min-w-0 flex-1 text-xs font-semibold tabular-nums leading-relaxed text-foreground/70">
            {lines > 0 ? (
              <>
                <b className="text-base font-extrabold text-foreground">{total}</b> قطعة · {lines} صنف
                {showCost && cost > 0 && (
                  <>
                    {' '}· <b className="font-extrabold text-foreground">{formatCurrency(totalCost)}</b>
                  </>
                )}
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
