'use client'

import * as React from 'react'
import { CalendarOff, HandCoins, KeyRound, Loader2, FileSpreadsheet, Phone, Plus, Search, Pencil, UserCheck, UserX, Users, Wallet, Fingerprint, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmployeeImportDialog } from './EmployeeImportDialog'
import {
  DAY_NAMES, EmptyState, HR_THEMES, HrHero, HrKpi, KpiGrid, ListSkeleton, PageShell, Pill, StatusChip,
  Avatar, CardGrid, FilterPill, ItemCard, MiniBars, Ring, SearchBox, Toolbar,
  PAY_METHODS, hrGet, hrSend, money, monthLabel,
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

export function HrEmployeesView() {
  const [items, setItems] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<'active' | 'inactive' | 'all'>('active')
  const [sort, setSort] = React.useState<'name' | 'salary'>('name')
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

  const visible = items
    .filter((e) => {
      if (status === 'active' && !e.active) return false
      if (status === 'inactive' && e.active) return false
      const q = search.trim().toLowerCase()
      return !q || e.name.toLowerCase().includes(q) || (e.jobTitle ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => (sort === 'salary' ? b.baseSalary - a.baseSalary : a.name.localeCompare(b.name, 'ar')))
  const inactiveCount = items.filter((e) => !e.active).length
  const activeItems = items.filter((e) => e.active)
  const totalPayroll = activeItems.reduce((s, e) => s + e.baseSalary, 0)
  const avgSalary = activeItems.length ? totalPayroll / activeItems.length : 0
  const withPin = activeItems.filter((e) => e.hasPin).length
  const pinPct = activeItems.length ? Math.round((withPin / activeItems.length) * 100) : 0
  const advActive = activeItems.filter((e) => e.advanceRemaining > 0)
  const advTotal = advActive.reduce((s, e) => s + e.advanceRemaining, 0)
  const offDays = DAY_NAMES.map((d, i) => ({ label: d.replace('ال', ''), value: activeItems.filter((e) => e.weeklyOffDay === i).length }))

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
      <HrHero
        theme="employees"
        icon={Users}
        kicker="الموارد البشرية"
        title="الموظفين"
        subtitle="بيانات الفريق ورواتبهم الأساسية وحالة كشك الحضور."
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)} className="flex-1 gap-1.5 bg-background/70 sm:flex-none"><FileSpreadsheet className="size-4" />استيراد Excel</Button>
            <Button onClick={() => setEditing('new')} className="flex-1 gap-1.5 sm:flex-none"><Plus className="size-4" />موظف جديد</Button>
          </>
        }
        metric={{
          label: 'إجمالي الرواتب الشهرية (أساسي)',
          value: money(totalPayroll).replace(' جنيه', ''),
          unit: 'جنيه',
          loading,
          foot: `${activeItems.length} موظف نشط · متوسط الراتب ${money(Math.round(avgSalary))}`,
        }}
        viz={
          <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="flex items-center gap-3.5 rounded-2xl border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
              <Ring value={pinPct} tone={pinPct === 100 ? 'emerald' : 'amber'} size={76}>
                <span className="text-base font-extrabold tabular-nums">{pinPct}%</span>
              </Ring>
              <div className="min-w-0">
                <p className="text-xs font-bold text-muted-foreground">تغطية كشك الحضور</p>
                <p className="mt-0.5 text-sm font-extrabold tabular-nums">{withPin} / {activeItems.length}</p>
                <p className="text-[11px] text-muted-foreground">عندهم PIN</p>
              </div>
            </div>
            <MiniBars title="الإجازة الأسبوعية — عدد الموظفين لكل يوم" data={offDays} tone="sky" highlight={new Date().getDay()} />
          </div>
        }
        kpis={
          <KpiGrid>
            <HrKpi tone="sky" icon={Users} loading={loading} label="موظفين نشطين" value={activeItems.length} sub={inactiveCount > 0 ? `${inactiveCount} موقوف` : 'كلهم نشطين'} />
            <HrKpi tone="emerald" icon={Banknote} loading={loading} label="متوسط الراتب" value={money(Math.round(avgSalary))} sub="لكل موظف نشط" />
            <HrKpi tone={pinPct === 100 ? 'emerald' : 'amber'} icon={Fingerprint} loading={loading} label="كشك الحضور (PIN)" value={`${withPin} / ${activeItems.length}`} sub={withPin < activeItems.length ? 'الباقي يسجل حضورهم يدوي' : 'كلهم بيسجلوا بالـ PIN'} progress={pinPct} />
            <HrKpi tone="violet" icon={HandCoins} loading={loading} label="سلف جارية" value={advActive.length} sub={money(advTotal)} />
          </KpiGrid>
        }
      />

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
          <Toolbar>
            <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الوظيفة" />
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={status === 'active'} onClick={() => setStatus('active')} count={activeItems.length} dot="bg-emerald-500">نشطين</FilterPill>
              {inactiveCount > 0 && <FilterPill active={status === 'inactive'} onClick={() => setStatus('inactive')} count={inactiveCount} dot="bg-slate-400">موقوفين</FilterPill>}
              {inactiveCount > 0 && <FilterPill active={status === 'all'} onClick={() => setStatus('all')} count={items.length}>الكل</FilterPill>}
            </div>
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <div className="flex flex-wrap gap-1.5">
              <FilterPill active={sort === 'name'} onClick={() => setSort('name')}>الاسم</FilterPill>
              <FilterPill active={sort === 'salary'} onClick={() => setSort('salary')}>الأعلى راتبًا</FilterPill>
            </div>
          </Toolbar>

          {visible.length === 0 ? (
            <EmptyState theme="employees" icon={Search} title="مفيش نتائج" hint="جرّب كلمة بحث تانية." />
          ) : (
            <CardGrid min={310}>
              {visible.map((e) => (
                <ItemCard key={e.id} dim={!e.active} accent={e.active ? 'bg-info' : 'bg-muted-foreground/40'}>
                  <div className="flex items-start gap-3 p-4 pb-3 ps-5">
                    <Avatar name={e.name} className="size-12 text-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="truncate text-base font-extrabold">{e.name}</h3>
                        {!e.active && <StatusChip tone="slate">موقوف</StatusChip>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.jobTitle || 'بدون مسمى وظيفي'}</p>
                    </div>
                    <div className="text-end">
                      <div className="text-lg font-extrabold leading-none tabular-nums">{money(e.baseSalary)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">راتب شهري</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 ps-5">
                    {e.hasPin ? <Pill tone="emerald">PIN مفعّل</Pill> : <Pill tone="amber">بدون PIN</Pill>}
                    {e.advanceRemaining > 0 && <Pill tone="violet">سلفة {money(e.advanceRemaining)}</Pill>}
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                      <CalendarOff className="size-3" />إجازة {DAY_NAMES[e.weeklyOffDay]}
                    </span>
                    {e.phone && (
                      <span dir="ltr" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                        <Phone className="size-3" />{e.phone}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 border-t bg-muted/30 px-3 py-2.5 ps-4">
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing(e)}><Pencil className="size-3.5" />تعديل</Button>
                    {e.active && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-amber-700 dark:text-amber-400" onClick={() => setSettling(e)}>
                        <HandCoins className="size-3.5" />تصفية
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className={`ms-auto gap-1.5 ${e.active ? 'text-rose-600' : 'text-emerald-600'}`}
                      onClick={() => toggleActive(e)}
                    >
                      {e.active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                      {e.active ? 'إيقاف' : 'تفعيل'}
                    </Button>
                  </div>
                </ItemCard>
              ))}
            </CardGrid>
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
