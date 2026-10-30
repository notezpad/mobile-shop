'use client'

import * as React from 'react'
import {
  Banknote, CalendarClock, Clock, FileSpreadsheet, Loader2, MessageCircle,
  RefreshCw, Settings2, Trash2, Users, Wallet, BadgeCheck, FileClock,
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
  Avatar, CardGrid, EmptyState, HrHero, HrKpi, ItemCard, KpiGrid, ListSkeleton, MonthSwitcher, PAY_METHODS, PageShell, PanelTitle,
  Pill, SegBar, StatusChip, hrGet, hrSend, money, monthLabel, shiftMonth,
} from './hr-ui'

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
        { header: 'خصم غياب وأيام بدون تسجيل', key: 'abs', format: 'currency' },
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

  const slips = run?.payslips ?? []
  const totalWorked = slips.reduce((s, p) => s + (p.workedDays ?? 0), 0)
  const pastRuns = runs.filter((r) => r.month !== month)
  const sum = (f: (p: Slip) => number) => r2(slips.reduce((s, p) => s + f(p), 0))
  const tAbs = sum((p) => p.absenceDeduction)
  const tLate = sum((p) => p.lateDeduction)
  const tPenalty = sum((p) => p.penalty)
  const tAdv = sum((p) => p.advanceDeduction)
  const tBonus = sum((p) => p.bonus)
  const tDeductions = r2(tAbs + tLate + tPenalty)
  const isPaid = run?.status === 'paid'
  const draft = run?.status === 'draft'

  return (
    <PageShell>
      <HrHero
        theme="payroll"
        icon={Wallet}
        kicker="الموارد البشرية"
        title="الرواتب"
        subtitle="الصافي بيتحسب من أيام الشغل المسجّلة لكل موظف."
        actions={
          <>
            <MonthSwitcher
              label={month ? monthLabel(month) : '...'}
              onPrev={() => setMonth(shiftMonth(month, -1))}
              onNext={() => setMonth(shiftMonth(month, 1))}
              nextDisabled={!month || month >= currentMonth}
            />
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="h-11 flex-1 gap-1.5 bg-background/70 sm:flex-none"><Settings2 className="size-4" />قواعد الحساب</Button>
          </>
        }
        metric={{
          label: run ? `صافي رواتب ${monthLabel(run.month)}` : `رواتب ${month ? monthLabel(month) : ''}`,
          value: run ? money(run.totalNet).replace(' جنيه', '') : '—',
          unit: run ? 'جنيه' : undefined,
          loading,
          foot: run
            ? (isPaid
                ? `اتصرفت ${run.paidAt ? new Date(run.paidAt).toLocaleDateString('ar-EG-u-nu-latn') : ''} · ${slips.length} موظف`
                : `مسودة للمراجعة · ${slips.length} موظف — لسه ماتصرفش`)
            : 'لسه ماتجهزتش مسودة الشهر ده',
        }}
        viz={
          run ? (
            <SegBar
              title="الإجمالي بيتوزّع إزاي"
              segments={[
                { label: 'الصافي', value: run.totalNet, tone: 'emerald', display: money(run.totalNet) },
                { label: 'غياب', value: tAbs, tone: 'rose', display: money(tAbs) },
                { label: 'تأخير', value: tLate, tone: 'amber', display: money(tLate) },
                { label: 'أقساط سلف', value: tAdv, tone: 'violet', display: money(tAdv) },
                { label: 'جزاءات', value: tPenalty, tone: 'slate', display: money(tPenalty) },
              ]}
            />
          ) : undefined
        }
        kpis={
          run ? (
            <KpiGrid>
              <HrKpi tone={isPaid ? 'emerald' : 'amber'} icon={isPaid ? BadgeCheck : FileClock} label="الحالة" value={isPaid ? 'اتصرفت' : 'مسودة'} sub={isPaid ? (PAY_METHODS.find((m) => m.value === run.method)?.label ?? run.method ?? '') : 'للمراجعة قبل الاعتماد'} />
              <HrKpi tone="sky" icon={Users} label="عدد الموظفين" value={slips.length} sub={`أيام شغل مسجّلة: ${totalWorked}`} />
              <HrKpi tone="rose" icon={Banknote} label="إجمالي الخصومات" value={money(tDeductions)} sub="غياب + تأخير + جزاءات" />
              <HrKpi tone="violet" icon={CalendarClock} label="أقساط السلف" value={money(tAdv)} sub={tBonus > 0 ? `حوافز مضافة ${money(tBonus)}` : 'بتتخصم تلقائي'} />
            </KpiGrid>
          ) : undefined
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : !run ? (
        <EmptyState
          theme="payroll"
          icon={Wallet}
          title={`مفيش رواتب متجهزة لشهر ${month ? monthLabel(month) : ''}`}
          hint="المسودة بتتجهّز من سجلات الحضور والإجازات والسلف — تراجعها واعتمدها."
          action={
            <Button onClick={generate} disabled={busy || !month} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
              جهّز رواتب الشهر
            </Button>
          }
        />
      ) : (
        <>
          <PanelTitle icon={Wallet} title="قسايم المرتبات" action={<span className="text-xs text-muted-foreground">{slips.length} قسيمة</span>} />
          <CardGrid min={340}>
            {slips.map((p) => {
              const e = edits[p.id] ?? { bonus: '', penalty: '', note: '' }
              const unrecordedTotal = p.absentDays + p.unrecordedDays
              const rows: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }[] = [
                { label: 'الأساسي المستحق', value: money(p.payableBase), sub: p.workedDays !== null ? `${p.workedDays}${p.expectedWorkDays !== null ? ` من ${p.expectedWorkDays}` : ''} يوم شغل` : undefined },
                { label: 'غياب وبدون تسجيل', value: p.absenceDeduction > 0 ? `- ${money(p.absenceDeduction)}` : '—', sub: unrecordedTotal > 0 ? `${unrecordedTotal} يوم` : undefined, tone: p.absenceDeduction > 0 ? 'text-rose-600 dark:text-rose-400' : '' },
                { label: 'تأخير', value: p.lateDeduction > 0 ? `- ${money(p.lateDeduction)}` : '—', sub: p.lateMinutes > 0 ? `${p.lateMinutes} دقيقة` : undefined, tone: p.lateDeduction > 0 ? 'text-rose-600 dark:text-rose-400' : '' },
                { label: 'قسط سلفة', value: p.advanceDeduction > 0 ? `- ${money(p.advanceDeduction)}` : '—', tone: p.advanceDeduction > 0 ? 'text-violet-600 dark:text-violet-400' : '' },
              ]
              return (
                <ItemCard key={p.id} accent={isPaid ? 'bg-emerald-500' : 'bg-warning'}>
                  <div className="flex items-start gap-3 p-4 pb-3 ps-5">
                    <Avatar name={p.employeeName} className="size-12 text-lg" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-extrabold">{p.employeeName}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.workedDays === 0 && <Pill tone="rose">بدون أيام شغل مسجّلة</Pill>}
                        {p.workedDays !== null && p.workedDays > 0 && p.unrecordedDays > 0 && <Pill tone="amber">{p.unrecordedDays} يوم بدون تسجيل</Pill>}
                        {p.pendingDays > 0 && <Pill tone="sky">{p.pendingDays} يوم متبقي</Pill>}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-xl font-extrabold leading-none tabular-nums text-emerald-700 dark:text-emerald-400">{money(p.net)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">الصافي</div>
                    </div>
                  </div>

                  <dl className="divide-y border-y bg-muted/20 text-sm">
                    {rows.map((r) => (
                      <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2 ps-5">
                        <dt className="text-muted-foreground">
                          {r.label}
                          {r.sub && <span className="ms-1.5 text-[11px]">({r.sub})</span>}
                        </dt>
                        <dd className={`font-bold tabular-nums ${r.tone ?? ''}`}>{r.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="grid grid-cols-2 gap-2.5 px-4 py-3 ps-5">
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">+ حافز</span>
                      {draft ? (
                        <Input type="number" inputMode="decimal" min={0} dir="ltr" className="h-9" value={e.bonus} placeholder="0"
                          onChange={(ev) => setEdits((st) => ({ ...st, [p.id]: { ...e, bonus: ev.target.value } }))} />
                      ) : (
                        <div className="flex h-9 items-center text-sm font-bold tabular-nums">{p.bonus > 0 ? `+ ${money(p.bonus)}` : '—'}</div>
                      )}
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400">− جزاء</span>
                      {draft ? (
                        <Input type="number" inputMode="decimal" min={0} dir="ltr" className="h-9" value={e.penalty} placeholder="0"
                          onChange={(ev) => setEdits((st) => ({ ...st, [p.id]: { ...e, penalty: ev.target.value } }))} />
                      ) : (
                        <div className="flex h-9 items-center text-sm font-bold tabular-nums">{p.penalty > 0 ? `- ${money(p.penalty)}` : '—'}</div>
                      )}
                    </label>
                  </div>

                  <div className="mt-auto border-t bg-muted/30 px-3 py-2 ps-4">
                    <WhatsAppSlip slip={p} month={run.month} shop={shopName} />
                  </div>
                </ItemCard>
              )
            })}
          </CardGrid>

          {/* شريط الإجراءات */}
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-card/90 p-3 shadow-lg backdrop-blur-md">
            {draft ? (
              <>
                <Button
                  onClick={async () => { if (!dirty || (await saveEdits(true))) setPayOpen(true) }}
                  disabled={busy} className="gap-1.5"
                >
                  <Wallet className="size-4" />اعتماد وصرف الرواتب
                </Button>
                {dirty && <Button variant="secondary" onClick={() => saveEdits()} disabled={busy}>حفظ التعديلات</Button>}
                <Button variant="outline" onClick={async () => { if (!dirty || (await saveEdits(true))) generate() }} disabled={busy} className="gap-1.5">
                  <RefreshCw className="size-4" />أعد الحساب
                </Button>
                <Button variant="ghost" onClick={removeDraft} disabled={busy} className="gap-1.5 text-rose-600"><Trash2 className="size-4" />حذف المسودة</Button>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="size-4" />
                اتصرفت {run.paidAt ? new Date(run.paidAt).toLocaleDateString('ar-EG-u-nu-latn') : ''} من {PAY_METHODS.find((m) => m.value === run.method)?.label ?? run.method}
              </p>
            )}
            <Button variant="outline" onClick={exportExcel} className="gap-1.5 sm:ms-auto"><FileSpreadsheet className="size-4" />Excel</Button>
          </div>
        </>
      )}

      {pastRuns.length > 0 && (
        <section>
          <PanelTitle icon={Clock} title="دورات سابقة" />
          <CardGrid min={240}>
            {pastRuns.map((r) => (
              <button
                key={r.id} type="button" onClick={() => setMonth(r.month)}
                className="group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Wallet className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{monthLabel(r.month)}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">{money(r.totalNet)} · {r.count} موظف</span>
                </span>
                <StatusChip tone={r.status === 'paid' ? 'emerald' : 'amber'}>{r.status === 'paid' ? 'اتصرفت' : 'مسودة'}</StatusChip>
              </button>
            ))}
          </CardGrid>
        </section>
      )}

      {payOpen && run && (
        <PayDialog
          run={run}
          onClose={() => setPayOpen(false)}
          onPaid={async () => { setPayOpen(false); await refresh() }}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </PageShell>
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
        variant="ghost" size="sm" className="gap-1 text-muted-foreground"
        title={slip.phone ? 'رقم الموبايل غير صالح — اضغط لنسخ القسيمة' : 'مفيش رقم موبايل — اضغط لنسخ القسيمة'}
        onClick={() => { navigator.clipboard?.writeText(text).then(() => toast.success('تم نسخ القسيمة'), () => toast.error('تعذّر النسخ')) }}
      >
        نسخ
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" size="sm" className="gap-1 text-emerald-600">
      <a href={`https://wa.me/${num}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" />واتساب
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
      <DialogContent mobileSheet className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>صرف رواتب {monthLabel(run.month)}</DialogTitle>
          <DialogDescription>العملية دي بتتسجل مرة واحدة ومش بتتكرر.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/60 p-3 text-sm">
            <div className="flex justify-between"><span>هيخرج من الخزنة</span><b>{money(run.totalNet)}</b></div>
            {advances > 0 && <div className="mt-1 flex justify-between text-muted-foreground"><span>أقساط سلف هتتخصم</span><span>{money(advances)}</span></div>}
          </div>
          <div className="space-y-1.5">
            <Label>الصرف من</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>رجوع</Button>
          <Button onClick={pay} disabled={busy} className="gap-1.5">{busy && <Loader2 className="size-4 animate-spin" />}تأكيد الصرف</Button>
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
      <DialogContent mobileSheet className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle>قواعد الحساب</DialogTitle>
          <DialogDescription>القيم الافتراضية مناسبة لأغلب المحلات. الحساب دايمًا على الأيام الفعلية المسجّلة.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3.5 py-4">
          {!s ? <ListSkeleton rows={3} /> : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>بداية الشغل</Label>
                  <Input type="time" dir="ltr" value={s.shiftStart} onChange={(e) => setS({ ...s, shiftStart: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>ساعات الشغل في اليوم</Label>
                  <Input type="number" dir="ltr" min={1} max={24} value={s.shiftHours} onChange={(e) => setS({ ...s, shiftHours: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>فترة السماح للتأخير (دقيقة)</Label>
                <Input type="number" dir="ltr" min={0} max={240} value={s.graceMinutes} onChange={(e) => setS({ ...s, graceMinutes: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground">لو التأخير أقل من أو يساوي الرقم ده مفيش خصم. لو أكتر بيتخصم كله.</p>
              </div>
              <div className="space-y-1.5">
                <Label>خصم التأخير</Label>
                <Select value={s.lateMode} onValueChange={(v) => setS({ ...s, lateMode: v as Settings['lateMode'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_minute">بالدقيقة</SelectItem>
                    <SelectItem value="none">بدون خصم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>قيمة اليوم = الراتب ÷</Label>
                <Select value={String(s.dayDivisor)} onValueChange={(v) => setS({ ...s, dayDivisor: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 يوم</SelectItem>
                    <SelectItem value="26">26 يوم عمل</SelectItem>
                    <SelectItem value="0">أيام الشهر الفعلية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>رصيد الإجازة السنوية (يوم)</Label>
                <Input type="number" dir="ltr" min={0} max={90} value={s.annualLeaveDays} onChange={(e) => setS({ ...s, annualLeaveDays: Number(e.target.value) })} />
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving || !s} className="gap-1.5">{saving && <Loader2 className="size-4 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
