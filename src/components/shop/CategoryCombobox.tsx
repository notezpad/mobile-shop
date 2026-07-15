'use client'

import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '@/lib/api'

export interface CategoryComboboxProps {
  value: string | null | undefined
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

export function CategoryCombobox({
  value,
  onChange,
  placeholder = 'اختر أو اكتب تصنيف جديد...',
  className,
}: CategoryComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<{ id: number; name: string }[]>([])
  const [query, setQuery] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ id: number; name: string }[]>('/api/categories')
      setItems(data)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const trimmed = query.trim()
  const exists = items.some(
    (it) => it.name.toLowerCase() === trimmed.toLowerCase()
  )
  const showCreateOption = trimmed.length > 0 && !exists

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="ابحث أو اكتب اسم تصنيف جديد..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{trimmed ? 'لا يوجد تصنيف مطابق' : 'اكتب للبحث'}</CommandEmpty>
            <CommandGroup heading="التصنيفات">
              {items
                .filter((it) =>
                  trimmed
                    ? it.name.toLowerCase().includes(trimmed.toLowerCase())
                    : true
                )
                .map((it) => (
                  <CommandItem
                    key={it.id}
                    value={it.name}
                    onSelect={() => {
                      onChange(it.name)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-1 size-4',
                        value === it.name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {it.name}
                  </CommandItem>
                ))}
            </CommandGroup>
            {showCreateOption && (
              <CommandGroup heading="إنشاء جديد">
                <CommandItem
                  value={`__new__${trimmed}`}
                  onSelect={() => {
                    onChange(trimmed)
                    setOpen(false)
                    setQuery('')
                  }}
                  className="bg-primary/5 text-primary hover:bg-primary/10"
                >
                  <Plus className="mr-1 size-4" />
                  <span>
                    إضافة تصنيف جديد: <strong className="mx-1">“{trimmed}”</strong>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
