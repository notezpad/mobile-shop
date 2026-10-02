'use client'

/**
 * FinanceView — «مكتب التحويلات» (2026)
 *
 * هوية الصفحة: التذكرة/الإيصال.
 *  - الهيرو تذكرة بحافة مثقّبة: على الجنب الأساسي «عمولة الفترة» (ربح المحل من التحويلات)،
 *    وعلى الجنب المقصوص (stub) أزرار الإجراءات.
 *  - «مسارات التحويل»: لكل وسيلة شريط ثنائي الاتجاه (سحب ← 0 → إيداع) يبيّن الحركة في ثانية.
 *  - السجل متقسّم بالأيام (تايم لاين) مش جدول، وكل يوم له إجمالياته.
 *  - إضافة المعاملة بديالوج فيه إيصال مباشر: العمولة وأثر الخزنة بيتحسبوا وإنت بتكتب.
 *
 * المنطق (API / refresh / إلغاء الأدمن / PDF) زي ما هو، مع تصحيحين:
 *  - المعاملات الملغية بتتستبعد من كل الإجماليات (قبل كده كانت بتتحسب في الـ PDF).
 *  - تسمية فوري بقت «فوري» في كل مكان (الجدول كان بيسمّيها «محفظة إلكترونية»).
 */

import * as React from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CalendarDays,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Inbox,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Smartphone,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatArabicDate, formatArabicDateTime, formatCurrency } from '@/lib/format'
import { printListReportHtml, openPrintWindow, printLtr } from '@/lib/print'
import { useShopStore } from '@/lib/store'
import { useConfirm } from './ConfirmDialogProvider'
import { useDataRefresh } from '@/lib/offline/data-events'
import { cn } from '@/lib/utils'

/* ───────────────────────── الأنواع والثوابت ───────────────────────── */

interface Txn {
  id: number
  method: string
  kind: string
  amount: number
  commission: number
  note: string | null
  userName?: string | null
  status?: string
  createdAt: string
}

type MethodKey = 'vodafone_cash' | 'instapay' | 'fawry'
type Preset = 'today' | 'week' | 'month' | 'all'

interface Rates {
  commissionVodafoneCash?: number
  commissionInstapay?: number
  commissionFawry?: number
}

const METHODS: {
  key: MethodKey
  label: string
  icon: React.ElementType
  color: string
  rate: keyof Rates
}[] = [
  { key: 'vodafone_cash', label: 'محافظ إلكترونية', icon: Smartphone, color: '#f97316', rate: 'commissionVodafoneCash' },
  { key: 'instapay', label: 'انستاباي', icon: Zap, color: '#6366f1', rate: 'commissionInstapay' },
  { key: 'fawry', label: 'فوري', icon: Receipt, color: '#eab308', rate: 'commissionFawry' },
]
const M = Object.fromEntries(METHODS.map((m) => [m.key, m])) as Record<string, (typeof METHODS)[number]>
const methodLabel = (k: string) => M[k]?.label ?? k

const PRESETS: { k: Preset; l: string }[] = [
  { k: 'today', l: 'اليوم' },
  { k: 'week', l: 'آخر 7 أيام' },
  { k: 'month', l: 'الشهر ده' },
  { k: 'all', l: 'كل الفترة' },
]

const ACCENT = 'linear-gradient(135deg, #0d9488, #06b6d4)' // teal → cyan
const ROW_LIMIT = 500 // نفس take بتاع الـ API

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

const LRM = '\u200E'
// فلوس: صحيح من غير كسور، وأي كسر يتعرض بخانتين (82.50 مش 82.5)
const fmt = (n: number) =>
  LRM + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const fmtRate = (n: number) => LRM + String(n) // نسبة العمولة: 0.5 مش 0.50

/** جمع عربي: معاملة واحدة · معاملتين · 3 معاملات · 11 معاملة */
const countTxn = (n: number) =>
  n === 1 ? 'معاملة واحدة' : n === 2 ? 'معاملتين' : n >= 3 && n <= 10 ? `${fmt(n)} معاملات` : `${fmt(n)} معاملة`
const sgn = (n: number) => (n === 0 ? fmt(0) : `${LRM}${n > 0 ? '+' : '−'}${fmt(Math.abs(n)).replace(LRM, '')}`)
const isCancelled = (t: Txn) => t.status === 'cancelled'
const netOf = (t: Txn) => (t.kind === 'deposit' ? t.amount : -t.amount) + t.commission

