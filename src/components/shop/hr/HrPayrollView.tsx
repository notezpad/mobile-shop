'use client'

import * as React from 'react'
import {
  CalendarRange, Clock, FileSpreadsheet, Loader2, MessageCircle,
  RefreshCw, Settings2, Trash2, Wallet, Users, HandCoins, CheckCircle2, FileText, Copy
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'
import { useDataRefresh } from '@/lib/offline/data-events'
import {
  EmptyState, ListSkeleton, PAY_METHODS, hrGet, hrSend, money, monthLabel, shiftMonth,
} from './hr-ui'
import { cn } from '@/lib/utils'

interface RunLite { id: number; month: string; status: 'draft' | 'paid'; totalNet: number; count: number }
interface Slip {
  id: number; employeeId: number; employeeName: string; baseSalary: number; payableBase: number
  absentDays: number; absenceDeduction: number; lateMinutes: number; lateDeduction: number
  bonus: number; penalty: number; advanceDeduction: number; net: number; note: string | null
  unrecordedDays: number; pendingDays: number
  workedDays: number | null; expectedWorkDays: number | null
  phone: string | null
}
interface Run { id: number; month: string; status: 'draft' | 'paid'; totalNet: number; method: string | null; paidAt: string | null; payslips: Slip[] }

const r2 = (n: number) => Math.round(n * 100) / 100

const AVATAR_THEMES = [
  'from-blue-400 to-blue-600 shadow-blue-500/30',
  'from-indigo-400 to-indigo-600 shadow-indigo-500/30',
  'from-violet-400 to-violet-600 shadow-violet-500/30',
  'from-cyan-400 to-cyan-600 shadow-cyan-500/30',
]

export function HrPayrollView() {
  const [runs, setRuns] = React.useState<RunLite[]>([])
  const [currentMonth, setCurrentMonth] = React.useState('')
  const [month, setMonth] = React.useState('')
  const [run, setRun] = React.useState<Run | null>(null)
  const [edits, setEdits] = React.useState<Record<number, { bonus: string; penalty: string; note: string }>>({})
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [payOpen, setPayOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const shopName = useShopStore((s) => s.shopName)

  const loadRuns = React.useCallback(async () => {
    const d = await hrGet<{ currentMonth: string; items: RunLite[] }>('/api/hr/payroll')
    setRuns(d.items)
    setCurrentMonth(d.currentMonth)
    setMonth((m) => m || d.currentMonth)
    return d
  }, [])

  const loadRun = React.useCallback(async (id: number | null) => {
    if (!id) { setRun(null); setEdits({}); return }
    const d = await hrGet<Run>(`/api/hr/payroll/${id}`)
    setRun(d)
    setEdits(Object.fromEntries(d.payslips.map((p) => [p.id, { bonus: String(p.bonus || ''), penalty: String(p.penalty || ''), note: p.note ?? '' }])))
  }, [])

  const refresh = React.useCallback(async () => {
    try {
      const d = await loadRuns()
      const m = month || d.currentMonth
      await loadRun(d.items.find((r) => r.month === m)?.id ?? null)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الرواتب')
    } finally {
      setLoading(false)
    }
  }, [loadRuns, loadRun, month])

  React.useEffect(() => { refresh() }, [refresh])
  useDataRefresh(['hr'], () => { if (!busy) refresh() })

  const generate = async () => {
    setBusy(true)
    try {
      const r = await hrSend<{ id: number }>('/api/hr/payroll', 'POST', { month })
      toast.success('تم تجهيز الرواتب — راجعها واعتمدها')
      await loadRuns()
      await loadRun(r.id)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تجهيز الرواتب')
    } finally {
      setBusy(false)
    }
  }

  const dirty = run?.status === 'draft' && run.payslips.some((p) => {
    const e = edits[p.id]
    return e && (Number(e.bonus || 0) !== p.bonus || Number(e.penalty || 0) !== p.penalty || (e.note || '') !== (p.note ?? ''))
  })

  const saveEdits = async (silent = false) => {
    if (!run) return false
    setBusy(true)
    try {
      await hrSend(`/api/hr/payroll/${run.id}`, 'PUT', {
        payslips: run.payslips.map((p) => ({
          id: p.id, bonus: Number(edits[p.id]?.bonus || 0), penalty: Number(edits[p.id]?.penalty || 0), note: edits[p.id]?.note ?? '',
        })),
      })
      await loadRun(run.id)
      await loadRuns()
      if (!silent) toast.success('تم حفظ التعديلات')
      return true
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
      return false
    } finally {
      setBusy(false)
    }
  }

  const removeDraft = async () => {
    if (!run) return
    if (!window.confirm('هل أنت متأكد من حذف هذه المسودة؟ سيتم فقدان أي تعديلات غير محفوظة.')) return
    setBusy(true)
    try {
      await hrSend(`/api/hr/payroll/${run.id}`, 'DELETE')
      toast.success('تم حذف المسودة')
      setRun(null)
      await loadRuns()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setBusy(false)
    }
  }

  const exportExcel = () => {
    if (!run) return
    exportSimpleExcel({
      fileName: excelFileName(`رواتب-${run.month}`),
      shop: { name: shopName, phone: undefined, address: undefined },
      documentTitle: `كشف رواتب ${monthLabel(run.month)}`,
      sheetName: 'الرواتب',
      columns: [
        { header: 'الموظف', key: 'name', format: 'text' },
        { header: 'أيام الشغل', key: 'worked', format: 'text' },
        { header: 'الأساسي', key: 'base', format: 'currency' },
        { header: 'خصم غياب وبدون تسجيل', key: 'abs', format: 'currency' },
        { header: 'خصم تأخير', key: 'late', format: 'currency' },
        { header: 'حافز', key: 'bonus', format: 'currency' },
        { header: 'جزاء', key: 'penalty', format: 'currency' },
        { header: 'قسط سلفة', key: 'adv', format: 'currency' },
        { header: 'الصافي', key: 'net', format: 'currency' },
      ],
      rows: run.payslips.map((p) => ({
        name: p.employeeName,
        worked: p.workedDays !== null && p.expectedWorkDays !== null ? `${p.workedDays} من ${p.expectedWorkDays}` : '—',
        base: p.payableBase, abs: p.absenceDeduction, late: p.lateDeduction,
        bonus: p.bonus, penalty: p.penalty, adv: p.advanceDeduction, net: p.net,
      })),
      totals: { name: 'الإجمالي', net: run.totalNet },
    })
  }

  const pastRuns = runs.filter((r) => r.month !== month)

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-950 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-amber-500/20 blur-[100px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-blue-500/20 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <Wallet className="size-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-200">الإدارة المالية</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500">الرواتب</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-blue-100/80 sm:text-base">
                الصافي بيتحسب من أيام الشغل المسجّلة لكل موظف. راجع، عدّل، واعتمد.
              </p>
            </div>

            <div className="z-10 flex flex-wrap gap-3">
              <Button 
                variant="outline" 
                onClick={() => setSettingsOpen(true)} 
                className="border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white hover:border-white/30 gap-1.5 shadow-[0_4px_0_rgba(255,255,255,0.1)] hover:shadow-[0_2px_0_rgba(255,255,255,0.1)] hover:translate-y-[2px] transition-all"
              >
                <Settings2 className="size-4" />قواعد الحساب
              </Button>
            </div>
          </div>
        </section>

        {/* ================= اختيار الشهر ================= */}
        <div className="flex items-center justify-between p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800/60" dir="rtl">
          <Button variant="outline" size="icon" aria-label="الشهر السابق" onClick={() => setMonth(shiftMonth(month, -1))} className="shadow-sm hover:bg-slate-50">
            <CalendarRange className="size-4 rotate-180" />
          </Button>
          <div className="text-center text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <CalendarRange className="size-4 text-amber-500" />
            {month ? monthLabel(month) : '...'}
          </div>
          <Button variant="outline" size="icon" aria-label="الشهر التالي" disabled={!month || month >= currentMonth} onClick={() => setMonth(shiftMonth(month, 1))} className="shadow-sm hover:bg-slate-50">
            <CalendarRange className="size-4" />
          </Button>
        </div>

        {loading ? (
          <ListSkeleton />
        ) : !run ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm py-16 px-4 text-center" dir="rtl">
            <div className="mx-auto size-20 rounded-3xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mb-6 shadow-inner">
              <FileText className="size-10 text-blue-500" />
            </div>
            <h3 className="text-xl font-black text-slate-800 dark:text-slate-200">مفيش رواتب متجهزة لشهر {month ? monthLabel(month) : ''}</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">المسودة بتتجهّز تلقائياً من سجلات الحضور، الإجازات، والسلف. تقدر تراجعها وتعدلها قبل الاعتماد.</p>
            <Button onClick={generate} disabled={busy || !month} className="mt-6 gap-2 h-12 px-8 text-base bg-blue-600 hover:bg-blue-700 text-white shadow-[0_6px_0_rgb(30,58,138)] hover:shadow-[0_2px_0_rgb(30,58,138)] hover:translate-y-[4px] transition-all">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Wallet className="size-5" />}
              جهّز رواتب الشهر
            </Button>
          </div>
        ) : (
          <>
            {/* ================= الإحصائيات (Bento) ================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
              {/* حالة المسير */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center gap-4">
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br", run.status === 'paid' ? 'from-emerald-400 to-emerald-600 shadow-emerald-500/30' : 'from-amber-400 to-amber-600 shadow-amber-500/30')}>
                  {run.status === 'paid' ? <CheckCircle2 className="size-6 drop-shadow-md" /> : <FileText className="size-6 drop-shadow-md" />}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-500">حالة المسير</span>
                  <span className={cn("text-lg font-black mt-0.5", run.status === 'paid' ? 'text-emerald-600' : 'text-amber-600')}>
                    {run.status === 'paid' ? 'تم الصرف' : 'مسودة للمراجعة'}
                  </span>
                </div>
              </div>

              {/* عدد الموظفين */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-500/30">
                  <Users className="size-6 drop-shadow-md" />
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-500">عدد الموظفين</span>
                  <span className="text-xl font-black mt-0.5">{run.payslips.length} <span className="text-sm text-slate-400 font-semibold">موظف</span></span>
                </div>
              </div>

              {/* خصم السلف */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-500/30">
                  <HandCoins className="size-6 drop-shadow-md" />
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-500">خصم السلف</span>
                  <span className="text-xl font-black text-indigo-600 mt-0.5">{money(run.payslips.reduce((s, p) => s + p.advanceDeduction, 0))}</span>
                </div>
              </div>

              {/* إجمالي الصافي */}
              <div className="bg-gradient-to-br from-slate-900 to-black rounded-2xl border border-slate-800 p-5 shadow-lg flex items-center gap-4 text-white">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl text-slate-900 shadow-lg bg-gradient-to-br from-amber-300 to-yellow-500 shadow-amber-500/30">
                  <Wallet className="size-6 drop-shadow-md" />
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-400">إجمالي الصافي</span>
                  <span className="text-xl font-black text-amber-400 mt-0.5">{money(run.totalNet)}</span>
                </div>
              </div>
            </div>

            {/* ================= كروت الرواتب (Flex Layout to avoid stretching) ================= */}
            <div className="flex flex-wrap gap-5 justify-start" dir="rtl">
              {run.payslips.map((p, index) => {
                const e = edits[p.id] ?? { bonus: '', penalty: '', note: '' }
                const draft = run.status === 'draft'
                const initial = p.employeeName.trim().charAt(0) || '؟'
                const theme = AVATAR_THEMES[index % AVATAR_THEMES.length]

                return (
                  <div key={p.id} className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)] 2xl:w-[calc(25%-15px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col transition-all hover:shadow-md hover:-translate-y-1">
                    
                    {/* الرأس: الأفاتار والاسم والواتساب */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white font-black text-lg shadow-md", theme)}>
                          {initial}
                        </span>
                        <div>
                          <span className="font-bold text-lg text-slate-800 dark:text-slate-100 block">{p.employeeName}</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {p.workedDays === 0 && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">بدون شغل</span>}
                            {p.workedDays !== null && p.workedDays > 0 && p.unrecordedDays > 0 && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{p.unrecordedDays} بدون تسجيل</span>}
                            {p.pendingDays > 0 && <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">{p.pendingDays} يوم متبقي</span>}
                          </div>
                        </div>
                      </div>
                      <WhatsAppSlip slip={p} month={run.month} shop={shopName} />
                    </div>

                    {/* البيانات المالية (Bento Grid) */}
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-500">أيام الشغل</span>
                        <span className="font-black text-sm text-slate-800 dark:text-slate-200">
                          {p.workedDays !== null ? `${p.workedDays} من ${p.expectedWorkDays}` : '—'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-500">الأساسي</span>
                        <span className="font-black text-sm text-slate-800 dark:text-slate-200">{money(p.payableBase)}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-500">خصم غياب / تأخير</span>
                        <span className="font-bold text-sm text-rose-600">
                          {p.absenceDeduction + p.lateDeduction > 0 ? `- ${money(p.absenceDeduction + p.lateDeduction)}` : '—'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-500">قسط سلفة</span>
                        <span className="font-bold text-sm text-indigo-600">
                          {p.advanceDeduction > 0 ? `- ${money(p.advanceDeduction)}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* الحافز والجزاء (قابلين للتعديل) */}
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-emerald-600">حافز (اختياري)</Label>
                        {draft ? (
                          <Input 
                            type="number" inputMode="decimal" min={0} dir="ltr" 
                            className="h-10 w-full bg-emerald-50/50 border-emerald-200 text-emerald-800 font-bold shadow-inner focus-visible:ring-emerald-500 rounded-lg text-center text-sm" 
                            value={e.bonus}
                            onChange={(ev) => setEdits((s) => ({ ...s, [p.id]: { ...e, bonus: ev.target.value } }))} 
                            placeholder="0"
                          />
                        ) : (
                          <div className="h-10 w-full flex items-center justify-center rounded-lg bg-slate-50 text-slate-500 font-bold border border-slate-100 text-sm">
                            {p.bonus > 0 ? <span className="text-emerald-600">+ {money(p.bonus)}</span> : '—'}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-rose-600">جزاء (اختياري)</Label>
                        {draft ? (
                          <Input 
                            type="number" inputMode="decimal" min={0} dir="ltr" 
                            className="h-10 w-full bg-rose-50/50 border-rose-200 text-rose-800 font-bold shadow-inner focus-visible:ring-rose-500 rounded-lg text-center text-sm" 
                            value={e.penalty}
                            onChange={(ev) => setEdits((s) => ({ ...s, [p.id]: { ...e, penalty: ev.target.value } }))} 
                            placeholder="0"
                          />
                        ) : (
                          <div className="h-10 w-full flex items-center justify-center rounded-lg bg-slate-50 text-slate-500 font-bold border border-slate-100 text-sm">
                            {p.penalty > 0 ? <span className="text-rose-600">- {money(p.penalty)}</span> : '—'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* الصافي (الفوتر) */}
                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl">
                      <span className="text-sm font-bold text-slate-600">الصافي</span>
                      <span className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-lg font-black tabular-nums text-amber-400 shadow-sm">
                        {money(p.net)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ================= أزرار التحكم ================= */}
            <div className="mt-6 flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm" dir="rtl">
              {run.status === 'draft' ? (
                <>
                  <Button
                    onClick={async () => { if (!dirty || (await saveEdits(true))) setPayOpen(true) }}
                    disabled={busy} 
                    className="gap-2 h-11 px-6 text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_6px_0_rgb(4,120,87)] hover:shadow-[0_2px_0_rgb(4,120,87)] hover:translate-y-[4px] transition-all font-black"
                  >
                    <Wallet className="size-5" />اعتماد وصرف الرواتب
                  </Button>
                  {dirty && <Button variant="secondary" onClick={() => saveEdits()} disabled={busy} className="h-11 font-bold">حفظ التعديلات</Button>}
                  <div className="flex-1" />
                  <Button variant="outline" onClick={async () => { if (!dirty || (await saveEdits(true))) generate() }} disabled={busy} className="gap-1.5 h-11 font-bold text-blue-600 border-blue-200 hover:bg-blue-50">
                    <RefreshCw className="size-4" />أعد الحساب
                  </Button>
                  <Button variant="ghost" onClick={removeDraft} disabled={busy} className="gap-1.5 h-11 font-bold text-rose-600 hover:bg-rose-50">
                    <Trash2 className="size-4" />حذف المسودة
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 font-bold w-full">
                  <CheckCircle2 className="size-5" />
                  تم اعتماد وصرف الرواتب {run.paidAt ? `بتاريخ ${new Date(run.paidAt).toLocaleDateString('ar-EG-u-nu-latn')}` : ''} من {PAY_METHODS.find((m) => m.value === run.method)?.label ?? run.method}
                </div>
              )}
              
              <Button variant="outline" onClick={exportExcel} className="gap-1.5 h-11 font-bold text-slate-700 border-slate-200 hover:bg-slate-50 sm:ms-auto">
                <FileSpreadsheet className="size-4" />تصدير Excel
              </Button>
            </div>
          </>
        )}

        {/* ================= دورات سابقة ================= */}
        {pastRuns.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
              <Clock className="size-5 text-slate-400" /> دورات سابقة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pastRuns.map((r) => (
                <button 
                  key={r.id} 
                  onClick={() => setMonth(r.month)} 
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 dark:border-white/10 dark:bg-slate-900/80 p-4 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-blue-300"
                  dir="rtl"
                >
                  <div className={cn("absolute top-0 inset-x-0 h-1.5", r.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500')} />

                  <div className="flex items-start justify-between mb-3 mt-1">
                    <div>
                      <div className="font-black text-lg text-slate-800 dark:text-slate-100">{monthLabel(r.month)}</div>
                      <div className="text-[11px] text-slate-500 font-semibold">{r.count} موظف</div>
                    </div>
                    <div className={cn("grid size-9 place-items-center rounded-xl shadow-inner", r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                      {r.status === 'paid' ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 mb-0.5">إجمالي الصافي</div>
                      <div className="font-black tabular-nums text-slate-700 dark:text-slate-300">{money(r.totalNet)}</div>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1",
                      r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    )}>
                      {r.status === 'paid' ? 'تم الصرف' : 'مسودة'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================= المودالات ================= */}
      {payOpen && run && (
        <PayDialog
          run={run}
          onClose={() => setPayOpen(false)}
          onPaid={async () => { setPayOpen(false); await refresh() }}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

/** رقم مصري → صيغة دولية لـ wa.me (01xxxxxxxxx → 201xxxxxxxxx) */
function waNumber(raw: string | null): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = `20${d.slice(1)}`
  return /^\d{10,15}$/.test(d) ? d : null
}

function slipText(p: Slip, month: string, shop: string): string {
  const lines = [
    `*قسيمة راتب ${monthLabel(month)}*${shop ? ` — ${shop}` : ''}`,
    `الموظف: ${p.employeeName}`,
  ]
  if (p.workedDays !== null && p.expectedWorkDays !== null) {
    lines.push(`أيام الشغل: ${p.workedDays} من ${p.expectedWorkDays}`)
  }
  lines.push(`الأساسي: ${money(p.payableBase)}`)
  if (p.absenceDeduction > 0) {
    const parts: string[] = []
    if (p.absentDays > 0) parts.push(`${p.absentDays} غياب`)
    if (p.unrecordedDays > 0) parts.push(`${p.unrecordedDays} بدون تسجيل`)
    lines.push(`خصم أيام (${parts.join(' + ')}): - ${money(p.absenceDeduction)}`)
  }
  if (p.lateDeduction > 0) lines.push(`خصم تأخير (${p.lateMinutes} دقيقة): - ${money(p.lateDeduction)}`)
  if (p.bonus > 0) lines.push(`حافز: + ${money(p.bonus)}`)
  if (p.penalty > 0) lines.push(`جزاء: - ${money(p.penalty)}`)
  if (p.advanceDeduction > 0) lines.push(`قسط سلفة: - ${money(p.advanceDeduction)}`)
  lines.push(`*الصافي: ${money(p.net)}*`)
  return lines.join('\n')
}

function WhatsAppSlip({ slip, month, shop }: { slip: Slip; month: string; shop: string }) {
  const num = waNumber(slip.phone)
  const text = slipText(slip, month, shop)
  if (!num) {
    return (
      <Button
        variant="ghost" size="sm" className="gap-1 text-slate-400 hover:text-slate-700 h-8 px-2 rounded-lg"
        title={slip.phone ? 'رقم الموبايل غير صالح — اضغط لنسخ القسيمة' : 'مفيش رقم موبايل — اضغط لنسخ القسيمة'}
        onClick={() => { navigator.clipboard?.writeText(text).then(() => toast.success('تم نسخ القسيمة'), () => toast.error('تعذّر النسخ')) }}
      >
        <Copy className="size-3.5" /> نسخ
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" size="sm" className="gap-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 bg-emerald-50/50 h-8 px-2 rounded-lg border border-emerald-100">
      <a href={`https://wa.me/${num}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-3.5" />واتساب
      </a>
    </Button>
  )
}

function PayDialog({
  run, onClose, onPaid,
}: {
  run: Run
  onClose: () => void
  onPaid: () => void
}) {
  const [method, setMethod] = React.useState('cash')
  const [busy, setBusy] = React.useState(false)
  const pay = async () => {
    setBusy(true)
    try {
      await hrSend(`/api/hr/payroll/${run.id}/pay`, 'POST', { method })
      toast.success('تم صرف الرواتب وتسجيلها في الخزنة والمصروفات')
      onPaid()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الصرف')
    } finally {
      setBusy(false)
    }
  }
  const advances = r2(run.payslips.reduce((s, p) => s + p.advanceDeduction, 0))
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
        <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-6 sm:px-6 sm:pt-5 bg-emerald-50 dark:bg-emerald-950/20">
          <DialogTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
            <span className="grid size-8 place-items-center rounded-xl bg-emerald-600 text-white shadow-md">
              <Wallet className="size-4" />
            </span>
            صرف رواتب {monthLabel(run.month)}
          </DialogTitle>
          <DialogDescription className="text-emerald-700/80">العملية دي بتتسجل مرة واحدة ومش بتتكرر.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-5">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3 shadow-inner">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-600">المبلغ الصافي للصرف</span>
              <span className="text-2xl font-black text-emerald-600 tabular-nums">{money(run.totalNet)}</span>
            </div>
            {advances > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-500">أقساط سلف هتتخصم (مسجلة مسبقاً)</span>
                <span className="font-bold text-indigo-600 tabular-nums">{money(advances)}</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold">الصرف من الخزنة</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="shadow-inner h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={busy} className="h-10">رجوع</Button>
          <Button onClick={pay} disabled={busy} className="gap-1.5 h-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_0_rgb(4,120,87)] hover:translate-y-[2px] hover:shadow-none transition-all font-bold px-6">
            {busy && <Loader2 className="size-4 animate-spin" />}تأكيد الصرف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Settings { shiftStart: string; shiftHours: number; graceMinutes: number; lateMode: 'none' | 'per_minute'; dayDivisor: number; annualLeaveDays: number }

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = React.useState<Settings | null>(null)
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    hrGet<Settings>('/api/hr/settings').then(setS).catch(() => toast.error('فشل تحميل القواعد'))
  }, [])
  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      await hrSend('/api/hr/settings', 'PUT', s)
      toast.success('تم حفظ القواعد — هتتطبق عند "أعد الحساب"')
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-blue-600 text-white shadow-md">
              <Settings2 className="size-4" />
            </span>
            قواعد الحساب
          </DialogTitle>
          <DialogDescription>القيم الافتراضية مناسبة لأغلب المحلات. الحساب دايمًا على الأيام الفعلية المسجّلة.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-5">
          {!s ? <ListSkeleton rows={3} /> : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>بداية الشغل</Label>
                  <Input type="time" dir="ltr" value={s.shiftStart} onChange={(e) => setS({ ...s, shiftStart: e.target.value })} className="shadow-inner" />
                </div>
                <div className="space-y-1.5">
                  <Label>ساعات الشغل في اليوم</Label>
                  <Input type="number" dir="ltr" min={1} max={24} value={s.shiftHours} onChange={(e) => setS({ ...s, shiftHours: Number(e.target.value) })} className="shadow-inner" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>فترة السماح للتأخير (دقيقة)</Label>
                <Input type="number" dir="ltr" min={0} max={240} value={s.graceMinutes} onChange={(e) => setS({ ...s, graceMinutes: Number(e.target.value) })} className="shadow-inner" />
                <p className="text-xs text-slate-500">لو التأخير أقل من أو يساوي الرقم ده مفيش خصم. لو أكتر بيتخصم كله.</p>
              </div>
              <div className="space-y-1.5">
                <Label>خصم التأخير</Label>
                <Select value={s.lateMode} onValueChange={(v) => setS({ ...s, lateMode: v as Settings['lateMode'] })}>
                  <SelectTrigger className="shadow-inner"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_minute">بالدقيقة</SelectItem>
                    <SelectItem value="none">بدون خصم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>قيمة اليوم = الراتب ÷</Label>
                <Select value={String(s.dayDivisor)} onValueChange={(v) => setS({ ...s, dayDivisor: Number(v) })}>
                  <SelectTrigger className="shadow-inner"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 يوم</SelectItem>
                    <SelectItem value="26">26 يوم عمل</SelectItem>
                    <SelectItem value="0">أيام الشهر الفعلية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>رصيد الإجازة السنوية (يوم)</Label>
                <Input type="number" dir="ltr" min={0} max={90} value={s.annualLeaveDays} onChange={(e) => setS({ ...s, annualLeaveDays: Number(e.target.value) })} className="shadow-inner" />
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving || !s} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-[0_4px_0_rgb(30,58,138)] hover:shadow-[0_2px_0_rgb(30,58,138)] hover:translate-y-[2px] transition-all font-bold">
            {saving && <Loader2 className="size-4 animate-spin" />}حفظ القواعد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}