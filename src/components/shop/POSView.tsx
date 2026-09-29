'use client'

import * as React from 'react'
import {
  AlertTriangle,
  Banknote,
  Check,
  ChevronLeft,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  PackageSearch,
  Plus,
  ScanBarcode,
  Search,
  ShoppingBag,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { printSale } from '@/lib/print-client'
import { printThermalReceipt, getStoredPrinterSettings } from '@/lib/thermal-printer'
import { ProductDialog } from './ProductDialog'

/* ────────────────────────────────────────────────────────────────
   Types (unchanged business model)
   ──────────────────────────────────────────────────────────────── */

interface ProductLite {
  id: number
  name: string
  barcode: string | null
  price: number
  quantity: number
  category?: string | null
  imagePath?: string | null
  matchedVariantId?: number | null
  matchedVariantLabel?: string | null
  dynamicRetailPrice?: number | null
}

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

interface PosVariant {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

function variantLabelOf(v: PosVariant): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || `#${v.id}`
}

interface CartItem {
  cartKey: string
  product: ProductLite
  price: number
  quantity: number
  maxQuantity: number
  unitId: number | null
  unitLabel: string | null
  unitFactor: number
  availableUnits: PosUnit[]
  variantId: number | null
  variantLabel: string | null
  availableVariants: PosVariant[]
}

interface CategoryLite {
  id: number | string
  name: string
}

const LOW_STOCK_THRESHOLD = 5

function readLS<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function writeLS(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota — ignore */
  }
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Tailwind v4 derives every spacing / size utility from --spacing and every
// font size from --text-*. Overriding them on the POS root shrinks (or grows)
// the whole screen proportionally without transforms, so scrolling, focus and
// hit-testing keep working. Text shrinks slower than spacing to stay legible.
function densityVars(f: number): React.CSSProperties {
  const tf = 0.4 + 0.6 * f
  const r = (n: number) => `${(n * tf).toFixed(4)}rem`
  return {
    '--spacing': `${(0.25 * f).toFixed(4)}rem`,
    '--text-xs': r(0.75),
    '--text-sm': r(0.875),
    '--text-base': r(1),
    '--text-lg': r(1.125),
    '--text-xl': r(1.25),
    '--text-2xl': r(1.5),
    '--text-3xl': r(1.875),
    '--fs-2xs': r(0.6875),
  } as React.CSSProperties
}

/* ────────────────────────────────────────────────────────────────
   Small presentational helpers
   ──────────────────────────────────────────────────────────────── */

/** Deterministic soft tint per product so the grid isn't a wall of grey icons. */
function tintFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return {
    background: `hsl(${h} 45% 92%)`,
    color: `hsl(${h} 45% 30%)`,
  }
}

function ProductThumb({
  name,
  imagePath,
  className,
}: {
  name: string
  imagePath?: string | null
  className?: string
}) {
  const [failed, setFailed] = React.useState(false)
  if (imagePath && !failed) {
    return (
      <div className={cn('shrink-0 overflow-hidden rounded-xl bg-muted', className)}>
        <img
          src={imagePath}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    )
  }
  const letter = name.trim().charAt(0) || '؟'
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-xl text-lg font-bold', className)}
      style={tintFor(name)}
      aria-hidden
    >
      {letter}
    </div>
  )
}

function StockBadge({ quantity }: { quantity: number }) {
  if (quantity <= 0)
    return (
      <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-medium text-danger-subtle-foreground">
        نفد
      </span>
    )
  if (quantity <= LOW_STOCK_THRESHOLD)
    return (
      <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-medium text-warning-subtle-foreground">
        باقي {quantity}
      </span>
    )
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-medium text-muted-foreground tabular-nums">
      متاح {quantity}
    </span>
  )
}

const selectCls =
  'h-8 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors hover:border-border-strong focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20'

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  React.useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}

/* ────────────────────────────────────────────────────────────────
   Main view
   ──────────────────────────────────────────────────────────────── */

