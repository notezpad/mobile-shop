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
 *  التجاوب (2026-10-10):
 *    · الجوال: لافتة مضغوطة، كروت إحصائيات 2×2، مخطط بتسميات كل شهر تاني،
 *      فلاتر شبكة عمودين + حبوب قنوات قابلة للسحب، سجل ككروت مجمّعة بالشهر
 *      مع "عرض المزيد".
 *    · sm/md/lg: كروت عمودين، والمخطط والدونات بعرض كامل.
 *    · xl (≥1280): جدول كامل + 3 أعمدة للمخطط والقنوات.
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
  ArrowRight,
  ChevronDown,
  Clock,
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
import { formatArabicDateTime, formatCurrency, formatShortDate } from '@/lib/format'
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

/** ── مراقب media query — يُستخدم لاختيار عرض واحد فقط (جدول/كروت) بدل رسم الاثنين ── */
function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** مبلغ بدون وحدة: 6638.5 → "6,638.5" (الوحدة "جنيه" تُعرض منفصلة بحجم أصغر) */
function moneyNum(n: number): string {
  return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** مبلغ مختصر للخلايا الضيقة: <100 ألف رقم كامل، وفوقها "123.4 ألف" */
function shortMoney(n: number): string {
  return Math.abs(n) >= 100000 ? compactNum(n) : monoShort(n)
}

function monthKey(date: string): string {
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? 'na' : `${d.getFullYear()}-${d.getMonth()}`
}

function monthTitle(date: string): string {
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? 'تاريخ غير محدد' : `${ARABIC_MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`
}

/** ── خلية إحصائية صغيرة داخل لافتة الهيرو — شبكة 3 أعمدة على الجوال ── */
function HeroStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  sub: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-2 py-2 backdrop-blur sm:px-3.5 sm:py-2.5">
      <p className="flex items-center gap-1 text-[10px] font-bold text-sky-200/75 sm:text-[11px]">
        <Icon aria-hidden className="hidden size-3 shrink-0 text-sky-300 sm:block" />
        <span className="truncate">{label}</span>
      </p>
      <p dir="rtl" className="mt-1 truncate font-mono text-[13px] font-black tabular-nums text-white sm:text-sm">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-blue-200/55">{sub}</p>
    </div>
  )
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

/** ── أبراج الأفق — 12 برجاً بارتفاع ∝ إيراد الشهر ──
 *  الزر نفسه بطول العمود كاملاً (منطقة لمس عالية على الجوال)
 *  والبرج المرئي بداخله. */
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
    <div className="mt-3 flex flex-1 flex-col">
      <div dir="ltr" className="flex h-28 items-end gap-[3px] sm:h-36 sm:gap-1.5 xl:h-auto xl:min-h-36 xl:flex-1">
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
              className="group relative flex h-full min-w-0 flex-1 cursor-pointer items-end rounded-t-[3px] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <span
                className={cn(
                  'relative block w-full rounded-t-[3px] transition-[filter,transform] group-active:brightness-125',
                  !isZero && 'group-hover:brightness-125 group-focus-visible:brightness-125',
                  isNow && 'group-hover:-translate-y-0.5',
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
                    className="absolute -top-2 left-1/2 size-[7px] -translate-x-1/2 animate-pulse rounded-full bg-sky-100 shadow-[0_0_10px_2px_rgba(125,211,252,0.9)]"
                  />
                )}
                {isSelected && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-t-[3px] ring-2 ring-inset ring-sky-300"
                  />
                )}
              </span>
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
        className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-blue-200/60"
      >
        <span className="truncate">
          {monthly[0]?.month} {yearOf(0)}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-sans text-sky-300/80">
          الأحدث
          <ArrowRight aria-hidden className="size-3" />
        </span>
        <span className="truncate">
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

/** ── لوح الأسعار — إحصائية كلوح تداول برمز تِكِر ──
 *  على الجوال: كرت مضغوط (2×2) — الأيقونة والتسمية فوق، الرقم الكبير والوحدة
 *  بحجم أصغر جنبه، ورمز التِكِر مخفي. من sm فوق: التصميم الكامل. */
