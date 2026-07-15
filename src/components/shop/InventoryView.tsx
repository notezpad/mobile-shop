'use client'

import * as React from 'react'
import {
  Warehouse, ArrowLeftRight, ClipboardList, ScanBarcode, Plus, Minus,
  Loader2, Trash2, CheckCircle2, Search, Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatDate, formatCurrency } from '@/lib/format'
import { useShopStore } from '@/lib/store'

interface Branch { id: number; name: string; isMain: boolean; active: boolean }
interface Product {
  id: number; name: string; barcode: string | null; price: number; cost: number;
  quantity: number; minQuantity: number; branchId: number | null; category: string | null
}
interface Movement {
  id: number; type: string; quantity: number; note: string | null; createdAt: string;
  branchId: number | null;
  product: { name: string; barcode: string | null }
  branch: { name: string } | null
}
interface Transfer {
  id: number; status: string; note: string | null; createdAt: string;
  fromBranch: { name: string }; toBranch: { name: string };
  items: { productId: number; quantity: number; product: { name: string; barcode: string | null } }[]
}
interface Stocktake {
  id: number; status: string; createdAt: string; note: string | null;
  branch: { name: string } | null;
  items: { productId: number; systemQty: number; countedQty: number; diff: number; product: { name: string; barcode: string | null } }[]
}

const MOVE_LABELS: Record<string, string> = {
  in: 'وارد', out: 'صادر', adjust: 'تعديل يدوي',
  sale: 'بيع', return: 'مرتجع',
  transfer_in: 'تحويل وارد', transfer_out: 'تحويل صادر',
  stocktake: 'تسوية جرد',
}

