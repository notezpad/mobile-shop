'use client'

import * as React from 'react'
import { CalendarDays, CalendarPlus, Clock3, Loader2, Undo2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, type LeaveType } from '@/lib/hr'
import {
  EmptyState, GlassRail, GlassStat, HrHero, ListSkeleton, ModuleDock, PageShell, PanelTitle, Pill, Reveal, Ring,
  HR_THEMES, hrGet, hrSend, ink, tint,
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
const TYPE_META: Record<LeaveType, { hex: string; icon: React.ElementType }> = {
  annual: { hex: '#10b981', icon: CalendarDays },
  sick: { hex: '#0ea5e9', icon: Clock3 },
  unpaid: { hex: '#f43f5e', icon: CalendarDays },
  permission: { hex: '#8b5cf6', icon: Clock3 },
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

  const totalUsed = data?.balances.reduce((s, b) => s + b.used, 0) ?? 0
  const overdrawn = data?.balances.filter((b) => b.remaining < 0).length ?? 0
  const totalAllowance = data?.balances.reduce((s, b) => s + b.allowance, 0) ?? 0

  return (
    <PageShell>
      <ModuleDock exclude="leaves" />

      <HrHero
        theme="leaves"
        icon={CalendarDays}
        kicker="الموارد البشرية"
        title="الإجازات والأذونات"
        subtitle="إجازات وأذونات الفريق — بتتزامن مع الحضور والأرصدة تلقائيًا."
        actions={<Button onClick={() => setAdding(true)} className="gap-1.5"><CalendarPlus className="size-4" />إجازة / إذن جديد</Button>}
      >
        {data && data.balances.length > 0 && (
          <GlassRail>
            <GlassStat label="رصيد سنوي لكل موظف" value={`${data.annualLeaveDays} يوم`} foot={`سنة ${data.year}`} />
            <GlassStat label="أيام مستخدمة" value={`${totalUsed} يوم`} foot={`من إجمالي ${totalAllowance} يوم`} />
            <GlassStat label="تجاوزوا الرصيد" value={overdrawn} foot={overdrawn > 0 ? 'يتابعوا مع الإدارة' : 'كل الأرصدة منتظمة'} />
          </GlassRail>
        )}
      </HrHero>

      {loading || !data ? (
        <ListSkeleton />
      ) : (
        <>
          {data.balances.length > 0 && (
            <Reveal>
              <section className="mb-6">
                <PanelTitle icon={Users} hex={HR_THEMES.leaves.hex} title={`رصيد الإجازة السنوية ${data.year}`} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {data.balances.map((b) => {
                    const pct = b.allowance > 0 ? Math.min(100, (b.used / b.allowance) * 100) : 0
                    const over = b.remaining < 0
                    const hex = over ? '#f43f5e' : HR_THEMES.leaves.hex
                    return (
                      <div
                        key={b.employeeId}
                        className="flex items-center gap-3 rounded-3xl border bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <Ring value={pct} size={74} stroke={8} hex={hex} delay={200}>
                          <div className="text-center">
                            <div className="text-sm font-black tabular-nums leading-none" style={{ color: ink(hex, 80) }}>{b.remaining}</div>
                            <div className="text-[9px] font-bold text-muted-foreground">متبقي</div>
                          </div>
                        </Ring>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-extrabold" title={b.name}>{b.name}</div>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            استخدم <b className="tabular-nums text-foreground">{b.used}</b> من <b className="tabular-nums text-foreground">{b.allowance}</b> يوم
                          </p>
                          {over && <Pill tone="rose">تجاوز الرصيد</Pill>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </Reveal>
          )}

          <Reveal delay={60}>
            <PanelTitle icon={CalendarDays} hex={HR_THEMES.leaves.hex} title="سجل الإجازات والأذونات" />
            {data.items.length === 0 ? (
              <EmptyState
                theme="leaves"
                icon={CalendarDays}
                title="مفيش إجازات متسجلة السنة دي"
                hint="سجّل إجازة أو إذن — بيظهر في الحضور والرواتب تلقائي."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {data.items.map((l, idx) => {
                  const meta = TYPE_META[l.type]
                  const Icon = meta.icon
                  return (
                    <Reveal key={l.id} delay={Math.min(idx * 40, 240)}>
                      {/* تذكرة إجازة — حافة مثقوبة زي التذاكر */}
                      <article className="relative flex overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md">
                        {/* كعب التذكرة */}
                        <div
                          className="relative grid w-[84px] shrink-0 place-items-center border-e-2 border-dashed p-2 text-center"
                          style={{ background: tint(meta.hex, 8), borderColor: 'color-mix(in srgb, var(--border) 90%, transparent)' }}
                        >
                          {/* خرام التذكرة */}
                          <span aria-hidden className="absolute -top-2.5 -end-2.5 size-5 rounded-full bg-background ring-1 ring-border" />
                          <span aria-hidden className="absolute -bottom-2.5 -end-2.5 size-5 rounded-full bg-background ring-1 ring-border" />
                          <span
                            className="grid size-10 place-items-center rounded-2xl text-white shadow-sm"
                            style={{ background: `linear-gradient(140deg, ${meta.hex}, color-mix(in srgb, ${meta.hex} 66%, black))` }}
                          >
                            <Icon className="size-5" strokeWidth={2.1} />
                          </span>
                          <span className="mt-1.5 text-[10px] font-black leading-tight" style={{ color: ink(meta.hex, 80) }}>
                            {LEAVE_TYPE_LABEL[l.type]}
                          </span>
                        </div>

                        {/* جسم التذكرة */}
                        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-extrabold">{l.employeeName}</span>
                            <Pill tone={TONE[l.type]}>{l.type === 'permission' ? `${l.hours} ساعة` : `${l.days} يوم`}</Pill>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-bold tabular-nums text-foreground/75">{l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} ← ${fmt(l.endDate)}`}</span>
                            {l.note ? <span> · {l.note}</span> : ''}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold text-muted-foreground">
                              {l.type === 'permission' ? 'إذن متابعة — بدون أثر على الراتب' : 'بتتزامن مع الحضور تلقائي'}
                            </span>
                            <Button
                              variant="ghost" size="sm" disabled={busyId === l.id} onClick={() => cancel(l.id)}
                              className="h-7 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-500/10"
                            >
                              {busyId === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}إلغاء
                            </Button>
                          </div>
                        </div>
                      </article>
                    </Reveal>
                  )
                })}
              </div>
            )}
          </Reveal>
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
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-pink-500 text-white">
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