export function POSView() {
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState<string>('all')
  const [categories, setCategories] = React.useState<CategoryLite[]>([])
  const [products, setProducts] = React.useState<ProductLite[]>([])
  const [productsLoading, setProductsLoading] = React.useState(true)
  const [searchError, setSearchError] = React.useState(false)
  const [refreshTick, setRefreshTick] = React.useState(0)

  const [cart, setCart] = React.useState<CartItem[]>([])
  const [lastAddedKey, setLastAddedKey] = React.useState<string | null>(null)
  const [confirmClear, setConfirmClear] = React.useState(false)

  const [customers, setCustomers] = React.useState<CustomerLite[]>([])
  const [custQuery, setCustQuery] = React.useState('')
  const [custOpen, setCustOpen] = React.useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<number | null>(null)
  const [customerName, setCustomerName] = React.useState('')
  const [paidFull, setPaidFull] = React.useState(true)
  const [paidAmount, setPaidAmount] = React.useState(0)
  const [received, setReceived] = React.useState<number | ''>('')
  const [submitting, setSubmitting] = React.useState(false)
  const [customersVersion, setCustomersVersion] = React.useState(0)
  const [addingProduct, setAddingProduct] = React.useState(false)
  const [cartSheetOpen, setCartSheetOpen] = React.useState(false)

  const [variantPickerOpen, setVariantPickerOpen] = React.useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = React.useState<ProductLite | null>(null)
  const [variantPickerVariants, setVariantPickerVariants] = React.useState<PosVariant[]>([])
  const [variantPickerUnits, setVariantPickerUnits] = React.useState<PosUnit[]>([])

  const searchRef = React.useRef<HTMLInputElement>(null)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Smart fit: pick a scale from the space we actually have (height AND the
  // width left after the sidebar), then let the cashier nudge it ± and remember.
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [fit, setFit] = React.useState(1)
  const [sizeStep, setSizeStep] = React.useState<number>(() => readLS('pos:sizeStep', 0))
  const [fullscreen, setFullscreen] = React.useState<boolean>(() => readLS('pos:fullscreen', false))
  const isFull = fullscreen && isDesktop
  const scale = isDesktop ? clamp(fit * (1 + 0.08 * sizeStep), 0.65, 1.3) : 1

  React.useEffect(() => writeLS('pos:sizeStep', sizeStep), [sizeStep])
  React.useEffect(() => writeLS('pos:fullscreen', fullscreen), [fullscreen])
  React.useEffect(() => {
    const el = rootRef.current
    const calc = () => {
      const h = window.innerHeight
      const w = isFull ? window.innerWidth : el?.clientWidth ?? window.innerWidth
      setFit(Math.round(clamp(Math.min(h / 950, w / 1300), 0.8, 1.1) * 100) / 100)
    }
    calc()
    window.addEventListener('resize', calc)
    const ro = el ? new ResizeObserver(calc) : null
    if (el && ro) ro.observe(el)
    return () => {
      window.removeEventListener('resize', calc)
      ro?.disconnect()
    }
  }, [isFull])

  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const [productDlgOpen, setProductDlgOpen] = React.useState(false)
  const [productInitial, setProductInitial] = React.useState<Record<string, any> | null>(null)

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

  /* ── data loading ───────────────────────────────────────────── */

  React.useEffect(() => {
    let alive = true
    api<CustomerLite[]>('/api/customers')
      .then((d) => alive && setCustomers(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [customersVersion])

  React.useEffect(() => {
    let alive = true
    api<CategoryLite[]>('/api/categories')
      .then((d) => alive && setCategories(Array.isArray(d) ? d : []))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // The grid is always populated: latest products by default, filtered by the
  // search box and the selected category. `search=` is always present in the
  // URL so the offline layer keeps serving it from IndexedDB.
  React.useEffect(() => {
    const q = query.trim()
    setProductsLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      const url =
        `/api/products?search=${encodeURIComponent(q)}&limit=40` +
        (category !== 'all' ? `&category=${encodeURIComponent(category)}` : '')
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await api<{ data: ProductLite[] } | ProductLite[]>(url)
          if (cancelled) return
          const data = Array.isArray(res) ? res : (res as any)?.data ?? []
          setProducts(data)
          setSearchError(false)
          setProductsLoading(false)
          return
        } catch {
          if (cancelled) return
          if (attempt === 0) await new Promise((r) => setTimeout(r, 400))
        }
      }
      if (!cancelled) {
        setProducts([])
        setSearchError(true)
        setProductsLoading(false)
      }
    }, q ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, category, refreshTick])

  const resolvedCustomer = React.useMemo(() => {
    if (selectedCustomerId) return customers.find((x) => x.id === selectedCustomerId) ?? null
    const t = customerName.trim()
    return t ? customers.find((x) => x.name.trim() === t) ?? null : null
  }, [selectedCustomerId, customerName, customers])
  const typedUnknownCustomer = !resolvedCustomer && !!customerName.trim()

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

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const totalPieces = cart.reduce((s, i) => s + i.quantity, 0)
  const effectivePaid = paidFull ? total : paidAmount
  const remaining = Math.max(0, total - effectivePaid)
  const creditNeedsCustomer = !paidFull && remaining > 0 && !resolvedCustomer
  const change = paidFull && typeof received === 'number' && received > total ? received - total : 0
  const canCheckout = cart.length > 0 && !submitting && !creditNeedsCustomer

  /* ── cart operations (logic unchanged) ──────────────────────── */

  const flashLine = (key: string) => {
    setLastAddedKey(key)
    window.setTimeout(() => setLastAddedKey((k) => (k === key ? null : k)), 900)
  }

  const addToCartDirect = (
    product: ProductLite,
    unitId: number | null,
    unitLabel: string | null,
    maxQuantity: number,
    availableUnits: PosUnit[],
    variantId: number | null = null,
    variantLabel: string | null = null,
    availableVariants: PosVariant[] = []
  ) => {
    const cartKey = `${product.id}-${unitId ?? 'x'}-${variantId ?? 'x'}`
    const unit = unitId ? availableUnits.find((u) => u.id === unitId) : null
    const factor = unit?.factor ?? 1
    const perPiecePrice = unit
      ? unit.price != null
        ? unit.price / factor
        : product.price
      : piecePrice(product)
    const startQty = factor

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
      return [
        ...prev,
        {
          cartKey,
          product,
          price: perPiecePrice,
          quantity: Math.min(startQty, maxQuantity),
          maxQuantity,
          unitId,
          unitLabel,
          unitFactor: factor,
          availableUnits,
          variantId,
          variantLabel,
          availableVariants,
        },
      ]
    })
    flashLine(cartKey)
  }

  const handleProductSelect = async (p: ProductLite, preselectedVariantId?: number | null) => {
    if (addingProduct) return
    setAddingProduct(true)
    try {
      const [unitData, variantData] = await Promise.all([
        hasUnitsCap
          ? api<any[]>(`/api/products/${p.id}/units`)
              .then((d) =>
                d.map((u: any) => ({ id: u.id, name: u.name, price: u.price, factor: u.factor }))
              )
              .catch(() => [])
          : Promise.resolve([]),
        hasVariantsCap
          ? api<any[]>(`/api/products/${p.id}/variants`)
              .then((d) =>
                d.map((v: any) => ({
                  id: v.id,
                  size: v.size,
                  color: v.color,
                  quantity: v.quantity,
                }))
              )
              .catch(() => [])
          : Promise.resolve([]),
      ])

      if (variantData.length > 0) {
        if (preselectedVariantId) {
          const v = variantData.find((v: PosVariant) => v.id === preselectedVariantId)
          if (v) {
            addToCartDirect(p, null, null, v.quantity, unitData, v.id, variantLabelOf(v), variantData)
            return
          }
        }
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
      variantPickerVariants
    )
    setVariantPickerOpen(false)
    setVariantPickerProduct(null)
    setVariantPickerVariants([])
    setVariantPickerUnits([])
  }

  // Enter in the search box = barcode scanner behaviour: an exact code goes
  // straight to the cart; otherwise the grid already shows the matches.
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    try {
      const res = await api<{ data: ProductLite[] } | ProductLite[]>(
        `/api/products?search=${encodeURIComponent(q)}`
      )
      const data = Array.isArray(res) ? res : (res as any)?.data ?? []
      const exact = data.find((r) => r.barcode === q)
      const variantExact = data.find((r) => r.matchedVariantId != null)
      if (exact) {
        await handleProductSelect(exact)
        setQuery('')
      } else if (variantExact) {
        await handleProductSelect(variantExact, variantExact.matchedVariantId)
        setQuery('')
      } else if (data.length === 1) {
        await handleProductSelect(data[0])
        setQuery('')
      } else if (data.length === 0) {
        toast.error('لا يوجد منتج بهذا الاسم أو الباركود')
      }
    } catch {
      toast.error('فشل البحث عن المنتج')
    }
  }

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
    setCart((prev) => prev.map((i) => (i.cartKey === cartKey ? { ...i, price: Math.max(0, p) } : i)))
  }

  const removeItem = (cartKey: string) => {
    setCart((prev) => prev.filter((i) => i.cartKey !== cartKey))
  }

  const clearCart = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      window.setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setCart([])
    setConfirmClear(false)
  }

  const updateUnit = (cartKey: string, unit: PosUnit | null) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const newUnitId = unit?.id ?? null
        const newKey = `${i.product.id}-${newUnitId ?? 'x'}-${i.variantId ?? 'x'}`
        const factor = unit?.factor ?? 1
        const perPiecePrice = unit
          ? unit.price != null
            ? unit.price / factor
            : i.product.price
          : piecePrice(i.product)
        const baseStock = i.variantId
          ? i.availableVariants.find((v) => v.id === i.variantId)?.quantity ?? 0
          : i.product.quantity
        const newMax = unit?.factor ? Math.floor(baseStock / unit.factor) * unit.factor : baseStock
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

  const updateVariant = (cartKey: string, variant: PosVariant | null) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.cartKey !== cartKey) return i
        const newVariantId = variant?.id ?? null
        const newKey = `${i.product.id}-${i.unitId ?? 'x'}-${newVariantId ?? 'x'}`
        const baseStock = variant ? variant.quantity : i.product.quantity
        const newMax =
          i.unitFactor > 1 ? Math.floor(baseStock / i.unitFactor) * i.unitFactor : baseStock
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

  /* ── checkout (logic unchanged) ─────────────────────────────── */

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error('السلة فارغة')
      return
    }
    if (creditNeedsCustomer) {
      toast.error('البيع بالآجل لازم يكون مرتبط بعميل')
      return
    }
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
      toast.success(`تمت عملية البيع بنجاح - ${sale.invoiceNo}`)
      printSale(
        {
          id: sale.id,
          invoiceNo: sale.invoiceNo,
          total: sale.total,
          paid: sale.paid,
          status: sale.status,
          createdAt: sale.createdAt,
          items: sale.items.map((it: any) => {
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

      const _ts = getStoredPrinterSettings()
      if (_ts.width) {
        printThermalReceipt({
          shopName: shopName || 'محل',
          shopPhone: shopBranding.phone || undefined,
          shopAddress: shopBranding.address || undefined,
          invoiceNo: sale.invoiceNo ?? String(sale.id),
          date: new Date(sale.createdAt).toLocaleString('ar-EG'),
          items: sale.items.map((it: any) => ({
            name:
              it.name +
              (it.variant
                ? ` ${[it.variant.color, it.variant.size].filter(Boolean).join('/')}`
                : ''),
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
      setSelectedCustomerId(null)
      setPaidFull(true)
      setPaidAmount(0)
      setReceived('')
      setCartSheetOpen(false)
      setCustomersVersion((v) => v + 1)
      // Refresh stock numbers in the grid and get ready for the next scan.
      setRefreshTick((t) => t + 1)
      searchRef.current?.focus()
    } catch (e: any) {
      toast.error(e?.message || 'فشل إتمام البيع')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── keyboard shortcuts: "/" search · Esc clear · F9 pay ─────── */

  const checkoutRef = React.useRef(checkout)
  checkoutRef.current = checkout
  const canCheckoutRef = React.useRef(canCheckout)
  canCheckoutRef.current = canCheckout

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'F9') {
        e.preventDefault()
        if (canCheckoutRef.current) void checkoutRef.current()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('')
      } else if (e.key === 'Escape' && !typing && !document.querySelector('[role="dialog"]')) {
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filteredCustomers = custQuery.trim()
    ? customers.filter(
        (c) => c.name.includes(custQuery.trim()) || (c.phone ?? '').includes(custQuery.trim())
      )
    : customers.slice(0, 6)

  /* ────────────────────────────────────────────────────────────
     Panels (JSX values, not inner components, so inputs keep focus)
     ──────────────────────────────────────────────────────────── */

  const productsPanel = (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="space-y-2.5 border-b border-border p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">المنتجات</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {productsLoading ? 'جاري التحميل…' : `${products.length} منتج`}
          </span>
        </div>

        <form onSubmit={handleSearchSubmit}>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو امسح الباركود…"
              className="h-11 rounded-xl bg-muted/40 pr-10 pl-20 text-base"
              autoFocus
              inputMode="search"
            />
            <div className="absolute left-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {(productsLoading || addingProduct) && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    searchRef.current?.focus()
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="مسح البحث"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="hidden rounded-md border border-border bg-background px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] text-muted-foreground sm:inline-block">
                  /
                </kbd>
              )}
              <ScanBarcode className="size-4 text-muted-foreground" aria-hidden />
            </div>
          </div>
        </form>

        {categories.length > 0 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {[{ id: 'all', name: 'الكل' }, ...categories].map((c) => {
              const active = category === (c.id === 'all' ? 'all' : c.name)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id === 'all' ? 'all' : c.name)}
                  className={cn(
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground'
                  )}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 lg:max-h-[75dvh] xl:max-h-none">
        {searchError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">تعذّر تحميل المنتجات — تأكد من الاتصال وجرّب تاني.</p>
            <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)}>
              إعادة المحاولة
            </Button>
          </div>
        ) : productsLoading && products.length === 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(calc(var(--spacing)*38),1fr))] gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-33 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <PackageSearch className="size-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">لا يوجد منتج مطابق</p>
              <p className="text-sm text-muted-foreground">جرّب اسم تاني أو أضف المنتج دلوقتي.</p>
            </div>
            <Button size="sm" variant="subtle" onClick={() => openQuickAddProduct()}>
              <Plus className="size-4" />
              أضف منتجاً جديداً
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(calc(var(--spacing)*38),1fr))] gap-2.5">
            {products.map((p) => {
              const inCart = cart
                .filter((i) => i.product.id === p.id)
                .reduce((s, i) => s + i.quantity, 0)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void handleProductSelect(p, p.matchedVariantId)}
                    className={cn(
                      'group relative flex h-full w-full flex-col gap-2 rounded-xl border border-border bg-background p-2.5 text-right transition-all',
                      'hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md active:translate-y-0 active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      p.quantity <= 0 && 'opacity-60'
                    )}
                  >
                    {inCart > 0 && (
                      <span className="absolute left-2 top-2 z-10 flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-bold text-primary-foreground tabular-nums shadow">
                        {inCart}
                      </span>
                    )}
                    <ProductThumb
                      name={p.name}
                      imagePath={p.imagePath}
                      className="aspect-[16/10] w-full text-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                      {p.matchedVariantLabel && (
                        <p className="mt-0.5 truncate text-[length:var(--fs-2xs,0.6875rem)] text-primary">
                          مطابقة: {p.matchedVariantLabel}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-bold tabular-nums text-primary">
                        {formatCurrency(piecePrice(p))}
                      </span>
                      <StockBadge quantity={p.quantity} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )

  const cartLines = cart.length === 0 ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary-subtle text-primary-subtle-foreground">
        <ShoppingBag className="size-8" />
      </div>
      <div>
        <p className="font-semibold">السلة فاضية</p>
        <p className="mt-1 text-sm text-muted-foreground">
          اضغط على أي منتج أو امسح الباركود لبدء الفاتورة.
        </p>
      </div>
    </div>
  ) : (
    <ul className="divide-y divide-border">
      {cart.map((it) => {
        const atMax = it.quantity >= it.maxQuantity
        const step = it.unitFactor || 1
        const spinless =
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
        return (
          <li
            key={it.cartKey}
            className={cn(
              'space-y-1.5 px-3.5 py-2.5 transition-colors duration-700',
              lastAddedKey === it.cartKey && 'bg-primary-subtle/60'
            )}
          >
            <div className="flex items-center gap-3">
              <ProductThumb
                name={it.product.name}
                imagePath={it.product.imagePath}
                className="size-9 text-base"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{it.product.name}</p>
                <p
                  className={cn(
                    'mt-0.5 flex items-center gap-1 text-[length:var(--fs-2xs,0.6875rem)] tabular-nums',
                    atMax ? 'font-medium text-warning-subtle-foreground' : 'text-muted-foreground'
                  )}
                >
                  {atMax && <AlertTriangle className="size-3" />}
                  {atMax ? 'وصلت لآخر كمية متاحة' : `متاح ${it.maxQuantity}`}
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums">
                {formatCurrency(it.price * it.quantity)}
              </span>
              <button
                type="button"
                onClick={() => removeItem(it.cartKey)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-destructive"
                aria-label={`حذف ${it.product.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {it.availableVariants.length > 0 && (
              <select
                value={it.variantId ?? ''}
                onChange={(e) => {
                  const vid = e.target.value ? parseInt(e.target.value, 10) : null
                  updateVariant(
                    it.cartKey,
                    vid ? it.availableVariants.find((v) => v.id === vid) ?? null : null
                  )
                }}
                className={cn(selectCls, 'h-8 rounded-xl')}
                aria-label="اللون / المقاس"
              >
                <option value="" disabled>
                  اختار اللون/المقاس
                </option>
                {it.availableVariants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.quantity <= 0}>
                    {variantLabelOf(v)} {v.quantity <= 0 ? '(نفد)' : `(متاح ${v.quantity})`}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              {/* Stepper — forced LTR so it always reads  − 1 +  */}
              <div
                dir="ltr"
                className="flex shrink-0 items-center overflow-hidden rounded-xl border border-border bg-background"
              >
                <button
                  type="button"
                  onClick={() => updateQty(it.cartKey, it.quantity - step)}
                  disabled={it.quantity <= step}
                  className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  aria-label="تقليل الكمية"
                >
                  <Minus className="size-4" />
                </button>
                <input
                  type="number"
                  value={it.quantity}
                  min={step}
                  max={it.maxQuantity}
                  onChange={(e) => updateQty(it.cartKey, parseInt(e.target.value, 10) || step)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={cn(
                    'h-8 w-10 bg-transparent text-center text-sm font-bold tabular-nums outline-none',
                    spinless
                  )}
                  aria-label="الكمية"
                />
                <button
                  type="button"
                  onClick={() => updateQty(it.cartKey, it.quantity + step)}
                  disabled={atMax}
                  className="flex size-8 items-center justify-center text-primary transition-colors hover:bg-primary-subtle disabled:text-muted-foreground disabled:opacity-40"
                  aria-label="زيادة الكمية"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              {it.availableUnits.length > 0 ? (
                <select
                  value={it.unitId ?? ''}
                  onChange={(e) => {
                    const uid = e.target.value ? parseInt(e.target.value, 10) : null
                    updateUnit(
                      it.cartKey,
                      uid ? it.availableUnits.find((u) => u.id === uid) ?? null : null
                    )
                  }}
                  className={cn(selectCls, 'h-8 min-w-0 flex-1 rounded-xl')}
                  aria-label="الوحدة"
                >
                  <option value="">قطعة</option>
                  {it.availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.price != null ? ` (${formatCurrency(u.price)})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex-1" />
              )}

              <label
                className="flex h-8 w-24 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-[length:var(--fs-2xs,0.6875rem)] text-muted-foreground transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 hover:border-border-strong"
                title="سعر القطعة (ممكن تعدّله)"
              >
                <span>السعر</span>
                <input
                  type="number"
                  value={it.price}
                  min={0}
                  onChange={(e) => updatePrice(it.cartKey, parseFloat(e.target.value) || 0)}
                  onFocus={(e) => e.currentTarget.select()}
                  className={cn(
                    'w-full min-w-0 bg-transparent text-center text-sm font-semibold tabular-nums text-foreground outline-none',
                    spinless
                  )}
                  aria-label="سعر القطعة"
                />
              </label>
            </div>
          </li>
        )
      })}
    </ul>
  )

  const cartPanel = (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold">سلة البيع</h2>
          <span className="flex size-6 items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary-subtle-foreground tabular-nums">
            {cart.length}
          </span>
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
              confirmClear
                ? 'bg-destructive text-white'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {confirmClear ? 'اضغط للتأكيد' : 'تفريغ'}
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:max-h-[46dvh] xl:max-h-none">
        {cartLines}
      </div>
    </section>
  )

  const quickAmounts = [50, 100, 200, 500]
  const spinlessPay =
    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

  const paymentPanel = (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-3.5 py-3">
        <h2 className="text-base font-bold">الدفع والفاتورة</h2>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5">
        {/* Customer — one compact control */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            العميل <span className="font-normal">(اختياري — مطلوب للبيع الآجل)</span>
          </p>
          {resolvedCustomer ? (
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-xl border p-2.5',
                resolvedCustomer.balance > 0
                  ? 'border-warning-subtle bg-warning-subtle/60'
                  : 'border-primary/30 bg-primary-subtle/50'
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {resolvedCustomer.name.trim().charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{resolvedCustomer.name}</p>
                <p className="truncate text-[length:var(--fs-2xs,0.6875rem)] tabular-nums text-muted-foreground">
                  {resolvedCustomer.phone || 'بدون رقم'}
                  {resolvedCustomer.balance > 0 && (
                    <span className="font-semibold text-destructive">
                      {' '}
                      · عليه {formatCurrency(resolvedCustomer.balance)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomerId(null)
                  setCustomerName('')
                  setCustQuery('')
                }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label="إزالة العميل"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <User className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
                placeholder="ابحث بالاسم أو رقم الهاتف"
                className={cn(
                  'h-10 rounded-xl pr-9',
                  creditNeedsCustomer && 'border-destructive focus-visible:ring-destructive/30'
                )}
              />
              {custOpen && (customerName || customers.length > 0) && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">
                  <ul className="max-h-48 overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground">
                        لا يوجد عميل بهذا الاسم — هيتسجل البيع بدون عميل
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
                              setCustOpen(false)
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-accent"
                          >
                            <span>{c.name}</span>
                            <span className="flex items-center gap-2 text-xs">
                              {c.balance > 0 && (
                                <span className="tabular-nums text-destructive">
                                  عليه {formatCurrency(c.balance)}
                                </span>
                              )}
                              {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
          {typedUnknownCustomer && (
            <p className="text-[length:var(--fs-2xs,0.6875rem)] text-muted-foreground">
              العميل ده مش مسجّل — اختاره من القائمة عشان يتربط بالفاتورة.
            </p>
          )}
        </div>

        {/* The one loud element: the total (counts live inside it) */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-3.5 text-white shadow-md">
          <div className="flex items-center justify-between gap-2 text-xs text-white/80">
            <span>الإجمالي المستحق</span>
            <span className="tabular-nums">
              {cart.length} صنف · {totalPieces} قطعة
            </span>
          </div>
          <p className="mt-1.5 text-3xl font-extrabold leading-none tabular-nums">
            {formatCurrency(total)}
          </p>
          {!paidFull && (
            <p className="mt-2 text-xs tabular-nums text-white/90">
              مدفوع {formatCurrency(effectivePaid)} · آجل {formatCurrency(remaining)}
            </p>
          )}
        </div>

        {/* Payment mode */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground">طريقة السداد</p>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup">
            {[
              { full: true, label: 'سداد كامل', icon: Check },
              { full: false, label: 'سداد جزئي', icon: Wallet },
            ].map((m) => {
              const active = paidFull === m.full
              const Icon = m.icon
              return (
                <button
                  key={m.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setPaidFull(m.full)
                    setPaidAmount(m.full ? 0 : total)
                  }}
                  className={cn(
                    'flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {active && <Icon className="size-3.5 text-primary" />}
                  {m.label}
                </button>
              )
            })}
          </div>

          {paidFull ? (
            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground" htmlFor="received">
                المبلغ المستلم من العميل <span className="opacity-70">(لحساب الباقي)</span>
              </label>
              <Input
                id="received"
                type="number"
                min={0}
                value={received}
                onChange={(e) =>
                  setReceived(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)
                }
                placeholder="اختياري"
                className={cn('h-10 rounded-xl text-center text-base tabular-nums', spinlessPay)}
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setReceived(total)}
                  disabled={total <= 0}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-40"
                >
                  المبلغ بالظبط
                </button>
                {quickAmounts
                  .filter((a) => a >= total)
                  .slice(0, 3)
                  .map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setReceived(a)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs tabular-nums hover:bg-muted"
                    >
                      {a}
                    </button>
                  ))}
              </div>
              {change > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-success-subtle px-3 py-2.5 text-sm text-success-subtle-foreground">
                  <span>الباقي للعميل</span>
                  <span className="text-base font-bold tabular-nums">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground" htmlFor="paid-amount">
                المبلغ المدفوع دلوقتي
              </label>
              <Input
                id="paid-amount"
                type="number"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                onFocus={(e) => e.currentTarget.select()}
                className={cn('h-10 rounded-xl text-center text-base tabular-nums', spinlessPay)}
              />
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 0.25, 0.5, 0.75].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPaidAmount(Math.round(total * r * 100) / 100)}
                    className="rounded-lg border border-border py-1.5 text-xs hover:bg-muted"
                  >
                    {r === 0 ? 'آجل كله' : `${r * 100}%`}
                  </button>
                ))}
              </div>
              {remaining > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-danger-subtle px-3 py-2.5 text-sm text-danger-subtle-foreground">
                  <span>المتبقي (آجل)</span>
                  <span className="font-bold tabular-nums">{formatCurrency(remaining)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer: the reason a button is disabled sits right next to the button */}
      <footer className="space-y-2 border-t border-border bg-card p-3.5">
        {creditNeedsCustomer && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {typedUnknownCustomer
              ? 'اختار العميل من القائمة عشان نقدر نسجّل الآجل عليه.'
              : 'البيع بالآجل لازم يكون مرتبط بعميل — اختار عميل فوق.'}
          </p>
        )}
        <Button
          variant="gradient"
          size="lg"
          className="h-11 w-full rounded-xl text-base font-bold disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
          onClick={checkout}
          disabled={!canCheckout}
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : <Banknote className="size-5" />}
          {cart.length === 0 ? 'أضف منتجات للبدء' : 'دفع وطباعة الفاتورة'}
          {canCheckout && (
            <kbd className="mr-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)] font-medium xl:inline-block">
              F9
            </kbd>
          )}
        </Button>
      </footer>
    </section>
  )

  /* ────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────── */

  return (
    <div
      ref={rootRef}
      style={isDesktop ? densityVars(scale) : undefined}
      className={cn(
        isFull
          ? 'fixed inset-0 z-40 flex flex-col gap-3 overflow-hidden bg-background p-4'
          : 'space-y-3 pb-24 lg:pb-0'
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight">نقطة البيع</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-medium text-success-subtle-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            جاهز للبيع
          </span>
          <span className="hidden items-center gap-3 text-xs text-muted-foreground xl:flex">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)]">/</kbd>
              بحث
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)]">Enter</kbd>
              باركود
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[length:var(--fs-2xs,0.6875rem)]">F9</kbd>
              دفع
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isDesktop && (
            <div
              dir="ltr"
              role="group"
              aria-label="حجم العرض"
              className="flex items-center overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setSizeStep((v) => clamp(v - 1, -4, 6))}
                className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="تصغير الواجهة"
                title="تصغير الواجهة"
              >
                <Minus className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSizeStep(0)}
                className="min-w-12 px-1 text-center text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground"
                title="الرجوع للحجم التلقائي"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setSizeStep((v) => clamp(v + 1, -4, 6))}
                className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="تكبير الواجهة"
                title="تكبير الواجهة"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          )}
          {isDesktop && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setFullscreen((v) => !v)}
              title={isFull ? 'خروج من ملء الشاشة (Esc)' : 'ملء الشاشة — يخفي القائمة الجانبية'}
            >
              {isFull ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              {isFull ? 'خروج' : 'ملء الشاشة'}
            </Button>
          )}
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openQuickAddProduct()}>
            <Plus className="size-4" />
            منتج جديد
          </Button>
        </div>
      </header>

      <div
        className={cn(
          'grid gap-3',
          'lg:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*95)] lg:grid-rows-[auto_auto]',
          'xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*100)_calc(var(--spacing)*84)] xl:grid-rows-1',
          isFull
            ? 'min-h-0 flex-1 overflow-y-auto xl:overflow-visible'
            : 'xl:h-[calc(100dvh-10.25rem)] xl:min-h-[calc(var(--spacing)*130)]'
        )}
      >
        <div className="flex min-h-0 flex-col lg:row-span-2 xl:row-span-1 [&>section]:flex-1">
          {productsPanel}
        </div>

        {isDesktop && (
          <>
            <div className="flex min-h-0 flex-col [&>section]:flex-1">{cartPanel}</div>
            <div className="flex min-h-0 flex-col [&>section]:flex-1">{paymentPanel}</div>
          </>
        )}
      </div>

      {/* Mobile / tablet: sticky checkout bar + bottom sheet with cart & payment */}
      {!isDesktop && (
        <>
          <div className="fixed inset-x-3 bottom-3 z-40">
            <button
              type="button"
              onClick={() => setCartSheetOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 px-4 py-3 text-white shadow-xl active:scale-[0.99]"
            >
              <span className="flex items-center gap-2.5">
                <span className="relative">
                  <ShoppingBag className="size-6" />
                  {cart.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-white text-[length:var(--fs-2xs,0.6875rem)] font-bold text-brand-700">
                      {cart.length}
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold">
                  {cart.length === 0 ? 'السلة فاضية' : 'عرض السلة والدفع'}
                </span>
              </span>
              <span className="flex items-center gap-1 text-base font-extrabold tabular-nums">
                {formatCurrency(total)}
                <ChevronLeft className="size-4" />
              </span>
            </button>
          </div>

          <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[92dvh] gap-0 overflow-y-auto overscroll-contain rounded-t-3xl bg-background p-0 sm:mx-auto sm:max-w-lg"
            >
              <SheetTitle className="sr-only">السلة والدفع</SheetTitle>
              <div className="space-y-3 p-3">
                {cartPanel}
                {paymentPanel}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Variant picker */}
      <Dialog
        open={variantPickerOpen}
        onOpenChange={(o) => {
          setVariantPickerOpen(o)
          if (!o) {
            setVariantPickerProduct(null)
            setVariantPickerVariants([])
            setVariantPickerUnits([])
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>اختار اللون/المقاس — {variantPickerProduct?.name}</DialogTitle>
          </DialogHeader>
          {variantPickerVariants.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا يوجد ألوان/مقاسات مسجلة لهذا المنتج
            </p>
          ) : (
            <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
              {variantPickerVariants.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={v.quantity <= 0}
                    onClick={() => handleVariantPick(v)}
                    className={cn(
                      'flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-right transition-colors hover:border-primary hover:bg-primary-subtle',
                      v.quantity <= 0 && 'cursor-not-allowed opacity-50 hover:border-border hover:bg-transparent'
                    )}
                  >
                    <span className="text-sm font-semibold">{variantLabelOf(v)}</span>
                    <StockBadge quantity={v.quantity} />
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

      <ProductDialog
        open={productDlgOpen}
        onOpenChange={setProductDlgOpen}
        initial={productInitial}
        onSaved={() => {
          setProductDlgOpen(false)
          setProductInitial(null)
          setRefreshTick((t) => t + 1)
        }}
      />
    </div>
  )
}
