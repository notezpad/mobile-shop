'use client'

import * as React from 'react'
import { useUnsavedConfirm } from '@/hooks/use-dirty-confirm'
import { Dices, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { CategoryCombobox } from './CategoryCombobox'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { generateEan13 } from '@/lib/barcode'
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
        // الباقة الأساسية: الحقل مخفي فنسيبه خارج الطلب عشان ما نمسحش قيمة محفوظة
        ...(hasWholesale
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
        toast.success('تمت إضافة المنتج')
        onSaved(created)
      }
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        mobileSheet
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-[560px]"
      >
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-5 sm:px-6 sm:pt-6 sm:pb-4">
          <DialogTitle>
            {initial?.id ? 'تعديل منتج' : 'إضافة منتج جديد'}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* 1. name */}
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="p-name">
              الاسم <span className="text-destructive">*</span>
            </Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true) }}
              placeholder="اسم المنتج"
            />
          </div>

          {/* 2. category + collection (inline row) */}
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label>التصنيف</Label>
            <CategoryCombobox
              value={category}
              onChange={setCategory}
              placeholder="اختر أو اكتب تصنيف جديد..."
            />
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              يمكنك كتابة تصنيف جديد وسيتم إنشاؤه تلقائياً
            </p>
          </div>

          {hasCollections ? (
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="p-collection">الكوليكشن</Label>
              <Input
                id="p-collection"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="مثال: صيف 2026"
              />
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                لتجميع المنتجات وتطبيق خصم جماعي عليها
              </p>
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}

          {/* 4. barcode */}
          <div className="col-span-2 space-y-1.5">
            <Label>الباركود</Label>
            <div className="flex gap-2">
              <Input
                value={barcode ?? ''}
                onChange={(e) =>
                  setBarcode(e.target.value ? e.target.value : null)
                }
                placeholder="باركود المنتج"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setBarcode(generateEan13())}
              >
                <Dices className="size-4" />
                توليد
              </Button>
            </div>
          </div>

          {/* branch */}
          <div className="col-span-2 space-y-1.5">
            <Label>الفرع</Label>
            {branches.length > 0 ? (
              <Select value={branchId || 'none'} onValueChange={(v) => setBranchId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون فرع محدد</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}{(b as any).isMain ? ' ★' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                لم يتم إنشاء أي فرع بعد — يمكنك إضافة الفروع من قسم «الفروع».
              </div>
            )}
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              حدد الفرع الذي ينتمي إليه المنتج. الموظفون مرتبطون بفرع يرون فقط منتجاته.
            </p>
          </div>

          {/* 4. price */}
          <div className="space-y-1.5">
            <Label htmlFor="p-price">
              سعر البيع <span className="text-destructive">*</span>
            </Label>
            <Input
              id="p-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => { setPrice(e.target.value); setDirty(true) }}
            />
          </div>

          {/* 5. cost */}
          <div className="space-y-1.5">
            <Label htmlFor="p-cost">سعر التكلفة</Label>
            <Input
              id="p-cost"
              type="number"
              min={0}
              value={cost}
              onChange={(e) => { setCost(e.target.value); setDirty(true) }}
            />
          </div>

          {hasWholesale && (
            <>
          {/* 5.5 retail margin override — dynamic pricing for the "قطعة" unit only */}
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="p-retail-margin">نسبة هامش ربح القطعة (اختياري)</Label>
            <Input
              id="p-retail-margin"
              type="number"
              min={0}
              step="0.1"
              placeholder="افتراضي المحل"
              value={retailMarginPercent}
              onChange={(e) => { setRetailMarginPercent(e.target.value); setDirty(true) }}
            />
            <p className="text-[11px] text-muted-foreground">
              يُستخدم فقط لو التسعير التلقائي للقطعة مفعّل من الإعدادات. سيبه فاضي عشان يستخدم النسبة الافتراضية للمحل.
            </p>
          </div>
            </>
          )}

          {/* 6. quantity */}
          <div className="space-y-1.5">
            <Label htmlFor="p-qty">الكمية</Label>
            <Input
              id="p-qty"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setDirty(true) }}
            />
          </div>

          {/* 7. minQuantity */}
          <div className="space-y-1.5">
            <Label htmlFor="p-min">حد التنبيه</Label>
            <Input
              id="p-min"
              type="number"
              min={0}
              value={minQuantity}
              onChange={(e) => { setMinQuantity(e.target.value); setDirty(true) }}
            />
          </div>

          {/* 8. image */}
          <div className="col-span-2 space-y-1.5">
            <Label>الصورة</Label>
            <div className="flex items-center gap-3">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted sm:size-[100px]">
                {imagePath ? (
                  <img
                    src={imagePath}
                    alt="منتج"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  اختيار صورة
                </Button>
                {imagePath && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setImagePath(null)}
                  >
                    <Trash2 className="size-4" />
                    إزالة
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        </DialogBody>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t bg-card px-4 py-3 sm:px-6 sm:py-4 max-sm:[&>button]:flex-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
