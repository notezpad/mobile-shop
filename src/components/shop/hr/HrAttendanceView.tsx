'use client'

import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Delete, Loader2, MonitorSmartphone, UserCheck, Users, Clock, CalendarX, Plane, User, UserRound, Briefcase, Plus, Minus } from 'lucide-react'
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
  DAY_NAMES, EmptyState, ListSkeleton, Panel, Pill, dayLabel, hrGet, hrSend,
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

const isFemaleName = (name: string) => {
  const n = name.trim();
  if (!n) return false;
  if (/[ةى]$/.test(n) || /[اء]$/.test(n)) return true;
  const femaleNames = ['مريم', 'سارة', 'نور', 'هند', 'زينب', 'رنا', 'ريم', 'لينا', 'جنى', 'حبيبة', 'ملك', 'ياسمين', 'دينا', 'نهى', 'منى', 'سلمى', 'ليلى', 'شروق', 'أمل', 'إيمان', 'هدى', 'رؤى', 'آية', 'إسراء', 'هبة', 'شيماء', 'بسمة', 'عبير', 'سماح', 'نادية', 'نرمين', 'سمر', 'رغد', 'رهف', 'جواهر', 'فاطمة', 'عائشة', 'خديجة'];
  return femaleNames.some(fn => n.includes(fn));
};

