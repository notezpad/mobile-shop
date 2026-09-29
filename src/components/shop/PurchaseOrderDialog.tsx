'use client'

import * as React from 'react'
import { Loader2, Plus, Search, Trash2, PackagePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProductDialog, type ProductFormValues } from './ProductDialog'

interface ProductLite {
  id: number
  name: string
  barcode: string | null
  cost: number
  quantity: number
}

interface SupplierLite {
  id: number
  name: string
  phone: string | null
  balance: number
}

interface CartItem {
  product: ProductLite
  cost: number
  quantity: number
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultSupplierId?: number | null
  onSaved?: () => void
}

export function PurchaseOrderDialog({
  open,
  onOpenChange,
  defaultSupplierId,
  onSaved,
}: Props) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<ProductLite[]>([])
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchLoading, setSearchLoading] = React.useState(false)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [suppliers, setSuppliers] = React.useState<SupplierLite[]>([])
  const [supplierId, setSupplierId] = React.useState<string>('none')
  const [paidFull, setPaidFull] = React.useState(true)
  const [paidAmount, setPaidAmount] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const [newProductOpen, setNewProductOpen] = React.useState(false)
  const [newProductSeed, setNewProductSeed] = React.useState('')
  const [pendingToday, setPendingToday] = React.useState<ProductLite[]>([])

  React.useEffect(() => {
    if (!open) return
    setCart([])
    setQuery('')
    setResults([])
    setPaidFull(true)
    setPaidAmount(0)
    setSupplierId(defaultSupplierId ? String(defaultSupplierId) : 'none')
    api<SupplierLite[]>('/api/suppliers')
      .then(setSuppliers)
      .catch(() => {})
    api<{ id: number; name: string }[]>('/api/categories')
      .then(setCategories)
      .catch(() => {})
    api<ProductLite[]>('/api/products/pending-today')
      .then(setPendingToday)
      .catch(() => setPendingToday([]))
  }, [open, defaultSupplierId])

  // debounced product search
  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearchOpen(false)
      return
    }
    setSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await api<{ data: ProductLite[] } | ProductLite[]>(
          `/api/products?search=${encodeURIComponent(q)}`
        )
        const data = Array.isArray(res) ? res : (res as any)?.data ?? []
        setResults(data)
        setSearchOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const total = cart.reduce((s, i) => s + i.cost * i.quantity, 0)
  const selectedSupplier =
    supplierId !== 'none' ? suppliers.find((s) => String(s.id) === supplierId) : null

  // منتجات النهاردة اللي لسه معملهاش دخول فعلي للمخزون ولا اتحطت في السلة
  const visiblePendingToday = pendingToday.filter(
    (p) => !cart.some((c) => c.product.id === p.id)
  )

  const addAllPendingToday = () => {
    setCart((prev) => {
      const toAdd = visiblePendingToday.filter(
        (p) => !prev.some((c) => c.product.id === p.id)
      )
      return [...prev, ...toAdd.map((p) => ({ product: p, cost: p.cost, quantity: 1 }))]
    })
  }

  const addToCart = (p: ProductLite) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === p.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { product: p, cost: p.cost, quantity: 1 }]
    })
    setQuery('')
    setResults([])
    setSearchOpen(false)
  }

  const updateQty = (id: number, q: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id ? { ...i, quantity: Math.max(1, q) } : i
      )
    )
  }
  const updateCost = (id: number, c: number) => {
    setCart((prev) =>
      prev.map((i) => (i.product.id === id ? { ...i, cost: Math.max(0, c) } : i))
    )
  }
  const removeItem = (id: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== id))
  }

  // بعد ما نضيف منتج جديد من نافذة "إضافة منتج جديد" المدمجة، بنضيفه للسلة على طول
  // بستخدام المنتج المرجّع فعليًا من الـ API (مش بالتخمين عن طريق البحث بالاسم)
  const handleNewProductSaved = (saved?: ProductFormValues) => {
    setNewProductOpen(false)
    setNewProductSeed('')
    if (saved?.id) {
      addToCart({
        id: saved.id,
        name: saved.name,
        barcode: saved.barcode ?? null,
        cost: saved.cost,
        quantity: saved.quantity,
      })
      toast.success('تم إضافة المنتج الجديد للسلة')
    }
  }

  const submit = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة')
      return
    }
    const paid = paidFull ? total : paidAmount
    if (!Number.isFinite(paid) || paid < 0) {
      toast.error('المبلغ المدفوع غير صالح')
      return
    }
    if (paid < total && supplierId === 'none') {
      toast.error('الشراء بالآجل لازم يكون مرتبط بمورد')
      return
    }
    if (paid > total && supplierId === 'none') {
      toast.error('المدفوع أكبر من إجمالي الفاتورة، اختر مورداً ليُسجَّل الفرق كرصيد دائن لك عنده')
      return
    }
    setSubmitting(true)
    try {
      const order = await api<any>('/api/purchase-orders', {
        method: 'POST',
        body: {
          items: cart.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
            cost: i.cost,
          })),
          supplierId: supplierId !== 'none' ? Number(supplierId) : null,
          paid,
        },
      })
      toast.success(`تم تسجيل أمر الشراء بنجاح - ${order.orderNo}`)
      onSaved?.()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ أمر الشراء')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-5 text-start sm:px-6 sm:pt-6 sm:pb-4">
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" />
            أمر شراء جديد
          </DialogTitle>
          <DialogDescription className="sr-only">
            تسجيل فاتورة شراء من مورد وإضافة الأصناف للمخزون
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4">
          {/* Supplier select */}
          <div className="space-y-1.5">
            <Label>المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر المورد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون مورد (كاش فقط)</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.balance > 0 ? ` — عليه ${formatCurrency(s.balance)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSupplier && selectedSupplier.balance > 0 && (
              <p className="rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
                ⚠ يوجد مستحق سابق لهذا المورد: {formatCurrency(selectedSupplier.balance)}
              </p>
            )}
          </div>

          {/* Product search */}
          <div className="relative space-y-1.5">
            <Label>إضافة صنف</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الباركود..."
                className="pr-9"
              />
            </div>
            {searchOpen && (
              <Card className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto py-0 shadow-lg">
                <CardContent className="p-1">
                  {searchLoading ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">
                      جارِ البحث...
                    </p>
                  ) : results.length === 0 ? (
                    <div className="p-3 text-center">
                      <p className="mb-2 text-xs text-muted-foreground">
                        لا توجد نتائج — لازم يكون المنتج مسجّل في الكتالوج الأول
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewProductSeed(query.trim())
                          setNewProductOpen(true)
                          setSearchOpen(false)
                        }}
                      >
                        <Plus className="size-4" />
                        إضافة منتج جديد باسم &quot;{query.trim()}&quot;
                      </Button>
                    </div>
                  ) : (
                    results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addToCart(p)}
                        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-right text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          مخزون: {p.quantity} — تكلفة: {formatCurrency(p.cost)}
                        </span>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* بانر: منتجات جديدة النهاردة لسه معملهاش دخول فعلي للمخزون */}
          {visiblePendingToday.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-info-subtle bg-info-subtle px-3 py-2.5">
              <p className="text-sm text-info-subtle-foreground">
                في <span className="font-semibold">{visiblePendingToday.length}</span> منتج
                جديد اتضاف النهاردة ولسه ملهمش أمر شراء
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-info-subtle bg-background hover:bg-info-subtle"
                onClick={addAllPendingToday}
              >
                <Plus className="size-4" />
                إضافة الكل للسلة
              </Button>
            </div>
          )}

          {/* Cart — موبايل: كروت (كمية وتكلفة بإدخال مريح) */}
          <div className="space-y-2 md:hidden">
            {cart.length === 0 ? (
              <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                السلة فارغة — ابحث وأضف أصناف
              </p>
            ) : (
              cart.map((i) => (
                <div key={i.product.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{i.product.name}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mt-1 -ml-1 size-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeItem(i.product.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">الكمية</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={i.quantity}
                        onChange={(e) => updateQty(i.product.id, parseInt(e.target.value, 10) || 1)}
                        className="h-9 text-center tabular-nums"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">تكلفة الوحدة</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={i.cost}
                        onChange={(e) => updateCost(i.product.id, parseFloat(e.target.value) || 0)}
                        className="h-9 text-center tabular-nums"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-[11px] text-muted-foreground">الإجمالي</p>
                      <p className="flex h-9 items-center justify-center text-sm font-semibold tabular-nums">
                        {formatCurrency(i.cost * i.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart — ديسكتوب: جدول */}
          <Card className="hidden overflow-hidden py-0 md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto" dir="ltr">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead className="w-24 text-center">الكمية</TableHead>
                      <TableHead className="w-28 text-center">تكلفة الوحدة</TableHead>
                      <TableHead className="w-28 text-center">الإجمالي</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          السلة فارغة — ابحث وأضف أصناف
                        </TableCell>
                      </TableRow>
                    ) : (
                      cart.map((i) => (
                        <TableRow key={i.product.id}>
                          <TableCell className="font-medium">
                            {i.product.name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={1}
                              value={i.quantity}
                              onChange={(e) =>
                                updateQty(i.product.id, parseInt(e.target.value, 10) || 1)
                              }
                              className="h-8 w-16 text-center tabular-nums"
                              dir="ltr"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={i.cost}
                              onChange={(e) =>
                                updateCost(i.product.id, parseFloat(e.target.value) || 0)
                              }
                              className="h-8 w-20 text-center tabular-nums"
                              dir="ltr"
                            />
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {formatCurrency(i.cost * i.quantity)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:text-destructive"
                              onClick={() => removeItem(i.product.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Payment */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">الإجمالي</span>
              <span className="text-lg font-bold tabular-nums">
                {formatCurrency(total)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="po-paid-full"
                checked={paidFull}
                onCheckedChange={(v) => setPaidFull(v === true)}
              />
              <Label htmlFor="po-paid-full" className="text-sm font-normal">
                تم دفع كامل المبلغ كاش
              </Label>
            </div>
            {!paidFull && (
              <div className="space-y-1.5">
                <Label htmlFor="po-paid-amount">المبلغ المدفوع الآن</Label>
                <Input
                  id="po-paid-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  dir="ltr"
                  className="text-left"
                />
                <p
                  className={cn(
                    'text-xs',
                    supplierId === 'none' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  الباقي آجل على المحل: {formatCurrency(Math.max(0, total - paidAmount))}
                  {supplierId === 'none' && ' — يجب اختيار مورد للشراء بالآجل'}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap gap-2 border-t bg-card px-4 py-3 sm:px-6 sm:py-4 max-sm:[&>button]:flex-1">
          <Button onClick={submit} disabled={submitting || cart.length === 0}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            <Plus className="size-4" />
            حفظ أمر الشراء
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>

      <ProductDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        initial={{ name: newProductSeed, barcode: newProductSeed }}
        categories={categories}
        onSaved={handleNewProductSaved}
      />
    </Dialog>
  )
}
