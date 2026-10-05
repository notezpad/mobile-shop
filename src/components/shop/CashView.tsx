'use client'

import * as React from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Clock,
  Coins,
  CreditCard,
  Crown,
  FileText,
  HandCoins,
  Landmark,
  Loader2,
  Percent,
  PencilLine,
  Plus,
  Receipt,
  RotateCcw,
  Scale,
  Search,
  ShoppingCart,
  Smartphone,
  StickyNote,
  Truck,
  Vault,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatArabicDate, formatArabicDateTime } from '@/lib/format'
import { parseSignedAmount } from '@/lib/amount'
import { cn } from '@/lib/utils'
import { printListReportHtml, openPrintWindow, printLtr } from '@/lib/print'
import { useShopStore } from '@/lib/store'
import { useDataRefresh } from '@/lib/offline/data-events'

/* ================================================================== */
/*  الأنواع والثوابت                                                   */
/* ================================================================== */
interface Entry {
  id: number
  source: string
  amount: number
  note: string | null
  method?: string | null
  userName?: string | null
  createdAt: string
}

type Tone =
  | 'emerald' | 'orange' | 'sky' | 'violet' | 'slate' | 'teal'
  | 'amber' | 'indigo' | 'lime' | 'fuchsia' | 'rose'

// (classes مكتوبة كاملة عشان Tailwind يلقطها)
const TONES: Record<Tone, { tile: string; dot: string; hex: string }> = {
  emerald: { tile: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', hex: '#10b981' },
  orange: { tile: 'bg-orange-500/12 text-orange-600 dark:text-orange-400', dot: 'bg-orange-500', hex: '#f97316' },
  sky: { tile: 'bg-sky-500/12 text-sky-600 dark:text-sky-400', dot: 'bg-sky-500', hex: '#0ea5e9' },
  violet: { tile: 'bg-violet-500/12 text-violet-600 dark:text-violet-400', dot: 'bg-violet-500', hex: '#8b5cf6' },
  slate: { tile: 'bg-slate-500/12 text-slate-600 dark:text-slate-400', dot: 'bg-slate-500', hex: '#64748b' },
  teal: { tile: 'bg-teal-500/12 text-teal-600 dark:text-teal-400', dot: 'bg-teal-500', hex: '#14b8a6' },
  amber: { tile: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', hex: '#f59e0b' },
  indigo: { tile: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500', hex: '#6366f1' },
  lime: { tile: 'bg-lime-500/12 text-lime-700 dark:text-lime-400', dot: 'bg-lime-500', hex: '#84cc16' },
  fuchsia: { tile: 'bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400', dot: 'bg-fuchsia-500', hex: '#d946ef' },
  rose: { tile: 'bg-rose-500/12 text-rose-600 dark:text-rose-400', dot: 'bg-rose-500', hex: '#f43f5e' },
}

const SOURCES: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  sale: { label: 'بيع', icon: ShoppingCart, tone: 'emerald' },
  refund: { label: 'مرتجع بيع', icon: RotateCcw, tone: 'orange' },
  maintenance: { label: 'صيانة', icon: Wrench, tone: 'sky' },
  transaction: { label: 'معاملة مالية', icon: ArrowLeftRight, tone: 'violet' },
  manual: { label: 'يدوي', icon: PencilLine, tone: 'slate' },
  payment: { label: 'دفعة عميل', icon: HandCoins, tone: 'teal' },
  commission: { label: 'عمولة', icon: Percent, tone: 'amber' },
  purchase: { label: 'شراء', icon: Truck, tone: 'indigo' },
  purchase_refund: { label: 'مرتجع شراء', icon: RotateCcw, tone: 'lime' },
  supplier_payment: { label: 'دفعة لمورد', icon: Truck, tone: 'fuchsia' },
  expense: { label: 'مصروف', icon: Receipt, tone: 'rose' },
}
const srcMeta = (s: string) =>
  SOURCES[s] ?? { label: s, icon: Wallet, tone: 'slate' as Tone }

const METHODS: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  cash: { label: 'نقدي', icon: Banknote, tone: 'emerald' },
  vodafone_cash: { label: 'فودافون كاش', icon: Smartphone, tone: 'rose' },
  instapay: { label: 'إنستاباي', icon: Smartphone, tone: 'violet' },
  fawry: { label: 'فوري', icon: Coins, tone: 'amber' },
  card: { label: 'بطاقة', icon: CreditCard, tone: 'sky' },
  bank: { label: 'بنك / تحويل', icon: Landmark, tone: 'indigo' },
}
const mtdMeta = (m: string) => METHODS[m] ?? { label: m, icon: Wallet, tone: 'slate' as Tone }

type Kpi = 'emerald' | 'rose' | 'sky' | 'amber'
const KPI: Record<Kpi, { card: string; tile: string; text: string; bar: string; track: string; wm: string }> = {
  emerald: {
    card: 'from-emerald-50 to-white dark:from-emerald-950/30 dark:to-card border-t-emerald-500',
    tile: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500', track: 'bg-emerald-500/15', wm: 'text-emerald-500',
  },
  rose: {
    card: 'from-rose-50 to-white dark:from-rose-950/30 dark:to-card border-t-rose-500',
    tile: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    text: 'text-rose-700 dark:text-rose-400',
    bar: 'bg-rose-500', track: 'bg-rose-500/15', wm: 'text-rose-500',
  },
  sky: {
    card: 'from-sky-50 to-white dark:from-sky-950/30 dark:to-card border-t-sky-500',
    tile: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    text: 'text-sky-700 dark:text-sky-400',
    bar: 'bg-sky-500', track: 'bg-sky-500/15', wm: 'text-sky-500',
  },
  amber: {
    card: 'from-amber-50 to-white dark:from-amber-950/30 dark:to-card border-t-amber-500',
    tile: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500', track: 'bg-amber-500/15', wm: 'text-amber-500',
  },
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

type Period = 'all' | 'today' | '7d' | 'month'
type Dir = 'all' | 'in' | 'out'

const num = (n: number) =>
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const dayKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d
  const p = (v: number) => String(v).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

const timeLabel = (iso: string) => {
  const d = new Date(iso)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'م' : 'ص'}`
}

/**
 * مبلغ بالترتيب العربي الطبيعي (نفس المصروفات): العلامة ← الرقم ← جنيه
 * من اليمين لليسار. الرقم نفسه معزول LTR عشان الأرقام ما تتلخبطش.
 */
function Amt({
  value,
  sign = false,
  className,
}: {
  value: number
  sign?: boolean
  className?: string
}) {
  const s = value < 0 ? '−' : sign ? '+' : ''
  return (
    <span dir="rtl" style={{ unicodeBidi: 'isolate' }} className={cn('whitespace-nowrap tabular-nums', className)}>
      {s && <span>{s} </span>}
      <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{num(value)}</span> جنيه
    </span>
  )
}

/* ================================================================== */
/*  الصفحة                                                             */
/* ================================================================== */
export function CashView() {
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const [data, setData] = React.useState<{ balance: number; entries: Entry[] } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const [period, setPeriod] = React.useState<Period>('all')
  const [dir, setDir] = React.useState<Dir>('all')
  const [source, setSource] = React.useState('all')
  const [method, setMethod] = React.useState('all')
  const [query, setQuery] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [donutTab, setDonutTab] = React.useState<'in' | 'out'>('in')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<{ balance: number; entries: Entry[] }>('/api/cash')
      setData(d)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['cash'], load)

  // Entries come newest-first from the API, and `data.balance` is the
  // authoritative running total (sum of ALL entries, not just the visible
  // page). To get a correct "balance after this row" per row even when
  // there are more than the fetched 200 entries, walk backwards from the
  // known-correct current balance, subtracting each row's amount as we go.
  const runningBalances = React.useMemo(() => {
    if (!data) return []
    let running = data.balance
    return data.entries.map((e) => {
      const after = running
      running -= e.amount
      return after
    })
  }, [data])

  /* ---------- إحصائيات كل الحركات المحمّلة ---------- */
  const stats = React.useMemo(() => {
    const entries = data?.entries ?? []
    const todayK = dayKey(new Date())
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return { key: dayKey(d), label: DAY_NAMES[d.getDay()], inn: 0, out: 0, today: i === 6 }
    })
    const bySrcIn: Record<string, number> = {}
    const bySrcOut: Record<string, number> = {}
    const byMethod: Record<string, number> = {}
    let totalIn = 0, totalOut = 0, countIn = 0, countOut = 0, todayNet = 0, todayCount = 0

    for (const e of entries) {
      const k = dayKey(e.createdAt)
      const w = week.find((x) => x.key === k)
      const m = e.method || 'cash'
      byMethod[m] = (byMethod[m] ?? 0) + e.amount
      if (e.amount >= 0) {
        totalIn += e.amount; countIn++
        bySrcIn[e.source] = (bySrcIn[e.source] ?? 0) + e.amount
        if (w) w.inn += e.amount
      } else {
        const a = Math.abs(e.amount)
        totalOut += a; countOut++
        bySrcOut[e.source] = (bySrcOut[e.source] ?? 0) + a
        if (w) w.out += a
      }
      if (k === todayK) { todayNet += e.amount; todayCount++ }
    }
    const top = Object.entries(bySrcIn).sort((a, b) => b[1] - a[1])[0]
    return { totalIn, totalOut, countIn, countOut, todayNet, todayCount, week, bySrcIn, bySrcOut, byMethod, top }
  }, [data])

  /* ---------- الفلترة ---------- */
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const todayK = dayKey(new Date())
    const d7 = new Date(); d7.setDate(d7.getDate() - 6)
    const k7 = dayKey(d7)
    return (data?.entries ?? [])
      .map((e, index) => ({ e, index, after: runningBalances[index] ?? 0 }))
      .filter(({ e }) => {
        const k = dayKey(e.createdAt)
        if (period === 'today' && k !== todayK) return false
        if (period === '7d' && k < k7) return false
        if (period === 'month' && k.slice(0, 7) !== todayK.slice(0, 7)) return false
        if (from && k < from) return false
        if (to && k > to) return false
        if (dir === 'in' && e.amount < 0) return false
        if (dir === 'out' && e.amount >= 0) return false
        if (source !== 'all' && e.source !== source) return false
        if (method !== 'all' && (e.method || 'cash') !== method) return false
        if (!q) return true
        return (
          srcMeta(e.source).label.toLowerCase().includes(q) ||
          (e.note ?? '').toLowerCase().includes(q) ||
          (e.userName ?? '').toLowerCase().includes(q)
        )
      })
  }, [data, runningBalances, period, from, to, dir, source, method, query])

  const filtered = period !== 'all' || dir !== 'all' || source !== 'all' || method !== 'all' || !!query || !!from || !!to
  const clearFilters = () => {
    setPeriod('all'); setDir('all'); setSource('all'); setMethod('all'); setQuery(''); setFrom(''); setTo('')
  }

  const rowsIn = rows.filter((r) => r.e.amount >= 0).reduce((s, r) => s + r.e.amount, 0)
  const rowsOut = rows.filter((r) => r.e.amount < 0).reduce((s, r) => s + Math.abs(r.e.amount), 0)

  // تجميع الحركات باليوم
  const groups = React.useMemo(() => {
    const map = new Map<string, { key: string; items: typeof rows; net: number; inn: number; out: number }>()
    for (const r of rows) {
      const k = dayKey(r.e.createdAt)
      let g = map.get(k)
      if (!g) { g = { key: k, items: [], net: 0, inn: 0, out: 0 }; map.set(k, g) }
      g.items.push(r); g.net += r.e.amount
      if (r.e.amount >= 0) g.inn += r.e.amount
      else g.out += Math.abs(r.e.amount)
    }
    return [...map.values()]
  }, [rows])

  const dayTitle = (k: string) => {
    const t = new Date(); const y = new Date(); y.setDate(y.getDate() - 1)
    if (k === dayKey(t)) return 'اليوم'
    if (k === dayKey(y)) return 'أمس'
    return `${DAY_NAMES[new Date(k + 'T00:00:00').getDay()]} ${formatArabicDate(new Date(k + 'T00:00:00'))}`
  }

  /* ---------- الدونات ---------- */
  const donutMap = donutTab === 'in' ? stats.bySrcIn : stats.bySrcOut
  const donutData = Object.entries(donutMap).sort((a, b) => b[1] - a[1])
  const donutTotal = donutData.reduce((s, [, v]) => s + v, 0)

  const pickSource = (s: string) => {
    if (source === s && dir === donutTab) { setSource('all'); setDir('all') }
    else { setSource(s); setDir(donutTab) }
  }

  const exportPdf = () => {
    if (!data) return
    const html = printListReportHtml(
      {
        title: 'الخزنة',
        subtitle: filtered ? 'حركات النقدية (بعد التصفية)' : 'حركات النقدية والرصيد الحالي',
        columns: [
          { header: '#' }, { header: 'التاريخ' }, { header: 'المصدر' }, { header: 'بواسطة' },
          { header: 'المبلغ' }, { header: 'الرصيد بعد الحركة' }, { header: 'ملاحظات', align: 'right' },
        ],
        rows: rows.map(({ e, index, after }) => [
          String(index + 1),
          printLtr(formatArabicDateTime(e.createdAt)),
          srcMeta(e.source).label,
          e.userName ?? '—',
          `${e.amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(e.amount))}`,
          formatCurrency(after),
          e.note ?? '—',
        ]),
        kpis: [
          { label: 'رصيد الخزنة الحالي', value: formatCurrency(data.balance), emphasize: true },
          { label: 'إجمالي الوارد', value: formatCurrency(rowsIn) },
          { label: 'إجمالي الصادر', value: formatCurrency(rowsOut) },
          { label: 'عدد الحركات', value: String(rows.length) },
        ],
        emptyMessage: 'لا توجد حركات',
      },
      {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
        logo: shopBranding.logoPath || undefined,
      }
    )
    openPrintWindow(html, () => toast.error('الرجاء السماح بالنوافذ المنبثقة'))
  }

  const balance = data?.balance ?? 0
  const negative = balance < 0
  const flowTotal = stats.totalIn + stats.totalOut
  const inShare = flowTotal ? (stats.totalIn / flowTotal) * 100 : 0
  const outShare = flowTotal ? (stats.totalOut / flowTotal) * 100 : 0
  const topShare = stats.top && stats.totalIn ? (stats.top[1] / stats.totalIn) * 100 : 0
  const weekMax = Math.max(1, ...stats.week.map((d) => Math.max(d.inn, d.out)))

  return (
    <div className="space-y-4">
      {/* ═══════════════ الهيرو ═══════════════ */}
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 dark:from-emerald-950/40 dark:via-card dark:to-amber-950/25 sm:p-7">
        {/* علامة مائية: الخزنة */}
        <Vault className="pointer-events-none absolute -bottom-8 -start-6 size-56 text-emerald-600/[0.05] dark:text-emerald-400/[0.06]" strokeWidth={1} />

        <div className="relative grid items-center gap-5 lg:grid-cols-[1fr_minmax(0,1.1fr)_auto] lg:gap-6">
          {/* الرصيد */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 sm:size-8 dark:text-emerald-400">
                <Vault className="size-3.5 sm:size-4" />
              </span>
              الخزنة
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-14 w-56" />
            ) : (
              <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2">
                {negative && (
                  <span className="text-4xl font-extrabold text-rose-600 dark:text-rose-400 sm:text-5xl md:text-6xl">−</span>
                )}
                <span
                  dir="ltr"
                  style={{ unicodeBidi: 'isolate' }}
                  title={num(balance)}
                  className={cn(
                    'min-w-0 break-all text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl md:text-6xl',
                    negative && 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {num(balance)}
                </span>
                <span className="shrink-0 text-base font-semibold text-muted-foreground sm:text-lg">جنيه</span>
              </div>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              {negative && !loading ? (
                <span className="font-medium text-rose-600 dark:text-rose-400">الرصيد بالسالب — راجع حركات الصادر</span>
              ) : (
                'الرصيد الحالي بعد كل الحركات'
              )}
            </p>
          </div>

          {/* رسم آخر 7 أيام */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>آخر ٧ أيام</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-emerald-500" />وارد</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-rose-500" />صادر</span>
              </span>
            </div>
            <div className="flex h-24 items-end gap-1.5 sm:gap-2">
              {stats.week.map((d) => (
                <div
                  key={d.key}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={`${d.label}: وارد ${num(d.inn)} — صادر ${num(d.out)}`}
                >
                  <div className="flex h-full w-full items-end justify-center gap-[3px]">
                    <div
                      className={cn('w-2 rounded-t bg-emerald-500 transition-[height] duration-slow sm:w-2.5', d.inn === 0 && 'bg-emerald-500/20')}
                      style={{ height: `${loading ? 4 : Math.max(4, (d.inn / weekMax) * 100)}%` }}
                    />
                    <div
                      className={cn('w-2 rounded-t bg-rose-500 transition-[height] duration-slow sm:w-2.5', d.out === 0 && 'bg-rose-500/20')}
                      style={{ height: `${loading ? 4 : Math.max(4, (d.out / weekMax) * 100)}%` }}
                    />
                  </div>
                  <span className={cn('text-[10px]', d.today ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* الأزرار — 📱 شبكة 2 أعمدة على الجوال */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap lg:flex-col">
            <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="size-4 shrink-0" />
              <span className="truncate">حركة يدوية</span>
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={loading} className="w-full bg-background/70 sm:w-auto">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">تصدير PDF</span>
            </Button>
          </div>
        </div>

        {/* كروت KPI */}
        <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            tone="emerald" icon={ArrowDownLeft} loading={loading}
            label="إجمالي الوارد"
            value={<Amt value={stats.totalIn} />}
            sub={`${stats.countIn} حركة وارد`}
            progress={inShare}
          />
          <KpiCard
            tone="rose" icon={ArrowUpRight} loading={loading}
            label="إجمالي الصادر"
            value={<Amt value={stats.totalOut} />}
            sub={`${stats.countOut} حركة صادر`}
            progress={outShare}
          />
          <KpiCard
            tone="sky" icon={Scale} loading={loading}
            label="صافي حركة اليوم"
            value={<Amt value={stats.todayNet} sign />}
            sub={`${stats.todayCount} حركة اليوم`}
          />
          <KpiCard
            tone="amber" icon={Crown} loading={loading}
            label="أكبر مصدر وارد"
            value={stats.top ? srcMeta(stats.top[0]).label : '—'}
            sub={stats.top ? formatCurrency(stats.top[1]) : 'لا توجد حركات'}
            progress={stats.top ? topShare : undefined}
            progressLabel={stats.top ? `${Math.round(topShare)}%` : undefined}
          />
        </div>
      </section>

      {/* ═══════════════ الصف الثاني ═══════════════ */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ----- العمود الرئيسي: فلاتر + دفتر ----- */}
        <div className="min-w-0 space-y-4">
          {/* الفلاتر */}
          <div className="space-y-3 rounded-2xl border bg-card p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full min-w-0 sm:min-w-[200px] sm:flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground sm:size-4" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث في البيان أو الملاحظات أو الموظف..."
                  className="h-9 rounded-xl ps-9 text-xs placeholder:text-xs sm:h-10 sm:text-sm sm:placeholder:text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([['all', 'الكل'], ['today', 'اليوم'], ['7d', '٧ أيام'], ['month', 'هذا الشهر']] as [Period, string][]).map(([k, l]) => (
                  <Pill key={k} active={period === k && !from && !to} onClick={() => { setPeriod(k); setFrom(''); setTo('') }}>
                    {l}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5">
                <Pill active={dir === 'all'} onClick={() => setDir('all')}>كل الحركات</Pill>
                <Pill active={dir === 'in'} onClick={() => setDir('in')} tone="emerald">وارد</Pill>
                <Pill active={dir === 'out'} onClick={() => setDir('out')} tone="rose">صادر</Pill>
              </div>
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground sm:w-auto sm:text-sm">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <span className="shrink-0 text-xs">من</span>
                  <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod('all') }} className="h-9 min-w-0 flex-1 rounded-lg text-xs sm:w-40 sm:flex-none sm:text-sm" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <span className="shrink-0 text-xs">إلى</span>
                  <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod('all') }} className="h-9 min-w-0 flex-1 rounded-lg text-xs sm:w-40 sm:flex-none sm:text-sm" />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Pill active={source === 'all'} onClick={() => setSource('all')}>كل المصادر</Pill>
              {Object.keys({ ...stats.bySrcIn, ...stats.bySrcOut }).map((s) => (
                <Pill key={s} active={source === s} onClick={() => setSource(source === s ? 'all' : s)} dot={TONES[srcMeta(s).tone].dot}>
                  {srcMeta(s).label}
                </Pill>
              ))}
            </div>

            {filtered && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>النتائج: <b className="tabular-nums text-foreground">{rows.length}</b> حركة</span>
                  <span>وارد: <b className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(rowsIn)}</b></span>
                  <span>صادر: <b className="tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(rowsOut)}</b></span>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  مسح الفلاتر
                </Button>
              </div>
            )}
          </div>

          {/* الدفتر */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-4 py-14 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Vault className="size-7" />
              </div>
              <p className="font-semibold">{data?.entries.length ? 'لا توجد حركات مطابقة للفلاتر' : 'الخزنة فاضية — لا توجد حركات بعد'}</p>
              <p className="text-xs text-muted-foreground">
                {data?.entries.length ? 'جرّب تغيير الفلاتر أو كلمة البحث' : 'أي بيع أو مصروف أو حركة يدوية هتظهر هنا'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* رأس أعمدة الدفتر */}
              <div className="hidden rounded-xl border bg-muted/50 px-4 py-2.5 text-xs font-bold text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_150px_180px_160px] lg:gap-3">
                <span>البيان</span>
                <span>بواسطة</span>
                <span className="text-center">المبلغ</span>
                <span className="text-end">الرصيد بعد الحركة</span>
              </div>

              {groups.map((g) => {
                const isToday = g.key === dayKey(new Date())
                return (
                  <div
                    key={g.key}
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-card shadow-sm',
                      isToday && 'border-emerald-500/30 shadow-md'
                    )}
                  >
                    {/* رأس اليوم */}
                    <div
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-3 sm:gap-3 sm:px-4',
                        isToday
                          ? 'bg-gradient-to-l from-emerald-500/10 via-transparent to-amber-500/5'
                          : 'bg-muted/40'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10',
                            isToday ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          <CalendarDays className="size-4 sm:size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold leading-tight sm:text-base">{dayTitle(g.key)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {g.items.length} حركة
                            {(isToday || dayTitle(g.key) === 'أمس') && (
                              <> • {formatArabicDate(new Date(g.key + 'T00:00:00'))}</>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-1.5 text-[11px] font-bold sm:w-auto sm:gap-2 sm:text-xs">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-700 sm:px-2.5 sm:py-1.5 dark:text-emerald-400">
                          <ArrowDownLeft className="size-3 shrink-0 sm:size-3.5" />
                          وارد <Amt value={g.inn} />
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2 py-1 text-rose-700 sm:px-2.5 sm:py-1.5 dark:text-rose-400">
                          <ArrowUpRight className="size-3 shrink-0 sm:size-3.5" />
                          صادر <Amt value={g.out} />
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border px-2 py-1 sm:px-2.5 sm:py-1.5',
                            g.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                          )}
                        >
                          <Scale className="size-3 shrink-0 sm:size-3.5" />
                          الصافي <Amt value={g.net} sign />
                        </span>
                      </div>
                    </div>

                    {/* الحركات */}
                    <div className="divide-y">
                      {g.items.map(({ e, after }) => {
                        const isIn = e.amount >= 0
                        const sm = srcMeta(e.source)
                        const SI = sm.icon
                        return (
                          <div
                            key={e.id}
                            className="group relative grid grid-cols-2 items-center gap-x-3 gap-y-3 px-3.5 py-3.5 transition-colors hover:bg-muted/40 sm:px-4 sm:py-4 lg:grid-cols-[minmax(0,1fr)_150px_180px_160px]"
                          >
                            <span
                              className={cn(
                                'absolute inset-y-3 start-0 w-1 rounded-e-full transition-all group-hover:inset-y-1',
                                isIn ? 'bg-emerald-500' : 'bg-rose-500'
                              )}
                            />

                            {/* البيان */}
                            <div className="col-span-2 flex min-w-0 items-start gap-3 sm:gap-3.5 lg:col-span-1">
                              <div className="relative shrink-0">
                                <span className={cn('flex size-10 items-center justify-center rounded-2xl sm:size-12', TONES[sm.tone].tile)}>
                                  <SI className="size-5 sm:size-6" />
                                </span>
                                <span
                                  className={cn(
                                    'absolute -bottom-1 -end-1 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-card sm:size-5',
                                    isIn ? 'bg-emerald-500' : 'bg-rose-500'
                                  )}
                                >
                                  {isIn ? <ArrowDownLeft className="size-2.5 sm:size-3" /> : <ArrowUpRight className="size-2.5 sm:size-3" />}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <p className="text-sm font-extrabold leading-tight sm:text-base">{sm.label}</p>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                                    <Clock className="size-3 shrink-0" />
                                    <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{timeLabel(e.createdAt)}</span>
                                  </span>
                                  {e.method && e.method !== 'cash' && (
                                    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                                      {mtdMeta(e.method).label}
                                    </span>
                                  )}
                                </div>
                                {e.note ? (
                                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground sm:text-sm">
                                    <StickyNote className="mt-0.5 size-3.5 shrink-0 opacity-60" />
                                    <span className="line-clamp-2">{e.note}</span>
                                  </p>
                                ) : null}
                                {/* الموظف — للموبايل والتابلت فقط */}
                                {e.userName && (
                                  <p className="mt-1 truncate text-xs text-muted-foreground lg:hidden">بواسطة: {e.userName}</p>
                                )}
                              </div>
                            </div>

                            {/* بواسطة — شاشات كبيرة */}
                            <div className="hidden items-center gap-2 lg:flex">
                              {e.userName ? (
                                <>
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                    {e.userName.trim().charAt(0)}
                                  </span>
                                  <span className="truncate text-sm font-medium">{e.userName}</span>
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </div>

                            {/* المبلغ */}
                            <div className="min-w-0 lg:text-center">
                              <span
                                className={cn(
                                  'inline-flex max-w-full items-center rounded-xl px-2.5 py-1.5 text-sm font-black sm:px-3.5 sm:py-2 sm:text-base lg:text-lg',
                                  isIn
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                )}
                              >
                                <Amt value={e.amount} sign />
                              </span>
                            </div>

                            {/* الرصيد بعد الحركة */}
                            <div className="min-w-0 text-end">
                              <p className="text-[10px] font-medium text-muted-foreground lg:hidden">الرصيد بعد الحركة</p>
                              <Amt
                                value={after}
                                className={cn('text-sm font-bold', after < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground/80')}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && data && data.entries.length >= 200 && (
            <p className="text-xs text-muted-foreground">
              * الدفتر والرسوم تعرض آخر 200 حركة، أما رصيد الخزنة فهو إجمالي كل الحركات.
            </p>
          )}
        </div>

        {/* ----- العمود الجانبي: دونات + طرق الدفع ----- */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          {/* توزيع الحركات */}
          <div className="rounded-2xl border bg-card p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold sm:text-base">توزيع الحركات</h3>
                <p className="truncate text-xs text-muted-foreground">اضغط على أي مصدر لتصفية القائمة</p>
              </div>
              <div className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5 text-xs">
                {(['in', 'out'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDonutTab(t)}
                    className={cn(
                      'rounded-md px-2 py-1 font-semibold transition-colors sm:px-2.5',
                      donutTab === t
                        ? t === 'in' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                        : 'text-muted-foreground'
                    )}
                  >
                    {t === 'in' ? 'وارد' : 'صادر'}
                  </button>
                ))}
              </div>
            </div>

            <Donut
              data={donutData}
              total={donutTotal}
              label={donutTab === 'in' ? 'إجمالي الوارد' : 'إجمالي الصادر'}
              selected={dir === donutTab ? source : 'all'}
              onPick={pickSource}
              loading={loading}
            />

            <div className="mt-3 space-y-1">
              {donutData.length === 0 && !loading && (
                <p className="py-2 text-center text-xs text-muted-foreground">لا توجد حركات</p>
              )}
              {donutData.map(([s, v]) => {
                const m = srcMeta(s)
                const active = source === s && dir === donutTab
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickSource(s)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted',
                      active && 'bg-muted ring-1 ring-border'
                    )}
                  >
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', TONES[m.tone].tile)}>
                      <m.icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round((v / donutTotal) * 100)}%</span>
                    <span className="w-24 shrink-0 text-end text-xs font-bold tabular-nums" title={formatCurrency(v)}>{formatCurrency(v)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* الرصيد حسب طريقة الدفع */}
          <div className="rounded-2xl border bg-card p-3.5 sm:p-4">
            <h3 className="text-sm font-bold sm:text-base">الرصيد حسب طريقة الدفع</h3>
            <p className="truncate text-xs text-muted-foreground">النقدي الفعلي منفصل عن المحافظ والبنك</p>
            <div className="mt-3 space-y-1">
              {Object.entries(stats.byMethod).length === 0 && !loading && (
                <p className="py-2 text-center text-xs text-muted-foreground">لا توجد حركات</p>
              )}
              {Object.entries(stats.byMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([m, v]) => {
                  const mm = mtdMeta(m)
                  const active = method === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(active ? 'all' : m)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition-colors hover:bg-muted',
                        active && 'bg-muted ring-1 ring-border'
                      )}
                    >
                      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', TONES[mm.tone].tile)}>
                        <mm.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{mm.label}</span>
                      <Amt value={v} className={cn('shrink-0 text-sm font-bold', v < 0 && 'text-rose-600 dark:text-rose-400')} />
                    </button>
                  )
                })}
            </div>
          </div>
        </aside>
      </div>

      <ManualDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} balance={balance} />
    </div>
  )
}

/* ================================================================== */
/*  مكوّنات مساعدة                                                     */
/* ================================================================== */
function Pill({
  active, onClick, children, dot, tone,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  dot?: string
  tone?: 'emerald' | 'rose'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs',
        active
          ? tone === 'rose'
            ? 'border-rose-600 bg-rose-600 text-white'
            : 'border-primary bg-primary text-primary-foreground'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {dot && <i className={cn('size-2 shrink-0 rounded-full', dot)} />}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  )
}

function KpiCard({
  tone, icon: Icon, label, value, sub, progress, progressLabel, loading,
}: {
  tone: Kpi
  icon: LucideIcon
  label: string
  value: React.ReactNode
  sub: string
  progress?: number
  progressLabel?: string
  loading: boolean
}) {
  const t = KPI[tone]
  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-2xl border border-t-2 bg-gradient-to-br p-3 sm:p-4', t.card)}>
      <Icon className={cn('pointer-events-none absolute -bottom-4 -start-3 size-20 opacity-[0.07] sm:size-24', t.wm)} strokeWidth={1.25} />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-sm">{label}</p>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-xl sm:size-9', t.tile)}>
            <Icon className="size-3.5 sm:size-4" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-7 w-28" />
        ) : (
          <p className="mt-2 min-w-0 break-all text-xl font-extrabold sm:text-2xl">{value}</p>
        )}
        <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{sub}</p>
        {progress !== undefined && (
          <div className="mt-3 flex items-center gap-2">
            <div className={cn('h-1.5 flex-1 overflow-hidden rounded-full', t.track)}>
              <div className={cn('h-full rounded-full transition-[width] duration-slow', t.bar)} style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <span className={cn('shrink-0 text-[11px] font-bold tabular-nums', t.text)}>{progressLabel ?? `${Math.round(progress)}%`}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Donut({
  data, total, label, selected, onPick, loading,
}: {
  data: [string, number][]
  total: number
  label: string
  selected: string
  onPick: (s: string) => void
  loading: boolean
}) {
  const R = 74
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="relative mx-auto mt-4 size-40 sm:size-48">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="24" className="stroke-muted" />
        {!loading &&
          total > 0 &&
          data.map(([s, v]) => {
            const len = (v / total) * C
            const gap = data.length > 1 ? 3 : 0
            const el = (
              <circle
                key={s}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                strokeWidth="24"
                stroke={TONES[srcMeta(s).tone].hex}
                strokeDasharray={`${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}`}
                strokeDashoffset={-acc}
                opacity={selected === 'all' || selected === s ? 1 : 0.25}
                className="cursor-pointer transition-opacity"
                onClick={() => onPick(s)}
              />
            )
            acc += len
            return el
          })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span dir="ltr" className="max-w-full truncate px-2 text-xl font-extrabold tabular-nums sm:text-2xl">{loading ? '—' : num(total)}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  نافذة الحركة اليدوية                                               */
/* ================================================================== */
interface ManualProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
  balance: number
}

const QUICK_ADD = [50, 100, 200, 500, 1000]
function ManualDialog({ open, onOpenChange, onSaved, balance }: ManualProps) {
  const [amount, setAmount] = React.useState('')
  const [note, setNote] = React.useState('')
  const [dir, setDir] = React.useState<'in' | 'out'>('in')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setAmount('')
      setNote('')
      setDir('in')
    }
  }, [open])

  const parsed = parseSignedAmount(amount)

  const onAmountChange = (v: string) => {
    setAmount(v)
    const p = parseSignedAmount(v)
    if (p !== null && p < 0) setDir('out')
  }

  const magnitude = parsed === null ? 0 : Math.abs(parsed)
  const signed = dir === 'out' ? -magnitude : magnitude
  const after = balance + signed
  const isIn = dir === 'in'

  const submit = async () => {
    if (parsed === null || magnitude === 0) {
      toast.error('المبلغ غير صالح')
      return
    }
    if (note.trim().length < 3) {
      toast.error('اكتب سبب الحركة (إجباري)')
      return
    }
    setSaving(true)
    try {
      await api('/api/cash', {
        method: 'POST',
        body: { amount: signed, note: note.trim(), method: 'cash' },
      })
      toast.success(isIn ? 'تم الإيداع في الخزنة' : 'تم السحب من الخزنة')
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        {/* الهيدر */}
        <DialogHeader className="border-b bg-gradient-to-l from-emerald-50 via-white to-amber-50 px-4 py-3.5 text-start sm:px-5 sm:py-4 dark:from-emerald-950/40 dark:via-card dark:to-amber-950/25">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 sm:size-11 dark:text-emerald-400">
              <Vault className="size-4 sm:size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg">حركة يدوية على الخزنة</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">هتتسجل مباشرة في رصيد الخزنة وتظهر في الدفتر</p>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {/* الاتجاه */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDir('in')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold transition-colors',
                isIn ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <ArrowDownLeft className="size-4 shrink-0" />
              إيداع (دخول)
            </button>
            <button
              type="button"
              onClick={() => setDir('out')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold transition-colors',
                !isIn ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <ArrowUpRight className="size-4 shrink-0" />
              سحب (خروج)
            </button>
          </div>

          {/* المبلغ */}
          <div className="space-y-2">
            <Label htmlFor="m-amount">المبلغ</Label>
            <div className="relative">
              <Input
                id="m-amount"
                type="text"
                inputMode="text"
                dir="ltr"
                autoFocus
                className={cn('h-14 rounded-xl pl-4 pr-16 text-left text-2xl font-extrabold tabular-nums', isIn ? 'focus-visible:ring-emerald-500/40' : 'focus-visible:ring-rose-500/40')}
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0.00"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">جنيه</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADD.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(magnitude + n))}
                  className="rounded-full border bg-background px-3 py-1 text-xs font-semibold tabular-nums text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {n} +
                </button>
              ))}
            </div>
          </div>

          {/* السبب — كتابة يدوية (إجباري) */}
          <div className="space-y-2">
            <Label htmlFor="m-note">
              السبب <span className="text-destructive">*</span>
            </Label>
            <Input
              id="m-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اكتب سبب الحركة — مثال: مصاريف نثرية، تحصيل من عميل..."
              className="h-11 rounded-xl"
            />
          </div>

          {/* ملخص الحركة */}
          <div className="rounded-xl border border-dashed bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>الرصيد الحالي</span>
              <Amt value={balance} />
            </div>
            <div className={cn('mt-1 flex items-center justify-between font-semibold', magnitude === 0 ? 'text-muted-foreground' : isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
              <span>{isIn ? 'إيداع' : 'سحب'}</span>
              <Amt value={isIn ? magnitude : -magnitude} sign />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-dashed pt-2 font-bold">
              <span>الرصيد بعد الحركة</span>
              <Amt value={after} className={cn(after < 0 && 'text-rose-600 dark:text-rose-400')} />
            </div>
            {after < 0 && magnitude > 0 && (
              <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">تنبيه: المبلغ أكبر من رصيد الخزنة وسيصبح الرصيد بالسالب.</p>
            )}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/30 px-4 py-3 sm:px-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className={cn('font-bold text-white', isIn ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500')}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isIn ? 'تأكيد الإيداع' : 'تأكيد السحب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}