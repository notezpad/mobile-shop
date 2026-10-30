'use client'

import * as React from 'react'
import { Banknote, CalendarClock, HandCoins, Loader2, PiggyBank, Plus, Undo2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import {
  Avatar, Bar, CardGrid, EmptyState, FilterPill, HrHero, HrKpi, ItemCard, KpiGrid, ListSkeleton, PageShell, Pill,
  PAY_METHODS, SearchBox, SegBar, Toolbar, hrGet, hrSend, money,
} from './hr-ui'

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

  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | Advance['status']>('open')

  const openItems = items.filter((a) => a.status === 'open')
  const settledItems = items.filter((a) => a.status === 'settled')
  const cancelledItems = items.filter((a) => a.status === 'cancelled')
  const counted = items.filter((a) => a.status !== 'cancelled')
  const totalLent = counted.reduce((s, a) => s + a.amount, 0)
  const totalRepaid = counted.reduce((s, a) => s + (a.amount - (a.status === 'settled' ? 0 : a.remaining)), 0)
  const repaidPct = totalLent > 0 ? (totalRepaid / totalLent) * 100 : 0
  const monthlyInstallments = openItems.reduce((s, a) => s + Math.min(a.installment, a.remaining), 0)
  const debtors = new Set(openItems.map((a) => a.employeeId)).size
  const shown = items.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false
    const q = query.trim().toLowerCase()
    return !q || a.employeeName.toLowerCase().includes(q)
  })

  return (
    <PageShell>
      <HrHero
        theme="advances"
        icon={HandCoins}
        kicker="الموارد البشرية"
        title="السلف"
        subtitle="سلف بتيخرج من الخزنة وتتخصم من الراتب بالقسط تلقائيًا."
        actions={<Button onClick={() => setAdding(true)} className="h-11 w-full gap-1.5 sm:w-auto"><Plus className="size-4" />سلفة جديدة</Button>}
        metric={{
          label: 'إجمالي المتبقي على الموظفين',
          value: money(total).replace(' جنيه', ''),
          unit: 'جنيه',
          loading,
          foot: openItems.length > 0 ? `${openItems.length} سلفة جارية على ${debtors} ${debtors > 2 && debtors < 11 ? 'موظفين' : 'موظف'}` : 'مفيش سلف جارية — الحسابات مسوّاة',
        }}
        viz={
          <div className="grid gap-3">
            <div className="rounded-2xl border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-muted-foreground">نسبة التحصيل</span>
                <b className="tabular-nums text-emerald-700 dark:text-emerald-400">{Math.round(repaidPct)}%</b>
              </div>
              <Bar value={repaidPct} tone="emerald" className="h-3.5" />
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>اتحصّل <b className="tabular-nums text-foreground">{money(totalRepaid)}</b></span>
                <span>من <b className="tabular-nums text-foreground">{money(totalLent)}</b></span>
              </div>
            </div>
            <SegBar
              title="حالة السلف"
              segments={[
                { label: 'جارية', value: openItems.length, tone: 'violet' },
                { label: 'اتسددت', value: settledItems.length, tone: 'emerald' },
                { label: 'ملغية', value: cancelledItems.length, tone: 'slate' },
              ]}
              empty="لسه مفيش سلف"
            />
          </div>
        }
        kpis={
          <KpiGrid>
            <HrKpi tone="rose" icon={HandCoins} loading={loading} label="سلف جارية" value={openItems.length} sub={money(total)} />
            <HrKpi tone="violet" icon={CalendarClock} loading={loading} label="أقساط الشهر ده" value={money(monthlyInstallments)} sub="تلقائي في مسودة الرواتب" />
            <HrKpi tone="amber" icon={Banknote} loading={loading} label="إجمالي اللي اتسلّف" value={money(totalLent)} sub={`${counted.length} سلفة`} />
            <HrKpi tone="emerald" icon={PiggyBank} loading={loading} label="اتحصّل لحد دلوقتي" value={money(totalRepaid)} sub={`${settledItems.length} سلفة اتسددت`} progress={repaidPct} />
          </KpiGrid>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          theme="advances"
          icon={HandCoins}
          title="مفيش سلف"
          hint="سجّل أي سلفة عشان تتخصم من راتب الموظف بالقسط تلقائي."
          action={<Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="size-4" />سلفة جديدة</Button>}
        />
      ) : (
        <>
          <Toolbar>
            <SearchBox value={query} onChange={setQuery} placeholder="ابحث باسم الموظف" />
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={filter === 'open'} onClick={() => setFilter('open')} count={openItems.length} dot="bg-violet-500">جارية</FilterPill>
              <FilterPill active={filter === 'settled'} onClick={() => setFilter('settled')} count={settledItems.length} dot="bg-emerald-500">اتسددت</FilterPill>
              {cancelledItems.length > 0 && <FilterPill active={filter === 'cancelled'} onClick={() => setFilter('cancelled')} count={cancelledItems.length} dot="bg-slate-400">ملغية</FilterPill>}
              <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} count={items.length}>الكل</FilterPill>
            </div>
          </Toolbar>

          {shown.length === 0 ? (
            <EmptyState theme="advances" icon={Wallet} title="مفيش نتائج" hint="جرّب تغيّر الفلتر أو كلمة البحث." />
          ) : (
            <CardGrid min={320}>
              {shown.map((a) => {
                const paid = a.status === 'settled' ? a.amount : a.amount - a.remaining
                const pct = a.amount > 0 ? Math.min(100, (paid / a.amount) * 100) : 0
                const cancellable = a.status === 'open' && Math.abs(a.remaining - a.amount) < 0.005
                return (
                  <ItemCard key={a.id} dim={a.status === 'cancelled'} accent={a.status === 'open' ? 'bg-danger' : a.status === 'settled' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}>
                    <div className="flex items-start gap-3 p-4 pb-3 ps-5">
                      <Avatar name={a.employeeName} className="size-12 text-lg" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-extrabold">{a.employeeName}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                      <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-x-reverse border-y bg-muted/30 text-center">
                      <div className="px-2 py-2.5">
                        <div className="text-sm font-extrabold tabular-nums">{money(a.amount)}</div>
                        <div className="text-[10px] text-muted-foreground">المبلغ</div>
                      </div>
                      <div className="px-2 py-2.5">
                        <div className="text-sm font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{money(paid)}</div>
                        <div className="text-[10px] text-muted-foreground">اتسدد</div>
                      </div>
                      <div className="px-2 py-2.5">
                        <div className={`text-sm font-extrabold tabular-nums ${a.status === 'open' ? 'text-rose-600 dark:text-rose-400' : ''}`}>{money(a.status === 'open' ? a.remaining : 0)}</div>
                        <div className="text-[10px] text-muted-foreground">متبقي</div>
                      </div>
                    </div>

                    <div className="px-4 py-3 ps-5">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>قسط {money(a.installment)}</span>
                        <b className="tabular-nums text-foreground">{Math.round(pct)}%</b>
                      </div>
                      <Bar value={pct} tone={a.status === 'settled' ? 'emerald' : 'rose'} />
                      {a.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{a.note}</p>}
                    </div>

                    {cancellable && (
                      <div className="mt-auto border-t px-3 py-2 ps-4">
                        <Button variant="ghost" size="sm" disabled={cancelId === a.id} onClick={() => cancel(a.id)} className="gap-1 text-rose-600">
                          {cancelId === a.id ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                          إلغاء السلفة
                        </Button>
                      </div>
                    )}
                  </ItemCard>
                )
              })}
            </CardGrid>
          )}
        </>
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
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-danger text-danger-foreground">
              <HandCoins className="size-4" />
            </span>
            سلفة جديدة
          </DialogTitle>
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
