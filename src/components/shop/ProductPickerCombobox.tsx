'use client'

/**
 * ProductPickerCombobox — modern searchable product picker.
 *
 * 🛡️ 2026-09-13 (v2): redesigned UI for a more premium feel.
 *
 * Features:
 *   - Pill-style trigger button (gradient hover, subtle shadow)
 *   - Polished popover with shadow + ring + rounded corners
 *   - Premium search input with icon glow on focus
 *   - List items with avatar-style thumbnail showing first letter
 *   - Quantity badge on the right with color-coding (in-stock / low / out)
 *   - Group separator header showing total count
 *   - Smooth hover + selected states
 *   - Sticky search input that doesn't scroll with the list
 *   - RTL-friendly
 *
 * Built with the same Popover + Command pattern as CategoryCombobox
 * so it works with the existing shadcn/ui theme tokens.
 */

import * as React from 'react'
import { Check, ChevronsUpDown, Search, Package, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface ProductPickerItem {
  id: number
  name: string
  barcode?: string | null
  quantity?: number
  /** Optional category for grouping or display. */
  category?: string | null
}

export interface ProductPickerComboboxProps {
  /** Currently selected product id (as string for SelectValue parity). */
  value: string
  /** Called when the user picks a product. Receives the product id as string. */
  onChange: (value: string) => void
  /** The products to show. Caller is responsible for filtering by branch etc. */
  items: ProductPickerItem[]
  /** Placeholder text when nothing is selected. */
  placeholder?: string
  /** Disabled state (e.g. when source branch not yet chosen). */
  disabled?: boolean
  /** className passthrough. */
  className?: string
  /**
   * Whether to block selecting out-of-stock items (quantity <= 0).
   * Default: false (show but don't block — caller decides).
   */
  blockOutOfStock?: boolean
  /** Optional callback invoked when the popover opens (for lazy data load). */
  onOpen?: () => void
}

/** Return a Tailwind color class for the quantity badge based on stock level. */
function getQtyBadgeClass(qty: number | undefined): string {
  if (qty === undefined) return 'bg-muted text-muted-foreground'
  if (qty <= 0) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  if (qty <= 5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
}

/** Return the Arabic label for the quantity badge. */
function getQtyLabel(qty: number | undefined): string {
  if (qty === undefined) return ''
  if (qty <= 0) return 'نفد'
  return `متاح ${qty}`
}

/** Generate a 2-letter initial block from a product name for the avatar. */
function getInitials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '?'
  // For Arabic, take the first 2 chars; for Latin, take first letters of words.
  if (/[\u0600-\u06FF]/.test(cleaned)) {
    return cleaned.slice(0, 2)
  }
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function ProductPickerCombobox({
  value,
  onChange,
  items,
  placeholder = 'ابحث عن منتج...',
  disabled = false,
  className,
  blockOutOfStock = false,
  onOpen,
}: ProductPickerComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  // Find the currently selected product so we can show its name on the button.
  const selected = items.find((p) => String(p.id) === value)

  // Filter items based on the search query.
  // Match on name OR barcode, case-insensitive.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q)
      const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(q) : false
      return nameMatch || barcodeMatch
    })
  }, [items, query])

  const handleSelect = (productId: string) => {
    // If user re-clicks the same item, deselect (clear).
    onChange(productId === value ? '' : productId)
    setOpen(false)
    setQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <div className={cn('pp-wrapper relative', className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (o) onOpen?.()
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || items.length === 0}
            className={cn(
              'pp-trigger group h-11 w-full justify-between gap-2 rounded-xl border bg-background/60 px-3.5 text-sm font-medium shadow-sm transition-all hover:bg-background hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
              !selected && 'text-muted-foreground',
              open && 'ring-2 ring-primary/40 ring-offset-1',
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                  selected
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
                )}
              >
                {selected ? (
                  <Check className="size-4" />
                ) : (
                  <Package className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-start">
                {selected ? selected.name : items.length === 0 ? 'لا توجد منتجات' : placeholder}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {selected && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="مسح الاختيار"
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <ChevronsUpDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className={cn(
            'pp-popover p-0',
            'min-w-[var(--radix-popover-trigger-width)] max-w-[480px]',
          )}
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <div className="pp-popover-inner">
            {/* Search input — sticky at the top with a subtle gradient header */}
            <div className="pp-search-header sticky top-0 z-10">
              <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو الباركود..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  className="pp-search-input w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="pp-search-divider h-px" />
            </div>

            {/* List header — shows count of available + filtered */}
            <div className="flex items-center justify-between px-4 py-1.5 text-[11px] font-medium text-muted-foreground">
              <span>
                {filtered.length === items.length
                  ? `${items.length} منتج`
                  : `${filtered.length} من ${items.length}`}
              </span>
              {query && <span className="text-muted-foreground/70">فلتر: "{query}"</span>}
            </div>

            {/* Items list */}
            <Command shouldFilter={false} className="pp-command">
              <CommandList className="pp-list max-h-[280px] overflow-y-auto">
                <CommandEmpty>
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Search className="size-4" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {items.length === 0 ? 'لا توجد منتجات' : 'لا توجد نتائج مطابقة'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {items.length === 0
                        ? 'أضف منتجات أولاً أو اختار فرع آخر'
                        : 'جرّب كلمة بحث مختلفة'}
                    </p>
                  </div>
                </CommandEmpty>
                <CommandGroup className="pp-group">
                  {filtered.map((p) => {
                    const isOutOfStock = p.quantity !== undefined && p.quantity <= 0
                    const isLowStock = p.quantity !== undefined && p.quantity > 0 && p.quantity <= 5
                    const isBlocked = blockOutOfStock && isOutOfStock
                    const isSelected = value === String(p.id)
                    return (
                      <CommandItem
                        key={p.id}
                        value={String(p.id)}
                        onSelect={() => !isBlocked && handleSelect(String(p.id))}
                        disabled={isBlocked}
                        className={cn(
                          'pp-item flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors',
                          '[&[data-selected=true]]:bg-primary/8 [&[data-selected=true]]:ring-1 [&[data-selected=true]]:ring-primary/20',
                          isSelected && 'bg-primary/8 ring-1 ring-primary/20',
                          isOutOfStock && 'opacity-60',
                          !isBlocked && 'cursor-pointer hover:bg-muted/60',
                          isBlocked && 'cursor-not-allowed',
                        )}
                      >
                        {/* Avatar with initials */}
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : isOutOfStock
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary-subtle text-primary-subtle-foreground',
                          )}
                        >
                          {getInitials(p.name)}
                        </div>

                        {/* Name + barcode */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium leading-tight">{p.name}</p>
                          {p.barcode && (
                            <p
                              className="mt-0.5 truncate text-[11px] text-muted-foreground"
                              dir="ltr"
                            >
                              {p.barcode}
                            </p>
                          )}
                        </div>

                        {/* Quantity badge */}
                        {p.quantity !== undefined && (
                          <span
                            className={cn(
                              'shrink-0 rounded-md px-2 py-1 text-[11px] font-bold tabular-nums',
                              getQtyBadgeClass(p.quantity),
                              isLowStock && 'ring-1 ring-amber-300/40',
                            )}
                          >
                            {getQtyLabel(p.quantity)}
                          </span>
                        )}

                        {/* Selected check */}
                        {isSelected && (
                          <Check className="size-4 shrink-0 text-primary" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>

            {/* Footer hint — keyboard + count */}
            <div className="pp-footer flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-semibold">
                  ↑↓
                </kbd>
                تنقّل
                <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-semibold">
                  ↵
                </kbd>
                اختيار
              </span>
              <span className="font-medium">{items.length} إجمالي المنتجات</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
