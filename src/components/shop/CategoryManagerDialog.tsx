'use client'

import * as React from 'react'
import { Check, FolderTree, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useConfirm } from './ConfirmDialogProvider'
import { cn } from '@/lib/utils'
import { DialogHero, IconBtn, InkInput, SectionTitle } from './product-dialog-ui'
import { INK_BTN } from './settings-ui'

interface CategoryRow {
  id: number
  name: string
  count?: number
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged: () => void
}

export function CategoryManagerDialog({ open, onOpenChange, onChanged }: Props) {
  const confirm = useConfirm()
  const [cats, setCats] = React.useState<CategoryRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [renameId, setRenameId] = React.useState<number | null>(null)
  const [renameValue, setRenameValue] = React.useState('')
  const [q, setQ] = React.useState('')
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ id: number; name: string }[]>('/api/categories')
      // also fetch products to compute usage counts
      const _rawProd = await api<{ data: { category: string | null }[] } | { category: string | null }[]>('/api/products?category=all&limit=1000')
      const products = Array.isArray(_rawProd) ? _rawProd : (_rawProd as any)?.data ?? []
      const counts = new Map<string, number>()
      for (const p of products) {
        if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
      }
      setCats(
        data.map((c) => ({ ...c, count: counts.get(c.name) ?? 0 }))
      )
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  const addCat = async () => {
    if (!newName.trim()) return
    try {
      await api('/api/categories', { method: 'POST', body: { name: newName.trim() } })
      setNewName('')
      await load()
      onChanged()
      toast.success('تمت إضافة التصنيف')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإضافة')
    }
  }

  const saveRename = async (id: number) => {
    if (!renameValue.trim()) return
    setBusyId(id)
    try {
      await api('/api/categories', {
        method: 'PUT',
        body: { id, name: renameValue.trim() },
      })
      setRenameId(null)
      await load()
      onChanged()
      toast.success('تم تعديل التصنيف')
    } catch (e: any) {
      toast.error(e?.message || 'فشل التعديل')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: number, name: string) => {
    if (!(await confirm({
      title: `حذف تصنيف "${name}"؟`,
      description: 'سيتم فك ارتباط المنتجات به.',
    }))) return
    setBusyId(id)
    try {
      await api(`/api/categories?id=${id}`, { method: 'DELETE' })
      await load()
      onChanged()
      toast.success('تم حذف التصنيف')
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setBusyId(null)
    }
  }

  const needle = q.trim().toLowerCase()
  const shown = needle ? cats.filter((c) => c.name.toLowerCase().includes(needle)) : cats
  const total = cats.reduce((n, c) => n + (c.count ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHero
          icon={FolderTree}
          title="إدارة التصنيفات"
          subtitle={cats.length > 0 ? `${cats.length} تصنيف · ${total} منتج` : 'نظّم منتجاتك في تصنيفات.'}
        />

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          <section>
            <SectionTitle n={1}>تصنيف جديد</SectionTitle>
            <div className="flex gap-2">
              <InkInput
                wrapperClassName="flex-1"
                placeholder="اسم تصنيف جديد"
                aria-label="اسم تصنيف جديد"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCat()
                  }
                }}
              />
              <Button onClick={addCat} disabled={!newName.trim()} className={cn('h-11 rounded-xl px-5 font-bold', INK_BTN)}>
                <Plus className="size-4" />
                إضافة
              </Button>
            </div>
          </section>

          <section>
            <SectionTitle n={2}>التصنيفات الحالية</SectionTitle>

            {cats.length > 8 && (
              <label className="relative mb-2.5 flex h-10 items-center rounded-xl border bg-card focus-within:border-foreground focus-within:ring-[3px] focus-within:ring-foreground/10">
                <Search className="pointer-events-none absolute start-3 size-4 text-foreground/60" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`دوّر في ${cats.length} تصنيف…`}
                  aria-label="بحث في التصنيفات"
                  className="h-full w-full bg-transparent pe-9 text-sm outline-none placeholder:text-muted-foreground/80"
                  style={{ paddingInlineStart: '2.5rem' }}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="مسح البحث"
                    className="absolute end-2 flex size-6 items-center justify-center rounded-full text-foreground/60 hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </label>
            )}

            <div className="max-h-[22rem] overflow-y-auto overscroll-contain rounded-2xl border bg-card">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="size-5 animate-spin text-foreground/50" />
                </div>
              ) : cats.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <FolderTree className="mx-auto size-6 text-foreground/40" aria-hidden />
                  <p className="mt-2 text-sm font-bold">لا توجد تصنيفات بعد</p>
                  <p className="mt-0.5 text-xs font-medium text-foreground/65">ضيف أول تصنيف من فوق.</p>
                </div>
              ) : shown.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-medium text-foreground/65">مفيش تصنيف بالاسم ده</p>
              ) : (
                <ul className="divide-y">
                  {shown.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                      {renameId === c.id ? (
                        <>
                          <InkInput
                            wrapperClassName="flex-1"
                            size="sm"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(c.id)
                              if (e.key === 'Escape') setRenameId(null)
                            }}
                            aria-label="الاسم الجديد"
                            autoFocus
                          />
                          <IconBtn label="حفظ" onClick={() => saveRename(c.id)} disabled={busyId === c.id}>
                            {busyId === c.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                          </IconBtn>
                          <IconBtn label="إلغاء" onClick={() => setRenameId(null)}>
                            <X className="size-4" />
                          </IconBtn>
                        </>
                      ) : (
                        <>
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-extrabold">
                            {c.name.trim().charAt(0)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold">{c.name}</p>
                            <p className="text-xs font-medium tabular-nums text-foreground/65">{c.count} منتج</p>
                          </div>
                          <IconBtn
                            label="تعديل الاسم"
                            onClick={() => {
                              setRenameId(c.id)
                              setRenameValue(c.name)
                            }}
                          >
                            <Pencil className="size-4" />
                          </IconBtn>
                          <IconBtn label="حذف" danger onClick={() => remove(c.id, c.name)} disabled={busyId === c.id}>
                            <Trash2 className="size-4" />
                          </IconBtn>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
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
