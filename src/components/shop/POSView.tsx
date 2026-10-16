'use client'

import * as React from 'react'
import { useVocab, foodTerm } from '@/lib/vocab'
import { commonUnit, formatQtyUnit, unitOf, unitWord } from '@/lib/unit-label'
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  LayoutGrid,
  List,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShoppingBag,
  Trash2,
  User,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { arEG } from 'react-day-picker/locale'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { printSale } from '@/lib/print-client'
import { printThermalReceipt, getStoredPrinterSettings } from '@/lib/thermal-printer'
import { ProductDialog } from './ProductDialog'
import { POSVariantPickerDialog } from './POSVariantPickerDialog'

/* ────────────────────────────────────────────────────────────────
   Types (unchanged business model)
   ──────────────────────────────────────────────────────────────── */

interface ProductLite {
  id: number
  name: string
  barcode: string | null
  price: number
  quantity: number
  category?: string | null
  imagePath?: string | null
  matchedVariantId?: number | null
  matchedVariantLabel?: string | null
  dynamicRetailPrice?: number | null
  // 🥬 2026-10-12: منتج بيع بالوزن — الكمية بالكيلو وتقبل كسور (1.65)
  soldByWeight?: boolean
  // 🥬 2026-10-12: وحدة المنتج (علبة/كيس/برطمان...) — null = قطعة
  unitLabel?: string | null
}

function piecePrice(product: ProductLite): number {
  return product.dynamicRetailPrice ?? product.price
}

interface CustomerLite {
  id: number
  name: string
  phone: string | null
  balance: number
}

interface PosUnit {
  id: number
  name: string
  price: number | null
  factor: number
}

interface PosVariant {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

function variantLabelOf(v: PosVariant): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
}

interface CartItem {
  cartKey: string
  product: ProductLite
  price: number
  quantity: number
  maxQuantity: number
  unitId: number | null
  unitLabel: string | null
  unitFactor: number
  availableUnits: PosUnit[]
  variantId: number | null
  variantLabel: string | null
  availableVariants: PosVariant[]
}

interface CategoryLite {
  id: number | string
  name: string
}

const LOW_STOCK_THRESHOLD = 5

function readLS<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function writeLS(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota — ignore */
  }
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/* ── Barcode-scanner support ───────────────────────────────────
   A USB/Bluetooth scanner in "keyboard mode" types the code and then sends
   Enter (or Tab). What tells it apart from a human: the gap between
   characters is a few ms, a person types at 100ms+. We watch the whole page
   (not just the search box) so a scan is never lost or mis-routed when focus
   happens to sit on a button, and the terminating Enter can't "click" it. */
const SCAN_MAX_GAP_MS = 60 // raise to ~120 for very slow scanners
const SCAN_MIN_LENGTH = 4

function createScanDetector(maxGap = SCAN_MAX_GAP_MS, minLen = SCAN_MIN_LENGTH) {
  let buf = ''
  let last = 0
  return {
    char(c: string, now: number) {
      if (now - last > maxGap) buf = ''
      buf += c
      last = now
    },
    /** Enter/Tab pressed: returns the scanned code, or null if it was a human. */
    end(now: number): string | null {
      const ok = buf.length >= minLen && now - last <= maxGap + 20
      const code = buf
      buf = ''
      return ok ? code : null
    },
    reset() {
      buf = ''
    },
  }
}

/** Arabic keyboard layout active? e.key would be an Arabic letter — recover the physical key. */
function charFromKeyEvent(e: KeyboardEvent): string {
  if (/^[\x21-\x7e]$/.test(e.key)) return e.key
  const m = /^Key([A-Z])$/.exec(e.code)
  if (m) return e.shiftKey ? m[1] : m[1].toLowerCase()
  const d = /^Digit(\d)$/.exec(e.code)
  if (d) return d[1]
  return e.key
}

function normalizeCode(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u202a-\u202e\u0000-\u001f]/g, '')
    .trim()
}

let audioCtx: AudioContext | null = null
function beep(kind: 'ok' | 'err') {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    audioCtx = audioCtx ?? new AC()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.type = 'square'
    o.frequency.value = kind === 'ok' ? 1500 : 280
    g.gain.value = 0.05
    o.connect(g)
    g.connect(audioCtx.destination)
    o.start()
    o.stop(audioCtx.currentTime + (kind === 'ok' ? 0.07 : 0.25))
  } catch {
    /* audio blocked — visual feedback still works */
  }
}

/* ── Draft persistence ─────────────────────────────────────────
   The invoice in progress survives leaving the POS page (the view unmounts,
   so plain React state is lost) and a browser refresh. It is stored per
   tenant + user, and dropped after 12h so a forgotten cart from yesterday
   never sneaks into today's sale. */
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000

interface PosDraft {
  cart: CartItem[]
  customerName: string
  selectedCustomerId: number | null
  paidFull: boolean
  paidAmount: number
}

function draftKeyFor(user: { tenantId: string; userId: string } | null | undefined) {
  return user ? `pos:draft:v1:${user.tenantId}:${user.userId}` : null
}

function loadDraft(): PosDraft | null {
  try {
    const key = draftKeyFor(useShopStore.getState().user)
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || d.v !== 1 || Date.now() - Number(d.updatedAt) > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    const cart: CartItem[] = (Array.isArray(d.cart) ? d.cart : [])
      .filter(
        (i: any) =>
          i &&
          typeof i.cartKey === 'string' &&
          typeof i.product?.id === 'number' &&
          Number.isFinite(i.price) &&
          Number.isFinite(i.quantity) &&
          i.quantity > 0
      )
      .map((i: any) => ({
        ...i,
        availableUnits: Array.isArray(i.availableUnits) ? i.availableUnits : [],
        availableVariants: Array.isArray(i.availableVariants) ? i.availableVariants : [],
        unitFactor: i.unitFactor || 1,
      }))
    if (cart.length === 0 && !String(d.customerName ?? '').trim()) return null
    return {
      cart,
      customerName: String(d.customerName ?? ''),
      selectedCustomerId: typeof d.selectedCustomerId === 'number' ? d.selectedCustomerId : null,
      paidFull: d.paidFull !== false,
      paidAmount: Number.isFinite(d.paidAmount) ? d.paidAmount : 0,
    }
  } catch {
    return null
  }
}

// Tailwind v4 derives every spacing / size utility from --spacing and every
// font size from --text-*. Overriding them on the POS root shrinks (or grows)
// the whole screen proportionally without transforms, so scrolling, focus and
// hit-testing keep working. Text shrinks slower than spacing to stay legible.
function densityVars(f: number): React.CSSProperties {
  const tf = 0.74 + 0.26 * f // النص بيصغر ببطء: أقل مقاس مريح للقراءة على الكاشير
  const r = (n: number) => `${(n * tf).toFixed(4)}rem`
  return {
    '--spacing': `${(0.25 * f).toFixed(4)}rem`,
    '--text-xs': r(0.75),
    '--text-sm': r(0.875),
    '--text-base': r(1),
    '--text-lg': r(1.125),
    '--text-xl': r(1.25),
    '--text-2xl': r(1.5),
    '--text-3xl': r(1.875),
    '--fs-2xs': r(0.75),
  } as React.CSSProperties
}

/* ────────────────────────────────────────────────────────────────
   Small presentational helpers
   ──────────────────────────────────────────────────────────────── */

