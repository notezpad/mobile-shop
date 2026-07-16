'use client'

import * as React from 'react'
import {
  Search,
  Plus,
  Minus,
  Package,
  AlertTriangle,
  TrendingUp,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import type { Branch, InventoryProduct } from '../InventoryView'

interface Props {
  products: InventoryProduct[]
  branches: Branch[]
  isEmployee: boolean
  userBranchId: number | null
  onChanged: () => void
}

const ADJUST_REASONS = [
  'استلام بضاعة',
  'مرتجع مورد',
  'تالف',
  'هدايا/عينات',
  'خطأ تسجيل',
  'أخرى',
]

export function StockTab({ products, branches, isEmployee, userBranchId, onChanged }: Props) {
  const [search, setSearch] = React.useState('')
  const [branchFilter, setBranchFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [adjOpen, setAdjOpen] = React.useState<{ product: InventoryProduct; type: 'in' | 'out' } | null>(null)

  const filtered = React.useMemo(() => {
    return products.filter(p => {
      // Branch filter
      if (branchFilter !== 'all') {
        if (branchFilter === 'none' && p.branchId != null) return false
        if (branchFilter !== 'none' && p.branchId !== parseInt(branchFilter, 10)) return false
      }
      // Status filter
      if (statusFilter === 'low' && !(p.quantity > 0 && p.quantity <= p.minQuantity)) return false
      if (statusFilter === 'out' && p.quantity > 0) return false
      if (statusFilter === 'ok' && p.quantity <= p.minQuantity) return false
      // Search
      if (search) {
        const q = search.trim().toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !(p.barcode ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [products, branchFilter, statusFilter, search])

  const branchName = (id: number | null) => branches.find(b => b.id === id)?.name

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="min-w-[200px] flex-1">
            <Label className="mb-1.5 flex items-center gap-1 text-xs">
              <Search className="size-3" />
              بحث بالاسم أو الباركود
            </Label>
            <Input
              placeholder="اكتب اسم المنتج أو الباركود..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {!isEmployee && (
            <div className="w-full sm:w-56">
              <Label className="mb-1.5 flex items-center gap-1 text-xs">
                <SlidersHorizontal className="size-3" />
                الفرع
              </Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  <SelectItem value="none">بدون فرع</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-full sm:w-48">
            <Label className="mb-1.5 block text-xs">الحالة</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="ok">متوفر</SelectItem>
                <SelectItem value="low">قارب على النفاذ</SelectItem>
                <SelectItem value="out">نفد</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Package className="size-4 text-primary" />
              قائمة الأصناف
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {filtered.length} من {products.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table fixed>
              <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur">
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="w-36">الباركود</TableHead>
                  <TableHead className="w-28">الفرع</TableHead>
                  <TableHead className="w-20 text-center">الكمية</TableHead>
                  <TableHead className="w-24 text-center">الحد الأدنى</TableHead>
                  <TableHead className="w-28 text-center">التكلفة</TableHead>
                  <TableHead className="w-28 text-center">البيع</TableHead>
                  <TableHead className="w-24 text-center">حركة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      <Package className="mx-auto mb-2 size-8 opacity-40" />
                      لا توجد منتجات مطابقة
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(p => {
                    const out = p.quantity <= 0
                    const low = !out && p.quantity <= p.minQuantity
                    return (
                      <TableRow key={p.id} className={out ? 'bg-rose-50/50' : low ? 'bg-amber-50/40' : ''}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {p.barcode || '—'}
                        </TableCell>
                        <TableCell>
                          {branchName(p.branchId) ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {out ? (
                            <Badge variant="destructive">نفد</Badge>
                          ) : low ? (
                            <Badge className="bg-amber-100 text-amber-800">{p.quantity}</Badge>
                          ) : (
                            <Badge variant="secondary">{p.quantity}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{p.minQuantity}</TableCell>
                        <TableCell className="text-muted-foreground text-center">{formatCurrency(p.cost)}</TableCell>
                        <TableCell className="text-center font-medium">{formatCurrency(p.price)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="size-8 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                              onClick={() => setAdjOpen({ product: p, type: 'in' })}
                              title="إضافة كمية (وارد)"
                            >
                              <Plus className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="size-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => setAdjOpen({ product: p, type: 'out' })}
                              disabled={p.quantity <= 0}
                              title="خصم كمية (صادر)"
                            >
                              <Minus className="size-3.5" />
                            </Button>
                          </div>
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

      {/* Adjust dialog */}
      {adjOpen && (
        <AdjustDialog
          open={!!adjOpen}
          onOpenChange={(o) => !o && setAdjOpen(null)}
          product={adjOpen.product}
          type={adjOpen.type}
          onDone={onChanged}
        />
      )}
    </div>
  )
}

/* ---------------- Adjust Dialog ---------------- */

function AdjustDialog({
  open,
  onOpenChange,
  product,
  type,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  product: InventoryProduct
  type: 'in' | 'out'
  onDone: () => void
}) {
  const [qty, setQty] = React.useState('')
  const [reason, setReason] = React.useState(ADJUST_REASONS[0])
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Reset fields whenever the dialog opens (keyed by product id + type)
  const resetKey = `${product.id}-${type}`
  const [lastResetKey, setLastResetKey] = React.useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setQty('')
    setReason(ADJUST_REASONS[0])
    setNote('')
  }

  const submit = async () => {
    const q = parseInt(qty, 10)
    if (!q || q <= 0) { toast.error('كمية غير صالحة'); return }
    setSaving(true)
    try {
      await api('/api/inventory/movements', {
        method: 'POST',
        body: {
          productId: product.id,
          quantity: q,
          type,
          note: `${reason}${note ? ' — ' + note : ''}`,
        },
      })
      toast.success(type === 'in' ? 'تم تسجيل الكمية الواردة' : 'تم خصم الكمية')
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const isIn = type === 'in'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIn ? (
              <ArrowDownToLine className="size-5 text-emerald-600" />
            ) : (
              <ArrowUpFromLine className="size-5 text-rose-600" />
            )}
            {isIn ? 'إضافة كمية واردة' : 'خصم كمية صادرة'}
          </DialogTitle>
          <DialogDescription>
            المنتج: <span className="font-medium text-foreground">{product.name}</span>
            {product.barcode && (
              <span className="ml-2 font-mono text-xs" dir="ltr">({product.barcode})</span>
            )}
            <br />
            الكمية الحالية: <span className="font-medium text-foreground">{product.quantity}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              الكمية {isIn ? 'الواردة' : 'الخارجة'} <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(e.target.value)}
              autoFocus
              placeholder="0"
              className="text-lg font-bold"
            />
            {!isIn && product.quantity > 0 && (
              <p className="text-[11px] text-muted-foreground">
                المتاح للخصم: {product.quantity}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>السبب</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUST_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة إضافية</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="اختياري..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={submit}
            disabled={saving}
            className={isIn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
          >
            {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
            {isIn ? 'تأكيد الإضافة' : 'تأكيد الخصم'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
