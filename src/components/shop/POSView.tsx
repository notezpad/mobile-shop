'use client'

import * as React from 'react'
import {
  Banknote,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { printSale } from '@/lib/print-client'

interface ProductLite {
  id: number
  name: string
  barcode: string | null
  price: number
  quantity: number
}

interface CustomerLite {
  id: number
  name: string
  phone: string | null
  balance: number
}

interface CartItem {
  product: ProductLite
  price: number
  quantity: number
}

export function POSView() {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<ProductLite[]>([])
  const [open, setOpen] = React.useState(false)
  const [searchLoading, setSearchLoading] = React.useState(false)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [customers, setCustomers] = React.useState<CustomerLite[]>([])
  const [custQuery, setCustQuery] = React.useState('')
  const [custOpen, setCustOpen] = React.useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<number | null>(null)
  const [customerName, setCustomerName] = React.useState('')
  const [customerPhone, setCustomerPhone] = React.useState('')
  const [paidFull, setPaidFull] = React.useState(true)
  const [paidAmount, setPaidAmount] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [customersVersion, setCustomersVersion] = React.useState(0)
  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)

  // load customers (re-load after each successful sale so balances stay fresh)
  React.useEffect(() => {
    let alive = true
    api<CustomerLite[]>('/api/customers').then((d) => {
      if (alive) setCustomers(d)
    }).catch(() => {})
    return () => {
      alive = false
    }
  }, [customersVersion])

  // Derived: balance of the selected customer (by id, or name match)
  const selectedCustomerBalance = React.useMemo(() => {
    if (selectedCustomerId) {
      const c = customers.find((x) => x.id === selectedCustomerId)
      if (c) return c.balance
    }
    const trimmed = customerName.trim()
    if (trimmed) {
      const c = customers.find((x) => x.name.trim() === trimmed)
      if (c) return c.balance
    }
    return null
  }, [selectedCustomerId, customerName, customers])

  // debounced search
  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setOpen(false)
      return
    }
    setSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const data = await api<ProductLite[]>(
          `/api/products?search=${encodeURIComponent(q)}`
        )
        setResults(data)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)

  const addToCart = (p: ProductLite) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === p.id)
      if (existing) {
        const nextQty = Math.min(existing.quantity + 1, p.quantity)
        return prev.map((i) =>
          i.product.id === p.id ? { ...i, quantity: nextQty } : i
        )
      }
      if (p.quantity <= 0) {
        toast.error('الكمية غير متوفرة لهذا المنتج')
        return prev
      }
      return [...prev, { product: p, price: p.price, quantity: 1 }]
    })
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchLoading) return
    if (results.length === 0 && query.trim()) {
      // no product found - keep input open; user can click add new
      return
    }
    if (results.length > 0) {
      // pick first match (barcode exact or first)
      const exact = results.find((r) => r.barcode === query.trim()) ?? results[0]
      addToCart(exact)
    }
  }

  const updateQty = (id: number, q: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id
          ? { ...i, quantity: Math.max(1, Math.min(q, i.product.quantity)) }
          : i
      )
    )
  }
  const updatePrice = (id: number, p: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === id ? { ...i, price: Math.max(0, p) } : i
      )
    )
  }
  const removeItem = (id: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== id))
  }

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة')
      return
    }
    setSubmitting(true)
    try {
      const paid = paidFull ? total : paidAmount
      // try to attach customer if name matches an existing record
      let customerId = selectedCustomerId
      if (!customerId && customerName.trim()) {
        const match = customers.find(
          (c) => c.name.trim() === customerName.trim()
        )
        if (match) customerId = match.id
      }
      const sale = await api<any>('/api/sales', {
        method: 'POST',
        body: {
          items: cart.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
            price: i.price,
          })),
          customerId,
          paid,
        },
      })
      toast.success(`تمت البيع بنجاح - ${sale.invoiceNo}`)
      // print
      printSale(
        {
          id: sale.id,
          invoiceNo: sale.invoiceNo,
          total: sale.total,
          paid: sale.paid,
          status: sale.status,
          createdAt: sale.createdAt,
          items: sale.items.map((it: any) => ({
            name: it.name,
            price: it.price,
            quantity: it.quantity,
          })),
          customer: sale.customer
            ? { name: sale.customer.name, phone: sale.customer.phone }
            : null,
        },
        { name: customerName || undefined }
      )
      // reset
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setSelectedCustomerId(null)
      setPaidFull(true)
      setPaidAmount(0)
      // refresh customers list so balances stay fresh
      setCustomersVersion((v) => v + 1)
    } catch (e: any) {
      toast.error(e?.message || 'فشل إتمام البيع')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredCustomers = custQuery.trim()
    ? customers.filter(
        (c) =>
          c.name.includes(custQuery.trim()) ||
          (c.phone ?? '').includes(custQuery.trim())
      )
    : customers.slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">نقطة البيع</h1>
          <p className="text-sm text-muted-foreground">
            ابحث بالاسم أو الباركود وأضف للسلة
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Right column - search + cart (60%) */}
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleSearchSubmit} className="relative">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث بالاسم أو امسح الباركود..."
                    className="pr-9"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {open && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                    {results.length > 0 ? (
                      <ul className="max-h-72 overflow-y-auto">
                        {results.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => addToCart(p)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right hover:bg-accent"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {p.barcode ?? 'بدون باركود'} • متاح: {p.quantity}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-primary">
                                {formatCurrency(p.price)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      !searchLoading && (
                        <div className="p-4 text-center">
                          <p className="text-sm text-muted-foreground">
                            لا يوجد منتج بهذا الباركود/الاسم
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              openQuickAddProduct(query.trim())
                              setQuery('')
                              setResults([])
                              setOpen(false)
                            }}
                          >
                            <Plus className="size-4" />
                            إضافة منتج جديد
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="size-4 text-primary" />
                السلة ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  السلة فارغة — ابحث وأضف منتجات للبدء
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-1 text-right font-medium">المنتج</th>
                        <th className="px-2 text-center font-medium">السعر</th>
                        <th className="px-2 text-center font-medium">الكمية</th>
                        <th className="px-2 text-center font-medium">الإجمالي</th>
                        <th className="pl-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((it) => (
                        <tr key={it.product.id} className="border-b last:border-0">
                          <td className="py-2 pr-1">
                            <p className="font-medium">{it.product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              متاح: {it.product.quantity}
                            </p>
                          </td>
                          <td className="px-2">
                            <Input
                              type="number"
                              value={it.price}
                              onChange={(e) =>
                                updatePrice(
                                  it.product.id,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="h-8 w-20 text-center"
                              min={0}
                            />
                          </td>
                          <td className="px-2">
                            <Input
                              type="number"
                              value={it.quantity}
                              onChange={(e) =>
                                updateQty(
                                  it.product.id,
                                  parseInt(e.target.value, 10) || 1
                                )
                              }
                              className="h-8 w-16 text-center"
                              min={1}
                              max={it.product.quantity}
                            />
                          </td>
                          <td className="px-2 text-center font-semibold tabular-nums">
                            {formatCurrency(it.price * it.quantity)}
                          </td>
                          <td className="pl-1 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeItem(it.product.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Left column - summary (40%) */}
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base">ملخص الدفع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer card */}
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  العميل (اختياري)
                </p>
                <div className="relative">
                  <Input
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      setCustQuery(e.target.value)
                      setCustOpen(true)
                      setSelectedCustomerId(null)
                    }}
                    onFocus={() => setCustOpen(true)}
                    onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                    placeholder="اسم العميل"
                  />
                  {custOpen && customerName && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                      <ul className="max-h-48 overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-muted-foreground">
                            لا يوجد عميل بهذا الاسم — سيُسجل بدون عميل
                          </li>
                        ) : (
                          filteredCustomers.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedCustomerId(c.id)
                                  setCustomerName(c.name)
                                  setCustomerPhone(c.phone ?? '')
                                  setCustOpen(false)
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
                              >
                                <span>{c.name}</span>
                                <span className="flex items-center gap-2 text-xs">
                                  {c.balance > 0 && (
                                    <span className="text-destructive tabular-nums">
                                      عليه {formatCurrency(c.balance)}
                                    </span>
                                  )}
                                  {c.phone && (
                                    <span className="text-muted-foreground">
                                      {c.phone}
                                    </span>
                                  )}
                                </span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="رقم الهاتف (اختياري)"
                />
                {selectedCustomerBalance !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">رصيد العميل</span>
                      <span
                        className={
                          selectedCustomerBalance > 0
                            ? 'font-semibold text-destructive tabular-nums'
                            : 'font-medium text-green-600 tabular-nums'
                        }
                      >
                        {formatCurrency(selectedCustomerBalance)}
                      </span>
                    </div>
                    {selectedCustomerBalance > 0 && (
                      <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          هذا العميل عليه رصيد سابق:{' '}
                          <span className="font-bold tabular-nums">
                            {formatCurrency(selectedCustomerBalance)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">عدد الأصناف</span>
                  <span className="font-medium">{cart.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">الإجمالي</span>
                  <span className="text-2xl font-bold tabular-nums text-primary">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="paid-full"
                  checked={paidFull}
                  onCheckedChange={(v) => {
                    setPaidFull(v === true)
                    if (v) setPaidAmount(0)
                    else setPaidAmount(total)
                  }}
                />
                <Label htmlFor="paid-full" className="cursor-pointer text-sm">
                  سداد كامل
                </Label>
              </div>

              {!paidFull && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    المبلغ المدفوع
                  </Label>
                  <Input
                    type="number"
                    value={paidAmount}
                    onChange={(e) =>
                      setPaidAmount(parseFloat(e.target.value) || 0)
                    }
                    min={0}
                  />
                  {paidAmount < total && (
                    <p className="text-xs text-destructive">
                      المتبقي (آجل): {formatCurrency(total - paidAmount)}
                    </p>
                  )}
                  {paidAmount < total && !selectedCustomerId && !customerName.trim() && (
                    <p className="text-xs text-destructive">
                      البيع بالآجل لازم يكون مرتبط بعميل
                    </p>
                  )}
                </div>
              )}

              <Button
                size="lg"
                className="w-full text-base"
                onClick={checkout}
                disabled={submitting || cart.length === 0}
              >
                {submitting ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Banknote className="size-5" />
                )}
                دفع وطباعة
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
