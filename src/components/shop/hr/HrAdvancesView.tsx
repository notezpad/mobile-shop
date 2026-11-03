'use client'

import * as React from 'react'
import { HandCoins, Loader2, Plus, Undo2, Wallet, TrendingDown, Calendar, User, UserRound, CheckCircle2, Minus, Banknote, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmptyState, ListSkeleton, PAY_METHODS, hrGet, hrSend, money } from './hr-ui'
import { cn } from '@/lib/utils'

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

const isFemaleName = (name: string) => {
  const n = name.trim();
  if (!n) return false;
  if (/[ةى]$/.test(n) || /[اء]$/.test(n)) return true;
  const femaleNames = ['مريم', 'سارة', 'نور', 'هند', 'زينب', 'رنا', 'ريم', 'لينا', 'جنى', 'حبيبة', 'ملك', 'ياسمين', 'دينا', 'نهى', 'منى', 'سلمى', 'ليلى', 'شروق', 'أمل', 'إيمان', 'هدى', 'رؤى', 'آية', 'إسراء', 'هبة', 'شيماء', 'بسمة', 'عبير', 'سماح', 'نادية', 'نرمين', 'سمر', 'رغد', 'رهف', 'جواهر', 'فاطمة', 'عائشة', 'خديجة'];
  return femaleNames.some(fn => n.includes(fn));
};

const AVATAR_THEMES = [
  { bg: 'from-rose-400 to-pink-600', shadow: 'shadow-rose-500/30' },
  { bg: 'from-red-400 to-rose-600', shadow: 'shadow-red-500/30' },
  { bg: 'from-orange-400 to-red-500', shadow: 'shadow-orange-500/30' },
  { bg: 'from-pink-400 to-fuchsia-600', shadow: 'shadow-pink-500/30' },
]