export function InventoryView() {
  const user = useShopStore(s => s.user)
  const isEmployee = user?.role === 'EMPLOYEE'
  const [branches, setBranches] = React.useState<Branch[]>([])
  const [products, setProducts] = React.useState<Product[]>([])
  const [movements, setMovements] = React.useState<Movement[]>([])
  const [transfers, setTransfers] = React.useState<Transfer[]>([])
  const [stocktakes, setStocktakes] = React.useState<Stocktake[]>([])
  const [tab, setTab] = React.useState('stock')
  const [branchFilter, setBranchFilter] = React.useState<string>('all')
  const [search, setSearch] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const [bs, ps, mv, tf, st] = await Promise.all([
        api<Branch[]>('/api/branches'),
        api<Product[]>('/api/products'),
        api<Movement[]>('/api/inventory/movements'),
        api<Transfer[]>('/api/inventory/transfers'),
        api<Stocktake[]>('/api/inventory/stocktake'),
      ])
      setBranches(bs); setProducts(ps); setMovements(mv); setTransfers(tf); setStocktakes(st)
    } catch (e: any) { toast.error(e?.message || 'فشل التحميل') }
  }, [])
  React.useEffect(() => { load() }, [load])

  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      if (branchFilter !== 'all') {
        if (branchFilter === 'none' && p.branchId != null) return false
        if (branchFilter !== 'none' && p.branchId !== parseInt(branchFilter, 10)) return false
      }
      if (search) {
        const q = search.trim().toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !(p.barcode ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [products, branchFilter, search])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2"><Warehouse className="size-5 text-primary"/>إدارة المخزون</h2>
        <p className="text-sm text-muted-foreground">تتبع الكميات، الحركات، التحويلات بين الفروع، والجرد بالباركود.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="stock"><Warehouse className="size-4 ml-1"/>المخزون</TabsTrigger>
          <TabsTrigger value="movements"><ClipboardList className="size-4 ml-1"/>الحركات</TabsTrigger>
          <TabsTrigger value="transfers"><ArrowLeftRight className="size-4 ml-1"/>التحويلات</TabsTrigger>
          <TabsTrigger value="stocktake"><ScanBarcode className="size-4 ml-1"/>الجرد</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <StockTab
            products={filteredProducts}
            branches={branches}
            branchFilter={branchFilter}
            setBranchFilter={setBranchFilter}
            search={search}
            setSearch={setSearch}
            onChanged={load}
            isEmployee={isEmployee}
          />
        </TabsContent>

        <TabsContent value="movements">
          <MovementsTab movements={movements} branches={branches} />
        </TabsContent>

        <TabsContent value="transfers">
          <TransfersTab
            transfers={transfers}
            branches={branches}
            products={products}
            onChanged={load}
            userBranchId={user?.branchId ?? null}
          />
        </TabsContent>

        <TabsContent value="stocktake">
          <StocktakeTab
            stocktakes={stocktakes}
            branches={branches}
            products={products}
            onChanged={load}
            userBranchId={user?.branchId ?? null}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------- Stock Tab ---------- */
function StockTab({
  products, branches, branchFilter, setBranchFilter, search, setSearch, onChanged, isEmployee,
}: {
  products: Product[]; branches: Branch[]; branchFilter: string;
  setBranchFilter: (v: string) => void; search: string; setSearch: (v: string) => void;
  onChanged: () => void; isEmployee: boolean;
}) {
  const [adjOpen, setAdjOpen] = React.useState<Product | null>(null)
  const [adjType, setAdjType] = React.useState<'in'|'out'>('in')
  const [adjQty, setAdjQty] = React.useState('')
  const [adjNote, setAdjNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const submit = async () => {
    if (!adjOpen) return
    const q = parseInt(adjQty, 10)
    if (!q || q <= 0) { toast.error('كمية غير صالحة'); return }
    setSaving(true)
    try {
      await api('/api/inventory/movements', {
        method: 'POST',
        body: { productId: adjOpen.id, quantity: q, type: adjType, note: adjNote || null },
      })
      toast.success('تم تسجيل الحركة')
      setAdjOpen(null); setAdjQty(''); setAdjNote(''); onChanged()
    } catch (e: any) { toast.error(e?.message || 'فشل') }
    finally { setSaving(false) }
  }

  const totalValueCost = products.reduce((s, p) => s + p.quantity * p.cost, 0)
  const totalValuePrice = products.reduce((s, p) => s + p.quantity * p.price, 0)
  const lowStock = products.filter(p => p.quantity <= p.minQuantity).length

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="عدد الأصناف" value={String(products.length)} />
        <SummaryCard label="أصناف قاربت على النفاذ" value={String(lowStock)} tone="warn" />
        <SummaryCard label="قيمة المخزون (تكلفة)" value={formatCurrency(totalValueCost)} />
        <SummaryCard label="قيمة المخزون (بيع)" value={formatCurrency(totalValuePrice)} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <Label>بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2.5 size-4 text-muted-foreground"/>
            <Input className="pr-8" placeholder="اسم أو باركود..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
        {!isEmployee && (
          <div className="w-full sm:w-56">
            <Label>الفرع</Label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                <SelectItem value="none">بدون فرع</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الصنف</TableHead>
                <TableHead>الباركود</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>الحد الأدنى</TableHead>
                <TableHead>التكلفة</TableHead>
                <TableHead>البيع</TableHead>
                <TableHead>حركة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">لا توجد منتجات</TableCell></TableRow>
              )}
              {products.map(p => {
                const branch = branches.find(b => b.id === p.branchId)
                const low = p.quantity <= p.minQuantity
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.barcode || '—'}</TableCell>
                    <TableCell>{branch?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant={low ? 'destructive' : 'secondary'}>{p.quantity}</Badge>
                    </TableCell>
                    <TableCell>{p.minQuantity}</TableCell>
                    <TableCell>{formatCurrency(p.cost)}</TableCell>
                    <TableCell>{formatCurrency(p.price)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => { setAdjOpen(p); setAdjType('in') }}><Plus className="size-3"/></Button>
                      <Button size="sm" variant="outline" className="mr-1" onClick={() => { setAdjOpen(p); setAdjType('out') }}><Minus className="size-3"/></Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {adjOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdjOpen(null)}>
          <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">{adjType === 'in' ? 'إضافة كمية' : 'خصم كمية'} — {adjOpen.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>الكمية</Label>
                <Input type="number" min={1} value={adjQty} onChange={e => setAdjQty(e.target.value)} autoFocus/>
              </div>
              <div>
                <Label>ملاحظة</Label>
                <Input value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="اختياري"/>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdjOpen(null)}>إلغاء</Button>
                <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="size-4 ml-1 animate-spin"/>}تسجيل</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ---------- Movements Tab ---------- */
function MovementsTab({ movements, branches }: { movements: Movement[]; branches: Branch[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">حركات المخزون (آخر 500)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>الصنف</TableHead>
              <TableHead>الفرع</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الكمية</TableHead>
              <TableHead>ملاحظة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">لا توجد حركات بعد</TableCell></TableRow>
            )}
            {movements.map(m => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDate(m.createdAt)}</TableCell>
                <TableCell>{m.product?.name}</TableCell>
                <TableCell>{m.branch?.name || '—'}</TableCell>
                <TableCell><Badge variant="outline">{MOVE_LABELS[m.type] || m.type}</Badge></TableCell>
                <TableCell className={m.quantity < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>{m.quantity > 0 ? '+' : ''}{m.quantity}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{m.note || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/* ---------- Transfers Tab ---------- */
function TransfersTab({
  transfers, branches, products, onChanged, userBranchId,
}: {
  transfers: Transfer[]; branches: Branch[]; products: Product[];
  onChanged: () => void; userBranchId: number | null;
}) {
  const [from, setFrom] = React.useState<string>(userBranchId ? String(userBranchId) : '')
  const [to, setTo] = React.useState<string>('')
  const [items, setItems] = React.useState<{ productId: number; name: string; quantity: number }[]>([])
  const [pick, setPick] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const eligibleProducts = React.useMemo(() => {
    if (!from) return []
    return products.filter(p => p.branchId === parseInt(from, 10))
  }, [products, from])

  const addItem = () => {
    if (!pick) return
    const p = eligibleProducts.find(pr => pr.id === parseInt(pick, 10))
    if (!p) return
    setItems(prev => prev.find(i => i.productId === p.id) ? prev : [...prev, { productId: p.id, name: p.name, quantity: 1 }])
    setPick('')
  }

  const submit = async () => {
    if (!from || !to || from === to) { toast.error('اختر فرعين مختلفين'); return }
    if (items.length === 0) { toast.error('أضف منتجات'); return }
    setSaving(true)
    try {
      await api('/api/inventory/transfers', {
        method: 'POST',
        body: { fromBranchId: parseInt(from,10), toBranchId: parseInt(to,10), items },
      })
      toast.success('تم إنشاء التحويل')
      setItems([]); onChanged()
    } catch (e: any) { toast.error(e?.message || 'فشل') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">تحويل جديد</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>من فرع</Label>
              <Select value={from} onValueChange={setFrom} disabled={!!userBranchId}>
                <SelectTrigger><SelectValue placeholder="اختر"/></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>إلى فرع</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger><SelectValue placeholder="اختر"/></SelectTrigger>
                <SelectContent>
                  {branches.filter(b => String(b.id) !== from).map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>إضافة منتج</Label>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger><SelectValue placeholder={from ? 'اختر منتج' : 'اختر فرعاً أولاً'}/></SelectTrigger>
                <SelectContent>
                  {eligibleProducts.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name} (المتاح: {p.quantity})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addItem} disabled={!pick}><Plus className="size-4"/></Button>
          </div>
          {items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>الصنف</TableHead><TableHead>الكمية</TableHead><TableHead/></TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={it.productId}>
                    <TableCell>{it.name}</TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={it.quantity}
                        onChange={e => setItems(prev => prev.map((x,i)=> i===idx ? {...x, quantity: parseInt(e.target.value,10)||1} : x))}
                        className="w-24"/>
                    </TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setItems(prev => prev.filter((_,i)=>i!==idx))}><Trash2 className="size-3"/></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex justify-end">
            <Button onClick={submit} disabled={saving || items.length === 0}>{saving && <Loader2 className="size-4 ml-1 animate-spin"/>}تنفيذ التحويل</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">سجل التحويلات</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>من</TableHead><TableHead>إلى</TableHead>
              <TableHead>الأصناف</TableHead><TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {transfers.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">لا توجد تحويلات</TableCell></TableRow>)}
              {transfers.map(t => (
                <TableRow key={t.id}>
                  <TableCell>#{t.id}</TableCell>
                  <TableCell>{t.fromBranch?.name}</TableCell>
                  <TableCell>{t.toBranch?.name}</TableCell>
                  <TableCell className="text-xs">{t.items.map(i => `${i.product.name}×${i.quantity}`).join('، ')}</TableCell>
                  <TableCell><Badge variant={t.status === 'completed' ? 'default' : 'outline'}>{t.status === 'completed' ? 'مكتمل' : t.status}</Badge></TableCell>
                  <TableCell className="text-xs">{formatDate(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------- Stocktake Tab ---------- */
function StocktakeTab({
  stocktakes, branches, products, onChanged, userBranchId,
}: {
  stocktakes: Stocktake[]; branches: Branch[]; products: Product[];
  onChanged: () => void; userBranchId: number | null;
}) {
  const [branchId, setBranchId] = React.useState<string>(userBranchId ? String(userBranchId) : (branches[0] ? String(branches[0].id) : ''))
  React.useEffect(() => {
    if (!branchId && branches[0]) setBranchId(String(branches[0].id))
  }, [branches, branchId])
  const [scan, setScan] = React.useState('')
  const [items, setItems] = React.useState<{ productId: number; name: string; barcode: string|null; systemQty: number; countedQty: number }[]>([])
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const scopedProducts = React.useMemo(() => {
    if (!branchId) return products
    return products.filter(p => p.branchId === parseInt(branchId, 10) || p.branchId == null)
  }, [products, branchId])

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault()
    const q = scan.trim()
    if (!q) return
    // find by barcode first, then by name contains
    let p = scopedProducts.find(x => x.barcode && x.barcode === q)
    if (!p) p = scopedProducts.find(x => x.name.toLowerCase().includes(q.toLowerCase()))
    if (!p) { toast.error('لم يتم العثور على المنتج'); setScan(''); inputRef.current?.focus(); return }
    setItems(prev => {
      const exists = prev.find(i => i.productId === p!.id)
      if (exists) return prev.map(i => i.productId === p!.id ? { ...i, countedQty: i.countedQty + 1 } : i)
      return [...prev, { productId: p!.id, name: p!.name, barcode: p!.barcode, systemQty: p!.quantity, countedQty: 1 }]
    })
    setScan(''); inputRef.current?.focus()
  }

  const submit = async (commit: boolean) => {
    if (items.length === 0) { toast.error('أضف منتجات للجرد'); return }
    setSaving(true)
    try {
      await api('/api/inventory/stocktake', {
        method: 'POST',
        body: { branchId: branchId ? parseInt(branchId,10) : null, items, note, commit },
      })
      toast.success(commit ? 'تم اعتماد الجرد وتسوية الكميات' : 'تم حفظ الجرد كمسودة')
      setItems([]); setNote(''); onChanged()
    } catch (e: any) { toast.error(e?.message || 'فشل') }
    finally { setSaving(false) }
  }

  const totalDiff = items.reduce((s, i) => s + (i.countedQty - i.systemQty), 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScanBarcode className="size-4"/>جرد جديد بالباركود</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {!userBranchId && (
              <div>
                <Label>الفرع</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="اختر"/></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={userBranchId ? 'md:col-span-2' : ''}>
              <Label>ملاحظة</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="اختياري"/>
            </div>
          </div>
          <form onSubmit={handleScan} className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute right-2 top-2.5 size-4 text-muted-foreground"/>
              <Input ref={inputRef} className="pr-8 font-mono" placeholder="امسح الباركود أو اكتب اسم الصنف..." value={scan} onChange={e => setScan(e.target.value)} autoFocus/>
            </div>
            <Button type="submit">إضافة</Button>
          </form>
          {items.length > 0 && (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>الصنف</TableHead><TableHead>الباركود</TableHead>
                  <TableHead>حسب النظام</TableHead><TableHead>الجرد الفعلي</TableHead><TableHead>الفرق</TableHead><TableHead/>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((it, idx) => {
                    const diff = it.countedQty - it.systemQty
                    return (
                      <TableRow key={it.productId}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell className="font-mono text-xs">{it.barcode || '—'}</TableCell>
                        <TableCell>{it.systemQty}</TableCell>
                        <TableCell>
                          <Input type="number" min={0} className="w-24" value={it.countedQty}
                            onChange={e => setItems(prev => prev.map((x,i)=> i===idx ? {...x, countedQty: Math.max(0, parseInt(e.target.value,10)||0)} : x))}/>
                        </TableCell>
                        <TableCell className={diff === 0 ? '' : diff > 0 ? 'text-emerald-600' : 'text-red-600'}>{diff > 0 ? '+' : ''}{diff}</TableCell>
                        <TableCell><Button size="sm" variant="outline" onClick={() => setItems(prev => prev.filter((_,i)=>i!==idx))}><Trash2 className="size-3"/></Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between">
                <div className="text-sm">الفرق الإجمالي: <span className={totalDiff === 0 ? 'font-bold' : totalDiff > 0 ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>{totalDiff > 0 ? '+' : ''}{totalDiff}</span></div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => submit(false)} disabled={saving}>حفظ كمسودة</Button>
                  <Button onClick={() => submit(true)} disabled={saving}>{saving && <Loader2 className="size-4 ml-1 animate-spin"/>}<CheckCircle2 className="size-4 ml-1"/>اعتماد وتسوية</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">سجل عمليات الجرد</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>الفرع</TableHead>
              <TableHead>عدد الأصناف</TableHead><TableHead>الفرق</TableHead>
              <TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {stocktakes.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">لا توجد عمليات جرد</TableCell></TableRow>)}
              {stocktakes.map(st => {
                const totalD = st.items.reduce((s,i)=>s+i.diff,0)
                return (
                  <TableRow key={st.id}>
                    <TableCell>#{st.id}</TableCell>
                    <TableCell>{st.branch?.name || '—'}</TableCell>
                    <TableCell>{st.items.length}</TableCell>
                    <TableCell className={totalD === 0 ? '' : totalD > 0 ? 'text-emerald-600' : 'text-red-600'}>{totalD > 0 ? '+' : ''}{totalD}</TableCell>
                    <TableCell><Badge variant={st.status === 'committed' ? 'default' : 'outline'}>{st.status === 'committed' ? 'معتمد' : 'مسودة'}</Badge></TableCell>
                    <TableCell className="text-xs">{formatDate(st.createdAt)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}
