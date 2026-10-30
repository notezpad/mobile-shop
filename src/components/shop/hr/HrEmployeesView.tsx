'use client'

import * as React from 'react'
import {
  BadgeCheck, CalendarOff, HandCoins, KeyRound, Loader2, FileSpreadsheet, Phone, Plus, Search, Pencil, UserCheck, UserX, Users, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmployeeImportDialog } from './EmployeeImportDialog'
import {
  DAY_NAMES, EmptyState, GlassRail, GlassStat, HrHero, ListSkeleton, ModuleDock, PageShell, Pill, Reveal,
  PAY_METHODS, HR_THEMES, hrGet, hrSend, ink, money, monthLabel, num,
} from './hr-ui'

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
}

interface FormState {
  name: string
  jobTitle: string
  phone: string
  baseSalary: string
  weeklyOffDay: string
  hireDate: string
  pin: string
}
const EMPTY: FormState = { name: '', jobTitle: '', phone: '', baseSalary: '', weeklyOffDay: '5', hireDate: '', pin: '' }

/** معاينة التصفية من الـ API */
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

/* أزواج تدرّجات هوية البطاقات — بتتحدد من اسم الموظف */
const IDENTITY: [string, string][] = [
  ['#0ea5e9', '#6366f1'],
  ['#10b981', '#14b8a6'],
  ['#f59e0b', '#f97316'],
  ['#8b5cf6', '#d946ef'],
  ['#ec4899', '#f43f5e'],
  ['#06b6d4', '#0ea5e9'],
  ['#84cc16', '#10b981'],
  ['#f43f5e', '#f97316'],
]
const identityOf = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return IDENTITY[h % IDENTITY.length]
}

export function HrEmployeesView() {
  const [items, setItems] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [editing, setEditing] = React.useState<Employee | 'new' | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [settling, setSettling] = React.useState<Employee | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await hrGet<{ items: Employee[] }>('/api/hr/employees')
      setItems(d.items)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل الموظفين')
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { load() }, [load])
  useDataRefresh(['hr'], load)

  const visible = items.filter((e) => {
    if (!showInactive && !e.active) return false
    const q = search.trim().toLowerCase()
    return !q || e.name.toLowerCase().includes(q) || (e.jobTitle ?? '').toLowerCase().includes(q)
  })
  const inactiveCount = items.filter((e) => !e.active).length
  const activeItems = items.filter((e) => e.active)
  const totalPayroll = activeItems.reduce((s, e) => s + e.baseSalary, 0)
  const withPin = activeItems.filter((e) => e.hasPin).length

  const toggleActive = async (e: Employee) => {
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
    <PageShell>
      <ModuleDock exclude="employees" />

      <HrHero
        theme="employees"
        icon={Users}
        kicker="الموارد البشرية"
        title="الموظفين"
        subtitle="بطاقة لكل موظف في فريقك — الراتب، الوظيفة، والـ PIN."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImporting(true)} className="gap-1.5"><FileSpreadsheet className="size-4" />استيراد Excel</Button>
            <Button onClick={() => setEditing('new')} className="gap-1.5"><Plus className="size-4" />موظف جديد</Button>
          </div>
        }
      >
        {!loading && items.length > 0 && (
          <GlassRail>
            <GlassStat label="عدد الموظفين" value={<>{activeItems.length}<span className="text-xs font-bold text-muted-foreground"> نشط</span></>} foot={inactiveCount > 0 ? `${inactiveCount} موقوف` : 'كلهم نشطين'} />
            <GlassStat label="رواتب شهرية إجمالية" value={<span className="whitespace-nowrap">{num(totalPayroll)} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} foot="أساسي بدون خصومات" />
            <GlassStat label="كشك الحضور (PIN)" value={`${withPin} / ${activeItems.length}`} foot={withPin < activeItems.length ? 'الباقي يسجّل يدوي' : 'كلهم بيسجلوا بالـ PIN'} />
            <GlassStat label="سلف جارية" value={activeItems.filter((e) => e.advanceRemaining > 0).length} foot={money(activeItems.reduce((s, e) => s + e.advanceRemaining, 0))} />
          </GlassRail>
        )}
      </HrHero>

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
          {/* شريط البحث */}
          <Reveal>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الوظيفة" className="ps-9" />
              </div>
              {inactiveCount > 0 && (
                <Button variant={showInactive ? 'secondary' : 'outline'} size="sm" onClick={() => setShowInactive((v) => !v)}>
                  {showInactive ? 'إخفاء الموقوفين' : `عرض الموقوفين (${inactiveCount})`}
                </Button>
              )}
            </div>
          </Reveal>

          {visible.length === 0 ? (
            <EmptyState theme="employees" icon={Search} title="مفيش نتائج" hint="جرّب كلمة بحث تانية." />
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((e, idx) => (
                <EmployeeCard
                  key={e.id}
                  e={e}
                  idx={idx}
                  onEdit={() => setEditing(e)}
                  onSettle={() => setSettling(e)}
                  onToggle={() => toggleActive(e)}
                />
              ))}
            </div>
          )}
        </>
      )}

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
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </PageShell>
  )
}