const STATUS = {
  open: { label: 'جارية', cls: 'bg-rose-100 text-rose-700' },
  settled: { label: 'اتسددت', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'ملغية', cls: 'bg-slate-100 text-slate-600' },
} as const

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
    if (!window.confirm('هل أنت متأكد من إلغاء هذه السلفة؟ سيتم إرجاع المبلغ للخزنة.')) return
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

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو (أحمر ياقوتي 3D) ================= */}
        <section className="relative overflow-hidden bg-gradient-to-br from-rose-600 via-red-600 to-pink-700 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]">
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-white/20 blur-[80px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-pink-300/30 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <HandCoins className="size-3.5 text-white" />
                <span className="text-xs font-bold text-white">العهد والخصومات</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">
                السلف <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">والمستحقات</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-rose-50/90 sm:text-base">
                سلف بتيخرج من الخزنة وتتخصم من الراتب بالقسط تلقائيًا.
              </p>
            </div>

            <div className="z-10 flex flex-wrap gap-3">
              {/* 🛡️ 2026-11-03: أزلنا حركات hover (translate/scale/rotate) — لما الماوس بيعدي على العناصر أثناء سكرول بالعجلة كانت بتتحرك فبيبان كأن المحتوى بيقفز. التغذية الراجعة بقت بالظل/اللون بس. */}
              <Button 
                onClick={() => setAdding(true)} 
                className="bg-white text-rose-700 font-bold hover:bg-rose-50 hover:text-rose-800 shadow-[0_6px_0_rgb(254,205,211)] hover:shadow-[0_2px_0_rgb(254,205,211)] transition-all gap-1.5"
              >
                <Plus className="size-4" />سلفة جديدة
              </Button>
            </div>
          </div>
        </section>

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
          <>
            {/* ================= الإحصائيات (Bento) ================= */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/30">
                  <TrendingDown className="size-5 drop-shadow-md" />
                </span>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-bold text-slate-500">متبقي على الموظفين</span>
                  <span className="text-2xl font-black text-rose-600">{money(total)}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-violet-400 to-violet-600 shadow-violet-500/30">
                  <Wallet className="size-5 drop-shadow-md" />
                </span>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-bold text-slate-500">أقساط هتتخصم الشهر ده</span>
                  <span className="text-2xl font-black text-violet-600">{money(monthlyInstallments)}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/30">
                  <HandCoins className="size-5 drop-shadow-md" />
                </span>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-bold text-slate-500">عدد السلف الجارية</span>
                  <span className="text-2xl font-black">{openItems.length} <span className="text-sm text-slate-400">سلفة</span></span>
                </div>
              </div>
            </div>

            {/* ================= سجل السلف (كروت 2026) ================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" dir="rtl">
              {items.map((a, index) => {
                const paid = a.amount - a.remaining
                const pct = a.amount > 0 ? Math.min(100, (paid / a.amount) * 100) : 0
                const cancellable = a.status === 'open' && Math.abs(a.remaining - a.amount) < 0.005
                const isFemale = isFemaleName(a.employeeName)
                const theme = AVATAR_THEMES[index % AVATAR_THEMES.length]

                return (
                  <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col transition-all hover:shadow-md">
                    
                    {/* الرأس: الأفاتار والاسم */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("grid size-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg shrink-0", theme.bg, theme.shadow)}>
                          {isFemale ? <UserRound className="size-5 drop-shadow-md" strokeWidth={2.5} /> : <User className="size-5 drop-shadow-md" strokeWidth={2.5} />}
                        </div>
                        <div>
                          <span className="font-black text-base text-slate-800 dark:text-slate-100 block">{a.employeeName}</span>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                            <Calendar className="size-3" />
                            <span>{new Date(a.createdAt).toLocaleDateString('ar-EG-u-nu-latn')}</span>
                          </div>
                        </div>
                      </div>
                      
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold shadow-sm", STATUS[a.status].cls)}>
                        {STATUS[a.status].label}
                      </span>
                    </div>

                    {/* البيانات المالية */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2 mb-3">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-500">مبلغ السلفة</span>
                        <span className="font-black tabular-nums text-slate-800 dark:text-slate-200">{money(a.amount)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-500">القسط الشهري</span>
                        <span className="font-bold tabular-nums text-slate-600 dark:text-slate-400">{money(a.installment)}</span>
                      </div>
                      {a.status === 'open' && (
                        <>
                          <div className="flex justify-between text-xs pt-1 border-t border-dashed border-slate-200 dark:border-slate-700 mt-1">
                            <span className="font-bold text-slate-500">المتبقي</span>
                            <span className="font-black tabular-nums text-rose-600">{money(a.remaining)}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 mt-1">
                            <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      )}
                    </div>

                    {/* الفوتر المحدث (زرار أحمر بعرض الكارت) */}
                    <div className="mt-auto pt-2 flex flex-col gap-2">
                      {a.note && (
                        <p className="text-[10px] text-slate-500 text-center truncate bg-slate-50 py-1 rounded-md" title={a.note}>
                          {a.note}
                        </p>
                      )}
                      
                      {cancellable ? (
                        <Button 
                          variant="default" 
                          size="sm" 
                          disabled={cancelId === a.id} 
                          onClick={() => cancel(a.id)} 
                          className="w-full h-8 gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-[0_3px_0_rgb(159,18,57)] hover:shadow-none transition-all font-bold"
                        >
                          {cancelId === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}إلغاء السلفة
                        </Button>
                      ) : (
                        a.status === 'settled' && (
                          <div className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-50 rounded-lg">
                            <CheckCircle2 className="size-3.5" /> تم السداد بالكامل
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {adding && <AdvanceDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
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

  const SEC = 'relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 pt-5 shadow-[0_5px_0_rgba(15,23,42,0.06),0_14px_24px_-14px_rgba(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900'
  const FIELD = 'h-11 rounded-xl border-slate-200 bg-slate-50 text-sm font-semibold shadow-inner dark:border-slate-700 dark:bg-slate-800/50'
  const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000]
  const MONTH_CHIPS = [1, 2, 3, 6, 12]
  const chip = (on: boolean) => cn(
    'h-9 rounded-xl border px-3 text-xs font-extrabold tabular-nums transition-all active:translate-y-[3px] active:shadow-none',
    on
      ? 'border-rose-400 bg-gradient-to-b from-rose-50 to-rose-100 text-rose-700 shadow-[0_3px_0_rgb(225,29,72)] dark:from-rose-950/40 dark:to-rose-950/20 dark:text-rose-300'
      : 'border-slate-200 bg-white text-slate-600 shadow-[0_3px_0_rgb(226,232,240)] hover:bg-rose-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-[0_3px_0_rgb(15,23,42)]',
  )
  const Head = ({ icon: Icon, grad, shadow, title, hint }: { icon: React.ElementType; grad: string; shadow: string; title: React.ReactNode; hint?: string }) => (
    <div className="mb-3 flex items-center gap-3">
      <span aria-hidden className={cn('relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/25', grad, shadow)}>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
        <Icon className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-black leading-tight">{title}</h3>
        {hint ? <p className="text-[11px] font-medium text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
  const setM = (n: number) => setMonths(String(Math.min(60, Math.max(1, n))))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden border-0 bg-slate-50 p-0 dark:bg-slate-950 sm:max-w-lg" dir="rtl">
        {/* ================= الهيدر: نفس هيرو صفحة السلف ================= */}
        <DialogHeader className="relative shrink-0 gap-0 overflow-hidden bg-gradient-to-br from-rose-600 via-red-600 to-pink-700 px-4 pb-5 pt-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] sm:px-6 sm:pt-6">
          <div aria-hidden className="absolute -top-24 -right-24 size-64 rounded-full bg-white/25 blur-[60px]" />
          <div aria-hidden className="absolute -bottom-24 -left-24 size-56 rounded-full bg-pink-300/30 blur-[60px]" />
          <div className="relative flex items-center gap-4">
            <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[22px] border border-t-white/50 border-l-white/30 border-b-black/20 border-r-black/10 bg-gradient-to-br from-white/35 to-white/10 text-white shadow-[0_14px_28px_rgba(0,0,0,0.3),inset_0_2px_8px_rgba(255,255,255,0.45)] ring-1 ring-white/30 backdrop-blur-md">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <HandCoins className="relative size-8 drop-shadow-lg" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur-md">
                <Wallet className="size-3" />
                العهد والخصومات
              </div>
              <DialogTitle className="truncate text-xl font-extrabold leading-tight drop-shadow-md sm:text-2xl">سلفة جديدة</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-rose-50/90">المبلغ هيخرج من الخزنة فورًا.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6">
          {/* الموظف */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-emerald-400 to-emerald-600" />
            <Head icon={User} grad="from-emerald-400 to-emerald-600" shadow="shadow-emerald-500/35" title="الموظف" />
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className={cn(FIELD, 'w-full')}><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </section>

          {/* المبلغ */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-rose-400 to-rose-600" />
            <Head icon={HandCoins} grad="from-rose-400 to-rose-600" shadow="shadow-rose-500/35" title="مبلغ السلفة" hint="اكتب المبلغ أو اختار رقم سريع" />
            <div className="relative">
              <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" placeholder="0" className="h-14 rounded-xl border-slate-200 bg-slate-50 pe-16 text-center text-3xl font-black tabular-nums shadow-inner dark:border-slate-700 dark:bg-slate-800/50 md:text-3xl" />
              <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sm font-extrabold text-slate-400">ج.م</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} className={chip(amt === v)}>{v.toLocaleString('en-US')}</button>
              ))}
            </div>
          </section>

          {/* مدة التقسيط */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-violet-400 to-violet-600" />
            <Head icon={Calendar} grad="from-violet-400 to-violet-600" shadow="shadow-violet-500/35" title="تتخصم على كام شهر" />
            <div className="flex items-center gap-3" dir="ltr">
              <button type="button" aria-label="شهر أقل" onClick={() => setM(m - 1)} disabled={m <= 1} className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-[0_4px_0_rgb(226,232,240)] transition-all hover:bg-rose-50 active:translate-y-[4px] active:shadow-none disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_4px_0_rgb(15,23,42)]">
                <Minus className="size-5" />
              </button>
              <Input type="number" inputMode="numeric" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} dir="ltr" className="h-11 flex-1 rounded-xl border-slate-200 bg-slate-50 text-center text-xl font-black tabular-nums shadow-inner dark:border-slate-700 dark:bg-slate-800/50" />
              <button type="button" aria-label="شهر أكتر" onClick={() => setM(m + 1)} disabled={m >= 60} className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-[0_4px_0_rgb(226,232,240)] transition-all hover:bg-rose-50 active:translate-y-[4px] active:shadow-none disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_4px_0_rgb(15,23,42)]">
                <Plus className="size-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {MONTH_CHIPS.map((v) => (
                <button key={v} type="button" onClick={() => setM(v)} className={chip(m === v)}>{v === 1 ? 'شهر' : `${v} شهور`}</button>
              ))}
            </div>
            {installment > 0 ? (
              <div className="relative mt-4 flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 px-4 py-3.5 text-white shadow-[0_5px_0_rgba(159,18,57,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]">
                <div aria-hidden className="absolute -top-12 -right-10 size-32 rounded-full bg-white/25 blur-[40px]" />
                <span className="relative flex items-center gap-2 text-sm font-bold text-rose-50">
                  <TrendingDown className="size-5" aria-hidden />
                  القسط الشهري
                </span>
                <span className="relative text-2xl font-black tabular-nums drop-shadow-md">{money(installment)}</span>
              </div>
            ) : null}
          </section>

          {/* طريقة الصرف */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-amber-400 to-amber-600" />
            <Head icon={Banknote} grad="from-amber-400 to-amber-600" shadow="shadow-amber-500/35" title="اتصرفت من" />
            <div role="radiogroup" aria-label="طريقة الصرف" className="grid grid-cols-2 gap-2.5 min-[420px]:grid-cols-3">
              {PAY_METHODS.map((p) => (
                <button
                  key={p.value} type="button" role="radio" aria-checked={method === p.value}
                  onClick={() => setMethod(p.value)}
                  className={cn(
                    'flex min-h-11 items-center justify-center rounded-xl border px-2 py-2 text-center text-xs font-extrabold leading-tight transition-all active:translate-y-[3px] active:shadow-none',
                    method === p.value
                      ? 'border-amber-400 bg-gradient-to-b from-amber-50 to-amber-100 text-amber-800 shadow-[0_3px_0_rgb(217,119,6)] dark:from-amber-950/40 dark:to-amber-950/20 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-600 shadow-[0_3px_0_rgb(226,232,240)] hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-[0_3px_0_rgb(15,23,42)]',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* ملاحظة */}
          <section className={SEC}>
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-sky-400 to-sky-600" />
            <Head icon={MessageSquareText} grad="from-sky-400 to-sky-600" shadow="shadow-sky-500/35" title={<>ملاحظة <span className="text-[11px] font-medium text-muted-foreground">(اختياري)</span></>} />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب السلفة أو أي تفاصيل..." className={FIELD} />
          </section>
        </DialogBody>

        <DialogFooter className="shrink-0 flex-row justify-end gap-3 border-t bg-background px-4 py-3.5 sm:px-6">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-xl px-6 font-bold shadow-[0_4px_0_rgba(15,23,42,0.08)] transition-all hover:shadow-[0_2px_0_rgba(15,23,42,0.08)]">إلغاء</Button>
          <Button
            onClick={save} disabled={saving}
            className="h-11 gap-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 px-8 font-extrabold text-white shadow-[0_5px_0_rgb(159,18,57)] transition-all hover:from-rose-500 hover:to-pink-600 hover:shadow-[0_2px_0_rgb(159,18,57)] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
            تسجيل السلفة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
