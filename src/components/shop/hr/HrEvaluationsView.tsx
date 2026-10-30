'use client'

import * as React from 'react'
import { Award, Coins, Crown, Gauge, Loader2, MessageCircleQuestion, Star, Trophy, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EVAL_CRITERIA, overallScore, scoreGrade, type EvalCriterionKey } from '@/lib/hr'
import {
  Avatar, Bar, CardGrid, EmptyState, HrHero, HrKpi, ItemCard, KpiGrid, ListSkeleton, MonthSwitcher, PageShell, Panel,
  PanelTitle, Pill, Ring, SegBar, hrGet, hrSend, money, monthLabel, shiftMonth,
} from './hr-ui'

interface Saved {
  perfScore: number; customerScore: number; teamScore: number
  attendanceScore: number; overall: number; bonus: number; bonusApplied: boolean; note: string | null
}
interface Item {
  employeeId: number; name: string; jobTitle: string | null; baseSalary: number
  workDays: number; absentDays: number; lateDays: number; lateMinutes: number; leaveDays: number
  attendanceScore: number; evaluation: Saved | null
}

const GRADE_BAR: Record<string, string> = {
  emerald: 'bg-emerald-500', sky: 'bg-sky-500', amber: 'bg-amber-500', rose: 'bg-rose-500',
}

