'use client'

/**
 * طباعة ملصقات الباركود — إعادة تصميم كاملة (2026).
 *
 * اتصلّح فيها 3 عيوب كانت ظاهرة في النسخة القديمة:
 *  1) العرض: `sm:max-w-lg` الافتراضي في Dialog كان بيغلب `max-w-5xl` فالدايلوج يطلع 640px
 *     والأعمدة تتضغط — دلوقتي `sm:max-w-5xl`.
 *  2) المعاينة كانت بتختفي في الصفحة العربي: `transform-origin: top left` جوّه RTL بيرمي
 *     الملصق برّه الإطار — دلوقتي منطقة المعاينة `dir="ltr"` وبتتظبط على مقاس اللوحة تلقائياً.
 *  3) المقاس كان بيتعرض مقلوب (30×40 بدل 40×30) بسبب اتجاه النص — كل الأبعاد دلوقتي LTR.
 *
 * وشارة المقاس: كانت بتظهر في المعاينة بس ومش بتتطبع (LabelItem ما فيهوش size)،
 * فشلتها من الملصق عشان المعاينة تطابق الطباعة. فضلت ظاهرة جنب كل منتج في القايمة.
 */

import * as React from 'react'
import {
  Barcode as BarcodeIcon,
  Eye,
  Info,
  Minus,
  Package,
  Plus,
  Printer,
  SlidersHorizontal,
  Tag,
  Type,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { printBarcodeLabels, renderBarcodeSvg } from '@/lib/print-client'
import { computeLabelLayout, A4, type LabelLayout } from '@/lib/print'
import { cn } from '@/lib/utils'

export interface LabelProduct {
  id: number
  name: string
  barcode: string | null
  price: number
  /** مقاس المنتج (S/M/L… أو 64GB…) — بيظهر جنب المنتج في القايمة فقط (مش بيتطبع). */
  size?: string | null
  /** اسم اللون بالعربي — بيظهر كوسم صغير جنب المنتج. */
  color?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: LabelProduct[]
}

/* ───────────────────────── ثوابت ───────────────────────── */

type Mode = 'sheet' | 'roll'
type PresetKey = '40x30' | '50x30' | '30x20' | 'custom'

const PRESETS: { key: PresetKey; w: number; h: number }[] = [
  { key: '40x30', w: 40, h: 30 },
  { key: '50x30', w: 50, h: 30 },
  { key: '30x20', w: 30, h: 20 },
  { key: 'custom', w: 40, h: 30 },
]

// ألوان المقاسات حسب عُرف الملابس (من غير بنفسجي)
const SIZE_CHIPS: Record<string, { bg: string; text: string }> = {
  XS: { bg: 'bg-rose-500', text: 'text-white' },
  S: { bg: 'bg-amber-400', text: 'text-amber-950' },
  M: { bg: 'bg-emerald-500', text: 'text-white' },
  L: { bg: 'bg-orange-500', text: 'text-white' },
  XL: { bg: 'bg-sky-600', text: 'text-white' },
  XXL: { bg: 'bg-teal-700', text: 'text-white' },
}
const sizeChip = (size?: string | null) => {
  if (!size) return null
  const label = size.trim()
  if (!label) return null
  return { label, ...(SIZE_CHIPS[label.toUpperCase()] ?? { bg: 'bg-slate-700', text: 'text-white' }) }
}

const MM = 3.78 // 1mm ≈ 3.78px @ 96dpi
const MAX_QTY = 200
const PREFS_KEY = 'nezam:labels:prefs:v1'

interface Prefs {
  mode: Mode
  preset: PresetKey
  cw: number
  ch: number
  name: boolean
  price: boolean
  text: boolean
}

const fmtPrice = (n: number) =>
  n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (n: number) => n.toLocaleString('en-US')
/** جمع عربي مبسّط: 1 / 2 / 3-10 / 11+ */
const ar = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many
const labelsWord = (n: number) => ar(n, 'ملصق', 'ملصقين', 'ملصقات', 'ملصق')
const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n) || 0))

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const digitsOnly = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[^0-9]/g, '')

const ring = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40'

/* ───────────────────────── الدايلوج ───────────────────────── */

