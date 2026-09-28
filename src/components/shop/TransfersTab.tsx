'use client'

import * as React from 'react'
import {
  ArrowLeftRight,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { DateTimeCell } from '../DateTimeCell'
import { useConfirm } from '../ConfirmDialogProvider'
import type { Branch, InventoryProduct, Transfer } from '../InventoryView'

interface Props {
  transfers: Transfer[]
  branches: Branch[]
  products: InventoryProduct[]
  userBranchId: number | null
  onChanged: () => void
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'معلّق',
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-warning-subtle text-warning-subtle-foreground',
  completed: 'bg-success-subtle text-success-subtle-foreground',
  cancelled: 'bg-destructive-subtle text-destructive-subtle-foreground',
}

export function TransfersTab({ transfers, branches, products, userBranchId, onChanged }: Props) {
  const confirm = useConfirm()
  const [from, setFrom] = React.useState<string>(userBranchId ? String(userBranchId) : '')
  const [to, setTo] = React.useState<string>('')
  const [items, setItems] = React.useState<{ productId: number; name: string; quantity: number; available: number }[]>([])
  const [pick, setPick] = React.useState('')
  const [note, setNote] = React.useState('')
  const [mode, setMode] = React.useState<'completed' | 'pending'>('completed')
  const [saving, setSaving] = React.useState(false)
  const [viewing, setViewing] = React.useState<Transfer | null>(null)

  const eligibleProducts = React.useMemo(() => {
    if (!from) return []
    return products.filter(p => p.branchId === parseInt(from, 10))
  }, [products, from])

  const addItem = () => {
    if (!pick) return
    const p = eligibleProducts.find(pr => pr.id === parseInt(pick, 10))
    if (!p) return
    setItems(prev => {
      const exists = prev.find(i => i.productId === p.id)
      if (exists) return prev
      return [...prev, { productId: p.id, name: p.name, quantity: 1, available: p.quantity }]
    })
    setPick('')
  }

  const updateQty = (idx: number, q: number) => {
    setItems(prev => prev.map((x, i) => {
      if (i !== idx) return x
      const item = eligibleProducts.find(p => p.id === x.productId)
      const max = item?.quantity ?? x.available
      return { ...x, quantity: Math.min(Math.max(1, q), max) }
    }))
  }

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const resetForm = () => {
    setItems([])
    setNote('')
    setPick('')
    setTo('')
    if (!userBranchId) setFrom('')
  }

  const submit = async () => {
    if (!from || !to || from === to) { toast.error('اختر فرعين مختلفين'); return }
    if (items.length === 0) { toast.error('أضف منتجات للتحويل'); return }
    // Validate
    for (const it of items) {
      if (it.quantity <= 0) { toast.error('كمية غير صالحة'); return }
      if (mode === 'completed' && it.quantity > it.available) {
        toast.error(`الكمية أكبر من المتاح (${it.name})`)
        return
      }
    }
    setSaving(true)
    try {
      await api('/api/inventory/transfers', {
        method: 'POST',
        body: {
          fromBranchId: parseInt(from, 10),
          toBranchId: parseInt(to, 10),
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          note: note.trim() || null,
          mode,
        },
      })
      toast.success(mode === 'completed' ? 'تم تنفيذ التحويل' : 'تم حفظ التحويل كمعلّق')
      resetForm()
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const commitTransfer = async (t: Transfer) => {
    setSaving(true)
    try {
      await api(`/api/inventory/transfers/${t.id}/commit`, { method: 'POST' })
      toast.success('تم تنفيذ التحويل')
      setViewing(null)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const cancelTransfer = async (t: Transfer) => {
    if (!(await confirm({
      title: `إلغاء التحويل #${t.id}؟`,
      confirmText: 'إلغاء التحويل',
      cancelText: 'تراجع',
    }))) return
    try {
      await api(`/api/inventory/transfers/${t.id}`, { method: 'DELETE' })
      toast.success('تم إلغاء التحويل')
      setViewing(null)
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    }
  }

  return (
    <div className="space-y-4">
      {/* New Transfer Form */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="size-4 text-primary" />
            تحويل جديد بين فروع
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs">من فرع (المصدر)</Label>
              <Select value={from} onValueChange={setFrom} disabled={!!userBranchId}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع المصدر" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.isMain && ' ★'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">إلى فرع (الوجهة)</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع الوجهة" /></SelectTrigger>
                <SelectContent>
                  {branches.filter(b => String(b.id) !== from).map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.isMain && ' ★'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add product */}
          <div className="rounded-lg border border-dashed bg-muted/30 p-3">
            <Label className="mb-1.5 block text-xs">إضافة أصناف للتحويل</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select value={pick} onValueChange={setPick} disabled={!from}>
                  <SelectTrigger>
                    <SelectValue placeholder={from ? 'اختر منتج من المخزون' : 'اختر فرع المصدر أولاً'} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleProducts.length === 0 ? (
                      <SelectItem value="_none" disabled>لا توجد منتجات في هذا الفرع</SelectItem>
                    ) : (
                      eligibleProducts.map(p => (
                        <SelectItem key={p.id} value={String(p.id)} disabled={p.quantity <= 0}>
                          {p.name} — متاح: {p.quantity}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addItem} disabled={!pick || pick === '_none'}>
                <Plus className="ml-1 size-4" />
                إضافة
              </Button>
            </div>
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="rounded-lg border">
              <Table fixed>
                <TableHeader>
                  <TableRow>
                    <TableHead>الصنف</TableHead>
                    <TableHead className="w-28 text-center">المتاح</TableHead>
                    <TableHead className="w-44 text-center">الكمية المحوّلة</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => (
                    <TableRow key={it.productId}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{it.available}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={it.available}
                          value={it.quantity}
                          onChange={e => updateQty(idx, parseInt(e.target.value, 10) || 1)}
                          className="mx-auto w-24 text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-8 p-0 text-destructive-subtle-foreground hover:bg-destructive-subtle"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Note & mode */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs">ملاحظة (اختياري)</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="سبب التحويل أو ملاحظة..."
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">نوع التنفيذ</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'completed' | 'pending')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">تنفيذ فوري (يخصم ويُضيف)</SelectItem>
                  <SelectItem value="pending">حفظ معلّق (للتنفيذ لاحقاً)</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {mode === 'completed'
                  ? 'سيتم خصم الكميات من المصدر وإضافتها للوجهة مباشرة.'
                  : 'يُحفظ التحويل كمسودة ويمكن تنفيذه لاحقاً من السجل.'}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={resetForm} disabled={saving}>مسح</Button>
            <Button onClick={submit} disabled={saving || items.length === 0 || !from || !to}>
              {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
              <Send className="ml-1 size-4" />
              {mode === 'completed' ? 'تنفيذ التحويل' : 'حفظ كمعلّق'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>سجل التحويلات</span>
            <Badge variant="secondary">{transfers.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table fixed>
              <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur">
                <TableRow>
                  <TableHead className="w-16 text-center">#</TableHead>
                  <TableHead className="w-40">من</TableHead>
                  <TableHead className="w-12 text-center"></TableHead>
                  <TableHead className="w-40">إلى</TableHead>
                  <TableHead>الأصناف</TableHead>
                  <TableHead className="w-28 text-center">الحالة</TableHead>
                  <TableHead className="w-28">المنشئ</TableHead>
                  <TableHead className="w-52">تاريخ الإنشاء</TableHead>
                  <TableHead className="w-52">تاريخ الإتمام</TableHead>
                  <TableHead className="w-16 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                      <ArrowLeftRight className="mx-auto mb-2 size-8 opacity-40" />
                      لا توجد تحويلات بعد
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map(t => {
                    const totalQty = t.items.reduce((s, i) => s + i.quantity, 0)
                    return (
                      <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewing(t)}>
                        <TableCell className="text-center font-mono text-xs">#{t.id}</TableCell>
                        <TableCell className="font-medium">{t.fromBranch?.name}</TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          <ChevronLeft className="mx-auto size-4" />
                        </TableCell>
                        <TableCell className="font-medium">{t.toBranch?.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.items.length} صنف، {totalQty} وحدة
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={STATUS_BADGES[t.status] ?? 'bg-muted'}>
                            {t.status === 'pending' && <Clock className="ml-1 size-3" />}
                            {t.status === 'completed' && <CheckCircle2 className="ml-1 size-3" />}
                            {t.status === 'cancelled' && <XCircle className="ml-1 size-3" />}
                            {STATUS_LABELS[t.status] ?? t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {t.createdByName ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <DateTimeCell date={t.createdAt} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {t.completedAt ? <DateTimeCell date={t.completedAt} /> : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" className="size-8 p-0">
                            <Eye className="mx-auto size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {viewing && (
        <TransferDetailDialog
          transfer={viewing}
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          onCommit={() => commitTransfer(viewing)}
          onCancel={() => cancelTransfer(viewing)}
          saving={saving}
        />
      )}
    </div>
  )
}

/* ---------------- Detail Dialog ---------------- */

function TransferDetailDialog({
  transfer,
  open,
  onOpenChange,
  onCommit,
  onCancel,
  saving,
}: {
  transfer: Transfer
  open: boolean
  onOpenChange: (o: boolean) => void
  onCommit: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            تفاصيل التحويل #{transfer.id}
          </DialogTitle>
          <DialogDescription>
            {transfer.fromBranch?.name} ← {transfer.toBranch?.name}
            <br />
            <DateTimeCell date={transfer.completedAt ?? transfer.createdAt} />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className={STATUS_BADGES[transfer.status]}>
              {STATUS_LABELS[transfer.status] ?? transfer.status}
            </Badge>
            {transfer.note && (
              <span className="text-xs text-muted-foreground">ملاحظة: {transfer.note}</span>
            )}
          </div>

          <div className="rounded-lg border">
            <Table fixed>
              <TableHeader>
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="w-40">الباركود</TableHead>
                  <TableHead className="w-24 text-center">الكمية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.items.map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{it.product?.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {it.product?.barcode || '—'}
                    </TableCell>
                    <TableCell className="text-center font-bold">{it.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {transfer.status === 'pending' && (
            <>
              <Button variant="outline" onClick={onCancel} disabled={saving} className="text-destructive-subtle-foreground hover:bg-destructive-subtle">
                <XCircle className="ml-1 size-4" />
                إلغاء التحويل
              </Button>
              <Button onClick={onCommit} disabled={saving} variant="gradient">
                {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
                <CheckCircle2 className="ml-1 size-4" />
                تنفيذ التحويل
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
