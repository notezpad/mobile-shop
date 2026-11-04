'use client'

/**
 * 🎨 التحديث 27 (2026-11-04): مصمم ملصقات الباركود الحر — سحب وإفلات (WYSIWYG).
 *
 * الفكرة: الملصق بيظهر بمقاسه الحقيقي (مليمترات مترجمة لبكسلات)، وكل عنصر
 * (اسم/سعر/باركود/رقم/مقاس-لون) صندوق مستقل بيتسحب بإصبع أو ماوس لأي مكان —
 * مع محاذاة تلقائية لشبكة نص مم عشان اليد المرتجشة تطلع مرتبة.
 *
 * ليه سحب وإفلات مش حقول أرقام؟ لأنها الطريقة القياسية في كل برامج الملصقات
 * (BarTender / DYMO / Avery): أسهل إحساس ممكن للمستخدم، وبنضيف فوقها قوة:
 *  - قوالب مسماة بتتحفظ على السيرفر لكل محل (template manager هنا).
 *  - خصائص لكل عنصر: حجم الخط، غامق، محاذاة يمين/وسط/شمال، عرض الصندوق،
 *    وطول خطوط الباركود.
 *  - أسهم الكيبورد بتحرّك العنصر المختار بنص مم (Shift = ممين) — ضبط دقيق.
 *  - مقاس ملصق حر (10–300مم) + مقاسات جاهزة.
 *  - «التطبيق على الطباعة» بيرجّع التصميم لدايلوج الطباعة — المعاينة والطباعة
 *    (نافذة متصفح + USB مباشر) بتستخدم نفس الإحداثيات حرفياً.
 *
 * كل المحاسبات المشتركة (ارتفاع العنصر، عدد سطور اللف، المحاذاة) في
 * src/lib/label-design.ts — نفس الدوال بيتقري في الطباعة، فالشكل متطابق.
 */

import * as React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Barcode as BarcodeIcon,
  Copy,
  Hash,
  Loader2,
  Move,
  PenTool,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Shirt,
  Tag,
  Trash2,
  Type,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmtLabelPrice } from '@/lib/print'
import { renderBarcodeSvg } from '@/lib/print-client'
import {
  type LabelDesign,
  type LabelElement,
  type LabelElementType,
  LABEL_ELEMENT_META,
  MM_PX,
  defaultDesign,
  sanitizeDesign,
  refitDesign,
  nextElementId,
  elementHeightMm,
  maxLinesFor,
  alignOf,
} from '@/lib/label-design'

const MM = MM_PX // 1mm ≈ 3.78px @96dpi
const ring = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40'

export interface DesignerSample {
  name: string
  barcode: string
  price: number
  size?: string | null
  color?: string | null
}

interface TemplateRow {
  id: number
  name: string
  widthMm: number
  heightMm: number
  elements: unknown
  isDefault: boolean
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** آخر تصميم مفعّل في دايلوج الطباعة (null = أول مرة → ترتيب تلقائي). */
  initial: LabelDesign | null
  /** مقاس الملصق الحالي في دايلوج الطباعة — نقطة البداية لو مفيش تصميم محفوظ. */
  labelSize: { widthMm: number; heightMm: number }
  /** باقة فيها متغيرات (ملابس)؟ — بيحدد لو عنصر «المقاس واللون» يظهر في الترتيب الافتراضي. */
  variantsEnabled: boolean
  /** بيانات منتج حقيقي للمعاينة (اختياري — otherwise منتج تجريبي). */
  sample?: DesignerSample | null
  /** اضغط «تطبيق على الطباعة» → التصميم يرجع للدايلوج. */
  onApply: (design: LabelDesign, templateId: number | null, templateName: string | null) => void
}

const ELEMENT_ICONS: Record<LabelElementType, React.ComponentType<{ className?: string }>> = {
  name: Type,
  price: Tag,
  barcode: BarcodeIcon,
  barcodeText: Hash,
  variant: Shirt,
}