/* ─────────────── بطاقة الموظف — شكل كارت تعريف شخصي ─────────────── */

function EmployeeCard({
  e, idx, onEdit, onSettle, onToggle,
}: {
  e: Employee
  idx: number
  onEdit: () => void
  onSettle: () => void
  onToggle: () => void
}) {
  const [a, b] = identityOf(e.name)
  return (
    <Reveal delay={Math.min(idx * 45, 270)} className="h-full">
      <article
        className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${e.active ? '' : 'opacity-65 saturate-50'}`}
      >
        {/* شريط الهوية العلوي */}
        <div className="relative h-[74px] shrink-0" style={{ background: `linear-gradient(130deg, ${a}, ${b})` }}>
          <div
            aria-hidden
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
              backgroundSize: '11px 11px',
            }}
          />
          <span className="absolute top-2.5 end-3.5 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm">
            #{String(e.id).padStart(3, '0')}
          </span>
          <span className="absolute top-2.5 start-3.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
            employee
          </span>
          {/* الأفاتار العائم */}
          <span
            className="absolute -bottom-7 start-4 grid size-16 place-items-center rounded-[22px] border-[4px] border-card text-2xl font-black text-white shadow-lg"
            style={{ background: `linear-gradient(140deg, ${a}, color-mix(in srgb, ${b} 60%, black))` }}
          >
            {e.name.trim().charAt(0)}
          </span>
          {/* ثقب الشريط */}
          <span aria-hidden className="absolute -top-2 start-1/2 size-4 -translate-x-1/2 rounded-full bg-background shadow-inner ring-1 ring-black/10" />
        </div>

        {/* جسم البطاقة */}
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3.5 pt-9">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-base font-extrabold">{e.name}</h3>
            {!e.active && <Pill tone="slate">موقوف</Pill>}
            {e.hasPin ? <Pill tone="emerald">PIN مفعّل</Pill> : <Pill tone="amber">بدون PIN</Pill>}
          </div>
          {e.jobTitle && <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{e.jobTitle}</p>}

          {/* بيانات البطاقة */}
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <Field icon={Wallet} label="الراتب الشهري">
              <span className="text-[15px] font-black tabular-nums" style={{ color: ink(HR_THEMES.employees.hex, 82) }}>
                {num(e.baseSalary)}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground"> جنيه</span>
            </Field>
            <Field icon={CalendarOff} label="الراحة الأسبوعية">{DAY_NAMES[e.weeklyOffDay]}</Field>
            <Field icon={Phone} label="الموبايل">
              {e.phone ? <span dir="ltr">{e.phone}</span> : <span className="text-muted-foreground/50">—</span>}
            </Field>
            <Field icon={BadgeCheck} label="التعيين">
              {e.hireDate
                ? new Date(`${e.hireDate}T12:00:00Z`).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
                : <span className="text-muted-foreground/50">—</span>}
            </Field>
          </div>

          {e.advanceRemaining > 0 && (
            <div className="mt-2.5 flex items-center justify-between rounded-xl bg-violet-500/10 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                <HandCoins className="size-3.5" />سلفة جارية
              </span>
              <span className="text-xs font-black tabular-nums text-violet-700 dark:text-violet-300">{money(e.advanceRemaining)}</span>
            </div>
          )}

          {/* شريط الأوامر */}
          <div className="mt-auto flex items-center gap-1.5 border-t pt-3 [margin-top:auto]" style={{ borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)' }}>
            <Button variant="outline" size="sm" onClick={onEdit} className="h-8 flex-1 gap-1.5 text-xs"><Pencil className="size-3.5" />تعديل</Button>
            {e.active && (
              <Button variant="outline" size="sm" onClick={onSettle} className="h-8 flex-1 gap-1.5 text-xs text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                <HandCoins className="size-3.5" />تصفية
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onToggle} className="h-8 flex-1 gap-1.5 text-xs">
              {e.active ? <span className="flex items-center gap-1.5 text-rose-600"><UserX className="size-3.5" />إيقاف</span>
                : <span className="flex items-center gap-1.5 text-emerald-600"><UserCheck className="size-3.5" />تفعيل</span>}
            </Button>
          </div>
        </div>
      </article>
    </Reveal>
  )
}

function Field({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <div className="mt-0.5 truncate text-[13px] font-bold">{children}</div>
    </div>
  )
}

/* ─────────────── حوار إضافة / تعديل موظف ─────────────── */

function EmployeeDialog({
  employee, onClose, onSaved,
}: { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = React.useState<FormState>(
    employee
      ? {
          name: employee.name, jobTitle: employee.jobTitle ?? '', phone: employee.phone ?? '',
          baseSalary: String(employee.baseSalary), weeklyOffDay: String(employee.weeklyOffDay),
          hireDate: employee.hireDate, pin: '',
        }
      : EMPTY,
  )
  const [saving, setSaving] = React.useState(false)
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className={`grid size-8 place-items-center rounded-xl ${HR_THEMES.employees.solid} ${HR_THEMES.employees.solidFg}`}>
              {employee ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            </span>
            {employee ? 'تعديل بيانات الموظف' : 'موظف جديد'}
          </DialogTitle>
          <DialogDescription>الاسم والراتب كفاية للبداية.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3.5 py-4">
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={f.name} onChange={set('name')} autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>الراتب الشهري (جنيه)</Label>
              <Input type="number" inputMode="decimal" min={0} value={f.baseSalary} onChange={set('baseSalary')} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>يوم الإجازة الأسبوعية</Label>
              <Select value={f.weeklyOffDay} onValueChange={(v) => setF((s) => ({ ...s, weeklyOffDay: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>الوظيفة (اختياري)</Label>
              <Input value={f.jobTitle} onChange={set('jobTitle')} placeholder="كاشير / بائع / مخزن" />
            </div>
            <div className="space-y-1.5">
              <Label>الموبايل (اختياري)</Label>
              <Input value={f.phone} onChange={set('phone')} dir="ltr" inputMode="tel" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>تاريخ التعيين (اختياري)</Label>
              <Input type="date" value={f.hireDate} onChange={set('hireDate')} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><KeyRound className="size-3.5" />PIN الحضور (4 إلى 6 أرقام)</Label>
              <Input
                value={f.pin} onChange={set('pin')} dir="ltr" inputMode="numeric" maxLength={6}
                placeholder={employee?.hasPin ? 'سيبه فاضي للإبقاء على الحالي' : 'اختياري'}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * تصفية حساب موظف بيمشي — كل مستحقاته غير المدفوعة في عملية واحدة:
 * صرف لحد آخر يوم شغل + خصم باقي السلف بالكامل + قفل حسابه.
 */
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
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className={`grid size-8 place-items-center rounded-xl ${HR_THEMES.employees.solid} ${HR_THEMES.employees.solidFg}`}>
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
                <div className="rounded-xl border">
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

              <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
                <div className="flex justify-between"><span>إجمالي المستحقات</span><b className="tabular-nums">{money(preview.totalGross)}</b></div>
                {preview.advanceDeduction > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>خصم باقي السلف بالكامل</span>
                    <span className="tabular-nums">- {money(preview.advanceDeduction)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 text-base font-extrabold">
                  <span>الصافي</span><span className="tabular-nums">{money(preview.net)}</span>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>ملاحظة (اختياري)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: استلام مستحقات وترك الشغل" />
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={busy}>رجوع</Button>
          <Button onClick={pay} disabled={busy || loading || !preview || !!err} className="gap-1.5">
            {busy && <Loader2 className="size-4 animate-spin" />}
            اتصرف واقفل حسابه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
