'use client'

import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Delete, Loader2, MonitorSmartphone, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import { HR_STATUS_LABEL, addDaysStr, weekdayOf, type HrStatus } from '@/lib/hr'
import { DAY_NAMES, EmptyState, ListSkeleton, PageHead, PageShell, Pill, dayLabel, hrGet, hrSend } from './hr-ui'

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

const STATUS_STYLE: Record<HrStatus, string> = {
  present: 'bg-emerald-600 text-white border-emerald-600',
  late: 'bg-amber-500 text-white border-amber-500',
  absent: 'bg-rose-600 text-white border-rose-600',
  leave: 'bg-sky-600 text-white border-sky-600',
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

  const summary = React.useMemo(() => {
    if (!data) return []
    return data.employees.map((e) => {
      const rs = data.records.filter((r) => r.employeeId === e.id)
      const lateRs = rs.filter((r) => r.status === 'late')
      return {
        id: e.id, name: e.name,
        absent: rs.filter((r) => r.status === 'absent').length,
        leave: rs.filter((r) => r.status === 'leave').length,
        lateDays: lateRs.length,
        lateMin: lateRs.reduce((s, r) => s + r.lateMinutes, 0),
      }
    })
  }, [data])

  const timeOf = (iso: string | null) =>
    iso && data
      ? new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', timeZone: data.tz })
      : null

  return (
    <PageShell>
      <PageHead
        title="الحضور والانصراف"
        subtitle="اضغط على حالة كل موظف. اللي ملوش حالة بيتحسب حاضر."
        actions={
          <Button variant="outline" onClick={() => setKiosk(true)} className="gap-1.5">
            <MonitorSmartphone className="size-4" />كشك الحضور (PIN)
          </Button>
        }
      />

      {loading || !data || !date ? (
        <ListSkeleton />
      ) : data.employees.length === 0 ? (
        <EmptyState title="مفيش موظفين لسه" hint="ضيف الموظفين الأول من شاشة الموظفين." />
      ) : (
        <>
          {/* شريط اليوم */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
            <Button variant="outline" size="icon" aria-label="اليوم السابق" onClick={() => setDate(addDaysStr(date, -1))}>
              <ChevronRight className="size-4" />
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate font-extrabold">{dayLabel(date)}</div>
              {date === today && <div className="text-xs text-emerald-600">النهارده</div>}
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

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Pill tone="emerald">حاضر {counts.present}</Pill>
            <Pill tone="amber">متأخر {counts.late}</Pill>
            <Pill tone="rose">غائب {counts.absent}</Pill>
            <Pill tone="sky">إجازة {counts.leave}</Pill>
          </div>

          <ul className="space-y-2">
            {emps.map((e) => {
              const r = recMap.get(`${e.id}|${date}`)
              const isOff = weekdayOf(date) === e.weeklyOffDay
              return (
                <li key={e.id} className="rounded-2xl border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-[140px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{e.name}</span>
                        {isOff && !r && <Pill>إجازة أسبوعية ({DAY_NAMES[e.weeklyOffDay]})</Pill>}
                      </div>
                      {(r?.checkIn || r?.checkOut) && (
                        <p className="mt-0.5 text-xs text-muted-foreground" dir="rtl">
                          {r.checkIn && <>حضور {timeOf(r.checkIn)}</>}
                          {r.checkOut && <> · انصراف {timeOf(r.checkOut)}</>}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUSES.map((s) => (
                        <button
                          key={s} type="button" onClick={() => setStatus(e, s)}
                          className={cn(
                            'min-h-[38px] rounded-xl border px-3 text-sm font-bold transition-colors',
                            r?.status === s ? STATUS_STYLE[s] : 'bg-background text-foreground/70 hover:bg-muted',
                          )}
                        >
                          {HR_STATUS_LABEL[s]}
                        </button>
                      ))}
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

          {/* ملخص الشهر */}
          <div className="mt-8">
            <h2 className="mb-2 flex items-center gap-2 text-base font-extrabold">
              <CalendarDays className="size-4" />ملخص شهر {data.month}
            </h2>
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[460px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-bold">الموظف</th>
                    <th className="px-3 py-2 text-center font-bold">غياب</th>
                    <th className="px-3 py-2 text-center font-bold">إجازات</th>
                    <th className="px-3 py-2 text-center font-bold">أيام تأخير</th>
                    <th className="px-3 py-2 text-center font-bold">دقائق تأخير</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2 font-semibold">{s.name}</td>
                      <td className={cn('px-3 py-2 text-center tabular-nums', s.absent > 0 && 'font-bold text-rose-600')}>{s.absent}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.leave}</td>
                      <td className={cn('px-3 py-2 text-center tabular-nums', s.lateDays > 0 && 'font-bold text-amber-600')}>{s.lateDays}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{s.lateMin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {kiosk && <KioskDialog onClose={() => { setKiosk(false); load(date ? date.slice(0, 7) : undefined) }} />}
    </PageShell>
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
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      دقيقة
      <Input
        type="number" inputMode="numeric" min={0} max={600} value={v} dir="ltr" className="h-9 w-20"
        onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
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
  const [done, setDone] = React.useState<{ text: string; tone: 'ok' | 'late' } | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await hrGet<{ items: KioskItem[] }>('/api/hr/kiosk')
      setItems(d.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الموظفين')
      setItems([])
    }
  }, [])
  React.useEffect(() => { load() }, [load])

  const submit = async (p: string) => {
    if (!picked || busy) return
    setBusy(true)
    try {
      const r = await hrSend<{ action: 'in' | 'out'; name: string; late?: boolean; lateMinutes?: number }>(
        '/api/hr/kiosk', 'POST', { employeeId: picked.id, pin: p },
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
          <DialogTitle>كشك الحضور</DialogTitle>
          <DialogDescription>اختار اسمك واكتب الـ PIN. أول مرة النهارده = حضور، وبعدها = انصراف.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {done ? (
            <div className={cn('rounded-2xl p-10 text-center text-xl font-extrabold', done.tone === 'late' ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700')}>
              {done.text}
            </div>
          ) : !picked ? (
            items === null ? (
              <ListSkeleton rows={3} />
            ) : items.length === 0 ? (
              <EmptyState title="مفيش موظفين" />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((e) => (
                  <button
                    key={e.id} type="button" disabled={!e.hasPin}
                    onClick={() => { setPicked(e); setPin('') }}
                    className="rounded-2xl border bg-card p-3 text-start transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="truncate font-bold">{e.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {!e.hasPin ? 'بدون PIN' : e.checkOut ? 'انصرف' : e.checkIn ? 'حاضر — سجّل انصراف' : 'اضغط لتسجيل الحضور'}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="mx-auto max-w-xs text-center">
              <div className="mb-1 text-lg font-extrabold">{picked.name}</div>
              <div className="mb-4 flex justify-center gap-2" dir="ltr" aria-label="PIN">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <span key={i} className={cn('size-3.5 rounded-full border', i < pin.length ? 'bg-primary border-primary' : 'bg-muted')} />
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
