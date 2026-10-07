'use client'

import * as React from 'react'
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
  cost: number
  quantity: number
  minQuantity: number
  imagePath: string | null
  branchId?: number | null
  collection?: string | null
  retailMarginPercent?: number | null
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
  // Unit-Based Dynamic Pricing: per-product override of the tenant's default
  // retail margin %. Empty string = "use the tenant default".
  const [retailMarginPercent, setRetailMarginPercent] = React.useState<string>('')
  const [dirty, setDirty] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const capabilities = useShopStore((s) => s.plan.capabilities)
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
      setRetailMarginPercent(
        initial?.retailMarginPercent != null ? String(initial.retailMarginPercent) : ''
      )
      fetch('/api/branches').then(r => r.ok ? r.json() : []).then(setBranches).catch(() => setBranches([]))
    }
  }, [open, initial])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'فشل رفع الصورة')
      setImagePath(data.url)
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
        cost: parseFloat(cost) || 0,
        quantity: parseInt(quantity, 10) || 0,
        minQuantity: parseInt(minQuantity, 10) || 1,
        imagePath,
        branchId: branchId ? parseInt(branchId, 10) : null,
        collection: collection.trim() || null,
        // 🛡️ 2026-10-03: باقة احترافية فقط — لو مش pro نسيب الحقل خارج الطلب
        ...(capabilities.includes('dynamic_retail_pricing')
          ? { retailMarginPercent: retailMarginPercent.trim() !== '' ? parseFloat(retailMarginPercent) : null }
          : {}),
      }
      if (initial?.id) {
        await api(`/api/products/${initial.id}`, { method: 'PUT', body: payload })
        toast.success('تم تحديث المنتج')
        onSaved({ ...payload, id: initial.id })
      } else {
        const created = await api<ProductFormValues>('/api/products', {
          method: 'POST',
          body: payload,
        })
        // 🛡️ v11: أوفلاين الرد بيحمل الـ id المؤقت للمنتج المدمج في الكاش
        // المحلي — بنرجّعه مع الـ payload عشان إضافة المنتج الجديد للسلة
        // (أمر الشراء/البيع) تشتغل أوفلاين والمزامنة تظبط الـ id بعدين.
        if ((created as any)?.offline) {
          toast.success('تم حفظ المنتج محلياً — سيتم المزامنة عند عودة الاتصال')
          onSaved({ ...payload, id: (created as any).id } as ProductFormValues)
        } else {
          toast.success('تمت إضافة المنتج')
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
          title={initial?.id ? 'تعديل منتج' : 'إضافة منتج جديد'}
          chip={initial?.id && initial?.name ? initial.name : undefined}
          subtitle={initial?.id ? 'عدّل بيانات المنتج وسعره ومخزونه.' : 'سجّل المنتج مرة واحدة — وبعدها يظهر في البيع والمشتريات والمخزون.'}
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
                  onChange={(e) => edit(setName)(e.target.value)}
                  placeholder="اسم المنتج"
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
                  hint="لتجميع المنتجات وتطبيق خصم جماعي عليها"
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
                    placeholder="باركود المنتج"
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
              <Field label="سعر البيع" htmlFor="p-price" required>
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

              <Field label="رصيد افتتاحي (اختياري)" htmlFor="p-qty" hint="للبضاعة الموجودة عندك فعلاً. البضاعة الجديدة من مورد تدخل بأمر شراء">
                <InkInput
                  id="p-qty"
                  num
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => edit(setQuantity)(e.target.value)}
                />
              </Field>
              <Field label="حد التنبيه" htmlFor="p-min" hint="أقل كمية قبل ما يظهر «منخفض»">
                <InkInput
                  id="p-min"
                  num
                  type="number"
                  min={0}
                  value={minQuantity}
                  onChange={(e) => edit(setMinQuantity)(e.target.value)}
                />
              </Field>
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
