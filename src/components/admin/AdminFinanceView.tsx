'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AdminFinanceView — "أفق الإيرادات" (تصميم 2026-10-08)
 * ═══════════════════════════════════════════════════════════════════════
 *  هوية الصفحة: "المدينة المالية منتصف الليل" — كل شهر = برج في أفق
 *  المدينة، ارتفاعه = إيراده. المعاملات تتدفق على شريط تداول حي،
 *  والإحصائيات تُعرض كلوحات أسعار البورصة.
 *
 *  الهوية اللونية: ياقوت أزرق سماوي (midnight sapphire) + أضواء شمبانيا
 *  — مستقلة تماماً عن:
 *    المحلات (كهرماني دافئ) · الاشتراكات (تركواز الخزنة) ·
 *    الباقات (فولاذ صناعي) · الأكواد (زمردي البانكنوت)
 *
 *  عناصر الهوية (لا توجد في أي صفحة تانية):
 *    1. لافتة "أفق الإيرادات" — سماء منتصف الليل بنجوم حقيقية +
 *       أبراج الإيرادات (12 برجاً بارتفاع ∝ إيراد الشهر، نوافذ مضاءة
 *       بشمبانيا، ومنارة نابضة على برج الشهر الحالي) — الأبراج قابلة
 *       للضغط لتصفية السجل بالشهر.
 *    2. شريط التداول (Ticker Tape) — آخر المعاملات تتدفق كشريط بورصة
 *       حي مع شارة "مباشر" النابضة، يتوقف عند التمرير عليه.
 *    3. لوحات الأسعار (Quote Tiles) — كل إحصائية كلوح سعر في قاعة
 *       تداول: رمز تِكِر (REV·D)، رقم أحادي المونو، ودلتا التغير.
 *    4. قنوات التحصيل — دونات conic-gradient مخصصة + وسائل إيضاح
 *       بشرائح ملوّنة لكل طريقة دفع.
 *    5. سجل التحصيل — رأس أزرق داكن ثابت (sticky) وصفوف بنك مونو.
 *
 *  كل منطق البيانات (API endpoint + العقد + الحقول) زي ما هو بالظبط —
 *  تغيير العرض فقط + فلترة فورية على العميل:
 *    GET /api/admin/finance (مرة واحدة) · تصدير CSV كما هو حرفياً
 */

import * as React from 'react'
import {
  Landmark,
  Building2,
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarDays,
  CalendarRange,
  Download,
  Loader2,
  Search,
  RefreshCw,
  X,
  ArrowUpDown,
  Wallet,
  Banknote,
  Smartphone,
  HandCoins,
  KeyRound,
  Minus,
  Sigma,
  Activity,
  Coins,
  type LucideIcon,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { formatCurrency, formatShortDate } from '@/lib/format'
import { toast } from 'sonner'

/* ───────────────────────── أنواع البيانات ───────────────────────── */

interface Tx {
  id: number
  date: string
  tenantId?: string
  shopName: string
  planCode?: string
  planName: string
  period?: string
  amount: number
  method: string
  status: string
}

interface FinanceData {
  dailyRevenue: number
  monthlyRevenue: number
  yearlyRevenue: number
  totalRevenue: number
  avgMonthly: number
  monthly: Array<{ month: string; revenue: number; count: number }>
  methodBreakdown: Array<{ method: string; revenue: number; count: number }>
  transactions: Tx[]
  count: number
}

/* ───────────────────────── ثوابت الهوية ───────────────────────── */

/** طرق الدفع — نفس مفاتيح الـ API، بأيقونات متسقة مع صفحة الاشتراكات */
const METHOD_META: Record<string, { label: string; icon: LucideIcon }> = {
  cash: { label: 'كاش', icon: Banknote },
  vodafone_cash: { label: 'فودافون كاش', icon: Smartphone },
  instapay: { label: 'إنستا باي', icon: Landmark },
  fawry: { label: 'فوري', icon: Wallet },
  manual: { label: 'يدوي', icon: HandCoins },
  code: { label: 'كود تفعيل', icon: KeyRound },
}

/** ألوان قنوات التحصيل — تتعاكس دافئ/بارد جنب بعض في الدونات */
const METHOD_COLORS: Record<string, string> = {
  vodafone_cash: '#f43f5e',
  instapay: '#0ea5e9',
  cash: '#fbbf24',
  fawry: '#64748b',
  code: '#f97316',
  manual: '#52525b',
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'نشطة', color: '#0ea5e9' },
  expired: { label: 'منتهية', color: '#64748b' },
  cancelled: { label: 'ملغاة', color: '#f43f5e' },
}

const PERIOD_LABEL: Record<string, string> = {
  monthly: 'شهري',
  yearly: 'سنوي',
  trial: 'تجريبي',
}

