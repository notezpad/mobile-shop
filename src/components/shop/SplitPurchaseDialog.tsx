'use client'

import * as React from 'react'
import { GitBranch, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/format'
import { DialogHero, MethodPills } from './purchase-dialog-ui'

/**
 * 🏬 شراء موزّع على فروع (للمدير) — فاتورة واحدة والكمية بتتقسم على الفروع.
 * بيكلّم POST /api/purchase-orders/split (معاينة ثم تأكيد). أونلاين بس: بنستخدم fetch
 * مباشرة عشان عملية متعددة الفروع ما تتحطش في طابور الأوفلاين وتتنفذ بعدين.
 */

interface BranchLite { id: number; name: string; isMain?: boolean }
interface SupplierLite { id: number; name: string }
interface ProductHit { id: number; name: string; barcode: string | null; cost: number | null; branchId: number | null }
interface Line { product: ProductHit; cost: string; qty: Record<number, string> }

interface PreviewLine { productId: number; name: string; quantity: number; cost: number; destName: string | null; willCreate: boolean }
interface PreviewBranch { branchId: number; branchName: string; total: number; paid: number; lines: PreviewLine[] }
interface Preview { total: number; paid: number; branches: PreviewBranch[] }

type PayMode = 'full' | 'partial' | 'credit'

const num = (v: string) => {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function SplitPurchaseDialog({
  open,
  onOpenChange,
  branches,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  branches: BranchLite[]
  onSaved?: () => void
}) {
  const [suppliers, setSuppliers] = React.useState<SupplierLite[]>([])
  const [supplierId, setSupplierId] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<ProductHit[]>([])
  const [lines, setLines] = React.useState<Line[]>([])
  const [payMode, setPayMode] = React.useState<PayMode>('full')
  const [partial, setPartial] = React.useState('')
  const [payMethod, setPayMethod] = React.useState('cash')
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const idemRef = React.useRef<string>('')

  const branchName = React.useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches])
  const mainId = branches.find((b) => b.isMain)?.id ?? branches[0]?.id ?? 0

  React.useEffect(() => {
    if (!open) return
    setLines([]); setQuery(''); setHits([]); setPreview(null)
    setPayMode('full'); setPartial(''); setPayMethod('cash'); setSupplierId('')
    idemRef.current = ''
    fetch('/api/suppliers')
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => setSuppliers(Array.isArray(l) ? l : l?.data ?? []))
      .catch(() => setSuppliers([]))
  }, [open])

  // البحث عن منتج
  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); return }
    const t = setTimeout(() => {
      fetch(`/api/products?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((res) => {
          const list: ProductHit[] = Array.isArray(res) ? res : res?.data ?? []
          setHits(list.slice(0, 8))
        })
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const touch = () => { setPreview(null); idemRef.current = '' }

  const addProduct = (p: ProductHit) => {
    if (lines.some((l) => l.product.id === p.id)) { toast.info('المنتج ده مضاف بالفعل'); return }
    setLines((prev) => [...prev, { product: p, cost: p.cost != null ? String(p.cost) : '', qty: {} }])
    setQuery(''); setHits([]); touch()
  }
  const setCost = (i: number, v: string) => { setLines((p) => p.map((l, k) => (k === i ? { ...l, cost: v } : l))); touch() }
  const setQty = (i: number, bid: number, v: string) => {
    setLines((p) => p.map((l, k) => (k === i ? { ...l, qty: { ...l.qty, [bid]: v } } : l))); touch()
  }
  const removeLine = (i: number) => { setLines((p) => p.filter((_, k) => k !== i)); touch() }

  const lineQty = (l: Line) => branches.reduce((s, b) => s + num(l.qty[b.id] ?? ''), 0)
  const grandTotal = r2(lines.reduce((s, l) => s + num(l.cost) * lineQty(l), 0))
  const paid = payMode === 'full' ? grandTotal : payMode === 'credit' ? 0 : r2(num(partial))
  const noSupplier = !supplierId

  const buildBody = (isPreview: boolean) => ({
    preview: isPreview,
    supplierId: supplierId ? Number(supplierId) : null,
    paid,
    paymentMethod: paid > 0 ? payMethod : 'cash',
    items: lines.map((l) => ({
      productId: l.product.id,
      cost: num(l.cost),
      allocations: branches
        .map((b) => ({ branchId: b.id, quantity: num(l.qty[b.id] ?? '') }))
        .filter((a) => a.quantity > 0),
    })),
  })

  const validate = (): string | null => {
    if (lines.length === 0) return 'ضيف صنف واحد على الأقل'
    for (const l of lines) {
      if (lineQty(l) <= 0) return `حدّد كمية لـ "${l.product.name}" في فرع واحد على الأقل`
      if (!(num(l.cost) >= 0) || l.cost.trim() === '') return `اكتب سعر التكلفة لـ "${l.product.name}"`
    }
    if (paid < grandTotal && noSupplier) return 'الشراء بالآجل لازم يكون مرتبط بمورد'
    if (paid > grandTotal && noSupplier) return 'المدفوع أكبر من إجمالي الفاتورة — اختر مورداً'
    return null
  }

  const call = async (isPreview: boolean) => {
    const err = validate()
    if (err) { toast.error(err); return null }
    if (!idemRef.current) idemRef.current = crypto.randomUUID()
    let res: Response
    try {
      res = await fetch('/api/purchase-orders/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(isPreview ? {} : { 'Idempotency-Key': idemRef.current }) },
        body: JSON.stringify(buildBody(isPreview)),
      })
    } catch {
      toast.error('التوزيع على الفروع بيتم أونلاين بس — اتأكد من الاتصال وحاول تاني')
      return null
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) { toast.error(data?.error || `طلب فاشل (${res.status})`); return null }
    return data
  }

  const doPreview = async () => {
    setBusy(true)
    try {
      const data = await call(true)
      if (data) setPreview(data as Preview)
    } finally { setBusy(false) }
  }
  const doSave = async () => {
    setBusy(true)
    try {
      const data = await call(false)
      if (data) {
        toast.success(`تم تسجيل الشراء الموزّع على ${data.orders?.length ?? 0} فرع`)
        onSaved?.()
        onOpenChange(false)
      }
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHero icon={GitBranch} title="شراء موزّع على فروع" subtitle="فاتورة واحدة، والكمية بتتقسم على الفروع — كل فرع بيدفع نصيبه من خزنته." />

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {/* المورد */}
          <section className="space-y-2">
            <label className="text-sm font-bold" htmlFor="sp-supplier">المورد</label>
            <select id="sp-supplier" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); touch() }}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
              <option value="">بدون مورد</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </section>

          {/* الأصناف */}
          <section className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن صنف بالاسم أو الباركود…"
                className="h-11 w-full rounded-xl border bg-background ps-9 pe-3 text-sm" />
              {hits.length > 0 && (
                <div className="absolute inset-x-0 top-12 z-20 max-h-64 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                  {hits.map((p) => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{branchName.get(p.branchId ?? mainId) ?? ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                <Plus className="mx-auto mb-1 size-5" /> ضيف الأصناف، وبعدها وزّع الكمية على الفروع.
              </p>
            )}

            {lines.map((l, i) => (
              <div key={l.product.id} className="space-y-3 rounded-2xl border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{l.product.name}</div>
                    <div className="text-xs text-muted-foreground">إجمالي الكمية: {lineQty(l)} · {formatCurrency(num(l.cost) * lineQty(l))}</div>
                  </div>
                  <button type="button" onClick={() => removeLine(i)} aria-label="حذف الصنف" className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="space-y-1 text-xs">
                    <span className="font-medium text-muted-foreground">سعر التكلفة</span>
                    <input inputMode="decimal" value={l.cost} onChange={(e) => setCost(i, e.target.value)}
                      className="h-10 w-full rounded-lg border bg-background px-2 text-sm tabular-nums" />
                  </label>
                  {branches.map((b) => (
                    <label key={b.id} className="space-y-1 text-xs">
                      <span className="font-medium text-muted-foreground">{b.name}</span>
                      <input inputMode="decimal" placeholder="0" value={l.qty[b.id] ?? ''} onChange={(e) => setQty(i, b.id, e.target.value)}
                        className="h-10 w-full rounded-lg border bg-background px-2 text-sm tabular-nums" />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* الدفع */}
          <section className="space-y-3">
            <div className="text-sm font-bold">الدفع (كل فرع بيدفع نصيبه بنسبة أمره)</div>
            <div className="flex flex-wrap gap-2">
              {([['full', 'مدفوع بالكامل'], ['partial', 'دفعة جزئية'], ['credit', 'آجل']] as [PayMode, string][]).map(([m, label]) => (
                <button key={m} type="button" onClick={() => { setPayMode(m); touch() }}
                  className={`rounded-xl border px-3 py-2 text-sm ${payMode === m ? 'border-cyan-600 bg-cyan-600/10 font-bold' : 'bg-card'}`}>{label}</button>
              ))}
            </div>
            {payMode === 'partial' && (
              <input inputMode="decimal" placeholder="المبلغ المدفوع" value={partial} onChange={(e) => { setPartial(e.target.value); touch() }}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm tabular-nums sm:w-60" />
            )}
            {paid > 0 && <MethodPills value={payMethod} onChange={setPayMethod} label="طريقة الدفع" />}
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm">
              <span>إجمالي الفاتورة</span>
              <span className="font-extrabold tabular-nums">{formatCurrency(grandTotal)}</span>
            </div>
          </section>

          {/* المعاينة */}
          {preview && (
            <section className="space-y-3">
              <div className="text-sm font-bold">معاينة قبل الحفظ</div>
              {preview.branches.map((b) => (
                <div key={b.branchId} className="rounded-2xl border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold">{b.branchName}</span>
                    <span className="tabular-nums">{formatCurrency(b.total)} · مدفوع {formatCurrency(b.paid)}</span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {b.lines.map((l) => (
                      <li key={l.productId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{l.name} × {l.quantity}</span>
                        <span className={l.willCreate ? 'shrink-0 font-bold text-amber-600' : 'shrink-0 text-muted-foreground'}>
                          {l.willCreate ? 'هيتعمل منتج جديد في الفرع' : `هيتضاف على: ${l.destName}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t bg-background p-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>إلغاء</Button>
          <Button variant="outline" onClick={doPreview} disabled={busy || lines.length === 0}>
            {busy && !preview ? <Loader2 className="size-4 animate-spin" /> : null} معاينة
          </Button>
          <Button onClick={doSave} disabled={busy || !preview} className="bg-cyan-700 text-white hover:bg-cyan-600">
            {busy && preview ? <Loader2 className="size-4 animate-spin" /> : null} تأكيد وحفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
