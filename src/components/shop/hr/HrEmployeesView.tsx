'use client'

import * as React from 'react'
import { Building2, CalendarOff, HandCoins, KeyRound, Loader2, FileSpreadsheet, Phone, Plus, Search, Pencil, UserCheck, UserX, Users, Wallet, User, UserRound, Briefcase, Calendar, Clock, Link2, UserPlus, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmployeeImportDialog } from './EmployeeImportDialog'
import { KioskAutoFlush } from './KioskQueueBanner'
import {
  DAY_NAMES, EmptyState, HR_THEMES, ListSkeleton, Pill,
  PAY_METHODS, hrGet, hrSend, money, monthLabel,
} from './hr-ui'
import { shiftLabel, type BranchShift } from '@/lib/branch-shifts'

interface Employee {
  id: number
  name: string
  phone: string | null
  jobTitle: string | null
  baseSalary: number
  hireDate: string
  weeklyOffDay: number
  active: boolean
  hasPin: boolean
  advanceRemaining: number
  // 🔗 (التحديث الثامن عشر) حساب الدخول المرتبط + شارة البائع
  userId: string | null
  userEmail: string | null
  userIsSeller: boolean
  // 🕐 (التحديث الحادي والعشرين) فرع الموظف + ورديته المحددة من ورديات الفرع
  branchId: number | null
  shiftName: string | null
}

/** فرع مختصر بالورديات المعرّفة — لقائمة اختيار وردية الموظف */
interface BranchOpt {
  id: number
  name: string
  shifts: BranchShift[]
}

interface FormState {
  name: string
  jobTitle: string
  phone: string
  baseSalary: string
  weeklyOffDay: string
  hireDate: string
  pin: string
  userId: string
  shiftName: string
  branchId: string
}
const EMPTY: FormState = { name: '', jobTitle: '', phone: '', baseSalary: '', weeklyOffDay: '5', hireDate: '', pin: '', userId: '', shiftName: '', branchId: '' }

interface SettlePreview {
  today: string
  lastWorkDay: string
  months: { month: string; workedDays: number; paidDays: number; lateMinutes: number; lateDeduction: number; bonus: number; penalty: number; net: number }[]
  totalGross: number
  advanceRemaining: number
  advanceDeduction: number
  net: number
  futureRecords: number
}

const isFemaleName = (name: string) => {
  const n = name.trim();
  if (!n) return false;
  if (/[ةى]$/.test(n) || /[اء]$/.test(n)) return true;
  const femaleNames = ['مريم', 'سارة', 'نور', 'هند', 'زينب', 'رنا', 'ريم', 'لينا', 'جنى', 'حبيبة', 'ملك', 'ياسمين', 'دينا', 'نهى', 'منى', 'سلمى', 'ليلى', 'شروق', 'أمل', 'إيمان', 'هدى', 'رؤى', 'آية', 'إسراء', 'هبة', 'شيماء', 'بسمة', 'عبير', 'سماح', 'نادية', 'نرمين', 'سمر', 'رغد', 'رهف', 'جواهر', 'فاطمة', 'عائشة', 'خديجة'];
  return femaleNames.some(fn => n.includes(fn));
};

const CARD_THEMES = [
  { bg: 'from-pink-500 to-rose-500', text: 'text-rose-500', solid: 'bg-rose-500' },
  { bg: 'from-orange-400 to-amber-500', text: 'text-amber-500', solid: 'bg-amber-500' },
  { bg: 'from-sky-400 to-blue-500', text: 'text-blue-500', solid: 'bg-blue-500' },
  { bg: 'from-emerald-400 to-teal-500', text: 'text-teal-500', solid: 'bg-teal-500' },
  { bg: 'from-violet-500 to-purple-600', text: 'text-purple-600', solid: 'bg-purple-600' },
]