const AVATAR_THEMES = [
  { bg: 'from-emerald-400 to-teal-600', shadow: 'shadow-emerald-500/30' },
  { bg: 'from-sky-400 to-blue-600', shadow: 'shadow-sky-500/30' },
  { bg: 'from-violet-400 to-purple-600', shadow: 'shadow-violet-500/30' },
  { bg: 'from-rose-400 to-pink-600', shadow: 'shadow-rose-500/30' },
  { bg: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/30' },
]

const STATUS_STYLE: Record<HrStatus, string> = {
  present: 'bg-emerald-500 text-white border-emerald-600 shadow-[0_4px_0_rgb(4,120,87)] active:translate-y-[4px] active:shadow-none',
  late: 'bg-amber-500 text-white border-amber-600 shadow-[0_4px_0_rgb(180,83,9)] active:translate-y-[4px] active:shadow-none',
  absent: 'bg-rose-500 text-white border-rose-600 shadow-[0_4px_0_rgb(159,18,57)] active:translate-y-[4px] active:shadow-none',
  leave: 'bg-sky-500 text-white border-sky-600 shadow-[0_4px_0_rgb(7,89,133)] active:translate-y-[4px] active:shadow-none',
}

const STATUSES: HrStatus[] = ['present', 'late', 'absent', 'leave']

export function HrAttendanceView() {
  const [data, setData] = React.useState<MonthData | null>(null)
  const [date, setDate] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [kiosk, setKiosk] = React.useState(false)
  const [filterMode, setFilterMode] = React.useState<'all' | 'pending'>('all')

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

  React.useEffect(() => {
    if (data && date && date.slice(0, 7) !== data.month) load(date.slice(0, 7))
  }, [date, data, load])

  const recMap = React.useMemo(() => {
    const m = new Map<string, Rec>()
    data?.records.forEach((r) => m.set(`${r.employeeId}|${r.date}`, r))
    return m
  }, [data])

  const today = data?.today ?? ''
  const allEmps = (data?.employees ?? []).filter((e) => e.hireDate <= date)
  
  const emps = allEmps.filter((e) => {
    if (filterMode === 'all') return true
    const r = recMap.get(`${e.id}|${date}`)
    return !r && weekdayOf(date) !== e.weeklyOffDay
  })

  const send = async (records: { employeeId: number; date: string; status: HrStatus | null; lateMinutes?: number }[]) => {
    if (!data) return
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
    if (todo.length === 0) return toast.info('كل الموظفين المعروضين متسجّلين بالفعل')
    send(todo)
    toast.success(`تم تسجيل ${todo.length} حاضر`)
  }

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { present: 0, late: 0, absent: 0, leave: 0 }
    allEmps.forEach((e) => {
      const r = recMap.get(`${e.id}|${date}`)
      if (r) c[r.status]++
    })
    return c
  }, [allEmps, recMap, date])

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
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <KioskQueueBanner />

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-emerald-300/30 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <Clock className="size-3.5 text-white" />
                <span className="text-xs font-bold text-white">السجل اليومي</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">الحضور والانصراف</h1>
              <p className="mt-3 text-sm leading-relaxed text-emerald-50/90 sm:text-base">
                سجل يومي بكل موظف — منه بيتحدد أيام الشغل في الرواتب.
              </p>
            </div>

            <div className="z-10 flex flex-wrap gap-3">
              <Button 
                onClick={() => setKiosk(true)} 
                className="bg-white text-emerald-700 font-bold hover:bg-emerald-50 hover:text-emerald-800 shadow-[0_6px_0_rgb(167,243,208)] hover:shadow-[0_2px_0_rgb(167,243,208)] hover:translate-y-[4px] transition-all gap-1.5"
              >
                <MonitorSmartphone className="size-4" />كشك الحضور (PIN)
              </Button>
            </div>
          </div>
        </section>

        {loading || !data || !date ? (
          <ListSkeleton />
        ) : data.employees.length === 0 ? (
          <EmptyState theme="attendance" icon={Users} title="مفيش موظفين لسه" hint="ضيف الموظفين الأول من شاشة الموظفين." />
        ) : (
          <>
            {/* ================= شريط التاريخ + الفلتر ================= */}
            <div className="flex flex-col xl:flex-row items-center gap-3 p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800/60" dir="rtl">
              
              <div className="flex items-center gap-2 w-full xl:w-auto">
                <Button variant="outline" size="icon" aria-label="اليوم السابق" onClick={() => setDate(addDaysStr(date, -1))} className="shadow-sm hover:bg-slate-50">
                  <ChevronRight className="size-4" />
                </Button>
                <div className="flex-1 min-w-[140px] text-center">
                  <div className="truncate font-black text-lg text-slate-800 dark:text-slate-100">{dayLabel(date)}</div>
                  {date === today && <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-1">النهارده</div>}
                </div>
                <Button variant="outline" size="icon" aria-label="اليوم التالي" disabled={date >= today} onClick={() => setDate(addDaysStr(date, 1))} className="shadow-sm hover:bg-slate-50">
                  <ChevronLeft className="size-4" />
                </Button>
                <Input
                  type="date" value={date} max={today} dir="ltr" className="w-[130px] bg-slate-50 border-none shadow-inner"
                  onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)}
                />
              </div>

              <div className="flex-1 flex justify-center gap-2">
                <button 
                  onClick={() => setFilterMode('all')}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                    filterMode === 'all' 
                      ? "bg-slate-800 text-white border-slate-800 shadow-sm" 
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  الكل ({allEmps.length})
                </button>
                <button 
                  onClick={() => setFilterMode('pending')}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                    filterMode === 'pending' 
                      ? "bg-amber-500 text-white border-amber-500 shadow-sm" 
                      : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  )}
                >
                  محتاجين تسجيل
                </button>
              </div>

              <Button onClick={presentAll} disabled={busy || emps.length === 0} className="w-full xl:w-auto gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_0_rgb(4,120,87)] hover:shadow-[0_2px_0_rgb(4,120,87)] hover:translate-y-[2px] transition-all">
                <UserCheck className="size-4" />تسجيل حضور للكل
              </Button>
            </div>

            {/* ================= كروت عدادات اليوم ================= */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'حاضر', val: counts.present, icon: UserCheck, grad: 'from-emerald-400 to-emerald-600', shadow: 'shadow-emerald-500/30' },
                { label: 'متأخر', val: counts.late, icon: Clock, grad: 'from-amber-400 to-amber-600', shadow: 'shadow-amber-500/30' },
                { label: 'غائب', val: counts.absent, icon: CalendarX, grad: 'from-rose-400 to-rose-600', shadow: 'shadow-rose-500/30' },
                { label: 'إجازة', val: counts.leave, icon: Plane, grad: 'from-sky-400 to-sky-600', shadow: 'shadow-sky-500/30' },
              ].map((item, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between hover:-translate-y-1 transition-transform">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-500">{item.label}</span>
                    <span className="text-2xl font-black">{item.val}</span>
                  </div>
                  <span className={cn("grid size-10 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br", item.grad, item.shadow)}>
                    <item.icon className="size-5 drop-shadow-md" />
                  </span>
                </div>
              ))}
            </div>

            {/* ================= قائمة الموظفين (كروت 2026) ================= */}
            {emps.length === 0 ? (
               <EmptyState theme="attendance" icon={UserCheck} title="كل الموظفين متسجلين" hint="مفيش حد محتاج تسجيل في اليوم ده." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {emps.map((e, index) => {
                  const r = recMap.get(`${e.id}|${date}`)
                  const isOff = weekdayOf(date) === e.weeklyOffDay
                  const isFemale = isFemaleName(e.name)
                  const theme = AVATAR_THEMES[index % AVATAR_THEMES.length]

                  return (
                    <div key={e.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-1" dir="rtl">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("grid size-12 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg shrink-0", theme.bg, theme.shadow)}>
                            {isFemale ? <UserRound className="size-6 drop-shadow-md" strokeWidth={2} /> : <User className="size-6 drop-shadow-md" strokeWidth={2} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-base text-slate-800 dark:text-slate-100">{e.name}</span>
                              {isOff && !r && <Pill tone="slate">إجازة</Pill>}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                              <Briefcase className="size-3" />
                              <span>{e.jobTitle || 'موظف'}</span>
                            </div>
                          </div>
                        </div>

                        {(r?.checkIn || r?.checkOut) && (
                          <div className="text-left">
                            <span className="inline-flex flex-col gap-1 items-end">
                              {r.checkIn && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">دخول {timeOf(r.checkIn)}</span>}
                              {r.checkOut && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">خروج {timeOf(r.checkOut)}</span>}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {STATUSES.map((s) => (
                          <button
                            key={s} type="button" onClick={() => setStatus(e, s)}
                            className={cn(
                              'min-h-[38px] rounded-xl border px-2 text-sm font-bold transition-all duration-200',
                              r?.status === s 
                                ? STATUS_STYLE[s] 
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 shadow-[0_2px_0_rgb(226,232,240)] active:translate-y-[2px] active:shadow-none'
                            )}
                          >
                            {HR_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>

                      {r?.status === 'late' && (
                        <div className="mt-3 pt-3 border-t border-dashed">
                          <LateMinutes
                            value={r.lateMinutes}
                            onCommit={(v) => send([{ employeeId: e.id, date, status: 'late', lateMinutes: v }])}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ================= ملخص الشهر (تم تعديل الهيدر) ================= */}
            <div className="mt-8">
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="size-5 text-emerald-600" />
                <h2 className="text-lg font-black">ملخص شهر {data.month}</h2>
              </div>
              <Panel className="bg-white dark:bg-slate-900 border-none shadow-md rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-sm text-center">
                    {/* الهيدر الجديد بلون أخضر وبوردر سفلي */}
                    <thead className="bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 border-b-2 border-emerald-500/20">
                      <tr>
                        <th className="px-4 py-3 text-start font-bold">الموظف</th>
                        <th className="px-4 py-3 font-bold">غياب</th>
                        <th className="px-4 py-3 font-bold">إجازات</th>
                        <th className="px-4 py-3 font-bold">أيام تأخير</th>
                        <th className="px-4 py-3 font-bold">دقائق تأخير</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {summary.map((s) => (
                        <tr key={s.id} className="transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10">
                          <td className="px-4 py-3 font-bold text-start">{s.name}</td>
                          <td className={cn('px-4 py-3 tabular-nums', s.absent > 0 && 'font-bold text-rose-600')}>{s.absent}</td>
                          <td className="px-4 py-3 tabular-nums">{s.leave}</td>
                          <td className={cn('px-4 py-3 tabular-nums', s.lateDays > 0 && 'font-bold text-amber-600')}>{s.lateDays}</td>
                          <td className="px-4 py-3 tabular-nums">{s.lateMin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>

      {kiosk && <KioskDialog onClose={() => { setKiosk(false); load(date ? date.slice(0, 7) : undefined) }} />}
    </div>
  )
}

function LateMinutes({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = React.useState(String(value))
  React.useEffect(() => setV(String(value)), [value])
  
  const commit = (newVal: number) => {
    const n = Math.max(0, Math.min(600, Math.floor(newVal)))
    if (n !== value) onCommit(n)
    setV(String(n))
  }

  return (
    <div className="flex items-center justify-between gap-2 bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
      <span className="text-xs font-bold text-amber-700">دقائق التأخير</span>
      <div className="flex items-center gap-1 bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden" dir="ltr">
        <button type="button" onClick={() => commit(Number(v) - 5)} className="px-2 py-1 hover:bg-slate-100 text-slate-600 border-r border-amber-100"><Minus className="size-3" /></button>
        <Input
          type="number" inputMode="numeric" min={0} max={600} value={v} dir="ltr" className="h-7 w-12 border-none text-center font-bold text-sm focus-visible:ring-0"
          onChange={(e) => setV(e.target.value)} onBlur={() => commit(Number(v) || 0)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button type="button" onClick={() => commit(Number(v) + 5)} className="px-2 py-1 hover:bg-slate-100 text-slate-600 border-l border-amber-100"><Plus className="size-3" /></button>
      </div>
    </div>
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
    if (!queueAvailable()) { toast.error('مفيش اتصال، والتخزين على الجهاز غير متاح'); setPin(''); return }
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
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl bg-slate-50">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5 bg-white">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-emerald-500 text-white shadow-md">
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
            <div className={cn('rounded-2xl p-10 text-center text-xl font-extrabold shadow-sm', done.tone === 'late' ? 'bg-amber-100 text-amber-700' : done.tone === 'queued' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700')}>
              {done.text}
            </div>
          ) : !picked ? (
            items === null ? (
              <ListSkeleton rows={3} />
            ) : items.length === 0 ? (
              <EmptyState title="مفيش موظفين" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {items.map((raw) => { const e = effective(raw); return (
                  <button
                    key={e.id} type="button" disabled={!e.hasPin}
                    onClick={() => { setPicked(raw); setPin('') }}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition-all hover:border-emerald-500/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="truncate font-bold text-lg">{e.name}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {!e.hasPin ? 'بدون PIN' : e.checkOut ? 'انصرف' : e.checkIn ? 'حاضر — سجل انصراف' : 'اضغط لتسجيل الحضور'}
                    </div>
                  </button>
                ) })}
              </div>
            )
          ) : (
            <div className="mx-auto max-w-xs text-center bg-white p-6 rounded-3xl shadow-sm border">
              <div className="mb-2 text-2xl font-black">{picked.name}</div>
              <div className="mb-6 flex justify-center gap-2" dir="ltr" aria-label="PIN">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <span key={i} className={cn('size-4 rounded-full border-2 transition-colors', i < pin.length ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-100 border-slate-200')} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <Button key={d} variant="outline" className="h-14 text-2xl font-bold shadow-[0_4px_0_rgb(226,232,240)] active:translate-y-[4px] active:shadow-none" onClick={() => press(d)}>{d}</Button>
                ))}
                <Button variant="ghost" className="h-14 text-sm font-bold" onClick={() => { setPicked(null); setPin('') }}>رجوع</Button>
                <Button variant="outline" className="h-14 text-2xl font-bold shadow-[0_4px_0_rgb(226,232,240)] active:translate-y-[4px] active:shadow-none" onClick={() => press('0')}>0</Button>
                <Button variant="ghost" className="h-14" aria-label="مسح" onClick={() => setPin((p) => p.slice(0, -1))}><Delete className="size-6 text-slate-400" /></Button>
              </div>
              <Button className="mt-6 h-14 w-full gap-1.5 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_6px_0_rgb(4,120,87)] hover:shadow-[0_2px_0_rgb(4,120,87)] hover:translate-y-[4px] transition-all" disabled={pin.length < 4 || busy} onClick={() => submit(pin)}>
                {busy && <Loader2 className="size-5 animate-spin" />}تأكيد الحضور
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}