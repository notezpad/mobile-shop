'use client'

import * as React from 'react'
import { CalendarClock, HandCoins, Loader2, Plus, Undo2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import {
  EmptyState, GlassRail, GlassStat, HrHero, ListSkeleton, ModuleDock, PageShell, Pill, Reveal, StatusChip,
  HR_THEMES, PAY_METHODS, hrGet, hrSend, ink, money, num, tint,
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

  const openItems = items.filter((a) => a.status === 'open')
  const monthlyInstallments = openItems.reduce((s, a) => s + Math.min(a.installment, a.remaining), 0)
  const settledCount = items.filter((a) => a.status === 'settled').length

  return (
    <PageShell>
      <ModuleDock exclude="advances" />

      <HrHero
        theme="advances"
        icon={HandCoins}
        kicker="الموارد البشرية"
        title="السلف"
        subtitle="سلف بتيخرج من الخزنة وتتخصم من الراتب بالقسط تلقائيًا."
        actions={<Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="size-4" />سلفة جديدة</Button>}
      >
        {!loading && items.length > 0 && (
          <GlassRail>
            <GlassStat label="متبقي على الموظفين" value={<span className="whitespace-nowrap">{num(total)} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} foot={`${openItems.length} سلفة جارية`} />
            <GlassStat label="أقساط الشهر ده" value={<span className="whitespace-nowrap">{num(monthlyInstallments)} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} foot="تلقائي في مسودة الرواتب" />
            <GlassStat label="اتسددت خلاص" value={settledCount} foot={`من ${items.length} سلفة`} />
          </GlassRail>
        )}
      </HrHero>

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
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {items.map((a, idx) => {
            const paid = a.amount - a.remaining
            const pct = a.amount > 0 ? Math.min(100, (paid / a.amount) * 100) : 0
            const cancellable = a.status === 'open' && Math.abs(a.remaining - a.amount) < 0.005
            const months = a.installment > 0 ? Math.max(1, Math.round(a.amount / a.installment)) : 1
            const paidTicks = a.installment > 0 ? Math.min(months, Math.round(paid / a.installment)) : 0
            const hex = a.status === 'open' ? HR_THEMES.advances.hex : '#10b981'
            return (
              <Reveal key={a.id} delay={Math.min(idx * 45, 270)}>
                <article className="relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card p-4 shadow-sm transition-all hover:shadow-md">
                  {a.status === 'open' && (
                    <div aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-28 rounded-full opacity-[0.09] blur-2xl" style={{ background: hex }} />
                  )}

                  {/* الرأس */}
                  <div className="relative flex items-center gap-3">
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-md"
                      style={{ background: `linear-gradient(140deg, ${hex}, color-mix(in srgb, ${hex} 66%, black))` }}
                    >
                      <HandCoins className="size-5" strokeWidth={2.1} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-extrabold">{a.employeeName}</span>
                        <StatusChip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusChip>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CalendarClock className="size-3" />
                        {new Date(a.createdAt).toLocaleDateString('ar-EG-u-nu-latn')}
                        {a.note ? <span> · {a.note}</span> : ''}
                      </p>
                    </div>
                    <div className="text-end">
                      <div className="whitespace-nowrap text-base font-black tabular-nums">{money(a.amount)}</div>
                      {a.status === 'open' && (
                        <div className="text-[11px] font-bold" style={{ color: ink(hex, 82) }}>متبقي {money(a.remaining)}</div>
                      )}
                    </div>
                  </div>

                  {/* مسطرة الأقساط */}
                  {a.status === 'open' && (
                    <div className="relative mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                        <span>اتسدد {money(paid)}</span>
                        <span style={{ color: ink(hex, 80) }}>{Math.round(pct)}% • قسط {money(a.installment)}/شهر</span>
                      </div>
                      <div className="relative flex h-3 gap-[3px]">
                        {Array.from({ length: Math.min(months, 24) }).map((_, i) => {
                          const filled = i < paidTicks
                          const partial = i === paidTicks && pct < 100
                          return (
                            <div
                              key={i}
                              className="flex-1 rounded-full transition-all duration-500"
                              style={{
                                background: filled ? `linear-gradient(to bottom, ${hex}, color-mix(in srgb, ${hex} 72%, black))`
                                  : partial ? `linear-gradient(to bottom, ${hex}, ${tint(hex, 30)})`
                                  : 'var(--muted)',
                                opacity: filled || partial ? 1 : 0.9,
                              }}
                            />
                          )
                        })}
                      </div>
                      <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                        {paidTicks} قسط اخصم من {months} — الباقي بينزل تلقائي مع كل مسودة رواتب
                      </p>
                    </div>
                  )}

                  {a.status === 'settled' && (
                    <div className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      اتسددت بالكامل ✓ — الخصومات وصلت لنهايتها
                    </div>
                  )}

                  {/* الأوامر */}
                  {cancellable && (
                    <div className="mt-3 flex justify-end border-t pt-2.5">
                      <Button
                        variant="ghost" size="sm" disabled={cancelId === a.id} onClick={() => cancel(a.id)}
                        className="h-7 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-500/10"
                      >
                        {cancelId === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                        إلغاء السلفة
                      </Button>
                    </div>
                  )}
                </article>
              </Reveal>
            )
          })}
        </div>
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
            <span className={`grid size-8 place-items-center rounded-xl ${HR_THEMES.advances.solid} ${HR_THEMES.advances.solidFg}`}>
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
            <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
              <span>القسط الشهري</span>
              <b className="tabular-nums">{money(installment)}</b>
            </div>
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
