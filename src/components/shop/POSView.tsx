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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { printSale } from '@/lib/print-client'
import { printThermalReceipt, getStoredPrinterSettings } from '@/lib/thermal-printer'
import { ProductDialog } from './ProductDialog'

interface ProductLite {
  id: number
  name: string
  barcode: string | null
  price: number
  quantity: number
  // Set by the API when the search term exactly matched one of this
  // product's variant (color/size) barcodes, so we know which specific
  // variant a scanned code refers to.
  matchedVariantId?: number | null
  matchedVariantLabel?: string | null
  // Unit-Based Dynamic Pricing: precomputed by /api/products as
  // cost + margin% when the tenant has the feature enabled, else null.
  // Applies ONLY to the "Piece / قطعة" unit — never to wholesale units.
  dynamicRetailPrice?: number | null
}

// The price to use for the "Piece / قطعة" unit (no wholesale unit selected):
// the dynamically computed retail price when the tenant has enabled it,
// otherwise the flat price on the product card — exactly like before this
// feature existed. Never applies to wholesale ProductUnit prices.
function piecePrice(product: ProductLite): number {
  return product.dynamicRetailPrice ?? product.price
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

// A specific size/color of a product — its own stock, sold as a distinct line.
interface PosVariant {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

function variantLabelOf(v: PosVariant): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
}

// Each cart line is uniquely identified by cartKey = productId + unitId + variantId
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
  variantId: number | null
  variantLabel: string | null
  availableVariants: PosVariant[]  // the specific color/size sold, if this product has variants
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
  // Mobile cart drawer — below lg, the cart is hidden behind a floating button
  // that opens this Sheet so it doesn't push the search/summary out of view.
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false)

  // Variant (color/size) picker — shown before adding a product that has
  // variants to the cart, so the cashier always sells a specific one.
  const [variantPickerOpen, setVariantPickerOpen] = React.useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = React.useState<ProductLite | null>(null)
  const [variantPickerVariants, setVariantPickerVariants] = React.useState<PosVariant[]>([])
  const [variantPickerUnits, setVariantPickerUnits] = React.useState<PosUnit[]>([])

  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const [productDlgOpen, setProductDlgOpen] = React.useState(false)
  const [productInitial, setProductInitial] = React.useState<Record<string,any> | null>(null)

  // فتح دايلوج المنتج الجديد مباشرة في نقطة البيع
  React.useEffect(() => {
    if (quickAdd.open) {
      setProductInitial(quickAdd.seed ? { name: quickAdd.seed, barcode: quickAdd.seed } : {})
      setProductDlgOpen(true)
      closeQuickAdd()
    }
  }, [quickAdd, closeQuickAdd])
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const capabilities = useShopStore((s) => s.plan.capabilities)

  const hasUnitsCap = capabilities.includes('multi_unit')
  const hasVariantsCap = capabilities.includes('variants')

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

  // debounced search — retries once on a network/server hiccup and ignores
  // stale responses so an old empty result never overwrites a newer one.
  const [searchError, setSearchError] = React.useState(false)
  React.useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setOpen(false); setSearchError(false); return }
    setSearchLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const url = `/api/products?search=${encodeURIComponent(q)}&limit=20`
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await api<{ data: ProductLite[] } | ProductLite[]>(url)
          if (cancelled) return
          const data = Array.isArray(res) ? res : (res as any)?.data ?? []
          setResults(data)
          setSearchError(false)
          setOpen(true)
          setSearchLoading(false)
          return
        } catch {
          if (cancelled) return
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!cancelled) { setResults([]); setSearchError(true); setSearchLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)

  // ── Product selection: fetch units, then add to cart ──

  const addToCartDirect = (
    product: ProductLite,
    unitId: number | null,
    unitLabel: string | null,
    maxQuantity: number,
    availableUnits: PosUnit[],
    variantId: number | null = null,
    variantLabel: string | null = null,
    availableVariants: PosVariant[] = [],
  ) => {
    const cartKey = `${product.id}-${unitId ?? 'x'}-${variantId ?? 'x'}`
    const unit = unitId ? availableUnits.find((u) => u.id === unitId) : null
    const factor = unit?.factor ?? 1
    // Per-piece price: if unit has its own price, spread it across factor pieces.
    // Note: an unpriced WHOLESALE unit still falls back to the raw flat
    // product.price (never the dynamic retail price) — a cashier/admin who
    // forgot to price a wholesale unit shouldn't have it silently inflated
    // by the retail markup. Dynamic pricing only kicks in for actual "Piece".
    const perPiecePrice = unit
      ? (unit.price != null ? unit.price / factor : product.price)
      : piecePrice(product)
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
        toast.error(
          variantLabel
            ? `الكمية غير متوفرة لهذا اللون/المقاس (${variantLabel})`
            : 'الكمية غير متوفرة لهذا المنتج'
        )
        return prev
      }
      return [...prev, {
        cartKey, product, price: perPiecePrice, quantity: Math.min(startQty, maxQuantity), maxQuantity,
        unitId, unitLabel, unitFactor: factor, availableUnits,
        variantId, variantLabel, availableVariants,
      }]
    })
  }

  const handleProductSelect = async (p: ProductLite, preselectedVariantId?: number | null) => {
    setQuery('')
    setResults([])
    setOpen(false)
    if (addingProduct) return
    setAddingProduct(true)
    try {
      const [unitData, variantData] = await Promise.all([
        hasUnitsCap
          ? api<any[]>(`/api/products/${p.id}/units`).then((d) =>
              d.map((u: any) => ({
                id: u.id,
                name: u.name,
                price: u.price,
                factor: u.factor,
              }))
            ).catch(() => [])
          : Promise.resolve([]),
        hasVariantsCap
          ? api<any[]>(`/api/products/${p.id}/variants`).then((d) =>
              d.map((v: any) => ({
                id: v.id,
                size: v.size,
                color: v.color,
                quantity: v.quantity,
              }))
            ).catch(() => [])
          : Promise.resolve([]),
      ])

      if (variantData.length > 0) {
        // Scanning a variant's own barcode already tells us exactly which
        // color/size was sold — skip the picker and add it straight away.
        if (preselectedVariantId) {
          const v = variantData.find((v: PosVariant) => v.id === preselectedVariantId)
          if (v) {
            addToCartDirect(p, null, null, v.quantity, unitData, v.id, variantLabelOf(v), variantData)
            return
          }
        }
        // This product has colors/sizes — the cashier must pick exactly which
        // one is being sold before it goes in the cart, so stock is deducted
        // from the right variant instead of the product's stale aggregate.
        setVariantPickerProduct(p)
        setVariantPickerUnits(unitData)
        setVariantPickerVariants(variantData)
        setVariantPickerOpen(true)
        return
      }

      addToCartDirect(p, null, null, p.quantity, unitData)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل بيانات المنتج')
    } finally {
      setAddingProduct(false)
    }
  }

  const handleVariantPick = (variant: PosVariant) => {
    if (!variantPickerProduct) return
    addToCartDirect(
      variantPickerProduct,
      null,
      null,
      variant.quantity,
      variantPickerUnits,
      variant.id,
      variantLabelOf(variant),
      variantPickerVariants,
    )
    setVariantPickerOpen(false)
    setVariantPickerProduct(null)
    setVariantPickerVariants([])
    setVariantPickerUnits([])
  }

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearchLoading(true)
    try {
      const res = await api<{ data: ProductLite[] } | ProductLite[]>(`/api/products?search=${encodeURIComponent(q)}`)
      const data = Array.isArray(res) ? res : (res as any)?.data ?? []
      const exact = data.find((r) => r.barcode === q)
      // Scanned/typed code matched a specific variant's own barcode (not the
      // product's main barcode) — go straight to that color/size.
      const variantExact = data.find((r) => r.matchedVariantId != null)
      if (exact) {
        await handleProductSelect(exact)
      } else if (variantExact) {
        await handleProductSelect(variantExact, variantExact.matchedVariantId)
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
        const newKey = `${i.product.id}-${newUnitId ?? 'x'}-${i.variantId ?? 'x'}`
        const factor = unit?.factor ?? 1
        // Same rule as addToCartDirect: unpriced wholesale unit → raw flat
        // product.price, never the dynamic retail price. Only true "Piece"
        // (unit === null) uses the dynamic retail calculation.
        const perPiecePrice = unit
          ? (unit.price != null ? unit.price / factor : i.product.price)
          : piecePrice(i.product)
        // Base ceiling: the selected variant's own stock if this line is a
        // specific color/size, otherwise the product's aggregate stock.
        const baseStock = i.variantId
          ? (i.availableVariants.find((v) => v.id === i.variantId)?.quantity ?? 0)
          : i.product.quantity
        const newMax = unit?.factor
          ? Math.floor(baseStock / unit.factor) * unit.factor
          : baseStock
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

  // Change the specific color/size for a cart line without re-searching
  const updateVariant = (cartKey: string, variant: PosVariant | null) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const newVariantId = variant?.id ?? null
        const newKey = `${i.product.id}-${i.unitId ?? 'x'}-${newVariantId ?? 'x'}`
        const baseStock = variant ? variant.quantity : i.product.quantity
        const newMax = i.unitFactor > 1
          ? Math.floor(baseStock / i.unitFactor) * i.unitFactor
          : baseStock
        return {
          ...i,
          cartKey: newKey,
          variantId: newVariantId,
          variantLabel: variant ? variantLabelOf(variant) : null,
          quantity: Math.min(i.unitFactor, newMax),
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
              ...(i.variantId ? { variantId: i.variantId } : {}),
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
            const variantSuffix = it.variant
              ? ` — ${[it.variant.color, it.variant.size].filter(Boolean).join(' / ')}`
              : ''
            return {
              name: it.name + variantSuffix + unitSuffix,
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

      // ⚡ Thermal printer — ESC/POS direct printing (if configured)
      const _ts = getStoredPrinterSettings()
      if (_ts.width) {
        printThermalReceipt({
          shopName: shopName || 'محل',
          shopPhone: shopBranding.phone || undefined,
          shopAddress: shopBranding.address || undefined,
          invoiceNo: sale.invoiceNo ?? String(sale.id),
          date: new Date(sale.createdAt).toLocaleString('ar-EG'),
          items: sale.items.map((it: any) => ({
            name: it.name + (it.variant ? ` ${[it.variant.color, it.variant.size].filter(Boolean).join('/')}` : ''),
            qty: it.unitQuantity ?? it.quantity,
            price: it.unitQuantity ? (it.price * it.quantity) / it.unitQuantity : it.price,
            total: it.price * it.quantity,
          })),
          total: sale.total,
          paid: sale.paid,
          remaining: sale.total - sale.paid,
          customerName: sale.customer?.name,
        })
      }

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
                            onClick={() => void handleProductSelect(p, p.matchedVariantId)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
                          >
                            <div>
                              <p className="font-medium">{p.name}</p>
                              {p.barcode && (
                                <p className="text-xs text-muted-foreground">{p.barcode}</p>
                              )}
                              {p.matchedVariantLabel && (
                                <p className="text-xs text-primary">
                                  مطابقة: {p.matchedVariantLabel}
                                </p>
                              )}
                            </div>
                            <div className="text-left text-xs">
                              <p className="font-semibold text-primary">{formatCurrency(piecePrice(p))}</p>
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

                {query.trim() && !searchLoading && searchError && (
                  <p className="mt-2 text-sm text-destructive">تعذّر البحث — تأكد من الاتصال وجرّب تاني.</p>
                )}
                {query.trim() && !searchError && !searchLoading && results.length === 0 && (
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

          {/*
            Cart — Desktop (lg+): rendered inline as a Card with the table layout.
            Mobile (below lg): hidden — replaced by a floating "عرض السلة"
            button + Sheet drawer with the same content but stacked-card layout.
          */}
          <Card className="hidden lg:block">
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
                <div className="overflow-x-auto" dir="ltr">
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
                            {/* Variant (color/size) selector */}
                            {it.availableVariants.length > 0 && (
                              <div className="mt-1">
                                <select
                                  value={it.variantId ?? ''}
                                  onChange={(e) => {
                                    const vid = e.target.value ? parseInt(e.target.value, 10) : null
                                    const variant = vid
                                      ? it.availableVariants.find((v) => v.id === vid) ?? null
                                      : null
                                    updateVariant(it.cartKey, variant)
                                  }}
                                  className="rounded border bg-background px-2 py-0.5 text-xs"
                                >
                                  <option value="" disabled>اختار اللون/المقاس</option>
                                  {it.availableVariants.map((v) => (
                                    <option key={v.id} value={v.id} disabled={v.quantity <= 0}>
                                      {variantLabelOf(v)} {v.quantity <= 0 ? '(نفد)' : `(متاح ${v.quantity})`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
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

          {/*
            Mobile (below lg): Floating "عرض السلة" button — opens a Sheet
            containing the same cart but with a stacked-card layout.
          */}
          <Button
            type="button"
            onClick={() => setCartSheetOpen(true)}
            className="fixed bottom-4 left-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg lg:hidden"
            size="lg"
          >
            <ShoppingCart className="size-5" />
            عرض السلة
            {cart.length > 0 && (
              <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-primary-foreground text-xs font-bold text-primary">
                {cart.length}
              </span>
            )}
          </Button>

          <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
            <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto overscroll-contain p-0 sm:max-w-md sm:mx-auto">
              <SheetTitle className="flex items-center gap-2 px-4 py-3 text-base">
                <ShoppingCart className="size-4 text-primary" />
                السلة ({cart.length})
              </SheetTitle>
              <div className="space-y-2 px-3 pb-4">
                {cart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    السلة فارغة — ابحث وأضف منتجات للبدء
                  </p>
                ) : (
                  cart.map((it) => (
                    <div key={it.cartKey} className="rounded-lg border bg-card p-2.5">
                      {/* Product name + remove */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate font-medium leading-tight">
                          {it.product.name}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeItem(it.cartKey)}
                          title="حذف"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>

                      {/* Variant (color/size) selector */}
                      {it.availableVariants.length > 0 && (
                        <div className="mt-2">
                          <select
                            value={it.variantId ?? ''}
                            onChange={(e) => {
                              const vid = e.target.value ? parseInt(e.target.value, 10) : null
                              const variant = vid
                                ? it.availableVariants.find((v) => v.id === vid) ?? null
                                : null
                              updateVariant(it.cartKey, variant)
                            }}
                            className="w-full rounded border bg-background px-2 py-1 text-xs"
                          >
                            <option value="" disabled>اختار اللون/المقاس</option>
                            {it.availableVariants.map((v) => (
                              <option key={v.id} value={v.id} disabled={v.quantity <= 0}>
                                {variantLabelOf(v)} {v.quantity <= 0 ? '(نفد)' : `(متاح ${v.quantity})`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Unit selector */}
                      {it.availableUnits.length > 0 && (
                        <div className="mt-2">
                          <select
                            value={it.unitId ?? ''}
                            onChange={(e) => {
                              const uid = e.target.value ? parseInt(e.target.value, 10) : null
                              const unit = uid
                                ? it.availableUnits.find((u) => u.id === uid) ?? null
                                : null
                              updateUnit(it.cartKey, unit)
                            }}
                            className="w-full rounded border bg-background px-2 py-1 text-xs"
                          >
                            <option value="">قطعة</option>
                            {it.availableUnits.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                                {u.price != null ? ` (${formatCurrency(u.price)})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Price + Quantity + Total row */}
                      <div className="mt-2 flex items-end gap-2 border-t border-border/60 pt-2">
                        <div className="flex-1">
                          <label className="block text-[10px] text-muted-foreground">السعر</label>
                          <Input
                            type="number"
                            value={it.price}
                            onChange={(e) => updatePrice(it.cartKey, parseFloat(e.target.value) || 0)}
                            className="h-8 text-center"
                            min={0}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] text-muted-foreground">الكمية</label>
                          <Input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateQty(it.cartKey, parseInt(e.target.value, 10) || 1)}
                            className="h-8 text-center"
                            min={1}
                            max={it.maxQuantity}
                          />
                        </div>
                        <div className="text-left">
                          <label className="block text-[10px] text-muted-foreground">الإجمالي</label>
                          <p className="text-sm font-semibold tabular-nums">
                            {formatCurrency(it.price * it.quantity)}
                          </p>
                        </div>
                      </div>

                      {/* Available + unit label footer */}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        متاح: {it.maxQuantity}
                        {it.unitLabel ? ` • ${it.unitLabel}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
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

      {/* Variant (color/size) picker — shown before a variant-product is added to the cart */}
      <Dialog open={variantPickerOpen} onOpenChange={(o) => {
        setVariantPickerOpen(o)
        if (!o) {
          setVariantPickerProduct(null)
          setVariantPickerVariants([])
          setVariantPickerUnits([])
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>اختار اللون/المقاس — {variantPickerProduct?.name}</DialogTitle>
          </DialogHeader>
          {variantPickerVariants.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا يوجد ألوان/مقاسات مسجلة لهذا المنتج
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {variantPickerVariants.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={v.quantity <= 0}
                    onClick={() => handleVariantPick(v)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-right text-sm hover:bg-accent',
                      v.quantity <= 0 && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                    )}
                  >
                    <span className="font-medium">{variantLabelOf(v)}</span>
                    <span
                      className={cn(
                        'text-xs',
                        v.quantity <= 0 ? 'text-destructive font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {v.quantity <= 0 ? 'نفد' : `متاح ${v.quantity}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantPickerOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── دايلوج إضافة منتج جديد من نقطة البيع ── */}
      <ProductDialog
        open={productDlgOpen}
        onOpenChange={setProductDlgOpen}
        initial={productInitial}
        onSaved={() => { setProductDlgOpen(false); setProductInitial(null) }}
      />
    </div>
  )
}
