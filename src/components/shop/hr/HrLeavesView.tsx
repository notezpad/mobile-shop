'use client'

import * as React from 'react'
import { CalendarDays, CalendarPlus, Loader2, Undo2, Users, Plane, Stethoscope, Banknote, Clock, User, UserRound, Info, MessageSquareText, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, type LeaveType } from '@/lib/hr'
import { EmptyState, ListSkeleton, Panel, Pill, hrGet, hrSend } from './hr-ui'
import { cn } from '@/lib/utils'

interface Leave {
  id: number; employeeId: number; employeeName: string; type: LeaveType
  startDate: string; endDate: string; days: number; hours: number | null; note: string | null
}
interface Balance { employeeId: number; name: string; allowance: number; used: number; remaining: number }
interface Data { year: string; annualLeaveDays: number; items: Leave[]; balances: Balance[] }

const TONE: Record<LeaveType, 'emerald' | 'sky' | 'rose' | 'violet'> = {
  annual: 'emerald', sick: 'sky', unpaid: 'rose', permission: 'violet',
}

const LEAVE_ICONS: Record<LeaveType, React.ElementType> = {
  annual: Plane,
  sick: Stethoscope,
  unpaid: Banknote,
  permission: Clock,
}

const LEAVE_THEMES: Record<LeaveType, { bg: string, shadow: string }> = {
  annual: { bg: 'from-sky-400 to-blue-500', shadow: 'shadow-sky-500/30' },
  sick: { bg: 'from-rose-400 to-red-500', shadow: 'shadow-rose-500/30' },
  unpaid: { bg: 'from-slate-400 to-slate-600', shadow: 'shadow-slate-500/30' },
  permission: { bg: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/30' },
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
    if (!window.confirm('هل أنت متأكد من إلغاء هذه الإجازة؟ سيتم إرجاع الأيام للحضور والرصيد.')) return
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

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو (أزرق سماوي 3D) ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-sky-500 via-cyan-600 to-teal-600 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-cyan-300/30 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <CalendarDays className="size-3.5 text-white" />
                <span className="text-xs font-bold text-white">إدارة الوقت</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">
                الإجازات و<span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">الأذونات</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-cyan-50/90 sm:text-base">
                إجازات وأذونات الفريق — بتتزامن مع الحضور والأرصدة تلقائيًا.
              </p>
            </div>

            <div className="z-10 flex flex-wrap gap-3">
              <Button 
                onClick={() => setAdding(true)} 
                className="bg-white text-cyan-700 font-bold hover:bg-cyan-50 hover:text-cyan-800 shadow-[0_6px_0_rgb(207,250,254)] hover:shadow-[0_2px_0_rgb(207,250,254)] hover:translate-y-[4px] transition-all gap-1.5"
              >
                <CalendarPlus className="size-4" />إجازة / إذن جديد
              </Button>
            </div>
          </div>
        </section>

        {loading || !data ? (
          <ListSkeleton />
        ) : (
          <>
            {/* ================= الإحصائيات (Bento) ================= */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500">رصيد سنوي لكل موظف</span>
                  <span className="text-2xl font-black">{data.annualLeaveDays} <span className="text-sm text-slate-400">يوم</span></span>
                </div>
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-cyan-400 to-cyan-600 shadow-cyan-500/30">
                  <CalendarDays className="size-5 drop-shadow-md" />
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500">أيام مستخدمة</span>
                  <span className="text-2xl font-black text-cyan-600">{totalUsed} <span className="text-sm text-slate-400">يوم</span></span>
                </div>
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-sky-400 to-blue-600 shadow-sky-500/30">
                  <Plane className="size-5 drop-shadow-md" />
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500">تجاوزوا الرصيد</span>
                  <span className={cn("text-2xl font-black", overdrawn > 0 ? "text-rose-600" : "text-emerald-600")}>
                    {overdrawn} <span className="text-sm text-slate-400">موظف</span>
                  </span>
                </div>
                <span className={cn("grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br", overdrawn > 0 ? "from-rose-400 to-rose-600 shadow-rose-500/30" : "from-emerald-400 to-emerald-600 shadow-emerald-500/30")}>
                  <Users className="size-5 drop-shadow-md" />
                </span>
              </div>
            </div>

            {/* ================= أرصدة الموظفين ================= */}
            {data.balances.length > 0 && (
              <section>
                <h2 className="text-lg font-black mb-4 flex items-center gap-2">
                  <Users className="size-5 text-cyan-600" /> رصيد الإجازة السنوية {data.year}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.balances.map((b) => {
                    const pct = b.allowance > 0 ? Math.min(100, (b.used / b.allowance) * 100) : 0
                    return (
                      <div key={b.employeeId} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:-translate-y-1 transition-transform">
                        <div className="flex items-baseline justify-between gap-2 mb-3">
                          <span className="truncate font-bold text-slate-800 dark:text-slate-100">{b.name}</span>
                          <span className={cn("text-sm font-black tabular-nums", b.remaining < 0 ? 'text-rose-600' : 'text-cyan-600')}>
                            متبقي {b.remaining} <span className="text-xs text-slate-400 font-semibold">من {b.allowance}</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 shadow-inner">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-1000", b.remaining < 0 ? 'bg-rose-500' : 'bg-gradient-to-r from-cyan-400 to-sky-500')} 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* ================= سجل الإجازات (كروت 2026) ================= */}
            <section>
              <h2 className="text-lg font-black mb-4 flex items-center gap-2">
                <CalendarDays className="size-5 text-cyan-600" /> سجل الإجازات والأذونات
              </h2>
              {data.items.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm py-12 px-4 text-center">
                  <div className="mx-auto size-16 rounded-2xl bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center mb-4">
                    <CalendarDays className="size-8 text-cyan-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">مفيش إجازات متسجلة السنة دي</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">سجّل إجازة أو إذن جديد — بيظهر في الحضور والرواتب تلقائي.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.items.map((l) => {
                    const Icon = LEAVE_ICONS[l.type]
                    const theme = LEAVE_THEMES[l.type]
                    return (
                      <div key={l.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col transition-all hover:shadow-md hover:-translate-y-1" dir="rtl">
                        
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={cn("grid size-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md shrink-0", theme.bg, theme.shadow)}>
                              <Icon className="size-5 drop-shadow-sm" strokeWidth={2} />
                            </div>
                            <div>
                              <span className="font-black text-base text-slate-800 dark:text-slate-100 block">{l.employeeName}</span>
                              <div className="mt-1">
                                <Pill tone={TONE[l.type]}>{LEAVE_TYPE_LABEL[l.type]}</Pill>
                              </div>
                            </div>
                          </div>
                          
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={busyId === l.id} 
                            onClick={() => cancel(l.id)} 
                            className="h-8 gap-1 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          >
                            {busyId === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}إلغاء
                          </Button>
                        </div>

                        <div className="space-y-2 mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-500">الفترة</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 px-2 py-0.5 rounded-md" dir="rtl">
                              {l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} ← ${fmt(l.endDate)}`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-500">المدة</span>
                            <span className="font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-md">
                              {l.type === 'permission' ? `${l.hours} ساعة` : `${l.days} يوم عمل`}
                            </span>
                          </div>
                          {l.note && (
                            <div className="flex items-start justify-between text-xs mt-1 pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
                              <span className="font-bold text-slate-500">ملاحظة</span>
                              <span className="text-slate-600 dark:text-slate-400 text-left truncate max-w-[150px]">{l.note}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {adding && <LeaveDialog balances={data?.balances ?? []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
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

  const TypeIcon = LEAVE_ICONS[type]
  const typeTheme = LEAVE_THEMES[type]
  const isPerm = type === 'permission'
  // مدة تقريبية بالأيام التقويمية (السيرفر بيتخطى الراحة الأسبوعية وقت الحفظ)
  const spanDays = !isPerm && start && (end || start) >= start
    ? Math.round((new Date(`${end || start}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86400000) + 1
    : 0
  const SEC = 'relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 pt-5 shadow-[0_5px_0_rgba(15,23,42,0.06),0_14px_24px_-14px_rgba(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900'
  const FIELD = 'h-11 rounded-xl border-slate-200 bg-slate-50 text-sm font-semibold shadow-inner dark:border-slate-700 dark:bg-slate-800/50'
  const lbl = 'mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden border-0 bg-slate-50 p-0 dark:bg-slate-950 sm:max-w-lg" dir="rtl">
        {/* ================= الهيدر: نفس هيرو صفحة الإجازات ================= */}
        <DialogHeader className="relative shrink-0 gap-0 overflow-hidden bg-gradient-to-br from-sky-500 via-cyan-600 to-teal-600 px-4 pb-5 pt-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] sm:px-6 sm:pt-6">
          <div aria-hidden className="absolute -top-24 -right-24 size-64 rounded-full bg-white/25 blur-[60px]" />
          <div aria-hidden className="absolute -bottom-24 -left-24 size-56 rounded-full bg-teal-300/30 blur-[60px]" />
          <div className="relative flex items-center gap-4">
            <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[22px] border border-t-white/50 border-l-white/30 border-b-black/20 border-r-black/10 bg-gradient-to-br from-white/35 to-white/10 text-white shadow-[0_14px_28px_rgba(0,0,0,0.3),inset_0_2px_8px_rgba(255,255,255,0.45)] ring-1 ring-white/30 backdrop-blur-md">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <CalendarPlus className="relative size-8 drop-shadow-lg" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur-md">
                <CalendarDays className="size-3" />
                إدارة الوقت
              </div>
              <DialogTitle className="truncate text-xl font-extrabold leading-tight drop-shadow-md sm:text-2xl">إجازة / إذن جديد</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-cyan-50/90">أيام الإجازة الأسبوعية بتتخطى تلقائي.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6">
          {/* الموظف */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-emerald-400 to-emerald-600" />
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/35 ring-1 ring-inset ring-white/25">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <User className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
              </span>
              <h3 className="text-[15px] font-black">الموظف</h3>
            </div>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className={cn(FIELD, 'w-full')}><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>{balances.map((b) => <SelectItem key={b.employeeId} value={String(b.employeeId)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
            {type === 'annual' && bal ? (() => {
              const pct = bal.allowance > 0 ? Math.min(100, Math.round((bal.used / bal.allowance) * 100)) : 0
              const out = bal.remaining <= 0
              return (
                <div className={cn('mt-3 rounded-xl border px-3.5 py-3', out ? 'border-rose-500/30 bg-rose-500/10' : 'border-cyan-500/25 bg-cyan-500/10')}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">رصيده المتبقي</span>
                    <span className={cn('text-2xl font-black tabular-nums', out ? 'text-rose-600' : 'text-cyan-700 dark:text-cyan-300')}>{bal.remaining} <span className="text-xs font-bold">يوم من {bal.allowance}</span></span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70 ring-1 ring-inset ring-black/5 dark:bg-slate-800">
                    <div className={cn('h-full rounded-full bg-gradient-to-l transition-all', out ? 'from-rose-400 to-rose-600' : 'from-cyan-400 to-sky-500')} style={{ width: `${pct}%` }} />
                  </div>
                  {out ? <p className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-300">هيتخطى الرصيد السنوي.</p> : null}
                </div>
              )
            })() : null}
          </section>

          {/* النوع — 4 كروت 3D */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-sky-400 to-blue-600" />
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/25', typeTheme.bg, typeTheme.shadow)}>
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <TypeIcon className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
              </span>
              <h3 className="text-[15px] font-black">النوع</h3>
            </div>
            <div role="radiogroup" aria-label="نوع الإجازة" className="grid grid-cols-2 gap-2.5">
              {LEAVE_TYPES.map((t) => {
                const Ic = LEAVE_ICONS[t]
                const th = LEAVE_THEMES[t]
                const on = type === t
                return (
                  <button
                    key={t} type="button" role="radio" aria-checked={on}
                    onClick={() => setType(t)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-start transition-all active:translate-y-[3px] active:shadow-none',
                      on
                        ? 'border-cyan-500 bg-cyan-50 shadow-[0_4px_0_rgb(8,145,178)] dark:bg-cyan-950/30'
                        : 'border-slate-200 bg-white shadow-[0_4px_0_rgb(226,232,240)] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_4px_0_rgb(15,23,42)]',
                    )}
                  >
                    <span className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br text-white shadow-md ring-1 ring-inset ring-white/25', th.bg, th.shadow, !on && 'opacity-80')}>
                      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                      <Ic className="relative size-[18px] drop-shadow" strokeWidth={2.3} />
                    </span>
                    <span className={cn('text-[13px] font-extrabold leading-tight', on ? 'text-cyan-800 dark:text-cyan-200' : 'text-slate-700 dark:text-slate-200')}>{LEAVE_TYPE_LABEL[t]}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* التواريخ */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-violet-400 to-violet-600" />
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-lg shadow-violet-500/35 ring-1 ring-inset ring-white/25">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <CalendarRange className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
              </span>
              <h3 className="text-[15px] font-black">{isPerm ? 'يوم الإذن ومدته' : 'الفترة'}</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <div>
                <label className={lbl}>{isPerm ? 'يوم الإذن' : 'من'}</label>
                <Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} className={FIELD} />
              </div>
              {isPerm ? (
                <div>
                  <label className={lbl}>عدد الساعات</label>
                  <Input type="number" inputMode="decimal" dir="ltr" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" className={cn(FIELD, 'tabular-nums')} />
                </div>
              ) : (
                <div>
                  <label className={lbl}>إلى</label>
                  <Input type="date" dir="ltr" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={FIELD} />
                </div>
              )}
            </div>
            {spanDays > 0 ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-700 dark:text-violet-300">
                <CalendarDays className="size-4 shrink-0" />
                المدة: {spanDays} {spanDays === 1 ? 'يوم' : 'يوم'} (قبل تخطي الراحة الأسبوعية)
              </p>
            ) : null}
            {isPerm ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                الإذن سجل متابعة فقط ومالوش أثر على الراتب.
              </p>
            ) : null}
          </section>

          {/* ملاحظة */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-amber-400 to-amber-600" />
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/35 ring-1 ring-inset ring-white/25">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <MessageSquareText className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
              </span>
              <h3 className="text-[15px] font-black">ملاحظة <span className="text-[11px] font-medium text-muted-foreground">(اختياري)</span></h3>
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الإجازة أو أي تفاصيل..." className={FIELD} />
          </section>
        </DialogBody>

        <DialogFooter className="shrink-0 flex-row justify-end gap-3 border-t bg-background px-4 py-3.5 sm:px-6">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-xl px-6 font-bold shadow-[0_4px_0_rgba(15,23,42,0.08)] transition-all hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(15,23,42,0.08)]">إلغاء</Button>
          <Button
            onClick={save} disabled={saving}
            className="h-11 gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 px-8 font-extrabold text-white shadow-[0_5px_0_rgb(8,116,144)] transition-all hover:translate-y-[3px] hover:from-sky-500 hover:to-cyan-600 hover:shadow-[0_2px_0_rgb(8,116,144)] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
            {isPerm ? 'تسجيل الإذن' : 'تسجيل الإجازة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
