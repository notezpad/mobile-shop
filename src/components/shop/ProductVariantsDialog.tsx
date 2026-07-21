'use client'

import * as React from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
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

export interface ProductVariant {
  id: number
  productId: number
  size: string | null
  color: string | null
  barcode: string | null
  quantity: number
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: { id: number; name: string } | null
  onChanged?: () => void
}

export function ProductVariantsDialog({ open, onOpenChange, product, onChanged }: Props) {
  const [variants, setVariants] = React.useState<ProductVariant[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({ size: '', color: '', barcode: '', quantity: 0 })
  const capabilities = useShopStore((s) => s.plan.capabilities)
  const enabled = capabilities.includes('variants')

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

  const addVariant = async () => {
    if (!product) return
    if (!form.size.trim() && !form.color.trim()) {
      toast.error('لازم مقاس أو لون على الأقل')
      return
    }
    setSaving(true)
    try {
      await api(`/api/products/${product.id}/variants`, {
        method: 'POST',
        body: {
          size: form.size.trim() || null,
          color: form.color.trim() || null,
          barcode: form.barcode.trim() || null,
          quantity: form.quantity || 0,
        },
      })
      toast.success('تم إضافة المتغير')
      setForm({ size: '', color: '', barcode: '', quantity: 0 })
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
    if (!confirm('حذف المتغير؟')) return
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>متغيرات المنتج — {product?.name}</DialogTitle>
        </DialogHeader>

        {!enabled ? (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground dark:border-warning-subtle dark:bg-warning-subtle/20 dark:text-warning-subtle-foreground">
            ميزة المتغيرات (مقاسات/ألوان) متاحة في باقات الملابس والأحذية فقط.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-5">
              <div>
                <Label className="text-xs">المقاس</Label>
                <Input
                  placeholder="S / 42"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">اللون</Label>
                <Input
                  placeholder="أحمر"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">الباركود</Label>
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">الكمية</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <Button onClick={addVariant} disabled={saving} className="self-end">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                إضافة
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">جاري التحميل...</p>
              ) : variants.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد متغيرات بعد
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-right font-medium">المقاس</th>
                      <th className="text-right font-medium">اللون</th>
                      <th className="text-right font-medium">الباركود</th>
                      <th className="text-center font-medium">الكمية</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-2">{v.size ?? '—'}</td>
                        <td>{v.color ?? '—'}</td>
                        <td className="font-mono text-xs">{v.barcode ?? '—'}</td>
                        <td className="w-24 text-center">
                          <Input
                            type="number"
                            min={0}
                            value={v.quantity}
                            onChange={(e) =>
                              updateQty(v.id, parseInt(e.target.value) || 0)
                            }
                            className="h-8 text-center"
                          />
                        </td>
                        <td className="w-10">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeVariant(v.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
