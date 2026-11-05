'use client'

import * as React from 'react'
import { ChevronDown, Laptop, Loader2, Plug, Plus, Search, Shirt, Smartphone, Sparkles, Trash2, Dices, Wand2 } from 'lucide-react'
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
  KIND_META, LAPTOP_CPU_CHIPS, LAPTOP_STORAGE_CHIPS, PHONE_COLOR_CHIPS, RAM_CHIPS, STORAGE_CHIPS,
  composeLaptopConfig, composePhoneSpec, detectElectronicsKind, type ElectronicsKind,
} from '@/lib/electronics-variants'
import { CONDITION_LABEL, type VariantCondition } from '@/lib/variant-condition'

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
    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {items.map((c) => {
        const on = value.trim().toLowerCase() === c.toLowerCase()
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(on ? '' : c)}
            aria-pressed={on}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-bold transition-colors',
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
    <div className="flex h-11 overflow-hidden rounded-xl border bg-background p-1" role="radiogroup" aria-label="الحالة">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(value === o.v ? '' : o.v)}
          className={cn(
            'flex-1 rounded-lg px-3 text-sm font-bold transition-colors',
            value === o.v ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-muted/60',
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
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
  quantity: number
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
  const [form, setForm] = React.useState<{ size: string; color: string; barcode: string; quantity: number; price: string; condition: '' | VariantCondition }>({ size: '', color: '', barcode: '', quantity: 0, price: '', condition: '' })
  // مكوّنات «السعة/الكونفيج» للإلكترونيات — بتتجمّع في form.color وقت الإضافة
  const [spec, setSpec] = React.useState({ cpu: '', ram: '', storage: '' })
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
      const data = await api<ProductVariant[]>(`/api/products/${product.id}/variants`)
      setVariants(data)
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
      setSpec({ cpu: '', ram: '', storage: '' })
      setPreview(null)
      setSmartText('')
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
          ? composeLaptopConfig(spec.cpu, spec.ram, spec.storage)
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
      await api(`/api/products/${product.id}/variants`, {
        method: 'POST',
        body: {
          size: form.size.trim() || null,
          color: color1 || null,
          condition: isElectronics ? form.condition || null : null,
          barcode: normalizeBarcode(form.barcode),
          price,
          quantity: form.quantity || 0,
        },
      })
      toast.success('تم إضافة المتغير')
      // بنسيب الحالة والنوع زي ما هم — الغالب بتضيف أكتر من متغير ورا بعض
      setForm((f) => ({ size: '', color: '', barcode: '', quantity: 0, price: '', condition: f.condition }))
      setSpec((sp) => ({ ...sp, ram: '', storage: '' }))
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
    ? variants.filter((v) =>
        [v.size, v.color, v.barcode, v.condition ? CONDITION_LABEL[v.condition as VariantCondition] : null].some((x) => {
          const t = (x ?? '').toLowerCase()
          return t.includes(needle) || (needleAr !== '' && normAr(t).includes(needleAr))
        })
      )
    : variants
  const groups = React.useMemo(() => groupByColor(shownVariants), [shownVariants])
  // يفتح لوحده لو فيه لون واحد بس أو البحث شغال
  const autoOpen = needle !== '' || groups.length === 1
  const missingCount = variants.filter((v) => !v.barcode).length
  const ROW_GRID = isElectronics
    ? 'grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1.1fr)_5rem_4.5rem_2.25rem]'
    : 'grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5.5rem_5rem_2.25rem]'
  const secAdd = 2
  const secList = 3

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHero icon={KindIcon} title={isElectronics ? 'مواصفات المنتج' : 'متغيرات المنتج'} subtitle={product?.name} />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {!enabled ? (
            <LockedNote>ميزة المتغيرات (مواصفات/ألوان لكل منتج بسعر وكمية وباركود مستقل) مش مفعّلة في باقتك الحالية.</LockedNote>
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
                          setPreview(null)
                          setSpec({ cpu: '', ram: '', storage: '' })
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

              {/* ═════════ 1) مساعد الإدخال الذكي — عامية الملابس / الإلكترونيات ═════════ */}
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

              {/* ═════════ إضافة متغير يدويًا ═════════ */}
              <section>
                <SectionTitle n={secAdd}>إضافة متغير</SectionTitle>
                <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-4">
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
                            <InkInput id="v-cpu" placeholder="i7" value={spec.cpu} onChange={(e) => setSpec({ ...spec, cpu: e.target.value })} />
                            <ChipRow items={LAPTOP_CPU_CHIPS} value={spec.cpu} onPick={(v) => setSpec({ ...spec, cpu: v })} label="معالجات سريعة" />
                          </Field>
                          <Field label="الرام" htmlFor="v-ram" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-ram" placeholder="16GB" value={spec.ram} onChange={(e) => setSpec({ ...spec, ram: e.target.value })} />
                            <ChipRow items={RAM_CHIPS} value={spec.ram} onPick={(v) => setSpec({ ...spec, ram: v })} label="رام سريع" />
                          </Field>
                          <Field label="التخزين" htmlFor="v-storage" className="col-span-2 sm:col-span-2">
                            <InkInput id="v-storage" placeholder="512GB SSD" value={spec.storage} onChange={(e) => setSpec({ ...spec, storage: e.target.value })} />
                            <ChipRow items={LAPTOP_STORAGE_CHIPS} value={spec.storage} onPick={(v) => setSpec({ ...spec, storage: v })} label="تخزين سريع" />
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
                  <Field label="الباركود" htmlFor="v-barcode" className="col-span-2 sm:col-span-4">
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
                        className={cn('h-11 rounded-xl px-3.5', INK_BTN_OUTLINE)}
                        onClick={async () => {
                          const code = await fetchUniqueBarcode(existingBarcodes)
                          setForm((f) => ({ ...f, barcode: code }))
                        }}
                      >
                        <Dices className="size-4" />
                      </Button>
                      <Button onClick={addVariant} disabled={saving} className={cn('h-11 rounded-xl px-5 font-bold', INK_BTN)}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        إضافة
                      </Button>
                    </div>
                  </Field>
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
                      placeholder={`دوّر في ${variants.length} متغير (${isElectronics ? 'سعة / لون / حالة / باركود' : 'مقاس / لون / باركود'})…`}
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
                                <li className={cn('grid gap-2 bg-muted/20 px-3 py-1.5 text-[11px] font-bold text-foreground/65', ROW_GRID)}>
                                  <span>{opt2Label}</span>
                                  {isElectronics && <span>الحالة</span>}
                                  <span>الباركود</span>
                                  <span className="text-center">السعر</span>
                                  <span className="text-center">الكمية</span>
                                  <span />
                                </li>
                                {g.items.map((v) => (
                                  <li
                                    key={v.id}
                                    className={cn('grid items-center gap-2 px-3 py-1.5 text-sm', ROW_GRID)}
                                  >
                                    <span className="truncate font-bold">{v.size ?? '—'}</span>
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
                                    <span dir="ltr" className="truncate text-start font-mono text-xs text-foreground/75">
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
                                    <IconBtn label="حذف المتغير" danger onClick={() => removeVariant(v.id)}>
                                      <Trash2 className="size-4" />
                                    </IconBtn>
                                  </li>
                                ))}
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
