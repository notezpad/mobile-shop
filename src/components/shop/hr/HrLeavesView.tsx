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
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, type LeaveType } from '@/lib/hr'
import { EmptyState, ListSkeleton, PageHead, PageShell, Pill, hrGet, hrSend } from './hr-ui'

interface Leave {
  id: number; employeeId: number; employeeName: string; type: LeaveType
  startDate: string; endDate: string; days: number; hours: number | null; note: string | null
}
interface Balance { employeeId: number; name: string; allowance: number; used: number; remaining: number }
interface Data { year: string; annualLeaveDays: number; items: Leave[]; balances: Balance[] }

const TONE: Record<LeaveType, 'emerald' | 'sky' | 'rose' | 'violet'> = {
  annual: 'emerald', sick: 'sky', unpaid: 'rose', permission: 'violet',
}
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function HrLeavesView() {
  const [data, setData] = React.useState<Data | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [adding, setAdding] = React.useState(false)
  const [busyId, setBusyId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try { setData(await hrGet<Data>('/api/hr/leaves')) }
    catch (e: any) { toast.error(e?.message || 'فشل تحميل الإجازات') }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const cancel = async (id: number) => {
    setBusyId(id)
    try {
      await hrSend(`/api/hr/leaves/${id}`, 'DELETE')
      toast.success('تم إلغاء الإجازة وإرجاع أيامها في الحضور')
      load()
    } catch (e: any) { toast.error(e?.message || 'فشل الإلغاء') }
    finally { setBusyId(null) }
  }

  return (
    <PageShell>
      <PageHead
        title="الإجازات والأذونات"
        subtitle="سجّل الإجازة وهتظهر في الحضور تلقائي. السنوية والمرضية بمرتب، وبدون مرتب بتتخصم."
        actions={<Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="size-4" />إجازة / إذن جديد</Button>}
      />

      {loading || !data ? (
        <ListSkeleton />
      ) : (
        <>
          {data.balances.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-base font-extrabold">رصيد الإجازة السنوية {data.year}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.balances.map((b) => {
                  const pct = b.allowance > 0 ? Math.min(100, (b.used / b.allowance) * 100) : 0
                  return (
                    <div key={b.employeeId} className="rounded-2xl border bg-card p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-bold">{b.name}</span>
                        <span className={b.remaining < 0 ? 'text-sm font-extrabold text-rose-600' : 'text-sm font-extrabold'}>
                          متبقي {b.remaining} من {b.allowance}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={b.remaining < 0 ? 'h-full bg-rose-500' : 'h-full bg-emerald-500'} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <h2 className="mb-2 text-base font-extrabold">السجل</h2>
          {data.items.length === 0 ? (
            <EmptyState title="مفيش إجازات متسجلة السنة دي" hint="لما موظف ياخد إجازة أو إذن سجّله هنا." />
          ) : (
            <ul className="space-y-2">
              {data.items.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{l.employeeName}</span>
                      <Pill tone={TONE[l.type]}>{LEAVE_TYPE_LABEL[l.type]}</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} → ${fmt(l.endDate)}`}
                      {l.type === 'permission' ? ` · ${l.hours} ساعة` : ` · ${l.days} يوم عمل`}
                      {l.note ? ` · ${l.note}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={busyId === l.id} onClick={() => cancel(l.id)} className="gap-1 text-rose-600">
                    {busyId === l.id ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}إلغاء
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {adding && <LeaveDialog balances={data?.balances ?? []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </PageShell>
  )
}

function LeaveDialog({ balances, onClose, onSaved }: { balances: Balance[]; onClose: () => void; onSaved: () => void }) {
  const [employeeId, setEmployeeId] = React.useState('')
  const [type, setType] = React.useState<LeaveType>('annual')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')
  const [hours, setHours] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const bal = balances.find((b) => String(b.employeeId) === employeeId)

  const save = async () => {
    if (!employeeId) return toast.error('اختر الموظف')
    if (!start) return toast.error('اختر تاريخ البداية')
    if (type === 'permission' && !(Number(hours) > 0)) return toast.error('اكتب عدد ساعات الإذن')
    setSaving(true)
    try {
      const r = await hrSend<{ days: number; skipped: number }>('/api/hr/leaves', 'POST', {
        employeeId: Number(employeeId), type, startDate: start, endDate: end || start,
        hours: type === 'permission' ? Number(hours) : undefined, note,
      })
      toast.success(type === 'permission' ? 'تم تسجيل الإذن' : `تم تسجيل ${r.days} يوم${r.skipped ? ` (تخطّى ${r.skipped} يوم فيه حضور فعلي)` : ''}`)
      onSaved()
    } catch (e: any) { toast.error(e?.message || 'فشل التسجيل') }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle>إجازة / إذن جديد</DialogTitle>
          <DialogDescription>أيام الإجازة الأسبوعية بتتخطى تلقائي.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3.5 py-4">
          <div className="space-y-1.5">
            <Label>الموظف</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>{balances.map((b) => <SelectItem key={b.employeeId} value={String(b.employeeId)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>النوع</Label>
            <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{type === 'permission' ? 'يوم الإذن' : 'من'}</Label>
              <Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            {type === 'permission' ? (
              <div className="space-y-1.5">
                <Label>عدد الساعات</Label>
                <Input type="number" inputMode="decimal" dir="ltr" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>إلى</Label>
                <Input type="date" dir="ltr" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            )}
          </div>
          {type === 'annual' && bal && (
            <p className={`rounded-xl px-3 py-2 text-sm ${bal.remaining <= 0 ? 'bg-rose-500/10 text-rose-700' : 'bg-muted/60'}`}>
              رصيده المتبقي: <b>{bal.remaining}</b> يوم {bal.remaining <= 0 && '— هيتخطى الرصيد'}
            </p>
          )}
          {type === 'permission' && <p className="text-xs text-muted-foreground">الإذن سجل متابعة فقط ومالوش أثر على الراتب.</p>}
          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="size-4 animate-spin" />}تسجيل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
