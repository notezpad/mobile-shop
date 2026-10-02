'use client'

import * as React from 'react'
import { Printer, Minus, Plus, Eye, Info, Sheet, Sticker, Ruler, Layers } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { printBarcodeLabels, renderBarcodeSvg } from '@/lib/print-client'
import { computeLabelLayout, A4, type LabelLayout } from '@/lib/print'
import { cn } from '@/lib/utils'

export interface LabelProduct {
  id: number
  name: string
  barcode: string | null
  price: number
  /** Optional size label like "S", "M", "L", "XL" for clothing, or "A4", "A5"
   *  for paper — rendered as a colored chip on the product row and on the
   *  label preview so the cashier/customer can spot the size at a glance. */
  size?: string | null
  /** Optional color name in Arabic like "أحمر", "أزرق" — used for the color
   *  dot on the product row. */
  color?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: LabelProduct[]
}

// ── Label size presets ──────────────────────────────────────────────────
// Each preset also gets a color hue — used for the prominent size badge on
// the preview and the per-row size chip. Color coding helps the cashier
// grab the right sticker from the printer at a glance.
const ROLL_PRESETS: Record<
  string,
  { label: string; widthMm: number; heightMm: number; hue: string; ring: string }
> = {
  '40x30': {
    label: '40 × 30 مم',
    widthMm: 40,
    heightMm: 30,
    hue: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 border-emerald-500/30',
    ring: 'ring-emerald-500/40',
  },
  '50x30': {
    label: '50 × 30 مم',
    widthMm: 50,
    heightMm: 30,
    hue: 'from-sky-500/15 to-sky-500/5 text-sky-700 border-sky-500/30',
    ring: 'ring-sky-500/40',
  },
  '30x20': {
    label: '30 × 20 مم',
    widthMm: 30,
    heightMm: 20,
    hue: 'from-amber-500/15 to-amber-500/5 text-amber-700 border-amber-500/30',
    ring: 'ring-amber-500/40',
  },
  custom: {
    label: 'مقاس مخصص',
    widthMm: 40,
    heightMm: 30,
    hue: 'from-violet-500/15 to-violet-500/5 text-violet-700 border-violet-500/30',
    ring: 'ring-violet-500/40',
  },
}

// ── Size chip palette (for the "إظهار المقاس بشكل بارز" feature) ─────────
// When a product variant has a `size` attribute (S/M/L/XL for clothing, or
// A4/A5 for paper, or 32GB/64GB/128GB for storage), it's rendered as a bold
// colored chip — both on the product row in the dialog AND on the printed
// label preview. The colors below follow retail convention.
const SIZE_CHIPS: Record<string, { bg: string; text: string; label: string }> = {
  XS: { bg: 'bg-rose-500', text: 'text-white', label: 'XS' },
  S: { bg: 'bg-amber-400', text: 'text-amber-950', label: 'S' },
  M: { bg: 'bg-emerald-500', text: 'text-white', label: 'M' },
  L: { bg: 'bg-orange-500', text: 'text-white', label: 'L' },
  XL: { bg: 'bg-sky-600', text: 'text-white', label: 'XL' },
  XXL: { bg: 'bg-violet-600', text: 'text-white', label: 'XXL' },
}
const DEFAULT_SIZE_CHIP = { bg: 'bg-slate-700', text: 'text-white', label: '' }

function getSizeChip(size: string | null | undefined) {
  if (!size) return null
  const key = size.trim().toUpperCase()
  return SIZE_CHIPS[key] ?? { ...DEFAULT_SIZE_CHIP, label: size }
}

