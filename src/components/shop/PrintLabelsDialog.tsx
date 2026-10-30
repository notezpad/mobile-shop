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
  ChevronDown,
  Eye,
  Info,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  Shirt,
  SlidersHorizontal,
  Tag,
  Type,
  Usb,
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
import { api } from '@/lib/api'
import { Swatch } from '@/lib/color-swatch'
import { groupByColor } from '@/lib/variant-sort'
import { printBarcodeLabels, renderBarcodeSvg, measureBarcodeModuleMm, MIN_SCANNABLE_MODULE_MM } from '@/lib/print-client'
import { printBarcodeLabelsDirect } from '@/lib/label-printer'
import { isWebUsbSupported, usbErrorMessage } from '@/lib/thermal-printer'
import { computeLabelLayout, A4, LABEL_LH, LABEL_GAP_MM, fmtLabelPrice, type LabelLayout } from '@/lib/print'
import { normalizeBarcode, isRenderableBarcode, barcodeFormatFor } from '@/lib/barcode'
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
  /** باقة فيها المتغيرات (لون/مقاس): لو true بنجيب متغيرات كل منتج ونطبع ملصق لكل لون/مقاس بباركود المتغير. الافتراضي false = السلوك القديم. */
  variantsEnabled?: boolean
  /** باقة الجملة (multi_unit): لو true بنجيب وحدات كل منتج ونطبع ملصق لباركود الكرتونة/الدستة (الوحدات اللي ليها باركود). */
  unitsEnabled?: boolean
}

interface VariantData {
  id: number
  size: string | null
  color: string | null
  barcode: string | null
  quantity: number
}

interface UnitData {
  id: number
  name: string
  price: number | null
  barcode: string | null
  factor: number
  active: boolean
}

/** صف طباعة واحد = ملصق واحد (منتج عادي، أو لون/مقاس من منتج له متغيرات). */
interface LabelRow {
  /** 'p<id>' للمنتج العادي، 'v<id>' للمتغير */
  key: string
  productId: number
  /** الاسم اللي بيتطبع: «المنتج — لون / مقاس» للمتغير */
  name: string
  barcode: string | null
  price: number
  size?: string | null
  color?: string | null
  /** null = منتج عادي */
  variantLabel: string | null
  /** الكمية الافتراضية: ١ للمنتج العادي، ٠ للمتغير (عشان متطبعش ١٥٠ ملصق بالغلط) */
  defaultQty: number
  /** وحدة جملة (كرتونة/دستة...) بباركودها الخاص — كمية افتراضية ٠ زي المتغيرات */
  isUnit?: boolean
  /** عدد القطع في الوحدة (للوحدات فقط) */
  factor?: number
}

