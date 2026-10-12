'use client'

/**
 * أمر شراء جديد — واجهة بهوية صفحة المشتريات (بترولي).
 * المنطق والـ API والتحقق زي ما هم؛ اتغيّر الشكل وطريقة اختيار الدفع:
 *   دفعت كله / دفعت جزء / آجل  (بدل الـ checkbox)
 * ومعاه لوحة فاتورة داكنة بتوضّح المدفوع والآجل ورصيد المورد بعد الأمر.
 */

import * as React from 'react'
import { Check, ChevronDown, Info, Loader2, PackagePlus, Plus, Search, Trash2, Truck, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProductDialog, type ProductFormValues } from './ProductDialog'
import { DecimalInput, DialogHero, MethodPills, SectionTitle, Stepper } from './purchase-dialog-ui'

interface ProductLite {
  id: number
  name: string
  barcode: string | null
  cost: number
  quantity: number
  // 🥬 2026-10-12: بيع بالوزن — الشراء بيبقى بالكيلو بكسور
  soldByWeight?: boolean
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

type PayMode = 'full' | 'partial' | 'credit'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultSupplierId?: number | null
  onSaved?: () => void
}

const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: 'full', label: 'دفعت كله' },
  { value: 'partial', label: 'دفعت جزء' },
  { value: 'credit', label: 'آجل' },
]

