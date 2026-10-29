'use client'

import * as React from 'react'
import { Loader2, Plus, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmptyState, ListSkeleton, PAY_METHODS, PageHead, PageShell, Pill, Stat, hrGet, hrSend, money } from './hr-ui'

interface Advance {
  id: number
  employeeId: number
  employeeName: string
  amount: number
  installment: number
  remaining: number
  status: 'open' | 'settled' | 'cancelled'
  note: string | null
  createdAt: string
}
interface EmpLite { id: number; name: string; active: boolean }

const STATUS: Record<Advance['status'], { label: string; tone: 'violet' | 'emerald' | 'slate' }> = {
  open: { label: 'جارية', tone: 'violet' },
  settled: { label: 'اتسددت', tone: 'emerald' },
  cancelled: { label: 'ملغية', tone: 'slate' },
}

export function HrAdvancesView() {
  const [items, setItems] = React.useState<Advance[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [adding, setAdding] = React.useState(false)
  const [cancelId, setCancelId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await hrGet<{ items: Advance[]; totalRemaining: number }>('/api/hr/advances')
      setItems(d.items)
      setTotal(d.totalRemaining)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل السلف')
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const cancel = async (id: number) => {
    setCancelId(id)
    try {
      await hrSend(`/api/hr/advances/${id}`, 'DELETE')
      toast.success('تم إلغاء السلفة ورجوع المبلغ للخزنة')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإلغاء')
    } finally {
      setCancelId(null)
    }
  }

  return (
    <PageShell>
      <PageHead
        title="السلف"
        subtitle="السلفة بتخرج من الخزنة وبتتخصم تلقائي من الراتب بالقسط اللي تحدده."
        actions={<Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="size-4" />سلفة جديدة</Button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Stat label="متبقي على الموظفين" value={money(total)} tone="violet" />
        <Stat label="سلف جارية" value={items.filter((a) => a.status === 'open').length} tone="amber" />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title="مفيش سلف" hint="لما تدّي موظف سلفة سجّلها هنا عشان تتخصم من راتبه تلقائي." />
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const paid = a.amount - a.remaining
            const pct = a.amount > 0 ? Math.min(100, (paid / a.amount) * 100) : 0
            const cancellable = a.status === 'open' && Math.abs(a.remaining - a.amount) < 0.005
            return (
              <li key={a.id} className="rounded-2xl border bg-card p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{a.employeeName}</span>
                      <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString('ar-EG-u-nu-latn')} · قسط {money(a.installment)}
                      {a.note ? ` · ${a.note}` : ''}
                    </p>
                  </div>
                  <div className="text-end">
                    <div className="font-extrabold tabular-nums">{money(a.amount)}</div>
                    {a.status === 'open' && <div className="text-xs text-violet-600">متبقي {money(a.remaining)}</div>}
                  </div>
                  {cancellable && (
                    <Button variant="ghost" size="sm" disabled={cancelId === a.id} onClick={() => cancel(a.id)} className="gap-1 text-rose-600">
                      {cancelId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                      إلغاء
                    </Button>
                  )}
                </div>
                {a.status === 'open' && (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {adding && <AdvanceDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </PageShell>
  )
}

function AdvanceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [emps, setEmps] = React.useState<EmpLite[]>([])
  const [employeeId, setEmployeeId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [months, setMonths] = React.useState('1')
  const [method, setMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    hrGet<{ items: EmpLite[] }>('/api/hr/employees')
      .then((d) => setEmps(d.items.filter((e) => e.active)))
      .catch(() => toast.error('فشل تحميل الموظفين'))
  }, [])

  const amt = Number(amount)
  const m = Math.max(1, Math.floor(Number(months) || 1))
  const installment = amt > 0 ? Math.round((amt / m) * 100) / 100 : 0

  const save = async () => {
    if (!employeeId) return toast.error('اختر الموظف')
    if (!(amt > 0)) return toast.error('اكتب مبلغ السلفة')
    setSaving(true)
    try {
      await hrSend('/api/hr/advances', 'POST', { employeeId: Number(employeeId), amount: amt, months: m, method, note })
      toast.success('تم تسجيل السلفة وخصمها من الخزنة')
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل تسجيل السلفة')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle>سلفة جديدة</DialogTitle>
          <DialogDescription>المبلغ هيخرج من الخزنة فورًا.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3.5 py-4">
          <div className="space-y-1.5">
            <Label>الموظف</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>تتخصم على كام شهر</Label>
              <Input type="number" inputMode="numeric" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} dir="ltr" />
            </div>
          </div>
          {installment > 0 && (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">القسط الشهري: <b>{money(installment)}</b></p>
          )}
          <div className="space-y-1.5">
            <Label>اتصرفت من</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            تسجيل السلفة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