/** سماء منتصف الليل — نجوم متناثرة بأحجام مختلفة */
const STARS: React.CSSProperties = {
  backgroundImage: [
    'radial-gradient(1.6px 1.6px at 7% 16%, rgba(224,242,254,.85), transparent 60%)',
    'radial-gradient(1px 1px at 19% 7%, rgba(255,255,255,.7), transparent 60%)',
    'radial-gradient(1.2px 1.2px at 32% 24%, rgba(186,230,253,.8), transparent 60%)',
    'radial-gradient(1px 1px at 43% 9%, rgba(255,255,255,.55), transparent 60%)',
    'radial-gradient(1.5px 1.5px at 56% 19%, rgba(224,242,254,.8), transparent 60%)',
    'radial-gradient(1px 1px at 66% 6%, rgba(255,255,255,.6), transparent 60%)',
    'radial-gradient(1.3px 1.3px at 75% 23%, rgba(186,230,253,.7), transparent 60%)',
    'radial-gradient(1px 1px at 85% 11%, rgba(255,255,255,.65), transparent 60%)',
    'radial-gradient(1.1px 1.1px at 93% 28%, rgba(224,242,254,.7), transparent 60%)',
    'radial-gradient(1px 1px at 13% 38%, rgba(255,255,255,.4), transparent 60%)',
    'radial-gradient(1px 1px at 51% 36%, rgba(255,255,255,.35), transparent 60%)',
    'radial-gradient(1.2px 1.2px at 79% 43%, rgba(186,230,253,.5), transparent 60%)',
    'radial-gradient(1px 1px at 27% 47%, rgba(255,255,255,.3), transparent 60%)',
  ].join(', '),
}

/** نوافذ الأبراج المضاءة — نقاط شمبانيا مرتبة كشبكة نوافذ */
const TOWER_WINDOWS: React.CSSProperties = {
  backgroundImage: 'radial-gradient(rgba(254,249,195,0.5) 1px, transparent 1.4px)',
  backgroundSize: '6px 8px',
}

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

const ARABIC_MONTHS_FULL = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function methodLabel(m: string): string {
  return METHOD_META[m]?.label ?? m
}

function methodColor(m: string): string {
  return METHOD_COLORS[m] ?? '#64748b'
}

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, color: '#64748b' }
}

/** رقم مختصر للمحاور والوسائل: 6,638 → "6.6 ألف" */
function compactNum(n: number): string {
  if (Math.abs(n) >= 1000) {
    const v = n / 1000
    const s = v.toLocaleString('en-US', { maximumFractionDigits: 1 })
    return `${s} ألف`
  }
  return String(Math.round(n))
}

/** رقم مونو مختصر بدون "جنيه" للشريط والشرائح */
function monoShort(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** تدرج لوني ثابت من اسم المتجر (لأفاتار "المبنى") */
function shopHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 360
}

function shopInitials(name: string): string {
  const words = (name || '؟').split(/\s+/).filter((w) => w.length > 1)
  const picked = words.length >= 2 ? words.slice(0, 2) : [(name || '؟').slice(0, 2)]
  return picked.map((w) => w[0]).join('')
}

/* ═══════════════════ مكوّنات الهوية ═══════════════════ */

/** ── شريط التداول — معاملات تتدفق كشريط بورصة لا نهائي ── */
function TickerTape({ items }: { items: Tx[] }) {
  if (items.length === 0) return null
  const renderCopy = (copyKey: string) =>
    items.map((t, i) => (
      <span
        key={`${copyKey}-${t.id}-${i}`}
        dir="rtl"
        className="inline-flex shrink-0 items-baseline gap-1.5 pe-10 text-[11px] leading-none"
      >
        <span className="max-w-[180px] truncate font-bold text-sky-200">{t.shopName}</span>
        <span aria-hidden className="text-emerald-300/90">▲</span>
        <span className="font-mono font-bold tabular-nums text-white">{monoShort(t.amount)} ج</span>
        <span className="text-blue-200/50">· {methodLabel(t.method)}</span>
      </span>
    ))

  return (
    <div
      dir="ltr"
      className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_36px,black_calc(100%-36px),transparent)]"
      role="region"
      aria-label="شريط آخر المعاملات — يتوقف عند التمرير عليه"
    >
      <div className="ticker-run flex w-max items-center">
        {renderCopy('a')}
        {renderCopy('b')}
      </div>
    </div>
  )
}

