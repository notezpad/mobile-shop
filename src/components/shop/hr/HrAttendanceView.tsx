'use client'

import * as React from 'react'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Delete, Loader2, MonitorSmartphone,
  Palmtree, UserCheck, UserX, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import { HR_STATUS_LABEL, addDaysStr, weekdayOf, type HrStatus } from '@/lib/hr'
import { HrNetworkError, newIdempotencyKey } from '@/lib/hr-client'
import { enqueuePunch, loadItemsCache, queueAvailable, saveItemsCache } from '@/lib/hr-kiosk-queue'
import { KioskQueueBanner, useKioskQueue } from './KioskQueueBanner'
import {
  DAY_NAMES, EmptyState, GlassRail, GlassStat, HrHero, ListSkeleton, ModuleDock, PageShell,
  Panel, PanelTitle, Reveal, dayLabel, hrGet, hrSend, ink, tint,
} from './hr-ui'

interface Emp { id: number; name: string; jobTitle: string | null; weeklyOffDay: number; hireDate: string }
interface Rec {
  employeeId: number; date: string; status: HrStatus; lateMinutes: number
  checkIn: string | null; checkOut: string | null; note: string | null; source: string
}
interface MonthData {
  month: string; today: string; tz: string; daysInMonth: number
  settings: { graceMinutes: number }
  employees: Emp[]; records: Rec[]
}

/** هوية الحالات — لون + أيقونة */
const STATUS_META: Record<HrStatus, { hex: string; icon: React.ElementType }> = {
  present: { hex: '#10b981', icon: Check },
  late: { hex: '#f59e0b', icon: Clock3 },
  absent: { hex: '#f43f5e', icon: UserX },
  leave: { hex: '#0ea5e9', icon: Palmtree },
}
const STATUSES: HrStatus[] = ['present', 'late', 'absent', 'leave']