function QuoteTile({
  symbol,
  label,
  icon: Icon,
  amount,
  tone,
  sub,
  delay,
}: {
  symbol: string
  label: string
  icon: LucideIcon
  amount: number
  tone: string
  sub?: React.ReactNode
  delay: number
}) {
  return (
    <div
      className="animate-in-up group relative min-w-0 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm sm:p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tone }} />
      <Icon
        aria-hidden
        className="absolute -bottom-4 -end-3 hidden size-20 -rotate-12 opacity-[0.06] transition-opacity group-hover:opacity-[0.1] sm:block"
        style={{ color: tone }}
        strokeWidth={1.4}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span className="inline-flex min-w-0 items-start gap-1.5 text-[11px] font-bold leading-snug text-muted-foreground sm:items-center sm:text-xs">
          <Icon className="mt-px size-3.5 shrink-0 sm:mt-0 sm:size-4" style={{ color: tone }} />
          <span className="sm:truncate">{label}</span>
        </span>
        <span
          dir="ltr"
          className="hidden shrink-0 rounded bg-blue-950 px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.18em] text-sky-300 sm:block"
        >
          {symbol}
        </span>
      </div>
      <p
        dir="rtl"
        className="relative mt-2 flex flex-wrap items-baseline gap-x-1 font-mono text-[19px] font-black leading-tight tabular-nums text-blue-950 sm:mt-2.5 sm:text-2xl dark:text-blue-50"
      >
        <span>{moneyNum(amount)}</span>
        <span className="font-sans text-[10px] font-bold text-muted-foreground sm:text-xs">جنيه</span>
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
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="inline-flex min-w-0 max-w-[170px] items-center truncate rounded-md border border-blue-700/25 bg-blue-700/5 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200">
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

/** ── قنوات التحصيل — دونات conic مخصصة + وسائل إيضاح ──
 *  التخطيط: عمودي على الجوال، أفقي في المتوسط (بطاقة بعرض كامل)،
 *  وعمودي تاني في xl (البطاقة بتبقى ثلث الصف). */
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
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8 xl:flex-col xl:items-center xl:gap-5">
      <div
        className="relative size-36 shrink-0 rounded-full shadow-[0_0_0_6px_rgba(14,165,233,0.06)] sm:size-40"
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

      <ul className="w-full min-w-0 flex-1 space-y-3 xl:flex-none">
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
                <span className="w-14 shrink-0 text-end font-mono text-[10px] tabular-nums text-muted-foreground/70">
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
    // الأحدث/الأقدم بالتاريخ صراحةً (مش بترتيب الـ API) — التجميع بالشهر في الكروت بيعتمد عليه
    const ts = (t: Tx) => new Date(t.date).getTime() || 0
    if (sort === 'newest') list.sort((a, b) => ts(b) - ts(a))
    else if (sort === 'oldest') list.sort((a, b) => ts(a) - ts(b))
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

  /* ── استجابة: نفس نقاط Tailwind (sm=640 · xl=1280) ──
     xl+ → جدول كامل · أقل → كروت (عرض واحد فقط يُرسم في الـ DOM) */
  const isSm = useMediaQuery('(min-width: 640px)')
  const isXl = useMediaQuery('(min-width: 1280px)')
  const pageSize = isXl ? 50 : 12
  const [limit, setLimit] = React.useState(pageSize)
  React.useEffect(() => {
    setLimit(pageSize)
  }, [pageSize, search, methodFilter, statusFilter, monthIdx, sort])

  const shown = React.useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const remaining = filtered.length - shown.length

  /* تجميع الكروت بالشهر (مع إجمالي كل شهر من القائمة المصفّاة كاملة) */
  const groupByMonth = sort === 'newest' || sort === 'oldest'
  const monthTotals = React.useMemo(() => {
    const map = new Map<string, { count: number; sum: number }>()
    for (const t of filtered) {
      const k = monthKey(t.date)
      const g = map.get(k) ?? { count: 0, sum: 0 }
      g.count += 1
      g.sum += t.amount
      map.set(k, g)
    }
    return map
  }, [filtered])
  const groups = React.useMemo(() => {
    if (!groupByMonth) return [{ key: 'all', label: '', items: shown }]
    const out: Array<{ key: string; label: string; items: Tx[] }> = []
    for (const t of shown) {
      const k = monthKey(t.date)
      const last = out[out.length - 1]
      if (last && last.key === k) last.items.push(t)
      else out.push({ key: k, label: monthTitle(t.date), items: [t] })
    }
    return out
  }, [shown, groupByMonth])

  /* ═══════════ تحميل أولي — هياكل عظمية ═══════════ */
  if (loading && !data) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <Skeleton className="h-[470px] w-full rounded-3xl sm:h-[380px]" />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl sm:h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl sm:h-80 xl:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (!data || !stats) return null

  const tickerItems = data.transactions.slice(0, 14)
  const total = data.transactions.length
  const chipBase =
    'inline-flex items-center gap-1 rounded-md border border-blue-700/25 bg-blue-700/10 px-2 py-1 text-[10.5px] font-semibold text-blue-800 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200'
  const pillBase =
    'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[11px] font-bold transition-all sm:h-8 sm:px-2.5'
  const pillOn = 'border-blue-800 bg-blue-950 text-sky-200 shadow-sm dark:border-blue-300/40 dark:bg-blue-900'
  const pillOff =
    'border-border bg-muted/40 text-muted-foreground hover:border-blue-700/40 hover:bg-blue-700/5'

  /* ═══════════ الصفحة ═══════════ */
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ─────────── لافتة أفق الإيرادات ─────────── */}
      <section className="animate-in-up relative overflow-hidden rounded-2xl border border-blue-800/60 bg-gradient-to-b from-blue-950 via-blue-900 to-blue-950 text-blue-50 shadow-lg shadow-blue-950/25 sm:rounded-3xl dark:border-blue-800/40 dark:shadow-none">
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

        <div className="relative grid gap-4 p-4 sm:gap-6 sm:p-7 xl:grid-cols-[1.1fr_1fr] xl:items-stretch">
          {/* النص والأرقام */}
          <div className="min-w-0 space-y-3.5 sm:space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[11px] font-bold text-sky-200 backdrop-blur">
                <Landmark className="size-3.5" />
                قاعة الإيرادات
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-blue-100/80 backdrop-blur">
                <Activity className="size-3.5" />
                12 شهراً · {data.count} معاملة
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">الإيرادات</h1>
              <p className="mt-1.5 hidden max-w-xl text-sm leading-relaxed text-blue-100/75 sm:block">
                كل جنيه يدخل المنصة — أبراج الشهور، قنوات التحصيل، وسجل كل معاملة،
                في أفق واحد.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300/80">
                  إجمالي إيرادات 12 شهراً
                </p>
                <p dir="rtl" className="flex flex-wrap items-baseline gap-x-2">
                  <span className="bg-gradient-to-l from-white via-sky-200 to-sky-400 bg-clip-text font-mono text-[clamp(2rem,10.5vw,3rem)] font-black leading-tight tabular-nums text-transparent">
                    {moneyNum(data.totalRevenue)}
                  </span>
                  <span className="text-sm font-bold text-sky-300/80 sm:text-base">جنيه</span>
                </p>
              </div>
              <DeltaChip
                pct={stats.momPct}
                label={`عن ${stats.prev?.month ?? 'الشهر السابق'}`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
              <HeroStat
                icon={Building2}
                label="أفضل شهر"
                value={`${shortMoney(stats.best.revenue)} ج`}
                sub={`${stats.best.month} ${stats.bestYear}`}
              />
              <HeroStat
                icon={Sigma}
                label="متوسط شهري"
                value={`${shortMoney(data.avgMonthly)} ج`}
                sub="آخر 12 شهراً"
              />
              <HeroStat
                icon={Coins}
                label="المعاملات"
                value={String(total)}
                sub="معاملة مسجّلة"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 pt-0.5 sm:flex sm:flex-wrap sm:pt-1">
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
                aria-label="تحديث البيانات"
                className="h-11 gap-2 rounded-xl border-white/20 bg-white/5 px-3.5 font-bold text-sky-100 backdrop-blur hover:border-sky-300/50 hover:bg-sky-400/10 hover:text-white sm:px-4"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                <span className="hidden sm:inline">تحديث</span>
              </Button>
            </div>
          </div>

          {/* لوحة الأفق — أبراج الشهور */}
          <div className="relative flex min-w-0 flex-col rounded-2xl border border-white/10 bg-blue-950/50 p-3 backdrop-blur sm:p-4 xl:min-h-[300px]">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-sky-200/85">
                <Building2 className="size-3.5" />
                أفق الإيرادات — برج لكل شهر
              </p>
              <span className="text-[10px] text-blue-200/50">اضغط برجاً لتصفية السجل</span>
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
                  className="h-8 gap-1 rounded-lg px-2 text-[11px] text-blue-200/70 hover:bg-white/10 hover:text-white"
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
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rose-300/30 bg-rose-500/15 px-2 py-1 text-[10px] font-black text-rose-200 sm:px-2.5">
                <span aria-hidden className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-300 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-rose-300" />
                </span>
                <span className="hidden sm:inline">مباشر</span>
                <span className="sr-only sm:hidden">مباشر</span>
              </span>
              <TickerTape items={tickerItems} />
            </div>
          </div>
        )}
      </section>

      {/* ─────────── لوحات الأسعار — 2×2 على الجوال ─────────── */}
      <section className="animate-in-up stagger-1 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <QuoteTile
          symbol="REV·D"
          label="إيرادات اليوم"
          icon={Calendar}
          amount={data.dailyRevenue}
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
          amount={data.monthlyRevenue}
          tone="#fbbf24"
          delay={70}
          sub={
            <span className="inline-flex flex-wrap items-center gap-1.5">
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
          amount={data.yearlyRevenue}
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
          amount={data.avgMonthly}
          tone="#7dd3fc"
          delay={210}
          sub={
            <span className="inline-flex flex-wrap items-center gap-1.5">
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
                <span className="sm:hidden">مقابل المتوسط</span>
                <span className="hidden sm:inline">الشهر الحالي مقابل المتوسط</span>
              </span>
            </span>
          }
        />
      </section>

      {/* ─────────── المخطط + قنوات التحصيل (ثلاثة أعمدة من xl فقط) ─────────── */}
      <section className="animate-in-up stagger-2 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* مخطط الأداء الشهري */}
        <Card className="min-w-0 gap-0 border-blue-900/15 py-1.5 shadow-sm sm:gap-6 sm:py-6 xl:col-span-2 dark:border-blue-300/10">
          <CardContent className="p-3.5 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-950 text-sky-300">
                  <Activity className="size-4" />
                </span>
                <div className="min-w-0">
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
                  className="h-8 gap-1 rounded-lg border-blue-700/30 bg-blue-700/5 px-2 text-[11px] font-bold text-blue-800 hover:bg-blue-700/10 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-200"
                  onClick={() => setMonthIdx(null)}
                >
                  <X className="size-3" />
                  {monthLabel(monthIdx)}
                </Button>
              )}
            </div>

            <div role="img" aria-label="مخطط أعمدة الإيرادات لآخر 12 شهراً" dir="ltr">
              <ResponsiveContainer width="100%" height={isSm ? 280 : 220}>
                <BarChart
                  data={chartData}
                  barCategoryGap={isSm ? '26%' : '18%'}
                  margin={{ top: 8, right: 2, left: 0, bottom: 0 }}
                >
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
                    /* الجوال: كل شهر تاني (والشهر الحالي دايماً ظاهر) عشان التسميات متتداخلش */
                    tickFormatter={(m: string, i: number) =>
                      isSm || (chartData.length - 1 - i) % 2 === 0 ? m.slice(0, 3) : ''
                    }
                    tick={{ fontSize: isSm ? 11 : 10, className: 'fill-muted-foreground' }}
                    axisLine={{ stroke: 'rgba(100,116,139,0.3)' }}
                    tickLine={false}
                  />
                  <YAxis
                    orientation="left"
                    tickFormatter={(v: number) => compactNum(v)}
                    tick={{ fontSize: isSm ? 10.5 : 9.5, className: 'fill-muted-foreground' }}
                    width={isSm ? 46 : 40}
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

            {/* وسيلة إيضاح — بدل تسمية "المتوسط" اللي كانت بتتقص على الجوال */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-4 border-t-2 border-dashed border-sky-500/70" />
                المتوسط الشهري{' '}
                <span dir="rtl" className="font-mono tabular-nums">
                  {monoShort(data.avgMonthly)} ج
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-sm bg-gradient-to-b from-sky-100 to-sky-600" />
                الشهر الحالي
              </span>
            </div>
          </CardContent>
        </Card>

        {/* قنوات التحصيل */}
        <Card className="min-w-0 gap-0 border-blue-900/15 py-1.5 shadow-sm sm:gap-6 sm:py-6 dark:border-blue-300/10">
          <CardContent className="p-3.5 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-950 text-sky-300">
                <Wallet className="size-4" />
              </span>
              <div className="min-w-0">
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
        {/* شبكة عمودين على الجوال: البحث بعرض كامل، الشهر|الحالة، ثم الترتيب بعرض كامل */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative col-span-2 min-w-0 sm:min-w-44 sm:flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث: محل، باقة، مبلغ…"
              className="h-11 rounded-xl border-blue-900/15 bg-background ps-9 pe-9 text-base shadow-none sm:h-10 sm:text-sm dark:border-blue-300/10 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="مسح البحث"
                className="absolute end-1.5 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <Select value={monthIdx === null ? '__all' : String(monthIdx)} onValueChange={(v) => setMonthIdx(v === '__all' ? null : Number(v))}>
            <SelectTrigger className="h-11 w-full min-w-0 rounded-xl text-xs font-bold sm:h-10 sm:w-44" aria-label="تصفية بالشهر">
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
            <SelectTrigger className="h-11 w-full min-w-0 rounded-xl text-xs font-bold sm:h-10 sm:w-36" aria-label="تصفية بالحالة">
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
            <SelectTrigger className="col-span-2 h-11 w-full min-w-0 rounded-xl text-xs font-bold sm:col-span-1 sm:h-10 sm:w-40" aria-label="الترتيب">
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

        {/* حبوب طرق الدفع — صف واحد قابل للسحب على الجوال، يلتف من sm */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="shrink-0 text-[10.5px] font-semibold text-muted-foreground">القناة:</span>
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5',
              '-me-3 pe-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              'sm:me-0 sm:flex-wrap sm:overflow-visible sm:pe-0',
            )}
          >
            <button
              type="button"
              onClick={() => setMethodFilter('__all')}
              aria-pressed={methodFilter === '__all'}
              className={cn(pillBase, methodFilter === '__all' ? pillOn : pillOff)}
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
                  aria-pressed={active}
                  className={cn(pillBase, active ? pillOn : pillOff)}
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
        </div>

        {/* ملخص الفلاتر النشطة */}
        {hasActiveFilters && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed pt-2.5">
            <span className="text-[10.5px] font-semibold text-muted-foreground">مطبّق الآن:</span>
            {search.trim() && (
              <button type="button" onClick={() => setSearch('')} className={cn(chipBase, 'max-w-full font-mono')}>
                <span className="truncate">بحث: {search.trim()}</span>
                <X className="size-3 shrink-0" />
              </button>
            )}
            {methodFilter !== '__all' && (
              <button type="button" onClick={() => setMethodFilter('__all')} className={chipBase}>
                القناة: {methodLabel(methodFilter)}
                <X className="size-3" />
              </button>
            )}
            {statusFilter !== '__all' && (
              <button type="button" onClick={() => setStatusFilter('__all')} className={chipBase}>
                الحالة: {statusMeta(statusFilter).label}
                <X className="size-3" />
              </button>
            )}
            {monthIdx !== null && (
              <button type="button" onClick={() => setMonthIdx(null)} className={chipBase}>
                الشهر: {monthLabel(monthIdx)}
                <X className="size-3" />
              </button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto h-8 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground"
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
        <div className="relative flex flex-wrap items-center justify-between gap-2 bg-gradient-to-l from-blue-950 to-blue-900 px-3.5 py-3 text-blue-50 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/10 backdrop-blur">
              <Building2 className="size-4.5 text-sky-300" />
            </span>
            <div className="min-w-0">
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
              aria-label="تصدير CSV"
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
                  className="h-9 gap-1.5 rounded-lg border-blue-700/30 px-3 text-xs font-bold text-blue-800 hover:bg-blue-700/5 dark:border-blue-300/25 dark:text-blue-200 dark:hover:bg-blue-400/10"
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
            {isXl ? (
              /* ═══ جدول — xl فأكبر (عرض المحتوى ≥ 970px بعد السايدبار) ═══ */
              <div className="max-h-[62vh] overflow-y-auto">
                <Table className="min-w-[860px]">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-transparent hover:bg-transparent">
                      <TableHead className="w-10 bg-blue-950 text-center font-mono text-[10.5px] font-bold tracking-wider text-blue-200/80">
                        #
                      </TableHead>
                      <TableHead className="w-28 bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                        التاريخ
                      </TableHead>
                      <TableHead className="bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                        المحل
                      </TableHead>
                      <TableHead className="w-52 bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                        الباقة
                      </TableHead>
                      <TableHead className="w-32 bg-blue-950 text-[10.5px] font-bold text-blue-200/80">
                        قناة الدفع
                      </TableHead>
                      <TableHead className="w-32 bg-blue-950 text-center text-[10.5px] font-bold text-blue-200/80">
                        المبلغ
                      </TableHead>
                      <TableHead className="w-24 bg-blue-950 text-center text-[10.5px] font-bold text-blue-200/80">
                        الحالة
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((t, i) => (
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
                        <TableCell className="overflow-hidden py-2.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <ShopGlyph name={t.shopName} />
                            <span className="truncate text-[13px] font-bold text-foreground" title={t.shopName}>
                              {t.shopName}
                            </span>
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
            ) : (
              /* ═══ كروت — جوال وتابلت: عمود واحد، وعمودين من sm، مجمّعة بالشهر ═══ */
              <div className="space-y-4 p-3">
                {groups.map((g, gi) => {
                  const mt = monthTotals.get(g.key)
                  return (
                    <div key={`${g.key}-${gi}`} className="space-y-2.5">
                      {groupByMonth && (
                        <div className="flex items-center justify-between gap-2 px-0.5">
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-black text-blue-900 dark:text-sky-200">
                            <CalendarDays aria-hidden className="size-3.5" />
                            {g.label}
                          </span>
                          {mt && (
                            <span dir="rtl" className="font-mono text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                              {mt.count} معاملة · {monoShort(mt.sum)} ج
                            </span>
                          )}
                        </div>
                      )}
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {g.items.map((t, i) => {
                          const isTrial = t.status === 'active' && t.period === 'trial'
                          const accent = isTrial ? '#fbbf24' : statusMeta(t.status).color
                          return (
                            <article
                              key={t.id}
                              className="animate-in-up relative min-w-0 overflow-hidden rounded-xl border bg-background/60"
                              style={{ animationDelay: `${Math.min(i, 8) * 32}ms` }}
                            >
                              <span aria-hidden className="absolute inset-y-0 start-0 w-1" style={{ background: accent }} />
                              <div className="p-3 ps-4">
                                <div className="flex items-start gap-2.5">
                                  <ShopGlyph name={t.shopName} />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black text-foreground">{t.shopName}</p>
                                    <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                                      <Clock aria-hidden className="size-3 shrink-0" />
                                      <span className="truncate tabular-nums">{formatArabicDateTime(t.date)}</span>
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span dir="rtl" className="flex items-baseline gap-1 font-mono text-base font-black leading-none tabular-nums text-blue-800 dark:text-sky-300">
                                      {moneyNum(t.amount)}
                                      <span className="font-sans text-[10px] font-bold text-muted-foreground">جنيه</span>
                                    </span>
                                    <StatusSeal tx={t} />
                                  </div>
                                </div>
                                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed pt-2.5">
                                  <PlanTag tx={t} />
                                  <MethodChip method={t.method || 'manual'} />
                                </div>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* عرض المزيد */}
            {remaining > 0 && (
              <div className="border-t px-3 py-3">
                <Button
                  variant="outline"
                  onClick={() => setLimit((l) => l + pageSize)}
                  className="h-11 w-full gap-2 rounded-xl border-blue-700/25 text-xs font-bold text-blue-800 hover:bg-blue-700/5 dark:border-blue-300/20 dark:text-sky-200 dark:hover:bg-blue-400/10"
                >
                  <ChevronDown className="size-4" />
                  عرض {Math.min(pageSize, remaining)} معاملة إضافية
                  <span className="font-mono text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                    ({remaining} متبقية)
                  </span>
                </Button>
              </div>
            )}

            {/* تذييل السجل */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-muted/30 px-4 py-2.5">
              <p className="text-[11px] font-semibold text-muted-foreground">
                عرض {shown.length} من {total} معاملة
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