/** ── أبراج الأفق — 12 برجاً بارتفاع ∝ إيراد الشهر ── */
function SkylineTowers({
  monthly,
  yearOf,
  selectedIdx,
  onPick,
}: {
  monthly: FinanceData['monthly']
  yearOf: (i: number) => number
  selectedIdx: number | null
  onPick: (i: number) => void
}) {
  const max = Math.max(...monthly.map((m) => m.revenue), 1)
  return (
    <div className="mt-3">
      <div dir="ltr" className="flex h-32 items-end gap-[3px] sm:h-36 sm:gap-1.5">
        {monthly.map((m, i) => {
          const pct = Math.max((m.revenue / max) * 100, 2.5)
          const isNow = i === monthly.length - 1
          const isSelected = selectedIdx === i
          const isZero = m.revenue === 0
          const label = `${m.month} ${yearOf(i)} · ${monoShort(m.revenue)} جنيه · ${m.count} معاملة`
          return (
            <button
              key={`${m.month}-${i}`}
              type="button"
              dir="rtl"
              title={label}
              aria-label={`برج ${label}${isNow ? ' — الشهر الحالي' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onPick(i)}
              className={cn(
                'group relative flex-1 cursor-pointer rounded-t-[3px] outline-none transition-[filter,transform] focus-visible:ring-2 focus-visible:ring-sky-300',
                !isZero && 'hover:brightness-125 focus-visible:brightness-125',
                isNow && 'hover:-translate-y-0.5',
              )}
              style={{
                height: `${pct}%`,
                background: isZero
                  ? 'rgba(30,58,138,0.35)'
                  : isNow
                    ? 'linear-gradient(180deg, rgba(224,242,254,0.95) 0%, rgba(2,132,199,0.92) 100%)'
                    : 'linear-gradient(180deg, rgba(125,211,252,0.8) 0%, rgba(30,58,138,0.9) 100%)',
                opacity: isZero ? 0.5 : 1,
              }}
            >
              {!isZero && (
                <span aria-hidden className="absolute inset-0 rounded-t-[3px]" style={TOWER_WINDOWS} />
              )}
              {isNow && (
                <span
                  aria-hidden
                  className="absolute -top-2 left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-sky-100 shadow-[0_0_10px_2px_rgba(125,211,252,0.9)] animate-pulse"
                />
              )}
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-t-[3px] ring-2 ring-inset ring-sky-300"
                />
              )}
            </button>
          )
        })}
      </div>
      <div
        aria-hidden
        dir="ltr"
        className="mt-1 h-[3px] rounded-full bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"
      />
      <div
        dir="ltr"
        className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-blue-200/60"
      >
        <span>
          {monthly[0]?.month} {yearOf(0)}
        </span>
        <span className="text-sky-300/80">الأحدث ←</span>
        <span>
          {monthly[monthly.length - 1]?.month} {yearOf(monthly.length - 1)}
        </span>
      </div>
    </div>
  )
}

/** ── دلتا التغير — ▲/▼ مع نسبة مئوية ── */
function DeltaChip({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 text-[11px] font-bold text-blue-100/70 backdrop-blur">
        {label}
      </span>
    )
  }
  const up = pct >= 0
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-mono text-[11px] font-black tabular-nums backdrop-blur',
        up
          ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200'
          : 'border-rose-300/30 bg-rose-400/15 text-rose-200',
      )}
      dir="rtl"
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? '+' : ''}
      {pct.toLocaleString('en-US')}%
      <span className="font-sans font-bold opacity-70">{label}</span>
    </span>
  )
}

/** ── لوح الأسعار — إحصائية كلوح تداول برمز تِكِر ── */
function QuoteTile({
  symbol,
  label,
  icon: Icon,
  value,
  tone,
  sub,
  delay,
}: {
  symbol: string
  label: string
  icon: LucideIcon
  value: string
  tone: string
  sub?: React.ReactNode
  delay: number
}) {
  return (
    <div
      className="animate-in-up group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tone }} />
      <Icon
        aria-hidden
        className="absolute -bottom-4 -end-3 size-20 -rotate-12 opacity-[0.06] transition-opacity group-hover:opacity-[0.1]"
        style={{ color: tone }}
        strokeWidth={1.4}
      />
      <div className="relative flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Icon className="size-4 shrink-0" style={{ color: tone }} />
          <span className="truncate">{label}</span>
        </span>
        <span
          dir="ltr"
          className="shrink-0 rounded bg-blue-950 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.18em] text-sky-300"
        >
          {symbol}
        </span>
      </div>
      <p
        dir="rtl"
        className="relative mt-2.5 font-mono text-xl font-black tabular-nums text-blue-950 dark:text-blue-50 sm:text-2xl"
      >
        {value}
      </p>
      <div className="relative mt-1.5 flex min-h-6 flex-wrap items-center gap-1.5">{sub}</div>
    </div>
  )
}

/** ── شارة الحالة — ختم صغير بحد ولون ── */
function StatusSeal({ tx }: { tx: Tx }) {
  const isTrial = tx.status === 'active' && tx.period === 'trial'
  const m = isTrial ? { label: 'تجريبية', color: '#fbbf24' } : statusMeta(tx.status)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
      style={{ color: m.color, borderColor: `${m.color}44`, backgroundColor: `${m.color}12` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

/** ── شريحة طريقة الدفع ── */
function MethodChip({ method }: { method: string }) {
  const meta = METHOD_META[method] ?? { label: method, icon: Minus }
  const color = methodColor(method)
  const Icon = meta.icon
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold"
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}

/** ── شريحة الباقة + الفترة ── */
function PlanTag({ tx }: { tx: Tx }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex max-w-[150px] items-center truncate rounded-md border border-blue-700/25 bg-blue-700/5 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200">
        {tx.planName}
      </span>
      {tx.period && (
        <span className="rounded border border-dashed border-muted-foreground/30 px-1 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          {PERIOD_LABEL[tx.period] ?? tx.period}
        </span>
      )}
    </span>
  )
}

/** ── أفاتار "المبنى" — مربع بتدرج ثابت من اسم المحل ── */
function ShopGlyph({ name }: { name: string }) {
  const hue = shopHue(name)
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-[6px] text-[11px] font-black text-white shadow-inner"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 45% 42%), hsl(${(hue + 28) % 360} 50% 26%))`,
      }}
    >
      {shopInitials(name)}
    </span>
  )
}

/** ── قنوات التحصيل — دونات conic مخصصة + وسائل إيضاح ── */
function MethodDonut({
  methods,
  total,
}: {
  methods: FinanceData['methodBreakdown']
  total: number
}) {
  if (methods.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">لا توجد قنوات تحصيل بعد</p>
    )
  }
  const segs = methods.map((m, i) => {
    const share = total > 0 ? m.revenue / total : 0
    const start = methods
      .slice(0, i)
      .reduce((s, x) => s + (total > 0 ? (x.revenue / total) * 360 : 0), 0)
    return { ...m, start, end: start + share * 360, share }
  })
  const conic = segs
    .map((s) => `${methodColor(s.method)} ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`)
    .join(', ')

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div
        className="relative size-40 shrink-0 rounded-full shadow-[0_0_0_6px rgba(14,165,233,0.06)]"
        style={{ background: `conic-gradient(${conic})` }}
        role="img"
        aria-label={`توزيع ${formatCurrency(total)} على ${methods.length} قنوات تحصيل`}
      >
        <div className="absolute inset-[24%] flex flex-col items-center justify-center rounded-full bg-card text-center shadow-inner">
          <span className="text-[9.5px] font-bold text-muted-foreground">إجمالي التحصيل</span>
          <span
            dir="rtl"
            className="mt-0.5 font-mono text-sm font-black tabular-nums text-blue-950 dark:text-blue-50"
          >
            {compactNum(total)}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-3">
        {segs.map((s) => {
          const meta = METHOD_META[s.method] ?? { label: s.method, icon: Minus }
          const Icon = meta.icon
          const color = methodColor(s.method)
          const sharePct = Math.round(s.share * 100)
          return (
            <li key={s.method} className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-foreground">
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded"
                    style={{ color, backgroundColor: `${color}16` }}
                  >
                    <Icon className="size-3" />
                  </span>
                  <span className="truncate">{meta.label}</span>
                </span>
                <span
                  dir="rtl"
                  className="shrink-0 font-mono text-xs font-black tabular-nums text-blue-950 dark:text-blue-100"
                >
                  {formatCurrency(s.revenue)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(s.share * 100, 2)}%`, background: color }}
                  />
                </div>
                <span className="w-9 shrink-0 text-end font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                  {sharePct}%
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {s.count} عملية
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** ── تلميح مخطط الأعمدة — بطاقة سعر صغيرة ── */
function ChartTip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: Array<{ payload: { month: string; year: number; revenue: number; count: number } }>
  total: number
}) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  const share = total > 0 ? Math.round((m.revenue / total) * 100) : 0
  return (
    <div
      dir="rtl"
      className="rounded-xl border border-blue-700/60 bg-blue-950/95 px-3 py-2.5 text-blue-50 shadow-xl backdrop-blur"
    >
      <p className="text-[11px] font-bold text-sky-300">
        {m.month} {m.year}
      </p>
      <p dir="rtl" className="font-mono text-lg font-black tabular-nums text-white">
        {formatCurrency(m.revenue)}
      </p>
      <p className="mt-0.5 text-[10px] text-blue-200/70">
        {m.count} معاملة · {share}% من مدى الـ 12 شهراً
      </p>
    </div>
  )
}

/* ═══════════════════ المكوّن الرئيسي ═══════════════════ */

type SortMode = 'newest' | 'oldest' | 'highest' | 'lowest'

export function AdminFinanceView() {
  const [data, setData] = React.useState<FinanceData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  /* فلاتر العميل */
  const [search, setSearch] = React.useState('')
  const [methodFilter, setMethodFilter] = React.useState('__all')
  const [statusFilter, setStatusFilter] = React.useState('__all')
  const [monthIdx, setMonthIdx] = React.useState<number | null>(null)
  const [sort, setSort] = React.useState<SortMode>('newest')

  const dataRef = React.useRef<FinanceData | null>(null)

  const load = React.useCallback(async () => {
    if (dataRef.current) setRefreshing(true)
    else setLoading(true)
    try {
      const d = await api<FinanceData>('/api/admin/finance')
      dataRef.current = d
      setData(d)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'فشل تحميل البيانات المالية'
      toast.error(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  /* ── تصدير CSV — نفس سلوك النسخة الأصلية حرفياً ── */
  const exportCSV = () => {
    if (!data) return
    const csv = ['Date,Tenant,Plan,Amount,Method,Status']
    for (const t of data.transactions) {
      csv.push(
        `${new Date(t.date).toLocaleString('en-GB')},${t.shopName},${t.planName},${t.amount},${t.method},${t.status}`
      )
    }
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير التقرير')
  }

  /* ── سنة كل شهر في نافذة الـ 12 ── */
  const now = React.useMemo(() => new Date(), [])
  const yearOf = React.useCallback(
    (i: number) => new Date(now.getFullYear(), now.getMonth() - (11 - i), 1).getFullYear(),
    [now]
  )

  /* ── الإحصائيات المشتقة ── */
  const stats = React.useMemo(() => {
    if (!data) return null
    const monthly = data.monthly
    const cur = monthly[monthly.length - 1]
    const prev = monthly[monthly.length - 2]
    const momPct = prev && prev.revenue > 0 ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100) : null
    const bestIdx = monthly.reduce((bi, m, i) => (m.revenue > monthly[bi].revenue ? i : bi), 0)
    const best = monthly[bestIdx]
    const todayStr = new Date().toDateString()
    const todayCount = data.transactions.filter((t) => new Date(t.date).toDateString() === todayStr).length
    const yearlyShare = data.totalRevenue > 0 ? Math.round((data.yearlyRevenue / data.totalRevenue) * 100) : 0
    const avgPct =
      data.avgMonthly > 0 ? Math.round(((cur.revenue - data.avgMonthly) / data.avgMonthly) * 100) : null
    return { cur, prev, momPct, best, bestIdx, bestYear: yearOf(bestIdx), todayCount, yearlyShare, avgPct }
  }, [data, yearOf])

  /* ── بيانات المخطط ── */
  const chartData = React.useMemo(() => {
    if (!data) return []
    return data.monthly.map((m, i) => ({ ...m, year: yearOf(i), idx: i }))
  }, [data, yearOf])

  /* ── الفلترة الفورية ── */
  const filtered = React.useMemo(() => {
    if (!data) return []
    let list = [...data.transactions]
    const q = search.trim()
    if (q) {
      list = list.filter(
        (t) =>
          t.shopName?.includes(q) ||
          t.planName?.includes(q) ||
          t.planCode?.includes(q) ||
          String(t.amount).includes(q)
      )
    }
    if (methodFilter !== '__all') list = list.filter((t) => (t.method || 'manual') === methodFilter)
    if (statusFilter !== '__all') list = list.filter((t) => t.status === statusFilter)
    if (monthIdx !== null) {
      const target = new Date(now.getFullYear(), now.getMonth() - (11 - monthIdx), 1)
      list = list.filter((t) => {
        const d = new Date(t.date)
        return d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear()
      })
    }
    if (sort === 'oldest') list.reverse()
    else if (sort === 'highest') list.sort((a, b) => b.amount - a.amount)
    else if (sort === 'lowest') list.sort((a, b) => a.amount - b.amount)
    return list
  }, [data, search, methodFilter, statusFilter, monthIdx, sort, now])

  const filteredSum = React.useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered])

  const hasActiveFilters =
    search.trim() !== '' || methodFilter !== '__all' || statusFilter !== '__all' || monthIdx !== null

  const clearFilters = () => {
    setSearch('')
    setMethodFilter('__all')
    setStatusFilter('__all')
    setMonthIdx(null)
  }

  const toggleMonth = (i: number) => setMonthIdx((cur) => (cur === i ? null : i))

  const monthLabel = (i: number) => `${data?.monthly[i]?.month ?? ''} ${yearOf(i)}`

  /* ═══════════ تحميل أولي — هياكل عظمية ═══════════ */
  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[420px] w-full rounded-3xl sm:h-[380px]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (!data || !stats) return null

  const tickerItems = data.transactions.slice(0, 14)
  const total = data.transactions.length

  /* ═══════════ الصفحة ═══════════ */
  return (
    <div className="space-y-5">
      {/* ─────────── لافتة أفق الإيرادات ─────────── */}
      <section className="animate-in-up relative overflow-hidden rounded-3xl border border-blue-800/60 bg-gradient-to-b from-blue-950 via-blue-900 to-blue-950 text-blue-50 shadow-lg shadow-blue-950/25 dark:border-blue-800/40 dark:shadow-none">
        <div aria-hidden className="absolute inset-0" style={STARS} />
        <div
          aria-hidden
          className="absolute -top-24 start-1/4 size-64 rounded-full bg-sky-400/10 blur-3xl"
        />
        <Building2
          aria-hidden
          className="absolute -bottom-14 -start-10 size-52 -rotate-6 text-sky-300/8"
          strokeWidth={1.2}
        />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.1fr_1fr] lg:items-stretch">
          {/* النص والأرقام */}
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[11px] font-bold text-sky-200 backdrop-blur">
                <Landmark className="size-3.5" />
                قاعة الإيرادات
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-blue-100/80 backdrop-blur">
                <Activity className="size-3.5" />
                آخر 12 شهراً · {data.count} معاملة
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">الإيرادات</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-blue-100/75">
                كل جنيه يدخل المنصة — أبراج الشهور، قنوات التحصيل، وسجل كل معاملة،
                في أفق واحد.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300/80">
                  إجمالي إيرادات 12 شهراً
                </p>
                <p
                  dir="rtl"
                  className="bg-gradient-to-l from-white via-sky-200 to-sky-400 bg-clip-text font-mono text-4xl font-black tabular-nums text-transparent sm:text-5xl"
                >
                  {formatCurrency(data.totalRevenue)}
                </p>
              </div>
              <DeltaChip
                pct={stats.momPct}
                label={`عن ${stats.prev?.month ?? 'الشهر السابق'}`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold text-blue-100/85 backdrop-blur">
                <Building2 className="size-3.5 text-sky-300" />
                أفضل شهر: {stats.best.month} · {monoShort(stats.best.revenue)} ج
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold text-blue-100/85 backdrop-blur">
                <Sigma className="size-3.5 text-sky-300" />
                متوسط شهري {monoShort(data.avgMonthly)} ج
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold text-blue-100/85 backdrop-blur">
                <Coins className="size-3.5 text-sky-300" />
                {total} معاملة مسجّلة
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={exportCSV}
                className="h-11 gap-2 rounded-xl border border-sky-200/50 bg-gradient-to-l from-sky-300 to-blue-500 px-5 font-black text-blue-950 shadow-[0_10px_26px_-10px_rgba(56,189,248,0.75)] transition-all hover:from-sky-200 hover:to-blue-400 hover:shadow-[0_14px_30px_-10px_rgba(56,189,248,0.85)] active:scale-[0.97]"
              >
                <Download className="size-4" strokeWidth={2.4} />
                تصدير التقرير (CSV)
              </Button>
              <Button
                variant="outline"
                onClick={load}
                disabled={refreshing}
                className="h-11 gap-2 rounded-xl border-white/20 bg-white/5 px-4 font-bold text-sky-100 backdrop-blur hover:border-sky-300/50 hover:bg-sky-400/10 hover:text-white"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                تحديث
              </Button>
            </div>
          </div>

          {/* لوحة الأفق — أبراج الشهور */}
          <div className="relative flex min-w-0 flex-col rounded-2xl border border-white/10 bg-blue-950/50 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-sky-200/85">
                <Building2 className="size-3.5" />
                أفق الإيرادات — برج لكل شهر
              </p>
              <span className="hidden text-[10px] text-blue-200/50 sm:block">اضغط برجاً لتصفية السجل</span>
            </div>
            <SkylineTowers
              monthly={data.monthly}
              yearOf={yearOf}
              selectedIdx={monthIdx}
              onPick={toggleMonth}
            />
            {monthIdx !== null && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                <span className="text-[11px] font-bold text-sky-200">
                  مصفّى على {monthLabel(monthIdx)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 rounded-lg px-2 text-[11px] text-blue-200/70 hover:bg-white/10 hover:text-white"
                  onClick={() => setMonthIdx(null)}
                >
                  <X className="size-3" />
                  إلغاء الشهر
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* شريط التداول — آخر المعاملات تتدفق */}
        {tickerItems.length > 0 && (
          <div className="relative border-t border-white/10 bg-black/30 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-rose-300/30 bg-rose-500/15 px-2.5 py-1 text-[10px] font-black text-rose-200 sm:inline-flex">
                <span aria-hidden className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-300 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-rose-300" />
                </span>
                مباشر
              </span>
              <TickerTape items={tickerItems} />
            </div>
          </div>
        )}
      </section>

      {/* ─────────── لوحات الأسعار ─────────── */}
      <section className="animate-in-up stagger-1 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuoteTile
          symbol="REV·D"
          label="إيرادات اليوم"
          icon={Calendar}
          value={formatCurrency(data.dailyRevenue)}
          tone="#38bdf8"
          delay={0}
          sub={
            <span className="text-[11px] font-semibold text-muted-foreground">
              {stats.todayCount > 0
                ? `${stats.todayCount} معاملة اليوم`
                : 'لا تحصيل اليوم بعد'}
            </span>
          }
        />
        <QuoteTile
          symbol="REV·M"
          label="إيرادات الشهر الحالي"
          icon={CalendarDays}
          value={formatCurrency(data.monthlyRevenue)}
          tone="#fbbf24"
          delay={70}
          sub={
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-black tabular-nums',
                  (stats.momPct ?? 0) >= 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                )}
              >
                {(stats.momPct ?? 0) >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {(stats.momPct ?? 0) >= 0 ? '+' : ''}
                {(stats.momPct ?? 0).toLocaleString('en-US')}%
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                عن {stats.prev?.month ?? 'السابق'}
              </span>
            </span>
          }
        />
        <QuoteTile
          symbol="REV·Y"
          label="إيرادات السنة"
          icon={CalendarRange}
          value={formatCurrency(data.yearlyRevenue)}
          tone="#1d4ed8"
          delay={140}
          sub={
            <span className="text-[11px] font-semibold text-muted-foreground">
              {stats.yearlyShare}% من مدى الـ 12 شهراً
            </span>
          }
        />
        <QuoteTile
          symbol="AVG·12"
          label="المتوسط الشهري"
          icon={Sigma}
          value={formatCurrency(data.avgMonthly)}
          tone="#7dd3fc"
          delay={210}
          sub={
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-black tabular-nums',
                  (stats.avgPct ?? 0) >= 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                )}
              >
                {(stats.avgPct ?? 0) >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {(stats.avgPct ?? 0) >= 0 ? '+' : ''}
                {(stats.avgPct ?? 0).toLocaleString('en-US')}%
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                الشهر الحالي مقابل المتوسط
              </span>
            </span>
          }
        />
      </section>

      {/* ─────────── المخطط + قنوات التحصيل ─────────── */}
      <section className="animate-in-up stagger-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* مخطط الأداء الشهري */}
        <Card className="border-blue-900/15 shadow-sm dark:border-blue-300/10 lg:col-span-2">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-blue-950 text-sky-300">
                  <Activity className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-black text-foreground">أداء الإيرادات الشهري</h2>
                  <p className="text-[10.5px] text-muted-foreground">
                    اضغط أي عمود لتصفية سجل التحصيل بشهره
                  </p>
                </div>
              </div>
              {monthIdx !== null && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 rounded-lg border-blue-700/30 bg-blue-700/5 px-2 text-[11px] font-bold text-blue-800 hover:bg-blue-700/10 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200"
                  onClick={() => setMonthIdx(null)}
                >
                  <X className="size-3" />
                  {monthLabel(monthIdx)}
                </Button>
              )}
            </div>

            <div role="img" aria-label="مخطط أعمدة الإيرادات لآخر 12 شهراً">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barCategoryGap="26%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fxTower" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#1e3a8a" />
                    </linearGradient>
                    <linearGradient id="fxNow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e0f2fe" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="fxSel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#bae6fd" />
                      <stop offset="100%" stopColor="#0369a1" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="rgba(100,116,139,0.25)" />
                  <XAxis
                    dataKey="month"
                    interval={0}
                    tickFormatter={(m: string) => m.slice(0, 3)}
                    tick={{ fontSize: 11, className: 'fill-muted-foreground' }}
                    axisLine={{ stroke: 'rgba(100,116,139,0.3)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => compactNum(v)}
                    tick={{ fontSize: 10.5, className: 'fill-muted-foreground' }}
                    width={46}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTip total={data.totalRevenue} />}
                    cursor={{ fill: 'rgba(14,165,233,0.08)' }}
                  />
                  <ReferenceLine
                    y={data.avgMonthly}
                    stroke="#0ea5e9"
                    strokeOpacity={0.55}
                    strokeDasharray="5 5"
                    label={{
                      value: 'المتوسط',
                      position: 'insideTopRight',
                      fill: '#0ea5e9',
                      fontSize: 10,
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    name="الإيراد"
                    radius={[4, 4, 0, 0]}
                    className="cursor-pointer"
                    onClick={(d: unknown) => {
                      const node = (Array.isArray(d) ? d[0] : d) as { month?: string } | undefined
                      const name = node?.month ?? (node as { payload?: { month?: string } } | undefined)?.payload?.month
                      if (!name) return
                      const idx = chartData.findIndex((m) => m.month === name)
                      if (idx >= 0) toggleMonth(idx)
                    }}
                  >
                    {chartData.map((m, i) => (
                      <Cell
                        key={`${m.month}-${i}`}
                        fill={
                          monthIdx === i
                            ? 'url(#fxSel)'
                            : i === chartData.length - 1
                              ? 'url(#fxNow)'
                              : 'url(#fxTower)'
                        }
                        stroke={monthIdx === i ? '#7dd3fc' : 'transparent'}
                        strokeWidth={monthIdx === i ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* قنوات التحصيل */}
        <Card className="border-blue-900/15 shadow-sm dark:border-blue-300/10">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-blue-950 text-sky-300">
                <Wallet className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-black text-foreground">قنوات التحصيل</h2>
                <p className="text-[10.5px] text-muted-foreground">
                  توزيع {formatCurrency(data.totalRevenue)} على طرق الدفع
                </p>
              </div>
            </div>
            <MethodDonut methods={data.methodBreakdown} total={data.totalRevenue} />
          </CardContent>
        </Card>
      </section>

      {/* ─────────── شريط الأوامر ─────────── */}
      <section className="animate-in-up stagger-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في السجل — محل، باقة، مبلغ…"
              className="h-10 rounded-xl border-blue-900/15 bg-background ps-9 text-sm shadow-none dark:border-blue-300/10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="مسح البحث"
                className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={monthIdx === null ? '__all' : String(monthIdx)} onValueChange={(v) => setMonthIdx(v === '__all' ? null : Number(v))}>
            <SelectTrigger className="h-10 w-full rounded-xl text-xs font-bold sm:w-44" aria-label="تصفية بالشهر">
              <SelectValue placeholder="الشهر" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">كل الشهور</SelectItem>
              {data.monthly.map((m, i) => (
                <SelectItem key={`${m.month}-${i}`} value={String(i)}>
                  {m.month} {yearOf(i)} · {monoShort(m.revenue)} ج
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full rounded-xl text-xs font-bold sm:w-36" aria-label="تصفية بالحالة">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">كل الحالات</SelectItem>
              <SelectItem value="active">نشطة</SelectItem>
              <SelectItem value="expired">منتهية</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger className="h-10 w-full rounded-xl text-xs font-bold sm:w-40" aria-label="الترتيب">
              <ArrowUpDown className="size-3.5" />
              <SelectValue placeholder="الترتيب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">الأحدث أولاً</SelectItem>
              <SelectItem value="oldest">الأقدم أولاً</SelectItem>
              <SelectItem value="highest">الأعلى مبلغاً</SelectItem>
              <SelectItem value="lowest">الأقل مبلغاً</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* حبوب طرق الدفع */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-semibold text-muted-foreground">القناة:</span>
          <button
            type="button"
            onClick={() => setMethodFilter('__all')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-all',
              methodFilter === '__all'
                ? 'border-blue-800 bg-blue-950 text-sky-200 shadow-sm dark:border-blue-300/40 dark:bg-blue-900'
                : 'border-border bg-muted/40 text-muted-foreground hover:border-blue-700/40 hover:bg-blue-700/5',
            )}
          >
            الكل
            <span className="rounded-full bg-black/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums dark:bg-white/10">
              {total}
            </span>
          </button>
          {data.methodBreakdown.map((m) => {
            const meta = METHOD_META[m.method] ?? { label: m.method, icon: Minus }
            const active = methodFilter === m.method
            const color = methodColor(m.method)
            const Icon = meta.icon
            return (
              <button
                key={m.method}
                type="button"
                onClick={() => setMethodFilter(active ? '__all' : m.method)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-all',
                  active
                    ? 'border-blue-800 bg-blue-950 text-sky-200 shadow-sm dark:border-blue-300/40 dark:bg-blue-900'
                    : 'border-border bg-muted/40 text-muted-foreground hover:border-blue-700/40 hover:bg-blue-700/5',
                )}
              >
                <Icon className="size-3.5" style={{ color: active ? undefined : color }} />
                {meta.label}
                <span className="rounded-full bg-black/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums dark:bg-white/10">
                  {m.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ملخص الفلاتر النشطة */}
        {hasActiveFilters && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed pt-2.5">
            <span className="text-[10.5px] font-semibold text-muted-foreground">مطبّق الآن:</span>
            {search.trim() && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="inline-flex items-center gap-1 rounded-md border border-blue-700/25 bg-blue-700/10 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200"
              >
                بحث: {search.trim()}
                <X className="size-3" />
              </button>
            )}
            {methodFilter !== '__all' && (
              <button
                type="button"
                onClick={() => setMethodFilter('__all')}
                className="inline-flex items-center gap-1 rounded-md border border-blue-700/25 bg-blue-700/10 px-2 py-0.5 text-[10.5px] font-semibold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200"
              >
                القناة: {methodLabel(methodFilter)}
                <X className="size-3" />
              </button>
            )}
            {statusFilter !== '__all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('__all')}
                className="inline-flex items-center gap-1 rounded-md border border-blue-700/25 bg-blue-700/10 px-2 py-0.5 text-[10.5px] font-semibold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200"
              >
                الحالة: {statusMeta(statusFilter).label}
                <X className="size-3" />
              </button>
            )}
            {monthIdx !== null && (
              <button
                type="button"
                onClick={() => setMonthIdx(null)}
                className="inline-flex items-center gap-1 rounded-md border border-blue-700/25 bg-blue-700/10 px-2 py-0.5 text-[10.5px] font-semibold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200"
              >
                الشهر: {monthLabel(monthIdx)}
                <X className="size-3" />
              </button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="size-3" />
              مسح الكل
            </Button>
          </div>
        )}
      </section>

      {/* ─────────── سجل التحصيل ─────────── */}
      <section className="animate-in-up stagger-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* رأس السجل — شريط أزرق داكن في الوضعين */}
        <div className="relative flex flex-wrap items-center justify-between gap-2 bg-gradient-to-l from-blue-950 to-blue-900 px-4 py-3 text-blue-50">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg border border-white/15 bg-white/10 backdrop-blur">
              <Building2 className="size-4.5 text-sky-300" />
            </span>
            <div>
              <h2 className="text-sm font-black">سجل التحصيل</h2>
              <p className="text-[10.5px] text-blue-200/70">
                آخر {total} معاملة داخل مدى الـ 12 شهراً
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 font-mono text-xs font-bold tabular-nums text-sky-200 backdrop-blur">
              {filtered.length} / {total}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-lg border-sky-300/40 bg-transparent px-3 font-bold text-sky-200 hover:border-sky-300 hover:bg-sky-400/10 hover:text-white"
              onClick={exportCSV}
            >
              <Download className="size-3.5" />
              CSV
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            {total === 0 ? (
              <>
                <span className="grid size-16 place-items-center rounded-2xl border-2 border-dashed border-blue-700/25 text-blue-700/40 dark:border-blue-300/15 dark:text-blue-300/30">
                  <Building2 className="size-8" strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-sm font-black text-foreground">لا توجد معاملات محصّلة</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    أول اشتراك مدفوع سيشرّع أول برج في الأفق
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="grid size-16 place-items-center rounded-2xl border-2 border-dashed border-blue-700/25 text-blue-700/40 dark:border-blue-300/15 dark:text-blue-300/30">
                  <Search className="size-8" strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-sm font-black text-foreground">لا نتائج مطابقة للفلاتر</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    جرّب توسيع البحث أو إلغاء بعض الفلاتر
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-lg border-blue-700/30 px-3 text-xs font-bold text-blue-800 hover:bg-blue-700/5 dark:border-blue-300/25 dark:text-blue-200 dark:hover:bg-blue-400/10"
                  onClick={clearFilters}
                >
                  <X className="size-3.5" />
                  مسح الفلاتر
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* جدول — شاشات lg فأكبر */}
            <div className="hidden max-h-[62vh] overflow-y-auto lg:block">
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="border-transparent hover:bg-transparent">
                    <TableHead className="w-12 bg-blue-950 text-center font-mono text-[10.5px] font-bold tracking-wider text-blue-200/80">
                      #
                    </TableHead>
                    <TableHead className="w-32 bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                      التاريخ
                    </TableHead>
                    <TableHead className="bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                      المحل
                    </TableHead>
                    <TableHead className="w-56 bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                      الباقة
                    </TableHead>
                    <TableHead className="w-36 bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                      قناة الدفع
                    </TableHead>
                    <TableHead className="w-32 bg-blue-950 text-center text-[10.5px] font-bold text-blue-200/80">
                      المبلغ
                    </TableHead>
                    <TableHead className="w-28 bg-blue-950 bg-blue-950 text-center text-[10.5px] font-bold text-blue-200/80">
                      الحالة
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t, i) => (
                    <TableRow
                      key={t.id}
                      className="animate-in-up border-border/60 transition-colors hover:bg-sky-500/[0.045] dark:hover:bg-sky-400/[0.06]"
                      style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}
                    >
                      <TableCell className="py-2.5 text-center font-mono text-[11px] tabular-nums text-muted-foreground/70">
                        {String(i + 1).padStart(2, '0')}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatShortDate(t.date)}
                      </TableCell>
                      <TableCell className="max-w-[220px] py-2.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <ShopGlyph name={t.shopName} />
                          <span className="truncate text-[13px] font-bold text-foreground">{t.shopName}</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <PlanTag tx={t} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <MethodChip method={t.method || 'manual'} />
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span
                          dir="rtl"
                          className="font-mono text-[13px] font-black tabular-nums text-blue-800 dark:text-sky-300"
                        >
                          {formatCurrency(t.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <StatusSeal tx={t} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* بطاقات — الجوال */}
            <div className="space-y-2.5 p-3 lg:hidden">
              {filtered.map((t, i) => (
                <article
                  key={t.id}
                  className="animate-in-up rounded-xl border bg-background/60 p-3"
                  style={{ animationDelay: `${Math.min(i, 10) * 32}ms` }}
                >
                  <div className="flex items-center gap-2.5">
                    <ShopGlyph name={t.shopName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-foreground">{t.shopName}</p>
                      <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                        {formatShortDate(t.date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span
                        dir="rtl"
                        className="font-mono text-sm font-black tabular-nums text-blue-800 dark:text-sky-300"
                      >
                        {formatCurrency(t.amount)}
                      </span>
                      <StatusSeal tx={t} />
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed pt-2.5">
                    <PlanTag tx={t} />
                    <MethodChip method={t.method || 'manual'} />
                  </div>
                </article>
              ))}
            </div>

            {/* تذييل السجل */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">
                عرض {filtered.length} من {total} معاملة
                {filtered.length !== total && ' (مصفّى)'}
              </p>
              <p dir="rtl" className="font-mono text-[11px] font-bold tabular-nums text-blue-800 dark:text-sky-300">
                إجمالي المعروض: {formatCurrency(filteredSum)}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
