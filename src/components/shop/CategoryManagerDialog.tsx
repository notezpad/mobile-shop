'use client'

import * as React from 'react'
import { Check, FolderTree, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useConfirm } from './ConfirmDialogProvider'

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="size-5 text-primary" />
            إدارة التصنيفات
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="اسم تصنيف جديد"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCat()
              }
            }}
          />
          <Button onClick={addCat} disabled={!newName.trim()}>
            <Plus className="size-4" />
            إضافة
          </Button>
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : cats.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              لا توجد تصنيفات بعد
            </p>
          ) : (
            <ul className="divide-y">
              {cats.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-3 py-2.5"
                >
                  {renameId === c.id ? (
                    <>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-primary"
                        onClick={() => saveRename(c.id)}
                        disabled={busyId === c.id}
                      >
                        <Check className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.count} منتج
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => {
                          setRenameId(c.id)
                          setRenameValue(c.name)
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => remove(c.id, c.name)}
                        disabled={busyId === c.id}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
