'use client'

import * as React from 'react'
import {
  CalendarRange, CheckCircle2, Clock, FileSpreadsheet, Loader2, MessageCircle, MinusCircle,
  PlusCircle, RefreshCw, Settings2, Trash2, Wallet,
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
  EmptyState, GlassRail, GlassStat, HrHero, ListSkeleton, ModuleDock, PageShell, Pill, Panel, PanelTitle, Reveal, StatusChip,
  HR_THEMES, PAY_METHODS, hrGet, hrSend, ink, money, monthLabel, num, shiftMonth, tint,
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
const HEX = HR_THEMES.payroll.hex

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

  const totalWorked = run?.payslips.reduce((s, p) => s + (p.workedDays ?? 0), 0) ?? 0
  const pastRuns = runs.filter((r) => r.month !== month)

  return (
    <PageShell>
      <ModuleDock exclude="payroll" />

      <HrHero
        theme="payroll"
        icon={Wallet}
        kicker="الموارد البشرية"
        title="الرواتب"
        subtitle="الصافي بيتحسب من أيام الشغل المسجّلة لكل موظف."
        actions={<Button variant="outline" onClick={() => setSettingsOpen(true)} className="gap-1.5"><Settings2 className="size-4" />قواعد الحساب</Button>}
      >
        {run && (
          <GlassRail>
            <GlassStat
              label="الحالة"
              value={run.status === 'paid' ? 'اتصرفت' : 'مسودة'}
              foot={run.status === 'paid' && run.paidAt ? new Date(run.paidAt).toLocaleDateString('ar-EG-u-nu-latn') : 'للمراجعة قبل الاعتماد'}
            />
            <GlassStat label="عدد الموظفين" value={run.payslips.length} />
            <GlassStat label="صافي الرواتب" value={<span className="whitespace-nowrap">{num(run.totalNet)} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} foot={`أيام شغل مسجّلة: ${totalWorked}`} />
            <GlassStat label="إجمالي أقساط السلف" value={<span className="whitespace-nowrap">{num(run.payslips.reduce((s, p) => s + p.advanceDeduction, 0))} <span className="text-xs font-bold text-muted-foreground">جنيه</span></span>} />
          </GlassRail>
        )}
      </HrHero>

      {/* ════ اختيار الشهر ════ */}
      <Reveal>
        <Panel className="mb-4">
          <div className="flex items-center gap-2 p-3">
            <Button variant="outline" size="icon" aria-label="الشهر السابق" onClick={() => setMonth(shiftMonth(month, -1))}><CalendarRange className="size-4 rotate-180" /></Button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-lg font-extrabold">{month ? monthLabel(month) : '...'}</div>
              {month === currentMonth && <div className="text-[11px] font-bold text-teal-600 dark:text-teal-400">الشهر الحالي</div>}
            </div>
            <Button variant="outline" size="icon" aria-label="الشهر التالي" disabled={!month || month >= currentMonth} onClick={() => setMonth(shiftMonth(month, 1))}><CalendarRange className="size-4" /></Button>
          </div>
        </Panel>
      </Reveal>

      {loading ? (
        <ListSkeleton />
      ) : !run ? (
        <Reveal delay={40}>
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
        </Reveal>
      ) : (
        <>
          {/* ════ خط سير الدورة ════ */}
          <Reveal delay={30}>
            <div className="mb-4 flex items-center justify-center gap-0 rounded-2xl border bg-card p-3 shadow-sm">
              {(['مسودة', 'مراجعة واعتماد', 'صرف'] as const).map((step, i) => {
                const done = run.status === 'paid' || (i === 0)
                const current = run.status === 'draft' ? i === 1 : i === 2
                return (
                  <React.Fragment key={step}>
                    {i > 0 && <div className={`mx-1.5 h-0.5 w-6 sm:w-10 rounded-full ${run.status === 'paid' ? 'bg-emerald-500' : 'bg-border'}`} />}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`grid size-6 place-items-center rounded-full text-[10px] font-black ${
                          run.status === 'paid' ? 'bg-emerald-500 text-white'
                            : current ? 'text-white' : 'bg-muted text-muted-foreground'
                        }`}
                        style={run.status === 'draft' && current ? { background: HEX } : undefined}
                      >
                        {done && run.status === 'paid' ? '✓' : i + 1}
                      </span>
                      <span className={`text-[11px] font-bold sm:text-xs ${current && run.status === 'draft' ? '' : 'text-muted-foreground'}`} style={current && run.status === 'draft' ? { color: ink(HEX, 82) } : undefined}>
                        {step}
                      </span>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </Reveal>

          {/* ════ قسائم الرواتب ════ */}
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {run.payslips.map((p, idx) => (
              <Reveal key={p.id} delay={Math.min(idx * 40, 240)}>
                <PayslipCard slip={p} month={run.month} draft={run.status === 'draft'} edits={edits} setEdits={setEdits} shop={shopName} />
              </Reveal>
            ))}
          </div>

          {/* ════ شريط الأوامر ════ */}
          <Reveal delay={80}>
            <Panel className="mt-4">
              <div className="flex flex-wrap items-center gap-2 p-3">
                {run.status === 'draft' ? (
                  <>
                    <Button
                      onClick={async () => { if (!dirty || (await saveEdits(true))) setPayOpen(true) }}
                      disabled={busy} className="gap-1.5"
                      style={{ background: HEX }}
                    >
                      <Wallet className="size-4" />اعتماد وصرف الرواتب
                    </Button>
                    {dirty && <Button variant="secondary" onClick={() => saveEdits()} disabled={busy} className="gap-1.5"><CheckCircle2 className="size-4" />حفظ التعديلات</Button>}
                    <Button variant="outline" onClick={async () => { if (!dirty || (await saveEdits(true))) generate() }} disabled={busy} className="gap-1.5">
                      <RefreshCw className="size-4" />أعد الحساب
                    </Button>
                    <Button variant="ghost" onClick={removeDraft} disabled={busy} className="gap-1.5 text-rose-600"><Trash2 className="size-4" />حذف المسودة</Button>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    <span className="grid size-6 place-items-center rounded-full bg-emerald-500/15 text-emerald-600"><CheckCircle2 className="size-4" /></span>
                    اتصرفت {run.paidAt ? new Date(run.paidAt).toLocaleDateString('ar-EG-u-nu-latn') : ''} من {PAY_METHODS.find((m) => m.value === run.method)?.label ?? run.method}
                  </p>
                )}
                <Button variant="outline" onClick={exportExcel} className="gap-1.5 sm:ms-auto"><FileSpreadsheet className="size-4" />Excel</Button>
              </div>
            </Panel>
          </Reveal>
        </>
      )}

      {/* ════ دورات سابقة ════ */}
      {pastRuns.length > 0 && (
        <div className="mt-7">
          <PanelTitle icon={Clock} hex={HEX} title="دورات سابقة" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pastRuns.map((r, idx) => (
              <Reveal key={r.id} delay={Math.min(idx * 35, 210)}>
                <button
                  type="button" onClick={() => setMonth(r.month)}
                  className="group flex w-full items-center gap-3 rounded-2xl border bg-card px-3.5 py-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                    style={{ background: r.status === 'paid' ? '#10b981' : tint('#f59e0b', 80), color: r.status === 'paid' ? undefined : ink('#f59e0b', 82) }}
                  >
                    <Wallet className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{monthLabel(r.month)}</span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">{money(r.totalNet)} · {r.count} موظف</span>
                  </span>
                  <StatusChip tone={r.status === 'paid' ? 'emerald' : 'amber'}>{r.status === 'paid' ? 'اتصرفت' : 'مسودة'}</StatusChip>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
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

/* ═══════════════════════ قسيمة راتب — كارت بشكل مستند ═══════════════════════ */

function PayslipCard({
  slip: p, month, draft, edits, setEdits, shop,
}: {
  slip: Slip
  month: string
  draft: boolean
  edits: Record<number, { bonus: string; penalty: string; note: string }>
  setEdits: React.Dispatch<React.SetStateAction<Record<number, { bonus: string; penalty: string; note: string }>>>
  shop: string
}) {
  const e = edits[p.id] ?? { bonus: '', penalty: '', note: '' }
  const setEdit = (k: 'bonus' | 'penalty' | 'note', v: string) =>
    setEdits((s) => ({ ...s, [p.id]: { ...(s[p.id] ?? { bonus: '', penalty: '', note: '' }), [k]: v } }))

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all hover:shadow-md">
      {/* رأس القسيمة */}
      <div className="relative shrink-0 px-4 py-3" style={{ background: `linear-gradient(130deg, ${HEX}, color-mix(in srgb, ${HEX} 55%, black))` }}>
        <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-white/60 bg-white/15 text-base font-black text-white backdrop-blur-sm">
              {p.employeeName.trim().charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold text-white">{p.employeeName}</div>
              <div className="text-[10.5px] font-semibold text-white/75">قسيمة راتب {monthLabel(month)}</div>
            </div>
          </div>
          {p.workedDays !== null && p.expectedWorkDays !== null && (
            <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black tabular-nums text-white backdrop-blur-sm">
              {p.workedDays}<span className="text-white/70"> / {p.expectedWorkDays} يوم</span>
            </span>
          )}
        </div>
      </div>

      {/* تنبيهات القسيمة */}
      {(p.workedDays === 0 || (p.workedDays !== null && p.workedDays > 0 && p.unrecordedDays > 0) || p.pendingDays > 0) && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {p.workedDays === 0 && <Pill tone="rose">بدون أيام شغل مسجّلة</Pill>}
          {p.workedDays !== null && p.workedDays > 0 && p.unrecordedDays > 0 && <Pill tone="amber">{p.unrecordedDays} يوم بدون تسجيل</Pill>}
          {p.pendingDays > 0 && <Pill tone="sky">{p.pendingDays} يوم متبقي</Pill>}
        </div>
      )}

      {/* تفصيل الحساب */}
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <SlipRow label="الأساسي المستحق" value={money(p.payableBase)} />
        <SlipRow
          label="خصم غياب وبدون تسجيل"
          sub={p.absentDays + p.unrecordedDays > 0 ? `${p.absentDays + p.unrecordedDays} يوم` : undefined}
          value={p.absenceDeduction > 0 ? `- ${money(p.absenceDeduction)}` : '—'}
          tone={p.absenceDeduction > 0 ? 'minus' : 'dim'}
        />
        <SlipRow
          label="خصم التأخير"
          sub={p.lateMinutes > 0 ? `${p.lateMinutes} دقيقة` : undefined}
          value={p.lateDeduction > 0 ? `- ${money(p.lateDeduction)}` : '—'}
          tone={p.lateDeduction > 0 ? 'minus' : 'dim'}
        />
        {draft ? (
          <EditRow
            icon={<PlusCircle className="size-3.5 text-emerald-600" />}
            label="حافز"
            value={e.bonus} onChange={(v) => setEdit('bonus', v)} accent="text-emerald-700 dark:text-emerald-400"
          />
        ) : (
          <SlipRow label="حافز" value={p.bonus > 0 ? `+ ${money(p.bonus)}` : '—'} tone={p.bonus > 0 ? 'plus' : 'dim'} />
        )}
        {draft ? (
          <EditRow
            icon={<MinusCircle className="size-3.5 text-rose-600" />}
            label="جزاء"
            value={e.penalty} onChange={(v) => setEdit('penalty', v)} accent="text-rose-700 dark:text-rose-400"
          />
        ) : (
          <SlipRow label="جزاء" value={p.penalty > 0 ? `- ${money(p.penalty)}` : '—'} tone={p.penalty > 0 ? 'minus' : 'dim'} />
        )}
        <SlipRow
          label="قسط سلفة"
          value={p.advanceDeduction > 0 ? `- ${money(p.advanceDeduction)}` : '—'}
          tone={p.advanceDeduction > 0 ? 'violet' : 'dim'}
        />

        {/* خط التثقيب + الصافي */}
        <div className="relative mt-auto pt-3">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1 flex justify-between">
            <span className="size-3.5 rounded-full bg-background ring-1 ring-border" />
            <span className="size-3.5 rounded-full bg-background ring-1 ring-border" />
          </div>
          <div className="border-t-2 border-dashed pt-3.5" style={{ borderColor: 'color-mix(in srgb, var(--border) 85%, transparent)' }}>
            <div className="flex items-end justify-between gap-2">
              <span className="text-sm font-bold text-muted-foreground">الصافي المستحق</span>
              <span className="text-2xl font-black tabular-nums tracking-tight" style={{ color: ink(HEX, 85) }}>
                {money(p.net)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ذيل القسيمة — الإرسال */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5">
        <WhatsAppSlip slip={p} month={month} shop={shop} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50" dir="ltr">payslip</span>
      </div>
    </article>
  )
}

function SlipRow({ label, sub, value, tone = 'neutral' }: {
  label: string
  sub?: string
  value: React.ReactNode
  tone?: 'neutral' | 'plus' | 'minus' | 'violet' | 'dim'
}) {
  const color =
    tone === 'plus' ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'minus' ? 'text-rose-700 dark:text-rose-400'
    : tone === 'violet' ? 'text-violet-700 dark:text-violet-400'
    : tone === 'dim' ? 'text-muted-foreground/70'
    : ''
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-[12.5px] text-muted-foreground">
        {label}
        {sub && <span className="ms-1 text-[10.5px] font-semibold text-muted-foreground/70">({sub})</span>}
      </span>
      <span className={`text-[13px] font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

function EditRow({ icon, label, value, onChange, accent }: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  accent: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5 last:border-0">
      <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">{icon}{label}</span>
      <Input
        type="number" inputMode="decimal" min={0} dir="ltr" value={value} onChange={(ev) => onChange(ev.target.value)}
        className={`h-8 w-24 border-dashed text-end text-[13px] font-bold tabular-nums ${accent}`}
        placeholder="0"
      />
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
  const numPhone = waNumber(slip.phone)
  const text = slipText(slip, month, shop)
  if (!numPhone) {
    return (
      <Button
        variant="ghost" size="sm" className="gap-1 text-muted-foreground"
        title={slip.phone ? 'رقم الموبايل غير صالح — اضغط لنسخ القسيمة' : 'مفيش رقم موبايل — اضغط لنسخ القسيمة'}
        onClick={() => { navigator.clipboard?.writeText(text).then(() => toast.success('تم نسخ القسيمة'), () => toast.error('تعذّر النسخ')) }}
      >
        نسخ القسيمة
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" size="sm" className="gap-1 text-emerald-600">
      <a href={`https://wa.me/${numPhone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" />واتساب للموظف
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
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-stocktake text-stocktake-foreground">
              <Settings2 className="size-4" />
            </span>
            قواعد الحساب
          </DialogTitle>
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