const DEFAULT_SAMPLE: DesignerSample = {
  name: 'منتج تجريبي',
  barcode: '2000000000017',
  price: 125.5,
}

/** ارتفاع SVG الباركود بالبكسل — نفس معادلة الطباعة (print-client) بالظبط
 *  عشان الباركود في المعاينة = الباركود المطبوع. */
const barHeightPx = (hMm: number) => Math.max(10, Math.round(hMm * MM))

/* ───────────────── محتوى العنصر — مشترك بين المصمم والمعاينة ───────────────── */

/** رندر عنصر واحد ببيانات منتج — نفس تنسيقات HTML الطباعة (print.ts →
 *  freeElementHtml) عشان «اللي بشوفه هو اللي هيطلع من الطابعة». */
export function LabelElementContent({
  el,
  design,
  name,
  barcode,
  price,
  size,
  color,
  svg,
}: {
  el: LabelElement
  design: Pick<LabelDesign, 'heightMm'>
  name: string
  barcode: string
  price?: number | null
  size?: string | null
  color?: string | null
  svg: string
}) {
  const family = "'Tahoma', 'Cairo', sans-serif"
  const align: React.CSSProperties = { textAlign: alignOf(el) }

  switch (el.type) {
    case 'name':
      return (
        <div
          dir="rtl"
          style={{
            ...align,
            fontFamily: family,
            fontSize: `${el.fontSizePt ?? 9}pt`,
            fontWeight: el.bold !== false ? 700 : 400,
            lineHeight: 1.15,
            wordBreak: 'break-word',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: maxLinesFor(el, design),
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
      )
    case 'variant': {
      const v = [size, color].filter((x) => !!x && String(x).trim()).join(' · ')
      if (!v) return null
      return (
        <div
          dir="rtl"
          style={{
            ...align,
            fontFamily: family,
            fontSize: `${el.fontSizePt ?? 9}pt`,
            fontWeight: el.bold !== false ? 700 : 400,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {v}
        </div>
      )
    }
    case 'price':
      return (
        <div
          dir="rtl"
          style={{
            ...align,
            fontFamily: family,
            fontSize: `${el.fontSizePt ?? 9}pt`,
            fontWeight: el.bold !== false ? 800 : 600,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {price != null ? `${fmtLabelPrice(price)} ج.م` : '—'}
        </div>
      )
    case 'barcodeText':
      return (
        <div
          dir="ltr"
          style={{
            ...align,
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: `${el.fontSizePt ?? 9}pt`,
            fontWeight: 700,
            letterSpacing: '0.06em',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {barcode}
        </div>
      )
    case 'barcode': {
      if (svg) {
        return (
          <div
            className="[&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: alignOf(el) === 'right' ? 'flex-end' : alignOf(el) === 'left' ? 'flex-start' : 'center',
              overflow: 'hidden',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )
      }
      return (
        <div
          style={{
            width: '100%',
            height: barHeightPx(el.heightMm ?? 8),
            background: 'repeating-linear-gradient(90deg, #000 0, #000 2px, transparent 2px, transparent 4px)',
            opacity: 0.25,
          }}
        />
      )
    }
    default:
      return null
  }
}

/* ───────────────────────────── المصمم ───────────────────────────── */

/** يقيس الحاوية ويرجّع أكبر scale يخلّي الملصق يدخل جواها (نفس useFit في دايلوج الطباعة).
 *
 *  🐞 إصلاح v28.1 (المعاينة كانت فاضية): الكانفس بيتولد بس لما design تجهز —
 *  يعني بعد أول commit — فكان useLayoutEffect بـ deps فاضية بيلاقي ref فاضي
 *  في أول (وآخر) تنفيذ له، والـ ResizeObserver مكانش بيتوصل أبدًا → scale فضل
 *  0 → الملصق ظل visibility:hidden للأبد. الحل: callback ref + state — أول ما
 *  الحاوية تتركب بترجّع node ونوصل الـ observer وقتها (وبنفكه لو اتشالت). */
function useStage(natW: number, natH: number, max = 3.5) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const [box, setBox] = React.useState({ w: 0, h: 0 })
  React.useEffect(() => {
    if (!node) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(node)
    return () => ro.disconnect()
  }, [node])
  const scale = box.w > 0 && box.h > 0 ? Math.min(max, box.w / natW, box.h / natH) : 0
  return { ref: setNode, scale }
}

export function LabelDesignerDialog({ open, onOpenChange, initial, labelSize, variantsEnabled, sample, onApply }: Props) {
  const [design, setDesign] = React.useState<LabelDesign | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [templates, setTemplates] = React.useState<TemplateRow[]>([])
  const [tid, setTid] = React.useState<number | null>(null)
  const [tname, setTname] = React.useState('')
  const [snap, setSnap] = React.useState(true)
  const [busy, setBusy] = React.useState(false)

  const s: DesignerSample = React.useMemo(() => {
    if (sample && sample.barcode) return sample
    return {
      ...DEFAULT_SAMPLE,
      ...(variantsEnabled ? { size: 'M', color: 'أحمر' } : {}),
    }
  }, [sample, variantsEnabled])

  const el = design?.elements.find((e) => e.id === selected) ?? null
  const barEl = design?.elements.find((e) => e.type === 'barcode') ?? null

  // SVG الباركود للعينة — بارتفاع عنصر الباركود الحالي (نفس معادلة الطباعة)
  const svg = React.useMemo(() => {
    if (typeof window === 'undefined' || !design || !s.barcode) return ''
    return renderBarcodeSvg(s.barcode, {
      height: barHeightPx(barEl?.heightMm ?? 8),
      availMm: barEl ? barEl.wMm : design.widthMm,
      fontSize: 8,
      displayValue: false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.widthMm, barEl?.heightMm, barEl?.wMm, barEl?.id, s.barcode])

  /* ── فتح المصمم: ابدأ من آخر تصميم أو الترتيب الافتراضي، وجيب القوالب ── */
  React.useEffect(() => {
    if (!open) return
    const d = initial ? sanitizeDesign(initial, labelSize.widthMm, labelSize.heightMm) : null
    setDesign(d ?? defaultDesign(labelSize.widthMm, labelSize.heightMm, { variant: variantsEnabled }))
    setSelected(null)
    setTid(null)
    setTname('')
    let cancelled = false
    ;(async () => {
      try {
        const rows = await api<unknown>('/api/label-templates')
        if (cancelled) return
        const list: TemplateRow[] = Array.isArray(rows) ? (rows as TemplateRow[]) : Array.isArray((rows as { data?: unknown })?.data) ? ((rows as { data: TemplateRow[] }).data) : []
        setTemplates(list)
        // أول مرة (مفيش تصميم مفعّل)؟ نحمّل القالب الافتراضي للمحل تلقائياً
        if (!d) {
          const def = list.find((t) => t.isDefault) ?? null
          if (def) {
            const td = sanitizeDesign({ widthMm: def.widthMm, heightMm: def.heightMm, elements: def.elements })
            if (td) {
              setDesign(td)
              setTid(def.id)
              setTname(def.name)
            }
          }
        }
      } catch {
        /* أوفلاين/فشل — نكمل بتصميم مبدئي محلي */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ── تعديل التصميم ── */
  const updateEl = (id: string, patch: Partial<LabelElement>) =>
    setDesign((prev) => (prev ? { ...prev, elements: prev.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : prev))

  const addElement = (type: LabelElementType) => {
    if (!design) return
    const W = design.widthMm
    const H = design.heightMm
    const pad = 2
    const base: LabelElement =
      type === 'barcode'
        ? { id: '', type, xMm: pad, yMm: Math.round((H / 3) * 10) / 10, wMm: Math.max(8, Math.round((W - pad * 2) * 10) / 10), heightMm: 8, align: 'center' }
        : { id: '', type, xMm: pad, yMm: Math.round((H / 3) * 10) / 10, wMm: Math.max(8, Math.round((W - pad * 2) * 10) / 10), fontSizePt: type === 'name' ? 10 : type === 'price' ? 11 : 8, bold: true, align: 'center' }
    const newEl = { ...base, id: nextElementId(design, type) }
    // نزحزح العنصر الجديد شوية لو فيه عنصر تاني في نفس المكان تقريباً
    const clash = design.elements.some((e) => Math.abs(e.yMm - newEl.yMm) < 1 && Math.abs(e.xMm - newEl.xMm) < 1)
    if (clash) newEl.yMm = Math.round(Math.min(H - elementHeightMm(newEl), newEl.yMm + 4) * 10) / 10
    setDesign({ ...design, elements: [...design.elements, newEl] })
    setSelected(newEl.id)
  }

  const duplicateEl = (e0: LabelElement) => {
    if (!design) return
    const copy: LabelElement = {
      ...e0,
      id: nextElementId(design, e0.type),
      xMm: Math.round(Math.min(design.widthMm - 2, e0.xMm + 2) * 10) / 10,
      yMm: Math.round(Math.min(design.heightMm - elementHeightMm(e0), e0.yMm + 2) * 10) / 10,
    }
    setDesign({ ...design, elements: [...design.elements, copy] })
    setSelected(copy.id)
  }

  const deleteEl = (id: string) => {
    if (!design) return
    setDesign({ ...design, elements: design.elements.filter((e) => e.id !== id) })
    setSelected(null)
  }

  const changeSize = (w: number, h: number) => {
    if (!design) return
    setDesign(refitDesign(design, w, h))
  }

  const resetAuto = () => {
    if (!design) return
    const hasText = design.elements.some((e) => e.type === 'barcodeText')
    setDesign(defaultDesign(design.widthMm, design.heightMm, { variant: variantsEnabled, text: hasText }))
    setSelected(null)
    toast.info('رجعنا الترتيب التلقائي — عدّل براحتك')
  }

  /* ── السحب بالإصبع/الماوس (Pointer Events — شغال على الموبايل والكمبيوتر) ── */
  const dragRef = React.useRef<{ id: string; px: number; py: number; ox: number; oy: number } | null>(null)
  const stage = useStage(design ? design.widthMm * MM : 1, design ? design.heightMm * MM : 1)
  const scale = stage.scale

  const snapV = (v: number) => (snap ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100)

  const startDrag = (e: React.PointerEvent, target: LabelElement) => {
    if (!design) return
    e.preventDefault()
    e.stopPropagation()
    setSelected(target.id)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragRef.current = { id: target.id, px: e.clientX, py: e.clientY, ox: target.xMm, oy: target.yMm }
  }

  const moveDrag = (e: React.PointerEvent, target: LabelElement) => {
    const d = dragRef.current
    if (!d || d.id !== target.id || !design) return
    const dx = (e.clientX - d.px) / (MM * scale)
    const dy = (e.clientY - d.py) / (MM * scale)
    const maxX = Math.max(0, design.widthMm - Math.min(target.wMm, design.widthMm))
    const maxY = Math.max(0, design.heightMm - Math.min(elementHeightMm(target), design.heightMm))
    updateEl(target.id, {
      xMm: Math.max(0, Math.min(maxX, snapV(d.ox + dx))),
      yMm: Math.max(0, Math.min(maxY, snapV(d.oy + dy))),
    })
  }

  const endDrag = () => {
    dragRef.current = null
  }

  // ⌨️ الأسهم بتحرّك العنصر المختار — ضبط دقيق نص مم (Shift = ممّين)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!el || !design) return
    const step = e.shiftKey ? 2 : 0.5
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    }
    const mv = moves[e.key]
    if (!mv) return
    e.preventDefault()
    const maxX = Math.max(0, design.widthMm - Math.min(el.wMm, design.widthMm))
    const maxY = Math.max(0, design.heightMm - Math.min(elementHeightMm(el), design.heightMm))
    updateEl(el.id, {
      xMm: Math.max(0, Math.min(maxX, Math.round((el.xMm + mv[0]) * 10) / 10)),
      yMm: Math.max(0, Math.min(maxY, Math.round((el.yMm + mv[1]) * 10) / 10)),
    })
  }

  /* ── إدارة القوالب (حفظ على السيرفر — قوالب المحل) ── */
  const applyTemplate = (t: TemplateRow) => {
    const d = sanitizeDesign({ widthMm: t.widthMm, heightMm: t.heightMm, elements: t.elements })
    if (!d) {
      toast.error('القالب ده فيه بيانات غير صالحة')
      return
    }
    setDesign(d)
    setTid(t.id)
    setTname(t.name)
    setSelected(null)
  }

  const saveAsNew = async () => {
    if (!design || busy) return
    setBusy(true)
    try {
      const name = tname.trim() || `تصميم ${templates.length + 1}`
      const created = await api<TemplateRow>('/api/label-templates', {
        method: 'POST',
        body: { name, widthMm: design.widthMm, heightMm: design.heightMm, elements: design.elements },
      })
      setTid(created?.id ?? null)
      setTname(name)
      setTemplates((prev) => [...prev, ...(created?.id ? [created] : [])])
      toast.success(`اتحفظ القالب «${name}» — هيبقى متاح في كل مرات الطباعة`)
    } catch {
      toast.error('مقدرتش أحفظ القالب — جرّب تاني')
    } finally {
      setBusy(false)
    }
  }

  const saveUpdate = async () => {
    if (!design || busy) return
    if (!tid) return saveAsNew()
    setBusy(true)
    try {
      const name = tname.trim() || 'قالب'
      const updated = await api<TemplateRow>(`/api/label-templates/${tid}`, {
        method: 'PUT',
        body: { name, widthMm: design.widthMm, heightMm: design.heightMm, elements: design.elements },
      })
      setTemplates((prev) => prev.map((t) => (t.id === tid ? { ...t, ...updated, id: tid } : t)))
      setTname(name)
      toast.success(`اتحدّث القالب «${name}»`)
    } catch {
      toast.error('مقدرتش أحدّث القالب — جرّب تاني')
    } finally {
      setBusy(false)
    }
  }

  const deleteTemplate = async () => {
    if (!tid || busy) return
    if (!window.confirm(`تمسح القالب «${tname || 'ده'}» نهائياً؟`)) return
    setBusy(true)
    try {
      await api(`/api/label-templates/${tid}`, { method: 'DELETE' })
      setTemplates((prev) => prev.filter((t) => t.id !== tid))
      setTid(null)
      setTname('')
      toast.success('اتمسح القالب')
    } catch {
      toast.error('مقدرتش أمسح القالب — جرّب تاني')
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!design) return
    if (design.elements.length === 0) {
      toast.error('التصميم فاضي — ضيف عنصر واحد على الأقل (أو رجّع الترتيب التلقائي)')
      return
    }
    onApply(design, tid, tname.trim() || null)
  }

  const selectedEl = el
  const sizePresets = [
    { w: 40, h: 30 },
    { w: 50, h: 30 },
    { w: 30, h: 20 },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex h-[94dvh] max-h-[94dvh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-foreground/10 bg-card p-0 shadow-2xl sm:max-w-6xl"
      >
        {/* ═══ الرأس ═══ */}
        <header className="relative shrink-0 bg-zinc-900 px-4 pb-4 pt-4 text-zinc-50 sm:px-6">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-900 shadow-sm">
              <PenTool className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p dir="ltr" className="text-start text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-zinc-400">
                Label Designer
              </p>
              <DialogTitle className="mt-1.5 text-lg font-extrabold leading-tight text-zinc-50">
                مصمم الملصقات — سحب وإفلات
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs font-medium text-zinc-300">
                اسحب أي عنصر لأي مكان، واضغط عليه لتغيير حجمه ومحاذاته — واللي تشوفه هو اللي هيطبع.
              </DialogDescription>
            </div>
          </div>
        </header>

        {/* ═══ الجسم: الكانفس + لوحة الخصائص ═══ */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* الكانفس */}
          <div className="relative min-h-[300px] flex-1 bg-muted/40 text-foreground">
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(to right, color-mix(in oklab, currentColor 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, currentColor 5%, transparent) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
            {design && (
              <div
                ref={stage.ref}
                dir="ltr"
                tabIndex={0}
                role="application"
                aria-label="لوحة تصميم الملصق — اسحب العناصر أو استخدم الأسهم"
                onKeyDown={onKeyDown}
                className="absolute inset-4 flex select-none items-center justify-center outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 rounded-xl"
              >
                <div className="relative shrink-0" style={{ width: design.widthMm * MM * scale, height: design.heightMm * MM * scale, visibility: scale ? 'visible' : 'hidden' }}>
                  <div className="absolute left-0 top-0" style={{ width: design.widthMm * MM, height: design.heightMm * MM, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    <div
                      onClick={() => setSelected(null)}
                      className="relative shadow-[0_6px_24px_rgba(0,0,0,0.14)]"
                      style={{
                        width: design.widthMm * MM,
                        height: design.heightMm * MM,
                        background: '#fff',
                        border: '1px solid #d4d4d4',
                        backgroundImage: snap
                          ? 'linear-gradient(to right, rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.045) 1px, transparent 1px)'
                          : undefined,
                        backgroundSize: `${MM}px ${MM}px`,
                      }}
                    >
                      {design.elements.map((e0) => {
                        const on = selected === e0.id
                        const Icon = ELEMENT_ICONS[e0.type]
                        return (
                          <div
                            key={e0.id}
                            role="button"
                            aria-label={`${LABEL_ELEMENT_META[e0.type].label} — اسحب لتحريكه`}
                            onPointerDown={(ev) => startDrag(ev, e0)}
                            onPointerMove={(ev) => moveDrag(ev, e0)}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setSelected(e0.id)
                            }}
                            style={{
                              position: 'absolute',
                              left: e0.xMm * MM,
                              top: e0.yMm * MM,
                              width: e0.wMm * MM,
                              cursor: 'grab',
                              touchAction: 'none',
                              outline: on ? '2px solid #17843f' : '1px dashed transparent',
                              outlineOffset: 2,
                              borderRadius: 2,
                            }}
                            className={cn('group', !on && 'hover:outline-dashed hover:outline-foreground/40')}
                          >
                            <LabelElementContent
                              el={e0}
                              design={design}
                              name={s.name}
                              barcode={s.barcode}
                              price={s.price}
                              size={s.size}
                              color={s.color}
                              svg={e0.type === 'barcode' ? svg : ''}
                            />
                            {on && (
                              <span className="pointer-events-none absolute -top-2.5 start-0 flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
                                <Move className="size-2.5" aria-hidden />
                                {LABEL_ELEMENT_META[e0.type].label}
                              </span>
                            )}
                            {!on && (
                              <span className="pointer-events-none absolute -top-2 start-0 hidden items-center gap-1 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold text-background shadow group-hover:flex">
                                <Icon className="size-2.5" aria-hidden />
                                {LABEL_ELEMENT_META[e0.type].label}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      {design.elements.length === 0 && (
                        <div className="flex h-full items-center justify-center px-4 text-center text-xs font-bold text-foreground/40" dir="rtl">
                          الملصق فاضي — ضيف عناصر من اللوحة الجانبية
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 start-0 end-0 text-center text-[11px] font-medium text-foreground/50" dir="rtl">
              اسحب العناصر بالإصبع أو الماوس · الأسهم = ضبط بنص مم · <bdi dir="ltr">{design?.widthMm}×{design?.heightMm}</bdi> مم
            </div>
          </div>

          {/* لوحة الخصائص */}
          <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-card p-4 lg:w-72 lg:border-s lg:border-t-0">
            {selectedEl ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
                    {React.createElement(ELEMENT_ICONS[selectedEl.type], { className: 'size-4 text-primary' })}
                    {LABEL_ELEMENT_META[selectedEl.type].label}
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 rounded-lg px-2" onClick={() => duplicateEl(selectedEl)} title="تكرار العنصر">
                      <Copy className="size-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 rounded-lg px-2 text-destructive hover:bg-destructive/10" onClick={() => deleteEl(selectedEl.id)} title="حذف العنصر">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {selectedEl.type !== 'barcode' && (
                  <>
                    <NumField
                      label="حجم الخط (pt)"
                      value={selectedEl.fontSizePt ?? 9}
                      min={4}
                      max={40}
                      step={0.5}
                      onChange={(v) => updateEl(selectedEl.id, { fontSizePt: v })}
                    />
                    <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2.5">
                      <span className="text-sm font-bold">خط غامق</span>
                      <Switch checked={selectedEl.bold !== false} onCheckedChange={(v) => updateEl(selectedEl.id, { bold: v })} />
                    </div>
                  </>
                )}

                {selectedEl.type === 'barcode' && (
                  <NumField
                    label="طول خطوط الباركود (مم)"
                    value={selectedEl.heightMm ?? 8}
                    min={2}
                    max={Math.max(4, Math.round(design?.heightMm ?? 30))}
                    step={0.5}
                    onChange={(v) => updateEl(selectedEl.id, { heightMm: v })}
                  />
                )}

                <NumField
                  label="عرض العنصر (مم)"
                  value={selectedEl.wMm}
                  min={4}
                  max={Math.round(design?.widthMm ?? 40)}
                  step={0.5}
                  onChange={(v) => updateEl(selectedEl.id, { wMm: v })}
                />

                <div>
                  <p className="mb-1.5 text-xs font-bold text-foreground/70">المحاذاة داخل الصندوق</p>
                  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="المحاذاة">
                    {([
                      ['right', AlignRight],
                      ['center', AlignCenter],
                      ['left', AlignLeft],
                    ] as const).map(([a, Icon]) => (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={alignOf(selectedEl) === a}
                        onClick={() => updateEl(selectedEl.id, { align: a })}
                        className={cn(
                          'flex h-9 items-center justify-center rounded-xl border bg-card transition-colors',
                          ring,
                          alignOf(selectedEl) === a ? 'border-primary bg-primary/10 ring-1 ring-primary/50' : 'hover:bg-muted/60'
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    ))}
                  </div>
                </div>

                <p className="rounded-xl bg-muted p-3 text-[11px] font-medium leading-relaxed text-foreground/60">
                  اسحب العنصر لأي مكان — أو حرّكه بالأسهم (Shift + سهم = ممّين دفعة واحدة).
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
                    <Ruler className="size-4 text-primary" />
                    مقاس الملصق
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {sizePresets.map((p) => {
                    const on = design?.widthMm === p.w && design?.heightMm === p.h
                    return (
                      <button
                        key={`${p.w}x${p.h}`}
                        type="button"
                        onClick={() => changeSize(p.w, p.h)}
                        dir="ltr"
                        className={cn(
                          'h-9 rounded-xl border text-xs font-extrabold tabular-nums transition-colors',
                          ring,
                          on ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/50' : 'bg-card hover:bg-muted/60'
                        )}
                      >
                        {p.w}×{p.h}
                      </button>
                    )
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumField label="العرض (مم)" value={design?.widthMm ?? 40} min={10} max={300} step={1} onChange={(v) => changeSize(v, design?.heightMm ?? 30)} />
                  <NumField label="الارتفاع (مم)" value={design?.heightMm ?? 30} min={10} max={300} step={1} onChange={(v) => changeSize(design?.widthMm ?? 40, v)} />
                </div>

                <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2.5">
                  <span className="text-sm font-bold">
                    محاذاة للشبكة
                    <span className="block text-[11px] font-medium text-foreground/55">تثبيت بنص مم عشان الترتيب يطلع مظبوط</span>
                  </span>
                  <Switch checked={snap} onCheckedChange={setSnap} />
                </div>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold">
                    <Plus className="size-4 text-primary" />
                    ضيف عنصر
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(LABEL_ELEMENT_META) as LabelElementType[]).map((t) => {
                      const Icon = ELEMENT_ICONS[t]
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addElement(t)}
                          className={cn('flex h-10 items-center justify-center gap-1.5 rounded-xl border bg-card text-xs font-bold transition-colors hover:bg-primary/10 hover:border-primary/50', ring)}
                        >
                          <Icon className="size-3.5 text-primary" />
                          {LABEL_ELEMENT_META[t].label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Button variant="outline" className="h-10 w-full rounded-xl font-bold" onClick={resetAuto}>
                  <RotateCcw className="size-4" />
                  رجّع الترتيب التلقائي
                </Button>

                <p className="rounded-xl bg-muted p-3 text-[11px] font-medium leading-relaxed text-foreground/60">
                  اضغط على أي عنصر في الملصق لتعديل حجمه ومحاذاته. <b>{design?.elements.length ?? 0}</b> عناصر في التصميم.
                </p>
              </>
            )}
          </aside>
        </div>

        {/* ═══ الشريط السفلي: قوالب + تطبيق ═══ */}
        <footer className="shrink-0 space-y-2.5 border-t bg-card px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tid ?? ''}
              onChange={(ev) => {
                const t = templates.find((x) => x.id === Number(ev.target.value))
                if (t) applyTemplate(t)
              }}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 sm:flex-none sm:w-56"
              aria-label="القوالب المحفوظة"
            >
              <option value="">{templates.length ? '— اختار قالب محفوظ —' : '— مفيش قوالب محفوظة —'}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.widthMm}×{t.heightMm}){t.isDefault ? ' ★' : ''}
                </option>
              ))}
            </select>
            <input
              value={tname}
              onChange={(ev) => setTname(ev.target.value)}
              placeholder="اسم القالب"
              maxLength={60}
              className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm font-bold outline-none placeholder:font-medium placeholder:text-foreground/40 focus-visible:ring-[3px] focus-visible:ring-primary/40 sm:max-w-44"
              aria-label="اسم القالب"
            />
            <Button variant="outline" className="h-10 rounded-xl px-3 font-bold" onClick={saveUpdate} disabled={busy || !design}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {tid ? 'تحديث' : 'حفظ'}
            </Button>
            {tid != null && (
              <>
                <Button variant="outline" className="h-10 rounded-xl px-3 font-bold" onClick={saveAsNew} disabled={busy || !design}>
                  حفظ كنسخة
                </Button>
                <Button variant="outline" className="h-10 rounded-xl px-3 text-destructive hover:bg-destructive/10" onClick={deleteTemplate} disabled={busy}>
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
            <Button className="ms-auto h-10 rounded-xl px-5 font-bold" onClick={apply} disabled={!design}>
              <PenTool className="size-4" />
              تطبيق على الطباعة
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

/** حقل رقمي بخطوات صغيرة + أزرار −/＋ — نفس روح حقول الكميات في التطبيق. */
function NumField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 10) / 10))
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-foreground/70">{label}</p>
      <div dir="ltr" className="flex h-9 items-center overflow-hidden rounded-xl border bg-background">
        <button type="button" className="h-full w-9 shrink-0 text-lg font-bold text-foreground/60 transition-colors hover:bg-muted" onClick={() => onChange(clamp(value - step))} aria-label="نقص">
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(clamp(v))
          }}
          className="h-full min-w-0 flex-1 border-x bg-transparent px-2 text-center text-sm font-extrabold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" className="h-full w-9 shrink-0 text-lg font-bold text-foreground/60 transition-colors hover:bg-muted" onClick={() => onChange(clamp(value + step))} aria-label="زوّد">
          ＋
        </button>
      </div>
    </div>
  )
}