export function HrEvaluationsView() {
  const [month, setMonth] = React.useState('')
  const [currentMonth, setCurrentMonth] = React.useState('')
  const [items, setItems] = React.useState<Item[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<Item | null>(null)
  const [applying, setApplying] = React.useState(false)

  const load = React.useCallback(async (m: string) => {
    try {
      const d = await hrGet<{ month: string; items: Item[] }>(`/api/hr/evaluations${m ? `?month=${m}` : ''}`)
      setItems(d.items)
      if (!m) { setMonth(d.month); setCurrentMonth(d.month) }
    } catch (e: any) { toast.error(e?.message || 'فشل تحميل التقييمات') }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { load(month) }, [load, month])
  useDataRefresh(['hr'], () => load(month))

  const pending = items.filter((i) => i.evaluation && i.evaluation.bonus > 0 && !i.evaluation.bonusApplied)
  const applyBonuses = async () => {
    setApplying(true)
    try {
      const r = await hrSend<{ applied: number }>('/api/hr/evaluations/apply-bonus', 'POST', { month })
      toast.success(r.applied ? `تمت إضافة ${r.applied} حافز لمسودة المرتبات` : 'مفيش قسايم مطابقة في المسودة')
      load(month)
    } catch (e: any) { toast.error(e?.message || 'فشلت الإضافة') }
    finally { setApplying(false) }
  }

  // «اسأل» — إجابات جاهزة محسوبة من بيانات الشهر (بدون ذكاء اصطناعي خارجي)
  const [q, setQ] = React.useState<string | null>(null)
  const answers = React.useMemo(() => {
    const top = (arr: Item[], pick: (i: Item) => number, fmt: (i: Item) => string, n = 3) =>
      arr.filter((i) => pick(i) > 0).sort((a, b) => pick(b) - pick(a)).slice(0, n).map((i) => `${i.name} — ${fmt(i)}`)
    const evald = items.filter((i) => i.evaluation).sort((a, b) => b.evaluation!.overall - a.evaluation!.overall)
    return {
      'مين الأكتر تأخيرًا؟': top(items, (i) => i.lateMinutes, (i) => `${i.lateDays} مرات (${i.lateMinutes} دقيقة)`),
      'مين الأكتر غيابًا؟': top(items, (i) => i.absentDays, (i) => `${i.absentDays} يوم`),
      'مين الأفضل التزامًا؟': [...items].filter((i) => i.workDays > 0).sort((a, b) => b.attendanceScore - a.attendanceScore).slice(0, 3).map((i) => `${i.name} — ${i.attendanceScore}%`),
      'مين الأعلى تقييمًا؟': evald.slice(0, 3).map((i) => `${i.name} — ${i.evaluation!.overall}%`),
    } as Record<string, string[]>
  }, [items])

  const evaluatedItems = items.filter((i) => i.evaluation)
  const evaluated = evaluatedItems.length
  const avgOverall = evaluated > 0 ? Math.round(evaluatedItems.reduce((s, i) => s + i.evaluation!.overall, 0) / evaluated) : null
  const avgAttendance = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.attendanceScore, 0) / items.length) : 0
  const pendingTotal = pending.reduce((s, i) => s + (i.evaluation?.bonus ?? 0), 0)
  const best = [...evaluatedItems].sort((a, b) => b.evaluation!.overall - a.evaluation!.overall)[0]
  const gradeCount = (tone: 'emerald' | 'sky' | 'amber' | 'rose') => evaluatedItems.filter((i) => scoreGrade(i.evaluation!.overall).tone === tone).length
  const avgTone = avgOverall === null ? 'slate' : scoreGrade(avgOverall).tone

  return (
    <PageShell>
      <HrHero
        theme="evaluations"
        icon={Award}
        kicker="الموارد البشرية"
        title="تقييمات الموظفين"
        subtitle="حضور تلقائي 40% + تقييمك 60% — والحافز بينزل في مسودة الرواتب."
        actions={
          <MonthSwitcher
            label={month ? monthLabel(month) : '...'}
            prevDisabled={!month}
            nextDisabled={!month || month >= currentMonth}
            onPrev={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
          />
        }
        metric={{
          label: 'متوسط الدرجة النهائية للفريق',
          value: avgOverall !== null ? avgOverall : '—',
          unit: avgOverall !== null ? '%' : undefined,
          loading,
          foot: avgOverall !== null ? `${scoreGrade(avgOverall).label} · ${evaluated} من ${items.length} اتقيّموا` : 'لسه ماتقيّمش حد الشهر ده',
        }}
        viz={
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex items-center justify-center rounded-2xl border bg-card/70 p-3.5 backdrop-blur-sm sm:p-4">
              <Ring value={avgOverall ?? 0} tone={avgTone} size={92} stroke={9}>
                <Trophy className="size-6 text-violet-600 dark:text-violet-300" />
              </Ring>
            </div>
            <SegBar
              title="توزيع التقديرات"
              segments={[
                { label: 'ممتاز', value: gradeCount('emerald'), tone: 'emerald' },
                { label: 'جيد جدًا', value: gradeCount('sky'), tone: 'sky' },
                { label: 'جيد', value: gradeCount('amber'), tone: 'amber' },
                { label: 'يحتاج تحسين', value: gradeCount('rose'), tone: 'rose' },
              ]}
              empty="لسه مفيش تقييمات في الشهر ده"
            />
          </div>
        }
        kpis={
          <KpiGrid>
            <HrKpi tone="violet" icon={Star} loading={loading} label="تم تقييمهم" value={`${evaluated} / ${items.length}`} sub={month ? monthLabel(month) : undefined} progress={items.length ? (evaluated / items.length) * 100 : 0} />
            <HrKpi tone="sky" icon={Gauge} loading={loading} label="متوسط درجة الحضور" value={`${avgAttendance}%`} sub="محسوب تلقائي من السجل" progress={avgAttendance} />
            <HrKpi tone="amber" icon={Coins} loading={loading} label="حوافز مستنية الإضافة" value={money(pendingTotal)} sub={`${pending.length} حافز`} />
            <HrKpi tone="emerald" icon={Crown} loading={loading} label="الأعلى تقييمًا" value={best ? best.name : '—'} sub={best ? `${best.evaluation!.overall}% · ${scoreGrade(best.evaluation!.overall).label}` : 'لسه مفيش'} />
          </KpiGrid>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState theme="evaluations" icon={Users} title="مفيش موظفين نشطين" hint="ضيف موظفين الأول من صفحة الموظفين." />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-500/40 bg-warning-subtle p-3.5 shadow-sm sm:p-4">
              <p className="flex items-center gap-2.5 text-sm font-bold text-warning-subtle-foreground">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground"><Coins className="size-4" /></span>
                {pending.length} حافز من التقييمات لسه ماتضافش للمرتبات (إجمالي {money(pendingTotal)})
              </p>
              <Button size="sm" onClick={applyBonuses} disabled={applying} className="gap-1.5">
                {applying ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}أضفهم لمسودة المرتبات
              </Button>
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* ───── كروت التقييم ───── */}
            <div className="min-w-0">
              <PanelTitle icon={Trophy} title="تقييم الشهر" />
              <CardGrid min={300}>
                {items.map((i) => {
                  const ev = i.evaluation
                  const grade = ev ? scoreGrade(ev.overall) : null
                  return (
                    <ItemCard key={i.employeeId} accent={grade ? GRADE_BAR[grade.tone] : 'bg-muted-foreground/30'}>
                      <div className="flex items-center gap-3 p-4 pb-3 ps-5">
                        <Avatar name={i.name} className="size-12 text-lg" />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-base font-extrabold">{i.name}</h3>
                          <p className="truncate text-xs text-muted-foreground">{i.jobTitle || 'موظف'}</p>
                          {grade && (
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                              <Trophy className="size-3" />{grade.label}
                            </span>
                          )}
                        </div>
                        <Ring value={ev?.overall ?? 0} tone={grade?.tone ?? 'slate'} size={64} stroke={10}>
                          <span className="text-sm font-extrabold tabular-nums">{ev ? `${ev.overall}%` : '—'}</span>
                        </Ring>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 px-4 pb-3 ps-5 text-center">
                        {[
                          { l: 'حضور', v: `${i.attendanceScore}%` },
                          { l: 'غياب', v: i.absentDays, bad: i.absentDays > 0 },
                          { l: 'تأخير', v: i.lateDays, bad: i.lateDays > 0 },
                          { l: 'إجازة', v: i.leaveDays },
                        ].map((m) => (
                          <div key={m.l} className="rounded-xl bg-muted/50 py-1.5">
                            <div className={`text-sm font-extrabold tabular-nums ${m.bad ? 'text-rose-600' : ''}`}>{m.v}</div>
                            <div className="text-[10px] text-muted-foreground">{m.l}</div>
                          </div>
                        ))}
                      </div>

                      <div className="px-4 pb-3 ps-5">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>درجة الحضور</span>
                          {ev && ev.bonus > 0 && <Pill tone={ev.bonusApplied ? 'emerald' : 'amber'}>حافز {money(ev.bonus)}{ev.bonusApplied ? ' ✓' : ''}</Pill>}
                        </div>
                        <Bar value={Math.max(2, i.attendanceScore)} tone={grade?.tone ?? 'slate'} />
                      </div>

                      <div className="mt-auto border-t bg-muted/30 px-3 py-2.5 ps-4">
                        <Button variant={ev ? 'outline' : 'default'} size="sm" onClick={() => setEditing(i)} className="w-full gap-1.5">
                          <Award className="size-4" />{ev ? 'تعديل التقييم' : 'قيّم الموظف'}
                        </Button>
                      </div>
                    </ItemCard>
                  )
                })}
              </CardGrid>
            </div>

            {/* ───── اسأل ───── */}
            <div className="min-w-0 lg:sticky lg:top-4">
              <PanelTitle icon={MessageCircleQuestion} title="اسأل عن الشهر ده" />
              <Panel className="p-3.5">
                <div className="flex flex-wrap gap-2">
                  {Object.keys(answers).map((k) => (
                    <Button key={k} size="sm" variant={q === k ? 'default' : 'outline'} onClick={() => setQ(q === k ? null : k)}>{k}</Button>
                  ))}
                </div>
                {q ? (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {answers[q].length ? answers[q].map((a, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-xl bg-muted/40 px-2.5 py-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-700 dark:text-violet-300">{i + 1}</span>
                        {a}
                      </li>
                    )) : <li className="text-muted-foreground">مفيش بيانات كفاية للإجابة.</li>}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">اختار سؤال وهتلاقي الإجابة محسوبة من بيانات الشهر.</p>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}

      {editing && <EvalDialog item={editing} month={month} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(month) }} />}
    </PageShell>
  )
}

function EvalDialog({ item, month, onClose, onSaved }: { item: Item; month: string; onClose: () => void; onSaved: () => void }) {
  const ev = item.evaluation
  const [scores, setScores] = React.useState<Record<EvalCriterionKey, number>>({
    perfScore: ev?.perfScore ?? 0, customerScore: ev?.customerScore ?? 0, teamScore: ev?.teamScore ?? 0,
  })
  const [bonus, setBonus] = React.useState(ev?.bonus ? String(ev.bonus) : '')
  const [note, setNote] = React.useState(ev?.note ?? '')
  const [saving, setSaving] = React.useState(false)
  const locked = !!ev?.bonusApplied
  const ready = Object.values(scores).every((n) => n >= 1)
  const overall = ready ? overallScore(item.attendanceScore, scores.perfScore, scores.customerScore, scores.teamScore) : null
  const grade = overall != null ? scoreGrade(overall) : null

  const save = async () => {
    if (!ready) return toast.error('قيّم الثلاث بنود الأول')
    setSaving(true)
    try {
      await hrSend('/api/hr/evaluations', 'POST', { employeeId: item.employeeId, month, ...scores, bonus: Number(bonus) || 0, note })
      toast.success('تم حفظ التقييم')
      onSaved()
    } catch (e: any) { toast.error(e?.message || 'فشل الحفظ') }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-chart-4 text-white">
              <Award className="size-4" />
            </span>
            تقييم {item.name}
          </DialogTitle>
          <DialogDescription>{monthLabel(month)} — درجة الحضور التلقائية: {item.attendanceScore}%</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          {EVAL_CRITERIA.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <Label>{c.label}</Label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n} type="button" aria-label={`${n} من 5`}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                    className={`flex h-10 flex-1 items-center justify-center gap-0.5 rounded-xl border text-sm font-bold transition ${scores[c.key] >= n ? 'border-amber-500/40 bg-amber-500/15 text-amber-700' : 'text-muted-foreground'}`}
                  >
                    <Star className={`size-4 ${scores[c.key] >= n ? 'fill-amber-500 text-amber-500' : ''}`} />{n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grade && (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
              الدرجة النهائية: <b>{overall}%</b> — <Pill tone={grade.tone}>{grade.label}</Pill>
            </p>
          )}
          <div className="space-y-1.5">
            <Label>حافز مرتبط بالتقييم (اختياري)</Label>
            <Input type="number" inputMode="decimal" dir="ltr" min={0} disabled={locked} value={bonus} onChange={(e) => setBonus(e.target.value)} />
            {locked ? (
              <p className="text-xs text-muted-foreground">الحافز اتضاف للمرتبات بالفعل — عدّله من صفحة المرتبات.</p>
            ) : (
              <div className="flex gap-1.5">
                {[0, 5, 10].map((p) => (
                  <Button key={p} type="button" size="sm" variant="outline" onClick={() => setBonus(p ? String(Math.round((item.baseSalary * p) / 100)) : '')}>
                    {p ? `${p}% من الراتب` : 'بدون'}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving || !ready} className="gap-1.5">{saving && <Loader2 className="size-4 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