export function HrEmployeesView() {
  const [items, setItems] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [filterMode, setFilterMode] = React.useState<'all' | 'active' | 'inactive'>('active')
  const [editing, setEditing] = React.useState<Employee | 'new' | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [settling, setSettling] = React.useState<Employee | null>(null)
  // 🕐 (التحديث الحادي والعشرين) ورديات الفروع — لقائمة اختيار وردية الموظف
  const [branches, setBranches] = React.useState<BranchOpt[]>([])
  const [sessionBranchId, setSessionBranchId] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await hrGet<{ items: Employee[]; branches?: BranchOpt[]; sessionBranchId?: number | null }>('/api/hr/employees')
      setItems(d.items)
      // ورديات الفروع استكمالية — فشلها/غيابها مش بيمنع عرض الموظفين
      if (Array.isArray(d.branches)) setBranches(d.branches)
      if (d.sessionBranchId !== undefined) setSessionBranchId(d.sessionBranchId ?? null)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الموظفين')
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const visible = items.filter((e) => {
    if (filterMode === 'active' && !e.active) return false
    if (filterMode === 'inactive' && e.active) return false
    const q = search.trim().toLowerCase()
    return !q || e.name.toLowerCase().includes(q) || (e.jobTitle ?? '').toLowerCase().includes(q) || (e.phone ?? '').includes(q)
  })
  const inactiveCount = items.filter((e) => !e.active).length
  const activeItems = items.filter((e) => e.active)
  const totalPayroll = activeItems.reduce((s, e) => s + e.baseSalary, 0)
  const withPin = activeItems.filter((e) => e.hasPin).length

  const toggleActive = async (e: Employee) => {
    if (e.active) {
      if (!window.confirm(`هل أنت متأكد من إيقاف الموظف "${e.name}"؟`)) return
    }
    try {
      if (e.active) await hrSend(`/api/hr/employees/${e.id}`, 'DELETE')
      else await hrSend(`/api/hr/employees/${e.id}`, 'PUT', { active: true })
      toast.success(e.active ? 'تم إيقاف الموظف' : 'تم تفعيل الموظف')
      load()
    } catch (err: any) {
      toast.error(err?.message || 'فشلت العملية')
    }
  }

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <KioskAutoFlush />
      
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو 3D ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white rounded-3xl mb-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-cyan-300/30 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <Users className="size-3.5 text-white" />
                <span className="text-xs font-bold text-white">إدارة الفريق</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">قائمة الموظفين</h1>
              <p className="mt-3 text-sm leading-relaxed text-blue-50/90 sm:text-base">
                إدارة بيانات الفريق، الرواتب الأساسية، وصلاحيات كشك الحضور (PIN).
              </p>
            </div>

            <div className="z-10 flex flex-wrap gap-3">
              {/* 🛡️ 2026-11-03: أزلنا حركات hover (translate/scale/rotate) — لما الماوس بيعدي على العناصر أثناء سكرول بالعجلة كانت بتتحرك فبيبان كأن المحتوى بيقفز. التغذية الراجعة بقت بالظل/اللون بس. */}
              <Button 
                variant="outline" 
                onClick={() => setImporting(true)} 
                className="border-white/30 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 hover:text-white hover:border-white/40 gap-1.5 shadow-[0_6px_0_rgba(255,255,255,0.1)] hover:shadow-[0_2px_0_rgba(255,255,255,0.1)] transition-all"
              >
                <FileSpreadsheet className="size-4" />استيراد Excel
              </Button>
              <Button 
                onClick={() => setEditing('new')} 
                className="bg-white text-indigo-700 font-bold hover:bg-white hover:text-indigo-700 shadow-[0_6px_0_rgb(226,232,240)] hover:shadow-[0_2px_0_rgb(226,232,240)] transition-all gap-1.5"
              >
                <Plus className="size-4" />موظف جديد
              </Button>
            </div>
          </div>
        </section>

        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            theme="employees"
            icon={Users}
            title="لسه مفيش موظفين"
            hint="ضيف أول موظف عشان تبدأ تسجّل الحضور وتحسب الرواتب."
            action={<Button onClick={() => setEditing('new')} className="gap-1.5"><Plus className="size-4" />ضيف أول موظف</Button>}
          />
        ) : (
          <>
            {/* ================= كروت الإحصائيات 3D ================= */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              {[
                { label: 'الموظفين النشطين', val: activeItems.length, icon: Users, tone: 'sky', foot: inactiveCount > 0 ? `يوجد ${inactiveCount} موظف موقوف` : 'كل الفريق نشط' },
                { label: 'الرواتب الإجمالية', val: money(totalPayroll), icon: Wallet, tone: 'emerald', foot: 'الراتب الأساسي بدون خصومات' },
                { label: 'كشك الحضور (PIN)', val: `${withPin} / ${activeItems.length}`, icon: KeyRound, tone: 'violet', foot: withPin < activeItems.length ? 'باقي الموظفين بدون PIN' : 'كل الفريق مفعّل' },
                { label: 'السلف الجارية', val: money(activeItems.reduce((s, e) => s + e.advanceRemaining, 0)), icon: HandCoins, tone: 'amber', foot: `مستحقة على ${activeItems.filter((e) => e.advanceRemaining > 0).length} موظف` },
              ].map((stat, i) => (
                <div key={i} className={cn(
                  'relative flex flex-col justify-between overflow-hidden rounded-2xl border border-s-4 bg-white dark:bg-slate-900 p-5 transition-all duration-300',
                  'shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,1)] dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]',
                  stat.tone === 'sky' ? 'border-s-sky-500' : stat.tone === 'emerald' ? 'border-s-emerald-500' : stat.tone === 'violet' ? 'border-s-violet-500' : 'border-s-amber-500'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
                      <div className="text-2xl font-black tabular-nums text-foreground sm:text-3xl drop-shadow-sm">{stat.val}</div>
                    </div>
                    <span className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-xl text-white shadow-lg',
                      stat.tone === 'sky' ? 'bg-gradient-to-br from-sky-400 to-sky-600 shadow-sky-500/30' :
                      stat.tone === 'emerald' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30' :
                      stat.tone === 'violet' ? 'bg-gradient-to-br from-violet-400 to-violet-600 shadow-violet-500/30' :
                      'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/30'
                    )}>
                      <stat.icon className="size-5 drop-shadow-md" />
                    </span>
                  </div>
                  <p className="mt-4 text-[11px] font-medium text-muted-foreground">{stat.foot}</p>
                </div>
              ))}
            </div>

            {/* ================= فلتر 2026 (مستقر ومريح) ================= */}
            <div className="mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4 rounded-3xl border border-slate-200/60 bg-white/60 dark:bg-slate-900/60 p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl" dir="rtl">
              
              {/* البحث */}
              <div className="relative flex-1 group">
                <Search className="absolute start-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <Input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder="ابحث عن موظف بالاسم، الوظيفة، أو الموبايل..." 
                  className="h-11 ps-11 pe-4 bg-slate-100/50 dark:bg-slate-800/50 border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl transition-all text-sm font-medium shadow-inner" 
                />
              </div>
              
              {/* فلاتر (استخدمت flex-wrap عشان ميبقاش فيه سكرول) */}
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => setFilterMode('all')}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                    filterMode === 'all' 
                      ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  )}
                >
                  <Users className="size-4" /> الكل ({items.length})
                </button>
                <button 
                  onClick={() => setFilterMode('active')}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                    filterMode === 'active' 
                      ? "bg-emerald-500 text-white border-emerald-500 shadow-md" 
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  )}
                >
                  <UserCheck className="size-4" /> النشطين ({activeItems.length})
                </button>
                <button 
                  onClick={() => setFilterMode('inactive')}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                    filterMode === 'inactive' 
                      ? "bg-rose-500 text-white border-rose-500 shadow-md" 
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                  )}
                >
                  <UserX className="size-4" /> الموقوفين ({inactiveCount})
                </button>
              </div>
            </div>

            {/* ================= الكروت (الحجم المريح والواضح) ================= */}
            {visible.length === 0 ? (
              <EmptyState theme="employees" icon={Search} title="مفيش نتائج" hint="جرّب كلمة بحث تانية أو غير الفلتر." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {visible.map((e, index) => {
                  const theme = CARD_THEMES[index % CARD_THEMES.length]
                  const isFemale = isFemaleName(e.name)
                  // 🕐 تعريف ورديته من ورديات فرعه — لو التعريف اتشال بنعرض الاسم بس
                  const empShiftDef = e.shiftName
                    ? branches.find((b) => b.id === e.branchId)?.shifts.find((s) => s.name === e.shiftName) ?? null
                    : null
                  
                  return (
                    <div 
                      key={e.id} 
                      dir="rtl"
                      className={cn(
                        'relative flex flex-col rounded-[1.5rem] bg-white dark:bg-slate-900 overflow-hidden transition-all duration-300 hover:shadow-xl',
                        'shadow-[0_8px_30px_-12px_rgba(0,0,0,0.1)] border border-slate-100 dark:border-slate-800',
                        e.active ? '' : 'opacity-60 grayscale-[40%]'
                      )}
                    >
                      {/* الفتحة العلوية */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-3 bg-slate-50 dark:bg-slate-950 rounded-b-full z-10" />

                      {/* الشريط الملون (حجم مريح) */}
                      <div className={cn('h-20 bg-gradient-to-r px-5 flex justify-between items-start pt-4 relative', theme.bg)}>
                        <span className="text-white font-bold text-xs bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-sm">
                          #{String(e.id).padStart(3, '0')}
                        </span>
                        <span className="text-white/90 font-bold text-[10px] tracking-widest uppercase mt-1">Employee</span>
                      </div>

                      {/* الأفاتار (حجم مريح) */}
                      <div className="absolute top-[3.25rem] right-5 z-20">
                        <div className="size-14 rounded-[1rem] bg-white dark:bg-slate-900 p-1 shadow-md">
                          <div className={cn("size-full rounded-xl bg-gradient-to-br flex items-center justify-center text-white", theme.bg)}>
                            {isFemale ? <UserRound className="size-6 drop-shadow-md" strokeWidth={2.5} /> : <User className="size-6 drop-shadow-md" strokeWidth={2.5} />}
                          </div>
                        </div>
                      </div>

                      {/* جسم الكارت */}
                      <div className="pt-8 px-4 pb-4 flex flex-col flex-1">
                        
                        {/* الاسم والوظيفة */}
                        <div className="flex flex-col items-start mb-4">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 truncate">{e.name}</h3>
                            {e.hasPin ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                PIN مفعّل
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                بدون PIN
                              </span>
                            )}
                            {e.userIsSeller ? (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                                💰 بائع
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Briefcase className="size-3.5" />
                            <span>{e.jobTitle || 'موظف'}</span>
                          </div>
                          {e.userEmail ? (
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-700 dark:text-emerald-400" title="حساب الدخول المرتبط">
                              <Link2 className="size-3" />
                              <span dir="ltr" className="truncate max-w-[180px]">{e.userEmail}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-amber-600/90" title="اربط حساب دخول من زرار التعديل">
                              <Link2 className="size-3" />
                              <span>بدون حساب دخول — اربطه من التعديل</span>
                            </div>
                          )}
                        </div>

                        {/* شبكة البيانات (2x2) مريحة */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* الراتب */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mb-1">
                              <span>الراتب الشهري</span>
                              <Wallet className="size-3.5" />
                            </div>
                            <div className={cn("font-black text-sm text-right w-full", theme.text)}>
                              {money(e.baseSalary)}
                            </div>
                          </div>
                          
                          {/* الإجازة */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mb-1">
                              <span>الراحة الأسبوعية</span>
                              <CalendarOff className="size-3.5" />
                            </div>
                            <div className="font-bold text-sm text-slate-800 dark:text-slate-200 text-right w-full">
                              {DAY_NAMES[e.weeklyOffDay]}
                            </div>
                          </div>

                          {/* الموبايل (أيقونة عادية) */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mb-1">
                              <span>الموبايل</span>
                              <Phone className="size-3.5" />
                            </div>
                            <div className="font-bold text-sm text-slate-800 dark:text-slate-200 text-right w-full truncate" dir="ltr">
                              {e.phone || '—'}
                            </div>
                          </div>

                          {/* التعيين */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mb-1">
                              <span>التعيين</span>
                              <Calendar className="size-3.5" />
                            </div>
                            <div className="font-bold text-sm text-slate-800 dark:text-slate-200 text-right w-full truncate">
                              {new Date(e.hireDate).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>

                          {/* 🕐 (التحديث الحادي والعشرين) وردية الموظف — بالأوقات من ورديات الفرع */}
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400 mb-1">
                              <span>الوردية</span>
                              <Clock className="size-3.5" />
                            </div>
                            <div className="font-bold text-sm text-slate-800 dark:text-slate-200 text-right w-full truncate" title={e.shiftName ?? undefined}>
                              {empShiftDef ? shiftLabel(empShiftDef) : e.shiftName ?? '—'}
                            </div>
                          </div>
                        </div>

                        {/* أزرار الإجراءات */}
                        <div className="grid grid-cols-3 gap-2 mt-auto pt-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setEditing(e)} 
                            className="w-full h-8 gap-1.5 text-xs text-slate-700 border-slate-200 hover:bg-slate-50 shadow-none"
                          >
                            <Pencil className="size-3.5" /> تعديل
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setSettling(e)} 
                            disabled={!e.active} 
                            className="w-full h-8 gap-1.5 text-xs text-orange-500 border-orange-200 hover:bg-orange-50 hover:text-orange-600 shadow-none"
                          >
                            <HandCoins className="size-3.5" /> تصفية
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => toggleActive(e)} 
                            className={cn(
                              "w-full h-8 gap-1.5 text-xs shadow-none", 
                              e.active 
                                ? "text-pink-600 border-pink-200 hover:bg-pink-50 hover:text-pink-700" 
                                : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                            )}
                          >
                            {e.active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />} 
                            {e.active ? 'إيقاف' : 'تفعيل'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ================= المودالات ================= */}
      {importing && <EmployeeImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />}
      {settling && (
        <SettleDialog
          employee={settling}
          onClose={() => setSettling(null)}
          onDone={() => { setSettling(null); load() }}
        />
      )}
      {editing && (
        <EmployeeDialog
          employee={editing === 'new' ? null : editing}
          branches={branches}
          sessionBranchId={sessionBranchId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

type DlgTone = 'sky' | 'violet' | 'teal' | 'amber' | 'emerald'
const DLG_TONES: Record<DlgTone, { grad: string; shadow: string }> = {
  sky: { grad: 'from-sky-400 to-sky-600', shadow: 'shadow-sky-500/35' },
  violet: { grad: 'from-violet-400 to-violet-600', shadow: 'shadow-violet-500/35' },
  teal: { grad: 'from-teal-400 to-teal-600', shadow: 'shadow-teal-500/35' },
  amber: { grad: 'from-amber-400 to-amber-600', shadow: 'shadow-amber-500/35' },
  emerald: { grad: 'from-emerald-400 to-emerald-600', shadow: 'shadow-emerald-500/35' },
}

/** أيقونة 3D صغيرة — نفس لغة كروت صفحة الموظفين (تدرّج + لمعة + ظل ملوّن) */
function DlgIcon({ icon: Icon, tone }: { icon: React.ElementType; tone: DlgTone }) {
  const t = DLG_TONES[tone]
  return (
    <span aria-hidden className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/25', t.grad, t.shadow)}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
      <Icon className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
    </span>
  )
}

/** قسم في الدايلوج: كارت أبيض بحافة ملوّنة علوية + أيقونة 3D + عنوان */
function DlgSection({ icon, tone, title, hint, children }: {
  icon: React.ElementType; tone: DlgTone; title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 pt-5 shadow-[0_4px_0_rgba(15,23,42,0.05),0_12px_24px_-14px_rgba(0,0,0,0.15)] dark:border-slate-800 dark:bg-slate-900">
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-l', DLG_TONES[tone].grad)} />
      <div className="mb-3.5 flex items-center gap-3">
        <DlgIcon icon={icon} tone={tone} />
        <div className="min-w-0">
          <h3 className="text-[15px] font-black leading-tight">{title}</h3>
          {hint ? <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  )
}

const FIELD_CLS = 'h-11 rounded-xl border-slate-200 bg-slate-50 text-sm font-semibold shadow-inner focus-visible:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus-visible:bg-slate-900'
const TRIGGER_CLS = 'h-11 w-full rounded-xl border-slate-200 bg-slate-50 text-sm font-semibold shadow-inner dark:border-slate-700 dark:bg-slate-800/50'

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
        {Icon ? <Icon className="size-3.5 text-slate-400" /> : null}
        {label}
      </Label>
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
      <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
      <span>{children}</span>
    </p>
  )
}

function EmployeeDialog({
  employee, branches, sessionBranchId, onClose, onSaved,
}: { employee: Employee | null; branches: BranchOpt[]; sessionBranchId: number | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState<FormState>(
    employee
      ? {
          name: employee.name, jobTitle: employee.jobTitle ?? '', phone: employee.phone ?? '',
          baseSalary: String(employee.baseSalary), weeklyOffDay: String(employee.weeklyOffDay),
          hireDate: employee.hireDate, pin: '', userId: employee.userId ?? '',
          shiftName: employee.shiftName ?? '',
          branchId: employee.branchId != null ? String(employee.branchId) : '',
        }
      : { ...EMPTY, branchId: sessionBranchId != null ? String(sessionBranchId) : '' },
  )
  const [saving, setSaving] = React.useState(false)
  // 🔗 (التحديث الثامن عشر) قايمة حسابات الدخول للربط — مأخوذة من شاشة
  // المستخدمين (المدير بس)، والموظفين المرتبطين فعلاً بغير الموظف الحالي
  // بيتستبعدوا من القايمة عشان الربط يفضل واحد لواحد
  const [users, setUsers] = React.useState<{ id: string; name: string; email: string; isSeller: boolean; branchId: number | null }[]>([])
  React.useEffect(() => {
    let alive = true
    import('@/lib/api').then(({ api }) =>
      api<any[]>('/api/users')
        .then((rows) => {
          if (!alive) return
          setUsers(
            (Array.isArray(rows) ? rows : [])
              .filter((u) => u && u.active !== false)
              .map((u) => ({ id: String(u.id), name: String(u.name ?? ''), email: String(u.email ?? ''), isSeller: u.isSeller === true, branchId: u.branchId != null ? Number(u.branchId) : null })),
          )
        })
        .catch(() => { /* القايمة استكمالية — فشلها مش بيمنع حفظ الباقي */ }),
    )
    return () => { alive = false }
  }, [employee?.userId])
  const selectedUser = users.find((u) => u.id === f.userId) ?? null
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  // 🕐 (التحديث الحادي والعشرين) ورديات فرع الموظف — الجديد بياخد فرع جلسة
  // المدير (نفس قاعدة الحفظ على السيرفر)، والتعديل بياخد فرع الموظف نفسه
  const branchIdForShift = f.branchId ? Number(f.branchId) : null
  const shiftOptions = React.useMemo(
    () => branches.find((b) => b.id === branchIdForShift)?.shifts ?? [],
    [branches, branchIdForShift],
  )

  const save = async () => {
    if (!f.name.trim()) return toast.error('اكتب اسم الموظف')
    const salary = Number(f.baseSalary)
    if (!Number.isFinite(salary) || salary < 0 || f.baseSalary === '') return toast.error('اكتب الراتب')
    if (f.pin && !/^\d{4,6}$/.test(f.pin)) return toast.error('الـ PIN لازم 4 إلى 6 أرقام')
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: f.name.trim(), jobTitle: f.jobTitle.trim(), phone: f.phone.trim(),
        baseSalary: salary, weeklyOffDay: Number(f.weeklyOffDay),
        // 🔗 الربط: '' = فك الربط، id = ربط الحساب (السيرفر بيتحقق من التفرد)
        userId: f.userId || '',
        // 🕐 الوردية: '' = بدون وردية، الاسم = لازم يكون من ورديات فرع الموظف
        shiftName: f.shiftName || '',
        // 🏢 الفرع: '' = بدون فرع
        branchId: f.branchId || '',
      }
      if (f.hireDate) body.hireDate = f.hireDate
      if (f.pin) body.pin = f.pin
      if (employee) await hrSend(`/api/hr/employees/${employee.id}`, 'PUT', body)
      else await hrSend('/api/hr/employees', 'POST', body)
      toast.success(employee ? 'تم حفظ التعديلات' : 'تمت إضافة الموظف')
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const previewName = f.name.trim()

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden border-0 p-0 sm:max-w-2xl" dir="rtl">
        {/* ================= الهيدر: نفس هيرو صفحة الموظفين ================= */}
        <DialogHeader className="relative shrink-0 gap-0 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 px-4 pb-5 pt-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] sm:px-6 sm:pt-6">
          <div aria-hidden className="absolute -top-24 -right-24 size-64 rounded-full bg-white/20 blur-[60px]" />
          <div aria-hidden className="absolute -bottom-24 -left-24 size-56 rounded-full bg-cyan-300/30 blur-[60px]" />
          <div className="relative flex items-center gap-4">
            <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[22px] border border-t-white/50 border-l-white/30 border-b-black/20 border-r-black/10 bg-gradient-to-br from-white/35 to-white/10 text-white shadow-[0_14px_28px_rgba(0,0,0,0.3),inset_0_2px_8px_rgba(255,255,255,0.45)] ring-1 ring-white/30 backdrop-blur-md">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              {employee ? <Pencil className="relative size-7 drop-shadow-lg" strokeWidth={2} /> : <UserPlus className="relative size-7 drop-shadow-lg" strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur-md">
                <Users className="size-3" />
                إدارة الفريق
              </div>
              <DialogTitle className="truncate text-xl font-extrabold leading-tight drop-shadow-md sm:text-2xl">
                {employee ? 'تعديل بيانات الموظف' : 'موظف جديد'}
              </DialogTitle>
              <DialogDescription className="mt-1 truncate text-sm text-blue-50/90">
                {previewName || 'الاسم والراتب كفاية للبداية.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ================= الجسم: أقسام بكروت 3D ================= */}
        <DialogBody className="space-y-4 bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6">
          <DlgSection icon={User} tone="sky" title="البيانات الأساسية" hint="المطلوب للحفظ: الاسم والراتب">
            <Field label="الاسم">
              <Input value={f.name} onChange={set('name')} autoFocus placeholder="اسم الموظف بالكامل" className={FIELD_CLS} />
            </Field>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="الراتب الشهري" icon={Wallet}>
                <div className="relative">
                  <Input type="number" inputMode="decimal" min={0} value={f.baseSalary} onChange={set('baseSalary')} dir="ltr" placeholder="0" className={cn(FIELD_CLS, 'pe-14 tabular-nums')} />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-bold text-slate-400">ج.م</span>
                </div>
              </Field>
              <Field label="يوم الإجازة الأسبوعية" icon={CalendarOff}>
                <Select value={f.weeklyOffDay} onValueChange={(v) => setF((s) => ({ ...s, weeklyOffDay: v }))}>
                  <SelectTrigger className={TRIGGER_CLS}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </DlgSection>

          <DlgSection icon={Briefcase} tone="violet" title="الوظيفة والتواصل" hint="اختياري">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="الوظيفة" icon={Briefcase}>
                <Input value={f.jobTitle} onChange={set('jobTitle')} placeholder="كاشير / بائع / مخزن" className={FIELD_CLS} />
              </Field>
              <Field label="الموبايل" icon={Phone}>
                <Input value={f.phone} onChange={set('phone')} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" className={FIELD_CLS} />
              </Field>
            </div>
            <Field label="تاريخ التعيين" icon={Calendar}>
              <Input type="date" value={f.hireDate} onChange={set('hireDate')} dir="ltr" className={FIELD_CLS} />
            </Field>
          </DlgSection>

          <DlgSection icon={Building2} tone="teal" title="الفرع والوردية" hint="الفرع بيحدد الورديات المتاحة">
            <Field label="فرع الموظف" icon={Building2}>
              <Select
                value={f.branchId || 'none'}
                onValueChange={(v) => setF((s) => ({ ...s, branchId: v === 'none' ? '' : v, shiftName: '' }))}
              >
                <SelectTrigger className={TRIGGER_CLS}><SelectValue placeholder="اختار الفرع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون فرع</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {/* 🕐 وردية الموظف — من ورديات فرعه المعرّفة */}
            <Field label="وردية الموظف (من ورديات الفرع)" icon={Clock}>
              <Select
                value={f.shiftName || 'none'}
                onValueChange={(v) => setF((s) => ({ ...s, shiftName: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className={TRIGGER_CLS}>
                  <SelectValue placeholder="اختار الوردية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون وردية محددة</SelectItem>
                  {shiftOptions.map((s) => (
                    <SelectItem key={s.name} value={s.name}>{shiftLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Note>
              {!f.branchId
                ? 'اختار فرع الموظف الأول عشان تظهر ورديات الفرع.'
                : shiftOptions.length === 0
                ? 'فرع الموظف ده مفيش عليه ورديات معرّفة — ضيفها من شاشة الفروع (صباحي/مسائي/ليلي) وبعدها اختار من هنا.'
                : 'الوردية دي هتظهر للموظف في صفحة «ملفي» — وبتتختار له تلقائياً لما يفتح وردية شغل باسمه.'}
            </Note>
          </DlgSection>

          <DlgSection icon={KeyRound} tone="amber" title="كشك الحضور" hint="PIN من 4 إلى 6 أرقام — اختياري">
            <Field label="PIN الحضور" icon={KeyRound}>
              <Input
                value={f.pin} onChange={set('pin')} dir="ltr" inputMode="numeric" maxLength={6}
                placeholder={employee?.hasPin ? 'سيبه فاضي للإبقاء على الحالي' : '••••'}
                className={cn(FIELD_CLS, 'tracking-[0.3em] tabular-nums')}
              />
            </Field>
          </DlgSection>

          {/* 🔗 ربط حساب الدخول — من خلاله الموظف يشوف «ملفي» ولو بائع عمولته بتنزل في راتبه */}
          <DlgSection icon={Link2} tone="emerald" title="حساب الدخول" hint="اختياري — من شاشة المستخدمين">
            <Field label="الحساب المرتبط" icon={Link2}>
              <Select
                value={f.userId || 'none'}
                onValueChange={(v) => setF((s) => {
                  const uid = v === 'none' ? '' : v
                  const ub = users.find((u) => u.id === uid)?.branchId
                  // 🏢 الحساب المختار له فرع → الموظف ياخد فرعه (والوردية القديمة تتفضّى لو الفرع اتغيّر)
                  if (ub != null && String(ub) !== s.branchId) return { ...s, userId: uid, branchId: String(ub), shiftName: '' }
                  return { ...s, userId: uid }
                })}
              >
                <SelectTrigger className={TRIGGER_CLS}>
                  <SelectValue placeholder="اختار حساب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون حساب دخول</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} — {u.email}{u.isSeller ? ' (بائع 💰)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Note>
              الربط هو اللي بيخلي الموظف يشوف من صفحة «ملفي»: حضوره وإجازاته وقسيمة راتبه —
              {selectedUser?.isSeller
                ? ' والحساب المختار بائع 💰 فعمولته هتتعبّى تلقائياً في راتبه كل شهر.'
                : ' ولو الحساب بائع، عمولته هتتعبّى تلقائياً في عمود «عمولة» في راتبه.'}
              {' '}كل حساب مربوط بموظف واحد بس.
            </Note>
          </DlgSection>
        </DialogBody>

        <DialogFooter className="shrink-0 flex-row justify-end gap-3 border-t bg-background px-4 py-3.5 sm:px-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-11 rounded-xl px-6 font-bold shadow-[0_4px_0_rgba(15,23,42,0.08)] transition-all hover:shadow-[0_2px_0_rgba(15,23,42,0.08)]"
          >
            إلغاء
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="h-11 gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-8 font-extrabold text-white shadow-[0_5px_0_rgba(67,56,202,0.55)] transition-all hover:from-indigo-500 hover:to-violet-600 hover:shadow-[0_2px_0_rgba(67,56,202,0.55)] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : employee ? <Pencil className="size-4" /> : <UserPlus className="size-4" />}
            {employee ? 'حفظ التعديلات' : 'إضافة الموظف'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettleDialog({
  employee, onClose, onDone,
}: { employee: Employee; onClose: () => void; onDone: () => void }) {
  const [day, setDay] = React.useState(() => new Date().toLocaleDateString('en-CA'))
  const [preview, setPreview] = React.useState<SettlePreview | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [method, setMethod] = React.useState('cash')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const fetchPreview = React.useCallback(async (d: string) => {
    setLoading(true)
    setErr(null)
    try {
      setPreview(await hrGet<SettlePreview>(`/api/hr/employees/${employee.id}/settle?lastWorkDay=${d}`))
    } catch (e: any) {
      setPreview(null)
      setErr(e?.message || 'فشل تحميل المعاينة')
    } finally {
      setLoading(false)
    }
  }, [employee.id])

  React.useEffect(() => {
    if (day) fetchPreview(day)
  }, [day, fetchPreview])

  const pay = async () => {
    if (!day) return toast.error('اختار آخر يوم شغل')
    setBusy(true)
    try {
      const r = await hrSend<{ ok: true; net: number; advanceDeduction: number; settledAdvanceLeft: number }>(
        `/api/hr/employees/${employee.id}/settle`,
        'POST',
        { lastWorkDay: day, method, note: note.trim() || undefined },
      )
      toast.success(r.net > 0 ? `اتصرفت ${money(r.net)} واتقفل حساب ${employee.name}` : `اتقفل حساب ${employee.name} — مفيش مستحقات متأخرة`)
      onDone()
    } catch (e: any) {
      toast.error(e?.message || 'فشلت التصفية')
    } finally {
      setBusy(false)
    }
  }

  const advanceLeft = preview ? Math.round((preview.advanceRemaining - preview.advanceDeduction) * 100) / 100 : 0

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className={`grid size-8 place-items-center rounded-xl shadow-md ${HR_THEMES.employees.solid} ${HR_THEMES.employees.solidFg}`}>
              <HandCoins className="size-4" />
            </span>
            تصفية حساب {employee.name}
          </DialogTitle>
          <DialogDescription>كل مستحقاته غير المدفوعة + خصم باقي السلف — والموظف يتقفل بعد الصرف.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3.5 py-4">
          <div className="space-y-1.5">
            <Label>آخر يوم شغل</Label>
            <Input
              type="date" dir="ltr" value={day}
              max={new Date().toLocaleDateString('en-CA')}
              onChange={(e) => setDay(e.target.value)}
              className="shadow-inner"
            />
            <p className="text-[11px] text-muted-foreground">الحساب على الأيام المسجّلة لحد اليوم ده بس.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> بجهّز الحساب...
            </div>
          ) : err ? (
            <p className="py-2 text-sm text-rose-600">{err}</p>
          ) : preview ? (
            <>
              {preview.months.length === 0 ? (
                <p className="rounded-xl bg-muted/60 p-3 text-sm">
                  كل الشهور اللي ليها رواتب اتصرفت خلاص — مفيش مستحقات متأخرة عليه.
                </p>
              ) : (
                <div className="rounded-xl border shadow-sm">
                  <div className="border-b bg-muted/50 px-3.5 py-2 text-xs font-bold text-muted-foreground">الشهور غير المدفوعة</div>
                  <ul className="divide-y divide-border/60 px-3.5">
                    {preview.months.map((m) => (
                      <li key={m.month} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                        <span className="font-bold">{monthLabel(m.month)}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{m.workedDays} يوم شغل</span>
                          {m.bonus > 0 && <Pill tone="emerald">حافز {money(m.bonus)}</Pill>}
                          {m.penalty > 0 && <Pill tone="rose">جزاء {money(m.penalty)}</Pill>}
                          {m.lateDeduction > 0 && <Pill tone="amber">تأخير {money(m.lateDeduction)}</Pill>}
                        </span>
                        <b className="tabular-nums">{money(m.net)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm shadow-inner">
                <div className="flex justify-between"><span>إجمالي المستحقات</span><b className="tabular-nums">{money(preview.totalGross)}</b></div>
                {preview.advanceDeduction > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>خصم باقي السلف بالكامل</span>
                    <span className="tabular-nums">- {money(preview.advanceDeduction)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 text-base font-extrabold">
                  <span>الصافي</span><span className="tabular-nums text-primary">{money(preview.net)}</span>
                </div>
              </div>

              {preview.futureRecords > 0 && (
                <p className="text-xs text-muted-foreground">
                  فيه {preview.futureRecords} سجل حضور بعد آخر يوم شغل — مش هيدخل في الحساب.
                </p>
              )}
              {advanceLeft > 0 && (
                <p className="text-xs text-muted-foreground">
                  باقي سلفة {money(advanceLeft)} عليه بعد الخصم — هتفضل ظاهرة في صفحة السلف لو عاوز تلغيها.
                </p>
              )}

              {preview.net > 0 && (
                <div className="space-y-1.5">
                  <Label>الصرف من</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="shadow-inner"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>ملاحظة (اختياري)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: استلام مستحقات وترك الشغل" className="shadow-inner" />
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={busy}>رجوع</Button>
          <Button onClick={pay} disabled={busy || loading || !preview || !!err} className="gap-1.5 shadow-[0_4px_0_rgba(0,0,0,0.1)] hover:shadow-[0_2px_0_rgba(0,0,0,0.1)] transition-all">
            {busy && <Loader2 className="size-4 animate-spin" />}
            اتصرف واقفل حسابه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}