const variantLabelOf = (v: Pick<VariantData, 'id' | 'color' | 'size'>) =>
  [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`

interface Entry {
  product: LabelProduct
  /** null = منتج من غير متغيرات */
  groups: { color: string; total: number; rows: LabelRow[]; noBarcode: LabelRow[] }[] | null
  /** وحدات الجملة اللي ليها باركود (فاضية لو الباقة مفيهاش وحدات) */
  units: LabelRow[]
  rows: LabelRow[]
}

/* ───────────────────────── ثوابت ───────────────────────── */

type Mode = 'sheet' | 'roll'
type PresetKey = '40x30' | '50x30' | '30x20' | 'custom'
/** 🖨️ طريقة إرسال الطباعة: نافذة المتصفح، أو USB مباشر بلغة TSPL/ZPL. */
type PrintLang = 'browser' | 'tspl' | 'zpl'

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
  /** 👕 طباعة سطر المقاس/اللون */
  variant: boolean
  /** 🖨️ طريقة الإرسال: نافذة المتصفح أو USB مباشر */
  lang: PrintLang
  /** 🎚️ حجم اسم المنتج ٪ من التلقائي (60–150) */
  namePct: number
  /** 🎚️ حجم السعر ٪ من التلقائي (60–150) */
  pricePct: number
  /** 🎚️ طول خطوط الباركود ٪ من أقصى ارتفاع متاح (50–100) */
  barcodePct: number
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

export function PrintLabelsDialog({ open, onOpenChange, products, variantsEnabled = false, unitsEnabled = false }: Props) {
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [focusKey, setFocusKey] = React.useState<string | null>(null)
  const [openColors, setOpenColors] = React.useState<Record<string, boolean>>({})
  const [variantsMap, setVariantsMap] = React.useState<Record<number, VariantData[]>>({})
  const [vState, setVState] = React.useState<{ loading: boolean; failed: number[] }>({ loading: false, failed: [] })
  const [unitsMap, setUnitsMap] = React.useState<Record<number, UnitData[]>>({})
  const [uState, setUState] = React.useState<{ loading: boolean; failed: number[] }>({ loading: false, failed: [] })
  // مفتاح ثابت للمنتجات المختارة — `products` نفسه بيتعمل array جديد في كل رندر من الأب
  const productIdsKey = products.map((p) => p.id).join(',')
  const [mode, setMode] = React.useState<Mode>('sheet')
  const [preset, setPreset] = React.useState<PresetKey>('40x30')
  const [cw, setCw] = React.useState(40)
  const [ch, setCh] = React.useState(30)
  const [showName, setShowName] = React.useState(true)
  const [showPrice, setShowPrice] = React.useState(true)
  const [showText, setShowText] = React.useState(true)
  // 👕 سطر المقاس/اللون للملابس (بيظهر بس لللي ليهم مقاس/لون فعلاً)
  const [showVariant, setShowVariant] = React.useState(true)
  // 🖨️ نافذة المتصفح (افتراضي) أو USB مباشر TSPL/ZPL للطابعات الحرارية
  const [printLang, setPrintLang] = React.useState<PrintLang>('browser')
  const usbSupported = typeof window !== 'undefined' && isWebUsbSupported()
  // 🎚️ أحجام العناصر (٪ من التلقائي) — بيتحفظوا مع باقي الإعدادات
  const [namePct, setNamePct] = React.useState(100)
  const [pricePct, setPricePct] = React.useState(100)
  const [barcodePct, setBarcodePct] = React.useState(100)
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
    setQty({})
    setFocusKey(null)
    setOpenColors({})
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
        if (typeof p.variant === 'boolean') setShowVariant(p.variant)
        if (p.lang === 'browser' || p.lang === 'tspl' || p.lang === 'zpl') setPrintLang(p.lang)
        if (typeof p.namePct === 'number') setNamePct(clampInt(p.namePct, 60, 150) || 100)
        if (typeof p.pricePct === 'number') setPricePct(clampInt(p.pricePct, 60, 150) || 100)
        if (typeof p.barcodePct === 'number') setBarcodePct(clampInt(p.barcodePct, 50, 100) || 100)
      }
    } catch {
      /* التخزين غير متاح — عادي */
    }
    hydrated.current = true
     
  }, [open, productIdsKey])

  // ⚡ جلب متغيرات المنتجات المختارة في طلب واحد (variants-index?ids=…) —
  // كان قبل كده طلب لكل منتج (100 منتج = 100 طلب). نفس شكل الاستجابة،
  // ولو فشل بنعلّم كل المنتجات فاشلة فيظهر تنبيه القايمة.
  React.useEffect(() => {
    if (!open || !variantsEnabled || !productIdsKey) {
      setVariantsMap({})
      setVState({ loading: false, failed: [] })
      return
    }
    let cancelled = false
    const ids = productIdsKey.split(',').map(Number)
    setVariantsMap({})
    setVState({ loading: true, failed: [] })
    ;(async () => {
      try {
        const d = await api<{ data?: any[] }>(`/api/products/variants-index?ids=${ids.join(',')}&limit=2000`)
        if (cancelled) return
        const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []
        const out: Record<number, VariantData[]> = {}
        const idSet = new Set(ids)
        for (const v of rows) {
          const pid = Number(v.productId)
          // لو الرد جاي من كاش أوفلاين لفهرس كامل (من غير ids) بنفلتره هنا
          if (!idSet.has(pid)) continue
          ;(out[pid] ??= []).push({
            id: v.id,
            size: v.size ?? null,
            color: v.color ?? null,
            barcode: v.barcode ?? null,
            quantity: v.quantity ?? 0,
          })
        }
        setVariantsMap(out)
        setVState({ loading: false, failed: [] })
      } catch {
        if (cancelled) return
        setVariantsMap({})
        setVState({ loading: false, failed: ids })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, variantsEnabled, productIdsKey])

  // ⚡ جلب وحدات الجملة في طلب واحد (units-index?ids=…) — نفس أسلوب جلب المتغيرات
  React.useEffect(() => {
    if (!open || !unitsEnabled || !productIdsKey) {
      setUnitsMap({})
      setUState({ loading: false, failed: [] })
      return
    }
    let cancelled = false
    const ids = productIdsKey.split(',').map(Number)
    setUnitsMap({})
    setUState({ loading: true, failed: [] })
    ;(async () => {
      try {
        const d = await api<{ data?: any[] }>(`/api/products/units-index?ids=${ids.join(',')}&limit=5000`)
        if (cancelled) return
        const rows = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []
        const out: Record<number, UnitData[]> = {}
        const idSet = new Set(ids)
        for (const u of rows) {
          const pid = Number(u.productId)
          if (!idSet.has(pid)) continue
          ;(out[pid] ??= []).push({
            id: u.id,
            name: String(u.name ?? ''),
            price: typeof u.price === 'number' ? u.price : u.price != null ? Number(u.price) : null,
            barcode: u.barcode ?? null,
            factor: Number(u.factor) || 1,
            active: u.active !== false,
          })
        }
        setUnitsMap(out)
        setUState({ loading: false, failed: [] })
      } catch {
        if (cancelled) return
        setUnitsMap({})
        setUState({ loading: false, failed: ids })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, unitsEnabled, productIdsKey])

  React.useEffect(() => {
    if (!open || !hydrated.current) return
    try {
      const p: Prefs = { mode, preset, cw, ch, name: showName, price: showPrice, text: showText, variant: showVariant, lang: printLang, namePct, pricePct, barcodePct }
      localStorage.setItem(PREFS_KEY, JSON.stringify(p))
    } catch {
      /* ignore */
    }
  }, [open, mode, preset, cw, ch, showName, showPrice, showText, showVariant, printLang, namePct, pricePct, barcodePct])

  // كل منتج → إمّا صف واحد (منتج عادي)، أو صف لكل لون/مقاس (منتج له متغيرات، مجمّعة بالألوان)
  // صفوف وحدات الجملة (كرتونة/دستة...) — اللي ليها باركود بس. السعر = سعر الوحدة المسجّل، أو سعر القطعة × عدد القطع
  const unitRowsOf = (p: LabelProduct): LabelRow[] =>
    (unitsMap[p.id] ?? [])
      .filter((u) => u.active && !!u.barcode)
      .map<LabelRow>((u) => ({
        key: `u${u.id}`,
        productId: p.id,
        name: `${p.name} — ${u.name}`,
        barcode: normalizeBarcode(u.barcode),
        price: u.price ?? Math.round(p.price * u.factor * 100) / 100,
        variantLabel: null,
        defaultQty: 0,
        isUnit: true,
        factor: u.factor,
      }))

  const entries: Entry[] = products.map((p) => {
    const units = unitRowsOf(p)
    const vs = variantsMap[p.id]
    if (vs && vs.length > 0) {
      const groups = groupByColor(vs).map((g) => {
        const rows = g.items.map<LabelRow>((v) => ({
          key: `v${v.id}`,
          productId: p.id,
          name: `${p.name} — ${variantLabelOf(v)}`,
          barcode: normalizeBarcode(v.barcode),
          price: p.price,
          size: v.size,
          color: v.color,
          variantLabel: variantLabelOf(v),
          defaultQty: 0,
        }))
        return { color: g.color, total: g.total, rows: rows.filter((r) => r.barcode), noBarcode: rows.filter((r) => !r.barcode) }
      })
      return { product: p, groups, units, rows: [...groups.flatMap((g) => [...g.rows, ...g.noBarcode]), ...units] }
    }
    return {
      product: p,
      groups: null,
      units,
      rows: [
        {
          key: `p${p.id}`,
          productId: p.id,
          name: p.name,
          barcode: normalizeBarcode(p.barcode),
          price: p.price,
          size: p.size,
          color: p.color,
          variantLabel: null,
          defaultQty: 1,
        },
        ...units,
      ],
    }
  })
  const allRows = entries.flatMap((e) => e.rows)
  const withBarcode = allRows.filter((r) => r.barcode)
  const withoutBarcode = allRows.filter((r) => !r.barcode)
  const hasVariantRows = allRows.some((r) => r.variantLabel)
  const hasUnitRows = allRows.some((r) => r.isUnit)
  // 👕 سطر المقاس/اللون بيتفعّل فعلياً بس لو في بيانات مقاس/لون — عشان المحلات
  // اللي ملهاش متغيرات ما تاخدش حجز ارتفاع لسطر عمره ما هيظهر
  const anyVariantData = allRows.some((r) => (!!r.size && !!r.size.trim()) || (!!r.color && !!r.color.trim()))
  const effectiveShowVariant = showVariant && anyVariantData
  const qtyOf = (r: LabelRow) => qty[r.key] ?? r.defaultQty
  const total = withBarcode.reduce((s, r) => s + qtyOf(r), 0)

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
    showVariant: effectiveShowVariant,
    nameScale: namePct / 100,
    priceScale: pricePct / 100,
    barcodeScale: barcodePct / 100,
  })

  const perSheet = layout.sheet?.perSheet ?? 0
  const sheets = mode === 'sheet' && perSheet > 0 ? Math.ceil(total / perSheet) : 0
  const emptySlots = sheets * perSheet - total

  const focus =
    withBarcode.find((r) => r.key === focusKey) ?? withBarcode.find((r) => qtyOf(r) > 0) ?? withBarcode[0] ?? null

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
     
  }, [mode, preset, labelSize.widthMm, labelSize.heightMm, layout.sheet])

  // تغيير التبويب يرجّع التمرير لفوق
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const sheetWarn = !!hint && mode === 'sheet'

  // 🛡️ تحذير «خطوط ضيقة» (30×20 غير EAN-13): كود مورد/UPC من 12 رقم/نص بيترسم
  // CODE128 بوفير وحدات كتير — على مقاس صغير عرض الوحدة بيتقصّ لنقطة طابعة واحدة
  // (0.125مم) فالخطوط مش هتتقري غالباً. EAN-13 على نفس المقاس بيطلع 0.25مم وسليم.
  // القياس هنا بنفس حساب الطباعة بالظبط (measureBarcodeModuleMm = نقاط 203dpi).
  const availMm = layout.widthMm - layout.paddingMm * 2
  const widthCodesKey = withBarcode.map((r) => r.barcode).join('|')
  const narrowByCode = React.useMemo(() => {
    const m = new Map<string, number>()
    if (typeof window === 'undefined') return m
    for (const c of new Set(widthCodesKey.split('|').filter(Boolean))) {
      const mm = measureBarcodeModuleMm(c, availMm)
      if (mm != null && mm < MIN_SCANNABLE_MODULE_MM - 1e-9) m.set(c, mm)
    }
    return m
  }, [widthCodesKey, availMm])
  const narrowRows =
    narrowByCode.size > 0 ? withBarcode.filter((r) => r.barcode && narrowByCode.has(r.barcode)) : []
  const narrowWarn = narrowRows.length > 0

  const setQ = (key: string, v: number) => setQty((p) => ({ ...p, [key]: clampInt(v, 0, MAX_QTY) }))
  /** نفس الكمية لمجموعة صفوف (لون كامل / منتج كامل) — 0 = إلغاء الاختيار */
  const setMany = (rows: LabelRow[], v: number) =>
    setQty((p) => {
      const next = { ...p }
      for (const r of rows) next[r.key] = clampInt(v, 0, MAX_QTY)
      return next
    })
  // «الكمية للكل»: المنتجات العادية كلها، أمّا المتغيرات فاللي مختار منها بس (عشان مانطبعش ١٥٠ × ٢٠ بالغلط)
  const setAll = (v: number) =>
    setQty((prev) => {
      const next = { ...prev }
      for (const r of allRows) {
        if (r.variantLabel || r.isUnit) {
          if ((prev[r.key] ?? r.defaultQty) > 0) next[r.key] = clampInt(v, 0, MAX_QTY)
        } else next[r.key] = clampInt(v, 0, MAX_QTY)
      }
      return next
    })

  const handlePrint = async () => {
    const items = withBarcode.filter((r) => qtyOf(r) > 0)
    if (items.length === 0) {
      toast.error(
        withBarcode.length === 0
          ? 'مفيش منتجات ليها باركود'
          : hasVariantRows || hasUnitRows
            ? `اختار ${hasVariantRows ? 'لون/مقاس' : ''}${hasVariantRows && hasUnitRows ? ' أو ' : ''}${hasUnitRows ? 'وحدة' : ''} واحد على الأقل`
            : 'حدّد كمية لمنتج واحد على الأقل'
      )
      return
    }
    // أي باركود مش هيترسم (حروف غير ASCII مثلاً) كان بيطلع ملصق أرقام من غير خطوط بصمت —
    // دلوقتي بنستبعده ونقول للمستخدم أسماء الأصناف.
    const unrenderable = items.filter(
      (r) =>
        !isRenderableBarcode(r.barcode) ||
        !renderBarcodeSvg(r.barcode as string, { height: 20, fontSize: 8, displayValue: false }),
    )
    const printable = items.filter((r) => !unrenderable.includes(r))
    if (unrenderable.length > 0) {
      const names = unrenderable.slice(0, 3).map((r) => r.name).join('، ')
      const more = unrenderable.length > 3 ? ` و${unrenderable.length - 3} آخرين` : ''
      toast.error(
        `باركود غير صالح للطباعة (فيه حروف مش مدعومة): ${names}${more}. عدّل الباركود من شاشة المنتج.`,
      )
      if (printable.length === 0) return
    }
    // ⚠️ باركود ضيّق (نقطة طابعة واحدة على المقاس ده): تنبيه بس — مش منع.
    // المستخدم ممكن يعرف إن سكاونره بيقرا الخطوط الرفيعة ويكمّل عادي.
    if (narrowWarn) {
      const names = narrowRows.slice(0, 3).map((r) => r.name).join('، ')
      const more = narrowRows.length > 3 ? ` و${narrowRows.length - 3} آخرين` : ''
      toast.warning(
        `خطوط باركود ${narrowRows.length} صنف هتطلع نقطة طابعة واحدة (0.125مم) على المقاس ده وممكن مي تتقري: ${names}${more}`,
      )
    }
    // 👕 المقاس واللون بيروحوا مع الملصق (بيتطبعوا بس لللي ليهم قيمة فعلاً)
    const printItems = printable.map((r) => ({
      name: r.name,
      barcode: r.barcode as string,
      price: r.price,
      quantity: qtyOf(r),
      size: r.size,
      color: r.color,
    }))
    const printOpts = {
      showName,
      showPrice,
      showBarcodeText: showText,
      showVariant: effectiveShowVariant,
      mode,
      labelSize,
      nameScale: namePct / 100,
      priceScale: pricePct / 100,
      barcodeScale: barcodePct / 100,
    }

    // 🖨️ الطباعة المباشرة: رول + USB مدعوم + المستخدم مختار TSPL/ZPL —
    // الملصق بيتبعت للطابعة كصورة أحادية بدقة النقاط (مطابق للمعاينة) من غير نافذة طباعة.
    const directReady = printLang !== 'browser' && mode === 'roll' && usbSupported
    if (directReady) {
      try {
        const res = await printBarcodeLabelsDirect(printItems, printOpts, printLang)
        if (res.ok) {
          toast.success(`اتطبعت ${num(res.labels ?? 0)} ${labelsWord(res.labels ?? 0)} مباشرة على الطابعة`)
          onOpenChange(false)
          return
        }
        if (res.error === 'cancelled') {
          // المستخدم قفل نافذة الإذن — ما نفتحش نافذة طباعة من وراه، نخليه يختار
          toast.info('تم إلغاء اختيار الطابعة — اضغط «طباعة» تاني واختارها من القايمة')
          return
        }
        toast.warning(usbErrorMessage(res.error), {
          description: 'فشلت الطباعة المباشرة — فتحنا نافذة الطباعة بدلاً منها عشان الملصقات متضيعش.',
        })
      } catch {
        toast.warning('فشلت الطباعة المباشرة على الطابعة — فتحنا نافذة الطباعة بدلاً منها.')
      }
    } else if (printLang !== 'browser' && mode === 'sheet') {
      toast.info('الطباعة المباشرة شغالة مع وضع «رول لاصق» بس — الملصقات دي هتتطبع بنافذة المتصفح.')
    }

    // 🛡️ الطباعة بتنطلق جوه iframe مخفي في نفس الصفحة (من غير نافذة منبثقة) —
    // لو المستخدم كنسل معاينة الطباعة يلاقي الدايلوج قدامه زي ما هو باختياراته
    // وكمياته وبيقدر يضغط «طباعة» تاني فوراً. بنسيب الدايلوج مفتوح عمداً —
    // المستخدم يقفله بنفسه بـ X أو «إلغاء» لما يخلص. (قبل كده كنا بنقفله
    // تلقائي فالكميات كانت بتضيّع لو كنسل الطباعة وعايز يطبع تاني.)
    const ok = printBarcodeLabels(printItems, printOpts)
    if (!ok) {
      toast.error('الطباعة ماقدرتش تنطلق — جرّب تحدّث الصفحة وتاني.')
    }
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
      showVariant={effectiveShowVariant}
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
                  dot={sheetWarn || narrowWarn}
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
                        {showVariant && <SumChip icon={Shirt}>المقاس واللون</SumChip>}
                        {showText && <SumChip icon={BarcodeIcon}>رقم الباركود</SumChip>}
                        {showPrice && <SumChip icon={Tag}>السعر</SumChip>}
                        {printLang !== 'browser' && <SumChip icon={Usb}>USB {printLang.toUpperCase()}</SumChip>}
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

            {vState.failed.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200"
              >
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <b>مقدرناش نجيب متغيرات {vState.failed.length} منتج</b> (النت أو السيرفر): لو ليهم ألوان/مقاسات هيتطبع
                  باركود المنتج الأساسي بس. اقفل الدايلوج وافتحه تاني للمحاولة.
                </span>
              </div>
            )}

            {uState.failed.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200"
              >
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <b>مقدرناش نجيب وحدات الجملة لـ {uState.failed.length} منتج</b> (النت أو السيرفر) — مش هيظهر ملصق لباركود الكرتونة/الدستة
                  بتاعهم. اقفل الدايلوج وافتحه تاني للمحاولة.
                </span>
              </div>
            )}

            {narrowWarn && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200"
              >
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span title={narrowRows.map((r) => r.name).join('، ')}>
                  <b>خطوط باركود {narrowRows.length} {hasVariantRows ? 'صنف' : 'منتج'} هتطلع أرفع من نقطة طابعة</b> على
                  المقاس ده (0.125مم — غالباً مش هتتقري بالسكانر):{' '}
                  {narrowRows.slice(0, 3).map((r) => r.name).join('، ')}
                  {narrowRows.length > 3 ? ` و${narrowRows.length - 3} آخرين` : ''}. كبّر المقاس أو استخدم باركود
                  EAN-13 للمقاسات الصغيرة.
                </span>
              </div>
            )}

            {withoutBarcode.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200"
              >
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span title={withoutBarcode.map((r) => r.name).join('، ')}>
                  <b>{withoutBarcode.length} {hasVariantRows ? 'صنف' : 'منتج'} من غير باركود</b> مش هيتطبع ليهم ملصق:{' '}
                  {withoutBarcode.slice(0, 3).map((r) => r.name).join('، ')}
                  {withoutBarcode.length > 3 ? ` و${withoutBarcode.length - 3} آخرين` : ''}. افتح المنتج وولّد باركود الأول.
                </span>
              </div>
            )}

            {/* المنتجات والكميات */}
            <section>
              <Title
                aside={
                  <span className="text-xs font-semibold tabular-nums text-foreground/65">
                    {entries.filter((e) => e.rows.some((r) => r.barcode)).length}{' '}
                    {ar(entries.filter((e) => e.rows.some((r) => r.barcode)).length, 'منتج', 'منتجين', 'منتجات', 'منتج')} · {num(total)} {labelsWord(total)}
                  </span>
                }
              >
                المنتجات والكميات
              </Title>

              {vState.loading || uState.loading ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-sm font-bold text-foreground/70">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  بنجيب الألوان والمقاسات والوحدات…
                </div>
              ) : withBarcode.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center">
                  <BarcodeIcon className="mx-auto size-6 text-foreground/40" aria-hidden />
                  <p className="mt-2 text-sm font-bold">مفيش منتجات ليها باركود</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground/65">ولّد باركود للمنتجات الأول وارجع.</p>
                </div>
              ) : (
                <>
                  {withBarcode.length > 1 && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground/65">
                        {hasVariantRows || hasUnitRows ? 'نفس الكمية للمختار:' : 'الكمية للكل:'}
                      </span>
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
                    {entries.flatMap((e) => {
                      const nodes: React.ReactNode[] = []
                      if (e.groups) {
                        nodes.push(
                          <VariantProductCard
                            key={e.product.id}
                            entry={e}
                            qtyOf={qtyOf}
                            setQ={setQ}
                            setMany={setMany}
                            focusKey={focus?.key ?? null}
                            onFocus={setFocusKey}
                            openColors={openColors}
                            onToggleColor={(k, def) => setOpenColors((o) => ({ ...o, [k]: !(o[k] ?? def) }))}
                          />,
                        )
                      } else if (e.rows[0].barcode) {
                        nodes.push(
                          <PlainRow
                            key={e.rows[0].key}
                            r={e.rows[0]}
                            q={qtyOf(e.rows[0])}
                            isFocus={focus?.key === e.rows[0].key}
                            showPrice={showPrice}
                            onFocus={() => setFocusKey(e.rows[0].key)}
                            onQty={(v) => setQ(e.rows[0].key, v)}
                          />,
                        )
                      }
                      if (e.units.length > 0) {
                        nodes.push(
                          <UnitsBlock
                            key={`units-${e.product.id}`}
                            productName={e.product.name}
                            rows={e.units}
                            qtyOf={qtyOf}
                            setQ={setQ}
                            setMany={setMany}
                            focusKey={focus?.key ?? null}
                            onFocus={setFocusKey}
                            showPrice={showPrice}
                          />,
                        )
                      }
                      return nodes
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

              {narrowWarn && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <b>المقاس ده مش بيحتمل {narrowRows.length} {hasVariantRows ? 'صنف' : 'منتج'} بباركود مش EAN-13</b> —
                    عرض الخط هيبقى نقطة طابعة واحدة (0.125مم) فغالباً مش هيتقري:{' '}
                    {narrowRows.slice(0, 3).map((r) => r.name).join('، ')}
                    {narrowRows.length > 3 ? ` و${narrowRows.length - 3} آخرين` : ''}. كبّر المقاس (زي 40×30) أو استخدم
                    باركود EAN-13.
                  </span>
                </p>
              )}
            </section>

            {/* 3) المحتوى */}
            <section>
              <Title n={3}>اللي يظهر على الملصق</Title>
              <div className="grid grid-cols-2 gap-2.5">
                <ToggleRow icon={Type} label="اسم المنتج" on={showName} onChange={setShowName} />
                <ToggleRow icon={BarcodeIcon} label="رقم الباركود" on={showText} onChange={setShowText} />
                <ToggleRow icon={Tag} label="السعر" on={showPrice} onChange={setShowPrice} />
                <ToggleRow icon={Shirt} label="المقاس واللون" on={showVariant} onChange={setShowVariant} />
              </div>
              <p className="mt-2.5 text-xs font-medium leading-relaxed text-foreground/65">
                أي عنصر بتقفله بيدّي مساحة أكبر للباركود، فيتقري أسهل. سطر «المقاس واللون» بيظهر بس للمنتجات
                اللي ليها مقاس/لون فعلاً.
              </p>
            </section>

            {/* 4) الأحجام 🎚️ — تحكّم المستخدم في حجم الاسم/السعر وطول خطوط الباركود */}
            <section>
              <Title
                n={4}
                aside={
                  namePct !== 100 || pricePct !== 100 || barcodePct !== 100 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNamePct(100)
                        setPricePct(100)
                        setBarcodePct(100)
                      }}
                      className={cn('rounded-lg px-2 py-1 text-xs font-extrabold text-primary transition-colors hover:bg-primary/10', ring)}
                    >
                      رجّع التلقائي
                    </button>
                  ) : undefined
                }
              >
                أحجام العناصر
              </Title>
              <div className="grid gap-3 sm:grid-cols-3">
                <Dim
                  label="اسم المنتج (٪)"
                  value={namePct}
                  step={10}
                  onChange={(v) => setNamePct(clampInt(v, 60, 150))}
                />
                <Dim
                  label="السعر (٪)"
                  value={pricePct}
                  step={10}
                  onChange={(v) => setPricePct(clampInt(v, 60, 150))}
                />
                <Dim
                  label="طول خطوط الباركود (٪)"
                  value={barcodePct}
                  step={10}
                  onChange={(v) => setBarcodePct(clampInt(v, 50, 100))}
                />
              </div>
              <p className="mt-2.5 text-xs font-medium leading-relaxed text-foreground/65">
                <bdi dir="ltr">100٪</bdi> هو الحجم التلقائي المناسب للمقاس. كبّر الاسم أو السعر لو مش واضحين، وقلّل
                طول خطوط الباركود لو عايزها أقصر — والمعاينة بتحدّث فوراً. لو كبّرت الخط أكتر من اللي الملصق بيحتمل،
                بنصغّره تلقائياً عشان الباركود يفضل مقروء.
              </p>
            </section>

            {/* 5) الطباعة المباشرة 🖨️ — TSPL/ZPL على USB بدل نافذة الطباعة */}
            <section>
              <Title n={5}>الطباعة المباشرة للرول (USB)</Title>
              <div role="radiogroup" aria-label="طريقة إرسال الطباعة" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([
                  { key: 'browser' as PrintLang, title: 'نافذة المتصفح', sub: 'الطريقة العادية — أي طابعة معرّفة على الجهاز' },
                  { key: 'tspl' as PrintLang, title: 'USB مباشر TSPL', sub: 'TSC / Xprinter وأغلب الطابعات الصيني' },
                  { key: 'zpl' as PrintLang, title: 'USB مباشر ZPL', sub: 'Zebra والمتوافقة معاها' },
                ]).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={printLang === o.key}
                    onClick={() => setPrintLang(o.key)}
                    disabled={o.key !== 'browser' && !usbSupported}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-2xl border bg-card p-3 text-start transition-colors disabled:opacity-50',
                      ring,
                      printLang === o.key ? 'border-primary bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-muted/60'
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-extrabold leading-tight">
                      {o.key !== 'browser' && <Usb className="size-3.5 shrink-0" aria-hidden />}
                      {o.title}
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-foreground/60">{o.sub}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-xs font-medium leading-relaxed text-foreground/65">
                في «USB مباشر» الملصق بيتبعت للطابعة كصورة بدقة النقاط (مطابق للمعاينة، والعربي سليم) من غير ما
                تفتح نافذة طباعة — بيشتغل مع وضع «رول لاصق» على Chrome/Edge، وأول مرة هيطلب إذن الطابعة.
              </p>
              {printLang !== 'browser' && !usbSupported && (
                <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  المتصفح الحالي مبيدعمش USB المباشر — الطباعة هتترجع لنافذة المتصفح. استخدم Chrome أو Edge على الكمبيوتر.
                </p>
              )}
              {printLang !== 'browser' && mode === 'sheet' && usbSupported && (
                <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  الطباعة المباشرة بتشتغل مع وضع «رول لاصق» بس — في وضع ورقة A4 هتتطبع بنافذة المتصفح.
                </p>
              )}
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
            <Button onClick={handlePrint} disabled={total === 0 || vState.loading || uState.loading} className="h-11 rounded-xl px-6 font-bold">
              <Printer className="size-4" />
              طباعة {total > 0 ? `${num(total)} ${labelsWord(total)}` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────────────────── صفوف القايمة ───────────────────────── */

function PlainRow({
  r, q, isFocus, showPrice, onFocus, onQty,
}: {
  r: LabelRow
  q: number
  isFocus: boolean
  showPrice: boolean
  onFocus: () => void
  onQty: (v: number) => void
}) {
  const chip = sizeChip(r.size)
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-2xl border bg-card p-2.5 transition-colors',
        isFocus && 'border-primary ring-1 ring-primary/40',
        q === 0 && 'opacity-60'
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        aria-pressed={isFocus}
        title="اعرضه في المعاينة"
        className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-start', ring)}
      >
        {chip ? (
          <span
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold', chip.bg, chip.text)}
            title={r.size ?? undefined}
          >
            {chip.label.length > 4 ? chip.label.slice(0, 4) : chip.label}
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/50">
            <BarcodeIcon className="size-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold leading-snug">{r.name}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-foreground/60">
            <bdi dir="ltr" className="font-mono tabular-nums">{r.barcode}</bdi>
            {showPrice && <span className="tabular-nums">{fmtPrice(r.price)} ج.م</span>}
            {r.color && <span className="rounded-md bg-muted px-1.5 py-0.5">{r.color}</span>}
            {r.isUnit && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums">
                وحدة جملة{r.factor ? <> · <bdi dir="ltr">×{r.factor}</bdi> قطعة</> : null}
              </span>
            )}
            {q === 0 && <span className="font-bold text-foreground/70">مستبعد</span>}
          </span>
        </span>
      </button>
      <Qty value={q} onChange={onQty} label={`كمية ${r.name}`} />
    </li>
  )
}

const QTY_PRESETS = [1, 2, 5, 10]

/** أزرار «اختار الكل / إلغاء» + «نفس الكمية للكل» لمجموعة صفوف (لون أو منتج كامل). */
function BulkBar({
  rows, qtyOf, setMany, label,
}: {
  rows: LabelRow[]
  qtyOf: (r: LabelRow) => number
  setMany: (rows: LabelRow[], v: number) => void
  label: string
}) {
  const selected = rows.filter((r) => qtyOf(r) > 0).length
  const allOn = rows.length > 0 && selected === rows.length
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setMany(rows, allOn ? 0 : 1)}
        className={cn(
          'h-8 rounded-full border px-3 text-xs font-extrabold transition-colors',
          ring,
          allOn ? 'border-primary bg-primary/10 text-foreground' : 'bg-background text-foreground/80 hover:bg-muted'
        )}
      >
        {allOn ? `إلغاء ${label}` : `اختار ${label}`}
      </button>
      <span className="ms-1 text-[11px] font-bold text-foreground/60">نفس الكمية:</span>
      {QTY_PRESETS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setMany(rows, n)}
          className={cn(
            'h-8 min-w-9 rounded-full border bg-background px-2.5 text-xs font-bold tabular-nums text-foreground/80 transition-colors hover:bg-muted',
            ring
          )}
        >
          <bdi dir="ltr">×{n}</bdi>
        </button>
      ))}
    </div>
  )
}

/** وحدات الجملة (كرتونة/دستة...) لمنتج واحد — كل وحدة ليها باركودها وكميتها، والكمية الافتراضية ٠. */
function UnitsBlock({
  productName, rows, qtyOf, setQ, setMany, focusKey, onFocus, showPrice,
}: {
  productName: string
  rows: LabelRow[]
  qtyOf: (r: LabelRow) => number
  setQ: (key: string, v: number) => void
  setMany: (rows: LabelRow[], v: number) => void
  focusKey: string | null
  onFocus: (key: string) => void
  showPrice: boolean
}) {
  const picked = rows.filter((r) => qtyOf(r) > 0).length
  const labels = rows.reduce((n, r) => n + qtyOf(r), 0)
  return (
    <li className="overflow-hidden rounded-2xl border bg-card">
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/60">
            <Package className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold leading-snug">وحدات الجملة — {productName}</p>
            <p className="mt-0.5 text-[11px] font-medium tabular-nums text-foreground/60">
              {rows.length} {ar(rows.length, 'وحدة', 'وحدتين', 'وحدات', 'وحدة')} بباركود
              {picked > 0 ? ` · ${picked} مختار (${num(labels)} ${labelsWord(labels)})` : ''}
            </p>
          </div>
        </div>
        {rows.length > 1 && <BulkBar rows={rows} qtyOf={qtyOf} setMany={setMany} label="كل الوحدات" />}
      </div>
      <ul className="space-y-1.5 border-t bg-muted/20 p-2.5">
        {rows.map((r) => (
          <PlainRow
            key={r.key}
            r={r}
            q={qtyOf(r)}
            isFocus={focusKey === r.key}
            showPrice={showPrice}
            onFocus={() => onFocus(r.key)}
            onQty={(v) => setQ(r.key, v)}
          />
        ))}
      </ul>
    </li>
  )
}

/** منتج له متغيرات: أقسام ألوان قابلة للطي، جواها مقاسات اللون (مرتبة)، وكل مقاس ليه كميته. */
function VariantProductCard({
  entry, qtyOf, setQ, setMany, focusKey, onFocus, openColors, onToggleColor,
}: {
  entry: Entry
  qtyOf: (r: LabelRow) => number
  setQ: (key: string, v: number) => void
  setMany: (rows: LabelRow[], v: number) => void
  focusKey: string | null
  onFocus: (key: string) => void
  openColors: Record<string, boolean>
  onToggleColor: (key: string, defaultOpen: boolean) => void
}) {
  const groups = entry.groups ?? []
  const printable = groups.flatMap((g) => g.rows)
  const labels = printable.reduce((n, r) => n + qtyOf(r), 0)
  const picked = printable.filter((r) => qtyOf(r) > 0).length

  return (
    <li className="overflow-hidden rounded-2xl border bg-card">
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/60">
            <Shirt className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold leading-snug">{entry.product.name}</p>
            <p className="mt-0.5 text-[11px] font-medium tabular-nums text-foreground/60">
              {groups.length} {ar(groups.length, 'لون', 'لونين', 'ألوان', 'لون')} · {printable.length} متغير بباركود
              {picked > 0 ? ` · ${picked} مختار (${num(labels)} ${labelsWord(labels)})` : ''}
            </p>
          </div>
        </div>
        {printable.length > 1 && (
          <BulkBar rows={printable} qtyOf={qtyOf} setMany={setMany} label="كل المتغيرات" />
        )}
      </div>

      <ul className="divide-y border-t">
        {groups.map((g) => {
          const k = `${entry.product.id}:${g.color}`
          const defOpen = groups.length === 1
          const isOpen = openColors[k] ?? defOpen
          const sel = g.rows.filter((r) => qtyOf(r) > 0).length
          const cnt = g.rows.reduce((n, r) => n + qtyOf(r), 0)
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => onToggleColor(k, defOpen)}
                aria-expanded={isOpen}
                className={cn('flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-muted/50', ring)}
              >
                {g.color ? <Swatch name={g.color} className="size-4" /> : <span className="size-4 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold leading-tight">{g.color || 'بدون لون'}</span>
                  <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-foreground/60">
                    {g.rows.length} {g.rows.length === 1 && !g.rows[0].size ? 'صنف' : 'مقاس'}
                    {g.noBarcode.length > 0 ? ` · ${g.noBarcode.length} من غير باركود` : ''}
                  </span>
                </span>
                {sel > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold tabular-nums leading-none text-primary-foreground">
                    {sel} · {num(cnt)}
                  </span>
                )}
                <ChevronDown className={cn('size-4 shrink-0 text-foreground/50 transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>

              {isOpen && (
                <div className="space-y-2.5 bg-muted/20 px-3 pb-3 pt-2.5">
                  {g.rows.length === 0 ? (
                    <p className="text-xs font-medium text-foreground/60">مفيش مقاسات ليها باركود في اللون ده.</p>
                  ) : (
                    <>
                      {g.rows.length > 1 && (
                        <BulkBar rows={g.rows} qtyOf={qtyOf} setMany={setMany} label="كل المقاسات" />
                      )}
                      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {g.rows.map((r) => {
                          const q = qtyOf(r)
                          const chip = sizeChip(r.size)
                          const isFocus = focusKey === r.key
                          return (
                            <li
                              key={r.key}
                              className={cn(
                                'flex min-w-0 items-center gap-2 rounded-xl border bg-card p-1.5 transition-colors',
                                isFocus && 'border-primary ring-1 ring-primary/40',
                                q === 0 && 'opacity-70'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => onFocus(r.key)}
                                aria-pressed={isFocus}
                                title="اعرضه في المعاينة"
                                className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-lg p-0.5 text-start', ring)}
                              >
                                <span
                                  className={cn(
                                    'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold',
                                    chip ? chip.bg : 'bg-muted',
                                    chip ? chip.text : 'text-foreground/50'
                                  )}
                                  title={r.size ?? undefined}
                                >
                                  {chip ? (chip.label.length > 4 ? chip.label.slice(0, 4) : chip.label) : <BarcodeIcon className="size-4" aria-hidden />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-extrabold leading-tight">{r.size || 'بدون مقاس'}</span>
                                  <bdi dir="ltr" className="block truncate font-mono text-[10px] font-medium tabular-nums text-foreground/55">
                                    {r.barcode}
                                  </bdi>
                                </span>
                              </button>
                              <Qty value={q} onChange={(v) => setQ(r.key, v)} label={`كمية ${r.name}`} />
                            </li>
                          )
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </li>
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

function Dim({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  /** مقدار تغيير أزرار +/− — 1 للمقاسات بالمم، 10 للنسب المئوية */
  step?: number
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold">{label}</p>
      <div className="flex items-center gap-1.5" dir="ltr">
        <button
          type="button"
          onClick={() => onChange(value - step)}
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
          onClick={() => onChange(value + step)}
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
  mode, view, onView, layout, products, qtyOf, focus, showName, showPrice, showText, showVariant, sheets,
}: {
  mode: Mode
  view: 'sheet' | 'label'
  onView: (v: 'sheet' | 'label') => void
  layout: LabelLayout
  products: LabelRow[]
  qtyOf: (r: LabelRow) => number
  focus: LabelRow | null
  showName: boolean
  showPrice: boolean
  showText: boolean
  showVariant: boolean
  sheets: number
}) {
  const showSheet = mode === 'sheet' && view === 'sheet' && !!layout.sheet

  const sample: Sample = focus
    ? { name: focus.name, barcode: focus.barcode as string, price: focus.price, size: focus.size, color: focus.color }
    : { name: 'منتج تجريبي', barcode: '2000000000017', price: 25 }

  // 🛡️ 2026-10-19: باركود كل منتج بيتولّد مرة واحدة لكل مقاس (نفس طريقة print-client) —
  // اتغير من كاش كسول جوه closure بيتعدّل أثناء الرندر إلى useMemo واحد مبني مسبقاً
  // (قاعدة react-hooks/immutability). نفس النتيجة: نفس SVG بنفس إعدادات المقاس.
  const codes = React.useMemo(
    () => [...new Set([sample.barcode, ...products.map((p) => p.barcode)].filter((c): c is string => !!c))],
    [sample.barcode, products],
  )
  const codesKey = codes.join('|')
  const svgByCode = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const code of codes) {
      m.set(
        code,
        typeof window === 'undefined'
          ? ''
          : renderBarcodeSvg(code, {
              height: layout.barcodeHeightPx,
              availMm: layout.widthMm - layout.paddingMm * 2,
              fontSize: layout.barcodeTextFontSizePt,
              displayValue: false,
            }),
      )
    }
    return m
     
  }, [codesKey, layout.barcodeHeightPx, layout.widthMm, layout.paddingMm, layout.barcodeTextFontSizePt])
  const svgFor = (code: string) => svgByCode.get(code) ?? ''

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
            showVariant={showVariant}
          />
        ) : (
          <LabelStage
            layout={layout}
            sample={sample}
            svg={svgFor(sample.barcode)}
            stack={focus ? qtyOf(focus) > 1 : false}
            showName={showName}
            showPrice={showPrice}
            showText={showText}
            showVariant={showVariant}
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
  size?: string | null
  color?: string | null
}

interface FaceProps {
  layout: LabelLayout
  showName: boolean
  showPrice: boolean
  showText: boolean
  showVariant: boolean
}

/** الملصق بمقاسه الطبيعي (px) — نفس تنسيق الطباعة. دايماً جوّه حاوية dir=ltr */
function LabelFace({
  layout, showName, showPrice, showText, showVariant, sample, svg, dashed,
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
            lineHeight: LABEL_LH.name,
            flexShrink: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: layout.nameMaxLines,
            textOverflow: 'ellipsis',
            textAlign: 'center',
            margin: `0 0 ${LABEL_GAP_MM.name}mm 0`,
            wordBreak: 'break-word',
          }}
        >
          {sample.name}
        </div>
      )}
      {/* 👕 سطر المقاس/اللون — نفس تنسيق .lbl-variant في الطباعة بالظبط */}
      {showVariant && (sample.size || sample.color) && (
        <div
          dir="rtl"
          style={{
            fontFamily: "Tahoma, Cairo, sans-serif",
            fontSize: `${layout.variantFontSizePt}pt`,
            fontWeight: 700,
            lineHeight: LABEL_LH.variant,
            flexShrink: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            margin: `0 0 ${LABEL_GAP_MM.variant}mm 0`,
          }}
        >
          {[sample.size, sample.color].filter((x) => !!x && String(x).trim()).join(' · ')}
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
            lineHeight: LABEL_LH.text,
            flexShrink: 0,
            marginTop: `${LABEL_GAP_MM.text}mm`,
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
            lineHeight: LABEL_LH.price,
            flexShrink: 0,
            marginTop: `${LABEL_GAP_MM.price}mm`,
          }}
        >
          {fmtLabelPrice(sample.price)} ج.م
        </div>
      )}
    </div>
  )
}

/** ملصق واحد مكبّر (رول، أو «الملصق» في وضع الورقة) */
function LabelStage({
  layout, sample, svg, stack, showName, showPrice, showText, showVariant,
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
            <LabelFace layout={layout} showName={showName} showPrice={showPrice} showText={showText} showVariant={showVariant} sample={sample} svg={svg} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** ورقة A4 كاملة: الخانات بتتملي بالترتيب الفعلي (منتج × كميته) لأول ورقة */
function SheetStage({
  layout, products, qtyOf, svgFor, showName, showPrice, showText, showVariant,
}: FaceProps & { products: LabelRow[]; qtyOf: (r: LabelRow) => number; svgFor: (code: string) => string }) {
  const g = layout.sheet!
  const cells = g.columns * g.rows

  const filled = React.useMemo(() => {
    const out: Sample[] = []
    for (const p of products) {
      const n = qtyOf(p)
      for (let i = 0; i < n && out.length < cells; i++) {
        out.push({ name: p.name, barcode: p.barcode as string, price: p.price, size: p.size, color: p.color })
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
                showVariant={showVariant}
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