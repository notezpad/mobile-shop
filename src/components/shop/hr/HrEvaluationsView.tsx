'use client'

import * as React from 'react'
import { Award, CalendarRange, Loader2, MessageCircleQuestion, Star, Trophy, Users, Wallet, Sparkles, User, UserRound, Briefcase, TrendingUp, Gift, MessageSquareText } from 'lucide-react'
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
                {/* 🛡️ 2026-11-03: أزلنا حركات hover (translate/scale/rotate) — لما الماوس بيعدي على العناصر أثناء سكرول بالعجلة كانت بتتحرك فبيبان كأن المحتوى بيقفز. التغذية الراجعة بقت بالظل/اللون بس. */}
                <Button onClick={applyBonuses} disabled={applying} className="z-10 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-[0_4px_0_rgb(180,83,9)] hover:shadow-[0_2px_0_rgb(180,83,9)] transition-all font-bold px-5">
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
                  <div key={i.employeeId} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col transition-all hover:shadow-md">
                    
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
                      
                      <Button variant={ev ? 'outline' : 'default'} size="sm" onClick={() => setEditing(i)} className={cn("h-8 gap-1.5 text-xs px-4", !ev && "bg-slate-900 hover:bg-slate-800 text-white shadow-[0_4px_0_rgb(15,23,42)] hover:shadow-[0_2px_0_rgb(15,23,42)]")}>
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

/* ───────────── نجوم ذهبية حقيقية (SVG بتدرّج معدني + لمعة + حافة) ───────────── */
const STAR_PATH = 'M12 2.4l2.95 6.2 6.8.85-5 4.7 1.3 6.75L12 17.5l-6.05 3.4 1.3-6.75-5-4.7 6.8-.85z'
const STAR_LABELS = ['', 'ضعيف', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز']

/** تعريفات التدرّجات — بتتحط مرة واحدة جوه الدايلوج */
function GoldDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <linearGradient id="evGold" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFF4B8" />
          <stop offset="0.28" stopColor="#FFD84D" />
          <stop offset="0.62" stopColor="#F2A900" />
          <stop offset="1" stopColor="#B96F00" />
        </linearGradient>
        <linearGradient id="evGoldShine" x1="0" y1="0" x2="0.9" y2="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="evEmpty" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E2E8F0" />
          <stop offset="1" stopColor="#CBD5E1" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function GoldStar({ on, className }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('transition-all duration-200', on ? 'drop-shadow-[0_3px_5px_rgba(217,119,6,0.55)]' : 'drop-shadow-[0_1px_1px_rgba(15,23,42,0.15)]', className)} aria-hidden>
      <path d={STAR_PATH} fill={on ? 'url(#evGold)' : 'url(#evEmpty)'} stroke={on ? '#B45309' : '#94A3B8'} strokeWidth="0.9" strokeLinejoin="round" />
      {on ? <path d={STAR_PATH} fill="url(#evGoldShine)" /> : null}
    </svg>
  )
}

