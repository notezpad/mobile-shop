'use client'

import * as React from 'react'
import { Loader2, FileSpreadsheet, Plus, Search, Pencil, UserX, UserCheck, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EmployeeImportDialog } from './EmployeeImportDialog'
import { DAY_NAMES, EmptyState, ListSkeleton, PageHead, PageShell, Pill, hrGet, hrSend, money } from './hr-ui'

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

export function HrEmployeesView() {
  const [items, setItems] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [editing, setEditing] = React.useState<Employee | 'new' | null>(null)
  const [importing, setImporting] = React.useState(false)

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
      <PageHead
        title="الموظفين"
        subtitle="ضيف الموظف بالاسم والراتب ويوم الإجازة، والباقي اختياري."
        actions={<div className="flex gap-2"><Button variant="outline" onClick={() => setImporting(true)} className="gap-1.5"><FileSpreadsheet className="size-4" />استيراد Excel</Button><Button onClick={() => setEditing('new')} className="gap-1.5"><Plus className="size-4" />موظف جديد</Button></div>}
      />

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

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          title="لسه مفيش موظفين"
          hint="ضيف أول موظف عشان تبدأ تسجّل الحضور وتحسب الرواتب."
          action={<Button onClick={() => setEditing('new')} className="gap-1.5"><Plus className="size-4" />ضيف أول موظف</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="مفيش نتائج" hint="جرّب كلمة بحث تانية." />
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => (
            <li key={e.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 sm:p-4 ${e.active ? '' : 'opacity-60'}`}>
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-extrabold text-primary">
                {e.name.trim().charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-bold">{e.name}</span>
                  {!e.active && <Pill tone="slate">موقوف</Pill>}
                  {e.hasPin ? <Pill tone="emerald">PIN مفعّل</Pill> : <Pill tone="amber">بدون PIN</Pill>}
                  {e.advanceRemaining > 0 && <Pill tone="violet">سلفة {money(e.advanceRemaining)}</Pill>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[e.jobTitle, e.phone, `إجازة ${DAY_NAMES[e.weeklyOffDay]}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="text-end">
                <div className="text-base font-extrabold tabular-nums">{money(e.baseSalary)}</div>
                <div className="text-[11px] text-muted-foreground">راتب شهري</div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => setEditing(e)}><Pencil className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label={e.active ? 'إيقاف' : 'تفعيل'} onClick={() => toggleActive(e)}>
                  {e.active ? <UserX className="size-4 text-rose-600" /> : <UserCheck className="size-4 text-emerald-600" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {importing && <EmployeeImportDialog onClose={() => setImporting(false)} onDone={() => { setImporting(false); load() }} />}
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
          <DialogTitle>{employee ? 'تعديل بيانات الموظف' : 'موظف جديد'}</DialogTitle>
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
