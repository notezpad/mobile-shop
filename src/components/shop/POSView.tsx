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

interface PosUnit {
  id: number
  name: string
  price: number | null
  factor: number
}

// Each cart line is uniquely identified by cartKey = productId + unitId
interface CartItem {
  cartKey: string
  product: ProductLite
  price: number           // price PER PIECE (unit price ÷ factor when a unit is selected)
  quantity: number        // quantity in PIECES — always a multiple of unitFactor when a unit is selected
  maxQuantity: number     // stock ceiling in pieces (rounded down to a multiple of unitFactor)
  unitId: number | null
  unitLabel: string | null
  unitFactor: number      // pieces per unit; 1 when no wholesale unit is selected
  availableUnits: PosUnit[]
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
  const [addingProduct, setAddingProduct] = React.useState(false)

  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const capabilities = useShopStore((s) => s.plan.capabilities)

  const hasUnitsCap = capabilities.includes('multi_unit')

  // load customers
  React.useEffect(() => {
    let alive = true
    api<CustomerLite[]>('/api/customers').then((d) => {
      if (alive) setCustomers(d)
    }).catch(() => {})
    return () => { alive = false }
  }, [customersVersion])

  // Derived: balance of the selected customer
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
    if (!q) { setResults([]); setOpen(false); return }
    setSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const data = await api<ProductLite[]>(`/api/products?search=${encodeURIComponent(q)}`)
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

  // ── Product selection: fetch units, then add to cart ──

