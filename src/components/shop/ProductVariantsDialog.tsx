'use client'

import * as React from 'react'
import { Loader2, Plus, Sparkles, Trash2, Dices, Wand2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { parseVariantText, type ParsedVariantRow } from '@/lib/variantParser'
import { generateUniqueEan13 } from '@/lib/barcode'

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
  const [smartText, setSmartText] = React.useState('')
  const [preview, setPreview] = React.useState<ParsedVariantRow[] | null>(null)
  const [previewWarnings, setPreviewWarnings] = React.useState<string[]>([])
  const [bulkSaving, setBulkSaving] = React.useState(false)
  const [generatingId, setGeneratingId] = React.useState<number | null>(null)
  const [bulkGenerating, setBulkGenerating] = React.useState(false)
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

  const analyzeSmartText = () => {
    if (!smartText.trim()) return
    const result = parseVariantText(smartText, product?.name)
    setPreview(result.variants)
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
    // Track codes as we hand them out so two rows in the same batch can
    // never collide, on top of not reusing any barcode this product
    // already has.
    const usedBarcodes = new Set(existingBarcodes)
    for (const row of preview) {
      const barcode = generateUniqueEan13(usedBarcodes)
      usedBarcodes.add(barcode)
      try {
        await api(`/api/products/${product.id}/variants`, {
          method: 'POST',
          body: {
            size: row.size,
            color: row.color,
            barcode,
            quantity: row.quantity || 0,
          },
        })
        okCount++
      } catch {
        failCount++
      }
    }
    setBulkSaving(false)
    if (okCount) toast.success(`تمت إضافة ${okCount} متغير`)
    if (failCount) toast.error(`فشلت إضافة ${failCount} متغير (تكرار باركود أو خطأ)`)
    setPreview(null)
    setSmartText('')
    await load()
    onChanged?.()
  }

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

  const generateForVariant = async (id: number) => {
    if (!product) return
    setGeneratingId(id)
    try {
      const barcode = generateUniqueEan13(existingBarcodes)
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
    let okCount = 0
    let failCount = 0
    for (const v of missing) {
      const barcode = generateUniqueEan13(used)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>متغيرات المنتج — {product?.name}</DialogTitle>
        </DialogHeader>

        {!enabled ? (
          <div className="rounded-md border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground dark:border-warning-subtle dark:bg-warning-subtle/20 dark:text-warning-subtle-foreground">
            ميزة المتغيرات (مقاسات/ألوان) متاحة في باقات الملابس والأحذية فقط.
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded-md border p-3">
              <Label className="flex items-center gap-1 text-xs">
                <Sparkles className="size-3.5" />
                مساعد الإدخال الذكي — اكتب الوصف بالعامية
              </Label>
              <Textarea
                placeholder='مثال: كوتشي فلات أسود وكحلي مقاسات زوجي من 40 لـ 44 والكمية قطعتين'
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                rows={2}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={analyzeSmartText} disabled={!smartText.trim()}>
                  <Sparkles className="size-4" />
                  تحليل
                </Button>
              </div>

              {preview && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                  {previewWarnings.length > 0 && (
                    <ul className="list-inside list-disc text-xs text-warning-subtle-foreground">
                      {previewWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  {preview.length === 0 ? (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      مقدرتش أطلّع متغيرات من الجملة دي، جرّب تعيد صياغتها
                    </p>
                  ) : (
                    <>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-right font-medium">اللون</th>
                            <th className="text-right font-medium">المقاس</th>
                            <th className="text-center font-medium">الكمية</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className="border-t">
                              <td className="py-1.5">{row.color ?? '—'}</td>
                              <td>{row.size ?? '—'}</td>
                              <td className="w-20 text-center">
                                <Input
                                  type="number"
                                  min={0}
                                  value={row.quantity}
                                  onChange={(e) => updatePreviewQty(i, parseInt(e.target.value) || 0)}
                                  className="h-7 text-center"
                                />
                              </td>
                              <td className="w-8">
                                <Button size="icon" variant="ghost" onClick={() => removePreviewRow(i)}>
                                  <Trash2 className="size-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
                          إلغاء
                        </Button>
                        <Button size="sm" onClick={addAllPreviewRows} disabled={bulkSaving}>
                          {bulkSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                          إضافة الكل ({preview.length})
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

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
                <div className="flex gap-1">
                  <Input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="توليد باركود"
                    onClick={() =>
                      setForm((f) => ({ ...f, barcode: generateUniqueEan13(existingBarcodes) }))
                    }
                  >
                    <Dices className="size-4" />
                  </Button>
                </div>
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

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {variants.length > 0 ? `${variants.length} متغير` : ''}
              </p>
              {variants.some((v) => !v.barcode) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={generateMissingBarcodes}
                  disabled={bulkGenerating}
                >
                  {bulkGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  توليد الباركودات الناقصة
                </Button>
              )}
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
                        <td className="font-mono text-xs">
                          {v.barcode ?? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              title="توليد باركود"
                              disabled={generatingId === v.id}
                              onClick={() => generateForVariant(v.id)}
                            >
                              {generatingId === v.id
                                ? <Loader2 className="size-3.5 animate-spin" />
                                : <Dices className="size-3.5" />
                              }
                            </Button>
                          )}
                        </td>
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
