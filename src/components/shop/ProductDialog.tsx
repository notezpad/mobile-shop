'use client'

import { uploadImage } from '@/lib/upload-image'
import * as React from 'react'
import { useVocab } from '@/lib/vocab'
import { useUnsavedConfirm } from '@/hooks/use-dirty-confirm'
import { Dices, ImagePlus, Loader2, Tag, Trash2, Upload } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CategoryCombobox } from './CategoryCombobox'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { generateEan13 } from '@/lib/barcode'
import { DialogHero, Field, InkInput, SectionTitle } from './product-dialog-ui'
import { INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
import { cn } from '@/lib/utils'
import { UNIT_PRESETS, DEFAULT_UNIT_LABEL, cleanUnitLabel, guessUnitLabel, unitOf } from '@/lib/unit-label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface ProductFormValues {
  id?: number
  name: string
  category: string | null
  barcode: string | null
  price: number
  /** null = التكلفة مخفية عن المستخدم (RBAC) */
  cost: number | null
  quantity: number
  minQuantity: number
  imagePath: string | null
  branchId?: number | null
  collection?: string | null
  retailMarginPercent?: number | null
  // 🥬 2026-10-12: بيع بالوزن (غذائية فقط) — السعر = سعر الكيلو والكمية بكسور
  soldByWeight?: boolean
  // 🥬 2026-10-12: وحدة المنتج (علبة/كيس/برطمان...) — null = قطعة
  unitLabel?: string | null
  // 👕 الموسم + المعروض (فاشون فقط) — المعروض ≤ الكمية
  season?: 'ALL_YEAR' | 'SUMMER' | 'WINTER'
  displayQty?: number
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: Partial<ProductFormValues> | null
  categories: { id: number; name: string }[]
  onSaved: (saved?: ProductFormValues) => void
}