  const addToCartDirect = (
    product: ProductLite,
    unitId: number | null,
    unitLabel: string | null,
    maxQuantity: number,
    availableUnits: PosUnit[],
  ) => {
    const cartKey = `${product.id}-${unitId ?? 'x'}`
    const unit = unitId ? availableUnits.find((u) => u.id === unitId) : null
    const factor = unit?.factor ?? 1
    // Per-piece price: if unit has its own price, spread it across factor pieces.
    const perPiecePrice = unit
      ? (unit.price != null ? unit.price / factor : product.price)
      : product.price
    const startQty = factor // start at exactly 1 unit worth of pieces

    setCart((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey)
      if (existing) {
        return prev.map((i) =>
          i.cartKey === cartKey
            ? { ...i, quantity: Math.min(i.quantity + factor, i.maxQuantity) }
            : i
        )
      }
      if (maxQuantity <= 0) {
        toast.error('الكمية غير متوفرة لهذا المنتج')
        return prev
      }
      return [...prev, {
        cartKey, product, price: perPiecePrice, quantity: Math.min(startQty, maxQuantity), maxQuantity,
        unitId, unitLabel, unitFactor: factor, availableUnits,
      }]
    })
  }

  const handleProductSelect = async (p: ProductLite) => {
    setQuery('')
    setResults([])
    setOpen(false)
    if (addingProduct) return
    setAddingProduct(true)
    try {
      const unitData = hasUnitsCap
        ? await api<any[]>(`/api/products/${p.id}/units`).then((d) =>
            d.map((u: any) => ({
              id: u.id,
              name: u.name,
              price: u.price,
              factor: u.factor,
            }))
          ).catch(() => [])
        : []

      addToCartDirect(p, null, null, p.quantity, unitData)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل بيانات المنتج')
    } finally {
      setAddingProduct(false)
    }
  }

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearchLoading(true)
    try {
      const data = await api<ProductLite[]>(`/api/products?search=${encodeURIComponent(q)}`)
      const exact = data.find((r) => r.barcode === q)
      if (exact) {
        await handleProductSelect(exact)
      } else if (data.length === 1) {
        await handleProductSelect(data[0])
      } else if (data.length > 1) {
        setResults(data)
        setOpen(true)
      } else {
        toast.error('لا يوجد منتج بهذا الاسم أو الباركود')
        setResults([])
        setOpen(false)
      }
    } catch {
      toast.error('فشل البحث عن المنتج')
    } finally {
      setSearchLoading(false)
    }
  }

  // Quantity is entered in pieces, but must stay a multiple of the unit's factor
  // (e.g. 12, 24, 36 for a دستة with factor=12). Plain pieces (no unit) accept any amount.
  const updateQty = (cartKey: string, q: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const factor = i.unitFactor ?? 1
        const rounded = factor > 1 ? Math.round(q / factor) * factor : q
        const clamped = Math.max(factor, Math.min(rounded, i.maxQuantity))
        return { ...i, quantity: clamped }
      })
    )
  }

  const updatePrice = (cartKey: string, p: number) => {
    setCart((prev) =>
      prev.map((i) => i.cartKey === cartKey ? { ...i, price: Math.max(0, p) } : i)
    )
  }

  const removeItem = (cartKey: string) => {
    setCart((prev) => prev.filter((i) => i.cartKey !== cartKey))
  }

  // Change the wholesale unit for a cart line
  const updateUnit = (cartKey: string, unit: PosUnit | null) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const newUnitId = unit?.id ?? null
        const newKey = `${i.product.id}-${newUnitId ?? 'x'}`
        const factor = unit?.factor ?? 1
        const perPiecePrice = unit
          ? (unit.price != null ? unit.price / factor : i.product.price)
          : i.product.price
        const newMax = unit?.factor
          ? Math.floor(i.product.quantity / unit.factor) * unit.factor
          : i.product.quantity
        return {
          ...i,
          cartKey: newKey,
          unitId: newUnitId,
          unitLabel: unit?.name ?? null,
          unitFactor: factor,
          price: perPiecePrice,
          quantity: Math.min(factor, newMax),
          maxQuantity: newMax,
        }
      })
    )
  }

  const checkout = async () => {
    if (cart.length === 0) { toast.error('السلة فارغة'); return }
    setSubmitting(true)
    try {
      const paid = paidFull ? total : paidAmount
      let customerId = selectedCustomerId
      if (!customerId && customerName.trim()) {
        const match = customers.find((c) => c.name.trim() === customerName.trim())
        if (match) customerId = match.id
      }
      const sale = await api<any>('/api/sales', {
        method: 'POST',
        body: {
          items: cart.map((i) => {
            const factor = i.unitFactor || 1
            const unitsEntered = i.unitId ? Math.round(i.quantity / factor) : i.quantity
            const pricePerEntered = i.unitId ? i.price * factor : i.price
            return {
              productId: i.product.id,
              quantity: unitsEntered,
              price: pricePerEntered,
              ...(i.unitId ? { unitId: i.unitId } : {}),
            }
          }),
          customerId,
          paid,
        },
      })
      toast.success(`تمت البيع بنجاح - ${sale.invoiceNo}`)
      printSale(
        {
          id: sale.id,
          invoiceNo: sale.invoiceNo,
          total: sale.total,
          paid: sale.paid,
          status: sale.status,
          createdAt: sale.createdAt,
          items: sale.items.map((it: any) => {
            // Show "2 دستة" for wholesale, piece count otherwise.
            // it.price/it.quantity from the API are always PER PIECE / total pieces,
            // so when a wholesale unit was used we must convert both the quantity
            // AND the price back to "per unit" (e.g. price per دستة, not per قطعة),
            // otherwise the printed row's total (price * quantity) is wrong even
            // though the invoice grand total (sale.total) is correct.
            const hasUnit = it.unitQuantity != null && it.unitQuantity > 0
            const displayQty = hasUnit ? it.unitQuantity : it.quantity
            const displayPrice = hasUnit ? (it.price * it.quantity) / it.unitQuantity : it.price
            const unitSuffix = it.unitLabel ? ` (${displayQty} ${it.unitLabel})` : ''
            return {
              name: it.name + unitSuffix,
              price: displayPrice,
              quantity: displayQty,
            }
          }),
          customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
        },
        {
          name: shopName || undefined,
          phone: shopBranding.phone || undefined,
          address: shopBranding.address || undefined,
          logo: shopBranding.logoPath || undefined,
          invoicePrefix: shopBranding.invoicePrefix,
        }
      )
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setSelectedCustomerId(null)
      setPaidFull(true)
      setPaidAmount(0)
      setCustomersVersion((v) => v + 1)
    } catch (e: any) {
      toast.error(e?.message || 'فشل إتمام البيع')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredCustomers = custQuery.trim()
    ? customers.filter(
        (c) => c.name.includes(custQuery.trim()) || (c.phone ?? '').includes(custQuery.trim())
      )
    : customers.slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">نقطة البيع</h1>
          <p className="text-sm text-muted-foreground">ابحث بالاسم أو الباركود لإضافة منتجات</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => openQuickAddProduct()}>
          <Plus className="size-4" />
          منتج جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left: search + cart */}
        <div className="space-y-4 lg:col-span-3">
          {/* Search */}
          <Card>
            <CardContent className="pt-4">
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث عن منتج بالاسم أو الباركود…"
                    className="pl-10 pr-4"
                    autoFocus
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    {searchLoading || addingProduct
                      ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      : <Search className="size-4 text-muted-foreground" />
                    }
                  </div>
                </div>

                {open && results.length > 0 && (
                  <div className="mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                    <ul className="max-h-64 overflow-y-auto">
                      {results.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void handleProductSelect(p)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
                          >
                            <div>
                              <p className="font-medium">{p.name}</p>
                              {p.barcode && (
                                <p className="text-xs text-muted-foreground">{p.barcode}</p>
                              )}
                            </div>
                            <div className="text-left text-xs">
                              <p className="font-semibold text-primary">{formatCurrency(p.price)}</p>
                              <p
                                className={cn(
                                  'text-muted-foreground',
                                  p.quantity <= 0 && 'text-destructive font-medium'
                                )}
                              >
                                {p.quantity <= 0 ? 'نفد' : `${p.quantity} متاح`}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {query.trim() && !open && !searchLoading && results.length === 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-muted-foreground">لا يوجد منتج مطابق.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => openQuickAddProduct()}
                    >
                      <Plus className="size-4" />
                      أضف منتجاً جديداً
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Cart */}
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
                        <tr key={it.cartKey} className="border-b last:border-0">
                          <td className="py-2 pr-1">
                            <p className="font-medium">{it.product.name}</p>
                            {/* Unit selector */}
                            {it.availableUnits.length > 0 && (
                              <div className="mt-1">
                                <select
                                  value={it.unitId ?? ''}
                                  onChange={(e) => {
                                    const uid = e.target.value ? parseInt(e.target.value, 10) : null
                                    const unit = uid
                                      ? it.availableUnits.find((u) => u.id === uid) ?? null
                                      : null
                                    updateUnit(it.cartKey, unit)
                                  }}
                                  className="rounded border bg-background px-2 py-0.5 text-xs"
                                >
                                  <option value="">قطعة</option>
                                  {it.availableUnits.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name}
                                      {u.price != null ? ` (${formatCurrency(u.price)})` : ''}
                                    </option>
                                  ))}
                                </select>
                                {it.unitId && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {it.unitLabel}
                                    {it.availableUnits.find((u) => u.id === it.unitId)?.factor
                                      ? ` × ${it.availableUnits.find((u) => u.id === it.unitId)?.factor} قطعة`
                                      : ''}
                                  </p>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              متاح: {it.maxQuantity}
                            </p>
                          </td>
                          <td className="px-2">
                            <Input
                              type="number"
                              value={it.price}
                              onChange={(e) => updatePrice(it.cartKey, parseFloat(e.target.value) || 0)}
                              className="h-8 w-20 text-center"
                              min={0}
                            />
                          </td>
                          <td className="px-2">
                            <Input
                              type="number"
                              value={it.quantity}
                              onChange={(e) => updateQty(it.cartKey, parseInt(e.target.value, 10) || 1)}
                              className="h-8 w-16 text-center"
                              min={1}
                              max={it.maxQuantity}
                            />
                            {it.unitLabel && (
                              <p className="mt-0.5 text-center text-xs text-muted-foreground">
                                {it.unitLabel}
                              </p>
                            )}
                          </td>
                          <td className="px-2 text-center font-semibold tabular-nums">
                            {formatCurrency(it.price * it.quantity)}
                          </td>
                          <td className="pl-1 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeItem(it.cartKey)}
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

        {/* Right column - summary */}
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base">ملخص الدفع</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer card */}
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground">العميل (اختياري)</p>
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
                                    <span className="text-muted-foreground">{c.phone}</span>
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
                            : 'font-medium text-success-subtle-foreground tabular-nums'
                        }
                      >
                        {formatCurrency(selectedCustomerBalance)}
                      </span>
                    </div>
                    {selectedCustomerBalance > 0 && (
                      <div className="flex items-start gap-1.5 rounded-md border border-warning-subtle bg-warning-subtle px-2.5 py-1.5 text-xs text-warning-subtle-foreground">
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
                <Label htmlFor="paid-full" className="cursor-pointer text-sm">سداد كامل</Label>
              </div>

              {!paidFull && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">المبلغ المدفوع</Label>
                  <Input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
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
                {submitting
                  ? <Loader2 className="size-5 animate-spin" />
                  : <Banknote className="size-5" />
                }
                دفع وطباعة
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