export function PrintLabelsDialog({ open, onOpenChange, products }: Props) {
  const [qty, setQty] = React.useState<Record<number, number>>({})
  const [showName, setShowName] = React.useState(true)
  const [showPrice, setShowPrice] = React.useState(true)
  const [showBarcodeText, setShowBarcodeText] = React.useState(true)
  const [showSizeChip, setShowSizeChip] = React.useState(true)
  const [printMode, setPrintMode] = React.useState<'sheet' | 'roll'>('sheet')
  const [rollPreset, setRollPreset] = React.useState<keyof typeof ROLL_PRESETS>('40x30')
  const [customWidth, setCustomWidth] = React.useState(40)
  const [customHeight, setCustomHeight] = React.useState(30)

  React.useEffect(() => {
    if (open) {
      setQty(Object.fromEntries(products.map((p) => [p.id, 1])))
    }
  }, [open, products])

  const withBarcode = products.filter((p) => p.barcode)
  const withoutBarcode = products.filter((p) => !p.barcode)
  const totalLabels = withBarcode.reduce((s, p) => s + (qty[p.id] ?? 1), 0)
  const anyHasSize = withBarcode.some((p) => getSizeChip(p.size))

  const labelSize =
    rollPreset === 'custom'
      ? { widthMm: Math.max(10, customWidth), heightMm: Math.max(10, customHeight) }
      : { widthMm: ROLL_PRESETS[rollPreset].widthMm, heightMm: ROLL_PRESETS[rollPreset].heightMm }

  const layout: LabelLayout = computeLabelLayout(
    labelSize.widthMm,
    labelSize.heightMm,
    printMode,
    { showName, showPrice, showBarcodeText }
  )

  const sampleProduct = withBarcode[0]
  const sampleBarcode = sampleProduct?.barcode ?? '2000000000017'
  const sampleName = sampleProduct?.name ?? 'منتج تجريبي'
  const samplePrice = sampleProduct?.price ?? 25
  const sampleSize = sampleProduct?.size ?? null
  const sizeChip = showSizeChip ? getSizeChip(sampleSize) : null

  // Pre-render the sample barcode SVG. Cached by value + dimensions so we
  // don't re-run jsbarcode on every keystroke in the custom-size inputs.
  const previewSvg = React.useMemo(() => {
    if (typeof window === 'undefined') return ''
    return renderBarcodeSvg(sampleBarcode, {
      height: layout.barcodeHeightPx,
      width: layout.barcodeBarWidth,
      fontSize: layout.barcodeTextFontSizePt,
      displayValue: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleBarcode, layout.barcodeHeightPx, layout.barcodeBarWidth, layout.barcodeTextFontSizePt])

  // ── Mismatch guidance ────────────────────────────────────────────────
  const mismatchHint = React.useMemo(() => {
    if (printMode === 'roll') {
      if (rollPreset === 'custom') {
        return `تأكد إن مقاس الورق في إعدادات الطابعة مضبوط على ${labelSize.widthMm} × ${labelSize.heightMm} مم، لأن هذا المقاس غير معروف تلقائياً.`
      }
      return `تأكد من ضبط إعدادات طابعة الرول على مقاس ${labelSize.widthMm} × ${labelSize.heightMm} مم قبل الطباعة.`
    }
    if (!layout.sheet) return null
    const { columns, rows, perSheet } = layout.sheet
    if (perSheet < 6) {
      return `المقاس المختار (${labelSize.widthMm} × ${labelSize.heightMm} مم) كبير نسبياً على ورقة A4 — سينتج ${columns} × ${rows} = ${perSheet} ملصق فقط. جرّب مقاساً أصغر للحصول على ملصقات أكثر.`
    }
    if (perSheet > 60) {
      return `المقاس المختار (${labelSize.widthMm} × ${labelSize.heightMm} مم) صغير على ورقة A4 — سينتج ${columns} × ${rows} = ${perSheet} ملصقاً. قد يصبح الباركود صغيراً جداً للقراءة، جرّب مقاساً أكبر.`
    }
    return null
  }, [printMode, rollPreset, labelSize.widthMm, labelSize.heightMm, layout.sheet])

  const setProductQty = (id: number, value: number) => {
    setQty((prev) => ({ ...prev, [id]: Math.max(1, Math.min(200, Math.floor(value) || 1)) }))
  }

  const handlePrint = () => {
    if (withBarcode.length === 0) {
      toast.error('لا توجد منتجات لها باركود ضمن المحدد')
      return
    }
    printBarcodeLabels(
      withBarcode.map((p) => ({
        name: p.name,
        barcode: p.barcode as string,
        price: p.price,
        quantity: qty[p.id] ?? 1,
      })),
      {
        showName,
        showPrice,
        showBarcodeText,
        mode: printMode,
        labelSize,
      }
    )
    onOpenChange(false)
  }

  const sizePreset = ROLL_PRESETS[rollPreset]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex h-[92dvh] max-h-[92dvh] w-[98vw] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-foreground/10 bg-card p-0 shadow-2xl"
      >
        {/* ═══════════════════════════════════════════════════════════════
            HEADER — clean, compact, modern. Single row with icon + title +
            subtitle, then a thin divider. Matches the printer-settings
            dialog's "control room" aesthetic from settings-ui.tsx.
            ═══════════════════════════════════════════════════════════════ */}
        <div className="flex shrink-0 items-center gap-3 border-b border-dashed border-foreground/15 bg-muted/40 px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
            <Printer className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              dir="ltr"
              className="text-right text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-muted-foreground"
            >
              Labels / Print
            </p>
            <DialogTitle className="mt-1.5 text-lg font-extrabold leading-tight">
              طباعة ملصقات الباركود
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs leading-relaxed">
              اختر المقاس، شاهد المعاينة الحية، ثم اطبع.
            </DialogDescription>
          </div>
          {/* Prominent size badge — always visible in the header so the
              user never loses track of which size they're working with. */}
          <div
            className={cn(
              'flex shrink-0 flex-col items-center justify-center rounded-xl border bg-gradient-to-br px-3 py-2 text-center',
              sizePreset.hue
            )}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">المقاس</span>
            <span className="font-mono text-base font-extrabold leading-tight">
              {labelSize.widthMm}×{labelSize.heightMm}
            </span>
            <span className="text-[9px] opacity-70">مم</span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            BODY — two-column grid: left = settings, right = live preview.
            On mobile (below md) it collapses to a single column with the
            preview appearing AFTER the settings (so the user can scroll
            down to see it once they've configured the options).
            ═══════════════════════════════════════════════════════════════ */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          {/* ── LEFT: Settings column ── */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {withoutBarcode.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  <b>منتجات بدون باركود:</b>{' '}
                  {withoutBarcode.map((p) => p.name).join('، ')} — لن يتم طباعة ملصقات لها. افتح
                  المنتج وولّد باركوداً أولاً.
                </span>
              </div>
            )}

            {/* ─── Section: Print method ─── */}
            <Section icon={Layers} label="طريقة الطباعة" hint="اختر ورقة A4 أو طابعة رول">
              <div className="grid grid-cols-2 gap-2">
                <ModeChoice
                  active={printMode === 'sheet'}
                  onClick={() => setPrintMode('sheet')}
                  icon={Sheet}
                  title="ورقة A4"
                  sub="شبكة ملصقات، تُقص باليد"
                />
                <ModeChoice
                  active={printMode === 'roll'}
                  onClick={() => setPrintMode('roll')}
                  icon={Sticker}
                  title="رول لاصق"
                  sub="ملصق واحد لكل صفحة"
                />
              </div>
            </Section>

            {/* ─── Section: Label size ─── */}
            <Section
              icon={Ruler}
              label="مقاس الملصق"
              hint={
                printMode === 'sheet'
                  ? `${layout.sheet?.columns ?? 0} × ${layout.sheet?.rows ?? 0} = ${
                      layout.sheet?.perSheet ?? 0
                    } ملصق لكل ورقة A4`
                  : `${labelSize.widthMm} × ${labelSize.heightMm} مم — ملصق واحد لكل طباعة`
              }
            >
              {/* Visual size picker — instead of a plain dropdown, show
                  each preset as a card with the size rendered prominently
                  and a tiny visual indicator of the label's aspect ratio.
                  This is the "إظهار المقاس بشكل بارز" feature. */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(ROLL_PRESETS) as Array<keyof typeof ROLL_PRESETS>).map((key) => {
                  const p = ROLL_PRESETS[key]
                  const isActive = rollPreset === key
                  const isCustom = key === 'custom'
                  const w = isCustom ? customWidth : p.widthMm
                  const h = isCustom ? customHeight : p.heightMm
                  // Visual aspect ratio preview (capped to fit the chip)
                  const maxDim = 32
                  const ratio = w / h
                  const chipW = ratio >= 1 ? maxDim : maxDim * ratio
                  const chipH = ratio >= 1 ? maxDim / ratio : maxDim
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRollPreset(key)}
                      className={cn(
                        'group relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all',
                        isActive
                          ? cn('border-foreground bg-foreground/5', p.ring, 'ring-2')
                          : 'border-foreground/10 hover:border-foreground/30 hover:bg-muted/40'
                      )}
                    >
                      <span
                        className={cn(
                          'block rounded-sm border',
                          isActive ? 'border-foreground/60 bg-foreground/15' : 'border-foreground/30 bg-foreground/5'
                        )}
                        style={{ width: `${chipW}px`, height: `${chipH}px` }}
                      />
                      <span
                        className={cn(
                          'font-mono text-[11px] font-bold leading-none',
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {isCustom ? 'مخصص' : `${p.widthMm}×${p.heightMm}`}
                      </span>
                    </button>
                  )
                })}
              </div>

              {rollPreset === 'custom' && (
                <div className="mt-3 flex items-end gap-2 rounded-lg border bg-muted/30 p-2.5">
                  <div className="flex-1">
                    <Label className="mb-1.5 block text-[11px] text-muted-foreground">العرض (مم)</Label>
                    <Input
                      type="number"
                      min={10}
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value) || 10)}
                      className="h-9 text-center font-mono font-bold"
                    />
                  </div>
                  <div className="pb-2 text-lg font-bold text-muted-foreground">×</div>
                  <div className="flex-1">
                    <Label className="mb-1.5 block text-[11px] text-muted-foreground">الارتفاع (مم)</Label>
                    <Input
                      type="number"
                      min={10}
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value) || 10)}
                      className="h-9 text-center font-mono font-bold"
                    />
                  </div>
                </div>
              )}

              {mismatchHint && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span>{mismatchHint}</span>
                </div>
              )}
            </Section>

            {/* ─── Section: Display options ─── */}
            <Section
              icon={Eye}
              label="العناصر الظاهرة على الملصق"
              hint="تحكم في محتوى الملصق المطبوع"
            >
              <div className="grid grid-cols-2 gap-2">
                <ToggleChip
                  checked={showName}
                  onChange={setShowName}
                  label="اسم المنتج"
                />
                <ToggleChip
                  checked={showBarcodeText}
                  onChange={setShowBarcodeText}
                  label="رقم الباركود"
                />
                <ToggleChip
                  checked={showPrice}
                  onChange={setShowPrice}
                  label="السعر"
                />
                <ToggleChip
                  checked={showSizeChip && anyHasSize}
                  onChange={(v) => setShowSizeChip(v)}
                  label="شارة المقاس"
                  disabled={!anyHasSize}
                  hint={!anyHasSize ? 'لا توجد مقاسات' : undefined}
                />
              </div>
            </Section>

            {/* ─── Section: Product list ─── */}
            <Section
              icon={Layers}
              label="المنتجات المحددة"
              hint={`${withBarcode.length} منتج • ${totalLabels} ملصق`}
            >
              {withBarcode.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد منتجات بباركود ضمن المحدد
                </p>
              ) : (
                <div className="space-y-1.5">
                  {withBarcode.map((p) => {
                    const chip = getSizeChip(p.size)
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background p-2 transition-colors hover:border-foreground/25"
                      >
                        {/* Size chip — prominent color block on the left */}
                        {chip && showSizeChip && (
                          <span
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-extrabold',
                              chip.bg,
                              chip.text
                            )}
                            title={p.size ?? undefined}
                          >
                            {chip.label}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-tight">{p.name}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">
                              {p.barcode}
                            </p>
                            {p.color && (
                              <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                                {p.color}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Quantity stepper */}
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md hover:bg-foreground/10"
                            onClick={() => setProductQty(p.id, (qty[p.id] ?? 1) - 1)}
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={200}
                            value={qty[p.id] ?? 1}
                            onChange={(e) => setProductQty(p.id, Number(e.target.value))}
                            className="h-7 w-12 border-foreground/15 bg-background text-center text-sm font-bold tabular-nums"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md hover:bg-foreground/10"
                            onClick={() => setProductQty(p.id, (qty[p.id] ?? 1) + 1)}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* ── RIGHT: Sticky live preview pane ── */}
          <aside className="hidden min-h-0 shrink-0 flex-col border-r border-dashed border-foreground/15 bg-muted/30 lg:flex">
            <div className="flex shrink-0 items-center gap-2 border-b border-dashed border-foreground/15 px-4 py-3">
              <Eye className="size-4 text-muted-foreground" />
              <span className="text-sm font-bold">معاينة حية</span>
              <span className="mr-auto rounded-md bg-background px-2 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                {printMode === 'sheet' && layout.sheet
                  ? `${layout.sheet.columns}×${layout.sheet.rows}`
                  : '1×1'}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              <PreviewPane
                layout={layout}
                svgMarkup={previewSvg}
                showName={showName}
                showPrice={showPrice}
                showBarcodeText={showBarcodeText}
                sizeChip={sizeChip}
                sampleName={sampleName}
                sampleBarcode={sampleBarcode}
                samplePrice={samplePrice}
                mode={printMode}
              />
            </div>
            <div className="shrink-0 border-t border-dashed border-foreground/15 px-4 py-2.5 text-center text-[10px] leading-relaxed text-muted-foreground">
              المعاينة تقريبية — عند الطباعة سيظهر الباركود بالحجم الفعلي.
            </div>
          </aside>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            FOOTER — sticky action bar with the print button on the right
            and a summary on the left.
            ═══════════════════════════════════════════════════════════════ */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-dashed border-foreground/15 bg-muted/40 px-5 py-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{totalLabels}</span> ملصق
            {printMode === 'sheet' && layout.sheet ? (
              <span className="opacity-70">
                {' '}
                • {Math.ceil(totalLabels / layout.sheet.perSheet)} ورقة A4
              </span>
            ) : (
              <span className="opacity-70"> • {totalLabels} صفحة رول</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-bold"
            >
              إلغاء
            </Button>
            <Button
              onClick={handlePrint}
              disabled={withBarcode.length === 0}
              className="rounded-xl font-bold"
            >
              <Printer className="size-4" />
              طباعة {totalLabels > 0 ? `${totalLabels} ملصق` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Helper sub-components
// ═════════════════════════════════════════════════════════════════════════

function Section({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{label}</h3>
        {hint && <span className="mr-auto text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function ModeChoice({
  active,
  onClick,
  icon: Icon,
  title,
  sub,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-right transition-all',
        active
          ? 'border-foreground bg-foreground/5 ring-2 ring-foreground/20'
          : 'border-foreground/10 hover:border-foreground/30 hover:bg-muted/40'
      )}
    >
      <Icon className={cn('size-5', active ? 'text-foreground' : 'text-muted-foreground')} />
      <span className="text-sm font-bold leading-tight">{title}</span>
      <span className="text-[10px] leading-tight text-muted-foreground">{sub}</span>
    </button>
  )
}

function ToggleChip({
  checked,
  onChange,
  label,
  disabled,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-right transition-all',
        disabled && 'cursor-not-allowed opacity-50',
        checked
          ? 'border-foreground bg-foreground/5'
          : 'border-foreground/10 hover:border-foreground/30'
      )}
    >
      <Checkbox checked={checked} disabled={disabled} className="pointer-events-none" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-bold leading-tight">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
    </button>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Preview pane — renders the actual label (or A4 sheet grid) at natural mm
// size, then scales it down with CSS transform to fit the pane. This means
// the preview looks EXACTLY like the printed output, just smaller.
// ═════════════════════════════════════════════════════════════════════════

function PreviewPane({
  layout,
  svgMarkup,
  showName,
  showPrice,
  showBarcodeText,
  sizeChip,
  sampleName,
  sampleBarcode,
  samplePrice,
  mode,
}: {
  layout: LabelLayout
  svgMarkup: string
  showName: boolean
  showPrice: boolean
  showBarcodeText: boolean
  sizeChip: { bg: string; text: string; label: string } | null
  sampleName: string
  sampleBarcode: string
  samplePrice: number
  mode: 'sheet' | 'roll'
}) {
  // 1mm ≈ 3.78px @ 96dpi
  const MM = 3.78

  // The pane is fixed at 320px wide minus padding (~280px usable). We scale
  // the natural-size label down to fit, preserving aspect ratio.
  const PREVIEW_MAX_PX = 270
  const naturalPx = layout.widthMm * MM
  const scale = Math.min(1, PREVIEW_MAX_PX / naturalPx)

  if (mode === 'sheet' && layout.sheet) {
    return (
      <SheetPreview
        layout={layout}
        scale={scale * 0.55}
        svgMarkup={svgMarkup}
        showName={showName}
        showPrice={showPrice}
        showBarcodeText={showBarcodeText}
        sizeChip={sizeChip}
        sampleName={sampleName}
        sampleBarcode={sampleBarcode}
        samplePrice={samplePrice}
      />
    )
  }

  return (
    <RollPreview
      layout={layout}
      scale={scale}
      svgMarkup={svgMarkup}
      showName={showName}
      showPrice={showPrice}
      showBarcodeText={showBarcodeText}
      sizeChip={sizeChip}
      sampleName={sampleName}
      sampleBarcode={sampleBarcode}
      samplePrice={samplePrice}
    />
  )
}

function RollPreview({
  layout,
  scale,
  svgMarkup,
  showName,
  showPrice,
  showBarcodeText,
  sizeChip,
  sampleName,
  sampleBarcode,
  samplePrice,
}: {
  layout: LabelLayout
  scale: number
  svgMarkup: string
  showName: boolean
  showPrice: boolean
  showBarcodeText: boolean
  sizeChip: { bg: string; text: string; label: string } | null
  sampleName: string
  sampleBarcode: string
  samplePrice: number
}) {
  const MM = 3.78
  const wPx = layout.widthMm * MM
  const hPx = layout.heightMm * MM
  return (
    <div
      className="relative"
      style={{
        width: `${wPx * scale}px`,
        height: `${hPx * scale}px`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      {/* The actual label content, rendered at natural mm size and scaled */}
      <div
        style={{
          width: `${wPx}px`,
          height: `${hPx}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          padding: `${layout.paddingMm * MM}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          boxSizing: 'border-box',
          background: '#fff',
          border: '1px solid #d4d4d4',
        }}
      >
        {sizeChip && (
          <div
            className={cn(
              'flex items-center justify-center rounded text-[10px] font-extrabold',
              sizeChip.bg,
              sizeChip.text
            )}
            style={{
              minWidth: '18px',
              padding: '2px 6px',
              marginBottom: '2px',
              alignSelf: 'flex-end',
            }}
          >
            {sizeChip.label}
          </div>
        )}
        {showName && (
          <div
            style={{
              fontSize: `${layout.nameFontSizePt}pt`,
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: layout.nameMaxLines,
              textAlign: 'center',
              margin: 0,
            }}
          >
            {sampleName}
          </div>
        )}
        {svgMarkup ? (
          <div
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
          // Placeholder while SVG is rendering — never show a fully blank pane
          <div
            style={{
              width: '80%',
              height: `${layout.barcodeHeightPx}px`,
              background:
                'repeating-linear-gradient(90deg, #000 0, #000 2px, transparent 2px, transparent 4px)',
              opacity: 0.3,
            }}
          />
        )}
        {showBarcodeText && (
          <div
            dir="ltr"
            style={{
              fontFamily: 'Consolas, "Courier New", monospace',
              fontSize: `${layout.barcodeTextFontSizePt}pt`,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: '#000',
            }}
          >
            {sampleBarcode}
          </div>
        )}
        {showPrice && (
          <div
            style={{
              fontSize: `${layout.priceFontSizePt}pt`,
              fontWeight: 800,
              color: '#000',
            }}
          >
            {samplePrice.toLocaleString('ar-EG', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            ج.م
          </div>
        )}
      </div>
    </div>
  )
}

function SheetPreview({
  layout,
  scale,
  svgMarkup,
  showName,
  showPrice,
  showBarcodeText,
  sizeChip,
  sampleName,
  sampleBarcode,
  samplePrice,
}: {
  layout: LabelLayout
  scale: number
  svgMarkup: string
  showName: boolean
  showPrice: boolean
  showBarcodeText: boolean
  sizeChip: { bg: string; text: string; label: string } | null
  sampleName: string
  sampleBarcode: string
  samplePrice: number
}) {
  const MM = 3.78
  const g = layout.sheet!
  const totalCells = g.columns * g.rows
  // Fill the first few cells with the sample so the user sees how a real
  // label will look; leave the rest as empty placeholders to convey the
  // grid shape without cluttering the preview.
  const filledCells = Math.min(8, totalCells)

  return (
    <div
      className="relative"
      style={{
        width: `${A4.widthMm * MM * scale}px`,
        height: `${A4.heightMm * MM * scale}px`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          width: `${A4.widthMm * MM}px`,
          height: `${A4.heightMm * MM}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          padding: `${g.pageMarginMm * MM}px`,
          display: 'grid',
          gridTemplateColumns: `repeat(${g.columns}, ${layout.widthMm * MM}px)`,
          gridTemplateRows: `repeat(${g.rows}, ${layout.heightMm * MM}px)`,
          gap: `${g.gapYMm * MM}px ${g.gapXMm * MM}px`,
          justifyContent: 'start',
          alignContent: 'start',
          background: '#fff',
          border: '1px solid #d4d4d4',
          boxSizing: 'border-box',
        }}
      >
        {Array.from({ length: totalCells }).map((_, i) => (
          <div
            key={i}
            style={{
              width: `${layout.widthMm * MM}px`,
              height: `${layout.heightMm * MM}px`,
              border: '1px dashed #c8c8c8',
              borderRadius: '1mm',
              padding: `${layout.paddingMm * MM}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              boxSizing: 'border-box',
              overflow: 'hidden',
              background: '#fff',
              position: 'relative',
            }}
          >
            {i < filledCells ? (
              <>
                {sizeChip && (
                  <div
                    className={cn(
                      'flex items-center justify-center rounded text-[7px] font-extrabold',
                      sizeChip.bg,
                      sizeChip.text
                    )}
                    style={{
                      minWidth: '12px',
                      padding: '1px 3px',
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                    }}
                  >
                    {sizeChip.label}
                  </div>
                )}
                {showName && (
                  <div
                    style={{
                      fontSize: `${layout.nameFontSizePt - 1}pt`,
                      fontWeight: 700,
                      lineHeight: 1.1,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}
                  >
                    {sampleName}
                  </div>
                )}
                {svgMarkup ? (
                  <div
                    style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                ) : (
                  <div
                    style={{
                      width: '80%',
                      height: `${layout.barcodeHeightPx * 0.6}px`,
                      background:
                        'repeating-linear-gradient(90deg, #000 0, #000 1px, transparent 1px, transparent 2px)',
                      opacity: 0.3,
                    }}
                  />
                )}
                {showBarcodeText && (
                  <div
                    dir="ltr"
                    style={{
                      fontFamily: 'Consolas, "Courier New", monospace',
                      fontSize: `${layout.barcodeTextFontSizePt - 1}pt`,
                      fontWeight: 700,
                      color: '#000',
                    }}
                  >
                    {sampleBarcode}
                  </div>
                )}
                {showPrice && (
                  <div
                    style={{
                      fontSize: `${layout.priceFontSizePt - 1}pt`,
                      fontWeight: 800,
                      color: '#000',
                    }}
                  >
                    {samplePrice.toLocaleString('ar-EG', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    ج.م
                  </div>
                )}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