export function ProductDialog({
  open,
  onOpenChange,
  initial,
  categories,
  onSaved,
}: Props) {
  const [name, setName] = React.useState('')
  const [category, setCategory] = React.useState<string | null>(null)
  const [barcode, setBarcode] = React.useState<string | null>(null)
  const [price, setPrice] = React.useState('')
  const [cost, setCost] = React.useState('0')
  const [quantity, setQuantity] = React.useState('0')
  const [minQuantity, setMinQuantity] = React.useState('1')
  const [imagePath, setImagePath] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [branchId, setBranchId] = React.useState<string>('')
  const [branches, setBranches] = React.useState<{ id: number; name: string }[]>([])
  const [collection, setCollection] = React.useState<string>('')
  // 🥬 2026-10-12: بيع بالوزن — متاح للمحلات الغذائية فقط (كيلو بكسور)
  const [soldByWeight, setSoldByWeight] = React.useState(false)
  // 🥬 2026-10-12: وحدة المنتج — '' = قطعة. unitAuto = لسه بنخمّنها من الاسم (المستخدم ماغيّرهاش بإيده)
  const [unitLabel, setUnitLabel] = React.useState('')
  const [unitAuto, setUnitAuto] = React.useState(true)
  // Unit-Based Dynamic Pricing: per-product override of the tenant's default
  // retail margin %. Empty string = "use the tenant default".
  const [retailMarginPercent, setRetailMarginPercent] = React.useState<string>('')
  // 👕 الموسم (فاشون فقط) + عدد المقاسات
  // 🧹 2026-10-23: خانة «المعروض على الرف» اتشالت من الفورم — كانت بيلخبطوا
  // (افتراضي 0 → الكمية كلها بتدخل المخزن الداخلي والصنف مبيظهرش في الكاشير).
  // بقى: كل الكمية بتدخل معروضة، والمخزن الداخلي للموسم بس (زر «المواسم»).
  const [season, setSeason] = React.useState<'ALL_YEAR' | 'SUMMER' | 'WINTER'>('ALL_YEAR')
  const [variantCount, setVariantCount] = React.useState<number | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const capabilities = useShopStore((s) => s.plan.capabilities)
  // 🥬 2026-10-12: توoggle البيع بالوزن بيظهر للمحلات الغذائية بس
  const isFoodVertical = useShopStore((s) => s.plan.businessType) === 'food'
  // 👕 2026-10-22: الموسم/المعروض بيظهروا لباقات الملابس فقط
  const isFashionVertical = useShopStore((s) => s.plan.businessType) === 'fashion'
  const t = useVocab()
  const { onOpenChange: handleOpenChange } = useUnsavedConfirm({
    dirty,
    onClose: () => onOpenChange(false),
  })
  const hasCollections = capabilities.includes('collections')
  // نسبة هامش القطعة خاصة بباقة الجملة (multi_unit) فقط
  const hasWholesale = capabilities.includes('multi_unit')

  // sync when opening / initial changes
  React.useEffect(() => {
    if (open) {
      setDirty(false)
      setName(initial?.name ?? '')
      setCategory(initial?.category ?? null)
      setBarcode(initial?.barcode ?? null)
      setPrice(initial?.price != null ? String(initial.price) : '')
      setCost(initial?.cost != null ? String(initial.cost) : '0')
      setQuantity(initial?.quantity != null ? String(initial.quantity) : '0')
      setMinQuantity(initial?.minQuantity != null ? String(initial.minQuantity) : '1')
      setImagePath(initial?.imagePath ?? null)
      setBranchId(initial?.branchId != null ? String(initial.branchId) : '')
      setCollection((initial as any)?.collection ?? '')
      // 🥬 2026-10-12: بيع بالوزن
      setSoldByWeight((initial as any)?.soldByWeight === true)
      // منتج جديد → التخمين من الاسم شغال. منتج قديم → مانغيّرش وحدته من نفسنا (نقترح بس).
      setUnitLabel(initial?.unitLabel ?? '')
      setUnitAuto(!initial?.id)
      setRetailMarginPercent(
        initial?.retailMarginPercent != null ? String(initial.retailMarginPercent) : ''
      )
      fetch('/api/branches').then(r => r.ok ? r.json() : []).then(setBranches).catch(() => setBranches([]))
      // 👕 الموسم (فاشون) — المعروض مش من الفورم تاني (كل الكمية معروضة افتراضيًا)
      setSeason((initial as any)?.season ?? 'ALL_YEAR')
      // عدد المقاسات: المنتج اللي له ألوان/مقاسات المعروض بيتقسم على مستوى المقاس
      if (initial?.id && isFashionVertical) {
        fetch(`/api/products/${initial.id}/variants`)
          .then((r) => (r.ok ? r.json() : []))
          .then((vs: unknown[]) => setVariantCount(Array.isArray(vs) ? vs.length : 0))
          .catch(() => setVariantCount(0))
      } else {
        setVariantCount(0)
      }
    }
  }, [open, initial])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      setImagePath(await uploadImage(file, 'product'))
      toast.success('تم رفع الصورة')
    } catch (e: any) {
      toast.error(e?.message || 'فشل رفع الصورة')
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('الاسم مطلوب')
      return
    }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('سعر البيع غير صالح')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        category: category || null,
        barcode: barcode?.trim() || null,
        price: priceNum,
        // 🔒 لو التكلفة مخفية عن المستخدم ما نبعتهاش خالص (كانت هتتبعت ٠ وتتحفظ غلط أو تترفض من السيرفر)
        ...(costHidden ? {} : { cost: parseFloat(cost) || 0 }),
        // 🥬 2026-10-12: الكمية Float — بيع بالوزن بكسور (45.5 كيلو)
        quantity: Math.round((parseFloat(quantity) || 0) * 1000) / 1000,
        minQuantity: Math.round((parseFloat(minQuantity) || 0) * 100) / 100 || 1,
        imagePath,
        branchId: branchId ? parseInt(branchId, 10) : null,
        collection: collection.trim() || null,
        // 🥬 2026-10-12: بيع بالوزن (غذائية فقط — السيرفر بيتحقق برضه)
        ...(isFoodVertical ? { soldByWeight } : {}),
        // 🥬 2026-10-12: وحدة المنتج (علبة/كيس/...) — '' يعني قطعة. المنتج بالوزن بالكيلو مالوش وحدة.
        ...(isFoodVertical ? { unitLabel: soldByWeight ? null : cleanUnitLabel(unitLabel) } : {}),
        // 🛡️ 2026-10-03: باقة احترافية فقط — لو مش pro نسيب الحقل خارج الطلب
        ...(capabilities.includes('dynamic_retail_pricing')
          ? { retailMarginPercent: retailMarginPercent.trim() !== '' ? parseFloat(retailMarginPercent) : null }
          : {}),
        // 👕 الموسم — فاشون فقط (والسيرفر بيتحقق برضه).
        // 🧹 2026-10-23: مبنبعتش displayQty خالص — السيرفر هو اللي بيظبطها:
        // إضافة → الكمية كلها معروضة، تعديل → الزيادة تروح للعرض والنقص من المعروض
        // الأول (displayAfterTotalChange) فتقسيمة الموسم المقفول مش بتتبوظ.
        ...(isFashionVertical ? { season } : {}),
      }
      if (initial?.id) {
        await api(`/api/products/${initial.id}`, { method: 'PUT', body: payload })
        toast.success(t('تم تحديث المنتج'))
        // 🛡️ FIX (tsc): نفس cast السطر اللي بعده — الـ payload قد يكون بدون cost
        // (لو التكلفة مخفية RBAC) فالشكل الحرفي مش مطابق لـ ProductFormValues.
        onSaved({ ...payload, id: initial.id } as ProductFormValues)
      } else {
        const created = await api<ProductFormValues>('/api/products', {
          method: 'POST',
          body: payload,
        })
        // 🛡️ v11: أوفلاين الرد بيحمل الـ id المؤقت للمنتج المدمج في الكاش
        // المحلي — بنرجّعه مع الـ payload عشان إضافة المنتج الجديد للسلة
        // (أمر الشراء/البيع) تشتغل أوفلاين والمزامنة تظبط الـ id بعدين.
        if ((created as any)?.offline) {
          toast.success(t('تم حفظ المنتج محلياً — سيتم المزامنة عند عودة الاتصال'))
          onSaved({ ...payload, id: (created as any).id } as ProductFormValues)
        } else {
          toast.success(t('تمت إضافة المنتج'))
          onSaved(created)
        }
      }
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  // نفس المنطق القديم، بس أي تعديل في أي حقل بيعلّم النموذج «متغيّر» (للتأكيد قبل الإغلاق)
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setDirty(true)
  }

  const priceNum = parseFloat(price)
  const costHidden = !!initial && initial.cost == null
  const costNum = parseFloat(cost)
  const showMargin = Number.isFinite(priceNum) && priceNum > 0 && Number.isFinite(costNum) && costNum > 0
  const profit = showMargin ? priceNum - costNum : 0
  const profitPct = showMargin ? (profit / costNum) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        mobileSheet
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          if (typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches) {
            document.getElementById('p-name')?.focus()
          }
        }}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-[600px]"
      >
        <DialogHero
          icon={Tag}
          title={t(initial?.id ? 'تعديل منتج' : 'إضافة منتج جديد')}
          chip={initial?.id && initial?.name ? initial.name : undefined}
          subtitle={t(initial?.id ? 'عدّل بيانات المنتج وسعره ومخزونه.' : 'سجّل المنتج مرة واحدة — وبعدها يظهر في البيع والمشتريات والمخزون.')}
        />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {/* ═════════ 1) البيانات الأساسية ═════════ */}
          <section>
            <SectionTitle n={1}>البيانات الأساسية</SectionTitle>
            <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-4">
              <Field label="الاسم" htmlFor="p-name" required className="col-span-2">
                <InkInput
                  id="p-name"
                  value={name}
                  onChange={(e) => {
                    edit(setName)(e.target.value)
                    // 🥬 فهم الاسم: رز → كيس، زبادي → علبة، مربى → برطمان (طول ما المستخدم ماغيّرش الوحدة بإيده)
                    if (isFoodVertical && unitAuto) setUnitLabel(guessUnitLabel(e.target.value) ?? '')
                  }}
                  placeholder={t('اسم المنتج')}
                />
              </Field>

              <Field
                label="التصنيف"
                className="col-span-2 sm:col-span-1"
                hint="اكتب تصنيف جديد وهيتعمل تلقائيًا"
              >
                <CategoryCombobox
                  value={category}
                  onChange={edit(setCategory)}
                  placeholder="اختر أو اكتب تصنيف جديد..."
                />
              </Field>

              {hasCollections ? (
                <Field
                  label="الكوليكشن"
                  htmlFor="p-collection"
                  className="col-span-2 sm:col-span-1"
                  hint={t('لتجميع المنتجات وتطبيق خصم جماعي عليها')}
                >
                  <InkInput
                    id="p-collection"
                    value={collection}
                    onChange={(e) => edit(setCollection)(e.target.value)}
                    placeholder="مثال: صيف 2026"
                  />
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}

              <Field label="الباركود" htmlFor="p-barcode" className="col-span-2">
                <div className="flex gap-2">
                  <InkInput
                    id="p-barcode"
                    num
                    wrapperClassName="flex-1"
                    className="text-start"
                    value={barcode ?? ''}
                    onChange={(e) => edit(setBarcode)(e.target.value ? e.target.value : null)}
                    placeholder={t('باركود المنتج')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('h-11 rounded-xl px-4', INK_BTN_OUTLINE)}
                    onClick={() => edit(setBarcode)(generateEan13())}
                  >
                    <Dices className="size-4" />
                    توليد
                  </Button>
                </div>
              </Field>

              <Field
                label="الفرع"
                className="col-span-2"
                hint={branches.length > 0 ? 'الموظفون المرتبطون بفرع بيشوفوا منتجاته بس.' : undefined}
              >
                {branches.length > 0 ? (
                  <Select
                    value={branchId || 'none'}
                    onValueChange={(v) => edit(setBranchId)(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="h-11 w-full rounded-xl">
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون فرع محدد</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                          {(b as any).isMain ? ' ★' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-xs font-medium text-foreground/65">
                    لم يتم إنشاء أي فرع بعد — تقدر تضيف الفروع من قسم «الفروع».
                  </div>
                )}
              </Field>
            </div>
          </section>

          {/* ═════════ 2) الأسعار والمخزون ═════════ */}
          <section>
            <SectionTitle n={2}>الأسعار والمخزون</SectionTitle>
            <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-4">
              <Field
                label={soldByWeight ? 'سعر الكيلو' : 'سعر البيع'}
                htmlFor="p-price"
                required
              >
                <InkInput
                  id="p-price"
                  num
                  type="number"
                  min={0}
                  suffix="جنيه"
                  value={price}
                  onChange={(e) => edit(setPrice)(e.target.value)}
                />
              </Field>
              {!costHidden && (
                <Field label="سعر التكلفة" htmlFor="p-cost">
                  <InkInput
                    id="p-cost"
                    num
                    type="number"
                    min={0}
                    suffix="جنيه"
                    value={cost}
                    onChange={(e) => edit(setCost)(e.target.value)}
                  />
                </Field>
              )}

              {/* 🥬 2026-10-12: بيع بالوزن — للمحلات الغذائية بس (كيلو بكسور) */}
              {isFoodVertical && (
                <label
                  htmlFor="p-weight"
                  className="col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3.5 transition-colors hover:bg-muted"
                >
                  <span className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5"><path d="M12 3v3.5"/><path d="m16.5 7.5 2-2"/><path d="m7.5 7.5-2-2"/><path d="M6 14h12l-1.2-6H7.2L6 14Z"/><path d="m6 14-2 4c6 2 12 2 16 0l-2-4"/></svg>
                    </span>
                    <span>
                      <span className="block text-[15px] font-extrabold">يُباع بالوزن (بالكيلو)</span>
                      <span className="block text-[12.5px] leading-snug text-foreground/70">
                        الكمية بيتكتب كيلو بكسور (مثال: لحمة 1.65) — السعر اللي فوق يبقى سعر الكيلو، والكمية تحت كيلو في المخزن.
                      </span>
                    </span>
                  </span>
                  <input
                    id="p-weight"
                    type="checkbox"
                    className="peer sr-only"
                    checked={soldByWeight}
                    onChange={(e) => edit(setSoldByWeight)(e.target.checked)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition-colors',
                      soldByWeight ? 'bg-emerald-600' : 'bg-foreground/25',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full bg-white shadow transition-transform',
                        soldByWeight ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
                      )}
                    />
                  </span>
                </label>
              )}

              {/* 🥬 2026-10-12: وحدة المنتج (علبة/كيس/برطمان...) — غذائية، لغير منتجات الوزن */}
              {isFoodVertical && !soldByWeight && (
                <div className="col-span-2 space-y-2 rounded-xl border bg-muted/40 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[15px] font-extrabold">{t('وحدة المنتج')}</span>
                    <span className="text-[12px] font-semibold text-foreground/65">
                      {unitAuto && unitLabel ? 'اتحددت تلقائي من الاسم — غيّرها لو عايز' : 'بتظهر في البيع والمخزون: «3 علب» بدل «3 قطعة»'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {UNIT_PRESETS.map((u) => {
                      const active = unitOf(unitLabel) === u
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => {
                            setUnitAuto(false)
                            setUnitLabel(u === DEFAULT_UNIT_LABEL ? '' : u)
                            setDirty(true)
                          }}
                          className={cn(
                            'h-9 touch-manipulation rounded-full border px-3.5 text-sm font-bold transition-colors',
                            active
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'bg-card text-foreground/80 hover:bg-muted',
                          )}
                        >
                          {u}
                        </button>
                      )
                    })}
                  </div>
                  <InkInput
                    id="p-unit"
                    value={UNIT_PRESETS.includes(unitOf(unitLabel) as (typeof UNIT_PRESETS)[number]) ? '' : unitLabel}
                    onChange={(e) => {
                      setUnitAuto(false)
                      setUnitLabel(e.target.value)
                      setDirty(true)
                    }}
                    maxLength={20}
                    placeholder="أو اكتب وحدة تانية (مثال: دستة، شيكارة)"
                  />
                  {/* منتج قديم وحدته «قطعة» والاسم واضح؟ نقترح من غير ما نغيّر من نفسنا */}
                  {!unitAuto && !unitLabel && name.trim() && guessUnitLabel(name) && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnitLabel(guessUnitLabel(name) ?? '')
                        setDirty(true)
                      }}
                      className="text-[12.5px] font-bold text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      اقتراح من الاسم: {guessUnitLabel(name)} — اضغط للتطبيق
                    </button>
                  )}
                </div>
              )}

              {showMargin && (
                <p
                  className={cn(
                    'col-span-2 flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold tabular-nums',
                    profit >= 0 ? 'bg-success-subtle text-success-subtle-foreground' : 'bg-destructive/10 text-destructive'
                  )}
                >
                  <span>{profit >= 0 ? 'ربحك في القطعة' : 'خسارة في القطعة'}</span>
                  <span>
                    {Math.abs(Math.round(profit * 100) / 100)} جنيه · {Math.abs(Math.round(profitPct))}٪ من التكلفة
                  </span>
                </p>
              )}

              {/* 🛡️ 2026-10-03: حقل نسبة الهامش — باقة احترافية فقط */}
              {capabilities.includes('dynamic_retail_pricing') && (
                <Field
                  label="نسبة هامش ربح القطعة (اختياري)"
                  htmlFor="p-retail-margin"
                  className="col-span-2"
                  hint="بتُستخدم لو التسعير التلقائي للقطعة مفعّل من الإعدادات. سيبه فاضي عشان يستخدم النسبة الافتراضية للمحل."
                >
                  <InkInput
                    id="p-retail-margin"
                    num
                    type="number"
                    min={0}
                    step="0.1"
                    suffix="٪"
                    placeholder="افتراضي المحل"
                    value={retailMarginPercent}
                    onChange={(e) => edit(setRetailMarginPercent)(e.target.value)}
                  />
                </Field>
              )}

              <Field
                label={soldByWeight ? 'الكمية (كيلو في المخزن)' : 'الكمية'}
                htmlFor="p-qty"
                hint={soldByWeight ? 'تقبل كسور — مثال: 45.5 يعني 45 كيلو ونص' : undefined}
              >
                <InkInput
                  id="p-qty"
                  num
                  type="number"
                  min={0}
                  step={soldByWeight ? 0.05 : undefined}
                  value={quantity}
                  onChange={(e) => edit(setQuantity)(e.target.value)}
                />
              </Field>
              <Field
                label={soldByWeight ? 'حد التنبيه (كيلو)' : 'حد التنبيه'}
                htmlFor="p-min"
                hint={soldByWeight ? 'أقل وزن قبل ما يظهر «منخفض» — مثال: 2.5' : 'أقل كمية قبل ما يظهر «منخفض»'}
              >
                <InkInput
                  id="p-min"
                  num
                  type="number"
                  min={0}
                  step={soldByWeight ? 0.5 : undefined}
                  value={minQuantity}
                  onChange={(e) => edit(setMinQuantity)(e.target.value)}
                />
              </Field>

              {/* 👕 الموسم — فاشون فقط (الافتراضي طوال السنة) */}
              {isFashionVertical && (
                <Field
                  label="الموسم"
                  htmlFor="p-season"
                  hint="صنف «طوال السنة» مابيتأثرش بإغلاق الموسم ويفضل ظاهر في نقطة البيع"
                >
                  <div role="group" aria-label="الموسم" className="flex rounded-xl bg-muted/60 p-1">
                    {(
                      [
                        ['ALL_YEAR', 'طوال السنة'],
                        ['SUMMER', '☀ صيفي'],
                        ['WINTER', '❄ شتوي'],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        id={v === season ? 'p-season' : undefined}
                        type="button"
                        aria-pressed={season === v}
                        onClick={() => edit(setSeason)(v)}
                        className={cn(
                          'h-8 flex-1 rounded-lg text-xs font-bold transition-colors',
                          season === v
                            ? v === 'SUMMER'
                              ? 'bg-amber-500 text-white shadow-sm'
                              : v === 'WINTER'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'bg-foreground text-background shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {isFashionVertical && variantCount != null && variantCount > 0 && (
                <p className="col-span-full rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                  المنتج ده له ألوان ومقاسات — تقسيمة المعروض/المخزن الداخلي بتتظبط من «الألوان والمقاسات» وزر «المواسم»
                </p>
              )}
            </div>
          </section>

          {/* ═════════ 3) الصورة ═════════ */}
          <section>
            <SectionTitle n={3}>الصورة</SectionTitle>
            <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-muted/50 sm:size-28">
                {imagePath ? (
                  <img src={imagePath} alt="منتج" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="size-8 text-foreground/40" />
                )}
              </div>
              <div className="flex min-w-0 flex-col items-start gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      handleUpload(f)
                      setDirty(true)
                    }
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className={cn('h-10 rounded-xl', INK_BTN_OUTLINE)}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {imagePath ? 'تغيير الصورة' : 'اختيار صورة'}
                </Button>
                {imagePath && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => edit(setImagePath)(null)}
                  >
                    <Trash2 className="size-4" />
                    إزالة
                  </Button>
                )}
                <p className="text-[11px] font-medium text-foreground/60">PNG أو JPG أو WebP</p>
              </div>
            </div>
          </section>
        </div>

        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {Number.isFinite(priceNum) && priceNum >= 0 && price !== '' ? (
                <>
                  <p className="text-[11px] font-semibold text-foreground/60">سعر البيع</p>
                  <p className="truncate text-lg font-extrabold tabular-nums">{priceNum} جنيه</p>
                </>
              ) : (
                <p className="text-xs font-semibold text-foreground/65">اكتب الاسم وسعر البيع عشان تحفظ</p>
              )}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-5">
              إلغاء
            </Button>
            <Button onClick={submit} disabled={saving} className={cn('h-11 rounded-xl px-6 font-bold', INK_BTN)}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              حفظ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