/** لون ثابت لكل منتج (أخضر/تركواز/أزرق/كهرماني/ترابي) — من غير بنفسجي ولا وردي. */
const TINT_HUES = [152, 168, 186, 204, 28, 42, 12]
function tintFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 3600
  const hue = TINT_HUES[h % TINT_HUES.length]
  return {
    backgroundColor: `hsl(${hue} 55% 84%)`,
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 60% 92%), hsl(${hue} 50% 78%))`,
    color: `hsl(${hue} 60% 22%)`,
  }
}

/** درجة لون ثابتة لكل اسم منتج (نفس منطق tintFor) — بتتستخدم للغلاف والشريط الجانبي */
function hueOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 3600
  return TINT_HUES[h % TINT_HUES.length]
}

/** خلفية هادية (ضوء ناعم + دوائر رفيعة) فريدة لكل منتج — بيتولّد من اسمه، فنفس المنتج دايمًا ليه نفس الشكل */
function artRand(name: string) {
  let h = 2166136261
  for (const ch of name) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildArt(name: string) {
  const rnd = artRand(name)
  const hue = hueOf(name)
  const hue2 = (hue + 24 + Math.floor(rnd() * 24)) % 360
  // ضوءين ناعمين في أماكن مختلفة لكل منتج + خطوط دوائر رفيعة جدًا في ركن
  const x1 = 10 + Math.floor(rnd() * 35)
  const y1 = 5 + Math.floor(rnd() * 40)
  const x2 = 55 + Math.floor(rnd() * 40)
  const y2 = 50 + Math.floor(rnd() * 45)
  const corner = Math.floor(rnd() * 4)
  const cx = corner % 2 === 0 ? 0 : 160
  const cy = corner < 2 ? 0 : 100
  const bg =
    `radial-gradient(circle at ${x1}% ${y1}%, hsl(${hue} 70% 60% / .26), transparent 58%), ` +
    `radial-gradient(circle at ${x2}% ${y2}%, hsl(${hue2} 70% 62% / .20), transparent 55%), ` +
    `linear-gradient(160deg, hsl(${hue} 50% 60% / .08), hsl(${hue2} 50% 60% / .04))`
  const stroke = `hsl(${hue} 45% 45% / .16)`
  const shapes = [34, 56, 80].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={1} />)
  return { bg, hue, shapes }
}

function ProductThumb({
  name,
  imagePath,
  className,
}: {
  name: string
  imagePath?: string | null
  className?: string
}) {
  const [failed, setFailed] = React.useState(false)
  const showImg = !!imagePath && !failed
  const art = React.useMemo(() => (showImg ? null : buildArt(name)), [showImg, name])
  if (showImg) {
    return (
      <div className={cn('shrink-0 overflow-hidden rounded-xl bg-muted', className)}>
        <img
          src={imagePath}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }
  const { bg, hue, shapes } = art!
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-xl', className)}
      style={{ backgroundImage: bg, boxShadow: `inset 0 0 0 1px hsl(${hue} 50% 50% / .16)` }}
      aria-hidden
    >
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        {shapes}
      </svg>
    </div>
  )
}

function StockBadge({ quantity, weight, unit }: { quantity: number; weight?: boolean; unit?: string | null }) {
  // 🥬 2026-10-12: منتجات البيع بالوزن — الكمية بالكيلو بتتعرض نظيفة
  // (45.5 بدل 45.500000001) مع وحدة الكيلو.
  const fmt = (n: number) =>
    weight ? `${Math.round(n * 100) / 100} كجم` : unit ? formatQtyUnit(n, unit) : String(n)
  if (quantity <= 0)
    return (
      <span className="whitespace-nowrap rounded-full bg-danger-subtle px-2 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-medium text-danger-subtle-foreground">
        نفد
      </span>
    )
  if (quantity <= LOW_STOCK_THRESHOLD)
    return (
      <span className="whitespace-nowrap rounded-full bg-warning-subtle px-2 py-0.5 text-[length:var(--fs-2xs,0.75rem)] font-medium text-warning-subtle-foreground">
        باقي {fmt(quantity)}
      </span>
    )
  return (
    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[length:var(--fs-2xs,0.75rem)] font-medium text-muted-foreground tabular-nums">
      متاح {fmt(quantity)}
    </span>
  )
}

/** شارة مخزون بنقطة حالة ملوّنة — للكروت اللي من غير صور */
function StockChip({
  quantity,
  weight,
  unit,
  className,
}: {
  quantity: number
  weight?: boolean
  unit?: string | null
  className?: string
}) {
  const fmt = (n: number) =>
    weight ? `${Math.round(n * 100) / 100} كجم` : unit ? formatQtyUnit(n, unit) : String(n)
  const state =
    quantity <= 0
      ? { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', label: 'نفد' }
      : quantity <= LOW_STOCK_THRESHOLD
        ? { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', label: `باقي ${fmt(quantity)}` }
        : { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', label: `متاح ${fmt(quantity)}` }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--fs-2xs,0.75rem)] font-bold tabular-nums',
        state.text,
        className
      )}
    >
      <span className={cn('size-1.5 rounded-full', state.dot)} />
      {state.label}
    </span>
  )
}

/** أقصى كمية مسموحة للسطر = المخزون الفعلي ناقص اللي في الأسطر التانية لنفس المنتج/المقاس. */
function lineCap(i: CartItem, list: CartItem[]): number {
  const factor = i.unitFactor || 1
  const base =
    i.variantId != null
      ? i.availableVariants.find((v) => v.id === i.variantId)?.quantity ?? i.maxQuantity
      : i.product.quantity
  const others = list.reduce(
    (s, o) =>
      o.cartKey !== i.cartKey && o.product.id === i.product.id && o.variantId === i.variantId
        ? s + o.quantity
        : s,
    0
  )
  const free = Math.max(0, base - others)
  const byStock = factor > 1 ? Math.floor(free / factor) * factor : free
  return Math.min(i.maxQuantity, byStock)
}

/**
 * حقل رقمي بيحتفظ بنص الكتابة: تقدر تمسح الخانة وتكتب من جديد، وتكتب 12.5 من
 * غير ما النقطة تضيع (الحقل القديم كان بيحوّل «12.» لـ 12 فورًا).
 */
function NumField({
  value,
  onChange,
  integer,
  allowEmpty,
  className,
  ariaLabel,
  placeholder,
  id,
}: {
  value: number | ''
  onChange: (n: number | '') => void
  integer?: boolean
  allowEmpty?: boolean
  className?: string
  ariaLabel?: string
  placeholder?: string
  id?: string
}) {
  const [text, setText] = React.useState(String(value))
  const focused = React.useRef(false)
  React.useEffect(() => {
    if (focused.current && (text === '' || text.endsWith('.'))) return
    const same = value === '' ? text === '' : parseFloat(text) === value
    if (!same) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      dir="ltr"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        setText(String(value))
      }}
      onChange={(e) => {
        const t = e.target.value
          .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
          .replace(/[٫,]/g, '.')
        if (!(integer ? /^\d*$/ : /^\d*\.?\d*$/).test(t)) return
        setText(t)
        if (t === '') {
          if (allowEmpty) onChange('')
          return
        }
        const n = parseFloat(t)
        if (Number.isFinite(n)) onChange(n)
      }}
      className={className}
    />
  )
}

/** عنوان اللوحة: رقم الخطوة (١ اختر ← ٢ راجع ← ٣ ادفع) — هوية صفحة نقطة البيع. */
function PanelHead({
  n,
  tag,
  title,
  aside,
}: {
  n: number
  tag: string
  title: string
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-extrabold tabular-nums text-background">
          {n}
        </span>
        <div className="leading-tight">
          <p
            dir="ltr"
            className="text-right text-[length:var(--fs-2xs,0.6875rem)] font-bold uppercase tracking-[0.18em] text-muted-foreground"
          >
            {tag}
          </p>
          <h2 className="text-base font-extrabold">{title}</h2>
        </div>
      </div>
      {aside}
    </div>
  )
}

/* ─── تاريخ استحقاق الآجل: اختصارات سريعة + تقويم منبثق (بدل input type=date اللي كان بيكسر العرض) ─── */
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromISODate = (v: string) => new Date(`${v}T12:00:00`)
const inDays = (n: number) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}
function DueDatePicker({
  value,
  onChange,
  compact = false,
}: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const presets = [
    { label: 'أسبوع', iso: toISODate(inDays(7)) },
    { label: '10 أيام', iso: toISODate(inDays(10)) },
    { label: '15 يوم', iso: toISODate(inDays(15)) },
    { label: '20 يوم', iso: toISODate(inDays(20)) },
    { label: '30 يوم', iso: toISODate(inDays(30)) },
  ]
  const selected = value ? fromISODate(value) : null
  const isPreset = presets.some((x) => x.iso === value)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const diff = selected ? Math.floor((selected.getTime() - startOfToday.getTime()) / 86_400_000) : 0
  const rel = diff <= 0 ? 'النهارده' : diff === 1 ? 'بكرة' : `بعد ${diff} يوم`
  const chip = (on: boolean) =>
    cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-1 text-sm font-semibold transition-colors',
      compact ? 'py-1' : 'py-1.5',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
      on
        ? 'border-brand-600 bg-brand-600/10 text-brand-800 dark:text-brand-200'
        : 'border-foreground/25 bg-card hover:border-foreground/50 hover:bg-muted'
    )

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <p className={cn('font-bold text-foreground/75', compact ? 'text-xs' : 'text-sm')}>
        استحقاق الآجل <span className="font-medium">(اختياري)</span>
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {presets.map((x) => {
          const on = value === x.iso
          return (
            <button
              key={x.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? '' : x.iso)}
              className={chip(on)}
            >
              {x.label}
            </button>
          )
        })}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(chip(!!value && !isPreset), 'w-full px-3', compact ? 'h-8' : 'h-9')}
              aria-label="اختيار تاريخ مخصص من التقويم"
            >
              <CalendarDays className="size-4" />
              تاريخ مخصص
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" collisionPadding={12} className="w-auto p-0">
            <Calendar
              mode="single"
              dir="rtl"
              locale={arEG}
              weekStartsOn={6}
              formatters={{
                // أسماء الأيام كاملة بتتداخل في خلية 32px — حرف واحد كفاية (ح ن ث ر خ ج س)
                formatWeekdayName: (d) => d.toLocaleDateString('ar-EG', { weekday: 'narrow' }),
              }}
              selected={selected ?? undefined}
              defaultMonth={selected ?? undefined}
              disabled={{ before: startOfToday }}
              onSelect={(d) => {
                if (d) {
                  onChange(toISODate(d))
                  setOpen(false)
                }
              }}
            />
          </PopoverContent>
        </Popover>
      {selected && (
        <div className={cn('flex items-center justify-between gap-2 rounded-xl bg-muted px-3 text-sm', compact ? 'py-1' : 'py-2')}>
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 leading-snug">
              <span className={cn('font-semibold', compact ? 'inline' : 'block')}>
                يستحق{' '}
                {selected.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <span className={cn('text-xs font-medium text-muted-foreground', compact ? 'ms-2 inline' : 'block')}>{rel}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="إزالة تاريخ الاستحقاق"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── زر الرجوع في الموبايل ────────────────────────────────────────────────
   كل شاشة منبثقة (السلة، الدفع، حوار المنتج…) بتاخد «طبقة» في history: زر الرجوع
   بيقفل الطبقة العلوية بدل ما يخرج من نقطة البيع للوحة التحكم. لما الطبقة تتقفل
   من الواجهة (زر ×، إتمام بيع…) بنشيل مدخلها من history عشان ما يتراكمش. */
const backStack: { onBack: () => void; popped: boolean }[] = []
let backIgnore = 0
let backListening = false
function ensureBackListener() {
  if (backListening || typeof window === 'undefined') return
  backListening = true
  window.addEventListener('popstate', () => {
    if (backIgnore > 0) {
      backIgnore--
      return
    }
    const top = backStack.pop()
    if (!top) return
    top.popped = true
    top.onBack()
  })
}
function useBackLayer(active: boolean, onBack: () => void) {
  const cb = React.useRef(onBack)
  cb.current = onBack
  React.useEffect(() => {
    if (!active) return
    ensureBackListener()
    const layer = { onBack: () => cb.current(), popped: false }
    backStack.push(layer)
    window.history.pushState({ ...(window.history.state ?? {}), posLayer: true }, '')
    return () => {
      const i = backStack.indexOf(layer)
      if (i >= 0) backStack.splice(i, 1)
      if (!layer.popped) {
        backIgnore++
        window.history.back()
      }
    }
  }, [active])
}

/** شريط تمرير نحيف وهادي (بدل الافتراضي الغليظ) — للقوائم اللي لازم تفضل بتتمرّر (السلة، لوحة الدفع) */
const slimScroll =
  '[scrollbar-width:thin] [scrollbar-color:oklch(0.57_0.18_162/0.35)_transparent] hover:[scrollbar-color:oklch(0.57_0.18_162/0.6)_transparent]'

const selectCls =
  'h-8 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors hover:border-border-strong focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20'

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  React.useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}

/* ────────────────────────────────────────────────────────────────
   Main view
   ──────────────────────────────────────────────────────────────── */

export function POSView() {
  const t = useVocab()
  const user = useShopStore((s) => s.user)
  const draftKey = draftKeyFor(user)
  // Read once, on mount — before any state below is created.
  const [restored] = React.useState<PosDraft | null>(() => loadDraft())

  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<string>('all')
  const [categories, setCategories] = React.useState<CategoryLite[]>([])
  const [products, setProducts] = React.useState<ProductLite[]>([])
  const [productsLoading, setProductsLoading] = React.useState(true)
  const [searchError, setSearchError] = React.useState(false)
  const [refreshTick, setRefreshTick] = React.useState(0)

  const [cart, setCart] = React.useState<CartItem[]>(() => restored?.cart ?? [])
  const [lastAddedKey, setLastAddedKey] = React.useState<string | null>(null)
  const [confirmClear, setConfirmClear] = React.useState(false)
  // نسخة متزامنة من السلة: عشان سكانين متتاليين سريعين مايضيّعوش زيادة (الحساب بيتم عليها مباشرة)
  const cartRef = React.useRef<CartItem[]>(cart)
  cartRef.current = cart
  const [lastSale, setLastSale] = React.useState<any | null>(null)

  const [customers, setCustomers] = React.useState<CustomerLite[]>([])
  const [custQuery, setCustQuery] = React.useState('')
  const [custOpen, setCustOpen] = React.useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<number | null>(
    () => restored?.selectedCustomerId ?? null
  )
  const [customerName, setCustomerName] = React.useState(() => restored?.customerName ?? '')
  const [paidFull, setPaidFull] = React.useState(() => restored?.paidFull ?? true)
  const [paidAmount, setPaidAmount] = React.useState(() => restored?.paidAmount ?? 0)
  // 🛡️ 2026-09-30 (C12): طريقة دفع مبلغ البيع — كاش/محفظة/انستاباي/فوري.
  // قبلها كل المبيعات كانت بتسجل في الخزنة بmethod=null.
  const [paymentMethod, setPaymentMethod] = React.useState('cash')
  // 🛡️ 2026-09-30 (M10): تاريخ استحقاق اختياري للفواتير الآجلة (للتقادم والتنبيهات).
  const [dueDate, setDueDate] = React.useState('')
  const [received, setReceived] = React.useState<number | ''>('')
  const [submitting, setSubmitting] = React.useState(false)
  const [customersVersion, setCustomersVersion] = React.useState(0)
  const [addingProduct, setAddingProduct] = React.useState(false)
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false)
  const [mobileStep, setMobileStep] = React.useState<'cart' | 'pay'>('cart')
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null)
  const openCartSheet = () => {
    setMobileStep('cart')
    setCartSheetOpen(true)
  }
  const closeCartSheet = () => {
    setCartSheetOpen(false)
    setMobileStep('cart')
  }
  // زر الرجوع: من الدفع ← للسلة، ومن السلة ← للمنتجات (مش للوحة التحكم)
  useBackLayer(cartSheetOpen, closeCartSheet)
  useBackLayer(cartSheetOpen && mobileStep === 'pay', () => setMobileStep('cart'))

  const [variantPickerOpen, setVariantPickerOpen] = React.useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = React.useState<ProductLite | null>(null)
  const [variantPickerVariants, setVariantPickerVariants] = React.useState<PosVariant[]>([])
  const [variantPickerUnits, setVariantPickerUnits] = React.useState<PosUnit[]>([])
  useBackLayer(variantPickerOpen, () => {
    setVariantPickerOpen(false)
    setVariantPickerProduct(null)
    setVariantPickerVariants([])
    setVariantPickerUnits([])
  })

  const searchRef = React.useRef<HTMLInputElement>(null)
  // Caches that keep repeated scans instant (all cleared after a sale).
  const detailsCache = React.useRef(
    new Map<number, { t: number; units: PosUnit[]; variants: PosVariant[] }>()
  )
  const barcodeCache = React.useRef(
    new Map<string, { t: number; product: ProductLite; variantId: number | null }>()
  )
  const gridCache = React.useRef(
    new Map<string, { t: number; tick: number; data: ProductLite[] }>()
  )
  const scanChain = React.useRef<Promise<unknown>>(Promise.resolve())
  const enqueueScanRef = React.useRef<(code: string) => void>(() => {})
  const [soundOn, setSoundOn] = React.useState<boolean>(() => readLS('pos:sound', true))
  React.useEffect(() => writeLS('pos:sound', soundOn), [soundOn])
  const playBeep = (k: 'ok' | 'err') => {
    if (soundOn) beep(k)
  }
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [viewPref, setViewPref] = React.useState<'auto' | 'cards' | 'compact'>(() =>
    readLS('pos:view', 'auto')
  )
  React.useEffect(() => writeLS('pos:view', viewPref), [viewPref])

  // Smart fit: pick a scale from the space we actually have (height AND the
  // width left after the sidebar), then let the cashier nudge it ± and remember.
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [fit, setFit] = React.useState(1)
  const [sizeStep, setSizeStep] = React.useState<number>(() => readLS('pos:sizeStep', 0))
  const [fullscreen, setFullscreen] = React.useState<boolean>(() => readLS('pos:fullscreen', false))
  const isFull = fullscreen && isDesktop
  const scale = isDesktop ? clamp(fit * (1 + 0.08 * sizeStep), 0.65, 1.3) : 1

  /* ── ترقيم ذكي للمنتجات بدل شريط التمرير ─────────────────────────────
     بنقيس المساحة المتاحة فعلاً (أعمدة × صفوف) ونعرض صفحة واحدة بالظبط تملا
     الشاشة. على الشاشات الكبيرة (xl) بس — الموبايل/التابلت بيفضلوا بالتمرير الطبيعي. */
  const isXl = useMediaQuery('(min-width: 1280px)')
  // لوحة الدفع بتتضغط تلقائياً *لو* محتواها مش داخل في ارتفاعها (بنقيس فعلياً، مش بنخمّن من حجم الشاشة)
  // 🛡️ 2026-10-16: الضغط بقى ثابت حسب ارتفاع الشاشة بس — كان بيتغيّر لما المحتوى يكبر
  // (مثلاً الضغط على «سداد جزئي») فكل اللوحة كانت بتنكمش فجأة. دلوقتي لو المحتوى زاد
  // اللوحة بتسكرول من جواها وزرار الدفع يفضل ثابت تحت.
  const shortScreen = useMediaQuery('(max-height: 700px)')
  const payBodyRef = React.useRef<HTMLDivElement>(null)
  const compact = isXl && shortScreen
  // 🛡️ 2026-10-16: «ملاءمة الارتفاع» — بدل ما نغيّر شكل اللوحة أو نخلّيها تسكرول:
  // لو محتوى الدفع (مثلاً بعد «سداد جزئي») أطول من المساحة، بنصغّره كله بنسبة واحدة
  // (حد أدنى 80%) من غير ما نبدّل ترتيب أي عنصر أو نخفي حاجة. القياس بيتعمل من
  // الحجم الطبيعي (100%) كل ما المحتوى أو حجم النافذة يتغيّر، فمفيش تذبذب.
  const payInnerRef = React.useRef<HTMLDivElement>(null)
  const [payFit, setPayFit] = React.useState(1)
  const [payNat, setPayNat] = React.useState(0)
  const [fitTick, setFitTick] = React.useState(0)
  const fitPending = React.useRef(true)
  const gridBoxRef = React.useRef<HTMLDivElement>(null)
  const gridRef = React.useRef<HTMLUListElement>(null)
  const [perPage, setPerPage] = React.useState(0) // 0 = لسه ماتقاسش
  const [page, setPage] = React.useState(0)
  const isSm = useMediaQuery('(min-width: 640px)')
  const simplePageSize = isSm ? 24 : 12 // الموبايل/التابلت: صفحات ثابتة (مفيش قياس للمساحة)
  const paged = isXl && !searchError && products.length > 0
  const simplePaged = !isXl && !searchError && products.length > simplePageSize
  const pageSize = paged ? perPage || 24 : simplePageSize
  const anyPaged = paged || simplePaged
  const pageCount = anyPaged ? Math.max(1, Math.ceil(products.length / pageSize)) : 1
  const safePage = Math.min(page, pageCount - 1)
  const visibleProducts = anyPaged
    ? products.slice(safePage * pageSize, safePage * pageSize + pageSize)
    : products
  const panelTopRef = React.useRef<HTMLElement>(null)
  const pageMounted = React.useRef(false)
  // تغيير الصفحة على الموبايل ← نرجع لأول المنتجات (مش نسيب المستخدم في آخر الصفحة)
  React.useEffect(() => {
    if (!pageMounted.current) {
      pageMounted.current = true
      return
    }
    if (simplePaged) panelTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage])
  const hasImages = products.some((x) => x.imagePath)
  const effMode: 'cards' | 'compact' =
    viewPref === 'auto' ? (hasImages ? 'cards' : 'compact') : viewPref

  React.useEffect(() => setPage(0), [query, category])

  React.useLayoutEffect(() => {
    const box = gridBoxRef.current
    const grid = gridRef.current
    if (!paged) {
      if (grid) {
        grid.style.gridAutoRows = ''
        grid.style.removeProperty('--cm')
      }
      return
    }
    if (!box || !grid) return
    const measure = () => {
      if (grid.children.length === 0) return
      const cs = getComputedStyle(box)
      const availH = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const gcs = getComputedStyle(grid)
      const gap = parseFloat(gcs.rowGap) || 10
      // بنجرّب عرض كارت 44 ← 38 ← 32 (وحدة spacing) ونختار أول عرض يدّي صفّين على الأقل:
      // على الشاشات القصيرة الكروت الكبيرة كانت بتطلّع 4 منتجات بس في الصفحة.
      const kids = () => Array.from(grid.children) as HTMLElement[]
      const widths = effMode === 'cards' ? [44, 38, 32] : [0]
      let cols = 1
      let rows = 1
      for (const cm of widths) {
        if (cm) grid.style.setProperty('--cm', String(cm))
        grid.style.gridAutoRows = '' // قياس الارتفاع الطبيعي (من غير تمدد) — مفيش دوران
        cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length)
        let naturalH = 0
        if (effMode === 'cards') {
          const first = kids()[0]
          const thumb = first.querySelector('[data-thumb]') as HTMLElement | null
          naturalH = thumb
            ? first.offsetHeight - thumb.offsetHeight + (thumb.offsetWidth * 10) / 16
            : first.offsetHeight
        } else {
          for (const k of kids()) naturalH = Math.max(naturalH, k.offsetHeight) // أطول كارت (أسماء طويلة)
        }
        if (naturalH <= 0 || availH <= 0) return
        rows = Math.max(1, Math.floor((availH + gap) / (naturalH + gap)))
        if (rows >= 2) break
      }
      setPerPage((prev) => (prev === cols * rows ? prev : cols * rows))
      // صفوف بارتفاع ثابت بتملا المساحة بالظبط: مفيش فراغ تحت ومفيش قصّ لآخر صف
      grid.style.gridAutoRows = `${Math.floor((availH - gap * (rows - 1)) / rows)}px`
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, effMode, scale, products, safePage])

  // PageUp / PageDown للتنقل بين الصفحات (لما مفيش حقل بيتكتب فيه)
  React.useEffect(() => {
    if (!paged) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'PageDown' && e.key !== 'PageUp') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      setPage((p) => Math.max(0, Math.min(pageCount - 1, p + (e.key === 'PageDown' ? 1 : -1))))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paged, pageCount])
  const swipe = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => writeLS('pos:sizeStep', sizeStep), [sizeStep])
  React.useEffect(() => writeLS('pos:fullscreen', fullscreen), [fullscreen])
  React.useEffect(() => {
    const el = rootRef.current
    const calc = () => {
      const h = window.innerHeight
      const w = isFull ? window.innerWidth : el?.clientWidth ?? window.innerWidth
      setFit(Math.round(clamp(Math.min(h / 950, w / 1300), 0.8, 1.1) * 100) / 100)
    }
    calc()
    window.addEventListener('resize', calc)
    const ro = el ? new ResizeObserver(calc) : null
    if (el && ro) ro.observe(el)
    return () => {
      window.removeEventListener('resize', calc)
      ro?.disconnect()
    }
  }, [isFull])

  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const [productDlgOpen, setProductDlgOpen] = React.useState(false)
  const [productInitial, setProductInitial] = React.useState<Record<string, any> | null>(null)
  useBackLayer(productDlgOpen, () => setProductDlgOpen(false))

  React.useEffect(() => {
    if (quickAdd.open) {
      setProductInitial(quickAdd.seed ? { name: quickAdd.seed, barcode: quickAdd.seed } : {})
      setProductDlgOpen(true)
      closeQuickAdd()
    }
  }, [quickAdd, closeQuickAdd])

  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const hasUnitsCap = capabilities.includes('multi_unit')
  const hasVariantsCap = capabilities.includes('variants')

  /* ── data loading ───────────────────────────────────────────── */

  React.useEffect(() => {
    let alive = true
    api<CustomerLite[]>('/api/customers')
      .then((d) => alive && setCustomers(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [customersVersion])

  React.useEffect(() => {
    let alive = true
    api<CategoryLite[]>('/api/categories')
      .then((d) => alive && setCategories(Array.isArray(d) ? d : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // The grid is always populated: latest products by default, filtered by the
  // search box and the selected category. `search=` is always present in the
  // URL so the offline layer keeps serving it from IndexedDB.
  React.useEffect(() => {
    const q = query.trim()
    const cacheKey = `${q}|${category}`
    const hit = gridCache.current.get(cacheKey)
    if (hit && hit.tick === refreshTick && Date.now() - hit.t < 20_000) {
      // Same view seen a moment ago (e.g. right after a scan cleared the box):
      // no request, no spinner.
      setProducts(hit.data)
      setSearchError(false)
      setProductsLoading(false)
      return
    }
    setProductsLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const url =
        `/api/products?search=${encodeURIComponent(q)}&limit=100&pos=1` +
        (category !== 'all' ? `&category=${encodeURIComponent(category)}` : '')
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await api<{ data: ProductLite[] } | ProductLite[]>(url)
          if (cancelled) return
          const data = Array.isArray(res) ? res : (res as any)?.data ?? []
          setProducts(data)
          setSearchError(false)
          setProductsLoading(false)
          if (gridCache.current.size > 30) gridCache.current.clear()
          gridCache.current.set(cacheKey, { t: Date.now(), tick: refreshTick, data })
          return
        } catch {
          if (cancelled) return
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!cancelled) {
        setProducts([])
        setSearchError(true)
        setProductsLoading(false)
      }
    }, q ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, category, refreshTick])

  const resolvedCustomer = React.useMemo(() => {
    if (selectedCustomerId) return customers.find((x) => x.id === selectedCustomerId) ?? null
    const t = customerName.trim()
    return t ? customers.find((x) => x.name.trim() === t) ?? null : null
  }, [selectedCustomerId, customerName, customers])
  const typedUnknownCustomer = !resolvedCustomer && !!customerName.trim()

  const selectedCustomerBalance = React.useMemo(() => {
    if (selectedCustomerId) {
      const c = customers.find((x) => x.id === selectedCustomerId)
      if (c) return c.balance
    }
    const trimmed = customerName.trim()
    if (trimmed) {
      const c = customers.find((x) => x.name.trim() === trimmed)
      if (c) return c.balance
    }
    return null
  }, [selectedCustomerId, customerName, customers])

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const totalPieces = cart.reduce((s, i) => s + i.quantity, 0)
  // 🥬 لو كل الأصناف ليها نفس الوحدة (كلها علب مثلاً) نعرضها في الإجمالي، غير كده «قطعة»
  const cartUnit = commonUnit(cart.map((i) => (i.unitId ? null : i.product.unitLabel)))
  const effectivePaid = paidFull ? total : paidAmount
  const remaining = Math.max(0, total - effectivePaid)
  const creditNeedsCustomer = !paidFull && remaining > 0 && !resolvedCustomer
  const change = paidFull && typeof received === 'number' && received > total ? received - total : 0
  const canCheckout = cart.length > 0 && !submitting && !creditNeedsCustomer
  const shortBy =
    paidFull && typeof received === 'number' && received > 0 && received < total - 0.005
      ? total - received
      : 0

  /* ── cart operations (logic unchanged) ──────────────────────── */

  const flashLine = (key: string) => {
    // الصنف اللي اتضاف/اتزوّد يظهر في السلة حتى لو القائمة طويلة
    window.setTimeout(() => document.getElementById(`cart-line-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60)
    setLastAddedKey(key)
    window.setTimeout(() => setLastAddedKey((k) => (k === key ? null : k)), 900)
  }

  const addToCartDirect = (
    product: ProductLite,
    unitId: number | null,
    unitLabel: string | null,
    maxQuantity: number,
    availableUnits: PosUnit[],
    variantId: number | null = null,
    variantLabel: string | null = null,
    availableVariants: PosVariant[] = []
  ) => {
    const cartKey = `${product.id}-${unitId ?? 'x'}-${variantId ?? 'x'}`
    const unit = unitId ? availableUnits.find((u) => u.id === unitId) : null
    const factor = unit?.factor ?? 1
    const perPiecePrice = unit
      ? unit.price != null
        ? unit.price / factor
        : product.price
      : piecePrice(product)
    const startQty = factor

    const cur = cartRef.current
    const existing = cur.find((i) => i.cartKey === cartKey)
    let next: CartItem[]
    if (existing) {
      const cap = lineCap(existing, cur)
      const q = Math.min(existing.quantity + factor, cap)
      if (q <= existing.quantity) {
        toast.warning(`وصلت لآخر كمية متاحة من ${product.name}`)
        flashLine(cartKey)
        return
      }
      next = cur.map((i) => (i.cartKey === cartKey ? { ...i, quantity: q } : i))
    } else {
      if (maxQuantity <= 0) {
        toast.error(
          variantLabel
            ? `الكمية غير متوفرة لهذا اللون/المقاس (${variantLabel})`
            : 'الكمية غير متوفرة لهذا المنتج'
        )
        return
      }
      // نفس المنتج/المقاس ممكن يكون في سطر تاني بوحدة مختلفة: المخزون واحد.
      const others = cur.reduce(
        (s, o) =>
          o.product.id === product.id && o.variantId === variantId ? s + o.quantity : s,
        0
      )
      const free = Math.max(0, maxQuantity - others)
      const lineMax = factor > 1 ? Math.floor(free / factor) * factor : free
      if (lineMax < factor) {
        toast.warning(`باقي ${free} بس من ${product.name} وكلها في السلة بوحدة تانية`)
        return
      }
      next = [
        ...cur,
        {
          cartKey,
          product,
          price: perPiecePrice,
          quantity: Math.min(startQty, lineMax),
          maxQuantity,
          unitId,
          unitLabel,
          unitFactor: factor,
          availableUnits,
          variantId,
          variantLabel,
          availableVariants,
        },
      ]
    }
    cartRef.current = next
    setCart(next)
    flashLine(cartKey)
  }

  const focusSearch = () => {
    if (isDesktop) searchRef.current?.focus()
  }

  /** Returns true when the item was added (or the variant picker opened). */
  const handleProductSelect = async (
    p: ProductLite,
    preselectedVariantId?: number | null,
    opts?: { fromScan?: boolean }
  ): Promise<boolean> => {
    // Clicks are guarded against double-taps; scans are serialised by the
    // queue instead, so a fast second scan is never silently dropped.
    if (addingProduct && !opts?.fromScan) return false
    setAddingProduct(true)
    try {
      let unitData: PosUnit[]
      let variantData: PosVariant[]
      const cached = detailsCache.current.get(p.id)
      if (cached && Date.now() - cached.t < 30_000) {
        unitData = cached.units
        variantData = cached.variants
      } else {
        ;[unitData, variantData] = await Promise.all([
          hasUnitsCap
            ? api<any[]>(`/api/products/${p.id}/units`)
                .then((d) =>
                  d.map((u: any) => ({ id: u.id, name: u.name, price: u.price, factor: u.factor }))
                )
                .catch(() => [] as PosUnit[])
            : Promise.resolve([] as PosUnit[]),
          hasVariantsCap
            ? api<any[]>(`/api/products/${p.id}/variants`)
                .then((d) =>
                  d.map((v: any) => ({
                    id: v.id,
                    size: v.size,
                    color: v.color,
                    quantity: v.quantity,
                  }))
                )
                .catch(() => [] as PosVariant[])
            : Promise.resolve([] as PosVariant[]),
        ])
        detailsCache.current.set(p.id, { t: Date.now(), units: unitData, variants: variantData })
      }

      if (variantData.length > 0) {
        if (preselectedVariantId) {
          const v = variantData.find((v: PosVariant) => v.id === preselectedVariantId)
          if (v) {
            if (v.quantity <= 0) playBeep('err')
            addToCartDirect(p, null, null, v.quantity, unitData, v.id, variantLabelOf(v), variantData)
            return v.quantity > 0
          }
        }
        setVariantPickerProduct(p)
        setVariantPickerUnits(unitData)
        setVariantPickerVariants(variantData)
        setVariantPickerOpen(true)
        return true
      }

      if (p.quantity <= 0) playBeep('err')
      addToCartDirect(p, null, null, p.quantity, unitData)
      return p.quantity > 0
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل بيانات المنتج')
      return false
    } finally {
      setAddingProduct(false)
      focusSearch()
    }
  }

  const handleVariantPick = (variant: PosVariant) => {
    if (!variantPickerProduct) return
    addToCartDirect(
      variantPickerProduct,
      null,
      null,
      variant.quantity,
      variantPickerUnits,
      variant.id,
      variantLabelOf(variant),
      variantPickerVariants
    )
    setVariantPickerOpen(false)
    setVariantPickerProduct(null)
    setVariantPickerVariants([])
    setVariantPickerUnits([])
    playBeep('ok')
    window.setTimeout(focusSearch, 50)
  }

  // One lookup path for hardware scans AND Enter typed in the search box.
  //  - 'scan':   the box was already cleared; unknown code = error beep + toast.
  //  - 'manual': the person may just be filtering by name; leave the text alone
  //              unless it resolved to exactly one product.
  const processScan = async (raw: string, mode: 'scan' | 'manual') => {
    const code = normalizeCode(raw)
    if (!code) return
    try {
      let target: { product: ProductLite; variantId: number | null } | null = null
      const cached = barcodeCache.current.get(code)
      if (cached && Date.now() - cached.t < 60_000) {
        target = { product: cached.product, variantId: cached.variantId }
      } else {
        const res = await api<{ data: ProductLite[] } | ProductLite[]>(
          `/api/products?search=${encodeURIComponent(code)}&limit=20&pos=1`
        )
        const data: ProductLite[] = Array.isArray(res) ? res : (res as any)?.data ?? []
        const exact = data.find((r) => r.barcode === code)
        const variantExact = data.find((r) => r.matchedVariantId != null)
        if (exact) target = { product: exact, variantId: exact.matchedVariantId ?? null }
        else if (variantExact) target = { product: variantExact, variantId: variantExact.matchedVariantId ?? null }
        else if (data.length === 1) target = { product: data[0], variantId: null }
        else if (data.length === 0) {
          playBeep('err')
          toast.error(
            mode === 'scan'
              ? `الباركود ${code} غير مسجّل`
              : 'لا يوجد منتج بهذا الاسم أو الباركود'
          )
          return
        } else if (mode === 'scan') {
          playBeep('err')
          toast.error(`الباركود ${code} مش مطابق لمنتج واحد — راجع الباركود أو ابحث بالاسم`)
          return
        } else {
          return // several name matches: the grid already shows them
        }
        barcodeCache.current.set(code, { t: Date.now(), ...target })
      }
      const added = await handleProductSelect(target.product, target.variantId, { fromScan: true })
      if (added) playBeep('ok')
      if (mode === 'manual') setQuery((q) => (q.trim() === raw.trim() ? '' : q))
    } catch {
      playBeep('err')
      toast.error('فشل البحث عن المنتج')
    }
  }

  const enqueueScan = (code: string, mode: 'scan' | 'manual' = 'scan') => {
    scanChain.current = scanChain.current.then(() => processScan(code, mode)).catch(() => {})
  }
  enqueueScanRef.current = (code) => enqueueScan(code, 'scan')

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q) enqueueScan(q, 'manual')
  }

  const updateQty = (cartKey: string, q: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const factor = i.unitFactor ?? 1
        // 🥬 2026-10-12: منتجات البيع بالوزن — الكمية بالكيلو بكسور:
        //   - مفيش تقريب لأعداد صحيحة (1.65 كيلو تفضل 1.65)
        //   - أقل كمية 0.05 كيلو (50 جرام) بدل 1
        //   - بننضف الكسر لخانتين عشرية عشان مايحصلش ضوضاء عائمة (1.6500000001)
        if (i.product.soldByWeight && !i.unitId) {
          const cap = lineCap(i, prev)
          const w = Math.round(Math.max(0.05, Math.min(q, cap)) * 100) / 100
          return { ...i, quantity: w }
        }
        const cap = lineCap(i, prev)
        if (cap < factor) return i // المخزون كله مستخدم في سطور تانية — منغيّرش
        const rounded = factor > 1 ? Math.round(q / factor) * factor : q
        return { ...i, quantity: Math.max(factor, Math.min(rounded, cap)) }
      })
    )
  }

  const updatePrice = (cartKey: string, p: number) => {
    setCart((prev) => prev.map((i) => (i.cartKey === cartKey ? { ...i, price: Math.max(0, p) } : i)))
  }

  const removeItem = (cartKey: string) => {
    setCart((prev) => prev.filter((i) => i.cartKey !== cartKey))
  }

  const clearCart = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      window.setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setCart([])
    setConfirmClear(false)
  }

  const updateUnit = (cartKey: string, unit: PosUnit | null) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const newUnitId = unit?.id ?? null
        const newKey = `${i.product.id}-${newUnitId ?? 'x'}-${i.variantId ?? 'x'}`
        const factor = unit?.factor ?? 1
        const perPiecePrice = unit
          ? unit.price != null
            ? unit.price / factor
            : i.product.price
          : piecePrice(i.product)
        const baseStock = i.variantId
          ? i.availableVariants.find((v) => v.id === i.variantId)?.quantity ?? 0
          : i.product.quantity
        const newMax = unit?.factor ? Math.floor(baseStock / unit.factor) * unit.factor : baseStock
        return {
          ...i,
          cartKey: newKey,
          unitId: newUnitId,
          unitLabel: unit?.name ?? null,
          unitFactor: factor,
          price: perPiecePrice,
          quantity: Math.min(factor, newMax),
          maxQuantity: newMax,
        }
      })
    )
  }

  const updateVariant = (cartKey: string, variant: PosVariant | null) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const newVariantId = variant?.id ?? null
        const newKey = `${i.product.id}-${i.unitId ?? 'x'}-${newVariantId ?? 'x'}`
        const baseStock = variant ? variant.quantity : i.product.quantity
        const newMax =
          i.unitFactor > 1 ? Math.floor(baseStock / i.unitFactor) * i.unitFactor : baseStock
        return {
          ...i,
          cartKey: newKey,
          variantId: newVariantId,
          variantLabel: variant ? variantLabelOf(variant) : null,
          quantity: Math.min(i.unitFactor, newMax),
          maxQuantity: newMax,
        }
      })
    )
  }

  /* ── checkout (logic unchanged) ─────────────────────────────── */

  // طباعة الإيصال. لو الطابعة الحرارية متظبطة بنطبع عليها بس — القديم كان بيفتح نافذتين طباعة.
  const printReceipt = (sale: any) => {
      // 🛡️ PWA OFFLINE ROOT FIX (2026-10-07): الطباعة محتاجة فاتورة حقيقية
      // فيها items — لو الرد مجرد تأكيد حفظ محلي (أي شكل غير متوقع) نتجاهل
      // الطباعة بصمت بدل ما نكسر الشاشة بـ
      // "Cannot read properties of undefined (reading 'map')".
      if (!sale || !Array.isArray(sale.items)) return
      const _ts = getStoredPrinterSettings()
      if (_ts.width) {
        printThermalReceipt({
          shopName: shopName || 'محل',
          shopPhone: shopBranding.phone || undefined,
          shopAddress: shopBranding.address || undefined,
          invoiceNo: sale.invoiceNo ?? String(sale.id),
          date: new Date(sale.createdAt).toLocaleString('ar-EG'),
          items: sale.items.map((it: any) => ({
            name:
              it.name +
              (it.variant
                ? ` ${[it.variant.color, it.variant.size].filter(Boolean).join('/')}`
                : ''),
            // 🥬 2026-10-12: منتجات الوزن — الكمية بتتنضف من ضوضاء العوامات (1.65 مش 1.6500000001)
            qty: Math.round((it.unitQuantity ?? it.quantity) * 1000) / 1000,
            price: it.unitQuantity ? (it.price * it.quantity) / it.unitQuantity : it.price,
            total: it.price * it.quantity,
          })),
          total: sale.total,
          paid: sale.paid,
          remaining: sale.total - sale.paid,
          customerName: sale.customer?.name,
        })
        return
      }

      printSale(
        {
          id: sale.id,
          invoiceNo: sale.invoiceNo,
          total: sale.total,
          paid: sale.paid,
          status: sale.status,
          createdAt: sale.createdAt,
          items: sale.items.map((it: any) => {
            const hasUnit = it.unitQuantity != null && it.unitQuantity > 0
            const displayQty = Math.round((hasUnit ? it.unitQuantity : it.quantity) * 1000) / 1000
            const displayPrice = hasUnit ? (it.price * it.quantity) / it.unitQuantity : it.price
            const unitSuffix = it.unitLabel ? ` (${displayQty} ${it.unitLabel})` : ''
            const variantSuffix = it.variant
              ? ` — ${[it.variant.color, it.variant.size].filter(Boolean).join(' / ')}`
              : ''
            return {
              name: it.name + variantSuffix + unitSuffix,
              price: displayPrice,
              quantity: displayQty,
            }
          }),
          customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
        },
        {
          name: shopName || undefined,
          phone: shopBranding.phone || undefined,
          address: shopBranding.address || undefined,
          logo: shopBranding.logoPath || undefined,
          invoicePrefix: shopBranding.invoicePrefix,
        }
      )

  }

  const reprintLast = () => {
    if (lastSale) printReceipt(lastSale)
  }

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة')
      return
    }
    if (creditNeedsCustomer) {
      toast.error('البيع بالآجل لازم يكون مرتبط بعميل')
      return
    }
    const paidNow = paidFull ? total : paidAmount
    // 🛡️ 2026-09-30 (C5): الزيادة عن الإجمالي مرفوضة من السيرفر — نمنعها هنا
    // برسالة واضحة بدل رسالة خطأ غامضة بعد الإرسال.
    if (paidNow > total + 0.005) {
      toast.error('المدفوع أكبر من إجمالي الفاتورة — لو العميل دفع زيادة سجلها دفعة على حسابه من شاشة العملاء')
      return
    }
    setSubmitting(true)
    try {
      const paid = paidFull ? total : paidAmount
      let customerId = selectedCustomerId
      if (!customerId && customerName.trim()) {
        const match = customers.find((c) => c.name.trim() === customerName.trim())
        if (match) customerId = match.id
      }
      const sale = await api<any>('/api/sales', {
        method: 'POST',
        body: {
          items: cart.map((i) => {
            const factor = i.unitFactor || 1
            const unitsEntered = i.unitId ? Math.round(i.quantity / factor) : i.quantity
            const pricePerEntered = i.unitId ? i.price * factor : i.price
            return {
              productId: i.product.id,
              quantity: unitsEntered,
              price: pricePerEntered,
              ...(i.unitId ? { unitId: i.unitId } : {}),
              ...(i.variantId ? { variantId: i.variantId } : {}),
            }
          }),
          customerId,
          paid,
          paymentMethod,
          ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00`).toISOString() } : {}),
        },
      })
      // 🛡️ PWA OFFLINE ROOT FIX (2026-10-07): أوفلاين الـ api بيرجّع رد
      // تأكيد حفظ محلي ({ok, offline:true, message}) من غير invoiceNo ولا
      // items — والكود القديم كان بيكمل على طول printReceipt(sale) وبينفجر
      // بـ "Cannot read properties of undefined (reading 'map')" رغم إن
      // الفاتورة نفسها اتحفظت في outbox وستمم المزامنة! (ده بالظبط الخطأ
      // الأحمر اللي كان بيطلع للكاشير وهو شغال أوفلاين)
      //
      // دلوقتي: لو الرد تأكيد حفظ محلي — نبني إيصال محلي من السلة نفسها
      // (الأسماء والأسعار موجودة عندنا) ونطبعه بـ رقم مؤقت "محلي-xxxxx"،
      // والفاتورة الأصلية بتتسجل برقمها الرسمي لما المزامنة تحصل.
      const offlineQueued = !!sale?.offline
      let receiptSale = sale
      if (offlineQueued) {
        receiptSale = {
          id: 0,
          invoiceNo: `محلي-${String(Date.now()).slice(-6)}`,
          total,
          paid,
          status: 'PENDING_SYNC',
          createdAt: new Date().toISOString(),
          items: cart.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            price: i.price,
          })),
          customer: resolvedCustomer
            ? { name: resolvedCustomer.name, phone: (resolvedCustomer as any).phone }
            : null,
        }
        toast.success('تم حفظ الفاتورة على الجهاز — هتتزامن تلقائياً عند رجوع النت')
      } else {
        toast.success(`تمت عملية البيع بنجاح - ${sale?.invoiceNo}`)
      }
      printReceipt(receiptSale)
      setLastSale(receiptSale)

      setCart([])
      setCustomerName('')
      setSelectedCustomerId(null)
      setPaidFull(true)
      setPaidAmount(0)
      setReceived('')
      setPaymentMethod('cash')
      setDueDate('')
      closeCartSheet()
      setCustomersVersion((v) => v + 1)
      // Refresh stock numbers in the grid and get ready for the next scan.
      detailsCache.current.clear()
      barcodeCache.current.clear()
      gridCache.current.clear()
      setRefreshTick((t) => t + 1)
      focusSearch()
    } catch (e: any) {
      toast.error(e?.message || 'فشل إتمام البيع')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── autosave the invoice in progress ───────────────────────── */

  const skipFirstSave = React.useRef(true)
  React.useEffect(() => {
    if (skipFirstSave.current) {
      // First run just mirrors what we loaded — don't extend the 12h window.
      skipFirstSave.current = false
      return
    }
    if (!draftKey) return
    try {
      const empty = cart.length === 0 && !customerName.trim() && !selectedCustomerId
      if (empty) {
        window.localStorage.removeItem(draftKey)
      } else {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            v: 1,
            updatedAt: Date.now(),
            cart,
            customerName,
            selectedCustomerId,
            paidFull,
            paidAmount,
          })
        )
      }
    } catch {
      /* storage full / blocked — the cart still works, it just won't persist */
    }
  }, [draftKey, cart, customerName, selectedCustomerId, paidFull, paidAmount])

  // Stock may have changed while the cart sat there. Re-check ceilings once
  // (prices are left alone — the cashier may have edited them on purpose).
  const revalidated = React.useRef(false)
  React.useEffect(() => {
    if (revalidated.current || !restored || restored.cart.length === 0) return
    revalidated.current = true
    void (async () => {
      const items = restored.cart
      const freshProduct = new Map<number, ProductLite>()
      const freshVariants = new Map<number, PosVariant[]>()
      await Promise.all(
        [...new Set(items.map((i) => i.product.id))].map(async (id) => {
          const it = items.find((i) => i.product.id === id)!
          try {
            if (it.variantId != null) {
              const d = await api<any[]>(`/api/products/${id}/variants`)
              freshVariants.set(
                id,
                d.map((v: any) => ({ id: v.id, size: v.size, color: v.color, quantity: v.quantity }))
              )
            } else {
              const q = it.product.barcode || it.product.name
              const res = await api<{ data: ProductLite[] } | ProductLite[]>(
                `/api/products?search=${encodeURIComponent(q)}&limit=50`
              )
              const list: ProductLite[] = Array.isArray(res) ? res : (res as any)?.data ?? []
              const hit = list.find((p) => p.id === id)
              if (hit) freshProduct.set(id, hit)
            }
          } catch {
            /* offline or transient — keep the saved numbers */
          }
        })
      )

      const updates = new Map<string, CartItem | null>()
      let adjusted = 0
      for (const i of items) {
        const stock =
          i.variantId != null
            ? freshVariants.get(i.product.id)?.find((v) => v.id === i.variantId)?.quantity
            : freshProduct.get(i.product.id)?.quantity
        if (stock == null) continue
        const max = i.unitFactor > 1 ? Math.floor(stock / i.unitFactor) * i.unitFactor : stock
        if (max <= 0) {
          updates.set(i.cartKey, null)
          adjusted++
          continue
        }
        const qty = Math.min(i.quantity, max)
        if (qty !== i.quantity || max !== i.maxQuantity) {
          if (qty !== i.quantity) adjusted++
          updates.set(i.cartKey, {
            ...i,
            quantity: qty,
            maxQuantity: max,
            product: { ...i.product, quantity: freshProduct.get(i.product.id)?.quantity ?? i.product.quantity },
            availableVariants: freshVariants.get(i.product.id) ?? i.availableVariants,
          })
        }
      }
      if (updates.size === 0) return
      setCart((prev) =>
        prev
          .filter((i) => updates.get(i.cartKey) !== null)
          .map((i) => updates.get(i.cartKey) ?? i)
      )
      if (adjusted > 0) toast.warning('اتعدّلت كميات في السلة المسترجعة حسب المخزون الحالي')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── keyboard shortcuts: "/" search · Esc clear · F9 pay ─────── */

  const checkoutRef = React.useRef(checkout)
  checkoutRef.current = checkout
  const canCheckoutRef = React.useRef(canCheckout)
  canCheckoutRef.current = canCheckout

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'F9') {
        e.preventDefault()
        if (canCheckoutRef.current) void checkoutRef.current()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('')
      } else if (e.key === 'Escape' && !typing && !document.querySelector('[role="dialog"]')) {
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    const det = createScanDetector()
    const isOtherField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      if (!el || el === searchRef.current) return false // search box is scanner-friendly
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      )
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      // Qty / price / customer fields and open dialogs are left alone.
      if (isOtherField(e.target) || document.querySelector('[role="dialog"]')) {
        det.reset()
        return
      }
      const now = performance.now()
      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = det.end(now)
        if (code) {
          // Swallow the terminator so it can't click a focused button.
          e.preventDefault()
          e.stopPropagation()
          setQuery('')
          enqueueScanRef.current(code)
        }
        return
      }
      if (e.key === 'Shift' || e.key === 'CapsLock' || e.key === 'Process') return
      if (e.key.length === 1 || /^(Key[A-Z]|Digit\d)$/.test(e.code)) det.char(charFromKeyEvent(e), now)
      else det.reset()
    }
    window.addEventListener('keydown', onKey, true) // capture: run before anything else
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Coming back to the tab/window: hand focus back to the search box.
  React.useEffect(() => {
    if (!isDesktop) return
    const onFocus = () => {
      if (document.activeElement === document.body) searchRef.current?.focus()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isDesktop])

  const filteredCustomers = custQuery.trim()
    ? customers.filter(
        (c) => c.name.includes(custQuery.trim()) || (c.phone ?? '').includes(custQuery.trim())
      )
    : customers.slice(0, 6)

  /* ────────────────────────────────────────────────────────────
     Panels (JSX values, not inner components, so inputs keep focus)
     ──────────────────────────────────────────────────────────── */

  // 1) أي تغيير في محتوى اللوحة/حجم النافذة ← نرجع لـ 100% ونقيس من جديد
  React.useLayoutEffect(() => {
    fitPending.current = true
    setPayFit(1)
  }, [paidFull, dueDate, shortBy > 0, resolvedCustomer?.id, remaining > 0, change > 0, paymentMethod, scale, isXl, isFull, cart.length === 0, compact, fitTick])
  // 2) القياس نفسه (على الحجم الطبيعي) — لو زاد عن المساحة نصغّر بنسبة واحدة
  React.useLayoutEffect(() => {
    if (!fitPending.current || payFit !== 1) return
    const box = payBodyRef.current
    const inner = payInnerRef.current
    if (!box || !inner || !isXl) {
      fitPending.current = false
      return
    }
    fitPending.current = false
    const cs = getComputedStyle(box)
    const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    const natural = inner.offsetHeight
    if (natural <= 0 || avail <= 0) return
    if (natural > avail + 1) {
      setPayNat(natural)
      setPayFit(Math.max(0.8, Math.floor((avail / natural) * 50) / 50))
    }
  })
  React.useEffect(() => {
    const box = payBodyRef.current
    if (!box || !isXl) return
    let last = box.clientHeight
    const ro = new ResizeObserver(() => {
      if (Math.abs(box.clientHeight - last) > 1) {
        last = box.clientHeight
        setFitTick((t) => t + 1)
      }
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [isXl])

  const panelCls =
    'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm'
  const viewMode = effMode
  const fewProducts = products.length > 0 && products.length <= 6
  // الموبايل: عمودين للكروت (بدل كارت واحد طويل في كل صف)
  const gridCols =
    viewMode === 'compact'
      ? 'grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(calc(var(--spacing)*56),1fr))]'
      : fewProducts
        ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(calc(var(--spacing)*var(--cm,50)),1fr))]'
        : 'grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(calc(var(--spacing)*var(--cm,44)),1fr))]'

  /* شريط الأدوات: بقى جوه مساحة البيع نفسها (أسفل الكتالوج) بدل هيدر مستقل بياكل ارتفاع الشاشة */
  const dockBtn =
    'flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
  const toolsDock = (
    <div className="flex items-center overflow-hidden rounded-xl border border-foreground/20 bg-card">
      <button
        type="button"
        onClick={() => setSoundOn((v) => !v)}
        title={soundOn ? 'إيقاف صوت السكان' : 'تشغيل صوت السكان'}
        aria-label={soundOn ? 'إيقاف صوت السكان' : 'تشغيل صوت السكان'}
        aria-pressed={soundOn}
        className={cn(dockBtn, soundOn && 'text-foreground')}
      >
        {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </button>
      {isDesktop && (
        <div dir="ltr" role="group" aria-label="حجم العرض" className="flex items-center border-s border-foreground/15">
          <button
            type="button"
            onClick={() => setSizeStep((v) => clamp(v - 1, -4, 6))}
            className={dockBtn}
            aria-label="تصغير الواجهة"
            title="تصغير الواجهة"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setSizeStep(0)}
            className="min-w-11 px-1 text-center text-xs font-bold tabular-nums text-muted-foreground hover:text-foreground"
            title="الرجوع للحجم التلقائي"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setSizeStep((v) => clamp(v + 1, -4, 6))}
            className={dockBtn}
            aria-label="تكبير الواجهة"
            title="تكبير الواجهة"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
      {isDesktop && (
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          title={isFull ? 'خروج من ملء الشاشة (Esc)' : 'ملء الشاشة — يخفي القائمة الجانبية'}
          aria-label={isFull ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}
          className={cn(dockBtn, 'border-s border-foreground/15', isFull && 'bg-brand-600/15 text-brand-800 dark:text-brand-200')}
        >
          {isFull ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      )}
    </div>
  )

  const statusChip = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold',
        submitting
          ? 'border-warning/40 bg-warning-subtle text-warning-subtle-foreground'
          : 'border-brand-600/25 bg-brand-600/10 text-brand-700 dark:text-brand-300'
      )}
    >
      <span className={cn('size-1.5 rounded-full', submitting ? 'animate-pulse bg-warning' : 'bg-brand-500')} />
      {submitting ? 'جارٍ الإتمام…' : 'جاهز'}
    </span>
  )

  const productsPanel = (
    <section ref={panelTopRef} className={cn(panelCls, 'scroll-mt-2 max-lg:overflow-visible')}>
      <div className="space-y-3 border-b border-border p-3.5">
        <PanelHead
          n={1}
          tag="Catalog"
          title={t('اختر المنتجات')}
          aside={
            <div className="flex items-center gap-2.5">
              {!isDesktop && (
                <button
                  type="button"
                  onClick={() => setSoundOn((v) => !v)}
                  aria-pressed={soundOn}
                  aria-label={soundOn ? 'إيقاف صوت السكان' : 'تشغيل صوت السكان'}
                  className={cn(
                    'flex size-9 touch-manipulation items-center justify-center rounded-lg border border-border active:bg-muted',
                    soundOn ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </button>
              )}
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {productsLoading ? 'جاري التحميل…' : `${products.length} منتج`}
              </span>
              <div
                role="group"
                aria-label={t('طريقة عرض المنتجات')}
                className="flex overflow-hidden rounded-lg border border-border"
              >
                {(
                  [
                    { v: 'cards', icon: LayoutGrid, label: 'عرض بالصور' },
                    { v: 'compact', icon: List, label: 'عرض مدمج' },
                  ] as const
                ).map((m, idx) => (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => setViewPref(m.v)}
                    aria-pressed={viewMode === m.v}
                    aria-label={m.label}
                    title={m.label}
                    className={cn(
                      'flex size-8 items-center justify-center transition-colors',
                      idx > 0 && 'border-s border-border',
                      viewMode === m.v
                        ? 'bg-brand-600/15 text-brand-800 dark:text-brand-200'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <m.icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          }
        />

        <div className="flex items-stretch gap-2">
        <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث أو امسح الباركود…"
              className="h-12 rounded-xl border-foreground/25 bg-card pr-10 pl-24 text-base shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] focus-visible:border-brand-600 focus-visible:ring-brand-600/20"
              autoFocus={isDesktop}
              inputMode="search"
            />
            <div className="absolute left-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {(productsLoading || addingProduct) && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    searchRef.current?.focus()
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="مسح البحث"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="hidden rounded-md border border-border bg-background px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] text-muted-foreground sm:inline-block">
                  /
                </kbd>
              )}
              <ScanBarcode className="size-5 text-brand-600" aria-hidden />
            </div>
          </div>
        </form>
        <button
          type="button"
          onClick={() => openQuickAddProduct()}
          title={t('إضافة منتج جديد')}
          aria-label={t('إضافة منتج جديد')}
          className="flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-foreground/25 bg-card px-3.5 text-sm font-bold shadow-sm transition-colors hover:border-brand-600/60 hover:bg-brand-600/[0.06]"
        >
          <Plus className="size-5" />
          <span className="hidden 2xl:inline">{t('منتج جديد')}</span>
        </button>
        </div>

        {categories.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {[{ id: 'all', name: 'الكل' }, ...categories].map((c) => {
              const active = category === (c.id === 'all' ? 'all' : c.name)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id === 'all' ? 'all' : c.name)}
                  className={cn(
                    'shrink-0 rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-600/10 text-brand-800 shadow-sm dark:text-brand-200'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                  )}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div
        ref={gridBoxRef}
        onTouchStart={(e) => {
          swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }}
        onTouchEnd={(e) => {
          const st = swipe.current
          swipe.current = null
          if (!st || !paged) return
          const dx = e.changedTouches[0].clientX - st.x
          const dy = e.changedTouches[0].clientY - st.y
          if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return
          // RTL: السحب لليسار = الصفحة التالية
          setPage((p) => Math.max(0, Math.min(pageCount - 1, p + (dx < 0 ? 1 : -1))))
        }}
        className={cn(
          'min-h-0 flex-1 p-3 lg:max-h-[75dvh] xl:max-h-none',
          // الموبايل (<lg): مفيش overflow ولا overscroll-contain خالص — الصفحة هي الوحيدة اللي بتتمرّر،
          // فالسحب من أي نقطة (حتى المنتصف) بيمرّر الصفحة. التمرير الداخلي للتابلت الكبير بس.
          paged ? 'overflow-hidden overscroll-contain' : cn('lg:overflow-y-auto lg:overscroll-contain', slimScroll)
        )}
      >
        {searchError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">{t('تعذّر تحميل المنتجات — تأكد من الاتصال وجرّب تاني.')}</p>
            <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
              إعادة المحاولة
            </Button>
          </div>
        ) : productsLoading && products.length === 0 ? (
          <div className={cn('grid gap-2.5', gridCols)}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <PackageSearch className="size-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">لا يوجد منتج مطابق</p>
              <p className="text-sm text-muted-foreground">جرّب اسم تاني أو أضف المنتج دلوقتي.</p>
            </div>
            <Button size="sm" variant="subtle" onClick={() => openQuickAddProduct()}>
              <Plus className="size-4" />
              أضف منتجاً جديداً
            </Button>
          </div>
        ) : (
          <ul ref={gridRef} className={cn('grid gap-2.5', gridCols)}>
            {visibleProducts.map((p) => {
              const inCart = cart
                .filter((i) => i.product.id === p.id)
                .reduce((s, i) => s + i.quantity, 0)
              const out = p.quantity <= 0
              const noImg = !p.imagePath
              const badge =
                inCart > 0 ? (
                  <span className="absolute -left-1.5 -top-1.5 z-10 flex min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-extrabold tabular-nums text-white shadow ring-2 ring-card">
                    {inCart}
                  </span>
                ) : null
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void handleProductSelect(p, p.matchedVariantId)}
                    className={cn(
                      'group relative w-full rounded-xl border bg-background text-right transition-all',
                      'hover:-translate-y-0.5 hover:border-brand-600/60 hover:shadow-md active:translate-y-0 active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
                      inCart > 0 ? 'border-brand-600/50 bg-brand-600/[0.04]' : 'border-border',
                      out && 'opacity-55 grayscale',
                      viewMode === 'compact'
                        ? 'flex h-full items-center gap-2.5 p-2'
                        : 'flex h-full flex-col gap-2 p-2.5',
                      noImg && viewMode === 'compact' && 'border-s-[3px]'
                    )}
                    style={
                      noImg && viewMode === 'compact'
                        ? { borderInlineStartColor: `hsl(${hueOf(p.name)} 60% 48%)` }
                        : undefined
                    }
                  >
                    {badge}
                    <div
                      data-thumb
                      className={cn(
                        'relative',
                        viewMode === 'cards' && 'aspect-[16/10] min-h-0 w-full flex-1'
                      )}
                    >
                      <ProductThumb
                        name={p.name}
                        imagePath={p.imagePath}
                        className={viewMode === 'compact' ? 'size-11 rounded-lg text-base' : 'h-full w-full text-4xl'}
                      />
                      {viewMode === 'cards' && noImg && (
                        <span className="absolute end-1.5 top-1.5 z-[1] rounded-full bg-card/90 shadow-sm backdrop-blur-sm">
                          <StockChip quantity={p.quantity} weight={p.soldByWeight} unit={p.unitLabel} />
                        </span>
                      )}
                      {viewMode === 'cards' && p.matchedVariantLabel && (
                        <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-stone-950/80 px-1.5 py-0.5 text-center text-[length:var(--fs-2xs,0.75rem)] font-semibold text-white">
                          {p.matchedVariantLabel}
                        </span>
                      )}
                    </div>
                    <div className={cn('min-w-0', viewMode === 'compact' && 'flex-1')}>
                      <p
                        className={cn(
                          'line-clamp-2 text-sm font-semibold leading-snug',
                          viewMode === 'cards' && 'min-h-[2.75em]'
                        )}
                      >
                        {p.name}
                      </p>
                      {viewMode === 'compact' && (
                        <div className="mt-1 flex items-center gap-1.5">
                          {noImg ? (
                            <StockChip quantity={p.quantity} weight={p.soldByWeight} unit={p.unitLabel} className="px-0" />
                          ) : (
                            <StockBadge quantity={p.quantity} weight={p.soldByWeight} unit={p.unitLabel} />
                          )}
                          {p.soldByWeight && (
                            <span className="shrink-0 rounded-full bg-brand-600/15 px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-bold text-brand-700 dark:text-brand-300">
                              بالكيلو
                            </span>
                          )}
                          {p.matchedVariantLabel && (
                            <span className="min-w-0 truncate text-[length:var(--fs-2xs,0.75rem)] font-medium text-brand-700 dark:text-brand-300">
                              {p.matchedVariantLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {viewMode === 'compact' ? (
                      <span className="shrink-0 text-base font-extrabold tabular-nums text-brand-700 dark:text-brand-300">
                        {formatCurrency(piecePrice(p))}
                        {p.soldByWeight && (
                          <span className="text-[11px] font-bold text-muted-foreground"> / كيلو</span>
                        )}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1">
                        <span className="whitespace-nowrap text-base font-extrabold tabular-nums text-brand-700 dark:text-brand-300">
                          {formatCurrency(piecePrice(p))}
                          {p.soldByWeight && (
                            <span className="text-[11px] font-bold text-muted-foreground"> / كيلو</span>
                          )}
                        </span>
                        {noImg ? (
                          !out && (
                            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600/10 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:text-brand-300">
                              <Plus className="size-4" />
                            </span>
                          )
                        ) : (
                          <StockBadge quantity={p.quantity} weight={p.soldByWeight} unit={p.unitLabel} />
                        )}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {simplePaged && pageCount > 1 && (
        <nav aria-label={t('صفحات المنتجات')} className="flex items-center gap-2 border-t border-border bg-muted/40 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="flex h-11 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-foreground/20 bg-card text-sm font-bold transition-colors active:bg-muted disabled:opacity-35"
          >
            <ChevronRight className="size-5" />
            السابقة
          </button>
          {/* اختيار الصفحة مباشرة (قايمة النظام على الموبايل) — مهم لما المنتجات تبقى مئات */}
          <select
            value={safePage}
            onChange={(e) => setPage(parseInt(e.target.value, 10))}
            aria-label="اختيار الصفحة"
            className="h-11 w-[5.5rem] shrink-0 cursor-pointer appearance-none rounded-xl border-2 border-foreground/20 bg-card text-center text-sm font-extrabold tabular-nums"
          >
            {Array.from({ length: pageCount }, (_, i) => (
              <option key={i} value={i}>
                {i + 1} من {pageCount}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="flex h-11 flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-foreground/20 bg-card text-sm font-bold transition-colors active:bg-muted disabled:opacity-35"
          >
            التالية
            <ChevronLeft className="size-5" />
          </button>
        </nav>
      )}

      <footer className="flex items-center justify-between gap-3 border-t border-dashed border-foreground/20 bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground max-lg:hidden">
        <div className="hidden items-center gap-4 xl:flex">
          {[
            ['/', 'بحث'],
            ['F9', 'دفع وطباعة'],
          ].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-foreground/20 bg-card px-1.5 py-0.5 text-[length:var(--fs-2xs,0.75rem)] font-bold text-foreground">
                {k}
              </kbd>
              {l}
            </span>
          ))}
        </div>
        {paged && pageCount > 1 && (
          <nav aria-label={t('صفحات المنتجات')} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="flex size-9 items-center justify-center rounded-lg border border-foreground/20 bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-35"
              aria-label="الصفحة السابقة"
              title="السابقة (PageUp)"
            >
              <ChevronRight className="size-5" />
            </button>
            <span className="min-w-[5rem] whitespace-nowrap text-center text-sm font-extrabold tabular-nums text-foreground">
              {safePage + 1} <span className="font-medium text-muted-foreground">من</span> {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className="flex size-9 items-center justify-center rounded-lg border border-foreground/20 bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-35"
              aria-label="الصفحة التالية"
              title="التالية (PageDown)"
            >
              <ChevronLeft className="size-5" />
            </button>
          </nav>
        )}
        <div className="ms-auto">{toolsDock}</div>
      </footer>
    </section>
  )

  const renderCartLines = (inSheet: boolean) =>
    cart.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-foreground/25 text-muted-foreground">
          <ShoppingBag className="size-8" />
        </div>
        <div>
          <p className="text-base font-extrabold">السلة فاضية</p>
          <p className="mt-1 text-sm text-muted-foreground">
            امسح الباركود أو اضغط على أي منتج لبدء الفاتورة.
          </p>
        </div>
      </div>
    ) : inSheet ? (
      /* موبايل: صف واحد مضغوط (الكمية · الاسم والسعر · الإجمالي). الضغط على الاسم بيفتح التفاصيل
         (اللون/المقاس، الوحدة، تعديل السعر، حذف). زر «−» بيتحوّل لسلة مهملات لما الكمية 1. */
      <ul className="divide-y divide-border">
        {cart.map((it) => {
          const cap = lineCap(it, cart)
          // 🥬 2026-10-12: منتج بيع بالوزن — الخطوة 0.5 كيلو والكمية قبل الكسور
          const isWeight = !!it.product.soldByWeight && !it.unitId
          const atMax = it.quantity >= cap - 1e-9
          const step = isWeight ? 0.5 : it.unitFactor || 1
          const needsVariant = it.availableVariants.length > 0 && it.variantId == null
          const open = expandedKey === it.cartKey || needsVariant
          const atMin = isWeight ? it.quantity - step < 0.05 : it.quantity <= step
          return (
            <li
              key={it.cartKey}
              id={`cart-line-${it.cartKey}`}
              className={cn('px-3 py-2.5 transition-colors duration-700', lastAddedKey === it.cartKey && 'bg-brand-600/10')}
            >
              <div className="flex items-center gap-2">
                <div
                  dir="ltr"
                  className="flex shrink-0 items-center overflow-hidden rounded-xl border border-foreground/25 bg-card"
                >
                  <button
                    type="button"
                    onClick={() => (atMin ? removeItem(it.cartKey) : updateQty(it.cartKey, it.quantity - step))}
                    className={cn(
                      'flex size-10 touch-manipulation items-center justify-center transition-colors active:bg-muted',
                      atMin ? 'text-destructive' : 'text-muted-foreground'
                    )}
                    aria-label={atMin ? `حذف ${it.product.name}` : 'تقليل الكمية'}
                  >
                    {atMin ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                  </button>
                  <NumField
                    integer={!isWeight}
                    value={it.quantity}
                    onChange={(n) => n !== '' && updateQty(it.cartKey, isWeight ? n : Math.round(n))}
                    ariaLabel={isWeight ? 'الوزن بالكيلو' : 'الكمية'}
                    className="h-10 w-10 bg-transparent text-center text-base font-extrabold tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateQty(it.cartKey, it.quantity + step)}
                    disabled={atMax}
                    className="flex size-10 touch-manipulation items-center justify-center text-brand-700 transition-colors active:bg-brand-600/10 disabled:text-muted-foreground disabled:opacity-40 dark:text-brand-300"
                    aria-label="زيادة الكمية"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedKey(open && !needsVariant ? null : it.cartKey)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 touch-manipulation rounded-lg px-1 py-0.5 text-right"
                >
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-bold">{it.product.name}</span>
                    <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                  </span>
                  <span
                    className={cn(
                      'block truncate text-xs tabular-nums',
                      atMax ? 'font-semibold text-warning-subtle-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {it.variantLabel ? `${it.variantLabel} · ` : ''}
                    {formatCurrency(it.price)}
                    {it.unitLabel ? ` / ${it.unitLabel}` : isWeight ? ' / كيلو' : it.product.unitLabel ? ` / ${it.product.unitLabel}` : ''}
                    {atMax ? ' · آخر كمية' : ''}
                  </span>
                </button>
                <span className="shrink-0 text-base font-extrabold tabular-nums">
                  {formatCurrency(it.price * it.quantity)}
                </span>
              </div>

              {open && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {it.availableVariants.length > 0 && (
                    <select
                      value={it.variantId ?? ''}
                      onChange={(e) => {
                        const vid = e.target.value ? parseInt(e.target.value, 10) : null
                        updateVariant(it.cartKey, vid ? it.availableVariants.find((v) => v.id === vid) ?? null : null)
                      }}
                      className={cn(selectCls, 'h-10 min-w-full rounded-xl text-base')}
                      aria-label="اللون / المقاس"
                    >
                      <option value="" disabled>
                        اختار اللون/المقاس
                      </option>
                      {it.availableVariants.map((v) => (
                        <option key={v.id} value={v.id} disabled={v.quantity <= 0}>
                          {variantLabelOf(v)} {v.quantity <= 0 ? '(نفد)' : `(متاح ${v.quantity})`}
                        </option>
                      ))}
                    </select>
                  )}
                  {it.availableUnits.length > 0 && (
                    <select
                      value={it.unitId ?? ''}
                      onChange={(e) => {
                        const uid = e.target.value ? parseInt(e.target.value, 10) : null
                        updateUnit(it.cartKey, uid ? it.availableUnits.find((u) => u.id === uid) ?? null : null)
                      }}
                      className={cn(selectCls, 'h-10 min-w-0 flex-1 rounded-xl text-base')}
                      aria-label="الوحدة"
                    >
                      <option value="">{unitOf(it.product.unitLabel)}</option>
                      {it.availableUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.price != null ? ` (${formatCurrency(u.price)})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-foreground/25 bg-card px-3 text-xs font-medium text-muted-foreground focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20">
                    <span>السعر</span>
                    <NumField
                      value={it.price}
                      onChange={(n) => updatePrice(it.cartKey, n === '' ? 0 : n)}
                      ariaLabel="سعر القطعة"
                      className="w-full min-w-0 bg-transparent text-center text-base font-bold tabular-nums text-foreground outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(it.cartKey)}
                    className="flex h-10 shrink-0 touch-manipulation items-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-sm font-semibold text-destructive active:bg-danger-subtle"
                  >
                    <Trash2 className="size-4" />
                    حذف
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    ) : (
      <ul className="divide-y divide-border">
        {cart.map((it) => {
          const cap = lineCap(it, cart)
          // 🥬 2026-10-12: منتج بيع بالوزن — الخطوة 0.5 كيلو والكسور مسموحة
          const isWeight = !!it.product.soldByWeight && !it.unitId
          const atMax = it.quantity >= cap - 1e-9
          const step = isWeight ? 0.5 : it.unitFactor || 1
          return (
            <li
              key={it.cartKey}
              id={`cart-line-${it.cartKey}`}
              className={cn(
                'space-y-2 px-3.5 py-3 transition-colors duration-700',
                lastAddedKey === it.cartKey && 'bg-brand-600/10'
              )}
            >
              <div className="flex items-center gap-3">
                <ProductThumb
                  name={it.product.name}
                  imagePath={it.product.imagePath}
                  className="size-10 text-base"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold leading-tight">{it.product.name}</p>
                  <p
                    className={cn(
                      'mt-0.5 flex items-center gap-1 text-xs tabular-nums',
                      atMax ? 'font-semibold text-warning-subtle-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {atMax && <AlertTriangle className="size-3" />}
                    {formatCurrency(it.price)} × {it.quantity}
                    {isWeight ? ' كيلو' : !it.unitId && it.product.unitLabel ? ` ${unitWord(it.quantity, it.product.unitLabel)}` : ''}
                    <span aria-hidden>·</span>
                    {atMax
                      ? 'آخر كمية متاحة'
                      : `متاح ${isWeight ? `${Math.round(cap * 100) / 100} كيلو` : !it.unitId && it.product.unitLabel ? formatQtyUnit(cap, it.product.unitLabel) : cap}`}
                  </p>
                </div>
                <span className="text-base font-extrabold tabular-nums">
                  {formatCurrency(it.price * it.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(it.cartKey)}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-destructive"
                  aria-label={`حذف ${it.product.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {it.availableVariants.length > 0 && (
                <select
                  value={it.variantId ?? ''}
                  onChange={(e) => {
                    const vid = e.target.value ? parseInt(e.target.value, 10) : null
                    updateVariant(
                      it.cartKey,
                      vid ? it.availableVariants.find((v) => v.id === vid) ?? null : null
                    )
                  }}
                  className={cn(selectCls, 'h-9 rounded-xl text-sm')}
                  aria-label="اللون / المقاس"
                >
                  <option value="" disabled>
                    اختار اللون/المقاس
                  </option>
                  {it.availableVariants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.quantity <= 0}>
                      {variantLabelOf(v)} {v.quantity <= 0 ? '(نفد)' : `(متاح ${v.quantity})`}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center gap-2">
                {/* Stepper — forced LTR so it always reads  − 1 +  */}
                <div
                  dir="ltr"
                  className="flex shrink-0 items-center overflow-hidden rounded-xl border border-foreground/25 bg-card"
                >
                  <button
                    type="button"
                    onClick={() => updateQty(it.cartKey, it.quantity - step)}
                    disabled={isWeight ? it.quantity - step < 0.05 : it.quantity <= step}
                    className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    aria-label="تقليل الكمية"
                  >
                    <Minus className="size-4" />
                  </button>
                  <NumField
                    integer={!isWeight}
                    value={it.quantity}
                    onChange={(n) => n !== '' && updateQty(it.cartKey, isWeight ? n : Math.round(n))}
                    ariaLabel={isWeight ? 'الوزن بالكيلو' : 'الكمية'}
                    className="h-9 w-11 bg-transparent text-center text-base font-extrabold tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateQty(it.cartKey, it.quantity + step)}
                    disabled={atMax}
                    className="flex size-9 items-center justify-center text-brand-700 transition-colors hover:bg-brand-600/10 disabled:text-muted-foreground disabled:opacity-40 dark:text-brand-300"
                    aria-label="زيادة الكمية"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                {it.availableUnits.length > 0 ? (
                  <select
                    value={it.unitId ?? ''}
                    onChange={(e) => {
                      const uid = e.target.value ? parseInt(e.target.value, 10) : null
                      updateUnit(
                        it.cartKey,
                        uid ? it.availableUnits.find((u) => u.id === uid) ?? null : null
                      )
                    }}
                    className={cn(selectCls, 'h-9 min-w-0 flex-1 rounded-xl text-sm')}
                    aria-label="الوحدة"
                  >
                    <option value="">{unitOf(it.product.unitLabel)}</option>
                    {it.availableUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.price != null ? ` (${formatCurrency(u.price)})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex-1" />
                )}

                <label
                  className="flex h-9 w-28 shrink-0 items-center gap-1.5 rounded-xl border border-foreground/25 bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20 hover:border-foreground/40"
                  title="سعر القطعة (ممكن تعدّله)"
                >
                  <span>السعر</span>
                  <NumField
                    value={it.price}
                    onChange={(n) => updatePrice(it.cartKey, n === '' ? 0 : n)}
                    ariaLabel="سعر القطعة"
                    className="w-full min-w-0 bg-transparent text-center text-sm font-bold tabular-nums text-foreground outline-none"
                  />
                </label>
              </div>
            </li>
          )
        })}
      </ul>
    )

  const renderCartPanel = (inSheet: boolean) => (
    <section className={cn(panelCls, inSheet && 'min-h-0 flex-1 rounded-none border-0 shadow-none')}>
      <header className="border-b border-border px-3.5 py-3">
        <PanelHead
          n={2}
          tag="Basket"
          title="راجع السلة"
          aside={
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-bold tabular-nums">
                {cart.length} صنف
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors',
                    confirmClear
                      ? 'border-destructive bg-destructive text-white'
                      : 'border-border text-muted-foreground hover:border-destructive/50 hover:bg-danger-subtle hover:text-destructive'
                  )}
                >
                  {confirmClear ? 'اضغط للتأكيد' : 'تفريغ السلة'}
                </button>
              )}
            </div>
          }
        />
      </header>

      {lastSale && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-success-subtle/70 px-3.5 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-success-subtle-foreground">
            <Check className="size-3.5 shrink-0" />
            <span className="truncate tabular-nums">
              آخر فاتورة {lastSale.invoiceNo} · {formatCurrency(lastSale.total)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={reprintLast}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold text-success-subtle-foreground hover:bg-background/70"
            >
              <Printer className="size-3.5" />
              إعادة طباعة
            </button>
            <button
              type="button"
              onClick={() => setLastSale(null)}
              className="rounded-md p-1 text-success-subtle-foreground/70 hover:bg-background/70"
              aria-label="إخفاء"
            >
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain',
          !inSheet && 'lg:max-h-[46dvh] xl:max-h-none',
          slimScroll
        )}
      >
        {renderCartLines(inSheet)}
      </div>

      {cart.length > 0 && (
        <footer className="space-y-1.5 border-t-2 border-dashed border-foreground/25 bg-muted/40 px-3.5 py-3 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{cartUnit ? 'الكمية' : 'عدد القطع'}</span>
            <b className="tabular-nums text-foreground">{cartUnit ? formatQtyUnit(totalPieces, cartUnit) : totalPieces}</b>
          </div>
          <div className="flex items-baseline justify-between border-t border-dashed border-foreground/20 pt-2">
            <span className="font-bold">إجمالي السلة</span>
            <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(total)}</span>
          </div>
          {inSheet && (
            <Button
              size="lg"
              className="mt-2 h-12 w-full rounded-xl bg-brand-700 text-base font-extrabold text-white shadow-md hover:bg-brand-800"
              onClick={() => setMobileStep('pay')}
            >
              التالي: الدفع
              <ChevronLeft className="size-5" />
            </Button>
          )}
        </footer>
      )}
      {inSheet && cart.length === 0 && (
        <div className="border-t border-border p-3">
          <Button variant="outline" size="lg" className="h-12 w-full rounded-xl text-base font-bold" onClick={closeCartSheet}>
            رجوع للمنتجات
          </Button>
        </div>
      )}
    </section>
  )

  const quickAmounts = [50, 100, 200, 500, 1000]
  const choiceCls = (active: boolean) =>
    cn(
      'relative flex flex-col items-center justify-center rounded-xl border-2 transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
      active
        ? 'border-brand-600 bg-brand-600/10 font-extrabold text-brand-800 shadow-sm dark:text-brand-200'
        : 'border-foreground/15 bg-card font-bold text-muted-foreground hover:border-foreground/40 hover:text-foreground'
    )
  const checkMark = (
    <span className="absolute end-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand-600 text-white">
      <Check className="size-3" strokeWidth={3} />
    </span>
  )
  const payBtn = cn(
    'rounded-lg border border-foreground/25 bg-card px-3 text-sm font-semibold tabular-nums transition-colors hover:border-foreground/50 hover:bg-muted disabled:opacity-40',
    compact ? 'py-1' : 'py-1.5'
  )
  const payInput = cn(
    compact ? 'h-9 text-base' : 'h-11 text-lg',
    'w-full rounded-xl border border-foreground/25 bg-card shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] placeholder:text-sm placeholder:font-medium placeholder:text-muted-foreground text-center font-extrabold tabular-nums outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'
  )

  const renderPaymentPanel = (inSheet: boolean) => (
    <section className={cn(panelCls, inSheet && 'min-h-0 flex-1 rounded-none border-0 shadow-none')}>
      <header className="border-b border-border px-3.5 py-3">
        <PanelHead n={3} tag="Checkout" title="ادفع" aside={statusChip} />
      </header>

      <div
        ref={payBodyRef}
        className={cn('min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain', compact ? 'p-3' : 'p-3.5', slimScroll)}
      >
        <div
          ref={payInnerRef}
          className={compact ? 'space-y-2' : 'space-y-3'}
          style={
            payFit < 1
              ? {
                  transform: `scale(${payFit})`,
                  transformOrigin: 'top center',
                  width: `${100 / payFit}%`,
                  marginInline: `${-(100 / payFit - 100) / 2}%`,
                  height: payNat * payFit,
                }
              : undefined
          }
        >
        {/* شاشة الكاشير: الإجمالي هو أكبر وأوضح عنصر في الصفحة */}
        <div className={cn('relative overflow-hidden rounded-2xl bg-stone-950 text-stone-50 shadow-md ring-1 ring-black/10 dark:ring-white/10', compact ? 'px-3.5 py-2' : 'px-4 py-3')}>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 start-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl"
          />
          <div className="relative">
            <div className={cn('flex items-center justify-between gap-2 font-semibold text-stone-300', compact ? 'text-xs' : 'text-sm')}>
              <span>الإجمالي المستحق</span>
              <span className="tabular-nums">
                {cart.length} صنف · {formatQtyUnit(totalPieces, cartUnit)}
              </span>
            </div>
            <p className={cn('flex items-baseline gap-2 leading-none tabular-nums text-emerald-300', compact ? 'mt-1' : 'mt-2')}>
              <span className={cn('font-extrabold tracking-tight', compact ? 'text-3xl' : 'text-4xl')}>{formatNumber(Math.round(total * 100) / 100)}</span>
              <span className="text-lg font-bold text-emerald-300/70">جنيه</span>
            </p>
            {!paidFull && (
              <div className={cn('flex items-center justify-between gap-2 border-t border-white/10 text-xs font-semibold tabular-nums', compact ? 'mt-1.5 pt-1.5' : 'mt-3 pt-2.5')}>
                <span className="text-stone-300">مدفوع {formatCurrency(effectivePaid)}</span>
                <span className="text-amber-300">آجل {formatCurrency(remaining)}</span>
              </div>
            )}
            {paidFull && change > 0 && (
              <div className={cn('flex items-center justify-between gap-2 border-t border-white/10 text-sm font-bold tabular-nums', compact ? 'mt-1.5 pt-1.5' : 'mt-3 pt-2.5')}>
                <span className="text-stone-300">الباقي للعميل</span>
                <span className="text-emerald-300">{formatCurrency(change)}</span>
              </div>
            )}
          </div>
        </div>

        {/* العميل */}
        <div className="space-y-1.5">
          {!compact && (
            <p className="text-sm font-bold text-foreground/75">
              العميل <span className="font-medium">(اختياري — مطلوب للبيع الآجل)</span>
            </p>
          )}
          {resolvedCustomer ? (
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-xl border',
                compact ? 'p-1.5' : 'p-2.5',
                resolvedCustomer.balance > 0
                  ? 'border-warning-subtle bg-warning-subtle/60'
                  : 'border-brand-600/30 bg-brand-600/[0.06]'
              )}
            >
              <div className={cn('flex shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background', compact ? 'size-7' : 'size-9')}>
                {resolvedCustomer.name.trim().charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{resolvedCustomer.name}</p>
                <p className="truncate text-xs tabular-nums text-muted-foreground">
                  {resolvedCustomer.phone || 'بدون رقم'}
                  {resolvedCustomer.balance > 0 && (
                    <span className="font-semibold text-destructive">
                      {' '}
                      · عليه {formatCurrency(resolvedCustomer.balance)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomerId(null)
                  setCustomerName('')
                  setCustQuery('')
                }}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="إزالة العميل"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <User className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value)
                  setCustQuery(e.target.value)
                  setCustOpen(true)
                  setSelectedCustomerId(null)
                }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                placeholder={compact ? 'عميل (للآجل) — ابحث بالاسم أو الهاتف' : 'ابحث بالاسم أو رقم الهاتف'}
                className={cn(
                  compact ? 'h-9' : 'h-11',
                  'rounded-xl border-foreground/25 bg-card pr-9 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]',
                  creditNeedsCustomer && 'border-destructive focus-visible:ring-destructive/30'
                )}
              />
              {custOpen && (customerName || customers.length > 0) && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
                  <ul className="max-h-48 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground">
                        لا يوجد عميل بهذا الاسم — هيتسجل البيع بدون عميل
                      </li>
                    ) : (
                      filteredCustomers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedCustomerId(c.id)
                              setCustomerName(c.name)
                              setCustOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-sm hover:bg-accent"
                          >
                            <span>{c.name}</span>
                            <span className="flex items-center gap-2 text-xs">
                              {c.balance > 0 && (
                                <span className="tabular-nums text-destructive">
                                  عليه {formatCurrency(c.balance)}
                                </span>
                              )}
                              {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
          {typedUnknownCustomer && (
            <p className="text-xs text-muted-foreground">
              العميل ده مش مسجّل — اختاره من القائمة عشان يتربط بالفاتورة.
            </p>
          )}
        </div>

        {/* وسيلة الدفع: بتحدد الدرج اللي الفلوس دخلت فيه
            (انستاباي وفوري اتشالوا من الكاشير بطلب صاحب المحل) */}
        <div className="space-y-1.5">
          {!compact && <p className="text-sm font-bold text-foreground/75">وسيلة الدفع</p>}
          <div role="radiogroup" aria-label="وسيلة الدفع" className="grid grid-cols-2 gap-2">
            {[
              { v: 'cash', label: 'كاش', icon: Banknote },
              { v: 'vodafone_cash', label: 'محفظة', icon: Wallet },
            ].map((m) => {
              const active = paymentMethod === m.v
              return (
                <button
                  key={m.v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPaymentMethod(m.v)}
                  className={cn(choiceCls(active), 'flex-row gap-2', compact ? 'h-9 text-sm' : 'h-11 text-base')}
                >
                  {active && checkMark}
                  <m.icon className="size-5" />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* نوع الدفع: كامل / جزئي (الباقي آجل) */}
        <div className="space-y-1.5">
          {!compact && <p className="text-sm font-bold text-foreground/75">نوع الدفع</p>}
          <div role="radiogroup" aria-label="نوع الدفع" className="grid grid-cols-2 gap-2">
            {[
              { full: true, label: 'سداد كامل' },
              { full: false, label: 'سداد جزئي' },
            ].map((m) => {
              const active = paidFull === m.full
              return (
                <button
                  key={m.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setPaidFull(m.full)
                    setPaidAmount(m.full ? 0 : total)
                  }}
                  className={cn(choiceCls(active), 'flex-row gap-2', compact ? 'h-9 text-sm' : 'h-11 text-base')}
                >
                  {active && checkMark}
                  <span className="whitespace-nowrap">{m.label}</span>
                </button>
              )
            })}
          </div>
          {/* الشرح سطر واحد تحت الاختيارين (بدل سطر ثاني داخل كل زر كان بيلزق في الحد) */}
          <p className={cn('text-xs font-medium leading-snug text-muted-foreground', compact && 'hidden')}>
            {paidFull
              ? 'العميل بيدفع كامل المبلغ دلوقتي.'
              : 'العميل بيدفع جزء دلوقتي والباقي بيتسجل آجل عليه.'}
          </p>
        </div>

        {paidFull ? (
          <div className="space-y-2">
            <label className={cn('block font-bold text-foreground/75', compact ? 'text-xs' : 'text-sm')} htmlFor="received">
              المبلغ المستلم من العميل <span className="font-medium">(لحساب الباقي)</span>
            </label>
            <NumField
              id="received"
              allowEmpty
              value={received}
              onChange={(n) => setReceived(n)}
              placeholder="اختياري"
              className={payInput}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setReceived(total)}
                disabled={total <= 0}
                className={payBtn}
              >
                المبلغ بالظبط
              </button>
              {Array.from(new Set(quickAmounts.map((st) => Math.ceil(total / st) * st)))
                .filter((a) => a > total + 0.005)
                .sort((x, y) => x - y)
                .slice(0, 3)
                .map((a) => (
                  <button key={a} type="button" onClick={() => setReceived(a)} className={payBtn}>
                    {a}
                  </button>
                ))}
            </div>
            {shortBy > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-subtle px-3 py-2 text-warning-subtle-foreground">
                <AlertTriangle className="size-4 shrink-0" />
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                  المستلم أقل بـ <b className="tabular-nums">{formatCurrency(shortBy)}</b>
                  <span className="block text-xs font-medium opacity-80">سداد كامل = الفاتورة مدفوعة بالكامل</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPaidFull(false)
                    setPaidAmount(typeof received === 'number' ? received : 0)
                  }}
                  className="shrink-0 rounded-lg bg-warning px-2.5 py-1.5 text-xs font-extrabold text-warning-foreground transition-opacity hover:opacity-90"
                >
                  الباقي آجل
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className={cn('block font-bold text-foreground/75', compact ? 'text-xs' : 'text-sm')} htmlFor="paid-amount">
              المبلغ المدفوع دلوقتي
            </label>
            <NumField
              id="paid-amount"
              value={paidAmount}
              onChange={(n) => setPaidAmount(Math.min(total, Math.max(0, n === '' ? 0 : n)))}
              className={payInput}
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 0.25, 0.5, 0.75].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setPaidAmount(Math.round(total * r * 100) / 100)}
                  className={cn(payBtn, 'px-1')}
                >
                  {r === 0 ? 'آجل كله' : `${r * 100}%`}
                </button>
              ))}
            </div>
            {remaining > 0 && !compact && (
              <div className="flex items-center justify-between rounded-xl bg-danger-subtle px-3 py-2.5 text-sm text-danger-subtle-foreground">
                <span className="font-semibold">المتبقي (آجل)</span>
                <span className="font-extrabold tabular-nums">{formatCurrency(remaining)}</span>
              </div>
            )}
            <DueDatePicker value={dueDate} onChange={setDueDate} compact={compact} />
          </div>
        )}
        </div>
      </div>

      {/* Footer: السبب اللي مانع الزر ظاهر جنب الزر */}
      <footer className={cn('space-y-2 border-t border-border bg-card', compact ? 'p-2.5' : 'p-3.5')}>
        {creditNeedsCustomer && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-xs font-medium text-warning-subtle-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {typedUnknownCustomer
              ? 'اختار العميل من القائمة عشان نقدر نسجّل الآجل عليه.'
              : 'البيع بالآجل لازم يكون مرتبط بعميل — اختار عميل فوق.'}
          </p>
        )}
        <Button
          size="lg"
          className={cn(compact ? 'h-11' : 'h-12', 'w-full rounded-xl bg-brand-700 text-base font-extrabold text-white shadow-md hover:bg-brand-800 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none')}
          onClick={checkout}
          disabled={!canCheckout}
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
          {cart.length === 0 ? 'أضف منتجات للبدء' : 'دفع وطباعة الفاتورة'}
          {canCheckout && (
            <kbd className="mr-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-medium xl:inline-block">
              F9
            </kbd>
          )}
        </Button>
      </footer>
    </section>
  )

  /* ────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────── */

  return (
    <div
      ref={rootRef}
      style={isDesktop ? densityVars(scale) : undefined}
      className={cn(
        isFull
          ? 'fixed inset-0 z-40 flex flex-col gap-3 overflow-hidden bg-background p-3'
          : 'space-y-3 pb-24 sm:-m-3 sm:space-y-2 lg:pb-0'
      )}
    >
      <h1 className="sr-only">نقطة البيع</h1>

      <div
        className={cn(
          'grid gap-3',
          'lg:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*95)] lg:grid-rows-[auto_auto]',
          'xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*100)_calc(var(--spacing)*84)] xl:grid-rows-1',
          isFull
            ? 'min-h-0 flex-1 overflow-y-auto xl:overflow-visible'
            : 'xl:h-[calc(100dvh-5.4rem)] xl:min-h-[calc(var(--spacing)*130)]'
        )}
      >
        <div className="flex min-h-0 flex-col lg:row-span-2 xl:row-span-1 [&>section]:flex-1">
          {productsPanel}
        </div>

        {isDesktop && (
          <>
            <div className="flex min-h-0 flex-col [&>section]:flex-1">{renderCartPanel(false)}</div>
            <div className="flex min-h-0 flex-col [&>section]:flex-1">{renderPaymentPanel(false)}</div>
          </>
        )}
      </div>

      {/* Mobile / tablet: sticky checkout bar + bottom sheet with cart & payment */}
      {!isDesktop && (
        <>
          <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40">
            <button
              type="button"
              onClick={openCartSheet}
              className="flex w-full touch-manipulation items-center justify-between gap-3 rounded-2xl bg-stone-950 px-4 py-3.5 text-white shadow-xl ring-1 ring-white/10 active:scale-[0.99]"
            >
              <span className="flex items-center gap-2.5">
                <span className="relative">
                  <ShoppingBag className="size-6" />
                  {cart.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-emerald-400 text-[length:var(--fs-2xs,0.6875rem)] font-extrabold text-stone-950">
                      {cart.length}
                    </span>
                  )}
                </span>
                <span className="text-sm font-bold">
                  {cart.length === 0 ? 'السلة فاضية' : 'عرض السلة والدفع'}
                </span>
              </span>
              <span className="flex items-center gap-1 text-lg font-extrabold tabular-nums text-emerald-300">
                {formatCurrency(total)}
                <ChevronLeft className="size-4 text-stone-400" />
              </span>
            </button>
          </div>

          {/* شيت بخطوتين (السلة ← الدفع): الهيدر والفوتر ثابتين، والقايمة بس هي اللي بتتمرّر جواه */}
          <Sheet open={cartSheetOpen} onOpenChange={(o) => (o ? openCartSheet() : closeCartSheet())}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="h-[92dvh] max-h-[92dvh] gap-0 overflow-hidden rounded-t-3xl bg-background p-0 sm:mx-auto sm:max-w-lg"
            >
              <SheetTitle className="sr-only">السلة والدفع</SheetTitle>
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2">
                <button
                  type="button"
                  onClick={mobileStep === 'pay' ? () => setMobileStep('cart') : closeCartSheet}
                  className="flex h-10 touch-manipulation items-center gap-1 rounded-xl px-3 text-sm font-bold active:bg-muted"
                >
                  <ChevronRight className="size-5" />
                  {mobileStep === 'pay' ? 'السلة' : t('المنتجات')}
                </button>
                <div role="tablist" aria-label="خطوات الفاتورة" className="mx-auto flex items-center gap-1 rounded-full bg-muted p-1">
                  {(
                    [
                      { k: 'cart', n: 2, label: 'السلة' },
                      { k: 'pay', n: 3, label: 'الدفع' },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.k}
                      type="button"
                      role="tab"
                      aria-selected={mobileStep === st.k}
                      disabled={st.k === 'pay' && cart.length === 0}
                      onClick={() => setMobileStep(st.k)}
                      className={cn(
                        'flex h-8 touch-manipulation items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-colors disabled:opacity-40',
                        mobileStep === st.k ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground'
                      )}
                    >
                      <span className="tabular-nums">{st.n}</span>
                      {st.label}
                    </button>
                  ))}
                </div>
                <div className="w-[92px]" aria-hidden />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                {mobileStep === 'cart' ? renderCartPanel(true) : renderPaymentPanel(true)}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Variant picker */}
      <POSVariantPickerDialog
        open={variantPickerOpen}
        onOpenChange={(o) => {
          setVariantPickerOpen(o)
          if (!o) {
            setVariantPickerProduct(null)
            setVariantPickerVariants([])
            setVariantPickerUnits([])
          }
        }}
        productName={variantPickerProduct?.name}
        variants={variantPickerVariants}
        onPick={handleVariantPick}
      />

      <ProductDialog
        open={productDlgOpen}
        onOpenChange={setProductDlgOpen}
        initial={productInitial}
        categories={categories.map((c) => ({ id: Number(c.id), name: c.name }))}
        onSaved={() => {
          setProductDlgOpen(false)
          setProductInitial(null)
          detailsCache.current.clear()
          barcodeCache.current.clear()
          gridCache.current.clear()
          setRefreshTick((t) => t + 1)
        }}
      />
    </div>
  )
}