// أعمدة صف الصنف على الشاشات الكبيرة (والعنوان فوقها بنفس الأعمدة)
const CART_COLS = 'md:grid-cols-[minmax(0,1fr)_auto_6.5rem_6.5rem_2.25rem]'

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
  const [supplierOpen, setSupplierOpen] = React.useState(false)
  const [supplierQuery, setSupplierQuery] = React.useState('')
  const [payMode, setPayMode] = React.useState<PayMode>('full')
  const [paidAmount, setPaidAmount] = React.useState(0)
  // how the payment leaves the shop: cash | vodafone_cash | instapay | fawry
  const [payMethod, setPayMethod] = React.useState('cash')
  const [submitting, setSubmitting] = React.useState(false)
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const [newProductOpen, setNewProductOpen] = React.useState(false)
  const [newProductSeed, setNewProductSeed] = React.useState('')
  const [pendingToday, setPendingToday] = React.useState<ProductLite[]>([])
  const [cartQ, setCartQ] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    setCart([])
    setCartQ('')
    setQuery('')
    setResults([])
    setPayMode('full')
    setPaidAmount(0)
    setSupplierOpen(false)
    setSupplierQuery('')
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

  /* ───── الحسابات ───── */

  const total = cart.reduce((s, i) => s + i.cost * i.quantity, 0)
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0)
  const manyItems = cart.length > 8
  const cartNeedle = cartQ.trim().toLowerCase()
  const shownCart = cartNeedle
    ? cart.filter((i) => i.product.name.toLowerCase().includes(cartNeedle) || (i.product.barcode ?? '').includes(cartNeedle))
    : cart
  const noSupplier = supplierId === 'none'
  const selectedSupplier = !noSupplier ? suppliers.find((s) => String(s.id) === supplierId) : null

  const paid = payMode === 'full' ? total : payMode === 'credit' ? 0 : paidAmount
  const due = Math.max(0, total - paid)
  const credit = Math.max(0, paid - total)
  const creditNoSupplier = paid < total && noSupplier
  const overNoSupplier = paid > total && noSupplier
  const balanceAfter = selectedSupplier ? selectedSupplier.balance + due - credit : null

  const blockReason =
    cart.length === 0
      ? 'ضيف صنف واحد على الأقل'
      : creditNoSupplier
        ? 'الشراء بالآجل لازم يكون مرتبط بمورد'
        : overNoSupplier
          ? 'المدفوع أكبر من الفاتورة — اختار مورد ليُسجَّل الفرق رصيد ليك عنده'
          : null

  // منتجات النهاردة اللي لسه معملهاش دخول فعلي للمخزون ولا اتحطت في السلة
  const visiblePendingToday = pendingToday.filter(
    (p) => !cart.some((c) => c.product.id === p.id)
  )

  const sortedSuppliers = React.useMemo(() => {
    const q = supplierQuery.trim().toLowerCase()
    return [...suppliers]
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q))
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, 'ar'))
  }, [suppliers, supplierQuery])

  /* ───── عمليات السلة ───── */

  const addAllPendingToday = () => {
    setCart((prev) => {
      const toAdd = visiblePendingToday.filter(
        (p) => !prev.some((c) => c.product.id === p.id)
      )
      return [...toAdd.map((p) => ({ product: p, cost: p.cost, quantity: 1 })), ...prev]
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
      return [{ product: p, cost: p.cost, quantity: 1 }, ...prev]
    })
    setQuery('')
    setResults([])
    setSearchOpen(false)
    searchRef.current?.focus()
  }

  const updateQty = (id: number, q: number) => {
    setCart((prev) =>
      prev.map((i) =>
        // 🥬 2026-10-12: منتج الوزن — أقل 0.05 كيلو، ومننضف الكسر
        i.product.id === id
          ? {
              ...i,
              quantity: i.product.soldByWeight
                ? Math.round(Math.max(0.05, q) * 1000) / 1000
                : Math.max(1, q),
            }
          : i,
      ),
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

  // الباركود: Enter بيضيف الصنف لو النتيجة واحدة أو الباركود مطابق تماماً
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = query.trim()
    if (!q || searchLoading) return
    const exact = results.find((r) => r.barcode === q)
    if (exact) addToCart(exact)
    else if (results.length === 1) addToCart(results[0])
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

  const choosePay = (m: PayMode) => {
    setPayMode(m)
    if (m === 'credit') setPaidAmount(0)
  }

  const submit = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة')
      return
    }
    if (!Number.isFinite(paid) || paid < 0) {
      toast.error('المبلغ المدفوع غير صالح')
      return
    }
    if (paid < total && noSupplier) {
      toast.error('الشراء بالآجل لازم يكون مرتبط بمورد')
      return
    }
    if (paid > total && noSupplier) {
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
          supplierId: !noSupplier ? Number(supplierId) : null,
          paid,
          paymentMethod: paid > 0 ? payMethod : 'cash',
        },
      })
      // 🛡️ v11: أوفلاين الرد تأكيد حفظ محلي من غير orderNo — رسالة واضحة
      // بدل "undefined"، والأمر بيتدمج لحظياً في كاش أوامر الشراء المحلي.
      if (order?.offline) {
        toast.success('تم حفظ أمر الشراء محلياً — سيتم المزامنة عند عودة الاتصال')
      } else {
        toast.success(`تم تسجيل أمر الشراء بنجاح - ${order.orderNo}`)
      }
      onSaved?.()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل حفظ أمر الشراء')
    } finally {
      setSubmitting(false)
    }
  }

  /* ───────────────────────── الواجهة ───────────────────────── */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchRef.current?.focus()
        }}
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl xl:max-w-5xl"
      >
        <DialogHero
          icon={PackagePlus}
          title="أمر شراء جديد"
          subtitle="سجّل فاتورة الشراء — الأصناف بتدخل المخزن، والمتبقي بيتسجّل على حساب المورد."
        />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
            {/* ═════════ العمود الرئيسي ═════════ */}
            <div className="min-w-0 space-y-6">
              {/* 1) المورد */}
              <section>
                <SectionTitle n={1}>المورد</SectionTitle>

                <button
                  type="button"
                  onClick={() => setSupplierOpen((v) => !v)}
                  aria-expanded={supplierOpen}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
                    supplierOpen && 'border-cyan-600 ring-[3px] ring-cyan-600/20'
                  )}
                >
                  {selectedSupplier ? (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-950 text-lg font-extrabold text-cyan-50 dark:bg-cyan-700">
                      {selectedSupplier.name.trim().charAt(0)}
                    </span>
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
                      <Truck className="size-5" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-extrabold leading-tight">
                      {selectedSupplier ? selectedSupplier.name : 'شراء بدون مورد'}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-medium text-foreground/65">
                      {selectedSupplier
                        ? selectedSupplier.balance > 0
                          ? `عليك له ${formatCurrency(selectedSupplier.balance)} قبل الأمر ده`
                          : selectedSupplier.balance < 0
                            ? `ليك عنده ${formatCurrency(Math.abs(selectedSupplier.balance))}`
                            : 'حسابه مسوّى'
                        : 'كاش فقط — مفيش آجل ولا حساب'}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
                      supplierOpen && 'rotate-180'
                    )}
                    aria-hidden
                  />
                </button>

                {supplierOpen && (
                  <div className="mt-2 overflow-hidden rounded-2xl border bg-card shadow-sm">
                    {suppliers.length > 6 && (
                      <div className="border-b bg-muted/30 p-2.5">
                        <label className="relative flex h-9 items-center rounded-xl border bg-background focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
                          <Search className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground" aria-hidden />
                          <input
                            autoFocus
                            value={supplierQuery}
                            onChange={(e) => setSupplierQuery(e.target.value)}
                            placeholder="ابحث باسم المورد أو رقمه…"
                            aria-label="بحث عن مورد"
                            className="h-full w-full bg-transparent pe-3 text-sm outline-none placeholder:text-muted-foreground/80"
                            style={{ paddingInlineStart: '2.25rem' }}
                          />
                        </label>
                      </div>
                    )}
                    <div role="listbox" className="max-h-60 space-y-0.5 overflow-y-auto p-1.5">
                      {!supplierQuery.trim() && (
                        <SupplierRow
                          on={noSupplier}
                          onClick={() => {
                            setSupplierId('none')
                            setSupplierOpen(false)
                          }}
                          label="شراء بدون مورد"
                          hint="كاش فقط"
                          lead={<Truck className="size-4" />}
                        />
                      )}
                      {sortedSuppliers.map((s) => (
                        <SupplierRow
                          key={s.id}
                          on={String(s.id) === supplierId}
                          onClick={() => {
                            setSupplierId(String(s.id))
                            setSupplierOpen(false)
                          }}
                          label={s.name}
                          hint={s.balance > 0 ? `عليك له ${formatCurrency(s.balance)}` : s.balance < 0 ? `ليك عنده ${formatCurrency(Math.abs(s.balance))}` : 'حسابه مسوّى'}
                          due={s.balance > 0}
                          lead={<span className="text-sm font-extrabold">{s.name.trim().charAt(0)}</span>}
                        />
                      ))}
                      {sortedSuppliers.length === 0 && supplierQuery.trim() && (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">مفيش مورد بالاسم ده</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedSupplier && selectedSupplier.balance > 0 && (
                  <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    في مستحق سابق للمورد ده: {formatCurrency(selectedSupplier.balance)}
                  </p>
                )}
              </section>

              {/* 2) الأصناف */}
              <section>
                <SectionTitle
                  n={2}
                  aside={
                    cart.length > 0 && (
                      <span className="text-xs font-semibold tabular-nums text-foreground/65">
                        {cart.length} صنف · {totalQty} قطعة
                      </span>
                    )
                  }
                >
                  الأصناف
                </SectionTitle>

                {/* البحث */}
                <div>
                  <label className="relative flex h-12 items-center rounded-2xl border bg-card transition-shadow focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
                    <Search className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground" aria-hidden />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onSearchKey}
                      placeholder="ابحث بالاسم أو الباركود — أو امسح الباركود"
                      aria-label="إضافة صنف"
                      className="h-full w-full bg-transparent pe-3 text-sm outline-none placeholder:text-muted-foreground/80"
                      style={{ paddingInlineStart: '2.75rem' }}
                    />
                    {searchLoading && <Loader2 className="absolute left-3.5 size-4 animate-spin text-muted-foreground" aria-hidden />}
                  </label>

                  {searchOpen && (
                    <div className="mt-2 overflow-hidden rounded-2xl border bg-card shadow-sm">
                      {searchLoading ? (
                        <p className="p-4 text-center text-xs text-muted-foreground">جارِ البحث…</p>
                      ) : results.length === 0 ? (
                        <div className="p-5 text-center">
                          <p className="mb-3 text-sm font-semibold">مفيش نتايج</p>
                          <p className="mb-3 text-xs font-medium text-foreground/65">
                            لازم الصنف يكون مسجّل في الكتالوج الأول.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
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
                        <ul className="max-h-64 divide-y overflow-y-auto">
                          {results.map((p) => {
                            const inCart = cart.find((c) => c.product.id === p.id)
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => addToCart(p)}
                                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                                >
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-700/10 text-cyan-800 dark:text-cyan-200">
                                    <PackagePlus className="size-4" aria-hidden />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold">{p.name}</span>
                                    <span className="block truncate text-xs font-medium tabular-nums text-foreground/65">
                                      {p.barcode ? <bdi dir="ltr">{p.barcode}</bdi> : null}
                                      {p.barcode ? ' · ' : ''}
                                      مخزون {p.quantity}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-end">
                                    <span className="block text-sm font-extrabold tabular-nums">{formatCurrency(p.cost)}</span>
                                    {inCart ? (
                                      <span className="block text-[11px] font-bold text-cyan-700 dark:text-cyan-300">في السلة × {inCart.quantity}</span>
                                    ) : (
                                      <span className="block text-[11px] font-medium text-foreground/55">آخر تكلفة</span>
                                    )}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* بانر: منتجات جديدة النهاردة لسه معملهاش دخول فعلي للمخزون */}
                {visiblePendingToday.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-700/25 bg-cyan-600/[0.07] px-4 py-3">
                    <p className="text-sm font-medium">
                      في <b className="font-extrabold tabular-nums">{visiblePendingToday.length}</b> منتج جديد اتضاف النهارده ولسه ملهمش أمر شراء
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 rounded-xl bg-background"
                      onClick={addAllPendingToday}
                    >
                      <Plus className="size-4" />
                      ضيف الكل للسلة
                    </Button>
                  </div>
                )}

                {/* السلة */}
                <div className="mt-3">
                  {cart.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-10 text-center">
                      <PackagePlus className="mx-auto size-7 text-cyan-700/60" aria-hidden />
                      <p className="mt-2 text-sm font-bold">السلة فاضية</p>
                      <p className="mt-0.5 text-xs font-medium text-foreground/65">ابحث عن صنف فوق وضيفه، أو امسح الباركود.</p>
                    </div>
                  ) : (
                    <>
                      {manyItems && (
                        <label className="relative mb-2.5 flex h-10 items-center rounded-xl border bg-card focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
                          <Search className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
                          <input
                            value={cartQ}
                            onChange={(e) => setCartQ(e.target.value)}
                            placeholder={`ابحث في ${cart.length} صنف في السلة…`}
                            aria-label="بحث في السلة"
                            className="h-full w-full bg-transparent pe-8 text-sm outline-none placeholder:text-muted-foreground/80"
                            style={{ paddingInlineStart: '2.5rem' }}
                          />
                          {cartQ && (
                            <button
                              type="button"
                              onClick={() => setCartQ('')}
                              aria-label="مسح البحث"
                              className="absolute left-2 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </label>
                      )}
                      <div className={cn('mb-1.5 hidden gap-x-4 px-[0.8125rem] text-[11px] font-bold text-foreground/60 md:grid', CART_COLS)}>
                        <span>الصنف</span>
                        <span className="w-[8.5rem] text-center">الكمية</span>
                        <span className="text-center">تكلفة الوحدة</span>
                        <span className="text-end">الإجمالي</span>
                        <span />
                      </div>
                      <ul
                        className={cn(
                          cart.length > 4
                            ? 'max-h-[26rem] space-y-2 overflow-y-auto overscroll-contain rounded-2xl border bg-card/60 p-1.5'
                            : 'space-y-2.5'
                        )}
                      >
                        {shownCart.map((i) => {
                          const costChanged = Math.abs(i.cost - i.product.cost) > 0.001
                          return (
                            <li key={i.product.id} className="rounded-2xl border bg-card p-3">
                              <div className={cn('grid grid-cols-2 gap-x-3 gap-y-3 md:items-center md:gap-x-4', CART_COLS)}>
                                {/* الاسم */}
                                <div className="col-span-2 flex items-start justify-between gap-2 md:col-span-1">
                                  <div className="min-w-0">
                                    <p className="text-sm font-extrabold leading-snug">{i.product.name}</p>
                                    <p className="mt-0.5 text-xs font-medium tabular-nums text-foreground/65">
                                      {i.product.barcode ? <bdi dir="ltr">{i.product.barcode}</bdi> : null}
                                      {i.product.barcode ? ' · ' : ''}
                                      مخزون {i.product.quantity}{i.product.soldByWeight ? ' كجم' : ''}
                                    </p>
                                    {costChanged && (
                                      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-800 dark:text-amber-200">
                                        آخر تكلفة {formatCurrency(i.product.cost)}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(i.product.id)}
                                    aria-label={`حذف ${i.product.name}`}
                                    className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-rose-500/30 md:hidden"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>

                                {/* الكمية */}
                                <div className="md:flex md:justify-center">
                                  <span className="mb-1 block text-[11px] font-semibold text-foreground/60 md:hidden">
                                    {i.product.soldByWeight ? 'الكمية (كيلو)' : 'الكمية'}
                                  </span>
                                  <Stepper
                                    value={i.quantity}
                                    min={i.product.soldByWeight ? 0.05 : 1}
                                    onChange={(n) => updateQty(i.product.id, n)}
                                    label={`${i.product.soldByWeight ? 'وزن' : 'كمية'} ${i.product.name}`}
                                    decimal={i.product.soldByWeight}
                                    step={i.product.soldByWeight ? 0.5 : 1}
                                  />
                                </div>

                                {/* التكلفة */}
                                <div>
                                  <span className="mb-1 block text-[11px] font-semibold text-foreground/60 md:hidden">
                                    {i.product.soldByWeight ? 'تكلفة الكيلو' : 'تكلفة الوحدة'}
                                  </span>
                                  <DecimalInput
                                    size="sm"
                                    value={i.cost}
                                    onChange={(n) => updateCost(i.product.id, n)}
                                    label={`تكلفة ${i.product.name}`}
                                    invalid={false}
                                  />
                                </div>

                                {/* الإجمالي */}
                                <div className="col-span-2 flex items-center justify-between border-t pt-2.5 md:col-span-1 md:block md:border-0 md:pt-0 md:text-end">
                                  <span className="text-[11px] font-semibold text-foreground/60 md:hidden">الإجمالي</span>
                                  <span className="text-base font-extrabold tabular-nums">{formatCurrency(i.cost * i.quantity)}</span>
                                </div>

                                {/* حذف (شاشات كبيرة) */}
                                <button
                                  type="button"
                                  onClick={() => removeItem(i.product.id)}
                                  aria-label={`حذف ${i.product.name}`}
                                  className="hidden size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-rose-500/30 md:flex"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </li>
                          )
                        })}
                        {shownCart.length === 0 && (
                          <li className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm font-medium text-foreground/65">
                            مفيش صنف بالاسم ده في السلة
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
              </section>
            </div>

            {/* ═════════ لوحة الفاتورة ═════════ */}
            <aside className="rounded-3xl bg-cyan-950 p-5 text-cyan-50 shadow-lg ring-1 ring-cyan-900 xl:sticky xl:top-0">
              <p className="text-xs font-semibold text-cyan-200/80">إجمالي الفاتورة</p>
              <p className="mt-1 text-4xl font-extrabold leading-none tabular-nums">
                {num(total)}
                <span className="ms-2 text-sm font-semibold text-cyan-200/70">جنيه</span>
              </p>
              <p className="mt-2 text-xs text-cyan-200/70 tabular-nums">
                {cart.length} صنف · {totalQty} قطعة
              </p>

              <div className="my-4 border-t border-dashed border-cyan-700/70" />

              <p className="mb-2 text-xs font-semibold text-cyan-200/80">الدفع</p>
              <div role="radiogroup" aria-label="طريقة السداد" className="grid grid-cols-3 gap-1 rounded-2xl bg-cyan-900/80 p-1">
                {PAY_MODES.map((m) => {
                  const on = payMode === m.value
                  return (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => choosePay(m.value)}
                      className={cn(
                        'h-10 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                        on ? 'bg-cyan-300 text-cyan-950 shadow-sm' : 'text-cyan-100/80 hover:bg-cyan-800'
                      )}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>

              {payMode === 'partial' && (
                <div className="mt-3 space-y-1.5">
                  <label htmlFor="po-paid-amount" className="block text-xs font-semibold text-cyan-200/80">
                    المبلغ المدفوع الآن
                  </label>
                  <DecimalInput
                    id="po-paid-amount"
                    tone="dark"
                    suffix="جنيه"
                    value={paidAmount}
                    onChange={setPaidAmount}
                    invalid={creditNoSupplier || overNoSupplier}
                  />
                </div>
              )}

              {paid > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-cyan-200/80">دفعت إزاي؟</p>
                  <MethodPills tone="dark" value={payMethod} onChange={setPayMethod} label="طريقة الدفع" />
                </div>
              )}

              {/* كشف الحساب */}
              <ul className="mt-5 space-y-2.5 border-t border-dashed border-cyan-700/70 pt-4 text-sm">
                <Leader label="مدفوع الآن" value={formatCurrency(Math.min(paid, total))} />
                <Leader label="آجل للمورد" value={formatCurrency(due)} tone={due > 0 ? 'amber' : undefined} />
                {credit > 0 && <Leader label="زيادة ليك عند المورد" value={formatCurrency(credit)} />}
                {balanceAfter !== null && (due > 0 || credit > 0) && (
                  <Leader
                    strong
                    label={balanceAfter > 0 ? 'هيبقى عليك للمورد' : balanceAfter < 0 ? 'هيبقى ليك عنده' : 'حسابه هيتسوّى'}
                    value={formatCurrency(Math.abs(balanceAfter))}
                  />
                )}
              </ul>

              {(creditNoSupplier || overNoSupplier) && (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/15 px-3 py-2.5 text-xs font-semibold leading-relaxed text-rose-200 ring-1 ring-rose-400/30">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {creditNoSupplier
                    ? 'الشراء بالآجل لازم يكون مرتبط بمورد — اختار مورد من فوق.'
                    : 'المدفوع أكبر من الفاتورة — اختار مورد ليُسجَّل الفرق رصيد ليك عنده.'}
                </p>
              )}
            </aside>
          </div>
        </div>

        {/* ═════════ الشريط السفلي ═════════ */}
        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          {blockReason && cart.length > 0 && (
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 xl:hidden">
              <Info className="size-3.5 shrink-0" aria-hidden />
              {blockReason}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {blockReason && cart.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground/65">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  {blockReason}
                </p>
              ) : (
                <div className="xl:hidden">
                  <p className="text-[11px] font-semibold text-foreground/60">الإجمالي</p>
                  <p className="truncate text-lg font-extrabold tabular-nums">{formatCurrency(total)}</p>
                </div>
              )}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-5">
              إلغاء
            </Button>
            <Button
              onClick={submit}
              disabled={submitting || !!blockReason}
              className="h-11 rounded-xl bg-cyan-700 px-6 font-bold text-white hover:bg-cyan-600 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              حفظ أمر الشراء
            </Button>
          </div>
        </div>
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

/* ───────────── مكوّنات محلية ───────────── */

function SupplierRow({
  on,
  onClick,
  label,
  hint,
  due,
  lead,
}: {
  on: boolean
  onClick: () => void
  label: string
  hint: string
  due?: boolean
  lead: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40',
        on ? 'bg-cyan-600/10' : 'hover:bg-muted/70 focus-visible:bg-muted/70'
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          on ? 'bg-cyan-700 text-white' : 'bg-cyan-700/10 text-cyan-800 dark:text-cyan-200'
        )}
      >
        {lead}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', on ? 'font-extrabold' : 'font-semibold')}>{label}</span>
        <span
          className={cn(
            'block truncate text-[11px] tabular-nums',
            due ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
          )}
        >
          {hint}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          on ? 'border-cyan-700 bg-cyan-700 text-white' : 'border-transparent text-transparent'
        )}
      >
        <Check className="size-3" />
      </span>
    </button>
  )
}

function Leader({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'amber'
}) {
  return (
    <li
      className={cn(
        'flex items-baseline gap-2',
        strong && 'border-t border-cyan-700/70 pt-2.5 text-base font-extrabold text-cyan-50'
      )}
    >
      <span className={cn(!strong && 'text-cyan-100/85', tone === 'amber' && 'text-amber-300')}>{label}</span>
      <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-cyan-600/60" />
      <b className={cn('tabular-nums', tone === 'amber' && 'text-amber-300')}>{value}</b>
    </li>
  )
}
