'use client'

import * as React from 'react'
import { BadgeInfo, ChevronDown, Laptop, Loader2, Package, Plug, Plus, Search, ShieldCheck, Shirt, Smartphone, Sparkles, Trash2, Dices, Wand2, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { withDataBatch } from '@/lib/offline/data-events'
import { useShopStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useConfirm } from './ConfirmDialogProvider'
import { DialogHero, Field, IconBtn, INK_INPUT, InkInput, LockedNote, SectionTitle } from './product-dialog-ui'
import { INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
import { parseVariantText } from '@/lib/variantParser'
import { fetchUniqueBarcode, fetchUniqueBarcodes } from '@/lib/barcode-client'
import { Swatch, normAr } from '@/lib/color-swatch'
import { groupByColor } from '@/lib/variant-sort'
import { normalizeBarcode } from '@/lib/barcode'
import { parseElectronicsText } from '@/lib/electronicsParser'
import {
  EMPTY_LAPTOP_SPEC, KIND_META, LAPTOP_CPU_CHIPS, LAPTOP_HDD_CHIPS, LAPTOP_STORAGE_CHIPS, SCREEN_HZ_CHIPS, SCREEN_RES_CHIPS, PHONE_COLOR_CHIPS, RAM_CHIPS, STORAGE_CHIPS,
  composeLaptopConfig, composePhoneSpec, detectElectronicsKind, type ElectronicsKind,
} from '@/lib/electronics-variants'
import { CONDITION_LABEL, type VariantCondition } from '@/lib/variant-condition'
import {
  BOX_LABEL, BOX_SHORT, EDITION_CHIPS, MAX_WARRANTY_MONTHS, UNIT_STATUS_LABEL,
  isIphoneDevice, normalizeImei, warrantyLabel, type BoxCondition, type UnitStatus,
} from '@/lib/variant-device'
import { cleanSuggestionValue, normalizeSuggestionKey, type SuggestionKind } from '@/lib/variant-suggestions'
import { highlightParts, loadHardwareDictionary, resolveExact, searchDictionary, type DictEntry, type HardwareDictionary } from '@/lib/hardware-dictionary'

interface Suggestion { id: number; value: string }

const BRAND_PILL: Record<string, string> = {
  Intel: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  AMD: 'bg-red-500/10 text-red-700 dark:text-red-300',
  Nvidia: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Apple: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
}

/** كلمات عامة في الأسماء الطويلة — بتتخفّف عشان رقم الموديل هو اللي يبان («GeForce RTX 2060 Mobile») */
const NOISE_RE = /(GeForce|Radeon|Laptop GPU|Mobile|Core|Intel|AMD|Apple)/g
function NameText({ text }: { text: string }) {
  return (
    <>
      {text.split(NOISE_RE).map((seg, i) =>
        i % 2 === 1 ? ( // split بمجموعة التقاط: العناصر الفردية هي الكلمات العامة
          <span key={i} className="font-normal text-foreground/50">{seg}</span>
        ) : (
          <span key={i}>{seg}</span>
        ),
      )}
    </>
  )
}

/**
 * 📱 التحديث 32: خانة كتابة مع قايمة قاموس عايمة (المعالج / كارت الشاشة).
 * - قايمة فوق المحتوى (مش بتزق حاجة) وبتظهر والخانة متفعّلة بس.
 * - تنقّل بالكيبورد: ↑ ↓ للتحريك · Enter للاختيار — وأول نتيجة متحدّدة تلقائي.
 * - الجزء المطابق لللي كتبته مُبرّز، وكل نتيجة عليها الشركة (Intel/AMD/Nvidia/Apple) ونوعها (لابتوب/مكتبي).
 * onMouseDown بيمنع فقدان الفوكس قبل ما الضغطة تتسجّل.
 */
function DictField({
  id, placeholder, value, onChange, entries, ownValues, onPick, label,
}: {
  id: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  entries?: DictEntry[]
  ownValues: string[]
  onPick: (v: string) => void
  label: string
}) {
  const [focused, setFocused] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const listRef = React.useRef<HTMLUListElement>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  // القايمة بتفتح لتحت، ولو المساحة تحت ضيقة (آخر الدايلوج) وفوق أوسع بتفتح لفوق — ومالهاش أبدًا تتقطع تحت الفوتر
  const [place, setPlace] = React.useState<{ above: boolean; maxH: number }>({ above: false, maxH: 288 })
  const hits = React.useMemo(() => {
    if (!entries) return []
    const own = new Set(ownValues.map(normalizeSuggestionKey))
    const typed = normalizeSuggestionKey(value)
    return searchDictionary(entries, value, 10).filter(
      (e) => !own.has(normalizeSuggestionKey(e.name)) && normalizeSuggestionKey(e.name) !== typed,
    )
  }, [entries, ownValues, value])
  React.useEffect(() => { setActive(0) }, [value])
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const open = focused && hits.length > 0
  React.useLayoutEffect(() => {
    if (!open || !wrapRef.current) return
    const w = wrapRef.current.getBoundingClientRect()
    const dlg = wrapRef.current.closest('[role="dialog"]')?.getBoundingClientRect()
    const top = (dlg?.top ?? 0) + 112 // هيدر الدايلوج
    const bottom = (dlg?.bottom ?? window.innerHeight) - 96 // فوتر الدايلوج
    const below = bottom - w.bottom - 16
    const above = w.top - top - 16
    const wantAbove = below < 300 && above > below
    setPlace({ above: wantAbove, maxH: Math.max(160, Math.min(320, wantAbove ? above : below) - 40) })
  }, [open, hits.length])
  const pick = (name: string) => { onPick(name); setFocused(false) }
  const listId = `${id}-list`
  return (
    <div className="relative" ref={wrapRef}>
      <InkInput
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        className="pe-10"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length) }
          else if (e.key === 'Enter') { e.preventDefault(); const h = hits[active]; if (h) pick(h.name) }
        }}
      />
      <Search className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground/40" aria-hidden />
      {open && (
        <div className={cn('absolute inset-x-0 z-30 overflow-hidden rounded-2xl border border-foreground/15 bg-card shadow-2xl ring-1 ring-black/5', place.above ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>
          <div className="flex items-center justify-between bg-muted/50 px-3.5 py-1.5 text-[11px] font-bold text-foreground/60">
            <span>{label}</span>
            <span className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1"><kbd className="rounded border bg-background px-1 font-sans text-[10px]" dir="ltr">↑↓</kbd> تنقّل</span>
              <span className="flex items-center gap-1"><kbd className="rounded border bg-background px-1 font-sans text-[10px]" dir="ltr">Enter</kbd> اختيار</span>
            </span>
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} style={{ maxHeight: place.maxH }} className="overflow-y-auto overflow-x-hidden">
            {hits.map((e, i) => (
              <li key={e.name} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  data-active={i === active}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(e.name)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-s-[3px] px-3.5 py-2.5 text-start last:border-b-0',
                    i === active ? 'border-s-foreground bg-foreground/[0.07]' : 'border-s-transparent hover:bg-muted/50',
                  )}
                >
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-foreground/90">
                    {highlightParts(e.name, value).map((p, k) =>
                      p.hit ? (
                        <mark key={k} className="rounded-sm bg-foreground/10 px-0.5 font-extrabold text-foreground">{p.text}</mark>
                      ) : (
                        <NameText key={k} text={p.text} />
                      ),
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide', BRAND_PILL[e.brand] ?? 'bg-muted text-foreground/70')}>
                      {e.brand}
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/60">
                      {e.dev === 'd' ? 'مكتبي' : e.dev === 'l' ? 'لابتوب' : 'لابتوب / مكتبي'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * 📱 التحديث 31: اقتراحات المعالج/كارت الشاشة — اللي المحل كتبه قبل كده (خاصة بالمحل).
 * بتتفلتر بالكتابة، وفيها × صغيرة لحذف اقتراح غلط. الاقتراحات الجاهزة (presets) بتظهر بس لو المحل لسه معندوش اقتراحات.
 */
function SuggestChips({
  items, presets, value, onPick, onDelete, label,
}: {
  items: Suggestion[]
  presets?: string[]
  value: string
  onPick: (v: string) => void
  onDelete: (s: Suggestion) => void
  label: string
}) {
  const q = normalizeSuggestionKey(value)
  const own = items.filter((x) => !q || normalizeSuggestionKey(x.value).includes(q)).slice(0, 12)
  const showPresets = items.length === 0 && !!presets?.length
  if (!showPresets && own.length === 0) return null
  const chip = 'h-8 shrink-0 whitespace-nowrap rounded-full border text-xs font-bold transition-colors'
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {showPresets
        ? presets!.map((c) => {
            const on = normalizeSuggestionKey(value) === normalizeSuggestionKey(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => onPick(on ? '' : c)}
                aria-pressed={on}
                className={cn(chip, 'px-3', on ? 'border-foreground bg-foreground text-background' : 'bg-background hover:border-foreground/60 hover:bg-muted/60')}
              >
                {c}
              </button>
            )
          })
        : own.map((sg) => {
            const on = normalizeSuggestionKey(value) === normalizeSuggestionKey(sg.value)
            return (
              <span
                key={sg.id}
                className={cn(chip, 'inline-flex items-center overflow-hidden', on ? 'border-foreground bg-foreground text-background' : 'bg-background')}
              >
                <button
                  type="button"
                  onClick={() => onPick(on ? '' : sg.value)}
                  aria-pressed={on}
                  className={cn('h-full ps-3 pe-2', !on && 'hover:bg-muted/60')}
                >
                  {sg.value}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(sg)}
                  aria-label={`حذف الاقتراح ${sg.value}`}
                  className={cn('grid h-full w-7 place-items-center', on ? 'hover:bg-background/20' : 'text-foreground/45 hover:bg-destructive/10 hover:text-destructive')}
                >
                  <span aria-hidden className="text-sm leading-none">×</span>
                </button>
              </span>
            )
          })}
    </div>
  )
}

/** صف معاينة المساعد الذكي — الحالة للإلكترونيات بس (الملابس دايمًا null) */
interface PreviewRow {
  color: string | null
  size: string | null
  condition: VariantCondition | null
  quantity: number
}

const KIND_ICON = { phone: Smartphone, laptop: Laptop, other: Plug } as const

/** شيبس اختيار سريعة — زر بيتعلّم لما يكون مختار */
function ChipRow({ items, value, onPick, label }: { items: string[]; value: string; onPick: (v: string) => void; label: string }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {items.map((c) => {
        const on = value.trim().toLowerCase() === c.toLowerCase()
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(on ? '' : c)}
            aria-pressed={on}
            className={cn(
              'h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-bold transition-colors',
              on ? 'border-foreground bg-foreground text-background' : 'bg-background hover:border-foreground/60 hover:bg-muted/60',
            )}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}

/** اختيار الحالة: جديد / مستعمل / (بدون تحديد) */
function ConditionPick({ value, onChange }: { value: '' | VariantCondition; onChange: (v: '' | VariantCondition) => void }) {
  const opts: { v: '' | VariantCondition; t: string }[] = [
    { v: 'new', t: CONDITION_LABEL.new },
    { v: 'used', t: CONDITION_LABEL.used },
  ]
  return (
    <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border bg-background p-1" role="radiogroup" aria-label="الحالة">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(value === o.v ? '' : o.v)}
          className={cn(
            'flex w-auto flex-auto items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-bold transition-colors',
            value === o.v ? 'bg-foreground text-background shadow-sm' : 'text-foreground/70 hover:bg-foreground/10 hover:text-foreground',
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  )
}

/** 📱 التحديث 33: اختيار الكرتونة والملحقات — بالكرتونة الكاملة / الجهاز بس / (بدون تحديد) */
function BoxPick({ value, onChange }: { value: '' | BoxCondition; onChange: (v: '' | BoxCondition) => void }) {
  const opts: { v: BoxCondition; t: string }[] = [
    { v: 'full', t: BOX_LABEL.full },
    { v: 'device', t: BOX_LABEL.device },
  ]
  return (
    <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border bg-background p-1" role="radiogroup" aria-label="الكرتونة والملحقات">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(value === o.v ? '' : o.v)}
          className={cn(
            'flex w-auto flex-auto items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-center text-[13px] font-bold transition-colors',
            value === o.v ? 'bg-foreground text-background shadow-sm' : 'text-foreground/70 hover:bg-foreground/10 hover:text-foreground',
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  )
}

/** 📱 التحديث 34: بطاقة إحصائية في تاب الأجهزة — والضغط عليها بيفلتر بالحالة */
function UnitStatCard({ n, t, active, tone, onClick }: { n: number; t: string; active: boolean; tone?: 'ok' | 'muted'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-2xl border bg-card px-3 py-2.5 text-center transition-colors',
        active ? 'border-foreground ring-2 ring-foreground/15' : 'hover:border-foreground/40',
      )}
    >
      <span className={cn('block text-xl font-extrabold leading-none tabular-nums', tone === 'ok' ? 'text-success-subtle-foreground' : tone === 'muted' ? 'text-foreground/55' : '')}>{n}</span>
      <span className="mt-1 block text-[11px] font-bold text-foreground/65">{t}</span>
    </button>
  )
}

export interface ProductVariant {
  id: number
  productId: number
  size: string | null
  color: string | null
  barcode: string | null
  /** 💰 التحديث 28: سعر المواصفة — null = سعر المنتج العام */
  price: number | null
  /** 📱 التحديث 30: حالة الجهاز — new / used / null (غير محددة) */
  condition: string | null
  /** 📱 التحديث 33: الضمان المتبقي بالشهور — null = مش محدد (موبايل/تابلت بس) */
  warrantyMonths: number | null
  /** 📱 التحديث 33: الكرتونة والملحقات — full / device / null (موبايل/تابلت بس) */
  boxCondition: string | null
  /** 📱 التحديث 33: الإصدار/النسخة — نص حر (موبايل/تابلت بس) */
  edition: string | null
  quantity: number
}

/** 📱 التحديث 33: جهاز فردي جوه المتغير — IMEI/سيريال + صحة البطارية (للآيفون بس) */
interface VariantUnitRow {
  id: number
  variantId: number
  imei: string
  batteryHealth: number | null
  note: string | null
  status: string
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: { id: number; name: string } | null
  onChanged?: () => void
}

export function ProductVariantsDialog({ open, onOpenChange, product, onChanged }: Props) {
  const confirm = useConfirm()
  // 📱 التحديث 28: في محلات الإلكترونيات (موبايلات/كمبيوتر) الخانتين بتتعرضوا
  // باسم «المواصفة 1 / المواصفة 2» بدل اللون/المقاس — نفس الأعمدة بالظبط
  // (المواصفة 1 = عمود اللون — اللي بيتجمع عليه في نقطة البيع، والمواصفة 2 = عمود المقاس).
  const businessType = useShopStore((s) => s.plan.businessType)
  const isElectronics = businessType === 'electronics'
  // 📱 التحديث 30: الإلكترونيات ليها «نوع» (موبايل / لابتوب / إكسسوار) بيحدد أسماء الخانتين —
  // بيتحدد تلقائيًا من اسم المنتج وتقدر تغيّره. التخزين نفسه ثابت (opt1 = عمود color، opt2 = عمود size).
  const [kind, setKind] = React.useState<ElectronicsKind>(() => detectElectronicsKind(product?.name))
  const meta = KIND_META[kind]
  const opt1Label = isElectronics ? meta.opt1 : 'اللون'
  const opt2Label = isElectronics ? meta.opt2 : 'المقاس'
  const noOpt1Label = isElectronics ? meta.noOpt1 : 'بدون لون'
  const opt2Unit = isElectronics ? meta.opt2Unit : 'مقاس'
  const KindIcon = isElectronics ? KIND_ICON[kind] : Shirt
  const [vq, setVq] = React.useState('')
  const [variants, setVariants] = React.useState<ProductVariant[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<{ size: string; color: string; barcode: string; quantity: number; price: string; condition: '' | VariantCondition; warrantyMonths: string; boxCondition: '' | BoxCondition; edition: string }>({ size: '', color: '', barcode: '', quantity: 0, price: '', condition: '', warrantyMonths: '', boxCondition: '', edition: '' })
  // مكوّنات «السعة/الكونفيج» للإلكترونيات — بتتجمّع في form.color وقت الإضافة
  const [spec, setSpec] = React.useState({ ...EMPTY_LAPTOP_SPEC })
  // 📱 التحديث 31: اقتراحات المعالج وكارت الشاشة (خاصة بالمحل)
  const [sugs, setSugs] = React.useState<Record<SuggestionKind, Suggestion[]>>({ cpu: [], gpu: [] })
  React.useEffect(() => {
    if (!open || !isElectronics || kind !== 'laptop') return
    let cancelled = false
    void Promise.all([
      api<Suggestion[]>('/api/variant-suggestions?kind=cpu').catch(() => [] as Suggestion[]),
      api<Suggestion[]>('/api/variant-suggestions?kind=gpu').catch(() => [] as Suggestion[]),
    ]).then(([cpu, gpu]) => {
      if (!cancelled) setSugs({ cpu: Array.isArray(cpu) ? cpu : [], gpu: Array.isArray(gpu) ? gpu : [] })
    })
    return () => { cancelled = true }
  }, [open, isElectronics, kind])
  // 📱 التحديث 32: القاموس بيتحمّل lazy أول ما تفتح تاب اللابتوب (فشله مايعطّلش حاجة — الكتابة الحرة شغالة)
  const [hw, setHw] = React.useState<HardwareDictionary | null>(null)
  React.useEffect(() => {
    if (!open || !isElectronics || kind !== 'laptop' || hw) return
    let cancelled = false
    loadHardwareDictionary().then((d) => { if (!cancelled) setHw(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [open, isElectronics, kind, hw])
  const deleteSuggestion = async (k: SuggestionKind, sg: Suggestion) => {
    try {
      await api('/api/variant-suggestions', { method: 'DELETE', body: { id: sg.id } })
      setSugs((p) => ({ ...p, [k]: p[k].filter((x) => x.id !== sg.id) }))
    } catch (e: any) {
      toast.error(e?.message || 'فشل حذف الاقتراح')
    }
  }
  /** القيمة بالشكل المحفوظ لو موجودة (i7-8550h → I7-8550H اللي اتكتب أول مرة) */
  const canonicalOf = (k: SuggestionKind, raw: string) => {
    const v = cleanSuggestionValue(raw)
    if (!v) return ''
    const hit = sugs[k].find((x) => normalizeSuggestionKey(x.value) === normalizeSuggestionKey(v))
    if (hit) return hit.value
    // اسم/اسم بديل لموديل واحد في القاموس («i7 8550u» أو «جي فورس 710») → الاسم الرسمي
    const official = hw ? resolveExact(hw[k], v) : null
    return official ?? v
  }
  const rememberSuggestion = async (k: SuggestionKind, raw: string) => {
    const v = cleanSuggestionValue(raw)
    if (!v || sugs[k].some((x) => normalizeSuggestionKey(x.value) === normalizeSuggestionKey(v))) return
    try {
      const created = await api<Suggestion>('/api/variant-suggestions', { method: 'POST', body: { kind: k, value: v } })
      if (created?.id) setSugs((p) => (p[k].some((x) => x.id === created.id) ? p : { ...p, [k]: [created, ...p[k]] }))
    } catch { /* الاقتراح تحسين بس — فشله مايعطّلش الإضافة */ }
  }
  const [smartText, setSmartText] = React.useState('')
  const [preview, setPreview] = React.useState<PreviewRow[] | null>(null)
  const [previewWarnings, setPreviewWarnings] = React.useState<string[]>([])
  const [bulkSaving, setBulkSaving] = React.useState(false)
  const [generatingId, setGeneratingId] = React.useState<number | null>(null)
  const [bulkGenerating, setBulkGenerating] = React.useState(false)
  // أقسام الألوان المفتوحة يدويًا (الافتراضي: مقفولة) + خانة «كمية اللون كله» لكل لون
  const [openColors, setOpenColors] = React.useState<Set<string>>(() => new Set())
  const [colorQty, setColorQty] = React.useState<Record<string, string>>({})
  // 💰 مسودّات تعديل السعر لكل صف (فاضي في الماب = نعرض القيمة المحفوظة)
  const [priceDraft, setPriceDraft] = React.useState<Record<number, string>>({})
  const [applyingColor, setApplyingColor] = React.useState<string | null>(null)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('variants')

  // 📱 التحديث 33: بيانات جهاز الموبايل/التابلت — تظهر في تاب «موبايل/تابلت» بس
  // (اللابتوب/الكمبيوتر والإكسسوارات ملهمش علاقة بالضمان/الكرتونة/النسخة/IMEI)
  const showDeviceFields = isElectronics && kind === 'phone'
  // 🔋 نسبة صحة البطارية: للآيفون بس (من اسم المنتج)
  const isIphone = showDeviceFields && isIphoneDevice(product?.name)
  // أجهزة المتغيرات (IMEI) — محملة لكل المنتج ومقسمة على المتغيرات
  const [units, setUnits] = React.useState<VariantUnitRow[]>([])
  const [unitBatteryDraft, setUnitBatteryDraft] = React.useState<Record<number, string>>({})
  const [removingUnit, setRemovingUnit] = React.useState<number | null>(null)
  // 📱 مسودّات تعديل الضمان/النسخة من لوحة الجهاز (فاضي في الماب = نعرض القيمة المحفوظة)
  const [deviceDraft, setDeviceDraft] = React.useState<Record<number, { warrantyMonths?: string; edition?: string }>>({})
  // 📱 التحديث 35 (2026-11-07): نفس تاب «أجهزة المنتج (IMEI)» — بس من غير اللصق المجمّع
  // اللي بييلخبط: تسجيل جهاز واحد زي الوضع القديم بالظبط (خانة IMEI + زرار تسجيل).
  const [tab, setTab] = React.useState<'variants' | 'devices'>('variants')
  const [devQuery, setDevQuery] = React.useState('')
  const [devStatus, setDevStatus] = React.useState<'' | UnitStatus>('')
  const [devVariant, setDevVariant] = React.useState<number | ''>('')
  // 📱 فورم تسجيل جهاز واحد: المتغير (لو فيه أكتر من متغير) + IMEI + البطارية للآيفون بس
  const [newUnitVariant, setNewUnitVariant] = React.useState<number | ''>('')
  const [newImei, setNewImei] = React.useState('')
  const [newBattery, setNewBattery] = React.useState('')
  const [addingUnit, setAddingUnit] = React.useState(false)
  const bodyRef = React.useRef<HTMLDivElement | null>(null)
  // 🖱️ إصلاح عجلة الماوس: السكرول كان بيشتغل بس لما المؤشر يبقى على شريط التمرير.
  // السبب إن قفل السكرول بتاع Radix (react-remove-scroll) بيلغي حدث الـ wheel لما يبقى
  // الهدف عنصر جوه الجسم (كروت/جداول overflow-hidden). بنمسك الـ wheel بنفسنا على
  // جسم الدايلوج ونسكرول أقرب حاوية تقدر تتحرك في الاتجاه ده (القوائم الداخلية الأول).
  const wheelCleanup = React.useRef<(() => void) | null>(null)
  const attachBody = React.useCallback((node: HTMLDivElement | null) => {
    wheelCleanup.current?.()
    wheelCleanup.current = null
    bodyRef.current = node
    if (!node) return
    const canScroll = (el: HTMLElement, dy: number) => {
      const oy = getComputedStyle(el).overflowY
      if (oy !== 'auto' && oy !== 'scroll') return false
      if (el.scrollHeight <= el.clientHeight + 1) return false
      return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1
    }
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * node.clientHeight : e.deltaY
      let el = e.target instanceof HTMLElement ? e.target : null
      while (el) {
        if (canScroll(el, dy)) {
          el.scrollTop += dy
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (el === node) return
        el = el.parentElement
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    wheelCleanup.current = () => node.removeEventListener('wheel', onWheel)
  }, [])
  React.useEffect(() => () => wheelCleanup.current?.(), [])
  React.useEffect(() => {
    // تغيير التاب بيرجّع السكرول لأول الصفحة — عشان المحتوى الجديد يبان من فوق
    bodyRef.current?.scrollTo({ top: 0 })
  }, [tab])
  const unitsByVariant = React.useMemo(() => {
    const m = new Map<number, VariantUnitRow[]>()
    for (const u of units) {
      const arr = m.get(u.variantId)
      if (arr) arr.push(u)
      else m.set(u.variantId, [u])
    }
    return m
  }, [units])

  // ─── 📱 التحديث 34: منطق تاب الأجهزة ───
  const variantById = React.useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants])
  const unitsStats = React.useMemo(() => {
    const sold = units.filter((u) => u.status === 'sold').length
    return { total: units.length, inStock: units.length - sold, sold }
  }, [units])
  const shownUnits = React.useMemo(() => {
    const q = devQuery.trim().toLowerCase()
    const qAr = normAr(devQuery)
    return units.filter((u) => {
      if (devStatus && u.status !== devStatus) return false
      if (devVariant !== '' && u.variantId !== devVariant) return false
      if (!q) return true
      const v = variantById.get(u.variantId)
      const texts = [u.imei, v?.size, v?.color, v?.edition, v?.barcode]
      return texts.some((x) => {
        const t = (x ?? '').toLowerCase()
        return t.includes(q) || (qAr !== '' && normAr(t).includes(qAr))
      })
    })
  }, [units, devQuery, devStatus, devVariant, variantById])

  /** فتح تاب الأجهزة متفلتر على متغير معين (زرار IMEI في جدول المتغيرات) —
   * وفورم التسجيل تحت بيتجهّز على نفس المتغير عشان تسجّل على طول. */
  const openDevicesForVariant = (variantId: number) => {
    setTab('devices')
    setDevVariant(variantId)
    setDevQuery('')
    setDevStatus('')
    setNewUnitVariant(variantId)
  }

  /** 📱 التحديث 35: تسجيل جهاز واحد زي الوضع القديم — خانة IMEI واحدة + زرار تسجيل.
   * لو فيه متغير واحد بيتسجل عليه على طول، ولو أكتر بنتختار من القايمة.
   * البطارية للآيفون بس، والمكرر في المحل كله السيرفر بيرفضه تلقائي. */
  const addUnit = async () => {
    if (!product) return
    const targetVariant = newUnitVariant !== '' ? newUnitVariant : variants.length === 1 ? variants[0]?.id ?? null : null
    if (targetVariant == null) {
      toast.error('اختار المتغير الأول')
      return
    }
    const chk = normalizeImei(newImei)
    if (!chk.ok) {
      toast.error(chk.error)
      return
    }
    setAddingUnit(true)
    try {
      const created = await api<VariantUnitRow>(`/api/products/${product.id}/variant-units`, {
        method: 'POST',
        body: {
          variantId: targetVariant,
          imei: chk.imei,
          batteryHealth: isIphone && newBattery.trim() !== '' ? newBattery.trim() : null,
        },
      })
      setUnits((prev) => [...prev, created])
      setNewImei('')
      setNewBattery('')
      toast.success('تم تسجيل الجهاز')
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل الجهاز')
    } finally {
      setAddingUnit(false)
    }
  }

  // All barcodes already used by this product's variants — passed to the
  // generator so a freshly-made code never collides with one already saved.
  const existingBarcodes = React.useMemo(
    () => new Set(variants.map((v) => v.barcode).filter((b): b is string => !!b)),
    [variants]
  )

  const load = React.useCallback(async () => {
    if (!product) return
    setLoading(true)
    try {
      // 📱 التحديث 33: الأجهزة (IMEI) بتتحمل مع المتغيرات — فشلها مبيعطلش الدايلوج
      const [data, u] = await Promise.all([
        api<ProductVariant[]>(`/api/products/${product.id}/variants`),
        api<VariantUnitRow[]>(`/api/products/${product.id}/variant-units`).catch(() => [] as VariantUnitRow[]),
      ])
      setVariants(data)
      setUnits(Array.isArray(u) ? u : [])
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المتغيرات')
    } finally {
      setLoading(false)
    }
  }, [product])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  React.useEffect(() => {
    if (open) {
      setOpenColors(new Set())
      setColorQty({})
      setPriceDraft({})
      setVq('')
      setKind(detectElectronicsKind(product?.name))
      setSpec({ ...EMPTY_LAPTOP_SPEC })
      setPreview(null)
      setSmartText('')
      // 📱 التحديث 35: تصفير بيانات الجهاز + فورم التسجيل + تاب العرض والفلاتر
      setUnitBatteryDraft({})
      setDeviceDraft({})
      setUnits([])
      setTab('variants')
      setDevQuery('')
      setDevStatus('')
      setDevVariant('')
      setNewUnitVariant('')
      setNewImei('')
      setNewBattery('')
      setAddingUnit(false)
    }
  }, [open, product?.id, product?.name])

  const analyzeSmartText = () => {
    if (!smartText.trim()) return
    if (isElectronics) {
      const r = parseElectronicsText(smartText, kind)
      setPreview(r.rows.map((x) => ({ color: x.opt1, size: x.opt2, condition: x.condition, quantity: x.quantity })))
      setPreviewWarnings(r.warnings)
      return
    }
    const result = parseVariantText(smartText, product?.name)
    setPreview(result.variants.map((v) => ({ ...v, condition: null })))
    setPreviewWarnings(result.warnings)
  }

  const updatePreviewQty = (index: number, quantity: number) => {
    setPreview((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, quantity } : r)) : prev))
  }

  const removePreviewRow = (index: number) => {
    setPreview((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  const addAllPreviewRows = async () => {
    if (!product || !preview || preview.length === 0) return
    setBulkSaving(true)
    let okCount = 0
    let failCount = 0
    let firstError = ''
    // Track codes as we hand them out so two rows in the same batch can
    // never collide, on top of not reusing any barcode this product
    // already has.
    const usedBarcodes = new Set(existingBarcodes)
    const freshCodes = await fetchUniqueBarcodes(preview.length, usedBarcodes)
    // كل الإضافات جوه batch → الشاشات اللي ورا بتتحدّث مرة واحدة في الآخر مش 18 مرة
    await withDataBatch(async () => {
      for (const [rowIdx, row] of preview.entries()) {
        const barcode = freshCodes[rowIdx]
        usedBarcodes.add(barcode)
        try {
          await api(`/api/products/${product.id}/variants`, {
            method: 'POST',
            body: {
              size: row.size,
              color: row.color,
              condition: row.condition,
              barcode,
              quantity: row.quantity || 0,
            },
          })
          okCount++
        } catch (e: any) {
          failCount++
          // نحتفظ بأول رسالة خطأ حقيقية من السيرفر بدل التخمين
          if (!firstError) firstError = String(e?.body?.error ?? e?.message ?? '').trim()
        }
      }

    })
    setBulkSaving(false)
    if (okCount) toast.success(`تمت إضافة ${okCount} متغير`)
    if (failCount) toast.error(`فشلت إضافة ${failCount} متغير${firstError ? ` — ${firstError}` : ' (تكرار باركود أو خطأ)'}`, { duration: 9000 })
    setPreview(null)
    setSmartText('')
    await load()
    onChanged?.()
  }

  const addVariant = async () => {
    if (!product) return
    // 📱 التحديث 30: الإلكترونيات — «السعة/الكونفيج» بتتركّب من المكوّنات (أو من الخانة الحرة للإكسسوار)
    const color1 = isElectronics
      ? kind === 'phone'
        ? composePhoneSpec(spec.ram, spec.storage)
        : kind === 'laptop'
          ? composeLaptopConfig({ ...spec, cpu: canonicalOf('cpu', spec.cpu), gpu: canonicalOf('gpu', spec.gpu) })
          : form.color.trim()
      : form.color.trim()
    if (!form.size.trim() && !color1) {
      toast.error(`لازم ${opt2Label} أو ${opt1Label} على الأقل`)
      return
    }
    // 💰 التحديث 28: السعر اختياري — فاضي = سعر المنتج العام
    const priceRaw = form.price.trim()
    let price: number | null = null
    if (priceRaw !== '') {
      price = Number(priceRaw.replace(/,/g, '.'))
      if (!Number.isFinite(price) || price < 0) {
        toast.error('السعر لازم يكون رقم صالح')
        return
      }
      price = Math.round(price * 100) / 100
    }
    setSaving(true)
    try {
      // 📱 التحديث 33: بيانات جهاز الموبايل/التابلت — بتتبعت في تاب الموبايل بس
      let warrantyMonths: number | null = null
      if (showDeviceFields && form.warrantyMonths.trim() !== '') {
        const w = parseInt(form.warrantyMonths.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10)
        if (!Number.isFinite(w) || w < 0 || w > MAX_WARRANTY_MONTHS) {
          toast.error(`الضمان المتبقي لازم رقم من 0 لـ ${MAX_WARRANTY_MONTHS} شهر`)
          return
        }
        warrantyMonths = w
      }
      await api(`/api/products/${product.id}/variants`, {
        method: 'POST',
        body: {
          size: form.size.trim() || null,
          color: color1 || null,
          condition: isElectronics ? form.condition || null : null,
          barcode: normalizeBarcode(form.barcode),
          price,
          quantity: form.quantity || 0,
          ...(showDeviceFields
            ? {
                warrantyMonths,
                boxCondition: form.boxCondition || null,
                edition: form.edition.trim() || null,
              }
            : {}),
        },
      })
      toast.success('تم إضافة المتغير')
      // بنسيب الحالة والنوع زي ما هم — الغالب بتضيف أكتر من متغير ورا بعض
      setForm((f) => ({ size: '', color: '', barcode: '', quantity: 0, price: '', condition: f.condition, warrantyMonths: '', boxCondition: '', edition: '' }))
      if (isElectronics && kind === 'laptop') {
        void rememberSuggestion('cpu', canonicalOf('cpu', spec.cpu))
        void rememberSuggestion('gpu', canonicalOf('gpu', spec.gpu))
      }
      setSpec((sp) => ({ ...sp, ram: '', storage: '', hdd: '' }))
      await load()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإضافة')
    } finally {
      setSaving(false)
    }
  }

  const removeVariant = async (id: number) => {
    if (!product) return
    if (!(await confirm({ title: 'حذف المتغير؟' }))) return
    try {
      await api(`/api/products/${product.id}/variants/${id}`, { method: 'DELETE' })
      await load()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const updateQty = async (id: number, quantity: number) => {
    if (!product) return
    try {
      await api(`/api/products/${product.id}/variants/${id}`, {
        method: 'PUT',
        body: { quantity },
      })
      setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, quantity } : v)))
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  /** 💰 التحديث 28: تعديل سعر مواصفة من الجدول — فاضي = رجوع لسعر المنتج العام. */
  const updatePrice = async (id: number, raw: string) => {
    if (!product) return
    const trimmed = raw.trim()
    let price: number | null = null
    if (trimmed !== '') {
      price = Number(trimmed.replace(/,/g, '.'))
      if (!Number.isFinite(price) || price < 0) {
        toast.error('السعر لازم يكون رقم صالح')
        await load()
        return
      }
      price = Math.round(price * 100) / 100
    }
    try {
      await api(`/api/products/${product.id}/variants/${id}`, {
        method: 'PUT',
        body: { price },
      })
      setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, price } : v)))
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحديث السعر')
    }
  }

  /** 📱 التحديث 30: تغيير حالة متغير (جديد/مستعمل) من الجدول */
  const updateCondition = async (id: number, raw: string) => {
    if (!product) return
    const condition = raw === 'new' || raw === 'used' ? raw : null
    try {
      await api(`/api/products/${product.id}/variants/${id}`, { method: 'PUT', body: { condition } })
      setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, condition } : v)))
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحديث الحالة')
    }
  }

  // ─── 📱 التحديث 33: بيانات جهاز الموبايل/التابلت (ضمان / كرتونة / نسخة) ───

  /** تعديل خانة من خانات الجهاز من الجدول — فاضي = بدون تحديد. */
  const updateDeviceField = async (
    id: number,
    patch: { warrantyMonths?: string; boxCondition?: string; edition?: string },
  ) => {
    if (!product) return
    const body: Record<string, unknown> = {}
    if (patch.warrantyMonths !== undefined) {
      const raw = patch.warrantyMonths.trim()
      if (raw === '') {
        body.warrantyMonths = null
      } else {
        const w = parseInt(raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10)
        if (!Number.isFinite(w) || w < 0 || w > MAX_WARRANTY_MONTHS) {
          toast.error(`الضمان المتبقي لازم رقم من 0 لـ ${MAX_WARRANTY_MONTHS} شهر`)
          await load()
          return
        }
        body.warrantyMonths = w
      }
    }
    if (patch.boxCondition !== undefined) {
      body.boxCondition = patch.boxCondition === 'full' || patch.boxCondition === 'device' ? patch.boxCondition : null
    }
    if (patch.edition !== undefined) {
      body.edition = patch.edition.trim() || null
    }
    try {
      await api(`/api/products/${product.id}/variants/${id}`, { method: 'PUT', body })
      setVariants((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                warrantyMonths: (body.warrantyMonths as number | null) ?? (body.warrantyMonths === null ? null : v.warrantyMonths),
                boxCondition: body.boxCondition !== undefined ? (body.boxCondition as string | null) : v.boxCondition,
                edition: body.edition !== undefined ? (body.edition as string | null) : v.edition,
              }
            : v,
        ),
      )
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
      await load()
    }
  }

  const removeUnit = async (variantId: number, unitId: number) => {
    if (!product) return
    if (!(await confirm({ title: 'حذف الـ IMEI من المتغير؟', description: 'الحذف من سجل الأجهزة بس — الكمية مش بتتغير.' }))) return
    setRemovingUnit(unitId)
    try {
      await api(`/api/products/${product.id}/variant-units?unitId=${unitId}`, { method: 'DELETE' })
      setUnits((prev) => prev.filter((u) => !(u.id === unitId && u.variantId === variantId)))
      toast.success('تم حذف الجهاز')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setRemovingUnit(null)
    }
  }

  /** تعديل صحة البطارية لجهاز موجود (للآيفون بس) — فاضي = بدون تحديد */
  const updateUnitBattery = async (unitId: number, raw: string) => {
    if (!product) return
    const trimmed = raw.trim()
    const saved = units.find((u) => u.id === unitId)?.batteryHealth
    if (trimmed === (saved == null ? '' : String(saved))) return
    let battery: number | null = null
    if (trimmed !== '') {
      battery = parseInt(trimmed.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10)
      if (!Number.isFinite(battery) || battery < 1 || battery > 100) {
        toast.error('صحة البطارية لازم رقم صحيح من 1 لـ 100')
        setUnitBatteryDraft((p) => {
          const n = { ...p }
          delete n[unitId]
          return n
        })
        return
      }
    }
    try {
      await api(`/api/products/${product.id}/variant-units?unitId=${unitId}`, {
        method: 'PATCH',
        body: { batteryHealth: battery },
      })
      setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, batteryHealth: battery } : u)))
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    } finally {
      setUnitBatteryDraft((p) => {
        const n = { ...p }
        delete n[unitId]
        return n
      })
    }
  }

  const toggleColor = (key: string) =>
    setOpenColors((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** ضبط كمية كل مقاسات اللون (اللي ظاهرة وقت الضغط) على رقم واحد — بعد تأكيد، ودفعة تحديث واحدة. */
  const applyColorQty = async (colorKey: string, items: ProductVariant[]) => {
    if (!product || items.length === 0) return
    const raw = (colorQty[colorKey] ?? '').trim()
    if (raw === '') {
      toast.error('اكتب الكمية الأول')
      return
    }
    const qty = Math.max(0, parseInt(raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10))
    if (!Number.isFinite(qty)) {
      toast.error('كمية غير صحيحة')
      return
    }
    const label = colorKey || noOpt1Label
    const ok = await confirm({
      title: `ضبط كمية «${label}» على ${qty}؟`,
      description: `هتتغيّر كمية ${items.length} ${opt2Unit}${needle ? ' (نتايج البحث الحالية بس)' : ''} لتبقى ${qty} لكل ${opt2Unit}.`,
      confirmText: 'تطبيق',
      destructive: false,
    })
    if (!ok) return
    setApplyingColor(colorKey)
    const targets = items.filter((v) => v.quantity !== qty)
    let okCount = 0
    let failCount = 0
    const done = new Set<number>()
    await withDataBatch(async () => {
      for (const v of targets) {
        try {
          await api(`/api/products/${product.id}/variants/${v.id}`, { method: 'PUT', body: { quantity: qty } })
          okCount++
          done.add(v.id)
        } catch {
          failCount++
        }
      }
    })
    setVariants((prev) => prev.map((v) => (done.has(v.id) ? { ...v, quantity: qty } : v)))
    setApplyingColor(null)
    if (okCount) toast.success(`اتضبطت كمية ${okCount} ${opt2Unit} على ${qty}`)
    else if (!failCount) toast.message('الكميات كانت متضبطة بالفعل')
    if (failCount) toast.error(`فشل تحديث ${failCount} ${opt2Unit}`)
    if (okCount) onChanged?.()
  }

  const generateForVariant = async (id: number) => {
    if (!product) return
    setGeneratingId(id)
    try {
      const barcode = await fetchUniqueBarcode(existingBarcodes)
      await api(`/api/products/${product.id}/variants/${id}`, {
        method: 'PUT',
        body: { barcode },
      })
      setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, barcode } : v)))
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل توليد الباركود')
    } finally {
      setGeneratingId(null)
    }
  }

  const generateMissingBarcodes = async () => {
    if (!product) return
    const missing = variants.filter((v) => !v.barcode)
    if (missing.length === 0) return
    setBulkGenerating(true)
    const used = new Set(existingBarcodes)
    const freshMissing = await fetchUniqueBarcodes(missing.length, used)
    let okCount = 0
    let failCount = 0
    for (const [mIdx, v] of missing.entries()) {
      const barcode = freshMissing[mIdx]
      used.add(barcode)
      try {
        await api(`/api/products/${product.id}/variants/${v.id}`, {
          method: 'PUT',
          body: { barcode },
        })
        okCount++
      } catch {
        failCount++
      }
    }
    setBulkGenerating(false)
    if (okCount) toast.success(`تم توليد باركود لـ ${okCount} متغير`)
    if (failCount) toast.error(`فشل توليد الباركود لـ ${failCount} متغير`)
    await load()
    onChanged?.()
  }

  const needle = vq.trim().toLowerCase()
  const needleAr = normAr(vq)
  const shownVariants = needle
    ? variants.filter((v) => {
        // 📱 التحديث 33: البحث بيشمل بيانات الجهاز (ضمان/كرتونة/نسخة) وأجهزة الـ IMEI
        const deviceTexts = [
          v.edition,
          v.boxCondition ? BOX_LABEL[v.boxCondition as BoxCondition] : null,
          warrantyLabel(v.warrantyMonths),
          ...(unitsByVariant.get(v.id) ?? []).map((u) => u.imei),
        ]
        return [v.size, v.color, v.barcode, v.condition ? CONDITION_LABEL[v.condition as VariantCondition] : null, ...deviceTexts].some((x) => {
          const t = (x ?? '').toLowerCase()
          return t.includes(needle) || (needleAr !== '' && normAr(t).includes(needleAr))
        })
      })
    : variants
  const groups = React.useMemo(() => groupByColor(shownVariants), [shownVariants])
  // يفتح لوحده لو فيه لون واحد بس أو البحث شغال
  const autoOpen = needle !== '' || groups.length === 1
  const missingCount = variants.filter((v) => !v.barcode).length
  // 📱 التحديث 33: تاب الموبايل فيه عمود إضافي «IMEI» (زرار بيانات الجهاز + عدد المسجل)
  const ROW_GRID = isElectronics
    ? kind === 'phone'
      ? 'grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1.1fr)_5rem_4.5rem_3rem_2.25rem]'
      : 'grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1.1fr)_5rem_4.5rem_2.25rem]'
    : 'grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5.5rem_5rem_2.25rem]'
  // 📱 التحديث 34: جريد جدول الأجهزة في تاب IMEI — عمود «بيانات المتغير» يظهر من md وطالع
  const UNIT_GRID = cn(
    'grid items-center gap-2',
    isIphone
      ? 'grid-cols-[minmax(0,1fr)_4.5rem_4.75rem_minmax(0,1.3fr)_2.25rem] md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_minmax(0,1.4fr)_10rem_2.5rem]'
      : 'grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1.3fr)_2.25rem] md:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1.4fr)_10rem_2.5rem]',
  )
  const variantLabel = (v: ProductVariant) => [v.size, v.color].filter(Boolean).join(' · ') || `متغير #${v.id}`

  /** 📱 التحديث 35: تاب «أجهزة المنتج (IMEI)» — كل الأجهزة في مساحة كاملة:
   * تسجيل جهاز واحد زي القديم + إحصائيات + بحث وفلاتر + جدول عريض. */
  const renderDevicesTab = () => (
    <section aria-label="أجهزة المنتج (IMEI)" className="space-y-4">
      <SectionTitle
        aside={(
          <span className="text-xs font-semibold tabular-nums text-foreground/65">
            {devQuery.trim() || devStatus || devVariant !== '' ? `${shownUnits.length} نتيجة من ${units.length}` : `${units.length} جهاز`}
          </span>
        )}
      >
        أجهزة المنتج — IMEI / سيريال لكل قطعة
      </SectionTitle>

      {/* إحصائيات سريعة — كل بطاقة فلتر حالة بالضغط عليها */}
      <div className="grid grid-cols-3 gap-2.5">
        <UnitStatCard n={unitsStats.total} t="إجمالي المسجل" active={devStatus === ''} onClick={() => setDevStatus('')} />
        <UnitStatCard n={unitsStats.inStock} t="بالمخزن" tone="ok" active={devStatus === 'in_stock'} onClick={() => setDevStatus(devStatus === 'in_stock' ? '' : 'in_stock')} />
        <UnitStatCard n={unitsStats.sold} t="تم بيعه" tone="muted" active={devStatus === 'sold'} onClick={() => setDevStatus(devStatus === 'sold' ? '' : 'sold')} />
      </div>

      {/* ─── 📱 التحديث 35: تسجيل جهاز واحد زي الوضع القديم — خانة IMEI + زرار تسجيل (من غير لصق دفعة) ─── */}
      <div className="rounded-2xl border bg-card p-3.5">
        <p className="flex items-center gap-1.5 text-xs font-extrabold">
          <Plus className="size-3.5 text-foreground/60" aria-hidden />
          تسجيل جهاز — IMEI / سيريال لكل قطعة
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {variants.length > 1 && (
            <select
              value={newUnitVariant}
              onChange={(e) => setNewUnitVariant(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              aria-label="متغير الجهاز الجديد"
              className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-2 text-sm font-bold outline-none focus:border-foreground sm:max-w-48"
            >
              <option value="">— اختار المتغير —</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {variantLabel(v)} (كمية {v.quantity})
                </option>
              ))}
            </select>
          )}
          <InkInput
            dir="rtl"
            placeholder="IMEI / سيريال الجهاز"
            aria-label="IMEI الجهاز الجديد"
            wrapperClassName="min-w-0 flex-[2]"
            className="font-mono text-sm [unicode-bidi:plaintext]"
            autoComplete="off"
            value={newImei}
            onChange={(e) => setNewImei(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addUnit()
              }
            }}
          />
          {isIphone && (
            <InkInput
              num
              size="sm"
              type="number"
              min={1}
              max={100}
              placeholder="بطارية %"
              aria-label="صحة بطارية الجهاز الجديد"
              wrapperClassName="w-24 shrink-0"
              value={newBattery}
              onChange={(e) => setNewBattery(e.target.value)}
              className="text-center text-xs"
            />
          )}
          <Button
            type="button"
            disabled={addingUnit || (variants.length > 1 && newUnitVariant === '')}
            onClick={() => void addUnit()}
            className={cn('h-11 shrink-0 rounded-xl px-5 font-bold', INK_BTN)}
          >
            {addingUnit ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            تسجيل
          </Button>
        </div>
        {variants.length === 0 ? (
          <p className="mt-2 text-[11px] font-bold text-warning-subtle-foreground">
            ضيف متغير الأول من تاب «المتغيرات» (سعة/لون) وبعدها سجّل الأجهزة هنا.
          </p>
        ) : (
          <p className="mt-2 text-[11px] font-medium text-foreground/60">
            {isIphone ? 'سجّل IMEI كل جهاز على حدة مع صحة البطارية — ' : 'سجّل IMEI كل جهاز على حدة — '}
            نفس الرقم ممنوع يتسجل مرتين في المحل كله (تتبع الضمان والحماية من المسروق).
          </p>
        )}
      </div>

      {/* ─── بحث وفلاتر ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-11 min-w-0 flex-1 items-center rounded-xl border bg-card focus-within:border-foreground focus-within:ring-[3px] focus-within:ring-foreground/10 sm:min-w-56">
          <Search className="pointer-events-none absolute start-3 size-4 text-foreground/60" aria-hidden />
          <input
            value={devQuery}
            onChange={(e) => setDevQuery(e.target.value)}
            placeholder="دوّر برقم IMEI / سيريال / لون / سعة…"
            aria-label="بحث في الأجهزة"
            className="h-full w-full bg-transparent ps-9 pe-3 text-sm outline-none placeholder:text-muted-foreground/80"
          />
          {devQuery && (
            <button
              type="button"
              aria-label="مسح البحث"
              onClick={() => setDevQuery('')}
              className="absolute end-2.5 grid size-6 place-items-center rounded-md text-foreground/50 hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <select
          value={devStatus}
          onChange={(e) => setDevStatus(e.target.value as '' | UnitStatus)}
          aria-label="فلتر حالة الجهاز"
          className="h-11 rounded-xl border bg-card px-2.5 text-sm font-bold outline-none focus:border-foreground"
        >
          <option value="">كل الحالات</option>
          <option value="in_stock">بالمخزن</option>
          <option value="sold">تم بيعه</option>
        </select>
        <select
          value={devVariant}
          onChange={(e) => setDevVariant(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          aria-label="فلتر المتغير"
          className="h-11 max-w-56 rounded-xl border bg-card px-2.5 text-sm font-bold outline-none focus:border-foreground"
        >
          <option value="">كل المتغيرات</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>{variantLabel(v)}</option>
          ))}
        </select>
      </div>

      {/* ─── جدول الأجهزة — عريض ومريح ─── */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className={cn(UNIT_GRID, 'bg-muted/40 px-3 py-2 text-[11px] font-bold text-foreground/65')}>
          <span>المتغير</span>
          {isIphone && <span className="text-center">بطارية</span>}
          <span className="text-center">الحالة</span>
          <span className="hidden md:block">بيانات المتغير</span>
          <span className="text-end">IMEI / سيريال</span>
          <span />
        </div>
        {shownUnits.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-medium text-foreground/65">
            {units.length === 0 ? 'مفيش أجهزة مسجلة لسه — سجّل أول جهاز من فورم التسجيل فوق.' : 'مفيش أجهزة بالفلتر ده — جرب تغيّر البحث أو الفلاتر.'}
          </p>
        ) : (
          <ul className="divide-y">
            {shownUnits.map((u) => {
              const v = variantById.get(u.variantId)
              const badges = v
                ? ([warrantyLabel(v.warrantyMonths), v.boxCondition ? BOX_SHORT[v.boxCondition as BoxCondition] : null, v.edition].filter(Boolean) as string[])
                : []
              return (
                <li key={u.id} className={cn(UNIT_GRID, 'px-3 py-2 text-sm')}>
                  <span className="min-w-0 truncate text-xs font-semibold" title={v ? variantLabel(v) : undefined}>
                    {v ? variantLabel(v) : '—'}
                  </span>
                  {isIphone && (
                    <InkInput
                      num
                      size="sm"
                      type="number"
                      min={1}
                      max={100}
                      placeholder="%"
                      aria-label={`صحة بطارية ${u.imei}`}
                      wrapperClassName="w-full"
                      value={unitBatteryDraft[u.id] ?? (u.batteryHealth ?? '')}
                      onChange={(e) => setUnitBatteryDraft((p) => ({ ...p, [u.id]: e.target.value }))}
                      onBlur={(e) => void updateUnitBattery(u.id, e.target.value)}
                      className="text-center text-xs"
                    />
                  )}
                  <span className="justify-self-center">
                    <span className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                      u.status === 'sold' ? 'bg-foreground/10 text-foreground/60' : 'bg-success-subtle text-success-subtle-foreground',
                    )}>
                      {UNIT_STATUS_LABEL[u.status as keyof typeof UNIT_STATUS_LABEL] ?? 'بالمخزن'}
                    </span>
                  </span>
                  <span className="hidden min-w-0 truncate text-[11px] font-bold text-foreground/55 md:block" title={badges.join(' · ')}>
                    {badges.length > 0 ? badges.join(' · ') : '—'}
                  </span>
                  <span dir="ltr" className="min-w-0 truncate text-start font-mono text-xs font-bold" title={u.imei}>
                    {u.imei}
                  </span>
                  <IconBtn label="حذف الجهاز" danger disabled={removingUnit === u.id} onClick={() => void removeUnit(u.variantId, u.id)}>
                    {removingUnit === u.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </IconBtn>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )

  const secAdd = isElectronics ? 1 : 2
  const secList = isElectronics ? 2 : 3

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 📱 التحديث 35 (2026-11-07): عرض الدايلوج 850px للإلكترونيات — والارتفاع زاد درجة (96dvh) */}
      <DialogContent mobileSheet dir="rtl" className={cn('flex max-h-[96dvh] flex-col gap-0 overflow-hidden p-0 [&_input:not([dir=ltr])]:text-right [&_textarea]:text-right', isElectronics ? 'sm:max-w-[750px]' : 'sm:max-w-2xl')}>
        <DialogHero icon={KindIcon} title="متغيرات المنتج" subtitle={product?.name} />

        <div ref={attachBody} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {/* 📱 التحديث 34: تاب العرض — «المتغيرات» أو «أجهزة المنتج (IMEI)» — لموبايل/تابلت بس */}
          {enabled && showDeviceFields && (
            <div className="flex gap-1.5 rounded-2xl border bg-card p-1.5" role="tablist" aria-label="تبويبات المتغيرات">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'variants'}
                onClick={() => setTab('variants')}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold transition-colors',
                  tab === 'variants' ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-muted/60',
                )}
              >
                <Package className="size-4 shrink-0" aria-hidden />
                المتغيرات
                <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums', tab === 'variants' ? 'bg-background/15' : 'bg-muted text-foreground/60')}>
                  {variants.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'devices'}
                onClick={() => setTab('devices')}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold transition-colors',
                  tab === 'devices' ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-muted/60',
                )}
              >
                <Smartphone className="size-4 shrink-0" aria-hidden />
                أجهزة المنتج (IMEI)
                <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums', tab === 'devices' ? 'bg-background/15' : 'bg-muted text-foreground/60')}>
                  {units.length}
                </span>
              </button>
            </div>
          )}
          {!enabled ? (
            <LockedNote>ميزة المتغيرات (مواصفات/ألوان لكل منتج بسعر وكمية وباركود مستقل) مش مفعّلة في باقتك الحالية.</LockedNote>
          ) : tab === 'devices' && showDeviceFields ? (
            renderDevicesTab()
          ) : (
            <>
              {/* ═════════ نوع المنتج — الإلكترونيات بس (بيغيّر أسماء الخانات) ═════════ */}
              {isElectronics && (
                <div className="flex gap-1.5 rounded-2xl border bg-card p-1.5" role="tablist" aria-label="نوع المنتج">
                  {(Object.keys(KIND_META) as ElectronicsKind[]).map((k) => {
                    const Icon = KIND_ICON[k]
                    const on = kind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => {
                          setKind(k)
                          setTab('variants')
                          setPreview(null)
                          setSpec({ ...EMPTY_LAPTOP_SPEC })
                          setForm((f) => ({ ...f, color: '', size: '' }))
                        }}
                        className={cn(
                          'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold transition-colors',
                          on ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-muted/60',
                        )}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{KIND_META[k].tab}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ═════════ 1) المساعد الذكي — عامية الملابس بس (الإلكترونيات بتتكتب بالخانات مباشرة) ═════════ */}
              {!isElectronics && (
              <section>
                <SectionTitle n={1}>مساعد الإدخال الذكي</SectionTitle>
                <div className="space-y-3 rounded-2xl border bg-card p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                    <Sparkles className="size-3.5" aria-hidden />
                    {isElectronics
                      ? 'اكتب الوصف بالعامية وأنا أطلّع السعات والألوان والحالة والكميات.'
                      : 'اكتب الوصف بالعامية وأنا أطلّع المقاسات والألوان والكميات.'}
                  </p>
                  <textarea
                    placeholder={isElectronics ? meta.smartPlaceholder : 'مثال: كوتشي فلات أسود وكحلي مقاسات زوجي من 40 لـ 44 والكمية قطعتين'}
                    value={smartText}
                    onChange={(e) => setSmartText(e.target.value)}
                    rows={2}
                    aria-label="وصف المتغيرات"
                    className={cn(INK_INPUT, 'h-auto min-h-[4.5rem] resize-y py-2.5 leading-relaxed')}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={analyzeSmartText}
                      disabled={!smartText.trim()}
                      className={cn('h-10 rounded-xl px-5 font-bold', INK_BTN)}
                    >
                      <Sparkles className="size-4" />
                      تحليل
                    </Button>
                  </div>

                  {preview && (
                    <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                      {previewWarnings.length > 0 && (
                        <ul className="list-inside list-disc text-xs font-medium text-warning-subtle-foreground">
                          {previewWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                      {preview.length === 0 ? (
                        <p className="py-2 text-center text-sm font-medium text-foreground/65">
                          مقدرتش أطلّع متغيرات من الجملة دي، جرّب تعيد صياغتها
                        </p>
                      ) : (
                        <>
                          <ul className="max-h-60 divide-y overflow-y-auto overscroll-contain rounded-lg border bg-card">
                            <li className={cn('grid gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-bold text-foreground/65', isElectronics ? 'grid-cols-[1.4fr_1fr_4.5rem_5rem_2.25rem]' : 'grid-cols-[1fr_1fr_5rem_2.25rem]')}>
                              <span>{isElectronics ? opt1Label : 'اللون'}</span>
                              <span>{isElectronics ? opt2Label : 'المقاس'}</span>
                              {isElectronics && <span>الحالة</span>}
                              <span className="text-center">الكمية</span>
                              <span />
                            </li>
                            {preview.map((row, i) => (
                              <li key={i} className={cn('grid items-center gap-2 px-3 py-1.5 text-sm font-semibold', isElectronics ? 'grid-cols-[1.4fr_1fr_4.5rem_5rem_2.25rem]' : 'grid-cols-[1fr_1fr_5rem_2.25rem]')}>
                                <span className="truncate">{row.color ?? '—'}</span>
                                <span className="truncate">{row.size ?? '—'}</span>
                                {isElectronics && (
                                  <span className={cn('truncate text-xs font-bold', row.condition === 'used' ? 'text-warning-subtle-foreground' : 'text-foreground/70')}>
                                    {row.condition ? CONDITION_LABEL[row.condition] : '—'}
                                  </span>
                                )}
                                <InkInput
                                  num
                                  size="sm"
                                  type="number"
                                  min={0}
                                  aria-label="الكمية"
                                  value={row.quantity}
                                  onChange={(e) => updatePreviewQty(i, parseInt(e.target.value) || 0)}
                                  className="text-center"
                                />
                                <IconBtn label="حذف الصف" danger onClick={() => removePreviewRow(i)}>
                                  <Trash2 className="size-3.5" />
                                </IconBtn>
                              </li>
                            ))}
                          </ul>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setPreview(null)} className="h-10 rounded-xl px-4">
                              إلغاء
                            </Button>
                            <Button onClick={addAllPreviewRows} disabled={bulkSaving} className={cn('h-10 rounded-xl px-5 font-bold', INK_BTN)}>
                              {bulkSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                              إضافة الكل ({preview.length})
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>
              )}

              {/* ═════════ إضافة متغير يدويًا ═════════ */}
              <section>
                <SectionTitle n={secAdd}>إضافة متغير</SectionTitle>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 rounded-2xl border bg-card p-4 sm:grid-cols-4 sm:p-5">
                  {isElectronics ? (
                    <>
                      {kind === 'phone' && (
                        <>
                          <Field label="السعة" htmlFor="v-storage" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-storage" placeholder="256GB" value={spec.storage} onChange={(e) => setSpec({ ...spec, storage: e.target.value })} />
                            <ChipRow items={STORAGE_CHIPS} value={spec.storage} onPick={(v) => setSpec({ ...spec, storage: v })} label="سعات سريعة" />
                          </Field>
                          <Field label="الرام (اختياري)" htmlFor="v-ram" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-ram" placeholder="8GB" value={spec.ram} onChange={(e) => setSpec({ ...spec, ram: e.target.value })} />
                            <ChipRow items={RAM_CHIPS} value={spec.ram} onPick={(v) => setSpec({ ...spec, ram: v })} label="رام سريع" />
                          </Field>
                          <Field label="اللون" htmlFor="v-size" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-size" placeholder={meta.opt2Placeholder} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                            <ChipRow items={PHONE_COLOR_CHIPS} value={form.size} onPick={(v) => setForm({ ...form, size: v })} label="ألوان سريعة" />
                          </Field>
                        </>
                      )}
                      {kind === 'laptop' && (
                        <>
                          <Field label="المعالج" htmlFor="v-cpu" className="col-span-2 sm:col-span-2">
                            <DictField
                              id="v-cpu"
                              placeholder="Core i7-8550H"
                              label="المعالجات"
                              value={spec.cpu}
                              onChange={(v) => setSpec({ ...spec, cpu: v })}
                              entries={hw?.cpu}
                              ownValues={sugs.cpu.map((x) => x.value)}
                              onPick={(v) => setSpec({ ...spec, cpu: v })}
                            />
                            <SuggestChips items={sugs.cpu} presets={LAPTOP_CPU_CHIPS} value={spec.cpu} onPick={(v) => setSpec({ ...spec, cpu: v })} onDelete={(sg) => void deleteSuggestion('cpu', sg)} label="معالجات" />
                          </Field>
                          <Field label="الرام" htmlFor="v-ram" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-ram" placeholder="16GB" value={spec.ram} onChange={(e) => setSpec({ ...spec, ram: e.target.value })} />
                            <ChipRow items={RAM_CHIPS} value={spec.ram} onPick={(v) => setSpec({ ...spec, ram: v })} label="رام سريع" />
                          </Field>
                          <Field label="التخزين" htmlFor="v-storage" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-storage" placeholder="512GB SSD" value={spec.storage} onChange={(e) => setSpec({ ...spec, storage: e.target.value })} />
                            <ChipRow items={LAPTOP_STORAGE_CHIPS} value={spec.storage} onPick={(v) => setSpec({ ...spec, storage: v })} label="تخزين سريع" />
                          </Field>
                          <Field label="هارد إضافي HDD (اختياري)" htmlFor="v-hdd" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-hdd" placeholder="1TB HDD" value={spec.hdd} onChange={(e) => setSpec({ ...spec, hdd: e.target.value })} />
                            <ChipRow items={LAPTOP_HDD_CHIPS} value={spec.hdd} onPick={(v) => setSpec({ ...spec, hdd: v })} label="هارد إضافي" />
                          </Field>
                          <Field label="كارت الشاشة (اختياري)" htmlFor="v-gpu" className="col-span-2 sm:col-span-2">
                            <DictField
                              id="v-gpu"
                              placeholder="RTX 3050 4GB"
                              label="كروت الشاشة"
                              value={spec.gpu}
                              onChange={(v) => setSpec({ ...spec, gpu: v })}
                              entries={hw?.gpu}
                              ownValues={sugs.gpu.map((x) => x.value)}
                              onPick={(v) => setSpec({ ...spec, gpu: v })}
                            />
                            <SuggestChips items={sugs.gpu} value={spec.gpu} onPick={(v) => setSpec({ ...spec, gpu: v })} onDelete={(sg) => void deleteSuggestion('gpu', sg)} label="كروت الشاشة" />
                          </Field>
                          <Field label="دقة الشاشة (اختياري)" htmlFor="v-res" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-res" placeholder="FHD" value={spec.res} onChange={(e) => setSpec({ ...spec, res: e.target.value })} />
                            <ChipRow items={SCREEN_RES_CHIPS} value={spec.res} onPick={(v) => setSpec({ ...spec, res: v })} label="دقة الشاشة" />
                          </Field>
                          <Field label="تردد الشاشة (اختياري)" htmlFor="v-hz" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-hz" placeholder="144Hz" value={spec.hz} onChange={(e) => setSpec({ ...spec, hz: e.target.value })} />
                            <ChipRow items={SCREEN_HZ_CHIPS} value={spec.hz} onPick={(v) => setSpec({ ...spec, hz: v })} label="تردد الشاشة" />
                          </Field>
                          <Field label="نوع الشاشة" className="col-span-2 sm:col-span-2">
                            <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border bg-background p-1" role="radiogroup" aria-label="نوع الشاشة">
                              {[{ v: false, t: 'عادية' }, { v: true, t: 'تاتش' }].map((o) => (
                                <button
                                  key={o.t}
                                  type="button"
                                  role="radio"
                                  aria-checked={spec.touch === o.v}
                                  onClick={() => setSpec({ ...spec, touch: o.v })}
                                  className={cn('flex w-auto flex-auto items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-bold transition-colors', spec.touch === o.v ? 'bg-foreground text-background shadow-sm' : 'text-foreground/70 hover:bg-foreground/10 hover:text-foreground')}
                                >
                                  {o.t}
                                </button>
                              ))}
                            </div>
                          </Field>
                          <Field label="اللون (اختياري)" htmlFor="v-size" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-size" placeholder={meta.opt2Placeholder} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                          </Field>
                        </>
                      )}
                      {kind === 'other' && (
                        <>
                          <Field label={meta.opt1} htmlFor="v-color" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-color" placeholder={meta.opt1Placeholder} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                          </Field>
                          <Field label={meta.opt2} htmlFor="v-size" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-size" placeholder={meta.opt2Placeholder} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                          </Field>
                        </>
                      )}
                      <Field label="الحالة" className="col-span-2 sm:col-span-2">
                        <ConditionPick value={form.condition} onChange={(v) => setForm({ ...form, condition: v })} />
                      </Field>
                      {/* 📱 التحديث 33: بيانات جهاز الموبايل/التابلت — التاب ده بس (مش لابتوب/كمبيوتر) */}
                      {kind === 'phone' && (
                        <>
                          <Field label="الضمان المتبقي (شهور)" htmlFor="v-warranty">
                            <InkInput
                              id="v-warranty"
                              num
                              type="number"
                              min={0}
                              max={MAX_WARRANTY_MONTHS}
                              placeholder="بدون"
                              value={form.warrantyMonths}
                              onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
                            />
                            <ChipRow items={['3', '6', '12']} value={form.warrantyMonths} onPick={(v) => setForm({ ...form, warrantyMonths: v })} label="ضمان سريع" />
                          </Field>
                          <Field label="الكرتونة والملحقات">
                            <BoxPick value={form.boxCondition} onChange={(v) => setForm({ ...form, boxCondition: v })} />
                          </Field>
                          <Field label="الإصدار / النسخة (اختياري)" htmlFor="v-edition" className="col-span-2 sm:col-span-2">
                            <InkInput
                              id="v-edition"
                              placeholder="نسخة مصرية / مفتوح الشبكات"
                              maxLength={60}
                              value={form.edition}
                              onChange={(e) => setForm({ ...form, edition: e.target.value })}
                            />
                            <ChipRow items={EDITION_CHIPS} value={form.edition} onPick={(v) => setForm({ ...form, edition: v })} label="نسخ سريعة" />
                          </Field>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Field label="المقاس" htmlFor="v-size">
                        <InkInput id="v-size" placeholder="S / 42" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                      </Field>
                      <Field label="اللون" htmlFor="v-color">
                        <InkInput id="v-color" placeholder="أحمر" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                      </Field>
                    </>
                  )}
                  <Field label="الكمية" htmlFor="v-qty" className="col-span-2 sm:col-span-1">
                    <InkInput
                      id="v-qty"
                      num
                      type="number"
                      min={0}
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                      className="pl-5"
                    />
                  </Field>
                  <Field label="السعر (اختياري)" htmlFor="v-price">
                    <InkInput
                      id="v-price"
                      num
                      type="number"
                      min={0}
                      step="any"
                      placeholder="سعر المنتج"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </Field>
                  {/* 📱 التحديث 35 (2026-11-07): الباركود بقى خانة عادية جنب السعر — مش صف كامل */}
                  <Field label="الباركود" htmlFor="v-barcode" className="col-span-2 sm:col-span-2">
                    <div className="flex gap-2">
                      <InkInput
                        id="v-barcode"
                        num
                        wrapperClassName="flex-1"
                        className="text-start"
                        value={form.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        title="توليد باركود"
                        aria-label="توليد باركود"
                        className={cn('h-11 shrink-0 rounded-xl px-3.5', INK_BTN_OUTLINE)}
                        onClick={async () => {
                          const code = await fetchUniqueBarcode(existingBarcodes)
                          setForm((f) => ({ ...f, barcode: code }))
                        }}
                      >
                        <Dices className="size-4" />
                      </Button>
                    </div>
                  </Field>
                  <div className="col-span-2 flex items-end justify-end sm:col-span-4">
                    <Button onClick={addVariant} disabled={saving} className={cn('h-11 rounded-xl px-8 font-bold', INK_BTN)}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      إضافة
                    </Button>
                  </div>
                </div>
              </section>

              {/* ═════════ المتغيرات الحالية ═════════ */}
              <section>
                <SectionTitle
                  n={secList}
                  aside={
                    missingCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={generateMissingBarcodes}
                        disabled={bulkGenerating}
                        className={cn('h-8 rounded-full px-3 text-xs font-bold', INK_BTN_OUTLINE)}
                      >
                        {bulkGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                        توليد الباركودات الناقصة ({missingCount})
                      </Button>
                    )
                  }
                >
                  المتغيرات الحالية
                  {variants.length > 0 && (
                    <span className="text-xs font-semibold tabular-nums text-foreground/65">· {variants.length}</span>
                  )}
                </SectionTitle>

                {variants.length > 8 && (
                  <label className="relative mb-2.5 flex h-10 items-center rounded-xl border bg-card focus-within:border-foreground focus-within:ring-[3px] focus-within:ring-foreground/10">
                    <Search className="pointer-events-none absolute start-3 size-4 text-foreground/60" aria-hidden />
                    <input
                      value={vq}
                      onChange={(e) => setVq(e.target.value)}
                      placeholder={`دوّر في ${variants.length} متغير (${isElectronics ? (kind === 'phone' ? 'سعة / لون / حالة / باركود / IMEI' : 'كونفيج / لون / حالة / باركود') : 'مقاس / لون / باركود'})…`}
                      aria-label="بحث في المتغيرات"
                      className="h-full w-full bg-transparent pe-3 text-sm outline-none placeholder:text-muted-foreground/80"
                      style={{ paddingInlineStart: '2.5rem' }}
                    />
                  </label>
                )}

                {loading ? (
                  <p className="rounded-2xl border border-dashed bg-card/60 py-8 text-center text-sm font-medium text-foreground/65">
                    جاري التحميل...
                  </p>
                ) : variants.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center">
                    <KindIcon className="mx-auto size-6 text-foreground/40" aria-hidden />
                    <p className="mt-2 text-sm font-bold">لا توجد متغيرات بعد</p>
                  </div>
                ) : (
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain">
                    {groups.map((g) => {
                      const key = g.color
                      const isOpen = autoOpen || openColors.has(key)
                      const busy = applyingColor === key
                      return (
                        <div key={key || '_none'} className="overflow-hidden rounded-2xl border bg-card">
                          <button
                            type="button"
                            onClick={() => toggleColor(key)}
                            aria-expanded={isOpen}
                            disabled={autoOpen}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors enabled:hover:bg-muted/50"
                          >
                            <ChevronDown
                              className={cn('size-4 shrink-0 text-foreground/60 transition-transform', isOpen ? 'rotate-0' : '-rotate-90')}
                              aria-hidden
                            />
                            {key && !isElectronics ? <Swatch name={key} className="size-5" /> : null}
                            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{key || noOpt1Label}</span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground/65">
                              {g.items.length} {opt2Unit} · {g.total} قطعة
                            </span>
                          </button>

                          {isOpen && (
                            <div className="border-t">
                              <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
                                <span className="shrink-0 text-[11px] font-bold text-foreground/70">كمية كل {isElectronics ? (kind === 'phone' ? 'الألوان' : 'الخيارات') : 'المقاسات'}</span>
                                <InkInput
                                  num
                                  size="sm"
                                  type="number"
                                  min={0}
                                  aria-label={`كمية كل ${isElectronics ? (kind === 'phone' ? 'الألوان' : 'الخيارات') : 'المقاسات'} ${key || noOpt1Label}`}
                                  placeholder="0"
                                  wrapperClassName="w-20"
                                  value={colorQty[key] ?? ''}
                                  onChange={(e) => setColorQty((p) => ({ ...p, [key]: e.target.value }))}
                                  className="text-center"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={busy || applyingColor != null}
                                  onClick={() => applyColorQty(key, g.items)}
                                  className={cn('h-9 rounded-lg px-3 text-xs font-bold', INK_BTN_OUTLINE)}
                                >
                                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                  تطبيق
                                </Button>
                              </div>
                              <ul className="divide-y">
                                <li className={cn('grid gap-2 bg-muted/20 px-4 py-1.5 text-[11px] font-bold text-foreground/65', ROW_GRID)}>
                                  <span>{opt2Label}</span>
                                  {isElectronics && <span>الحالة</span>}
                                  <span className="text-center">الباركود</span>
                                  <span className="text-center">السعر</span>
                                  <span className="text-center">الكمية</span>
                                  {isElectronics && kind === 'phone' && <span className="text-center">IMEI</span>}
                                  <span />
                                </li>
                                {g.items.map((v) => {
                                  // 📱 التحديث 33: بيانات جهاز الموبايل/التابلت
                                  const vUnits = unitsByVariant.get(v.id) ?? []
                                  const overUnits = showDeviceFields && vUnits.length > v.quantity
                                  const deviceBadges = showDeviceFields
                                    ? [warrantyLabel(v.warrantyMonths), v.boxCondition ? BOX_SHORT[v.boxCondition as BoxCondition] : null, v.edition].filter(Boolean) as string[]
                                    : []
                                  return (
                                  <li key={v.id} className="border-b border-border/60 last:border-b-0">
                                    <div className={cn('grid items-center gap-2 px-4 py-1.5 text-sm', ROW_GRID)}>
                                      <span className="min-w-0 max-w-full overflow-hidden">
                                        <span className="block truncate font-bold">{v.size ?? '—'}</span>
                                        {showDeviceFields && deviceBadges.length > 0 && (
                                          <span className="mt-0.5 block max-w-full overflow-hidden whitespace-normal break-words text-[10px] font-bold leading-snug text-foreground/55 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" title={deviceBadges.join(' · ')}>
                                            {deviceBadges.join(' · ')}
                                          </span>
                                        )}
                                      </span>
                                      {isElectronics && (
                                        <select
                                          aria-label={`حالة ${v.size ?? ''} ${v.color ?? ''}`}
                                          value={v.condition === 'new' || v.condition === 'used' ? v.condition : ''}
                                          onChange={(e) => void updateCondition(v.id, e.target.value)}
                                          className={cn(
                                            'h-9 w-full rounded-lg border bg-background px-1.5 text-xs font-bold outline-none focus:border-foreground',
                                            v.condition === 'used' && 'border-warning-subtle bg-warning-subtle text-warning-subtle-foreground',
                                          )}
                                        >
                                          <option value="">—</option>
                                          <option value="new">{CONDITION_LABEL.new}</option>
                                          <option value="used">{CONDITION_LABEL.used}</option>
                                        </select>
                                      )}
                                      <span dir="ltr" className="min-w-0 overflow-hidden truncate text-center font-mono text-xs text-foreground/75">
                                        {v.barcode ?? (
                                          <IconBtn
                                            label="توليد باركود"
                                            disabled={generatingId === v.id}
                                            onClick={() => generateForVariant(v.id)}
                                          >
                                            {generatingId === v.id ? <Loader2 className="size-3.5 animate-spin" /> : <Dices className="size-3.5" />}
                                          </IconBtn>
                                        )}
                                      </span>
                                      <InkInput
                                        num
                                        size="sm"
                                        type="number"
                                        min={0}
                                        step="any"
                                        placeholder="سعر المنتج"
                                        aria-label={`سعر ${v.size ?? ''} ${v.color ?? ''}`}
                                        value={priceDraft[v.id] ?? (v.price ?? '')}
                                        onChange={(e) => setPriceDraft((p) => ({ ...p, [v.id]: e.target.value }))}
                                        onBlur={(e) => {
                                          const raw = e.target.value.trim()
                                          const saved = v.price ?? ''
                                          if (raw === String(saved)) return
                                          setPriceDraft((p) => {
                                            const n = { ...p }
                                            delete n[v.id]
                                            return n
                                          })
                                          void updatePrice(v.id, raw)
                                        }}
                                        className="text-center"
                                      />
                                      <InkInput
                                        num
                                        size="sm"
                                        type="number"
                                        min={0}
                                        aria-label={`كمية ${v.size ?? ''} ${v.color ?? ''}`}
                                        value={v.quantity}
                                        onChange={(e) => updateQty(v.id, parseInt(e.target.value) || 0)}
                                        className="text-center"
                                      />
                                      {isElectronics && kind === 'phone' && (
                                        <button
                                          type="button"
                                          title="أجهزة المتغير — IMEI / سيريال (بحث وتسجيل وإدارة في تاب كامل)"
                                          onClick={() => openDevicesForVariant(v.id)}
                                          className={cn(
                                            'mx-auto flex h-9 w-full items-center justify-center gap-1 rounded-lg border text-[10px] font-extrabold transition-colors',
                                            overUnits
                                              ? 'border-warning-subtle bg-warning-subtle text-warning-subtle-foreground hover:bg-warning-subtle/80'
                                              : 'bg-background text-foreground/75 hover:border-foreground/60 hover:bg-muted/60',
                                          )}
                                        >
                                          <BadgeInfo className="size-3.5 shrink-0" aria-hidden />
                                          <span className="tabular-nums">{vUnits.length > 0 ? `${vUnits.length}/${v.quantity}` : '—'}</span>
                                        </button>
                                      )}
                                      <IconBtn label="حذف المتغير" danger onClick={() => removeVariant(v.id)}>
                                        <Trash2 className="size-4" />
                                      </IconBtn>
                                    </div>

                                    {showDeviceFields && (
                                      <div className="space-y-3 border-t bg-muted/25 px-3 py-3">
                                        {/* ─── الضمان / الكرتونة / النسخة ─── */}
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
                                          <Field label="الضمان المتبقي (شهور)" htmlFor={`dw-${v.id}`}>
                                            <InkInput
                                              id={`dw-${v.id}`}
                                              num
                                              size="sm"
                                              type="number"
                                              min={0}
                                              max={MAX_WARRANTY_MONTHS}
                                              placeholder="بدون"
                                              aria-label={`الضمان المتبقي ${v.size ?? ''} ${v.color ?? ''}`}
                                              value={deviceDraft[v.id]?.warrantyMonths ?? (v.warrantyMonths ?? '')}
                                              onChange={(e) =>
                                                setDeviceDraft((p) => ({
                                                  ...p,
                                                  [v.id]: { ...p[v.id], warrantyMonths: e.target.value },
                                                }))
                                              }
                                              onBlur={(e) => {
                                                const raw = e.target.value.trim()
                                                const saved = v.warrantyMonths ?? ''
                                                if (raw === String(saved)) return
                                                setDeviceDraft((p) => {
                                                  const n = { ...p }
                                                  const cur = { ...n[v.id] }
                                                  delete cur.warrantyMonths
                                                  if (Object.keys(cur).length === 0) delete n[v.id]
                                                  else n[v.id] = cur
                                                  return n
                                                })
                                                void updateDeviceField(v.id, { warrantyMonths: raw })
                                              }}
                                              className="text-center"
                                            />
                                          </Field>
                                          <Field label="الكرتونة والملحقات">
                                            <BoxPick
                                              value={(v.boxCondition === 'full' || v.boxCondition === 'device' ? v.boxCondition : '') as '' | BoxCondition}
                                              onChange={(val) => void updateDeviceField(v.id, { boxCondition: val })}
                                            />
                                          </Field>
                                          <Field label="الإصدار / النسخة" htmlFor={`de-${v.id}`} className="col-span-2">
                                            <InkInput
                                              id={`de-${v.id}`}
                                              placeholder="نسخة مصرية / مفتوح الشبكات"
                                              aria-label={`الإصدار ${v.size ?? ''} ${v.color ?? ''}`}
                                              maxLength={60}
                                              value={deviceDraft[v.id]?.edition ?? (v.edition ?? '')}
                                              onChange={(e) =>
                                                setDeviceDraft((p) => ({
                                                  ...p,
                                                  [v.id]: { ...p[v.id], edition: e.target.value },
                                                }))
                                              }
                                              onBlur={(e) => {
                                                const raw = e.target.value.trim()
                                                const saved = v.edition ?? ''
                                                if (raw === saved) return
                                                setDeviceDraft((p) => {
                                                  const n = { ...p }
                                                  const cur = { ...n[v.id] }
                                                  delete cur.edition
                                                  if (Object.keys(cur).length === 0) delete n[v.id]
                                                  else n[v.id] = cur
                                                  return n
                                                })
                                                void updateDeviceField(v.id, { edition: raw })
                                              }}
                                            />
                                            <ChipRow
                                              items={EDITION_CHIPS}
                                              value={deviceDraft[v.id]?.edition ?? (v.edition ?? '')}
                                              onPick={(val) => void updateDeviceField(v.id, { edition: val })}
                                              label="نسخ سريعة"
                                            />
                                          </Field>
                                        </div>

                                        {/* 📱 التحديث 35: إدارة الـ IMEI كلها في تاب «أجهزة المنتج» — وفورم التسجيل هناك زي القديم */}
                                        <button
                                          type="button"
                                          onClick={() => openDevicesForVariant(v.id)}
                                          className={cn(
                                            'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs font-extrabold transition-colors',
                                            overUnits
                                              ? 'border-warning-subtle bg-warning-subtle text-warning-subtle-foreground hover:bg-warning-subtle/80'
                                              : 'bg-card text-foreground/75 hover:border-foreground/50 hover:text-foreground',
                                          )}
                                        >
                                          <Package className="size-3.5 shrink-0" aria-hidden />
                                          تسجيل / إدارة أجهزة المتغير (IMEI / سيريال) — {vUnits.length} مسجل من {v.quantity}
                                        </button>
                                      </div>
                                    )}
                                  </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {groups.length === 0 && (
                      <p className="rounded-2xl border bg-card px-4 py-8 text-center text-sm font-medium text-foreground/65">
                        مفيش متغير بالبحث ده
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-6">
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
