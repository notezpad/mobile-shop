'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Camera, Loader2, PackageSearch, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShopStore } from '@/lib/store'
import { useDataRefresh } from '@/lib/offline/data-events'
import { piecePrice } from '@/lib/pos/totals'
import type { ProductLite } from '@/lib/pos/types'
import { ProductTile } from './ProductTile'
import { CameraScanDialog } from './CameraScanDialog'
import { useProductGrid } from './hooks/useProductGrid'
import type { useProductSearch } from './hooks/useProductSearch'

type Search = ReturnType<typeof useProductSearch>

interface Props {
  search: Search
  busy: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (p: ProductLite, variantId?: number | null) => void | Promise<void>
  onSubmit: (q: string) => void | Promise<void>
}

/**
 * Catalog = search (cmdk, results in an OVERLAY so nothing shifts) + category chips + product grid.
 * Enter with no arrow-navigation runs the scan/exact-barcode logic; after ↑/↓ it picks the highlighted row.
 */
export function Catalog({ search, busy, inputRef, onSelect, onSubmit }: Props) {
  const { query, setQuery, results, open, setOpen, loading, error, clear } = search
  const openQuickAddProduct = useShopStore((s) => s.openQuickAddProduct)
  const [navigated, setNavigated] = React.useState(false)
  const [category, setCategory] = React.useState('all')
  const grid = useProductGrid(category)
  const [cameraOpen, setCameraOpen] = React.useState(false)
  // BarcodeDetector exists on Chrome/Android, Edge, macOS — elsewhere the button simply isn't shown.
  const [cameraSupported, setCameraSupported] = React.useState(false)
  React.useEffect(() => setCameraSupported('BarcodeDetector' in window), [])

  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const loadCats = React.useCallback(() => {
    api<{ id: number; name: string }[]>('/api/categories').then(setCategories).catch(() => {})
  }, [])
  React.useEffect(loadCats, [loadCats])
  useDataRefresh(['categories'], loadCats)

  const hasQuery = query.trim().length > 0
  const showPanel = hasQuery && !loading && (error || (open && results.length > 0) || (results.length === 0 && !error))

  return (
    <div className="space-y-3">
      {/* Search + overlay */}
      <CommandPrimitive shouldFilter={false} loop className="relative">
        <div className="relative">
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={(v) => {
              setQuery(v)
              setNavigated(false)
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setNavigated(true)
              else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                // Scanner / typed barcode: exact-match logic. Only defer to cmdk if the user arrowed to a row.
                if (!(navigated && open && results.length > 0)) {
                  e.preventDefault()
                  void onSubmit(query)
                }
              } else if (e.key === 'Escape') {
                if (open) setOpen(false)
                else clear()
              }
            }}
            placeholder="امسح الباركود أو ابحث بالاسم…"
            autoFocus
            aria-label="بحث عن منتج"
            className={cn(
              'h-12 w-full rounded-xl border border-input bg-background ps-11 pe-11 text-base shadow-xs outline-none transition-shadow',
              'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
            )}
          />
          <div className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center">
            {loading || busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-5 text-muted-foreground" />
            )}
          </div>
          {!hasQuery && cameraSupported && (
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="absolute inset-y-0 end-2 my-auto flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              aria-label="مسح بالكاميرا"
            >
              <Camera className="size-5" />
            </button>
          )}
          {hasQuery && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                clear()
                inputRef.current?.focus()
              }}
              className="absolute inset-y-0 end-2 my-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              aria-label="مسح البحث"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {showPanel && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border bg-popover shadow-lg">
            {error ? (
              <p className="px-4 py-3 text-sm text-destructive">تعذّر البحث — تأكد من الاتصال وجرّب تاني.</p>
            ) : results.length === 0 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm text-muted-foreground">لا يوجد منتج مطابق.</p>
                <Button type="button" size="sm" variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => openQuickAddProduct(query.trim())}>
                  <Plus className="size-4" />
                  أضف منتجاً جديداً
                </Button>
              </div>
            ) : (
              <CommandPrimitive.List className="max-h-80 overflow-y-auto overscroll-contain p-1">
                {results.map((p) => (
                  <CommandPrimitive.Item
                    key={p.id}
                    value={String(p.id)}
                    onMouseDown={(e) => e.preventDefault()}
                    onSelect={() => void onSelect(p, p.matchedVariantId)}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent',
                      navigated ? 'data-[selected=true]:bg-accent' : 'data-[selected=true]:bg-transparent hover:data-[selected=true]:bg-accent',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      {p.barcode && <p className="text-xs tabular-nums text-muted-foreground">{p.barcode}</p>}
                      {p.matchedVariantLabel && <p className="text-xs text-primary">مطابقة: {p.matchedVariantLabel}</p>}
                    </div>
                    <div className="shrink-0 text-end text-xs">
                      <p className="font-semibold tabular-nums text-primary">{formatCurrency(piecePrice(p))}</p>
                      <p className={cn('text-muted-foreground', p.quantity <= 0 && 'font-medium text-destructive')}>
                        {p.quantity <= 0 ? 'نفد' : `${p.quantity} متاح`}
                      </p>
                    </div>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.List>
            )}
          </div>
        )}
      </CommandPrimitive>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="التصنيفات">
          {[{ id: 0, name: 'الكل', value: 'all' }, ...categories.map((c) => ({ ...c, value: c.name }))].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-4 text-sm transition-colors',
                category === c.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:bg-accent',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="@container">
        {grid.loading && grid.items.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3.6] rounded-xl" />
            ))}
          </div>
        ) : grid.error && grid.items.length === 0 ? (
          <EmptyState
            icon={<PackageSearch />}
            title="تعذّر تحميل المنتجات"
            hint="تأكد من الاتصال وجرّب تاني. البحث والباركود شغالين."
            action={<Button size="sm" variant="outline" onClick={() => void grid.reload()}>إعادة المحاولة</Button>}
          />
        ) : grid.items.length === 0 ? (
          <EmptyState
            icon={<PackageSearch />}
            title={category === 'all' ? 'مفيش منتجات لسه' : 'مفيش منتجات في التصنيف ده'}
            action={<Button size="sm" onClick={() => openQuickAddProduct()}><Plus className="size-4" />منتج جديد</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4">
            {grid.items.map((p) => (
              <ProductTile key={p.id} product={p} onSelect={(x) => void onSelect(x)} />
            ))}
          </div>
        )}
      </div>
      <CameraScanDialog open={cameraOpen} onOpenChange={setCameraOpen} onCode={(c) => void onSubmit(c)} />
    </div>
  )
}