/** "YYYY-MM-DD" بتوقيت المحل (مش الجهاز) — نفس منطق السيرفر */
function tzDateStr(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
function parseDateStr(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function periodRange(p: Preset, tz: string): { from: string; to: string } {
  const today = tzDateStr(new Date(), tz)
  if (p === 'today') return { from: today, to: today }
  if (p === 'week') return { from: addDays(today, -6), to: today }
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  return { from: '', to: '' }
}
function dayLabel(key: string, tz: string): string {
  const today = tzDateStr(new Date(), tz)
  if (key === today) return 'اليوم'
  if (key === addDays(today, -1)) return 'أمس'
  return formatArabicDate(parseDateStr(key))
}
const timeLabel = (iso: string, tz: string) =>
  new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    .replace('AM', 'ص')
    .replace('PM', 'م')
const dmy = (s: string) => (s ? s.split('-').reverse().join('/') : '')

/** أرقام عربية/فواصل → رقم عادي (لوحة المفاتيح العربي) */
function parseAmount(raw: string): number {
  const s = raw
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫،]/g, '.')
    .replace(/[^\d.]/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

interface Bucket { dep: number; wd: number; comm: number; n: number }
const emptyBucket = (): Bucket => ({ dep: 0, wd: 0, comm: 0, n: 0 })

/** إجماليات من غير الملغي — بالوسيلة وإجمالي */
function summarize(rows: Txn[]) {
  const by: Record<string, Bucket> = Object.fromEntries(METHODS.map((m) => [m.key, emptyBucket()]))
  const total = emptyBucket()
  let cancelled = 0
  for (const t of rows) {
    if (isCancelled(t)) {
      cancelled++
      continue
    }
    const b = (by[t.method] ??= emptyBucket())
    for (const x of [b, total]) {
      if (t.kind === 'deposit') x.dep += t.amount
      else x.wd += t.amount
      x.comm += t.commission
      x.n += 1
    }
  }
  return { by, total, net: total.dep - total.wd + total.comm, cancelled }
}

/* ───────────────────────── الصفحة ───────────────────────── */

export function FinanceView() {
  const confirm = useConfirm()
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const tz = useShopStore((s) => s.branding.timezone) || 'Africa/Cairo'
  const userRole = useShopStore((s) => s.user?.role)
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'

  const [rows, setRows] = React.useState<Txn[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadedOnce, setLoadedOnce] = React.useState(false)
  const [preset, setPreset] = React.useState<Preset | null>('today')
  const [from, setFrom] = React.useState(() => periodRange('today', 'Africa/Cairo').from)
  const [to, setTo] = React.useState(() => periodRange('today', 'Africa/Cairo').to)
  const [method, setMethod] = React.useState<string>('all')
  const [kind, setKind] = React.useState<string>('all')
  const [q, setQ] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [rates, setRates] = React.useState<Rates | null>(null)
  const [flashId, setFlashId] = React.useState<number | null>(null)
  const [showCancelled, setShowCancelled] = React.useState(true)

  // توقيت المحل ممكن يوصل بعد أول رسم — نعيد حساب «اليوم» وقتها
  React.useEffect(() => {
    if (preset) {
      const r = periodRange(preset, tz)
      setFrom(r.from)
      setTo(r.to)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz])

  const apply = (p: Preset) => {
    const r = periodRange(p, tz)
    setPreset(p)
    setFrom(r.from)
    setTo(r.to)
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const data = await api<Txn[]>(`/api/finance?${params.toString()}`)
      setRows(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحميل')
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [from, to])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh — الصفحة دي بتتأثر بالخزنة والمبيعات والمصروفات
  useDataRefresh(['cash', 'sales', 'expenses'], load)

  // نسب العمولة (من إعدادات المحل) — بتتستخدم في معاينة الإيصال بس، الحساب الفعلي على السيرفر
  React.useEffect(() => {
    api<Rates>('/api/tenant').then(setRates).catch(() => setRates(null))
  }, [])

  const cancelTxn = async (id: number) => {
    const ok = await confirm({
      title: 'إلغاء المعاملة؟',
      description: 'هيتم عكس قيد الأصل والعمولة من الخزنة بنفس طريقة الدفع.',
      confirmText: 'إلغاء المعاملة',
    })
    if (!ok) return
    try {
      await api(`/api/finance/${id}`, { method: 'DELETE' })
      toast.success('تم إلغاء المعاملة وعكس القيود')
      load()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإلغاء')
    }
  }

  /* الإحصائيات: كل المعاملات المحمّلة (الفترة + الوسيلة) — من غير الملغي */
  const stats = React.useMemo(() => summarize(rows), [rows])
  const scale = React.useMemo(
    () => Math.max(1, ...METHODS.map((m) => Math.max(stats.by[m.key]?.dep ?? 0, stats.by[m.key]?.wd ?? 0))),
    [stats]
  )

  /* القائمة: بعد فلتر النوع والبحث */
  const visible = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (method !== 'all' && r.method !== method) return false
      if (kind !== 'all' && r.kind !== kind) return false
      if (!showCancelled && isCancelled(r)) return false
      if (t) {
        const hay = `${r.note ?? ''} ${r.userName ?? ''} ${methodLabel(r.method)} ${r.amount} ${r.commission}`.toLowerCase()
        if (!hay.includes(t)) return false
      }
      return true
    })
  }, [rows, method, kind, q, showCancelled])

  // إجماليات «النتيجة» (بعد الفلاتر) — منفصلة عن إجماليات الفترة في الهيرو
  const viewStats = React.useMemo(() => summarize(visible), [visible])

  // أكبر مبلغ ظاهر — بيحدد طول الشريط في كل صف
  const maxAmt = React.useMemo(() => Math.max(1, ...visible.map((r) => r.amount)), [visible])

  const groups = React.useMemo(() => {
    const map = new Map<string, Txn[]>()
    for (const r of visible) {
      const k = tzDateStr(new Date(r.createdAt), tz)
      const arr = map.get(k)
      if (arr) arr.push(r)
      else map.set(k, [r])
    }
    return Array.from(map, ([key, list]) => ({ key, list, s: summarize(list) }))
  }, [visible, tz])

  const hasFilter = kind !== 'all' || q !== '' || method !== 'all' || !showCancelled
  const clearFilters = () => {
    setKind('all')
    setQ('')
    setMethod('all')
    setShowCancelled(true)
  }

  const rangeText =
    !from && !to ? 'كل الفترة' : from === to ? dmy(from) : `${dmy(from) || 'البداية'} ← ${dmy(to) || 'اليوم'}`

  const exportPdf = () => {
    const s = summarize(visible)
    const html = printListReportHtml(
      {
        title: 'المعاملات المالية',
        subtitle: 'مكتب تحويلات المحافظ الإلكترونية',
        columns: [
          { header: '#' },
          { header: 'التاريخ' },
          { header: 'الوسيلة' },
          { header: 'بواسطة' },
          { header: 'النوع' },
          { header: 'المبلغ' },
          { header: 'العمولة' },
          { header: 'الصافي' },
          { header: 'ملاحظات', align: 'right' },
        ],
        rows: visible.map((t, i) => [
          String(i + 1),
          printLtr(formatArabicDateTime(t.createdAt)),
          methodLabel(t.method),
          t.userName ?? '—',
          t.kind === 'deposit' ? 'إيداع' : 'سحب',
          formatCurrency(t.amount),
          formatCurrency(t.commission),
          isCancelled(t) ? '—' : formatCurrency(netOf(t)),
          `${t.note ?? '—'}${isCancelled(t) ? ' (ملغية)' : ''}`,
        ]),
        kpis: [
          { label: 'إجمالي الإيداعات', value: formatCurrency(s.total.dep) },
          { label: 'إجمالي السحوبات', value: formatCurrency(s.total.wd) },
          { label: 'إجمالي العمولات', value: formatCurrency(s.total.comm), emphasize: true },
          { label: 'عدد المعاملات', value: String(s.total.n) },
        ],
        note:
          (from || to ? `الفترة: من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'الفترة: كل الفترات') +
          (s.cancelled ? ` — ${s.cancelled} معاملة ملغية غير محسوبة في الإجماليات` : ''),
        emptyMessage: 'لا توجد معاملات',
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

  const firstLoad = loading && !loadedOnce

  return (
    <div className="space-y-5">
      {/* ═════════ الهيرو — التذكرة ═════════ */}
      <section className="relative overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 end-10 size-72 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-400/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, currentColor 0 1px, transparent 1px 11px)' }}
        />

        <div className="relative grid lg:grid-cols-[minmax(0,1fr)_212px]">
          {/* الجنب الأساسي */}
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              {/* الهوية + الرقم المحوري */}
              <div className="min-w-[250px]">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 items-center justify-center rounded-xl text-white shadow-md shadow-teal-600/25"
                    style={{ background: ACCENT }}
                  >
                    <Wallet className="size-5" />
                  </span>
                  <div>
                    <h1 className="text-lg font-extrabold leading-tight">المعاملات المالية</h1>
                    <p className="text-[11px] text-muted-foreground">إيداع وسحب المحافظ الإلكترونية والعمولات</p>
                  </div>
                </div>

                <p className="mt-4 text-xs font-medium text-muted-foreground">عمولة الفترة — ربح المحل من التحويلات</p>
                <div className="mt-1 flex items-baseline gap-2.5">
                  {firstLoad ? (
                    <Skeleton className="h-12 w-44 rounded-xl" />
                  ) : (
                    <span
                      dir="ltr"
                      className="bg-clip-text text-5xl font-black leading-none tracking-tight tabular-nums text-transparent"
                      style={{ backgroundImage: ACCENT }}
                    >
                      {fmt(stats.total.comm)}
                    </span>
                  )}
                  <span className="text-base font-semibold text-muted-foreground">جنيه</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  من <b className="text-foreground">{countTxn(stats.total.n)}</b> · {rangeText}
                  {stats.cancelled > 0 && <span> · {fmt(stats.cancelled)} ملغية غير محسوبة</span>}
                </p>
              </div>

              {/* ملخص التدفق */}
              <div className="grid min-w-[280px] flex-1 grid-cols-3 gap-2 lg:max-w-[500px]">
                <Tile label="إيداعات" value={fmt(stats.total.dep)} tone={stats.total.dep > 0 ? 'in' : 'flat'} />
                <Tile label="سحوبات" value={fmt(stats.total.wd)} tone={stats.total.wd > 0 ? 'out' : 'flat'} />
                <Tile
                  label="أثر الخزنة"
                  value={sgn(stats.net)}
                  tone={stats.net > 0 ? 'in' : stats.net < 0 ? 'out' : 'flat'}
                  hint="إيداع − سحب + عمولة"
                />
              </div>
            </div>

            {/* مسارات التحويل */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold">مسارات التحويل</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <i className="size-2 rounded-full bg-rose-500" />
                    سحب
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i className="size-2 rounded-full bg-emerald-500" />
                    إيداع
                  </span>
                </div>
              </div>
              <div className="grid gap-2.5 md:grid-cols-3">
                {METHODS.map((m) => (
                  <Lane
                    key={m.key}
                    m={m}
                    b={stats.by[m.key] ?? emptyBucket()}
                    scale={scale}
                    muted={method !== 'all' && method !== m.key}
                    selected={method === m.key}
                    onSelect={() => setMethod(method === m.key ? 'all' : m.key)}
                  />
                ))}
              </div>
              {rows.length >= ROW_LIMIT && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  الأرقام دي لآخر {fmt(ROW_LIMIT)} معاملة بس — ضيّق الفترة عشان تبقى دقيقة.
                </p>
              )}
            </div>
          </div>

          {/* الجنب المقصوص (stub) */}
          <div className="relative flex flex-col justify-center gap-2.5 border-t border-dashed p-5 sm:p-6 lg:border-s lg:border-t-0">
            <span aria-hidden className="absolute left-0 top-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-background lg:left-auto lg:right-0 lg:translate-x-1/2" />
            <span aria-hidden className="absolute right-0 top-0 size-5 -translate-y-1/2 translate-x-1/2 rounded-full border bg-background lg:bottom-0 lg:top-auto lg:translate-y-1/2" />
            <Button
              size="lg"
              onClick={() => setDialogOpen(true)}
              className="h-12 w-full border-0 text-base font-bold text-white shadow-md shadow-teal-600/25 hover:opacity-95"
              style={{ background: ACCENT }}
            >
              <Plus className="size-5" />
              معاملة جديدة
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={loading || visible.length === 0} className="w-full">
              <FileText className="size-4" />
              تصدير PDF
            </Button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="mx-auto mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              تحديث
            </button>
          </div>
        </div>
      </section>

      {/* ═════════ الفلاتر ═════════ */}
      <div className="sticky top-0 z-20 overflow-hidden rounded-2xl border bg-background/80 shadow-sm backdrop-blur-xl">
        <style>{`@keyframes fin-slide{0%{transform:translateX(-120%)}100%{transform:translateX(420%)}}`}</style>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 p-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-bold shadow-xs transition-colors hover:bg-muted/60"
              >
                <CalendarDays className="size-4 text-teal-600 dark:text-teal-400" />
                <span dir="ltr" className="tabular-nums">{rangeText}</span>
                <ChevronDown className="size-3.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[300px] rounded-2xl p-3">
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.k}
                    type="button"
                    onClick={() => apply(p.k)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                      preset === p.k ? 'border-transparent text-white' : 'hover:bg-muted/60'
                    )}
                    style={preset === p.k ? { background: ACCENT } : undefined}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  من
                  <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(null) }} className="h-9 rounded-xl text-xs" />
                </label>
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  إلى
                  <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(null) }} className="h-9 rounded-xl text-xs" />
                </label>
              </div>
            </PopoverContent>
          </Popover>

          <Seg
            label="الفترة السريعة"
            value={preset}
            onChange={(v) => apply(v as Preset)}
            options={PRESETS.map((p) => ({ v: p.k, l: p.l }))}
          />

          <Seg
            label="الوسيلة"
            value={method}
            onChange={setMethod}
            options={[
              { v: 'all', l: 'كل الوسائل' },
              ...METHODS.map((m) => ({
                v: m.key,
                l: (
                  <span className="inline-flex items-center gap-1.5">
                    <i className="size-2 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </span>
                ),
              })),
            ]}
          />

          <Seg
            label="النوع"
            value={kind}
            onChange={setKind}
            options={[
              { v: 'all', l: 'الكل' },
              { v: 'deposit', l: 'إيداع' },
              { v: 'withdraw', l: 'سحب' },
            ]}
          />

          {stats.cancelled > 0 && (
            <button
              type="button"
              aria-pressed={!showCancelled}
              onClick={() => setShowCancelled((v) => !v)}
              className={cn(
                'flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors',
                showCancelled ? 'bg-card text-muted-foreground hover:text-foreground' : 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
              )}
            >
              {showCancelled ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showCancelled ? 'إخفاء' : 'إظهار'} الملغية ({fmt(stats.cancelled)})
            </button>
          )}

          <div className="relative min-w-[170px] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث في الملاحظات أو الموظف…"
              className="h-10 rounded-xl pl-9 pr-9"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="مسح البحث"
                className="absolute left-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {loading && loadedOnce && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden motion-reduce:hidden">
            <span className="block h-full w-1/4 rounded-full" style={{ background: ACCENT, animation: 'fin-slide 1.1s ease-in-out infinite' }} />
          </span>
        )}
      </div>

      {/* ═════════ السجل ═════════ */}
      {firstLoad ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Inbox className="size-7" />
          </span>
          <div>
            <p className="font-bold">{rows.length === 0 ? 'مفيش معاملات في الفترة دي' : 'مفيش نتايج بالفلاتر دي'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length === 0 ? 'سجّل أول معاملة، أو غيّر الفترة لو بتدوّر على حاجة أقدم.' : 'جرّب كلمة بحث تانية أو امسح الفلاتر.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setDialogOpen(true)} className="border-0 text-white" style={{ background: ACCENT }}>
              <Plus className="size-4" />
              معاملة جديدة
            </Button>
            {hasFilter ? (
              <Button variant="outline" onClick={clearFilters}>مسح الفلاتر</Button>
            ) : (
              preset !== 'all' && <Button variant="outline" onClick={() => apply('all')}>عرض كل الفترة</Button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn('space-y-4 transition-opacity', loading && 'opacity-70')}>
          {hasFilter ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-teal-500/25 bg-teal-500/5 px-3.5 py-2.5 text-[11px]" aria-live="polite">
              <span className="font-bold text-teal-700 dark:text-teal-300">
                نتيجة الفلتر: {countTxn(visible.length)} من {fmt(rows.length)}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 font-semibold tabular-nums">
                {viewStats.total.dep > 0 && <Pill tone="in">إيداع {sgn(viewStats.total.dep)}</Pill>}
                {viewStats.total.wd > 0 && <Pill tone="out">سحب {sgn(-viewStats.total.wd)}</Pill>}
                {viewStats.total.comm > 0 && <Pill tone="acc">عمولة {sgn(viewStats.total.comm)}</Pill>}
              </div>
              <button type="button" onClick={clearFilters} className="ms-auto font-semibold text-teal-600 hover:underline dark:text-teal-400">
                مسح الفلاتر
              </button>
            </div>
          ) : (
            <p className="px-1 text-[11px] text-muted-foreground">
              عرض {fmt(visible.length)} من {countTxn(rows.length)}
            </p>
          )}

          <div className={cn('mx-px hidden px-3.5 text-[11px] font-semibold text-muted-foreground lg:grid', GRID)}>
            <span />
            <span>الوسيلة والتفاصيل</span>
            <span />
            <span className="text-end">المبلغ</span>
            <span className="text-end">العمولة</span>
            <span className="text-end">أثر الخزنة</span>
            <span />
          </div>

          {groups.map((g) => (
            <section key={g.key} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-muted/30 px-3.5 py-2.5">
                <h3 className="text-sm font-extrabold">{dayLabel(g.key, tz)}</h3>
                <span className="text-[11px] text-muted-foreground">{countTxn(g.list.length)}</span>
                <div className="ms-auto flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tabular-nums">
                  {g.s.total.dep > 0 && <Pill tone="in">إيداع {sgn(g.s.total.dep)}</Pill>}
                  {g.s.total.wd > 0 && <Pill tone="out">سحب {sgn(-g.s.total.wd)}</Pill>}
                  {g.s.total.comm > 0 && <Pill tone="acc">عمولة {sgn(g.s.total.comm)}</Pill>}
                </div>
              </header>
              <ul className="divide-y">
                {g.list.map((t, i) => (
                  <TxnRow key={t.id} t={t} i={i} tz={tz} isAdmin={isAdmin} onCancel={cancelTxn} maxAmt={maxAmt} flash={flashId === t.id} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TxnDialog open={dialogOpen} onOpenChange={setDialogOpen} rates={rates} onSaved={(id) => {
          load()
          if (id) {
            setFlashId(id)
            setTimeout(() => setFlashId(null), 2800)
          }
        }}
      />
    </div>
  )
}

/* ───────────────────────── مكوّنات الهيرو والفلاتر ───────────────────────── */

const GRID =
  'grid-cols-[auto_minmax(0,1fr)_auto_32px] lg:grid-cols-[auto_minmax(0,1.3fr)_minmax(80px,1fr)_130px_100px_130px_32px] gap-x-4'

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: 'in' | 'out' | 'flat'
  hint?: string
}) {
  return (
    <div className="rounded-2xl border bg-background/60 px-3 py-2.5" title={hint}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        dir="ltr"
        className={cn(
          'mt-0.5 text-right text-lg font-extrabold tabular-nums',
          tone === 'in' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'out' && 'text-rose-600 dark:text-rose-400'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Pill({ tone, children }: { tone: 'in' | 'out' | 'acc'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1',
        tone === 'in' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'out' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        tone === 'acc' && 'bg-teal-500/10 text-teal-700 dark:text-teal-300'
      )}
    >
      {children}
    </span>
  )
}

/** مسار تحويل: بطاقة صغيرة بشريط ثنائي الاتجاه — سحب شمال الصفر وإيداع يمينه */
function Lane({
  m,
  b,
  scale,
  muted,
  selected,
  onSelect,
}: {
  m: (typeof METHODS)[number]
  b: Bucket
  scale: number
  muted: boolean
  selected: boolean
  onSelect: () => void
}) {
  const wd = (b.wd / scale) * 50
  const dep = (b.dep / scale) * 50
  const Icon = m.icon
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={selected ? 'اضغط لإلغاء فلتر الوسيلة' : `اضغط لعرض معاملات ${m.label} بس`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'cursor-pointer rounded-2xl border bg-background/60 p-3 transition-all hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        muted && 'opacity-45 hover:opacity-80'
      )}
      style={selected ? { borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${m.color}1f`, color: m.color }}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold leading-tight">{m.label}</p>
            <p className="text-[10px] leading-tight text-muted-foreground">{countTxn(b.n)}</p>
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[10px] leading-tight text-muted-foreground">عمولة</p>
          <p dir="ltr" className={cn('text-left text-sm font-extrabold leading-tight tabular-nums', b.comm > 0 ? 'text-teal-700 dark:text-teal-300' : 'text-muted-foreground/60')}>
            {b.comm > 0 ? sgn(b.comm) : '0'}
          </p>
        </div>
      </div>

      <div dir="ltr" className="mt-3">
        <div className="relative h-2 rounded-full bg-muted/80">
          <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/25" />
          {b.wd > 0 && (
            <span
              className="absolute inset-y-0 right-1/2 rounded-s-full bg-rose-500 transition-[width] duration-slow ease-out"
              style={{ width: `${Math.max(2, wd)}%` }}
            />
          )}
          {b.dep > 0 && (
            <span
              className="absolute inset-y-0 left-1/2 rounded-e-full bg-emerald-500 transition-[width] duration-slow ease-out"
              style={{ width: `${Math.max(2, dep)}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums">
          <span className={b.wd ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/60'}>{b.wd ? sgn(-b.wd) : '0'}</span>
          <span className={b.dep ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'}>{b.dep ? sgn(b.dep) : '0'}</span>
        </div>
      </div>
    </div>
  )
}

/** مفتاح اختيار موحّد */
function Seg({
  value,
  onChange,
  options,
  label,
}: {
  value: string | null
  onChange: (v: string) => void
  options: { v: string; l: React.ReactNode }[]
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-muted/70 p-1 ring-1 ring-inset ring-border/60"
    >
      {options.map((o) => {
        const on = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              on
                ? 'bg-card text-teal-700 shadow-sm ring-1 ring-teal-500/25 dark:text-teal-300'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

function MethodTag({ k }: { k: string }) {
  const m = M[k]
  if (!m) return <span className="text-xs font-bold">{k}</span>
  const Icon = m.icon
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-bold"
      style={{ backgroundColor: `${m.color}1a`, color: m.color }}
    >
      <Icon className="size-3.5" />
      {m.label}
    </span>
  )
}

/* ───────────────────────── صف المعاملة ───────────────────────── */

function TxnRow({
  t,
  i,
  tz,
  isAdmin,
  onCancel,
  maxAmt,
  flash,
}: {
  t: Txn
  i: number
  tz: string
  isAdmin: boolean
  onCancel: (id: number) => void
  maxAmt: number
  flash: boolean
}) {
  const dep = t.kind === 'deposit'
  const cancelled = isCancelled(t)
  const Icon = dep ? ArrowDownLeft : ArrowUpRight
  const net = netOf(t)
  const money = dep ? t.amount : -t.amount

  return (
    <li
      className={cn(
        'group grid items-center gap-y-1 px-3.5 py-3 transition-colors duration-700 hover:bg-muted/40 animate-in-up motion-reduce:animate-none',
        GRID,
        cancelled && 'bg-muted/20',
        flash && 'bg-teal-500/15 hover:bg-teal-500/15'
      )}
      style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl',
          cancelled
            ? 'bg-muted text-muted-foreground'
            : dep
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
        )}
        title={dep ? 'داخل للخزنة' : 'خارج من الخزنة'}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <MethodTag k={t.method} />
          <span className="text-xs font-semibold">{dep ? 'إيداع للعميل' : 'سحب للعميل'}</span>
          {cancelled && (
            <span className="rounded-md border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
              ملغية
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={formatArabicDateTime(t.createdAt)}>
          <bdi>{timeLabel(t.createdAt, tz)}</bdi>
          {t.userName && <> · {t.userName}</>}
          {t.note && <> · {t.note}</>}
        </p>
      </div>

      {/* شريط نسبي: بيملا المساحة الفاضية ويخلّي مقارنة المبالغ بالنظر */}
      <div className="hidden lg:block" aria-hidden>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/70">
          <div
            className={cn('h-full rounded-full', cancelled ? 'bg-muted-foreground/30' : dep ? 'bg-emerald-500/70' : 'bg-rose-500/70')}
            style={{ width: `${Math.max(4, (t.amount / maxAmt) * 100)}%` }}
          />
        </div>
      </div>

      <div className="text-end">
        <p
          dir="ltr"
          className={cn(
            'text-left text-base font-extrabold tabular-nums',
            cancelled ? 'text-muted-foreground line-through' : dep ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          )}
        >
          {sgn(money)}
        </p>
        {t.commission > 0 && (
          <p className={cn('text-[10px] text-muted-foreground lg:hidden', cancelled && 'line-through')}>
            عمولة <bdi dir="ltr">{sgn(t.commission)}</bdi>
          </p>
        )}
      </div>

      <div className="hidden text-end lg:block">
        <p dir="ltr" className={cn('text-left text-sm font-bold tabular-nums', cancelled || t.commission === 0 ? 'text-muted-foreground' : 'text-teal-700 dark:text-teal-300', cancelled && 'line-through')}>
          {t.commission > 0 ? sgn(t.commission) : '—'}
        </p>
      </div>

      <div className="hidden text-end lg:block">
        <p dir="ltr" className={cn('text-left text-sm font-extrabold tabular-nums', cancelled ? 'text-muted-foreground' : net < 0 ? 'text-rose-600 dark:text-rose-400' : '')}>
          {cancelled ? '—' : sgn(net)}
        </p>
      </div>

      <div className="flex justify-end">
        {isAdmin && !cancelled && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCancel(t.id)}
            title="إلغاء المعاملة (أدمن فقط)"
            aria-label="إلغاء المعاملة"
            className="text-muted-foreground hover:text-destructive lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <Ban className="size-4" />
          </Button>
        )}
      </div>
    </li>
  )
}

/* ───────────────────────── ديالوج معاملة جديدة ───────────────────────── */

const QUICK_ADD = [50, 100, 200, 500, 1000]

function TxnDialog({
  open,
  onOpenChange,
  rates,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  rates: Rates | null
  onSaved: (newId?: number) => void
}) {
  const [kind, setKind] = React.useState<'deposit' | 'withdraw'>('deposit')
  const [method, setMethod] = React.useState<MethodKey>('vodafone_cash')
  const [amountText, setAmountText] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const amountRef = React.useRef<HTMLInputElement>(null)

  // الوسيلة والنوع بيفضلوا زي ما اخترتهم — بنصفّر المبلغ والملاحظة بس عند الفتح
  React.useEffect(() => {
    if (open) {
      setAmountText('')
      setNote('')
    }
  }, [open])

  const amt = parseAmount(amountText)
  const cfg = M[method]
  const rate = rates ? (rates[cfg.rate] as number | undefined) ?? 0 : null
  const commission = rate != null && amt > 0 ? Math.round(amt * rate) / 100 : null
  const dep = kind === 'deposit'
  const net = amt > 0 ? (dep ? amt : -amt) + (commission ?? 0) : 0

  const submit = async (another: boolean) => {
    if (saving) return
    if (!(amt > 0)) {
      toast.error('اكتب مبلغ صحيح')
      amountRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const created = await api<{ id?: number }>('/api/finance', {
        method: 'POST',
        body: { method, kind, amount: amt, note: note.trim() || null },
      })
      toast.success(`تمت إضافة ${dep ? 'إيداع' : 'سحب'} ${fmt(amt)} جنيه`)
      onSaved(created?.id)
      if (another) {
        setAmountText('')
        setNote('')
        setTimeout(() => amountRef.current?.focus(), 0)
      } else {
        onOpenChange(false)
      }
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit(false)
    }
  }

  const KINDS = [
    { v: 'deposit' as const, icon: ArrowDownLeft, t: 'إيداع للعميل', on: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500' },
    { v: 'withdraw' as const, icon: ArrowUpRight, t: 'سحب للعميل', on: 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* الهيدر والفوتر ثابتين، والجسم هو اللي بيسكرول لو الشاشة قصيرة */}
      <DialogContent
        mobileSheet
        className="grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[500px]"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          setTimeout(() => amountRef.current?.focus(), 0)
        }}
      >
        <DialogHeader className="border-b px-5 py-3.5 text-start">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg text-white" style={{ background: ACCENT }}>
              <Wallet className="size-4" />
            </span>
            معاملة جديدة
          </DialogTitle>
          <DialogDescription className="sr-only">سجّل إيداع أو سحب لعميل — العمولة بتتحسب تلقائي.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {/* النوع + اتجاه الكاش */}
          <div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع المعاملة">
              {KINDS.map((k) => {
                const sel = kind === k.v
                return (
                  <button
                    key={k.v}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => setKind(k.v)}
                    className={cn(
                      'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-colors',
                      sel ? k.on : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    <k.icon className="size-4" />
                    {k.t}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              {dep ? 'العميل بيدّيك كاش ← الخزنة بتزيد' : 'إنت بتدّي العميل كاش ← الخزنة بتقل'}
            </p>
          </div>

          {/* الوسيلة */}
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="الوسيلة">
            {METHODS.map((m) => {
              const sel = method === m.key
              const r = rates ? (rates[m.rate] as number | undefined) ?? 0 : null
              const Icon = m.icon
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setMethod(m.key)}
                  className={cn('flex min-w-0 flex-col gap-1.5 rounded-xl border p-2.5 text-start transition-colors', !sel && 'hover:bg-muted/50')}
                  style={sel ? { borderColor: m.color, backgroundColor: `${m.color}12`, boxShadow: `0 0 0 1px ${m.color}` } : undefined}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${m.color}1f`, color: m.color }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {r == null ? '…' : r > 0 ? `${fmtRate(r)}٪` : '0٪'}
                    </span>
                  </span>
                  <span className="text-xs font-bold leading-tight">{m.label}</span>
                </button>
              )
            })}
          </div>

          {/* المبلغ + الإضافة السريعة في صندوق واحد */}
          <div className="rounded-2xl border bg-muted/30 p-2.5">
            <Label htmlFor="fin-amount" className="sr-only">المبلغ</Label>
            <div className="relative">
              <Input
                id="fin-amount"
                ref={amountRef}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                onKeyDown={onEnter}
                inputMode="decimal"
                autoComplete="off"
                placeholder="المبلغ"
                dir="ltr"
                className="h-14 rounded-xl bg-background px-12 text-center text-3xl font-black tabular-nums placeholder:text-base placeholder:font-semibold"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">جنيه</span>
              {amountText && (
                <button
                  type="button"
                  onClick={() => { setAmountText(''); amountRef.current?.focus() }}
                  aria-label="مسح المبلغ"
                  className="absolute left-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto">
              {QUICK_ADD.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountText(String(Math.round((amt + v) * 100) / 100))}
                  className="shrink-0 flex-1 rounded-full border bg-background px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors hover:bg-muted/60"
                >
                  +{fmt(v)}
                </button>
              ))}
            </div>
            {amt >= 10000 && (
              <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-medium text-amber-700 dark:text-amber-300" role="status">
                <AlertTriangle className="size-3.5 shrink-0" />
                مبلغ كبير — اتأكد إن عدد الأصفار صح.
              </p>
            )}
          </div>

          {/* الملاحظة */}
          <div>
            <Label htmlFor="fin-note" className="sr-only">ملاحظة</Label>
            <Input
              id="fin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onEnter}
              placeholder="ملاحظة (اختياري) — اسم العميل أو رقم المحفظة"
              autoComplete="off"
              className="h-10 rounded-xl"
            />
          </div>

          {/* الإيصال: أثر الخزنة + العمولة في صف واحد */}
          <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-2xl border border-dashed bg-muted/30" aria-live="polite">
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-muted-foreground">أثر الخزنة</p>
              <p
                dir="ltr"
                className={cn(
                  'mt-0.5 text-right text-2xl font-black leading-tight tabular-nums',
                  amt <= 0 ? 'text-muted-foreground' : net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {amt > 0 ? sgn(net) : '—'}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                {amt > 0 ? `الخزنة هـ${net >= 0 ? 'تزيد' : 'تقل'} · ` : 'اكتب المبلغ عشان تشوف الأثر · '}
                العمولة النهائية بتتحسب على السيرفر
              </p>
            </div>
            <div className="relative flex min-w-[116px] flex-col justify-center border-s border-dashed p-3.5">
              <span aria-hidden className="absolute -top-2 start-0 size-4 -translate-x-1/2 rounded-full border bg-card rtl:translate-x-1/2" />
              <span aria-hidden className="absolute -bottom-2 start-0 size-4 -translate-x-1/2 rounded-full border bg-card rtl:translate-x-1/2" />
              <p className="text-[11px] font-medium text-muted-foreground">
                العمولة{rate != null && rate > 0 && <span className="ms-1 text-[10px]">({fmtRate(rate)}٪)</span>}
              </p>
              <p dir="ltr" className="mt-0.5 text-right text-lg font-extrabold tabular-nums text-teal-700 dark:text-teal-300">
                {commission == null ? '—' : commission > 0 ? sgn(commission) : '0'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center gap-2 border-t bg-muted/30 px-4 py-3 sm:justify-between sm:px-5">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="shrink-0">
            إلغاء
          </Button>
          <div className="flex min-w-0 flex-1 justify-end gap-2">
            <Button variant="outline" onClick={() => submit(true)} disabled={saving || !(amt > 0)} className="min-w-0 max-sm:flex-1">
              <Plus className="size-4 shrink-0" />
              <span className="truncate">حفظ وإضافة تانية</span>
            </Button>
            <Button
              onClick={() => submit(false)}
              disabled={saving || !(amt > 0)}
              className="min-w-0 border-0 font-bold text-white hover:opacity-95 max-sm:flex-1"
              style={{ background: ACCENT }}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              <span className="truncate">حفظ المعاملة</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
