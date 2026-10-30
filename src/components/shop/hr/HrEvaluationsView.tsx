'use client'

import * as React from 'react'
import { Award, CalendarRange, Loader2, MessageCircleQuestion, Star, Trophy, Users, Wallet, Sparkles, User, UserRound, Briefcase, TrendingUp, Gift } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDataRefresh } from '@/lib/offline/data-events'
import { EVAL_CRITERIA, overallScore, scoreGrade, type EvalCriterionKey } from '@/lib/hr'
import { EmptyState, ListSkeleton, hrGet, hrSend, money, monthLabel, shiftMonth } from './hr-ui'
import { cn } from '@/lib/utils'

interface Saved {
  perfScore: number; customerScore: number; teamScore: number
  attendanceScore: number; overall: number; bonus: number; bonusApplied: boolean; note: string | null
}
interface Item {
  employeeId: number; name: string; jobTitle: string | null; baseSalary: number
  workDays: number; absentDays: number; lateDays: number; lateMinutes: number; leaveDays: number
  attendanceScore: number; evaluation: Saved | null
}

const isFemaleName = (name: string) => {
  const n = name.trim();
  if (!n) return false;
  if (/[ةى]$/.test(n) || /[اء]$/.test(n)) return true;
  const femaleNames = ['مريم', 'سارة', 'نور', 'هند', 'زينب', 'رنا', 'ريم', 'لينا', 'جنى', 'حبيبة', 'ملك', 'ياسمين', 'دينا', 'نهى', 'منى', 'سلمى', 'ليلى', 'شروق', 'أمل', 'إيمان', 'هدى', 'رؤى', 'آية', 'إسراء', 'هبة', 'شيماء', 'بسمة', 'عبير', 'سماح', 'نادية', 'نرمين', 'سمر', 'رغد', 'رهف', 'جواهر', 'فاطمة', 'عائشة', 'خديجة'];
  return femaleNames.some(fn => n.includes(fn));
};

// ألوان الأفاتار (ذهبي، فضي، برونزي، أزرق ملكي)
const AVATAR_THEMES = [
  { bg: 'from-amber-300 to-yellow-600', shadow: 'shadow-amber-500/30' }, // ذهبي
  { bg: 'from-slate-300 to-slate-500', shadow: 'shadow-slate-500/30' }, // فضي
  { bg: 'from-orange-400 to-amber-700', shadow: 'shadow-orange-500/30' }, // برونزي
  { bg: 'from-blue-400 to-indigo-600', shadow: 'shadow-blue-500/30' }, // أزرق
]

