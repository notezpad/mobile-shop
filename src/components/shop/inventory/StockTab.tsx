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
  Repeat,
  X,
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
import { Barcode } from '../Barcode'
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

// 🛡️ 2026-09-30: أسباب مخصصة لتسجيل الهالك — الخسارة بتتسجل بقيمتها في
// المصروفات (فئة "هالك وتالف") والسبب بيتكتب في الحركة والمصروف.
const DAMAGE_REASONS = [
  'تالف / هالك',
  'انتهاء صلاحية',
  'تلف التخزين (رطوبة/حرارة)',
  'تلف أثناء النقل',
  'عيوب صناعة',
  'أخرى',
]

export function StockTab({ products, branches, isEmployee, userBranchId, onChanged }: Props) {
  const [search, setSearch] = React.useState('')
  const [branchFilter, setBranchFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [adjOpen, setAdjOpen] = React.useState<{ product: InventoryProduct; type: 'in' | 'out' | 'damage' } | null>(null)
  const [exchangeOpen, setExchangeOpen] = React.useState(false)

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
          {/* 🛡️ 2026-09-30: استبدال بضاعة مع مورد — بيخرج التالف ويدخل البديل
              وبيحسب فرق القيمة على حساب المورد تلقائياً */}
          {!isEmployee && (
            <Button variant="outline" className="gap-1.5" onClick={() => setExchangeOpen(true)}>
              <Repeat className="size-4" />
              استبدال مورد
            </Button>
          )}
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
          <div className="hidden max-h-[60vh] overflow-auto lg:block">
            <Table fixed>
              <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur">
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="w-44">الباركود</TableHead>
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
                      <TableRow key={p.id} className={out ? 'bg-destructive-subtle/50' : low ? 'bg-warning-subtle/40' : ''}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          <Barcode value={p.barcode} height={26} fontSize={10} fitContainer />
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
                            <Badge className="bg-warning-subtle text-warning-subtle-foreground">{p.quantity}</Badge>
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
                              className="size-8 p-0 text-success-subtle-foreground hover:bg-success-subtle hover:text-success-subtle-foreground"
                              onClick={() => setAdjOpen({ product: p, type: 'in' })}
                              title="إضافة كمية (وارد)"
                            >
                              <Plus className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="size-8 p-0 text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
                              onClick={() => setAdjOpen({ product: p, type: 'out' })}
                              disabled={p.quantity <= 0}
                              title="خصم كمية (صادر)"
                            >
                              <Minus className="size-3.5" />
                            </Button>
                            {/* 🛡️ 2026-09-30: تسجيل هالك — بيسجّل الخسارة في المصروفات */}
                            {!isEmployee && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-8 p-0 text-warning-subtle-foreground hover:bg-warning-subtle hover:text-warning-subtle-foreground"
                                onClick={() => setAdjOpen({ product: p, type: 'damage' })}
                                disabled={p.quantity <= 0}
                                title="تسجيل هالك (بيسجّل الخسارة في المصروفات)"
                              >
                                <AlertTriangle className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg.
          */}
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
            {filtered.length === 0 ? (
              <p className="col-span-full py-10 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 size-8 opacity-40" />
                لا توجد منتجات مطابقة
              </p>
            ) : (
              filtered.map(p => {
                const out = p.quantity <= 0
                const low = !out && p.quantity <= p.minQuantity
                return (
                  <div
                    key={p.id}
                    className={
                      out
                        ? 'rounded-lg border bg-destructive-subtle/50 p-3'
                        : low
                        ? 'rounded-lg border bg-warning-subtle/40 p-3'
                        : 'rounded-lg border bg-card p-3'
                    }
                  >
                    {/* رأس الكارت: اسم + إجراءات */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium leading-tight">{p.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {branchName(p.branchId) ?? 'بدون فرع'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="size-8 p-0 text-success-subtle-foreground hover:bg-success-subtle hover:text-success-subtle-foreground"
                          onClick={() => setAdjOpen({ product: p, type: 'in' })}
                          title="إضافة كمية (وارد)"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="size-8 p-0 text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
                          onClick={() => setAdjOpen({ product: p, type: 'out' })}
                          disabled={p.quantity <= 0}
                          title="خصم كمية (صادر)"
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        {!isEmployee && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="size-8 p-0 text-warning-subtle-foreground hover:bg-warning-subtle hover:text-warning-subtle-foreground"
                            onClick={() => setAdjOpen({ product: p, type: 'damage' })}
                            disabled={p.quantity <= 0}
                            title="تسجيل هالك (بيسجّل الخسارة في المصروفات)"
                          >
                            <AlertTriangle className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* الباركود */}
                    <div className="mt-2 rounded-md border bg-muted/30 py-1">
                      <Barcode value={p.barcode} height={24} fontSize={9} fitContainer />
                    </div>

                    {/* شبكة البيانات: كمية/حد أدنى/تكلفة/سعر */}
                    <div className="mt-3 grid grid-cols-4 gap-1 border-t border-border/60 pt-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">الكمية</p>
                        {out ? (
                          <Badge variant="destructive">نفد</Badge>
                        ) : low ? (
                          <Badge className="bg-warning-subtle text-warning-subtle-foreground">{p.quantity}</Badge>
                        ) : (
                          <Badge variant="secondary">{p.quantity}</Badge>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">الحد الأدنى</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{p.minQuantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">التكلفة</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(p.cost)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">السعر</p>
                        <p className="text-xs font-semibold tabular-nums">{formatCurrency(p.price)}</p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Adjust dialog (وارد / صادر / هالك) */}
      {adjOpen && (
        <AdjustDialog
          open={!!adjOpen}
          onOpenChange={(o) => !o && setAdjOpen(null)}
          product={adjOpen.product}
          type={adjOpen.type}
          onDone={onChanged}
        />
      )}

      {/* استبدال مع مورد */}
      {exchangeOpen && (
        <ExchangeDialog
          open={exchangeOpen}
          onOpenChange={setExchangeOpen}
          products={products}
          branches={branches}
          onDone={onChanged}
        />
      )}
    </div>
  )
}

/* ---------------- Adjust Dialog (وارد / صادر / هالك) ---------------- */

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
  type: 'in' | 'out' | 'damage'
  onDone: () => void
}) {
  const [qty, setQty] = React.useState('')
  const [reason, setReason] = React.useState(type === 'damage' ? DAMAGE_REASONS[0] : ADJUST_REASONS[0])
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const reasons = type === 'damage' ? DAMAGE_REASONS : ADJUST_REASONS

  // Reset fields whenever the dialog opens (keyed by product id + type)
  const resetKey = `${product.id}-${type}`
  const [lastResetKey, setLastResetKey] = React.useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setQty('')
    setReason(type === 'damage' ? DAMAGE_REASONS[0] : ADJUST_REASONS[0])
    setNote('')
  }

  const qNum = parseInt(qty, 10) || 0
  // 🛡️ قيمة الخسارة المتوقعة = الكمية × التكلفة الحالية (المتوسط المرجح)
  const lossPreview = type === 'damage' && qNum > 0 ? qNum * Math.max(0, product.cost) : 0

  const submit = async () => {
    const q = parseInt(qty, 10)
    if (!q || q <= 0) { toast.error('كمية غير صالحة'); return }
    // 🛡️ 2026-09-30: السبب إجباري للصادر والهالك (السيرفر بيرفض بدونه كمان)
    if (type !== 'in' && `${reason}${note ? ' — ' + note : ''}`.trim().length < 3) {
      toast.error('اكتب سبب الحركة (إجباري)')
      return
    }
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
      if (type === 'damage') {
        toast.success(`تم تسجيل الهالك — خسارة ${formatCurrency(qNum * Math.max(0, product.cost))} اتسجلت في المصروفات`)
      } else {
        toast.success(type === 'in' ? 'تم تسجيل الكمية الواردة' : 'تم خصم الكمية')
      }
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const isIn = type === 'in'
  const isDamage = type === 'damage'
  const title = isDamage ? 'تسجيل هالك / تالف' : isIn ? 'إضافة كمية واردة' : 'خصم كمية صادرة'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDamage ? (
              <AlertTriangle className="size-5 text-warning-subtle-foreground" />
            ) : isIn ? (
              <ArrowDownToLine className="size-5 text-success-subtle-foreground" />
            ) : (
              <ArrowUpFromLine className="size-5 text-destructive-subtle-foreground" />
            )}
            {title}
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
          {isDamage && (
            <div className="rounded-md border border-warning-subtle bg-warning-subtle/40 p-2.5 text-xs leading-relaxed">
              تسجيل الهالك هيخصم الكمية من المخزون <b>وهيسجّل الخسارة تلقائياً</b> في
              المصروفات (فئة «هالك وتالف») بقيمة <b>الكمية × التكلفة الحالية</b> — فتظهر
              في صافي الربح. الخزنة مش هتتأثر (مفيش فلوس خرجت).
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              الكمية {isDamage ? 'التالفة' : isIn ? 'الواردة' : 'الخارجة'} <span className="text-destructive">*</span>
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
              <p className="text-xs text-muted-foreground">
                المتاح: {product.quantity}
                {lossPreview > 0 && (
                  <> — قيمة الخسارة المتوقعة: <b className="text-destructive">{formatCurrency(lossPreview)}</b></>
                )}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>
              السبب {!isIn && <span className="text-destructive">*</span>}
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {reasons.map(r => (
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
            className={isDamage ? 'bg-warning-subtle-foreground hover:bg-warning-subtle-foreground/90' : isIn ? 'bg-primary hover:bg-primary-hover' : 'bg-destructive hover:bg-destructive/90'}
          >
            {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
            {isDamage ? 'تأكيد تسجيل الهالك' : isIn ? 'تأكيد الإضافة' : 'تأكيد الخصم'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Exchange with supplier (استبدال مورد) ---------------- */

interface ExchangeLineUI {
  productId: number
  name: string
  cost: number
  quantity: string
}

function ExchangeDialog({
  open,
  onOpenChange,
  products,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  products: InventoryProduct[]
  branches: Branch[]
  onDone: () => void
}) {
  const available = React.useMemo(() => products.filter(p => p.quantity > 0), [products])
  const [supplierId, setSupplierId] = React.useState('')
  const [suppliers, setSuppliers] = React.useState<Array<{ id: number; name: string }>>([])
  const [outLines, setOutLines] = React.useState<ExchangeLineUI[]>([])
  const [inLines, setInLines] = React.useState<ExchangeLineUI[]>([])
  const [pickOut, setPickOut] = React.useState('')
  const [pickIn, setPickIn] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setOutLines([])
      setInLines([])
      setPickOut('')
      setPickIn('')
      setReason('')
      setSupplierId('')
      api<Array<{ id: number; name: string }>>('/api/suppliers')
        .then((rows) => setSuppliers(rows.map((r) => ({ id: r.id, name: r.name }))))
        .catch(() => setSuppliers([]))
    }
  }, [open])

  const productById = React.useMemo(() => new Map(products.map(p => [p.id, p])), [products])

  const addLine = (
    setter: React.Dispatch<React.SetStateAction<ExchangeLineUI[]>>,
    lines: ExchangeLineUI[],
    pid: string,
  ) => {
    const id = parseInt(pid, 10)
    const p = productById.get(id)
    if (!p) return
    if (lines.some(l => l.productId === p.id)) {
      toast.error('الصنف مضاف بالفعل — عدّل الكمية')
      return
    }
    setter([...lines, { productId: p.id, name: p.name, cost: p.cost, quantity: '1' }])
  }

  const valueOf = (lines: ExchangeLineUI[]) =>
    lines.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0) * Math.max(0, l.cost), 0)
  const valueOut = valueOf(outLines)
  const valueIn = valueOf(inLines)
  const diff = Math.round((valueIn - valueOut) * 100) / 100

  const submit = async () => {
    const out = outLines
      .map(l => ({ productId: l.productId, quantity: parseInt(l.quantity, 10) || 0 }))
      .filter(l => l.quantity > 0)
    const inn = inLines
      .map(l => ({ productId: l.productId, quantity: parseInt(l.quantity, 10) || 0 }))
      .filter(l => l.quantity > 0)
    if (!supplierId) { toast.error('اختار المورد'); return }
    if (out.length === 0 || inn.length === 0) {
      toast.error('لازم بضاعة راجعة وبضاعة بديلة (صنف على الأقل في كل جانب)')
      return
    }
    if (reason.trim().length < 3) { toast.error('اكتب سبب الاستبدال (إجباري)'); return }
    setSaving(true)
    try {
      const res = await api<{ message?: string }>('/api/inventory/exchange', {
        method: 'POST',
        body: { supplierId: parseInt(supplierId, 10), lines: out, replacements: inn, note: reason.trim() },
      })
      toast.success(res?.message || 'تم تسجيل الاستبدال')
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل الاستبدال')
    } finally {
      setSaving(false)
    }
  }

  const lineEditor = (
    lines: ExchangeLineUI[],
    setter: React.Dispatch<React.SetStateAction<ExchangeLineUI[]>>,
    kind: 'out' | 'in',
  ) => (
    <div className="space-y-2">
      <Select
        value={kind === 'out' ? pickOut : pickIn}
        onValueChange={(v) => {
          kind === 'out' ? setPickOut(v) : setPickIn(v)
          addLine(setter, lines, v)
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={kind === 'out' ? 'اختر صنف راجع للمورد...' : 'اختر صنف بديل من المورد...'} />
        </SelectTrigger>
        <SelectContent>
          {(kind === 'out' ? available : products).map(p => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name} {kind === 'out' ? `(متاح: ${p.quantity})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {lines.map((l, idx) => (
        <div key={l.productId} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{l.name}</p>
            <p className="text-xs text-muted-foreground">تكلفة الوحدة: {formatCurrency(l.cost)}</p>
          </div>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={l.quantity}
            onChange={(e) => {
              const v = e.target.value
              setter(lines.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-destructive"
            onClick={() => setter(lines.filter((_, i) => i !== idx))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-5 text-primary" />
            استبدال بضاعة مع مورد
          </DialogTitle>
          <DialogDescription>
            بضاعة تالفة/مردودة تترجع للمورد وبضاعة بديلة تاخدها — فرق القيمة بيتحسب
            تلقائياً على حساب المورد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              المورد <span className="text-destructive">*</span>
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="اختر المورد..." /></SelectTrigger>
              <SelectContent>
                {suppliers.map(su => (
                  <SelectItem key={su.id} value={String(su.id)}>{su.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium text-destructive">١. بضاعة راجعة للمورد</p>
            {lineEditor(outLines, setOutLines, 'out')}
            <p className="mt-2 text-xs text-muted-foreground">
              قيمة الصادر: <b className="text-destructive">{formatCurrency(valueOut)}</b>
            </p>
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium text-success-subtle-foreground">٢. بضاعة بديلة من المورد</p>
            {lineEditor(inLines, setInLines, 'in')}
            <p className="mt-2 text-xs text-muted-foreground">
              قيمة الوارد: <b className="text-success-subtle-foreground">{formatCurrency(valueIn)}</b>
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-2.5 text-sm">
            فرق القيمة: <b>{formatCurrency(Math.abs(diff))}</b>{' '}
            {diff === 0 ? (
              <span className="text-muted-foreground">— استبدال متكافئ (مفيش أثر على حساب المورد)</span>
            ) : diff > 0 ? (
              <span className="text-destructive">— ستزيد عليك في الحساب</span>
            ) : (
              <span className="text-success-subtle-foreground">— هتقل حسابك عنده</span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>
              سبب الاستبدال <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: 3 قطع تالفة بديلها قطع سليمة..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary-hover">
            {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
            تأكيد الاستبدال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