/** صف نجوم تفاعلي: hover بيعاين، والضغط بيثبّت — وبيرجّع نفس القيمة 1..5 */
function StarRating({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [hover, setHover] = React.useState(0)
  const shown = hover || value
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center justify-between gap-1.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} من 5`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="group grid flex-1 place-items-center rounded-xl py-1 outline-none transition-transform duration-150 focus-visible:ring-[3px] focus-visible:ring-amber-400/50 active:scale-90"
        >
          <GoldStar on={shown >= n} className={cn('size-10 sm:size-11', shown >= n && 'scale-105')} />
        </button>
      ))}
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

  const avgStars = ready ? (scores.perfScore + scores.customerScore + scores.teamScore) / 3 : 0

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden border-0 bg-slate-50 p-0 dark:bg-slate-950 sm:max-w-lg" dir="rtl">
        <GoldDefs />
        {/* ================= الهيدر: أسود ملكي + ذهبي (نفس هيرو صفحة التقييمات) ================= */}
        <DialogHeader className="relative shrink-0 gap-0 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-black px-4 pb-5 pt-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:px-6 sm:pt-6">
          <div aria-hidden className="absolute -top-24 -right-24 size-64 rounded-full bg-amber-500/25 blur-[70px]" />
          <div aria-hidden className="absolute -bottom-24 -left-24 size-56 rounded-full bg-yellow-500/15 blur-[60px]" />
          <div className="relative flex items-center gap-4">
            <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[22px] border border-amber-200/40 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 text-amber-950 shadow-[0_14px_28px_rgba(245,158,11,0.35),inset_0_2px_8px_rgba(255,255,255,0.6)] ring-1 ring-amber-200/40">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent" />
              <Award className="relative size-8 drop-shadow" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200 backdrop-blur-md">
                <Trophy className="size-3" />
                تقييم الأداء والتميز
              </div>
              <DialogTitle className="truncate text-xl font-extrabold leading-tight drop-shadow-md sm:text-2xl">
                تقييم <span className="bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">{item.name}</span>
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-300">
                {monthLabel(month)} — درجة الحضور التلقائية: <b className="text-amber-300">{item.attendanceScore}%</b>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6">
          {EVAL_CRITERIA.map((c) => (
            <section key={c.key} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white px-4 pb-3 pt-5 shadow-[0_5px_0_rgba(15,23,42,0.06),0_14px_24px_-14px_rgba(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900">
              <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-amber-300 via-yellow-400 to-amber-600" />
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-black">{c.label}</h3>
                <span className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-extrabold tabular-nums transition-colors',
                  scores[c.key] > 0 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
                )}>
                  {scores[c.key] > 0 ? `${scores[c.key]}/5 — ${STAR_LABELS[scores[c.key]]}` : 'لسه ماتقيّمش'}
                </span>
              </div>
              <StarRating label={c.label} value={scores[c.key]} onChange={(n) => setScores((s) => ({ ...s, [c.key]: n }))} />
            </section>
          ))}

          {grade && overall != null ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-black px-5 py-4 text-white shadow-[0_6px_0_rgba(0,0,0,0.35),0_20px_40px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]">
              <div aria-hidden className="absolute -top-16 -right-10 size-44 rounded-full bg-amber-500/25 blur-[50px]" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-300">الدرجة النهائية</p>
                  <p className="mt-0.5 flex items-baseline gap-1 text-4xl font-black tabular-nums leading-none">
                    <span className="bg-gradient-to-b from-amber-200 to-yellow-500 bg-clip-text text-transparent">{overall}</span>
                    <span className="text-xl font-extrabold text-amber-400">%</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={cn(
                    'rounded-lg px-3 py-1 text-xs font-extrabold',
                    grade.tone === 'emerald' && 'bg-emerald-500/20 text-emerald-300',
                    grade.tone === 'sky' && 'bg-sky-500/20 text-sky-300',
                    grade.tone === 'amber' && 'bg-amber-500/20 text-amber-300',
                    grade.tone === 'rose' && 'bg-rose-500/20 text-rose-300',
                  )}>{grade.label}</span>
                  <div className="flex items-center gap-0.5" aria-label={`متوسط تقييمك ${avgStars.toFixed(1)} من 5`}>
                    {[1, 2, 3, 4, 5].map((n) => <GoldStar key={n} on={avgStars >= n - 0.25} className="size-5" />)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <section className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 pt-5 shadow-[0_5px_0_rgba(15,23,42,0.06),0_14px_24px_-14px_rgba(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-emerald-400 to-emerald-600" />
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/35 ring-1 ring-inset ring-white/25">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <Gift className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
              </span>
              <div>
                <h3 className="text-[15px] font-black leading-tight">حافز مرتبط بالتقييم</h3>
                <p className="text-[11px] font-medium text-muted-foreground">اختياري — بينزل في مسودة الرواتب</p>
              </div>
            </div>
            <div className="relative">
              <Input type="number" inputMode="decimal" dir="ltr" min={0} disabled={locked} value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="0" className="h-11 rounded-xl border-slate-200 bg-slate-50 pe-14 text-base font-black tabular-nums shadow-inner dark:border-slate-700 dark:bg-slate-800/50" />
              <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-bold text-slate-400">جنيه</span>
            </div>
            {locked ? (
              <p className="mt-2 text-xs text-muted-foreground">الحافز اتضاف للمرتبات بالفعل.</p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[0, 5, 10].map((p) => {
                  const val = p ? String(Math.round((item.baseSalary * p) / 100)) : ''
                  const active = bonus === val
                  return (
                    <button
                      key={p} type="button" onClick={() => setBonus(val)}
                      className={cn(
                        'h-10 rounded-xl border text-xs font-extrabold transition-all active:translate-y-[3px] active:shadow-none',
                        active
                          ? 'border-amber-400 bg-gradient-to-b from-amber-100 to-amber-200 text-amber-800 shadow-[0_3px_0_rgb(217,119,6)]'
                          : 'border-slate-200 bg-white text-slate-600 shadow-[0_3px_0_rgb(226,232,240)] hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:shadow-[0_3px_0_rgb(15,23,42)]',
                      )}
                    >
                      {p ? `${p}% من الراتب` : 'بدون'}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 pt-5 shadow-[0_5px_0_rgba(15,23,42,0.06),0_14px_24px_-14px_rgba(0,0,0,0.18)] dark:border-slate-800 dark:bg-slate-900">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-sky-400 to-sky-600" />
            <div className="mb-3 flex items-center gap-3">
              <span aria-hidden className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-lg shadow-sky-500/35 ring-1 ring-inset ring-white/25">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <MessageSquareText className="relative size-[18px] drop-shadow-md" strokeWidth={2.3} />
              </span>
              <h3 className="text-[15px] font-black leading-tight">ملاحظة <span className="text-[11px] font-medium text-muted-foreground">(اختياري)</span></h3>
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="اكتب ملاحظتك على أداء الشهر..." className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm font-semibold shadow-inner dark:border-slate-700 dark:bg-slate-800/50" />
          </section>
        </DialogBody>

        <DialogFooter className="shrink-0 flex-row justify-end gap-3 border-t bg-background px-4 py-3.5 sm:px-6">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-xl px-6 font-bold shadow-[0_4px_0_rgba(15,23,42,0.08)] transition-all hover:shadow-[0_2px_0_rgba(15,23,42,0.08)]">إلغاء</Button>
          <Button
            onClick={save} disabled={saving || !ready}
            className="h-11 gap-2 rounded-xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 px-8 font-extrabold text-amber-950 shadow-[0_5px_0_rgb(180,83,9)] transition-all hover:from-amber-300 hover:via-yellow-400 hover:to-amber-500 hover:shadow-[0_2px_0_rgb(180,83,9)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}حفظ التقييم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