export function HrAttendanceView() {
  const [data, setData] = React.useState<MonthData | null>(null)
  const [date, setDate] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [kiosk, setKiosk] = React.useState(false)

  const load = React.useCallback(async (month?: string) => {
    try {
      const d = await hrGet<MonthData>(`/api/hr/attendance${month ? `?month=${month}` : ''}`)
      setData(d)
      setDate((cur) => cur || d.today)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الحضور')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], () => load(date ? date.slice(0, 7) : undefined))
  React.useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kiosk') === '1') setKiosk(true)
  }, [])

  // لو اليوم المختار في شهر غير المحمّل → حمّل الشهر ده
  React.useEffect(() => {
    if (data && date && date.slice(0, 7) !== data.month) load(date.slice(0, 7))
  }, [date, data, load])

  const recMap = React.useMemo(() => {
    const m = new Map<string, Rec>()
    data?.records.forEach((r) => m.set(`${r.employeeId}|${r.date}`, r))
    return m
  }, [data])

  const today = data?.today ?? ''
  const emps = (data?.employees ?? []).filter((e) => e.hireDate <= date)

  const send = async (records: { employeeId: number; date: string; status: HrStatus | null; lateMinutes?: number }[]) => {
    if (!data) return
    // تحديث فوري محليًا
    setData((cur) => {
      if (!cur) return cur
      let recs = cur.records.slice()
      for (const r of records) {
        recs = recs.filter((x) => !(x.employeeId === r.employeeId && x.date === r.date))
        if (r.status) {
          recs.push({
            employeeId: r.employeeId, date: r.date, status: r.status,
            lateMinutes: r.status === 'late' ? r.lateMinutes ?? 0 : 0,
            checkIn: null, checkOut: null, note: null, source: 'manual',
          })
        }
      }
      return { ...cur, records: recs }
    })
    setBusy(true)
    try {
      await hrSend('/api/hr/attendance', 'POST', { records })
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
      load(date.slice(0, 7))
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (e: Emp, status: HrStatus) => {
    const cur = recMap.get(`${e.id}|${date}`)
    if (cur?.status === status) return send([{ employeeId: e.id, date, status: null }])
    return send([{ employeeId: e.id, date, status, lateMinutes: status === 'late' ? cur?.lateMinutes || 30 : 0 }])
  }

  const presentAll = () => {
    const todo = emps
      .filter((e) => !recMap.has(`${e.id}|${date}`) && weekdayOf(date) !== e.weeklyOffDay)
      .map((e) => ({ employeeId: e.id, date, status: 'present' as HrStatus }))
    if (todo.length === 0) return toast.info('كل الموظفين متسجّلين بالفعل')
    send(todo)
    toast.success(`تم تسجيل ${todo.length} حاضر`)
  }

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { present: 0, late: 0, absent: 0, leave: 0 }
    emps.forEach((e) => {
      const r = recMap.get(`${e.id}|${date}`)
      if (r) c[r.status]++
    })
    return c
  }, [emps, recMap, date])

  const timeOf = (iso: string | null) =>
    iso && data
      ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: data.tz })
      : null

  return (
    <PageShell>
      <ModuleDock exclude="attendance" />

      <HrHero
        theme="attendance"
        icon={MonitorSmartphone}
        kicker="الموارد البشرية"
        title="الحضور والانصراف"
        subtitle={date ? dayLabel(date) : 'سجل يومي بكل موظف — منه بيتحدد أيام الشغل في الرواتب.'}
        actions={
          <Button variant="outline" onClick={() => setKiosk(true)} className="gap-1.5">
            <MonitorSmartphone className="size-4" />كشك الحضور (PIN)
          </Button>
        }
      >
        {!loading && data && (
          <GlassRail>
            {(['present', 'late', 'absent', 'leave'] as HrStatus[]).map((st) => {
              const meta = STATUS_META[st]
              return (
                <GlassStat
                  key={st}
                  label={
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: meta.hex }} />
                      {HR_STATUS_LABEL[st]}
                    </span>
                  }
                  value={<span style={{ color: ink(meta.hex, 80) }}>{counts[st]}</span>}
                />
              )
            })}
          </GlassRail>
        )}
      </HrHero>

      <KioskQueueBanner />

      {loading || !data || !date ? (
        <ListSkeleton />
      ) : data.employees.length === 0 ? (
        <EmptyState theme="attendance" icon={Users} title="مفيش موظفين لسه" hint="ضيف الموظفين الأول من شاشة الموظفين." />
      ) : (
        <>
          {/* ════ شريط اليوم — تاكسي بين الأيام ════ */}
          <Reveal>
            <Panel className="mb-3.5">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <Button variant="outline" size="icon" aria-label="اليوم السابق" onClick={() => setDate(addDaysStr(date, -1))}>
                  <ChevronRight className="size-4" />
                </Button>
                <div className="min-w-0 flex-1 text-center">
                  <div className="truncate font-extrabold">{dayLabel(date)}</div>
                  {date === today && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                      </span>
                      النهارده
                    </span>
                  )}
                </div>
                <Button variant="outline" size="icon" aria-label="اليوم التالي" disabled={date >= today} onClick={() => setDate(addDaysStr(date, 1))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Input
                  type="date" value={date} max={today} dir="ltr" className="w-40"
                  onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)}
                />
                <Button onClick={presentAll} disabled={busy} className="gap-1.5">
                  <UserCheck className="size-4" />حاضر للكل
                </Button>
              </div>
            </Panel>
          </Reveal>

          {/* ════ لوحة الفريق ════ */}
          <Reveal delay={60}>
            <Panel className="mb-3.5">
              <ul className="divide-y divide-border">
                {emps.map((e) => {
                  const r = recMap.get(`${e.id}|${date}`)
                  const isOff = weekdayOf(date) === e.weeklyOffDay
                  return (
                    <li key={e.id} className="px-3.5 py-3 transition-colors hover:bg-muted/25 sm:px-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {/* الاسم والتوقيتات */}
                        <div className="min-w-[150px] flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black"
                              style={r ? { background: tint(STATUS_META[r.status].hex, 14), color: ink(STATUS_META[r.status].hex, 82) } : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                            >
                              {e.name.trim().charAt(0)}
                            </span>
                            <span className="truncate font-bold">{e.name}</span>
                            {isOff && !r && (
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                                راحة أسبوعية ({DAY_NAMES[e.weeklyOffDay]})
                              </span>
                            )}
                          </div>
                          {(r?.checkIn || r?.checkOut) && (
                            <p className="mt-1 ps-10 text-xs text-muted-foreground" dir="rtl">
                              {r.checkIn && <>حضور <b className="tabular-nums text-foreground/80">{timeOf(r.checkIn)}</b></>}
                              {r.checkOut && <> · انصراف <b className="tabular-nums text-foreground/80">{timeOf(r.checkOut)}</b></>}
                            </p>
                          )}
                        </div>

                        {/* أزرار الحالة */}
                        <div className="flex flex-wrap gap-1.5">
                          {STATUSES.map((s) => {
                            const active = r?.status === s
                            const meta = STATUS_META[s]
                            const Icon = meta.icon
                            return (
                              <button
                                key={s} type="button" onClick={() => setStatus(e, s)}
                                className={cn(
                                  'flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold transition-all active:scale-95',
                                  active ? 'border-transparent text-white shadow-md' : 'bg-background text-foreground/65 hover:bg-muted',
                                )}
                                style={active ? { background: meta.hex, boxShadow: `0 6px 16px -6px ${meta.hex}88` } : undefined}
                              >
                                <Icon className="size-3.5" strokeWidth={2.6} />
                                {HR_STATUS_LABEL[s]}
                              </button>
                            )
                          })}
                        </div>

                        {r?.status === 'late' && (
                          <LateMinutes
                            value={r.lateMinutes}
                            onCommit={(v) => send([{ employeeId: e.id, date, status: 'late', lateMinutes: v }])}
                          />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </Reveal>

          {/* ════ خريطة الشهر ════ */}
          <Reveal delay={100}>
            <section>
              <PanelTitle
                icon={CalendarDays}
                hex="#f59e0b"
                title={`خريطة شهر ${data.month}`}
                action={<MonthLegend />}
              />
              <Panel>
                <div className="overflow-x-auto p-3.5 sm:p-4">
                  <div className="min-w-[600px] space-y-2.5">
                    {/* صف أرقام الأيام */}
                    <div className="flex items-end gap-2.5">
                      <div className="w-[104px] shrink-0 text-[10px] font-bold text-muted-foreground">اليوم</div>
                      <div className="flex flex-1 gap-[3px]">
                        {Array.from({ length: data.daysInMonth }).map((_, i) => {
                          const d = i + 1
                          const isToday = `${data.month}-${String(d).padStart(2, '0')}` === data.today
                          return (
                            <div key={i} className="flex-1 text-center text-[8.5px] font-bold tabular-nums" style={{ color: isToday ? ink('#10b981', 85) : 'var(--muted-foreground)' }}>
                              {d}
                            </div>
                          )
                        })}
                        <div className="w-[86px] shrink-0" />
                      </div>
                    </div>

                    {emps.map((e) => (
                      <HeatRow
                        key={e.id}
                        emp={e}
                        data={data}
                        recMap={recMap}
                        selected={date}
                        onPick={(d) => setDate(d)}
                      />
                    ))}
                  </div>
                </div>
              </Panel>
            </section>
          </Reveal>
        </>
      )}

      {kiosk && <KioskDialog onClose={() => { setKiosk(false); load(date ? date.slice(0, 7) : undefined) }} />}
    </PageShell>
  )
}

/** صف موظف في خريطة الشهر */
function HeatRow({
  emp, data, recMap, selected, onPick,
}: {
  emp: Emp
  data: MonthData
  recMap: Map<string, Rec>
  selected: string
  onPick: (date: string) => void
}) {
  // ملخص الشهر
  const rs = data.records.filter((r) => r.employeeId === emp.id)
  const absent = rs.filter((r) => r.status === 'absent').length
  const leave = rs.filter((r) => r.status === 'leave').length
  const lateRs = rs.filter((r) => r.status === 'late')
  const lateMin = lateRs.reduce((s, r) => s + r.lateMinutes, 0)
  const clean = rs.length > 0 && absent === 0 && lateRs.length === 0

  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[104px] shrink-0">
        <div className="truncate text-[13px] font-bold" title={emp.name}>{emp.name}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {clean && <span className="text-[9.5px] font-bold text-emerald-600">سجل نضيف ✓</span>}
          {absent > 0 && <span className="text-[9.5px] font-bold text-rose-600">غياب {absent}</span>}
          {lateRs.length > 0 && <span className="text-[9.5px] font-bold text-amber-600">تأخير {lateRs.length} مرة / {lateMin} د</span>}
          {leave > 0 && <span className="text-[9.5px] font-bold text-sky-600">إجازة {leave}</span>}
        </div>
      </div>

      <div className="flex flex-1 gap-[3px]">
        {Array.from({ length: data.daysInMonth }).map((_, i) => {
          const d = String(i + 1).padStart(2, '0')
          const dateStr = `${data.month}-${d}`
          const rec = recMap.get(`${emp.id}|${dateStr}`)
          const isToday = dateStr === data.today
          const isSel = dateStr === selected
          const isFuture = dateStr > data.today
          const meta = rec ? STATUS_META[rec.status] : null
          return (
            <button
              key={i}
              type="button"
              title={`${d} ${emp.name}${rec ? ` — ${HR_STATUS_LABEL[rec.status]}${rec.status === 'late' ? ` (${rec.lateMinutes} د)` : ''}` : ''}`}
              onClick={() => !isFuture && onPick(dateStr)}
              disabled={isFuture}
              className={cn(
                'h-6 flex-1 rounded-[5px] transition-all',
                !meta && (isFuture ? 'bg-muted/40' : 'bg-muted hover:bg-muted/70'),
                isFuture && 'cursor-default',
                isSel && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card',
                !isSel && isToday && 'ring-1 ring-emerald-500/70',
                !isFuture && 'hover:scale-125 hover:z-10',
              )}
              style={meta ? { background: meta.hex } : undefined}
            />
          )
        })}
      </div>

      {/* عمود ثابت يمين لموازنة صف الأرقام */}
      <div className="w-[86px] shrink-0" />
    </div>
  )
}

function MonthLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-muted-foreground">
      {(['present', 'late', 'absent', 'leave'] as HrStatus[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: STATUS_META[s].hex }} />
          {HR_STATUS_LABEL[s]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-muted" />بدون سجل
      </span>
    </div>
  )
}

function LateMinutes({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = React.useState(String(value))
  React.useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Math.max(0, Math.min(600, Math.floor(Number(v) || 0)))
    if (n !== value) onCommit(n)
  }
  return (
    <label className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
      <Clock3 className="size-3.5" />
      <Input
        type="number" inputMode="numeric" min={0} max={600} value={v} dir="ltr"
        className="h-7 w-16 border-0 bg-transparent px-1 text-center text-xs font-bold tabular-nums focus-visible:ring-1"
        onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      دقيقة
    </label>
  )
}

/* ───────────────────────── كشك الحضور (PIN) ───────────────────────── */

interface KioskItem {
  id: number; name: string; jobTitle: string | null; hasPin: boolean
  status: HrStatus | null; checkIn: string | null; checkOut: string | null
}

function KioskDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = React.useState<KioskItem[] | null>(null)
  const [picked, setPicked] = React.useState<KioskItem | null>(null)
  const [pin, setPin] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<{ text: string; tone: 'ok' | 'late' | 'queued' } | null>(null)
  const [offline, setOffline] = React.useState(false)
  const { queue } = useKioskQueue()

  const load = React.useCallback(async () => {
    try {
      const d = await hrGet<{ today: string; tz: string; items: KioskItem[] }>('/api/hr/kiosk')
      setItems(d.items)
      setOffline(false)
      saveItemsCache(d.items, { today: d.today, tz: d.tz })
    } catch (e: any) {
      // بدون نت: آخر قائمة اتحملت على الجهاز (حالات اليوم بتتفرّغ لو القائمة قديمة)
      const c = loadItemsCache<KioskItem>()
      if (c) {
        let sameDay = false
        try { sameDay = new Intl.DateTimeFormat('en-CA', { timeZone: c.tz }).format(new Date()) === c.today } catch { /* ignore */ }
        setItems(sameDay ? c.items : c.items.map((i) => ({ ...i, status: null, checkIn: null, checkOut: null })))
        setOffline(true)
      } else {
        toast.error(e?.message || 'فشل تحميل الموظفين')
        setItems([])
      }
    }
  }, [])
  React.useEffect(() => { load() }, [load])

  // حالة الموظف الفعلية = من السيرفر + اللي اتسجل أوفلاين ومستني المزامنة
  const effective = React.useCallback((e: KioskItem): KioskItem => {
    let cur = e
    for (const p of queue) {
      if (p.employeeId !== e.id) continue
      cur = cur.checkIn
        ? cur.checkOut ? cur : { ...cur, checkOut: p.clientTime }
        : { ...cur, status: 'present', checkIn: p.clientTime }
    }
    return cur
  }, [queue])

  const punchOffline = (emp: KioskItem, p: string, key: string) => {
    if (!queueAvailable()) { toast.error('مفيش اتصال، والتخزين على الجهاز غير متاح (وضع خاص؟)'); setPin(''); return }
    const eff = effective(emp)
    if (eff.checkOut) { toast.error('سجّلت حضورك وانصرافك النهارده خلاص'); setPin(''); return }
    const last = queue.filter((q) => q.employeeId === emp.id).at(-1)
    if (last && Date.now() - new Date(last.clientTime).getTime() < 2 * 60_000) { toast.error('سجّلت من لحظات'); setPin(''); return }
    enqueuePunch({ id: key, employeeId: emp.id, name: emp.name, pin: p, clientTime: new Date().toISOString() })
    setDone({
      text: `تم تسجيل ${eff.checkIn ? 'انصرافك' : 'حضورك'} يا ${emp.name} — بدون إنترنت، هيتأكد لما النت يرجع`,
      tone: 'queued',
    })
    setTimeout(() => { setDone(null); setPicked(null); setPin('') }, 3500)
  }

  const submit = async (p: string) => {
    if (!picked || busy) return
    setBusy(true)
    const key = newIdempotencyKey()
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { punchOffline(picked, p, key); return }
      const r = await hrSend<{ action: 'in' | 'out'; name: string; late?: boolean; lateMinutes?: number }>(
        '/api/hr/kiosk', 'POST', { employeeId: picked.id, pin: p }, { key, timeoutMs: 8000 },
      )
      setDone(
        r.action === 'out'
          ? { text: `تم تسجيل انصرافك يا ${r.name}`, tone: 'ok' }
          : r.late
            ? { text: `تم تسجيل حضورك يا ${r.name} (متأخر ${r.lateMinutes} دقيقة)`, tone: 'late' }
            : { text: `تم تسجيل حضورك يا ${r.name}`, tone: 'ok' },
      )
      setTimeout(() => { setDone(null); setPicked(null); setPin(''); load() }, 2500)
    } catch (e: any) {
      if (e instanceof HrNetworkError) { punchOffline(picked, p, key); return }
      toast.error(e?.message || 'فشل التسجيل')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-warning text-warning-foreground">
              <MonitorSmartphone className="size-4" />
            </span>
            كشك الحضور
          </DialogTitle>
          <DialogDescription>اختار اسمك واكتب الـ PIN. أول مرة النهارده = حضور، وبعدها = انصراف.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {offline && !done && (
            <p className="mb-3 rounded-xl bg-sky-500/10 px-3 py-2 text-sm font-bold text-sky-700">
              مفيش اتصال — تقدر تسجّل عادي، والتسجيلات هتتبعت لما النت يرجع.
            </p>
          )}
          {!done && <KioskQueueBanner />}
          {done ? (
            <div className={cn('rounded-2xl p-10 text-center text-xl font-extrabold', done.tone === 'late' ? 'bg-amber-500/10 text-amber-700' : done.tone === 'queued' ? 'bg-sky-500/10 text-sky-700' : 'bg-emerald-500/10 text-emerald-700')}>
              {done.text}
            </div>
          ) : !picked ? (
            items === null ? (
              <ListSkeleton rows={3} />
            ) : items.length === 0 ? (
              <EmptyState title="مفيش موظفين" />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((raw) => { const e = effective(raw); const inProgress = !!e.checkIn && !e.checkOut
                  return (
                  <button
                    key={e.id} type="button" disabled={!e.hasPin}
                    onClick={() => { setPicked(raw); setPin('') }}
                    className={cn(
                      'rounded-2xl border bg-card p-3 text-start transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
                      inProgress && 'border-emerald-500/50 bg-emerald-500/[0.06]',
                    )}
                  >
                    <div className="truncate font-bold">{e.name}</div>
                    <div className={cn('mt-1 flex items-center gap-1.5 text-xs', inProgress ? 'font-bold text-emerald-600' : 'text-muted-foreground')}>
                      {inProgress && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
                      {!e.hasPin ? 'بدون PIN' : e.checkOut ? 'انصرف ✓' : e.checkIn ? 'حاضر — سجّل انصراف' : 'اضغط لتسجيل الحضور'}
                    </div>
                  </button>
                ) })}
              </div>
            )
          ) : (
            <div className="mx-auto max-w-xs text-center">
              <div className="mb-1 text-lg font-extrabold">{picked.name}</div>
              <div className="mb-4 flex justify-center gap-2" dir="ltr" aria-label="PIN">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <span key={i} className={cn('size-3.5 rounded-full border transition-all', i < pin.length ? 'scale-110 border-warning bg-warning' : 'bg-muted')} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <Button key={d} variant="outline" className="h-14 text-xl font-bold" onClick={() => press(d)}>{d}</Button>
                ))}
                <Button variant="ghost" className="h-14" onClick={() => { setPicked(null); setPin('') }}>رجوع</Button>
                <Button variant="outline" className="h-14 text-xl font-bold" onClick={() => press('0')}>0</Button>
                <Button variant="ghost" className="h-14" aria-label="مسح" onClick={() => setPin((p) => p.slice(0, -1))}><Delete className="size-5" /></Button>
              </div>
              <Button className="mt-3 h-12 w-full gap-1.5 text-base" disabled={pin.length < 4 || busy} onClick={() => submit(pin)}>
                {busy && <Loader2 className="size-4 animate-spin" />}تأكيد
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
