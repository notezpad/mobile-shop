'use client'

import * as React from 'react'
import { Boxes, Loader2, Plus, Power, Trash2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useConfirm } from './ConfirmDialogProvider'
import { DialogHero, Field, IconBtn, InkInput, LockedNote, SectionTitle } from './product-dialog-ui'
import { INK_BTN, INK_BTN_OUTLINE } from './settings-ui'

interface ProductUnit {
  id: number
  productId: number
  name: string
  price: number | null
  barcode: string | null
  factor: number
  active: boolean
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: { id: number; name: string; price: number } | null
  onChanged?: () => void
}

const DOSE_PRESETS = [
  { name: 'ربع دستة',  factor: 3  },
  { name: 'نص دستة',   factor: 6  },
  { name: 'دستة',      factor: 12 },
  { name: 'دستة و نص', factor: 18 },
]

export function ProductUnitsDialog({ open, onOpenChange, product, onChanged }: Props) {
  const confirm = useConfirm()
  const [units, setUnits] = React.useState<ProductUnit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({ name: '', price: '', barcode: '', factor: '' })
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('multi_unit')
  // 🥬 2026-10-12: وحدات غذائية للمحلات الغذائية، وحدات دستة للباقي
  const isFoodVertical = useShopStore((s) => s.plan.businessType) === 'food'
  // 🥬 المواد الغذائية: كل الوحدات يدوية (مفيش وحدات تلقائية)
  const presets = DOSE_PRESETS
  const presetsLabel = 'وحدات الدستة تلقائيًا'
  const presetsHint = 'الوحدات التلقائية: ربع دستة (3) · نص دستة (6) · دستة (12) · دستة ونص (18) — بسعر القطعة × العدد.'
  const foodHint = 'ضيف الوحدات يدويًا: الاسم (مثلاً كيس كيلو / علبة) + عدد القطع + السعر.'

  const load = React.useCallback(async () => {
    if (!product) return
    setLoading(true)
    try {
      const u = await api<ProductUnit[]>(`/api/products/${product.id}/units?status=all`)
      setUnits(u)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }, [product])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const [bulkSaving, setBulkSaving] = React.useState(false)

  const reset = () => {
    setForm({ name: '', price: '', barcode: '', factor: '' })
  }

  const addPresets = async () => {
    if (!product) return
    const basePrice = product.price ?? 0
    setBulkSaving(true)
    try {
      const existingNames = new Set(units.map((u) => u.name))
      const toAdd = presets.filter((p) => !existingNames.has(p.name))
      if (toAdd.length === 0) {
        toast.info('وحدات الدستة موجودة بالفعل')
        return
      }
      for (const preset of toAdd) {
        await api(`/api/products/${product.id}/units`, {
          method: 'POST',
          body: {
            name: preset.name,
            price: basePrice > 0 ? Math.round(basePrice * preset.factor * 100) / 100 : null,
            barcode: null,
            factor: preset.factor,
          },
        })
      }
      toast.success(`تم إضافة ${toAdd.length} وحدة تلقائياً`)
      await load()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإضافة')
    } finally {
      setBulkSaving(false)
    }
  }

  const addUnit = async () => {
    if (!product) return
    if (!form.name.trim()) {
      toast.error('اسم الوحدة مطلوب')
      return
    }
    if (!form.factor || parseInt(form.factor, 10) <= 0) {
      toast.error('عدد القطع في الوحدة مطلوب')
      return
    }
    setSaving(true)
    try {
      await api(`/api/products/${product.id}/units`, {
        method: 'POST',
        body: {
          name: form.name.trim(),
          price: form.price ? Number(form.price) : null,
          barcode: form.barcode.trim() || null,
          factor: parseInt(form.factor, 10),
        },
      })
      toast.success('تم إنشاء الوحدة')
      reset()
      await load()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإنشاء')
    } finally {
      setSaving(false)
    }
  }

  const removeUnit = async (id: number) => {
    if (!product) return
    if (!(await confirm({ title: 'حذف الوحدة؟', description: 'الحذف نهائي — لو عايز توقفها مؤقتًا استخدم زرار التعطيل.' }))) return
    try {
      await api(`/api/products/${product.id}/units/${id}`, { method: 'DELETE' })
      toast.success('تم حذف الوحدة')
      await load()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const toggleUnit = async (u: ProductUnit) => {
    if (!product) return
    try {
      await api(`/api/products/${product.id}/units/${u.id}`, {
        method: 'PATCH',
        body: { active: !u.active },
      })
      toast.success(u.active ? 'تم تعطيل الوحدة' : 'تم تفعيل الوحدة')
      await load()
      onChanged?.()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHero
          icon={Boxes}
          title={isFoodVertical ? 'وحدات البيع' : 'وحدات البيع بالجملة'}
          subtitle={product?.name}
        />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {!enabled ? (
            <LockedNote>
              {isFoodVertical
                ? 'ميزة وحدات البيع (كيلو/كيس/طبق/برطمان) متاحة في باقات المواد الغذائية.'
                : 'ميزة البيع بالجملة (كرتونة/دستة/نص دستة) متاحة في الباقات الاحترافية فقط.'}
            </LockedNote>
          ) : (
            <>
              {/* ═════════ 1) إضافة وحدة ═════════ */}
              <section>
                <SectionTitle n={1}>إضافة وحدة</SectionTitle>
                <div className="space-y-4 rounded-2xl border bg-card p-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Field label="الاسم" htmlFor="u-name" className="col-span-2 sm:col-span-2">
                      <InkInput
                        id="u-name"
                        placeholder={isFoodVertical ? 'كيس كيلو / علبة / كرتونة' : 'دستة / نص دستة / كرتونة'}
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </Field>
                    <Field label="عدد القطع" htmlFor="u-factor">
                      <InkInput
                        id="u-factor"
                        num
                        type="number"
                        min={1}
                        value={form.factor}
                        onChange={(e) => setForm({ ...form, factor: e.target.value })}
                      />
                    </Field>
                    <Field label="السعر (اختياري)" htmlFor="u-price">
                      <InkInput
                        id="u-price"
                        num
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                      />
                    </Field>
                    <Field label="باركود (اختياري)" htmlFor="u-barcode" className="col-span-2 sm:col-span-4">
                      <InkInput
                        id="u-barcode"
                        num
                        className="text-start"
                        value={form.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={addUnit} disabled={saving || bulkSaving} className={cn('h-11 rounded-xl px-5 font-bold', INK_BTN)}>
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      إضافة الوحدة
                    </Button>
                    {!isFoodVertical && (
                      <Button
                        variant="outline"
                        onClick={addPresets}
                        disabled={saving || bulkSaving}
                        className={cn('h-11 rounded-xl px-4', INK_BTN_OUTLINE)}
                        title={presetsHint}
                      >
                        {bulkSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        {presetsLabel}
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-foreground/60">{isFoodVertical ? foodHint : presetsHint}</p>
                </div>
              </section>

              {/* ═════════ 2) الوحدات الحالية ═════════ */}
              <section>
                <SectionTitle
                  n={2}
                  aside={
                    units.length > 0 && (
                      <span className="text-xs font-semibold tabular-nums text-foreground/65">{units.length} وحدة</span>
                    )
                  }
                >
                  الوحدات الحالية
                </SectionTitle>
                {loading ? (
                  <p className="rounded-2xl border border-dashed bg-card/60 py-8 text-center text-sm font-medium text-foreground/65">
                    جاري التحميل...
                  </p>
                ) : units.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center">
                    <Boxes className="mx-auto size-6 text-foreground/40" aria-hidden />
                    <p className="mt-2 text-sm font-bold">لا توجد وحدات بعد</p>
                    <p className="mt-0.5 text-xs font-medium text-foreground/65">{isFoodVertical ? 'ضيف وحدة من فوق.' : 'ضيف وحدة من فوق أو استخدم وحدات الدستة التلقائية.'}</p>
                  </div>
                ) : (
                  <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-1.5">
                    {units.map((u) => (
                      <li
                        key={u.id}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50',
                          !u.active && 'opacity-55'
                        )}
                      >
                        <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-foreground text-background">
                          <b className="text-sm font-extrabold leading-none tabular-nums">{u.factor}</b>
                          <span className="text-[9px] font-semibold opacity-70">قطعة</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate text-sm font-extrabold">
                            {u.name}
                            {!u.active && (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground/65">معطلة</span>
                            )}
                          </p>
                          <p className="truncate text-xs font-medium tabular-nums text-foreground/65">
                            {u.price != null ? `${u.price} جنيه` : 'بسعر القطعة × العدد'}
                            {u.barcode ? ` · ${u.barcode}` : ''}
                          </p>
                        </div>
                        <IconBtn label={u.active ? 'تعطيل الوحدة' : 'تفعيل الوحدة'} onClick={() => toggleUnit(u)}>
                          <Power className={cn('size-4', !u.active && 'text-success-subtle-foreground')} />
                        </IconBtn>
                        <IconBtn label="حذف نهائي" danger onClick={() => removeUnit(u.id)}>
                          <Trash2 className="size-4" />
                        </IconBtn>
                      </li>
                    ))}
                  </ul>
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
