'use client'

import * as React from 'react'
import { Loader2, Plus, Power, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'

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
  const [units, setUnits] = React.useState<ProductUnit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({ name: '', price: '', barcode: '', factor: '' })
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('multi_unit')

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
      const toAdd = DOSE_PRESETS.filter((p) => !existingNames.has(p.name))
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
    if (!confirm('حذف الوحدة؟')) return
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
      <DialogContent mobileSheet className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>وحدات البيع بالجملة — {product?.name}</DialogTitle>
        </DialogHeader>

        {!enabled ? (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground dark:border-warning-subtle dark:bg-warning-subtle/20 dark:text-warning-subtle-foreground">
            ميزة البيع بالجملة (كرتونة/دستة/نص دستة) متاحة في الباقات الاحترافية فقط.
          </div>
        ) : (
          <>
            <div className="rounded-md border p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_1fr_1.4fr]">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">الاسم</Label>
                  <Input
                    placeholder="دستة / نص دستة / كرتونة"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">السعر (اختياري)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">باركود (اختياري)</Label>
                  <Input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">عدد القطع في الوحدة</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.factor}
                    onChange={(e) => setForm({ ...form, factor: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={addUnit} disabled={saving || bulkSaving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  إضافة الوحدة
                </Button>
                <Button
                  variant="outline"
                  onClick={addPresets}
                  disabled={saving || bulkSaving}
                  title="يضيف: ربع دستة (3) • نص دستة (6) • دستة (12) • دستة و نص (18)"
                >
                  {bulkSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  إضافة وحدات الدستة تلقائياً
                </Button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">جاري التحميل...</p>
              ) : units.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد وحدات بعد
                </p>
              ) : (
                <div className="space-y-2">
                  {units.map((u) => (
                    <div
                      key={u.id}
                      className={`rounded-md border p-3 ${!u.active ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{u.name}</p>
                            {!u.active && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                معطلة
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {u.factor} قطعة / وحدة
                            {u.price != null && ` • ${u.price} ج`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title={u.active ? 'تعطيل الوحدة' : 'تفعيل الوحدة'}
                            onClick={() => toggleUnit(u)}
                          >
                            <Power className={`size-4 ${u.active ? 'text-muted-foreground' : 'text-success-subtle-foreground'}`} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="حذف نهائي"
                            onClick={() => removeUnit(u.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
