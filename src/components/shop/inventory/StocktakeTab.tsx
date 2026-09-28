'use client'

import * as React from 'react'
import {
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  Loader2,
  CheckCircle2,
  Save,
  Eye,
  ClipboardList,
  Camera,
  AlertCircle,
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
import { formatDate, formatSignedNumber } from '@/lib/format'
import { DateTimeCell } from '../DateTimeCell'
import { useShopStore } from '@/lib/store'
import type { Branch, InventoryProduct, Stocktake } from '../InventoryView'

interface Props {
  stocktakes: Stocktake[]
  branches: Branch[]
  products: InventoryProduct[]
  userBranchId: number | null
  onChanged: () => void
}

interface CountItem {
  productId: number
  name: string
  barcode: string | null
  systemQty: number
  countedQty: number
}

export function StocktakeTab({ stocktakes, branches, products, userBranchId, onChanged }: Props) {
  // 🛡️ 2026-09-14: branchId, items, note live in the Zustand store with
  // localStorage persistence — so a draft stays alive across tab switches,
  // page refreshes, and even navigation to other pages. The `scan` input
  // stays as local state (it's transient typing, not worth persisting).
  const stocktakeDraft = useShopStore((s) => s.stocktakeDraft)
  const setStocktakeDraft = useShopStore((s) => s.setStocktakeDraft)
  const clearStocktakeDraft = useShopStore((s) => s.clearStocktakeDraft)

  // Pull these from the persisted draft instead of local useState.
  const branchId = stocktakeDraft.branchId
  const items = stocktakeDraft.items
  const note = stocktakeDraft.note

  // Helpers that update the draft instead of local state.
  const setBranchId = (v: string) => setStocktakeDraft({ branchId: v })
  const setItems = (updater: (prev: typeof items) => typeof items) =>
    setStocktakeDraft({ items: updater(items) })
  const setNote = (v: string) => setStocktakeDraft({ note: v })

  const [scan, setScan] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [viewing, setViewing] = React.useState<Stocktake | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Use derived default — when branches load and no branch is selected yet, fall back to first
  const effectiveBranchId = branchId || (branches.length > 0 ? String(branches[0].id) : '')

  // 🛡️ 2026-09-14: If this is the first time the user opens the stocktake
  // tab and they're locked to a branch (employee), pre-fill the branchId
  // in the draft. Otherwise the form would start empty every time the
  // draft is cleared.
  React.useEffect(() => {
    if (!branchId && userBranchId) {
      setBranchId(String(userBranchId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBranchId, branchId])

  // Focus scan input when branch changes or after each scan
  React.useEffect(() => {
    inputRef.current?.focus()
  }, [effectiveBranchId, items.length])

  const scopedProducts = React.useMemo(() => {
    if (!effectiveBranchId) return products
    return products.filter(p => p.branchId === parseInt(effectiveBranchId, 10) || p.branchId == null)
  }, [products, effectiveBranchId])

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault()
    const q = scan.trim()
    if (!q) return
    // Find by barcode first, then by name
    let p = scopedProducts.find(x => x.barcode && x.barcode === q)
    if (!p) p = scopedProducts.find(x => x.name.toLowerCase() === q.toLowerCase())
    if (!p) p = scopedProducts.find(x => x.name.toLowerCase().includes(q.toLowerCase()))
    if (!p) {
      toast.error(`لم يتم العثور على المنتج: ${q}`, { id: 'not-found' })
      setScan('')
      inputRef.current?.focus()
      return
    }
    setItems(prev => {
      const exists = prev.find(i => i.productId === p!.id)
      if (exists) {
        return prev.map(i => i.productId === p!.id ? { ...i, countedQty: i.countedQty + 1 } : i)
      }
      return [...prev, {
        productId: p!.id,
        name: p!.name,
        barcode: p!.barcode,
        systemQty: p!.quantity,
        countedQty: 1,
      }]
    })
    setScan('')
    inputRef.current?.focus()
  }

  const setCounted = (productId: number, qty: number) => {
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, countedQty: Math.max(0, qty) } : i))
  }

  const removeItem = (productId: number) => {
    setItems(prev => prev.filter(i => i.productId !== productId))
  }

  const resetForm = () => {
    clearStocktakeDraft()
    setScan('')
    inputRef.current?.focus()
  }

  const submit = async (commit: boolean) => {
    if (items.length === 0) { toast.error('أضف أصنافاً للجرد'); return }
    setSaving(true)
    try {
      await api('/api/inventory/stocktake', {
        method: 'POST',
        body: {
          branchId: effectiveBranchId ? parseInt(effectiveBranchId, 10) : null,
          items: items.map(i => ({
            productId: i.productId,
            systemQty: i.systemQty,
            countedQty: i.countedQty,
          })),
          note: note.trim() || null,
          commit,
        },
      })
      toast.success(commit ? 'تم اعتماد الجرد وتسوية الكميات' : 'تم حفظ الجرد كمسودة')
      resetForm()
      onChanged()
    } catch (e: any) {
      toast.error(e?.message || 'فشل')
    } finally {
      setSaving(false)
    }
  }

  const totalDiff = items.reduce((s, i) => s + (i.countedQty - i.systemQty), 0)
  const matchedCount = items.filter(i => i.countedQty === i.systemQty).length
  const diffCount = items.length - matchedCount

  return (
    <div className="space-y-4">
      {/* New stocktake form */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanBarcode className="size-4 text-primary" />
            جرد جديد بالباركود
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!userBranchId ? (
              <div>
                <Label className="mb-1.5 block text-xs">الفرع</Label>
                <Select value={effectiveBranchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.isMain && ' ★'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block text-xs">الفرع</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                  {branches.find(b => b.id === userBranchId)?.name ?? '—'}
                </div>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block text-xs">ملاحظة (اختياري)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: جرد شهري..." />
            </div>
          </div>

          {/* Scan input */}
          <form onSubmit={handleScan} className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs">
              <ScanBarcode className="size-3" />
              مسح الباركود أو كتابة الاسم
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  className="pr-9 font-mono text-base"
                  placeholder="امسح الباركود أو اكتب اسم/كود الصنف ثم اضغط Enter..."
                  value={scan}
                  onChange={e => setScan(e.target.value)}
                  autoFocus
                  dir="ltr"
                />
              </div>
              <Button type="submit" disabled={!scan.trim()}>
                <Plus className="ml-1 size-4" />
                إضافة
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              💡 كل مسح للباركود يضيف 1 للعدد الفعلي. اضغط Enter بعد كل مسح.
            </p>
          </form>

          {/* Items */}
          {items.length > 0 ? (
            <>
              <div className="rounded-lg border">
                <Table fixed>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead className="w-36">الباركود</TableHead>
                      <TableHead className="w-28 text-center">حسب النظام</TableHead>
                      <TableHead className="w-32 text-center">العد الفعلي</TableHead>
                      <TableHead className="w-20 text-center">الفرق</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(it => {
                      const diff = it.countedQty - it.systemQty
                      return (
                        <TableRow key={it.productId} className={diff !== 0 ? 'bg-warning-subtle/40' : ''}>
                          <TableCell className="font-medium">{it.name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {it.barcode || '—'}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">{it.systemQty}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-7 p-0"
                                onClick={() => setCounted(it.productId, it.countedQty - 1)}
                                disabled={it.countedQty <= 0}
                              >
                                <Minus className="size-3" />
                              </Button>
                              <Input
                                type="number"
                                min={0}
                                className="w-16 text-center"
                                value={it.countedQty}
                                onChange={e => setCounted(it.productId, parseInt(e.target.value, 10) || 0)}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-7 p-0"
                                onClick={() => setCounted(it.productId, it.countedQty + 1)}
                              >
                                <Plus className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-bold ${diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-success-subtle-foreground' : 'text-destructive-subtle-foreground'}`}>
                              {formatSignedNumber(diff)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 text-destructive-subtle-foreground hover:bg-destructive-subtle"
                              onClick={() => removeItem(it.productId)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary + actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    إجمالي الأصناف: <span className="font-bold">{items.length}</span>
                  </span>
                  <span className="text-success-subtle-foreground">
                    مطابق: <span className="font-bold">{matchedCount}</span>
                  </span>
                  <span className="text-warning-subtle-foreground">
                    اختلاف: <span className="font-bold">{diffCount}</span>
                  </span>
                  <span>
                    صافي الفرق: <span className={`font-bold ${totalDiff === 0 ? '' : totalDiff > 0 ? 'text-success-subtle-foreground' : 'text-destructive-subtle-foreground'}`}>
                      {formatSignedNumber(totalDiff)}
                    </span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetForm} disabled={saving}>مسح</Button>
                  <Button variant="secondary" onClick={() => submit(false)} disabled={saving}>
                    {saving ? <Loader2 className="ml-1 size-4 animate-spin" /> : <Save className="ml-1 size-4" />}
                    حفظ كمسودة
                  </Button>
                  <Button onClick={() => submit(true)} disabled={saving} variant="gradient">
                    {saving ? <Loader2 className="ml-1 size-4 animate-spin" /> : <CheckCircle2 className="ml-1 size-4" />}
                    اعتماد وتسوية
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
              <Camera className="mb-2 size-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                لم تتم إضافة أصناف بعد — امسح الباركود أو اكتب اسم الصنف بالأعلى
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" />
              سجل عمليات الجرد
            </span>
            <Badge variant="secondary">{stocktakes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <Table fixed>
              <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur">
                <TableRow>
                  <TableHead className="w-16 text-center">#</TableHead>
                  <TableHead className="w-40">الفرع</TableHead>
                  <TableHead className="w-24 text-center">الأصناف</TableHead>
                  <TableHead className="w-24 text-center">الفرق</TableHead>
                  <TableHead className="w-28 text-center">الحالة</TableHead>
                  <TableHead className="w-28">المنشئ</TableHead>
                  <TableHead className="w-52">تاريخ الإنشاء</TableHead>
                  <TableHead className="w-52">تاريخ الاعتماد</TableHead>
                  <TableHead className="w-16 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocktakes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      <ClipboardList className="mx-auto mb-2 size-8 opacity-40" />
                      لا توجد عمليات جرد بعد
                    </TableCell>
                  </TableRow>
                ) : (
                  stocktakes.map(st => {
                    const totalD = st.items.reduce((s, i) => s + i.diff, 0)
                    return (
                      <TableRow key={st.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewing(st)}>
                        <TableCell className="text-center font-mono text-xs">#{st.id}</TableCell>
                        <TableCell className="font-medium">{st.branch?.name ?? 'كل الفروع'}</TableCell>
                        <TableCell className="text-center">{st.items.length}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${totalD === 0 ? '' : totalD > 0 ? 'text-success-subtle-foreground' : 'text-destructive-subtle-foreground'}`}>
                            {formatSignedNumber(totalD)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {st.status === 'committed' ? (
                            <Badge className="bg-success-subtle text-success-subtle-foreground">معتمد</Badge>
                          ) : (
                            <Badge className="bg-warning-subtle text-warning-subtle-foreground">مسودة</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {st.createdByName ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <DateTimeCell date={st.createdAt} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {st.committedAt ? <DateTimeCell date={st.committedAt} /> : '—'}
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
        <StocktakeDetailDialog
          stocktake={viewing}
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          onCommit={async () => {
            setSaving(true)
            try {
              await api(`/api/inventory/stocktake/${viewing.id}`, { method: 'POST' })
              toast.success('تم اعتماد الجرد')
              setViewing(null)
              onChanged()
            } catch (e: any) {
              toast.error(e?.message || 'فشل')
            } finally {
              setSaving(false)
            }
          }}
          saving={saving}
        />
      )}
    </div>
  )
}

/* ---------------- Detail Dialog ---------------- */

function StocktakeDetailDialog({
  stocktake,
  open,
  onOpenChange,
  onCommit,
  saving,
}: {
  stocktake: Stocktake
  open: boolean
  onOpenChange: (o: boolean) => void
  onCommit: () => void
  saving: boolean
}) {
  const totalD = stocktake.items.reduce((s, i) => s + i.diff, 0)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            تفاصيل الجرد #{stocktake.id}
          </DialogTitle>
          <DialogDescription>
            الفرع: {stocktake.branch?.name ?? 'كل الفروع'}
            <br />
            التاريخ: <DateTimeCell date={stocktake.committedAt ?? stocktake.createdAt} />
            {stocktake.note && <><br />ملاحظة: {stocktake.note}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {stocktake.status === 'committed' ? (
              <Badge className="bg-success-subtle text-success-subtle-foreground">معتمد</Badge>
            ) : (
              <Badge className="bg-warning-subtle text-warning-subtle-foreground">مسودة</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {stocktake.items.length} صنف — صافي الفرق:{' '}
              <span className={`font-bold ${totalD === 0 ? '' : totalD > 0 ? 'text-success-subtle-foreground' : 'text-destructive-subtle-foreground'}`}>
                {formatSignedNumber(totalD)}
              </span>
            </span>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <Table fixed>
              <TableHeader className="sticky top-0 bg-muted/50">
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="w-36">الباركود</TableHead>
                  <TableHead className="w-24 text-center">النظام</TableHead>
                  <TableHead className="w-24 text-center">العد</TableHead>
                  <TableHead className="w-24 text-center">الفرق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocktake.items.map((it, idx) => (
                  <TableRow key={idx} className={it.diff !== 0 ? 'bg-warning-subtle/40' : ''}>
                    <TableCell className="font-medium">{it.product?.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {it.product?.barcode || '—'}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{it.systemQty}</TableCell>
                    <TableCell className="text-center font-bold">{it.countedQty}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${it.diff === 0 ? 'text-muted-foreground' : it.diff > 0 ? 'text-success-subtle-foreground' : 'text-destructive-subtle-foreground'}`}>
                        {formatSignedNumber(it.diff)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {stocktake.status === 'draft' && (
            <>
              <div className="mr-auto flex items-center gap-1.5 text-xs text-warning-subtle-foreground">
                <AlertCircle className="size-3.5" />
                سيتم تعديل كميات المخزون عند الاعتماد
              </div>
              <Button onClick={onCommit} disabled={saving} variant="gradient">
                {saving && <Loader2 className="ml-1 size-4 animate-spin" />}
                <CheckCircle2 className="ml-1 size-4" />
                اعتماد وتسوية
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
