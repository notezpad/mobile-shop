'use client'

import * as React from 'react'
import { ArrowRight, Loader2, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/shared/EmptyState'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { useShopStore } from '@/lib/store'
import { round2, type PayMethod } from '@/lib/pos/pricing'
import { DraftNumberInput } from './DraftNumberInput'
import { PayMethodBar } from './PayMethodBar'
import { QtyStepper } from './QtyStepper'

interface SaleItemRow {
  id: number
  productId: number | null
  name: string
  price: number // per piece (after any invoice discount)
  quantity: number // pieces still returnable
  unitLabel?: string | null
}
interface SaleRow {
  id: number
  invoiceNo: string | null
  total: number
  paid: number
  createdAt: string
  customerId: number | null
  customer?: { name: string } | null
  items: SaleItemRow[]
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  askApproval: (reason: string, error?: string) => Promise<string | null>
}

const when = (iso: string) => new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Return from the POS: find the invoice → choose items/quantities → money back.
 * The cash that goes back defaults to the PAID part of the returned value; whatever was bought on credit
 * is taken off the customer's balance by the server. Cashiers need the manager PIN once the shop has set one.
 */
export function ReturnsDialog({ open, onOpenChange, askApproval }: Props) {
  const enabled = useShopStore((s) => s.plan.capabilities).includes('returns_exchange')
  const [query, setQuery] = React.useState('')
  const [list, setList] = React.useState<SaleRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [sale, setSale] = React.useState<SaleRow | null>(null)
  const [qtys, setQtys] = React.useState<Record<number, number>>({})
  const [cash, setCash] = React.useState(0)
  const [cashTouched, setCashTouched] = React.useState(false)
  const [method, setMethod] = React.useState<PayMethod>('cash')
  const [saving, setSaving] = React.useState(false)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false

  const search = React.useCallback(async (q: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ limit: '10' })
      if (q.trim()) qs.set('invoice', q.trim())
      const r = await api<{ data: SaleRow[] }>(`/api/sales?${qs}`)
      setList(r.data)
    } catch (e: any) {
      toast.error(e?.message || 'تعذّر تحميل الفواتير')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setQuery('')
    setSale(null)
    setQtys({})
    setCashTouched(false)
    setMethod('cash')
    if (online) void search('')
  }, [open, online, search])

  const value = React.useMemo(
    () => (sale ? sale.items.reduce((s, it) => s + it.price * (qtys[it.id] ?? 0), 0) : 0),
    [sale, qtys],
  )
  const cashPortion = sale && sale.total > 0 ? round2(value * Math.min(1, sale.paid / sale.total)) : 0
  React.useEffect(() => {
    if (!cashTouched) setCash(cashPortion)
  }, [cashPortion, cashTouched])

  const pick = (s: SaleRow) => {
    setSale(s)
    setQtys({})
    setCashTouched(false)
  }

  const submit = async () => {
    if (!sale) return
    const chosen = sale.items.filter((it) => (qtys[it.id] ?? 0) > 0)
    if (chosen.length === 0) return toast.error('اختار صنف للمرتجع')
    if (cash > round2(value) + 0.005) return toast.error('المبلغ المرتجع أكبر من قيمة الأصناف')

    // Spread the cash back over the items by their value; the last one takes the rounding remainder.
    let left = round2(cash)
    const deltas = chosen.map((it, i) => {
      const v = it.price * (qtys[it.id] ?? 0)
      const share = i === chosen.length - 1 ? left : Math.min(left, round2((cash * v) / (value || 1)))
      left = round2(left - share)
      return -share
    })

    setSaving(true)
    let pin: string | null = null
    let done = 0
    try {
      for (let i = 0; i < chosen.length; i++) {
        const it = chosen[i]
        for (let attempt = 0; ; attempt++) {
          try {
            await api('/api/sales/returns', {
              method: 'POST',
              body: { saleItemId: it.id, quantity: qtys[it.id], cashDelta: deltas[i], refundMethod: deltas[i] !== 0 ? method : undefined, approvalPin: pin ?? undefined },
            })
            break
          } catch (e: any) {
            const code = e?.body?.code as string | undefined
            if ((code === 'APPROVAL_REQUIRED' || code === 'APPROVAL_INVALID') && attempt < 3) {
              pin = await askApproval('مرتجع الكاشير يلزمه موافقة المدير.', code === 'APPROVAL_INVALID' ? e.message : undefined)
              if (!pin) throw new Error(done ? `اتسجّل ${done} من ${chosen.length} وباقي الأصناف اتلغت` : 'اتلغى المرتجع')
              continue
            }
            throw e
          }
        }
        done++
      }
      toast.success('تم تسجيل المرتجع')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل المرتجع')
      if (done > 0) { setSale(null); void search(query) } // quantities changed — show fresh numbers
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="size-4" /> مرتجع</DialogTitle>
          <DialogDescription>{sale ? `فاتورة ${sale.invoiceNo ?? sale.id}` : 'دوّر على الفاتورة برقمها.'}</DialogDescription>
        </DialogHeader>

        {!enabled ? (
          <p className="rounded-lg border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground">ميزة المرتجع/الاستبدال متاحة في باقة الملابس الاحترافية فقط.</p>
        ) : !online ? (
          <p className="rounded-lg border border-warning-subtle bg-warning-subtle p-4 text-sm text-warning-subtle-foreground">المرتجع محتاج اتصال بالإنترنت (بيتعدّل المخزون والخزنة مباشرة).</p>
        ) : !sale ? (
          <div className="space-y-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(query) }}>
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="رقم الفاتورة (مثلاً INV-2026-00012)" dir="ltr" className="text-start" aria-label="رقم الفاتورة" />
              <Button type="submit" variant="secondary" disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</Button>
            </form>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto overscroll-contain">
              {list && list.length === 0 && <li><EmptyState title="مفيش فواتير بالرقم ده" /></li>}
              {list?.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => pick(s)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-start hover:bg-accent">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold tabular-nums" dir="ltr">{s.invoiceNo ?? `#${s.id}`}</span>
                      <span className="block truncate text-xs text-muted-foreground">{when(s.createdAt)}{s.customer?.name ? ` · ${s.customer.name}` : ''} · {s.items.length} صنف</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatCurrency(s.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setSale(null)}><ArrowRight className="size-4" /> فاتورة تانية</Button>
            <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain">
              {sale.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(it.price)} × {it.quantity} قطعة{it.unitLabel ? ` (${it.unitLabel})` : ''}</p>
                  </div>
                  {it.quantity <= 0 || it.productId == null ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{it.quantity <= 0 ? 'اترجّع بالكامل' : 'منتج محذوف'}</span>
                  ) : (
                    <QtyStepper value={qtys[it.id] ?? 0} min={0} max={it.quantity} onChange={(n) => setQtys((q) => ({ ...q, [it.id]: n }))} />
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-2 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">قيمة المرتجع</span><span className="font-bold tabular-nums">{formatCurrency(value)}</span></div>
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs text-muted-foreground">يتردّ نقداً للعميل</Label>
                <DraftNumberInput allowDecimal value={cash} onCommit={(n) => { setCash(n); setCashTouched(true) }} className="h-9 flex-1 text-center tabular-nums" aria-label="المبلغ المردود" />
              </div>
              {value > 0 && round2(value - cash) > 0.005 && sale.customerId != null && (
                <p className="text-xs text-muted-foreground">الباقي ({formatCurrency(round2(value - cash))}) بيتخصم من رصيد العميل لو الفاتورة كانت آجل.</p>
              )}
              {cash > 0 && <PayMethodBar value={method} onChange={setMethod} />}
            </div>

            <Button type="button" size="lg" className="w-full" disabled={saving || value <= 0} onClick={() => void submit()}>
              {saving && <Loader2 className="size-4 animate-spin" />} تأكيد المرتجع
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