export function PrintLabelsDialog({ open, onOpenChange, products }: Props) {
  const [qty, setQty] = React.useState<Record<number, number>>({})
  const [focusId, setFocusId] = React.useState<number | null>(null)
  const [mode, setMode] = React.useState<Mode>('sheet')
  const [preset, setPreset] = React.useState<PresetKey>('40x30')
  const [cw, setCw] = React.useState(40)
  const [ch, setCh] = React.useState(30)
  const [showName, setShowName] = React.useState(true)
  const [showPrice, setShowPrice] = React.useState(true)
  const [showText, setShowText] = React.useState(true)
  const [view, setView] = React.useState<'sheet' | 'label'>('sheet')
  const [previewOpen, setPreviewOpen] = React.useState(false) // موبايل فقط
  const [tab, setTab] = React.useState<'products' | 'settings'>('products')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const hydrated = React.useRef(false)

  // كل مرة يتفتح: الكميات ترجع 1، والإعدادات المحفوظة ترجع (المحل غالباً بيطبع نفس المقاس)
  React.useEffect(() => {
    if (!open) {
      hydrated.current = false
      return
    }
    setQty(Object.fromEntries(products.map((p) => [p.id, 1])))
    setFocusId(products.find((p) => p.barcode)?.id ?? null)
    setView('sheet')
    setTab('products')
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Partial<Prefs>
        if (p.mode === 'sheet' || p.mode === 'roll') setMode(p.mode)
        if (p.preset && PRESETS.some((x) => x.key === p.preset)) setPreset(p.preset)
        if (typeof p.cw === 'number') setCw(clampInt(p.cw, 10, 300))
        if (typeof p.ch === 'number') setCh(clampInt(p.ch, 10, 300))
        if (typeof p.name === 'boolean') setShowName(p.name)
        if (typeof p.price === 'boolean') setShowPrice(p.price)
        if (typeof p.text === 'boolean') setShowText(p.text)
      }
    } catch {
      /* التخزين غير متاح — عادي */
    }
    hydrated.current = true
  }, [open, products])

  React.useEffect(() => {
    if (!open || !hydrated.current) return
    try {
      const p: Prefs = { mode, preset, cw, ch, name: showName, price: showPrice, text: showText }
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    } catch {
      /* ignore */
    }
  }, [open, mode, preset, cw, ch, showName, showPrice, showText])

  const withBarcode = products.filter((p) => p.barcode)
  const withoutBarcode = products.filter((p) => !p.barcode)
  const qtyOf = (id: number) => qty[id] ?? 1
  const total = withBarcode.reduce((s, p) => s + qtyOf(p.id), 0)

  const labelSize =
    preset === 'custom'
      ? { widthMm: Math.max(10, cw), heightMm: Math.max(10, ch) }
      : (() => {
          const p = PRESETS.find((x) => x.key === preset)!
          return { widthMm: p.w, heightMm: p.h }
        })()

  const layout: LabelLayout = computeLabelLayout(labelSize.widthMm, labelSize.heightMm, mode, {
    showName,
    showPrice,
    showBarcodeText: showText,
  })

  const perSheet = layout.sheet?.perSheet ?? 0
  const sheets = mode === 'sheet' && perSheet > 0 ? Math.ceil(total / perSheet) : 0
  const emptySlots = sheets * perSheet - total

  const focus = withBarcode.find((p) => p.id === focusId) ?? withBarcode[0] ?? null

  const hint = React.useMemo(() => {
    if (mode === 'roll') {
      return preset === 'custom'
        ? `اضبط مقاس الورق في إعدادات الطابعة على ${labelSize.widthMm} × ${labelSize.heightMm} مم — المقاس المخصص مش بيتعرف تلقائياً.`
        : `اضبط طابعة الرول على ${labelSize.widthMm} × ${labelSize.heightMm} مم قبل الطباعة.`
    }
    if (!layout.sheet) return null
    const { columns, rows, perSheet: n } = layout.sheet
    if (n < 6)
      return `المقاس كبير على A4 — هيطلع ${columns} × ${rows} = ${n} ملصق بس في الورقة. جرّب مقاس أصغر.`
    if (n > 60)
      return `المقاس صغير على A4 — ${columns} × ${rows} = ${n} ملصق، والباركود ممكن يبقى صغير على القارئ. جرّب مقاس أكبر.`
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, preset, labelSize.widthMm, labelSize.heightMm, layout.sheet])

  // تغيير التبويب يرجّع التمرير لفوق
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const sheetWarn = !!hint && mode === 'sheet'

  const setQ = (id: number, v: number) => setQty((p) => ({ ...p, [id]: clampInt(v, 0, MAX_QTY) }))
  const setAll = (v: number) => setQty(Object.fromEntries(products.map((p) => [p.id, v])))

  const handlePrint = () => {
    const items = withBarcode.filter((p) => qtyOf(p.id) > 0)
    if (items.length === 0) {
      toast.error(withBarcode.length === 0 ? 'مفيش منتجات ليها باركود' : 'حدّد كمية لمنتج واحد على الأقل')
      return
    }
    printBarcodeLabels(
      items.map((p) => ({
        name: p.name,
        barcode: p.barcode as string,
        price: p.price,
        quantity: qtyOf(p.id),
      })),
      { showName, showPrice, showBarcodeText: showText, mode, labelSize }
    )
    onOpenChange(false)
  }

  const modeText = mode === 'sheet' ? 'ورقة A4' : 'رول لاصق'

  const previewPanel = (
    <PreviewPanel
      mode={mode}
      view={view}
      onView={setView}
      layout={layout}
      products={withBarcode}
      qtyOf={qtyOf}
      focus={focus}
      showName={showName}
      showPrice={showPrice}
      showText={showText}
      sheets={sheets}
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex h-[92dvh] max-h-[92dvh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-foreground/10 bg-card p-0 shadow-2xl sm:max-w-5xl"
      >
        {/* ═════════ الرأس ═════════ */}
        <header className="relative shrink-0 bg-zinc-900 px-4 pb-5 pt-4 text-zinc-50 sm:px-6 sm:pt-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-900 shadow-sm">
              <Printer className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p dir="ltr" className="text-start text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-zinc-400">
                Labels / Print
              </p>
              <DialogTitle className="mt-1.5 text-lg font-extrabold leading-tight text-zinc-50">
                طباعة ملصقات الباركود
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs font-medium text-zinc-300">
                اختار الطريقة والمقاس، وشوف الملصق قدامك قبل ما تطبع.
              </DialogDescription>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
              <span
                dir="ltr"
                className="rounded-lg bg-zinc-800 px-2.5 py-1 text-sm font-extrabold tabular-nums tracking-wide ring-1 ring-zinc-700"
              >
                {labelSize.widthMm} × {labelSize.heightMm} <span className="text-[10px] font-semibold text-zinc-400">mm</span>
              </span>
              <span className="text-[11px] font-semibold text-zinc-400">{modeText}</span>
            </div>
            <DialogClose className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <X className="size-4" />
              <span className="sr-only">إغلاق</span>
            </DialogClose>
          </div>
          {/* شريط باركود زخرفي */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1.5 bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_5px,currentColor_5px_6px,transparent_6px_10px,currentColor_10px_13px,transparent_13px_16px)] text-white/55"
          />
        </header>

        {/* ═════════ الجسم ═════════ */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(340px,430px)]">
          {/* ── العمود الأيمن: تبويبين (المنتجات | إعدادات الطباعة) ── */}
          <div className="flex min-h-0 flex-col bg-muted/20">
            <div className="shrink-0 border-b bg-card px-4 py-3 sm:px-6">
              <div role="tablist" aria-label="أقسام الدايلوج" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
                <TabBtn
                  on={tab === 'products'}
                  onClick={() => setTab('products')}
                  icon={Package}
                  label="المنتجات والكميات"
                  badge={String(withBarcode.length)}
                />
                <TabBtn
                  on={tab === 'settings'}
                  onClick={() => setTab('settings')}
                  icon={SlidersHorizontal}
                  label="إعدادات الطباعة"
                  dot={sheetWarn}
                />
              </div>
            </div>

            <div
              ref={scrollRef}
              role="tabpanel"
              className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6"
            >
            {/* معاينة (موبايل) */}
            <div className="overflow-hidden rounded-2xl border bg-card lg:hidden">
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                aria-expanded={previewOpen}
                className={cn('flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-extrabold', ring)}
              >
                <Eye className="size-4 text-foreground/60" />
                معاينة حية
                <span className="ms-auto text-xs font-semibold text-foreground/60">{previewOpen ? 'إخفاء' : 'عرض'}</span>
              </button>
              {previewOpen && <div className="h-[380px] border-t">{previewPanel}</div>}
            </div>

              {tab === 'products' ? (
                <>
                  {/* ملخص الإعدادات الحالية — بيودّي لتبويب الإعدادات */}
                  <button
                    type="button"
                    onClick={() => setTab('settings')}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start transition-colors hover:bg-muted/60',
                      ring
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70">
                      <SlidersHorizontal className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-foreground/60">هتتطبع بالإعدادات دي</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <SumChip>{mode === 'sheet' ? <>ورقة <bdi dir="ltr">A4</bdi></> : 'رول لاصق'}</SumChip>
                        <SumChip>
                          <bdi dir="ltr" className="tabular-nums">{labelSize.widthMm} × {labelSize.heightMm}</bdi> مم
                        </SumChip>
                        {showName && <SumChip icon={Type}>الاسم</SumChip>}
                        {showText && <SumChip icon={BarcodeIcon}>رقم الباركود</SumChip>}
                        {showPrice && <SumChip icon={Tag}>السعر</SumChip>}
                        {!showName && !showText && !showPrice && <SumChip>باركود فقط</SumChip>}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-extrabold text-primary">تعديل</span>
                  </button>

                  {sheetWarn && (
                    <p className="-mt-2 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {hint}
                    </p>
                  )}

            {withoutBarcode.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200"
              >
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span title={withoutBarcode.map((p) => p.name).join('، ')}>
                  <b>{withoutBarcode.length} منتج من غير باركود</b> مش هيتطبع ليهم ملصق:{' '}
                  {withoutBarcode.slice(0, 3).map((p) => p.name).join('، ')}
                  {withoutBarcode.length > 3 ? ` و${withoutBarcode.length - 3} آخرين` : ''}. افتح المنتج وولّد باركود الأول.
                </span>
              </div>
            )}

            {/* المنتجات والكميات */}
            <section>
              <Title
                aside={
                  <span className="text-xs font-semibold tabular-nums text-foreground/65">
                    {withBarcode.length} {ar(withBarcode.length, 'منتج', 'منتجين', 'منتجات', 'منتج')} · {num(total)} {labelsWord(total)}
                  </span>
                }
              >
                المنتجات والكميات
              </Title>

              {withBarcode.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center">
                  <BarcodeIcon className="mx-auto size-6 text-foreground/40" aria-hidden />
                  <p className="mt-2 text-sm font-bold">مفيش منتجات ليها باركود</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground/65">ولّد باركود للمنتجات الأول وارجع.</p>
                </div>
              ) : (
                <>
                  {withBarcode.length > 1 && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground/65">الكمية للكل:</span>
                      {[1, 5, 10, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAll(n)}
                          className={cn(
                            'h-8 min-w-10 rounded-full border bg-background px-3 text-xs font-bold tabular-nums text-foreground/80 transition-colors hover:bg-muted',
                            ring
                          )}
                        >
                          <bdi dir="ltr">×{n}</bdi>
                        </button>
                      ))}
                    </div>
                  )}

                  <ul className="space-y-2">
                    {withBarcode.map((p) => {
                      const q = qtyOf(p.id)
                      const chip = sizeChip(p.size)
                      const isFocus = focus?.id === p.id
                      return (
                        <li
                          key={p.id}
                          className={cn(
                            'flex items-center gap-2.5 rounded-2xl border bg-card p-2.5 transition-colors',
                            isFocus && 'border-primary ring-1 ring-primary/40',
                            q === 0 && 'opacity-60'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setFocusId(p.id)}
                            aria-pressed={isFocus}
                            title="اعرضه في المعاينة"
                            className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-start', ring)}
                          >
                            {chip ? (
                              <span
                                className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold', chip.bg, chip.text)}
                                title={p.size ?? undefined}
                              >
                                {chip.label.length > 4 ? chip.label.slice(0, 4) : chip.label}
                              </span>
                            ) : (
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/50">
                                <BarcodeIcon className="size-4" aria-hidden />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold leading-snug">{p.name}</span>
                              <span className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-foreground/60">
                                <bdi dir="ltr" className="font-mono tabular-nums">{p.barcode}</bdi>
                                {showPrice && <span className="tabular-nums">{fmtPrice(p.price)} ج.م</span>}
                                {p.color && <span className="rounded-md bg-muted px-1.5 py-0.5">{p.color}</span>}
                                {q === 0 && <span className="font-bold text-foreground/70">مستبعد</span>}
                              </span>
                            </span>
                          </button>
                          <Qty value={q} onChange={(v) => setQ(p.id, v)} label={`كمية ${p.name}`} />
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>
                </>
              ) : (
                <>
            {/* 1) الطريقة */}
            <section>
              <Title n={1}>طريقة الطباعة</Title>
              <div role="radiogroup" aria-label="طريقة الطباعة" className="grid grid-cols-2 gap-2.5">
                <ModeCard
                  on={mode === 'sheet'}
                  onClick={() => setMode('sheet')}
                  title="ورقة A4"
                  sub="شبكة ملصقات تقصّها بإيدك"
                  art={<SheetArt />}
                />
                <ModeCard
                  on={mode === 'roll'}
                  onClick={() => setMode('roll')}
                  title="رول لاصق"
                  sub="ملصق واحد لكل صفحة (طابعة حرارية)"
                  art={<RollArt />}
                />
              </div>
            </section>

            {/* 2) المقاس */}
            <section>
              <Title
                n={2}
                aside={
                  <span className="text-xs font-semibold tabular-nums text-foreground/65">
                    {mode === 'sheet' && layout.sheet ? (
                      <>
                        <bdi dir="ltr">{layout.sheet.columns} × {layout.sheet.rows}</bdi> = {layout.sheet.perSheet} ملصق في الورقة
                      </>
                    ) : (
                      'ملصق واحد لكل طباعة'
                    )}
                  </span>
                }
              >
                مقاس الملصق
              </Title>
              <div role="radiogroup" aria-label="مقاس الملصق" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {PRESETS.map((p) => {
                  const on = preset === p.key
                  const isCustom = p.key === 'custom'
                  const w = isCustom ? Math.max(10, cw) : p.w
                  const h = isCustom ? Math.max(10, ch) : p.h
                  const r = w / h
                  const box = 34
                  const sw = r >= 1 ? box : box * r
                  const sh = r >= 1 ? box / r : box
                  const per =
                    mode === 'sheet'
                      ? computeLabelLayout(w, h, 'sheet', { showName, showPrice, showBarcodeText: showText }).sheet?.perSheet
                      : undefined
                  return (
                    <button
                      key={p.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPreset(p.key)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition-colors',
                        ring,
                        on ? 'border-primary bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-muted/60'
                      )}
                    >
                      <span className="flex h-10 items-center justify-center">
                        <span
                          className={cn('block rounded-[3px] border-2', on ? 'border-primary bg-primary/20' : 'border-foreground/30 bg-foreground/5')}
                          style={{ width: sw, height: sh }}
                        />
                      </span>
                      <span dir="ltr" className="text-sm font-extrabold tabular-nums leading-none">
                        {isCustom ? (on ? `${w} × ${h}` : 'مخصص') : `${p.w} × ${p.h}`}
                      </span>
                      <span className="text-[11px] font-medium leading-none text-foreground/60">
                        {per ? `${per} / ورقة` : isCustom ? 'قياس حرّ' : 'مم'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {preset === 'custom' && (
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-dashed bg-card p-3.5">
                  <Dim label="العرض (مم)" value={cw} onChange={(v) => setCw(clampInt(v, 10, 300))} />
                  <Dim label="الارتفاع (مم)" value={ch} onChange={(v) => setCh(clampInt(v, 10, 300))} />
                </div>
              )}

              {hint && (
                <p
                  className={cn(
                    'mt-3 flex items-start gap-2 rounded-xl p-3 text-xs font-medium leading-relaxed',
                    sheetWarn ? 'bg-amber-500/10 text-amber-900 dark:text-amber-200' : 'bg-muted text-foreground/70'
                  )}
                >
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {hint}
                </p>
              )}
            </section>

            {/* 3) المحتوى */}
            <section>
              <Title n={3}>اللي يظهر على الملصق</Title>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <ToggleRow icon={Type} label="اسم المنتج" on={showName} onChange={setShowName} />
                <ToggleRow icon={BarcodeIcon} label="رقم الباركود" on={showText} onChange={setShowText} />
                <ToggleRow icon={Tag} label="السعر" on={showPrice} onChange={setShowPrice} />
              </div>
              <p className="mt-2.5 text-xs font-medium leading-relaxed text-foreground/65">
                أي عنصر بتقفله بيدّي مساحة أكبر للباركود، فيتقري أسهل.
              </p>
            </section>

                  <button
                    type="button"
                    onClick={() => setTab('products')}
                    className={cn(
                      'flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-card text-sm font-bold transition-colors hover:bg-muted/60',
                      ring
                    )}
                  >
                    <Package className="size-4" />
                    تمام — رجوع للمنتجات ({num(total)} {labelsWord(total)})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── المعاينة (ديسكتوب) ── */}
          <aside className="hidden min-h-0 flex-col border-s bg-card lg:flex">{previewPanel}</aside>
        </div>

        {/* ═════════ الشريط السفلي ═════════ */}
        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold leading-none tabular-nums">{num(total)}</span>
                <span className="text-sm font-bold text-foreground/70">{labelsWord(total)}</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-medium tabular-nums text-foreground/65">
                {mode === 'sheet' ? (
                  sheets > 0 ? (
                    <>
                      <span>{sheets} {ar(sheets, 'ورقة', 'ورقتين', 'أوراق', 'ورقة')} <bdi dir="ltr">A4</bdi></span>
                      {emptySlots > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{emptySlots} {ar(emptySlots, 'خانة فاضية', 'خانتين فاضيتين', 'خانات فاضية', 'خانة فاضية')} في آخر ورقة</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span>مفيش ملصقات للطباعة</span>
                  )
                ) : (
                  <span>{num(total)} {ar(total, 'صفحة', 'صفحتين', 'صفحات', 'صفحة')} رول</span>
                )}
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-5 font-bold">
              إلغاء
            </Button>
            <Button onClick={handlePrint} disabled={total === 0} className="h-11 rounded-xl px-6 font-bold">
              <Printer className="size-4" />
              طباعة {total > 0 ? `${num(total)} ${labelsWord(total)}` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────────────────── مكوّنات الإعدادات ───────────────────────── */

function Title({ n, children, aside }: { n?: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-extrabold">
        {n !== undefined && (
          <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-extrabold text-background">
            {n}
          </span>
        )}
        {children}
      </h3>
      {aside}
    </div>
  )
}

function TabBtn({
  on, onClick, icon: Icon, label, badge, dot,
}: {
  on: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  dot?: boolean
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'relative flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition-colors',
        ring,
        on ? 'bg-card text-foreground shadow-sm' : 'text-foreground/65 hover:text-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge && (
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums leading-none', on ? 'bg-primary text-primary-foreground' : 'bg-foreground/10')}>
          {badge}
        </span>
      )}
      {dot && <span aria-label="تنبيه" className="absolute end-2 top-2 size-2 rounded-full bg-amber-500 ring-2 ring-muted" />}
    </button>
  )
}

function SumChip({ icon: Icon, children }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold leading-none text-foreground/80">
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  )
}

function ModeCard({
  on, onClick, title, sub, art,
}: {
  on: boolean
  onClick: () => void
  title: string
  sub: string
  art: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-start transition-colors',
        ring,
        on ? 'border-primary bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-muted/60'
      )}
    >
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70')}>
        {art}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold leading-tight">{title}</span>
        <span className="mt-1 block text-xs font-medium leading-snug text-foreground/65">{sub}</span>
      </span>
    </button>
  )
}

/** رسمة صغيرة: ورقة A4 عليها شبكة */
function SheetArt() {
  return (
    <svg viewBox="0 0 28 34" className="h-7 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2" y="2" width="24" height="30" rx="2.5" />
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => <rect key={`${r}${c}`} x={6 + c * 8.5} y={6 + r * 8} width="6.5" height="5.5" rx="1" />)
      )}
    </svg>
  )
}

/** رسمة صغيرة: شريط ملصقات على رول */
function RollArt() {
  return (
    <svg viewBox="0 0 34 28" className="h-6 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="9" cy="14" r="7" />
      <circle cx="9" cy="14" r="2.2" />
      <path d="M16 8h15v12H16" strokeLinejoin="round" />
      <path d="M20 12v4M23 12v4M26 12v4" />
    </svg>
  )
}

function ToggleRow({
  icon: Icon, label, on, onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 transition-colors',
        on ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/60'
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/60')}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-extrabold leading-tight">{label}</span>
      <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

function Dim({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold">{label}</p>
      <div className="flex items-center gap-1.5" dir="ltr">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          aria-label={`تقليل ${label}`}
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background transition-colors hover:bg-muted', ring)}
        >
          <Minus className="size-4" />
        </button>
        <input
          inputMode="numeric"
          aria-label={label}
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(parseInt(digitsOnly(e.target.value) || '0', 10))}
          className="h-10 w-full min-w-0 rounded-xl border bg-background text-center text-base font-extrabold tabular-nums outline-none transition-shadow focus:border-primary focus:ring-[3px] focus:ring-primary/25"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`زيادة ${label}`}
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background transition-colors hover:bg-muted', ring)}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

function Qty({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn = cn(
    'flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground/80 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background',
    ring
  )
  return (
    <div className="flex shrink-0 items-center gap-1" dir="ltr" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label="تقليل الكمية">
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(parseInt(digitsOnly(e.target.value) || '0', 10))}
        className="h-9 w-12 rounded-xl border bg-background text-center text-sm font-extrabold tabular-nums outline-none transition-shadow focus:border-primary focus:ring-[3px] focus:ring-primary/25"
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY} aria-label="زيادة الكمية">
        <Plus className="size-4" />
      </button>
    </div>
  )
}

/* ───────────────────────── المعاينة ───────────────────────── */

/** يقيس الحاوية ويرجّع أكبر scale يخلّي المحتوى (natW × natH) يدخل جواها */
function useFit(natW: number, natH: number, max: number) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [box, setBox] = React.useState({ w: 0, h: 0 })
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = box.w > 0 && box.h > 0 ? Math.min(max, box.w / natW, box.h / natH) : 0
  return { ref, scale }
}

function PreviewPanel({
  mode, view, onView, layout, products, qtyOf, focus, showName, showPrice, showText, sheets,
}: {
  mode: Mode
  view: 'sheet' | 'label'
  onView: (v: 'sheet' | 'label') => void
  layout: LabelLayout
  products: LabelProduct[]
  qtyOf: (id: number) => number
  focus: LabelProduct | null
  showName: boolean
  showPrice: boolean
  showText: boolean
  sheets: number
}) {
  // باركود كل منتج بيتولّد مرة واحدة لكل مقاس (نفس طريقة print-client)
  const svgFor = React.useMemo(() => {
    const cache = new Map<string, string>()
    return (code: string) => {
      let s = cache.get(code)
      if (s === undefined) {
        s =
          typeof window === 'undefined'
            ? ''
            : renderBarcodeSvg(code, {
                height: layout.barcodeHeightPx,
                width: layout.barcodeBarWidth,
                fontSize: layout.barcodeTextFontSizePt,
                displayValue: false,
              })
        cache.set(code, s)
      }
      return s
    }
  }, [layout.barcodeHeightPx, layout.barcodeBarWidth, layout.barcodeTextFontSizePt])

  const showSheet = mode === 'sheet' && view === 'sheet' && !!layout.sheet

  const sample: Sample = focus
    ? { name: focus.name, barcode: focus.barcode as string, price: focus.price }
    : { name: 'منتج تجريبي', barcode: '2000000000017', price: 25 }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Eye className="size-4 text-foreground/60" aria-hidden />
        <h3 className="text-sm font-extrabold">معاينة حية</h3>
        {mode === 'sheet' && (
          <div className="ms-auto flex items-center gap-0.5 rounded-xl bg-muted p-0.5" role="group" aria-label="نوع المعاينة">
            {(['sheet', 'label'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onView(v)}
                aria-pressed={view === v}
                className={cn(
                  'h-7 rounded-lg px-3 text-xs font-bold transition-colors',
                  ring,
                  view === v ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65 hover:text-foreground'
                )}
              >
                {v === 'sheet' ? 'الورقة' : 'الملصق'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-muted/40 text-foreground">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, color-mix(in oklab, currentColor 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, currentColor 6%, transparent) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        {showSheet ? (
          <SheetStage
            layout={layout}
            products={products}
            qtyOf={qtyOf}
            svgFor={svgFor}
            showName={showName}
            showPrice={showPrice}
            showText={showText}
          />
        ) : (
          <LabelStage
            layout={layout}
            sample={sample}
            svg={svgFor(sample.barcode)}
            stack={focus ? qtyOf(focus.id) > 1 : false}
            showName={showName}
            showPrice={showPrice}
            showText={showText}
          />
        )}
      </div>

      <div className="shrink-0 border-t px-4 py-2.5 text-center text-[11px] font-medium leading-relaxed text-foreground/60">
        {showSheet
          ? `الورقة الأولى${sheets > 1 ? ` من ${sheets}` : ''} بترتيب الطباعة الفعلي. المعاينة تقريبية — الباركود بيتطبع بالحجم الحقيقي.`
          : focus
            ? `ملصق «${focus.name}» — اضغط على أي منتج في القايمة لمعاينته.`
            : 'المعاينة تقريبية — الباركود بيتطبع بالحجم الحقيقي.'}
      </div>
    </div>
  )
}

interface Sample {
  name: string
  barcode: string
  price: number
}

interface FaceProps {
  layout: LabelLayout
  showName: boolean
  showPrice: boolean
  showText: boolean
}

/** الملصق بمقاسه الطبيعي (px) — نفس تنسيق الطباعة. دايماً جوّه حاوية dir=ltr */
function LabelFace({
  layout, showName, showPrice, showText, sample, svg, dashed,
}: FaceProps & { sample: Sample; svg: string; dashed?: boolean }) {
  return (
    <div
      style={{
        width: layout.widthMm * MM,
        height: layout.heightMm * MM,
        padding: layout.paddingMm * MM,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        border: dashed ? '1px dashed #c8c8c8' : '1px solid #d4d4d4',
        borderRadius: dashed ? '1mm' : 0,
      }}
    >
      {showName && (
        <div
          dir="rtl"
          style={{
            fontFamily: "Tahoma, Cairo, sans-serif",
            fontSize: `${layout.nameFontSizePt}pt`,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: '100%',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: layout.nameMaxLines,
            textOverflow: 'ellipsis',
            textAlign: 'center',
            margin: '0 0 0.6mm 0',
            wordBreak: 'break-word',
          }}
        >
          {sample.name}
        </div>
      )}
      {svg ? (
        <div
          className="[&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full"
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          style={{
            width: '80%',
            height: layout.barcodeHeightPx,
            background: 'repeating-linear-gradient(90deg, #000 0, #000 2px, transparent 2px, transparent 4px)',
            opacity: 0.3,
          }}
        />
      )}
      {showText && (
        <div
          dir="ltr"
          style={{
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: `${layout.barcodeTextFontSizePt}pt`,
            fontWeight: 700,
            letterSpacing: '0.06em',
            marginTop: '0.4mm',
          }}
        >
          {sample.barcode}
        </div>
      )}
      {showPrice && (
        <div
          dir="rtl"
          style={{
            fontFamily: "Tahoma, Cairo, sans-serif",
            fontSize: `${layout.priceFontSizePt}pt`,
            fontWeight: 800,
            marginTop: '0.6mm',
          }}
        >
          {fmtPrice(sample.price)} ج.م
        </div>
      )}
    </div>
  )
}

/** ملصق واحد مكبّر (رول، أو «الملصق» في وضع الورقة) */
function LabelStage({
  layout, sample, svg, stack, showName, showPrice, showText,
}: FaceProps & { sample: Sample; svg: string; stack: boolean }) {
  const pad = stack ? 10 : 0
  const natW = layout.widthMm * MM + pad
  const natH = layout.heightMm * MM + pad
  const { ref, scale } = useFit(natW, natH, 4)
  return (
    <div ref={ref} dir="ltr" className="absolute inset-5 flex items-center justify-center">
      <div className="relative shrink-0" style={{ width: natW * scale, height: natH * scale, visibility: scale ? 'visible' : 'hidden' }}>
        <div className="absolute left-0 top-0" style={{ width: natW, height: natH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {stack && (
            <>
              <span aria-hidden className="absolute rounded-[1px] border border-[#d4d4d4] bg-white" style={{ left: 10, top: 10, width: layout.widthMm * MM, height: layout.heightMm * MM }} />
              <span aria-hidden className="absolute rounded-[1px] border border-[#d4d4d4] bg-white" style={{ left: 5, top: 5, width: layout.widthMm * MM, height: layout.heightMm * MM }} />
            </>
          )}
          <div className="absolute left-0 top-0 shadow-[0_6px_24px_rgba(0,0,0,0.14)]">
            <LabelFace layout={layout} showName={showName} showPrice={showPrice} showText={showText} sample={sample} svg={svg} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** ورقة A4 كاملة: الخانات بتتملي بالترتيب الفعلي (منتج × كميته) لأول ورقة */
function SheetStage({
  layout, products, qtyOf, svgFor, showName, showPrice, showText,
}: FaceProps & { products: LabelProduct[]; qtyOf: (id: number) => number; svgFor: (code: string) => string }) {
  const g = layout.sheet!
  const cells = g.columns * g.rows

  const filled = React.useMemo(() => {
    const out: Sample[] = []
    for (const p of products) {
      const n = qtyOf(p.id)
      for (let i = 0; i < n && out.length < cells; i++) {
        out.push({ name: p.name, barcode: p.barcode as string, price: p.price })
      }
      if (out.length >= cells) break
    }
    return out
  }, [products, qtyOf, cells])

  // لو المستخدم طابع كام ملصق بس، نعرض أول الصفوف المستخدمة (+ صف) ونكبّرهم بدل ورقة كاملة بملصقات مجهرية
  const rowsUsed = Math.ceil(filled.length / g.columns)
  const showRows = Math.min(g.rows, Math.max(2, rowsUsed + 1))
  const cropped = showRows < g.rows
  const pageW = A4.widthMm * MM
  const pageH = A4.heightMm * MM
  const natW = pageW
  const natH = cropped
    ? Math.min(pageH, g.pageMarginMm * MM + showRows * (layout.heightMm + g.gapYMm) * MM + 12)
    : pageH
  const { ref, scale } = useFit(natW, natH, cropped ? 1.6 : 1)

  return (
    <div ref={ref} dir="ltr" className="absolute inset-5 flex items-center justify-center">
      <div
        className="relative shrink-0 overflow-hidden shadow-[0_6px_24px_rgba(0,0,0,0.14)]"
        style={{ width: natW * scale, height: natH * scale, visibility: scale ? 'visible' : 'hidden' }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: pageW,
            height: pageH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            padding: g.pageMarginMm * MM,
            boxSizing: 'border-box',
            display: 'grid',
            gridTemplateColumns: `repeat(${g.columns}, ${layout.widthMm * MM}px)`,
            gridTemplateRows: `repeat(${g.rows}, ${layout.heightMm * MM}px)`,
            gap: `${g.gapYMm * MM}px ${g.gapXMm * MM}px`,
            justifyContent: 'start',
            alignContent: 'start',
            background: '#fff',
            border: '1px solid #d4d4d4',
          }}
        >
          {Array.from({ length: cells }).map((_, i) => {
            const s = filled[i]
            return s ? (
              <LabelFace
                key={i}
                layout={layout}
                showName={showName}
                showPrice={showPrice}
                showText={showText}
                sample={s}
                svg={svgFor(s.barcode)}
                dashed
              />
            ) : (
              <div
                key={i}
                style={{
                  width: layout.widthMm * MM,
                  height: layout.heightMm * MM,
                  border: '1px dashed #cfcfcf',
                  borderRadius: '1mm',
                  boxSizing: 'border-box',
                }}
              />
            )
          })}
        </div>
        {cropped && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
    </div>
  )
}