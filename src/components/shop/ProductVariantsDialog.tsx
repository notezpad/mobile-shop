'use client'

import * as React from 'react'
import { Loader2, Plus, Search, Shirt, Sparkles, Trash2, Dices, Wand2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useShopStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useConfirm } from './ConfirmDialogProvider'
import { DialogHero, Field, IconBtn, INK_INPUT, InkInput, LockedNote, SectionTitle } from './product-dialog-ui'
import { INK_BTN, INK_BTN_OUTLINE } from './settings-ui'
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
  const confirm = useConfirm()
  const [vq, setVq] = React.useState('')
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

  const needle = vq.trim().toLowerCase()
  const shownVariants = needle
    ? variants.filter((v) =>
        [v.size, v.color, v.barcode].some((x) => (x ?? '').toLowerCase().includes(needle))
      )
    : variants
  const missingCount = variants.filter((v) => !v.barcode).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHero icon={Shirt} title="متغيرات المنتج" subtitle={product?.name} />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {!enabled ? (
            <LockedNote>ميزة المتغيرات (مقاسات/ألوان) متاحة في باقات الملابس والأحذية فقط.</LockedNote>
          ) : (
            <>
              {/* ═════════ 1) المساعد الذكي ═════════ */}
              <section>
                <SectionTitle n={1}>مساعد الإدخال الذكي</SectionTitle>
                <div className="space-y-3 rounded-2xl border bg-card p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                    <Sparkles className="size-3.5" aria-hidden />
                    اكتب الوصف بالعامية وأنا أطلّع المقاسات والألوان والكميات.
                  </p>
                  <textarea
                    placeholder="مثال: كوتشي فلات أسود وكحلي مقاسات زوجي من 40 لـ 44 والكمية قطعتين"
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
                            <li className="grid grid-cols-[1fr_1fr_5rem_2.25rem] gap-2 bg-muted/50 px-3 py-1.5 text-[11px] font-bold text-foreground/65">
                              <span>اللون</span>
                              <span>المقاس</span>
                              <span className="text-center">الكمية</span>
                              <span />
                            </li>
                            {preview.map((row, i) => (
                              <li key={i} className="grid grid-cols-[1fr_1fr_5rem_2.25rem] items-center gap-2 px-3 py-1.5 text-sm font-semibold">
                                <span className="truncate">{row.color ?? '—'}</span>
                                <span className="truncate">{row.size ?? '—'}</span>
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

              {/* ═════════ 2) إضافة متغير يدويًا ═════════ */}
              <section>
                <SectionTitle n={2}>إضافة متغير</SectionTitle>
                <div className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-4">
                  <Field label="المقاس" htmlFor="v-size">
                    <InkInput id="v-size" placeholder="S / 42" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
                  </Field>
                  <Field label="اللون" htmlFor="v-color">
                    <InkInput id="v-color" placeholder="أحمر" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                  </Field>
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
                        onClick={() => setForm((f) => ({ ...f, barcode: generateUniqueEan13(existingBarcodes) }))}
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

              {/* ═════════ 3) المتغيرات الحالية ═════════ */}
              <section>
                <SectionTitle
                  n={3}
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
                      placeholder={`دوّر في ${variants.length} متغير (مقاس / لون / باركود)…`}
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
                    <Shirt className="mx-auto size-6 text-foreground/40" aria-hidden />
                    <p className="mt-2 text-sm font-bold">لا توجد متغيرات بعد</p>
                  </div>
                ) : (
                  <ul className="max-h-[20rem] divide-y overflow-y-auto overscroll-contain rounded-2xl border bg-card">
                    <li className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_5rem_2.25rem] gap-2 bg-muted px-3 py-2 text-[11px] font-bold text-foreground/70">
                      <span>المقاس</span>
                      <span>اللون</span>
                      <span>الباركود</span>
                      <span className="text-center">الكمية</span>
                      <span />
                    </li>
                    {shownVariants.map((v) => (
                      <li
                        key={v.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_5rem_2.25rem] items-center gap-2 px-3 py-1.5 text-sm"
                      >
                        <span className="truncate font-bold">{v.size ?? '—'}</span>
                        <span className="truncate font-semibold">{v.color ?? '—'}</span>
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
                    {shownVariants.length === 0 && (
                      <li className="px-4 py-8 text-center text-sm font-medium text-foreground/65">مفيش متغير بالبحث ده</li>
                    )}
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
