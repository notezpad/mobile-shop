'use client'

import * as React from 'react'
import { CalendarDays, CalendarPlus, Loader2, ListChecks, Sun, ShieldAlert, Undo2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, type LeaveType } from '@/lib/hr'
import {
  Avatar, CardGrid, EmptyState, FilterPill, HrHero, HrKpi, KpiGrid, ListSkeleton, PageShell, Panel, PanelTitle, Pill,
  Ring, SearchBox, SegBar, Toolbar, hrGet, hrSend,
} from './hr-ui'

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

  const [query, setQuery] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<'all' | LeaveType>('all')

  const balances = data?.balances ?? []
  const totalUsed = balances.reduce((s, b) => s + b.used, 0)
  const totalAllowance = balances.reduce((s, b) => s + b.allowance, 0)
  const usedPct = totalAllowance > 0 ? (totalUsed / totalAllowance) * 100 : 0
  const overdrawn = balances.filter((b) => b.remaining < 0).length
  const items = data?.items ?? []
  const typeCount = (t: LeaveType) => items.filter((l) => l.type === t).length
  const shown = items.filter((l) => {
    if (typeFilter !== 'all' && l.type !== typeFilter) return false
    const q = query.trim().toLowerCase()
    return !q || l.employeeName.toLowerCase().includes(q)
  })
  const dayNum = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDate()
  const monShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', timeZone: 'UTC' })

  return (
    <PageShell>
      <HrHero
        theme="leaves"
        icon={CalendarDays}
        kicker="الموارد البشرية"
        title="الإجازات والأذونات"
        subtitle="إجازات وأذونات الفريق — بتتزامن مع الحضور والأرصدة تلقائيًا."
        actions={<Button onClick={() => setAdding(true)} className="h-11 w-full gap-1.5 sm:w-auto"><CalendarPlus className="size-4" />إجازة / إذن جديد</Button>}
        metric={{
          label: `أيام إجازة مستخدمة — سنة ${data?.year ?? ''}`,
          value: totalUsed,
          unit: totalAllowance ? `يوم من ${totalAllowance}` : 'يوم',
          loading: loading || !data,
          foot: totalAllowance ? `استهلاك الفريق ${Math.round(usedPct)}% من الرصيد السنوي` : 'لسه مفيش أرصدة — ضيف موظفين',
        }}
        viz={
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex items-center justify-center rounded-2xl border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
              <Ring value={usedPct} tone={usedPct > 85 ? 'rose' : usedPct > 60 ? 'amber' : 'violet'} size={92} stroke={9}>
                <span className="text-lg font-extrabold tabular-nums">{Math.round(usedPct)}%</span>
              </Ring>
            </div>
            <SegBar
              title="أنواع الإجازات المسجّلة"
              segments={LEAVE_TYPES.map((t) => ({ label: LEAVE_TYPE_LABEL[t], value: typeCount(t), tone: TONE[t] }))}
              empty="لسه مفيش إجازات متسجّلة"
            />
          </div>
        }
        kpis={
          <KpiGrid>
            <HrKpi tone="violet" icon={Sun} loading={loading || !data} label="رصيد سنوي لكل موظف" value={`${data?.annualLeaveDays ?? 0} يوم`} sub={`سنة ${data?.year ?? ''}`} />
            <HrKpi tone="amber" icon={CalendarDays} loading={loading || !data} label="أيام مستخدمة" value={`${totalUsed} يوم`} sub={`${balances.length} موظف`} progress={usedPct} />
            <HrKpi tone={overdrawn > 0 ? 'rose' : 'emerald'} icon={ShieldAlert} loading={loading || !data} label="تجاوزوا الرصيد" value={overdrawn} sub={overdrawn > 0 ? 'يتابعوا مع الإدارة' : 'كل الأرصدة منتظمة'} />
            <HrKpi tone="sky" icon={ListChecks} loading={loading || !data} label="إجازات متسجّلة" value={items.length} sub="السنة دي" />
          </KpiGrid>
        }
      />

      {loading || !data ? (
        <ListSkeleton />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ───── السجل ───── */}
          <div className="min-w-0 space-y-4">
            <Toolbar>
              <SearchBox value={query} onChange={setQuery} placeholder="ابحث باسم الموظف" />
              <div className="flex flex-wrap gap-1.5">
                <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} count={items.length}>الكل</FilterPill>
                {LEAVE_TYPES.map((t) => (
                  <FilterPill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} count={typeCount(t)}>{LEAVE_TYPE_LABEL[t]}</FilterPill>
                ))}
              </div>
            </Toolbar>

            {items.length === 0 ? (
              <EmptyState
                theme="leaves"
                icon={CalendarDays}
                title="مفيش إجازات متسجلة السنة دي" hint="سجّل إجازة أو إذن — بيظهر في الحضور والرواتب تلقائي."
                action={<Button onClick={() => setAdding(true)} className="gap-1.5"><CalendarPlus className="size-4" />إجازة / إذن جديد</Button>}
              />
            ) : shown.length === 0 ? (
              <EmptyState theme="leaves" icon={CalendarDays} title="مفيش نتائج" hint="جرّب تغيّر الفلتر أو كلمة البحث." />
            ) : (
              <CardGrid min={320}>
                {shown.map((l) => (
                  <div key={l.id} className="animate-in-up motion-reduce:animate-none group relative flex items-stretch overflow-hidden rounded-3xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                    <div className={`flex w-[72px] shrink-0 flex-col items-center justify-center gap-0.5 ${TONE_BG[l.type]}`}>
                      <span className="text-2xl font-extrabold leading-none tabular-nums">{dayNum(l.startDate)}</span>
                      <span className="text-[11px] font-bold">{monShort(l.startDate)}</span>
                    </div>
                    <div className="min-w-0 flex-1 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-extrabold">{l.employeeName}</span>
                        <Pill tone={TONE[l.type]}>{LEAVE_TYPE_LABEL[l.type]}</Pill>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} → ${fmt(l.endDate)}`}
                        <span className="mx-1">·</span>
                        <b className="text-foreground">{l.type === 'permission' ? `${l.hours} ساعة` : `${l.days} يوم عمل`}</b>
                      </p>
                      {l.note && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.note}</p>}
                      <Button variant="ghost" size="sm" disabled={busyId === l.id} onClick={() => cancel(l.id)} className="-ms-2 mt-1.5 h-8 gap-1 px-2 text-rose-600">
                        {busyId === l.id ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}إلغاء
                      </Button>
                    </div>
                  </div>
                ))}
              </CardGrid>
            )}
          </div>

          {/* ───── الأرصدة ───── */}
          <div className="min-w-0 lg:sticky lg:top-4">
            <PanelTitle icon={Users} title={`رصيد الإجازة السنوية ${data.year}`} />
            {balances.length === 0 ? (
              <EmptyState theme="leaves" icon={Users} title="مفيش موظفين" hint="ضيف موظفين الأول من صفحة الموظفين." />
            ) : (
              <Panel>
                <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                  {balances.map((b) => {
                    const pct = b.allowance > 0 ? Math.min(100, (b.used / b.allowance) * 100) : 0
                    const over = b.remaining < 0
                    return (
                      <li key={b.employeeId} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/30">
                        <Ring value={over ? 100 : pct} tone={over ? 'rose' : pct > 80 ? 'amber' : 'violet'} size={46} stroke={11}>
                          <Avatar name={b.name} className="size-7 rounded-lg text-xs" />
                        </Ring>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{b.name}</p>
                          <p className="text-[11px] text-muted-foreground">استخدم {b.used} من {b.allowance} يوم</p>
                        </div>
                        <span className={over ? 'text-sm font-extrabold text-rose-600' : 'text-sm font-extrabold'}>
                          {over ? `زيادة ${Math.abs(b.remaining)}` : `متبقي ${b.remaining}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}

      {adding && <LeaveDialog balances={data?.balances ?? []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </PageShell>
  )
}

/** خلفيات أيقونة لطيفة حسب نوع الإجازة */
const TONE_BG: Record<LeaveType, string> = {
  annual: 'bg-emerald-500/10 text-emerald-600',
  sick: 'bg-sky-500/10 text-sky-600',
  unpaid: 'bg-rose-500/10 text-rose-600',
  permission: 'bg-violet-500/10 text-violet-600',
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
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-stocktake text-stocktake-foreground">
              <CalendarPlus className="size-4" />
            </span>
            إجازة / إذن جديد
          </DialogTitle>
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
