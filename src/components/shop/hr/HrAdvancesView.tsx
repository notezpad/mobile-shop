'use client'

import * as React from 'react'
import { HandCoins, Loader2, Plus, Undo2, Wallet, TrendingDown, Calendar, User, UserRound, CheckCircle2 } from 'lucide-react'
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
              <Button 
                onClick={() => setAdding(true)} 
                className="bg-white text-rose-700 font-bold hover:bg-rose-50 hover:text-rose-800 shadow-[0_6px_0_rgb(254,205,211)] hover:shadow-[0_2px_0_rgb(254,205,211)] hover:translate-y-[4px] transition-all gap-1.5"
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
                  <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col transition-all hover:shadow-md hover:-translate-y-1">
                    
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
                          className="w-full h-8 gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white shadow-[0_3px_0_rgb(159,18,57)] hover:translate-y-[2px] hover:shadow-none transition-all font-bold"
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-rose-600 text-white shadow-md">
              <HandCoins className="size-4" />
            </span>
            سلفة جديدة
          </DialogTitle>
          <DialogDescription>المبلغ هيخرج من الخزنة فورًا.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3.5 py-4">
          <div className="space-y-1.5">
            <Label>الموظف</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="shadow-inner"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
              <SelectContent>{emps.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" className="shadow-inner font-bold" />
            </div>
            <div className="space-y-1.5">
              <Label>تتخصم على كام شهر</Label>
              <Input type="number" inputMode="numeric" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} dir="ltr" className="shadow-inner font-bold" />
            </div>
          </div>
          {installment > 0 && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 font-bold border border-rose-100">
              القسط الشهري: <b>{money(installment)}</b>
            </p>
          )}
          <div className="space-y-1.5">
            <Label>اتصرفت من</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="shadow-inner"><SelectValue /></SelectTrigger>
              <SelectContent>{PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="shadow-inner" />
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-[0_4px_0_rgb(159,18,57)] hover:shadow-[0_2px_0_rgb(159,18,57)] hover:translate-y-[2px] transition-all">
            {saving && <Loader2 className="size-4 animate-spin" />}
            تسجيل السلفة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}