const GRADE_BAR: Record<string, string> = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
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

  const evaluated = items.filter((i) => i.evaluation).length
  const avgOverall = evaluated > 0 ? Math.round(items.filter((i) => i.evaluation).reduce((s, i) => s + i.evaluation!.overall, 0) / evaluated) : null

  return (
    <div className="-mx-3 sm:-mx-6 bg-slate-50 dark:bg-slate-950 min-h-screen pb-12">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-8">
        
        {/* ================= الهيرو (أسود ملكي مع ذهبي 3D) ================= */}
        <section className="relative overflow-hidden bg-slate-950 text-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]">
          {/* خلفية متدرجة عميقة */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-black" />
          {/* إضاءات ذهبية */}
          <div aria-hidden className="absolute -top-32 -right-32 size-[400px] rounded-full bg-amber-500/20 blur-[100px]" />
          <div aria-hidden className="absolute -bottom-32 -left-32 size-[300px] rounded-full bg-yellow-500/10 blur-[80px]" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8">
            <div className="z-10 max-w-lg">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 backdrop-blur-md shadow-inner">
                <Trophy className="size-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-200">تقييم الأداء والتميز</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl drop-shadow-md">
                تقييمات <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500">الموظفين</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                حضور تلقائي 40% + تقييمك 60% — والحافز بينزل في مسودة الرواتب.
              </p>
            </div>
          </div>
        </section>

        {/* ================= اختيار الشهر ================= */}
        <div className="flex items-center justify-between p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800/60" dir="rtl">
          <Button variant="outline" size="icon" aria-label="الشهر السابق" disabled={!month} onClick={() => setMonth(shiftMonth(month, -1))} className="shadow-sm hover:bg-slate-50">
            <CalendarRange className="size-4 rotate-180" />
          </Button>
          <div className="text-center text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            {month ? monthLabel(month) : '...'}
          </div>
          <Button variant="outline" size="icon" aria-label="الشهر التالي" disabled={!month || month >= currentMonth} onClick={() => setMonth(shiftMonth(month, 1))} className="shadow-sm hover:bg-slate-50">
            <CalendarRange className="size-4" />
          </Button>
        </div>

        {loading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState theme="evaluations" icon={Users} title="مفيش موظفين نشطين" hint="ضيف موظفين الأول من صفحة الموظفين." />
        ) : (
          <>
            {/* ================= الإحصائيات (Bento) ================= */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500">تم تقييمهم</span>
                  <span className="text-2xl font-black">{evaluated} <span className="text-sm text-slate-400">/ {items.length}</span></span>
                </div>
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-slate-700 to-slate-900 shadow-slate-500/30">
                  <Award className="size-5 drop-shadow-md" />
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500">متوسط الدرجة</span>
                  <span className="text-2xl font-black text-amber-500">{avgOverall !== null ? `${avgOverall}%` : '—'}</span>
                </div>
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/30">
                  <TrendingUp className="size-5 drop-shadow-md" />
                </span>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500">حوافز مستنية الإضافة</span>
                  <span className="text-2xl font-black text-emerald-600">{money(pending.reduce((s, i) => s + (i.evaluation?.bonus ?? 0), 0))}</span>
                </div>
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30">
                  <Wallet className="size-5 drop-shadow-md" />
                </span>
              </div>
            </div>

            {/* ================= بانر الحوافز (زجاجي ملكي) ================= */}
            {pending.length > 0 && (
              <div className="relative overflow-hidden flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-4 shadow-[0_8px_30px_-12px_rgba(245,158,11,0.2)] backdrop-blur-sm" dir="rtl">
                <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-amber-400/20 blur-2xl" />
                <div className="flex items-center gap-3 z-10">
                  <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-600 shadow-sm">
                    <Gift className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-amber-900 dark:text-amber-100">حوافز مستحقة</h3>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-0.5">
                      فيه {pending.length} حافز لسه ماتضافش للمرتبات (إجمالي {money(pending.reduce((s, i) => s + i.evaluation!.bonus, 0))})
                    </p>
                  </div>
                </div>
                <Button onClick={applyBonuses} disabled={applying} className="z-10 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-[0_4px_0_rgb(180,83,9)] hover:shadow-[0_2px_0_rgb(180,83,9)] hover:translate-y-[2px] transition-all font-bold px-5">
                  {applying ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}أضفهم لمسودة المرتبات
                </Button>
              </div>
            )}

            {/* ================= اسأل عن الشهر ================= */}
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 p-4 shadow-sm" dir="rtl">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><MessageCircleQuestion className="size-4 text-amber-500"/> اسأل عن أداء الفريق</h3>
              <div className="flex flex-wrap gap-2">
                {Object.keys(answers).map((k) => (
                  <button key={k} onClick={() => setQ(q === k ? null : k)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all border", q === k ? "bg-slate-800 text-white border-slate-800 shadow-md" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100")}>{k}</button>
                ))}
              </div>
              {q && (
                <ul className="mt-3 space-y-2 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {answers[q].length ? answers[q].map((a, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">{i + 1}</span>
                      {a}
                    </li>
                  )) : <li className="text-muted-foreground">مفيش بيانات كافية.</li>}
                </ul>
              )}
            </div>

            {/* ================= كروت التقييم ================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" dir="rtl">
              {items.map((i, index) => {
                const ev = i.evaluation
                const grade = ev ? scoreGrade(ev.overall) : null
                const isFemale = isFemaleName(i.name)
                const theme = AVATAR_THEMES[index % AVATAR_THEMES.length]

                return (
                  <div key={i.employeeId} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col transition-all hover:shadow-md hover:-translate-y-1">
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("grid size-12 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg shrink-0", theme.bg, theme.shadow)}>
                          {isFemale ? <UserRound className="size-6 drop-shadow-md text-slate-800" strokeWidth={2.5} /> : <User className="size-6 drop-shadow-md text-slate-800" strokeWidth={2.5} />}
                        </div>
                        <div>
                          <span className="font-black text-base text-slate-800 dark:text-slate-100 block">{i.name}</span>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                            <Briefcase className="size-3" />
                            <span>{i.jobTitle || 'موظف'}</span>
                          </div>
                        </div>
                      </div>
                      {grade && (
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm", `bg-${grade.tone}-100 text-${grade.tone}-700`)}>
                          <Trophy className="size-3" />{grade.label}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-600">
                        <span>درجة الحضور</span>
                        <span className="tabular-nums">{i.attendanceScore}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={cn("h-full rounded-full", grade ? GRADE_BAR[grade.tone] : 'bg-slate-300')} style={{ width: `${Math.max(2, Math.min(100, i.attendanceScore))}%` }} />
                      </div>
                      
                      {ev && (
                        <>
                          <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 mt-2">
                            <span>التقييم النهائي</span>
                            <span className="tabular-nums text-amber-600">{ev.overall}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${ev.overall}%` }} />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        {ev && ev.bonus > 0 ? (
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", ev.bonusApplied ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                            حافز {money(ev.bonus)} {ev.bonusApplied ? '✓' : ''}
                          </span>
                        ) : <span className="text-[11px] text-slate-400">بدون حافز</span>}
                      </div>
                      
                      <Button variant={ev ? 'outline' : 'default'} size="sm" onClick={() => setEditing(i)} className={cn("h-8 gap-1.5 text-xs px-4", !ev && "bg-slate-900 hover:bg-slate-800 text-white shadow-[0_4px_0_rgb(15,23,42)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgb(15,23,42)]")}>
                        <Award className="size-3.5 text-amber-400" />{ev ? 'تعديل' : 'قيّم الآن'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {editing && <EvalDialog item={editing} month={month} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(month) }} />}
    </div>
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
      <DialogContent mobileSheet className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md" dir="rtl">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-slate-900 text-amber-400 shadow-md">
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
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-all duration-200",
                      scores[c.key] >= n 
                        ? 'border-amber-400 bg-amber-50 text-amber-600 shadow-[0_4px_0_rgb(251,191,36)] active:translate-y-[4px] active:shadow-none' 
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 shadow-[0_2px_0_rgb(226,232,240)] active:translate-y-[2px] active:shadow-none'
                    )}
                  >
                    <Star className={cn("size-4", scores[c.key] >= n ? 'fill-amber-500 text-amber-500' : '')} />{n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          
          {grade && (
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 border border-amber-100">
              <span className="text-sm font-bold text-amber-900">الدرجة النهائية:</span>
              <span className="text-lg font-black text-amber-600">{overall}% <span className={cn("ml-2 px-2 py-0.5 rounded text-[10px]", `bg-${grade.tone}-100 text-${grade.tone}-700`)}>{grade.label}</span></span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>حافز مرتبط بالتقييم (اختياري)</Label>
            <Input type="number" inputMode="decimal" dir="ltr" min={0} disabled={locked} value={bonus} onChange={(e) => setBonus(e.target.value)} className="shadow-inner font-bold" />
            {locked ? (
              <p className="text-xs text-muted-foreground">الحافز اتضاف للمرتبات بالفعل.</p>
            ) : (
              <div className="flex gap-1.5">
                {[0, 5, 10].map((p) => (
                  <Button key={p} type="button" size="sm" variant="outline" onClick={() => setBonus(p ? String(Math.round((item.baseSalary * p) / 100)) : '')} className="h-8 text-xs font-bold bg-slate-50 hover:bg-slate-100">
                    {p ? `${p}% من الراتب` : 'بدون'}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="shadow-inner" />
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving || !ready} className="gap-1.5 bg-slate-900 hover:bg-slate-800 text-white shadow-[0_4px_0_rgb(15,23,42)] hover:shadow-[0_2px_0_rgb(15,23,42)] hover:translate-y-[2px] transition-all">
            {saving && <Loader2 className="size-4 animate-spin" />}حفظ التقييم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}