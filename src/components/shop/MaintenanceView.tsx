'use client'

/**
 * الصيانة — هوية «بنش الورشة».
 * لوحة أدوات سلات غامقة (slate) + ليدات حالة (أزرق → كهرماني → أخضر → رمادي)
 * زي لمبات الجهاز على الترابيزة. اللون هنا معلومة مش زينة: كل مرحلة ليها ليد.
 * (مفيش بنفسجي، ومفيش أصفر ولا سماوي كهوية — دول لصفحات تانية.)
 *
 * الفكرة: الأمر = «تذكرة جهاز» عليها شريط ليدات بيوضّح وصل لفين،
 * وزر واحد كبير للخطوة الجاية (ابدأ الشغل ← خلّصت ← سلّم للعميل).
 * تبويبات المراحل فوق = فلتر + عدّاد، والبحث بيدوّر في كل الأوامر.
 *
 * ⚠️ الـ API والمنطق المالي زي ما هم: التسليم بيسجّل قيد خزنة مرة واحدة بس،
 * والحذف بيعكسه — عشان كده التسليم وإعادة الفتح والحذف بيطلبوا تأكيد.
 */

import * as React from 'react'
import {
  Check, CheckCircle2, Clock, Cpu, FileText, Gamepad2, Laptop, Loader2, MessageCircle,
  Monitor, PackageCheck, Pencil, Phone, Play, Plus, Search, Smartphone, Tablet, Trash2,
  Undo2, Wrench, X,
} from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency, formatArabicDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { printListReportHtml, openPrintWindow, printLtr } from '@/lib/print'
import { useShopStore } from '@/lib/store'
import { useConfirm } from './ConfirmDialogProvider'
import { useDataRefresh } from '@/lib/offline/data-events'

/* ───────────────────────── الأنواع والثوابت ───────────────────────── */

interface Order {
  id: number
  customerName: string
  phone: string | null
  device: string
  issue: string
  cost: number
  status: string
  receivedAt: string
  deliveredAt: string | null
}

const STAGES = [
  {
    key: 'مستلم',
    sub: 'مستنية دورها',
    verb: 'ابدأ الشغل',
    verbIcon: Play,
    led: 'bg-sky-400',
    glow: 'shadow-[0_0_10px_2px_rgba(56,189,248,.65)]',
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  {
    key: 'قيد العمل',
    sub: 'بتتصلّح دلوقتي',
    verb: 'خلّصت الصيانة',
    verbIcon: CheckCircle2,
    led: 'bg-amber-400',
    glow: 'shadow-[0_0_10px_2px_rgba(251,191,36,.65)]',
    chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  {
    key: 'مكتمل',
    sub: 'جاهزة وبتستنى العميل',
    verb: 'سلّم للعميل',
    verbIcon: PackageCheck,
    led: 'bg-emerald-500',
    glow: 'shadow-[0_0_10px_2px_rgba(16,185,129,.65)]',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  {
    key: 'مُسلَّم',
    sub: 'اتسلّمت للعميل',
    verb: '',
    verbIcon: Check,
    led: 'bg-slate-400',
    glow: 'shadow-[0_0_10px_2px_rgba(148,163,184,.55)]',
    chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  },
] as const

type StageKey = (typeof STAGES)[number]['key']
type Tab = 'active' | StageKey
type SortKey = 'recent' | 'oldest' | 'cost'

const DELIVERED: StageKey = 'مُسلَّم'
const READY: StageKey = 'مكتمل'
const STALE_DAYS = 7

const SORTS: { k: SortKey; label: string }[] = [
  { k: 'recent', label: 'الأحدث' },
  { k: 'oldest', label: 'الأقدم' },
  { k: 'cost', label: 'الأعلى تكلفة' },
]

const QUICK_FAULTS = [
  'شاشة مكسورة', 'بطارية', 'مشكلة شحن', 'سوفت وير / فورمات', 'دخلته مياه', 'مش بيفتح',
  'سماعة / مايك', 'كاميرا', 'بطء', 'كيبورد / تاتش باد', 'تسخين',
]

/* ───────────────────────── دوال مساعدة ───────────────────────── */

const stageIdx = (status: string) => Math.max(0, STAGES.findIndex((s) => s.key === status))

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
/** رقم بدون كلمة «جنيه» — الوحدة بتتعرض صغيرة جنبه */
const money = (n: number) => formatCurrency(n).replace(/\s*جنيه$/, '')
const orderNo = (id: number) => `#${String(id).padStart(4, '0')}`

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const daysBetween = (fromIso: string, to: Date = new Date()) =>
  Math.max(0, Math.round((dayStart(to) - dayStart(new Date(fromIso))) / 86400000))
const daysText = (d: number) =>
  d === 0 ? 'النهارده' : d === 1 ? 'من يوم' : d === 2 ? 'من يومين' : d <= 10 ? `من ${d} أيام` : `من ${d} يوم`
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' })

const isLate = (o: Order) => o.status !== DELIVERED && daysBetween(o.receivedAt) > STALE_DAYS

/** أيقونة الجهاز من اسمه (واجهة بس — مفيش حقل نوع في الداتا) */
type Kind = 'phone' | 'laptop' | 'tablet' | 'desktop' | 'console' | 'other'
function deviceKind(name: string): Kind {
  const t = name.toLowerCase()
  if (/ipad|ايباد|آيباد|tablet|تابلت|galaxy tab|\btab\b/.test(t)) return 'tablet'
  if (/لاب|laptop|notebook|macbook|ماك ?بوك|thinkpad|latitude|inspiron|probook|elitebook|vivobook|ideapad|zenbook|\bdell\b|\bhp\b|lenovo|لينوفو|ديل|اتش ?بي|asus|اسوس|\bacer\b|ايسر|\bmsi\b/.test(t)) return 'laptop'
  if (/playstation|\bps ?[345]\b|بلاي ?ستيشن|xbox|اكس ?بوكس|nintendo|switch|دراع|joystick/.test(t)) return 'console'
  if (/\bpc\b|كمبيوتر|كمبيوتر|desktop|ديسك ?توب|\bcase\b|كيس|شاشة|monitor|كارت شاشة|gpu|motherboard|ماذر|معالج|\bcpu\b|all.?in.?one/.test(t)) return 'desktop'
  if (/iphone|ايفون|آيفون|samsung|سامسونج|galaxy|xiaomi|شاومي|redmi|ريدمي|poco|oppo|اوبو|realme|ريلمي|vivo|فيفو|huawei|هواوي|honor|infinix|انفنكس|tecno|تكنو|nokia|نوكيا|موبايل|mobile|phone|pixel|oneplus|جوال|هاتف|itel|ايتل/.test(t)) return 'phone'
  return 'other'
}
const KIND_ICON: Record<Kind, React.ComponentType<{ className?: string }>> = {
  phone: Smartphone, laptop: Laptop, tablet: Tablet, desktop: Monitor, console: Gamepad2, other: Cpu,
}

/** رقم واتساب بصيغة دولية (مصر): 01012345678 → 201012345678. فاضي لو الرقم ناقص */
function waNumber(raw: string) {
  let d = digits(raw).replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '20' + d.slice(1)
  else if (d.length === 10 && d.startsWith('1')) d = '20' + d
  return d.length >= 11 ? d : ''
}

const ring = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-slate-500/40'

/* ───────────────────────── الصفحة ───────────────────────── */

export function MaintenanceView() {
  const confirm = useConfirm()
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Order | null>(null)
  const [busy, setBusy] = React.useState<number | null>(null)

  const [query, setQuery] = React.useState('')
  const [tab, setTab] = React.useState<Tab>('active')
  const [sort, setSort] = React.useState<SortKey>('recent')
  const [onlyLate, setOnlyLate] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api<Order[]>('/api/maintenance')
      if (Array.isArray(data)) setOrders(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل أوامر الصيانة')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  // 🛡️ ROOT FIX (2026-09-27): live refresh, see data-events.ts
  useDataRefresh(['maintenance'], () => load(true))

  // اختصار "/" للبحث
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === '/' && t && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  /* ── تغيير المرحلة (تفاؤلي) — التسليم وإعادة الفتح بيطلبوا تأكيد لأنهم بيلمسوا الخزنة ── */
  const goStage = async (o: Order, next: StageKey) => {
    if (busy === o.id || o.status === next) return
    if (next === DELIVERED) {
      const ok = await confirm({
        title: 'تسليم الجهاز للعميل؟',
        description:
          o.cost > 0
            ? `${o.device} — ${o.customerName}. هيتسجّل ${formatCurrency(o.cost)} في الخزنة.`
            : `${o.device} — ${o.customerName}. التكلفة صفر، فمش هيتسجّل مبلغ في الخزنة.`,
        confirmText: 'تأكيد التسليم',
        destructive: false,
      })
      if (!ok) return
    } else if (o.status === DELIVERED) {
      const ok = await confirm({
        title: 'إعادة فتح الأمر؟',
        description: `هيرجع "${next}". المبلغ اللي اتسجّل في الخزنة عند التسليم هيفضل مسجّل، ومش هيتكرر لو اتسلّم تاني.`,
        confirmText: 'إعادة فتح',
        destructive: false,
      })
      if (!ok) return
    }

    const before = orders
    setBusy(o.id)
    setOrders((p) =>
      p.map((x) =>
        x.id === o.id
          ? { ...x, status: next, deliveredAt: next === DELIVERED ? new Date().toISOString() : x.deliveredAt }
          : x
      )
    )
    try {
      await api(`/api/maintenance/${o.id}`, { method: 'PUT', body: { status: next } })
      toast.success(`${o.device}: ${next}`)
      load(true)
    } catch (e: any) {
      setOrders(before)
      toast.error(e?.message || 'فشل التغيير')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (o: Order) => {
    const ok = await confirm({
      title: `حذف أمر ${o.device}؟`,
      description: `${o.customerName} — ${orderNo(o.id)}. لو كان اتسجّل له مبلغ في الخزنة هيتعكس.`,
      confirmText: 'حذف الأمر',
    })
    if (!ok) return
    // ⚡ Optimistic
    const removed = orders.find((x) => x.id === o.id)
    setOrders((prev) => prev.filter((x) => x.id !== o.id))
    try {
      await api(`/api/maintenance/${o.id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      if (typeof navigator === 'undefined' || navigator.onLine) load(true)
    } catch (e: any) {
      if (e?.message?.includes('تم الحفظ') || e?.message?.includes('offline')) {
        toast.success('تم الحذف (offline — سيتم المزامنة لاحقاً)')
      } else {
        if (removed) setOrders((prev) => [removed, ...prev])
        toast.error(e?.message || 'فشل الحذف')
      }
    }
  }

  const exportPdf = () => {
    const totalCost = orders.reduce((s, o) => s + o.cost, 0)
    const pending = orders.filter((o) => o.status !== DELIVERED).length

    const html = printListReportHtml(
      {
        title: 'الصيانة',
        subtitle: 'أوامر استلام الأجهزة وإصلاحها',
        columns: [
          { header: '#' },
          { header: 'العميل', align: 'right' },
          { header: 'الهاتف' },
          { header: 'الجهاز', align: 'right' },
          { header: 'العطل', align: 'right' },
          { header: 'الحالة' },
          { header: 'التكلفة' },
          { header: 'تاريخ الاستلام' },
          { header: 'تاريخ التسليم' },
        ],
        rows: orders.map((o, i) => [
          String(i + 1),
          o.customerName,
          o.phone ?? '—',
          o.device,
          o.issue || '—',
          o.status,
          formatCurrency(o.cost),
          printLtr(formatArabicDateTime(o.receivedAt)),
          o.deliveredAt ? printLtr(formatArabicDateTime(o.deliveredAt)) : '—',
        ]),
        kpis: [
          { label: 'إجمالي أوامر الصيانة', value: String(orders.length) },
          { label: 'قيد التنفيذ / لم تُسلَّم', value: String(pending) },
          { label: 'إجمالي التكلفة', value: formatCurrency(totalCost), emphasize: true },
        ],
        emptyMessage: 'لا توجد أوامر صيانة',
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

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (o: Order) => {
    setEditing(o)
    setDialogOpen(true)
  }

  // 🆕 2026-10-20: جاي من الداشبورد بـ ?new=1 → افتح أمر صيانة جديد على طول (نفس نمط ?new=1 في المنتجات)
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('new') === '1') {
        url.searchParams.delete('new')
        window.history.replaceState(null, '', url.pathname + url.search)
        setEditing(null)
        setDialogOpen(true)
      }
    } catch { /* ignore */ }
  }, [])

  /* ───── البيانات المشتقة ───── */

  const stats = React.useMemo(() => {
    const counts: Record<StageKey, number> = { 'مستلم': 0, 'قيد العمل': 0, 'مكتمل': 0, 'مُسلَّم': 0 }
    let readyAmount = 0
    let late = 0
    let monthAmount = 0
    let monthCount = 0
    const now = new Date()
    for (const o of orders) {
      const k = (STAGES.some((s) => s.key === o.status) ? o.status : 'مستلم') as StageKey
      counts[k] += 1
      if (k === READY) readyAmount += o.cost
      if (isLate(o)) late += 1
      if (k === DELIVERED && o.deliveredAt) {
        const d = new Date(o.deliveredAt)
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          monthAmount += o.cost
          monthCount += 1
        }
      }
    }
    const active = counts['مستلم'] + counts['قيد العمل'] + counts['مكتمل']
    return { counts, active, readyAmount, late, monthAmount, monthCount }
  }, [orders])

  const q = query.trim().toLowerCase()
  const qDigits = digits(q).replace(/\D/g, '')

  const visible = React.useMemo(() => {
    let list: Order[]
    if (q) {
      // البحث بيدوّر في كل الأوامر بغض النظر عن التبويب
      list = orders.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          o.device.toLowerCase().includes(q) ||
          (o.issue ?? '').toLowerCase().includes(q) ||
          orderNo(o.id).includes(q) ||
          String(o.id) === q.replace('#', '') ||
          (qDigits.length >= 3 && digits(o.phone ?? '').replace(/\D/g, '').includes(qDigits))
      )
    } else if (tab === 'active') {
      list = orders.filter((o) => o.status !== DELIVERED)
    } else {
      list = orders.filter((o) => o.status === tab)
    }
    if (onlyLate) list = list.filter(isLate)
    const t = (o: Order) => new Date(o.receivedAt).getTime()
    return [...list].sort((a, b) =>
      sort === 'oldest' ? t(a) - t(b) : sort === 'cost' ? b.cost - a.cost || t(b) - t(a) : t(b) - t(a)
    )
  }, [orders, q, qDigits, tab, sort, onlyLate])

  const tabs: { key: Tab; label: string; count: number; led: string; glow: string }[] = [
    { key: 'active', label: 'في الورشة', count: stats.active, led: 'bg-slate-100', glow: 'shadow-[0_0_10px_2px_rgba(241,245,249,.45)]' },
    ...STAGES.map((s) => ({ key: s.key as Tab, label: s.key, count: stats.counts[s.key], led: s.led, glow: s.glow })),
  ]

  const chooseTab = (t: Tab) => {
    setTab(t)
    setQuery('')
  }

  /* ───────────────────────── الواجهة ───────────────────────── */

  return (
    <div className="space-y-4">
      {/* ═════════ لوحة الورشة: عنوان + أرقام + مراحل ═════════ */}
      <section
        className="animate-in-up relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-50 shadow-sm motion-reduce:animate-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(148,163,184,.14) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        {/* شريط الليدات: أزرق ← كهرماني ← أخضر ← رمادي (بنفس ترتيب المراحل من اليمين) */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(to_left,#38bdf8,#fbbf24,#10b981,#94a3b8)]"
        />

        <div className="flex flex-wrap items-stretch">
          {/* 📱 موبايل: العميل + الزر تحت (كل واحد بعرض كامل) — من sm+ وفوق: صف واحد */}
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 p-4 sm:w-auto sm:min-w-[260px] sm:flex-1 sm:flex-nowrap sm:gap-3.5 sm:p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:size-12">
              <Wrench className="size-5 sm:size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-extrabold leading-tight sm:text-xl">الصيانة</h1>
              <p className="mt-0.5 text-[11px] font-medium text-slate-300 sm:text-xs">
                {loading ? 'جارٍ التحميل…' : `${num(stats.active)} جهاز في الورشة دلوقتي`}
              </p>
            </div>
            <Button
              onClick={openNew}
              className="h-10 w-full shrink-0 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 hover:bg-slate-100 sm:h-11 sm:w-auto"
            >
              <Plus className="size-4" />
              استلام جهاز
            </Button>
          </div>

          <div className="grid w-full grid-cols-3 divide-x divide-dashed divide-white/15 border-t border-dashed border-white/15 rtl:divide-x-reverse lg:w-auto lg:min-w-[560px] lg:border-s lg:border-t-0">
            <Kpi
              label="مستنية العميل"
              value={money(stats.readyAmount)}
              unit="جنيه"
              sub={`${num(stats.counts[READY])} جهاز جاهز للتسليم`}
              tone={stats.readyAmount > 0 ? 'ready' : undefined}
              dim={stats.readyAmount === 0}
            />
            <Kpi
              label="اتحصّل الشهر ده"
              value={money(stats.monthAmount)}
              unit="جنيه"
              sub={`${num(stats.monthCount)} جهاز اتسلّم`}
              dim={stats.monthAmount === 0}
            />
            <Kpi
              label={`متأخرة +${STALE_DAYS} أيام`}
              value={String(stats.late)}
              unit="جهاز"
              sub={stats.late > 0 ? 'محتاجة متابعة — اضغط للعرض' : 'مفيش تأخير'}
              tone={stats.late > 0 ? 'late' : undefined}
              onClick={
                stats.late > 0
                  ? () => {
                      setOnlyLate((v) => !v)
                      if (tab === DELIVERED) setTab('active')
                    }
                  : undefined
              }
              pressed={onlyLate}
            />
          </div>
        </div>

        {/* المراحل — فلتر وعدّاد
            📱 موبايل: «في الورشة» بعرض كامل (الفيلتر الأشمل)، والمراحل الـ4 في شبكة 2×2
            🖥️ sm+ وفوق: كل التبويبات في صف واحد زي الأصل */}
        <div
          className="grid grid-cols-2 gap-1 border-t border-white/10 p-1.5 sm:flex sm:gap-1"
          role="tablist"
          aria-label="مراحل الصيانة"
        >
          {tabs.map((t, i) => {
            const on = !q && tab === t.key
            const isOverview = i === 0 // «في الورشة»
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => chooseTab(t.key)}
                className={cn(
                  'relative flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:flex-1 sm:gap-2.5 sm:rounded-xl sm:px-3 sm:py-2.5',
                  // «في الورشة» بعرض كامل على الموبايل
                  isOverview && 'col-span-2 sm:col-span-1',
                  on ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2 shrink-0 rounded-full ring-2 ring-white/10 sm:size-3',
                    t.led,
                    t.count > 0 ? t.glow : 'opacity-30'
                  )}
                />
                <span className="truncate text-[12px] font-bold sm:text-[13px]">{t.label}</span>
                <span
                  className={cn(
                    'min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-extrabold leading-none tabular-nums sm:min-w-[1.75rem] sm:px-2 sm:text-sm',
                    t.count > 0 ? (on ? 'bg-white text-slate-950' : 'bg-white/15 text-white') : 'bg-white/5 text-slate-500'
                  )}
                >
                  {t.count}
                </span>
                {on && (
                  <span
                    aria-hidden
                    className={cn('absolute inset-x-2 bottom-0 h-[3px] rounded-full sm:inset-x-4', t.led)}
                  />
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ═════════ شريط البحث والترتيب ═════════ */}
      {/* 📱 موبايل: 2×2 — من sm+ وفوق: صف أفقي زي الأصل */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2.5 sm:flex sm:flex-wrap sm:items-center">
        <label className="relative col-span-2 flex h-10 w-full min-w-0 items-center rounded-xl border bg-background transition-shadow focus-within:border-slate-500 focus-within:ring-[3px] focus-within:ring-slate-500/25 sm:col-span-1 sm:min-w-[240px] sm:flex-1">
          <Search className="pointer-events-none absolute start-3.5 size-4 text-foreground/60" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العميل أو الجهاز أو العطل…"
            aria-label="بحث في أوامر الصيانة"
            className="h-full w-full bg-transparent pe-10 text-sm outline-none placeholder:text-muted-foreground/80"
            style={{ paddingInlineStart: '2.75rem' }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="مسح البحث"
              className="absolute end-2.5 flex size-6 items-center justify-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute end-3 hidden rounded-md border bg-muted px-1.5 text-[11px] text-foreground/60 sm:block">/</kbd>
          )}
        </label>

        {/* ترتيب — بعرض كامل على الموبايل، الأزرار جواه بتتوزّع */}
        <div
          className="col-span-2 flex h-10 items-center gap-0.5 rounded-xl border bg-background p-1 sm:col-span-1 sm:w-auto"
          role="group"
          aria-label="ترتيب الأوامر"
        >
          {SORTS.map((s) => (
            <button
              key={s.k}
              type="button"
              onClick={() => setSort(s.k)}
              aria-pressed={sort === s.k}
              className={cn(
                'h-8 flex-1 rounded-lg px-2.5 text-xs font-bold transition-colors sm:flex-initial sm:px-3',
                ring,
                sort === s.k
                  ? 'bg-slate-950 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                  : 'text-foreground/65 hover:bg-muted hover:text-foreground'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* متأخرة — نصف عرض على الموبايل */}
        <button
          type="button"
          onClick={() => setOnlyLate((v) => !v)}
          aria-pressed={onlyLate}
          className={cn(
            'col-span-1 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors sm:w-auto sm:justify-start',
            ring,
            onlyLate
              ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300'
              : 'bg-background text-foreground/65 hover:bg-muted hover:text-foreground'
          )}
        >
          <Clock className="size-3.5" />
          متأخرة +{STALE_DAYS}
        </button>

        {/* PDF — نصف عرض على الموبايل */}
        <Button
          variant="outline"
          className="col-span-1 h-10 w-full rounded-xl sm:w-auto"
          onClick={exportPdf}
          disabled={loading || orders.length === 0}
        >
          <FileText className="size-4" />
          PDF
        </Button>
      </div>

      {q && !loading && (
        <p className="px-1 text-xs font-medium text-foreground/65">
          {visible.length > 0
            ? `${num(visible.length)} نتيجة في كل الأوامر (بما فيها اللي اتسلّمت)`
            : 'مفيش نتايج — جرّب اسم تاني أو جزء من رقم التليفون'}
        </p>
      )}

      {/* ═════════ التذاكر ═════════ */}
      <div className="@container">
        {loading ? (
          <div className="grid gap-3 @2xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[230px] w-full rounded-2xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Empty
            noOrders={orders.length === 0}
            tab={tab}
            hasQuery={!!q}
            showReset={!!q || tab !== 'active' || onlyLate}
            onNew={openNew}
            onReset={() => {
              setQuery('')
              setOnlyLate(false)
              setTab('active')
            }}
          />
        ) : (
          <ul className="grid gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
            {visible.map((o) => (
              <li key={o.id}>
                <Ticket
                  o={o}
                  busy={busy === o.id}
                  shopName={shopName}
                  onGo={(next) => goStage(o, next)}
                  onEdit={() => openEdit(o)}
                  onDelete={() => remove(o)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <OrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        orders={orders}
        onSaved={() => load(true)}
      />
    </div>
  )
}

/* ───────────────────────── رقم في لوحة الورشة ───────────────────────── */

function Kpi({
  label, value, unit, sub, tone, onClick, pressed, dim,
}: {
  label: string
  value: string
  unit: string
  sub?: string
  tone?: 'ready' | 'late'
  onClick?: () => void
  pressed?: boolean
  dim?: boolean
}) {
  const body = (
    <>
      <p className="truncate text-[10px] font-bold text-slate-300 sm:text-[11px]">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-extrabold leading-none tabular-nums sm:text-xl md:text-2xl',
          tone === 'ready' && 'text-emerald-300',
          tone === 'late' && 'text-amber-300',
          dim && 'text-slate-400'
        )}
      >
        {value}
        <span className="ms-1 text-[10px] font-semibold text-slate-400 sm:text-xs">{unit}</span>
      </p>
      {sub && <p className="mt-1.5 hidden truncate text-[11px] font-medium text-slate-400 sm:block">{sub}</p>}
    </>
  )
  const cls = 'flex min-w-0 flex-col justify-center px-2.5 py-3 text-start sm:px-5 sm:py-3.5'
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(cls, 'transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50', pressed && 'bg-white/10')}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ───────────────────────── تذكرة الجهاز ───────────────────────── */

function Ticket({
  o, busy, shopName, onGo, onEdit, onDelete,
}: {
  o: Order
  busy: boolean
  shopName: string
  onGo: (next: StageKey) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const idx = stageIdx(o.status)
  const stage = STAGES[idx]
  const next = idx < STAGES.length - 1 ? STAGES[idx + 1] : null
  const prev = idx > 0 ? STAGES[idx - 1] : null
  const delivered = o.status === DELIVERED
  const ready = o.status === READY
  const Icon = KIND_ICON[deviceKind(o.device)]
  const age = daysBetween(o.receivedAt)
  const late = !delivered && age > STALE_DAYS
  const inShop = o.deliveredAt ? daysBetween(o.receivedAt, new Date(o.deliveredAt)) : 0
  const wa = o.phone ? waNumber(o.phone) : ''
  const waText = ready
    ? `أهلاً ${o.customerName} 👋\nجهازك (${o.device}) جاهز للاستلام من ${shopName}.${o.cost > 0 ? `\nالتكلفة: ${formatCurrency(o.cost)}` : ''}`
    : `أهلاً ${o.customerName}، بخصوص جهازك (${o.device}) عندنا في ${shopName}.`
  const VerbIcon = STAGES[idx].verbIcon
  const verbLabel = STAGES[idx].verb

  // 📱 أزرار الإجراءات أصغر على الموبايل — 5 أزرار × 32px = 160px مش 200px
  // في الكروت المُسلَّمة، بنستخدم أبيض/سلات صريح عشان يبانوا فوق الخلفية الرمادية
  const iconBtn = cn(
    'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors sm:size-9 sm:rounded-xl',
    ring,
    delivered
      ? 'border-slate-300/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100'
      : 'border-border bg-background text-foreground/70 hover:bg-muted hover:text-foreground'
  )

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-2xl border transition-shadow hover:shadow-md motion-reduce:transition-none',
        // 📦 «مُسلَّم»: لون صلب (مش شفاف) عشان ميتلخبطش مع لون الصفحة،
        // وبوردر أوضح عشان يبان مختلف عن باقي الكروت
        delivered
          ? 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900'
          : 'border-border bg-card',
        ready && 'border-emerald-500/40 bg-emerald-500/[0.035] dark:bg-emerald-500/[0.06]'
      )}
    >
      {/* ختم «اتسلّم» شفاف في الخلفية للكروت المسلّمة — بيدّي إحساس «خلص وانتهى» */}
      {delivered && (
        <span
          aria-hidden
          className="pointer-events-none absolute -end-4 -top-4 flex size-24 rotate-12 items-center justify-center text-slate-700/[0.09] dark:text-slate-100/[0.07]"
        >
          <PackageCheck className="size-full" strokeWidth={1.25} />
        </span>
      )}

      {/* شريط الليدات: وصل لفين */}
      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {STAGES.map((s, i) => (
          <span key={s.key} className={cn('h-1 flex-1 rounded-full', i <= idx ? s.led : 'bg-border', delivered && i <= idx && 'opacity-70')} />
        ))}
      </div>

      <div className="relative p-3.5 pt-3 sm:p-4 sm:pt-3">
        {/* الجهاز + العميل */}
        <div className="flex items-start gap-2.5 sm:gap-3">
          <span
            className={cn(
              'relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-slate-50 sm:size-12 dark:bg-slate-800',
              delivered && 'opacity-55'
            )}
          >
            <Icon className="size-5 sm:size-6" />
            <span aria-hidden className={cn('absolute -end-1 -top-1 size-3 rounded-full ring-2 ring-card', stage.led)} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={cn('truncate text-sm font-extrabold leading-snug sm:text-[15px]', delivered && 'text-foreground/80')} title={o.device}>
              {o.device}
            </h3>
            <p className={cn('truncate text-[12px] font-semibold leading-snug text-foreground/85 sm:text-[13px]', delivered && 'text-foreground/70')}>
              {o.customerName}
            </p>
            <p className={cn('text-[11px] font-medium tabular-nums text-foreground/60 sm:text-xs', delivered && 'text-foreground/50')}>
              {o.phone ? <bdi dir="ltr">{o.phone}</bdi> : 'بدون رقم تليفون'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:gap-1.5">
            <span dir="ltr" className={cn('font-mono text-[10px] font-bold tracking-wider text-foreground/55 sm:text-[11px]', delivered && 'text-foreground/40')}>
              {orderNo(o.id)}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold sm:px-2.5 sm:text-[11px]', stage.chip, delivered && 'opacity-75')}>
              {stage.key}
            </span>
          </div>
        </div>

        {/* العطل */}
        <div
          className={cn(
            'mt-3 flex min-h-[2.5rem] items-start gap-2 rounded-xl border border-dashed bg-muted/40 px-2.5 py-2 sm:min-h-[2.75rem] sm:px-3',
            delivered && 'border-border/60 bg-white/60 dark:bg-slate-800/40'
          )}
          title={o.issue || undefined}
        >
          <Wrench className="mt-0.5 size-3.5 shrink-0 text-foreground/45" aria-hidden />
          <p className={cn('line-clamp-2 text-[12px] leading-relaxed sm:text-[12.5px]', o.issue ? 'text-foreground/80' : 'italic text-foreground/50', delivered && 'text-foreground/65')}>
            {o.issue || 'من غير وصف للعطل'}
          </p>
        </div>

        {/* العمر + التكلفة */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className={cn('min-w-0 text-[11px] font-medium text-foreground/65 sm:text-xs', delivered && 'text-foreground/55')}>
            {delivered ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-slate-500" aria-hidden />
                <span className="truncate" title={o.deliveredAt ? formatArabicDateTime(o.deliveredAt) : undefined}>
                  اتسلّم {o.deliveredAt ? shortDate(o.deliveredAt) : ''} · بعد {inShop === 0 ? 'أقل من يوم' : inShop === 1 ? 'يوم' : `${inShop} يوم`}
                </span>
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
                  late ? 'bg-amber-500/15 font-bold text-amber-800 dark:text-amber-300' : ''
                )}
                title={formatArabicDateTime(o.receivedAt)}
              >
                <Clock className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{ready ? 'مستنية العميل' : 'في الورشة'} {daysText(age)}</span>
              </span>
            )}
          </div>
          {o.cost > 0 ? (
            <p className={cn('shrink-0 text-base font-extrabold leading-none tabular-nums sm:text-lg', delivered && 'text-foreground/75')}>
              {money(o.cost)}
              <span className={cn('ms-1 text-[10px] font-semibold text-foreground/55 sm:text-[11px]', delivered && 'text-foreground/45')}>جنيه</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              className={cn('shrink-0 rounded-full border border-dashed border-amber-500/70 px-2 py-1 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-500/10 sm:px-2.5 sm:text-[11px] dark:text-amber-300', ring)}
            >
              لسه متسعّرش
            </button>
          )}
        </div>

        {/* ════════ الإجراءات ════════
            📱 موبايل: صفّين — (زر التقدّم + الرجوع) فوق، والأيقونات الثانوية تحت
            🖥️ sm+: صف واحد زي الأصل */}
        <div className="mt-3 space-y-2 border-t pt-3 sm:mt-3.5 sm:flex sm:items-center sm:gap-1.5 sm:space-y-0 sm:pt-3.5">
          {/* ─── صف 1: زر التقدّم + زر الرجوع ─── */}
          <div className="flex items-center gap-1.5 sm:min-w-0 sm:flex-1 sm:basis-[200px]">
            {next && VerbIcon ? (
              <Button
                onClick={() => onGo(next.key)}
                disabled={busy}
                className={cn(
                  'h-9 min-w-0 flex-1 rounded-lg px-3 text-[13px] font-bold sm:rounded-xl',
                  ready
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-950 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
                )}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <VerbIcon className="size-4" />}
                <span className="truncate">{verbLabel}</span>
              </Button>
            ) : (
              <span className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-400/50 text-xs font-bold text-slate-500 sm:justify-start sm:border-0 sm:px-0 dark:border-slate-600/60 dark:text-slate-400">
                <PackageCheck className="size-4 shrink-0" aria-hidden />
                الأمر مقفول
              </span>
            )}

            {prev && (
              <button
                type="button"
                onClick={() => onGo(prev.key)}
                disabled={busy}
                className={cn(iconBtn, 'shrink-0 disabled:opacity-50')}
                title={delivered ? 'إعادة فتح الأمر' : `رجوع إلى "${prev.key}"`}
                aria-label={delivered ? 'إعادة فتح الأمر' : `رجوع إلى ${prev.key}`}
              >
                <Undo2 className="size-3.5 sm:size-4" />
              </button>
            )}
          </div>

          {/* ─── صف 2: الأيقونات الثانوية — على الطرف على الموبايل ─── */}
          <div className="flex items-center gap-1 sm:ms-auto sm:shrink-0">
            {o.phone && (
              <a href={`tel:${o.phone}`} className={iconBtn} title="اتصال بالعميل" aria-label={`اتصال بـ ${o.customerName}`}>
                <Phone className="size-3.5 sm:size-4" />
              </a>
            )}
            {wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(iconBtn, 'hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300')}
                title="رسالة واتساب"
                aria-label={`واتساب ${o.customerName}`}
              >
                <MessageCircle className="size-3.5 sm:size-4" />
              </a>
            )}
            <button type="button" onClick={onEdit} className={iconBtn} title="تعديل" aria-label="تعديل الأمر">
              <Pencil className="size-3.5 sm:size-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className={cn(iconBtn, 'hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300')}
              title="حذف"
              aria-label="حذف الأمر"
            >
              <Trash2 className="size-3.5 sm:size-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

/* ───────────────────────── حالات فاضية ───────────────────────── */

function Empty({
  noOrders, tab, hasQuery, showReset, onNew, onReset,
}: {
  noOrders: boolean
  tab: Tab
  hasQuery: boolean
  showReset: boolean
  onNew: () => void
  onReset: () => void
}) {
  const msg: Record<Tab, string> = {
    active: 'مفيش أجهزة في الورشة دلوقتي',
    'مستلم': 'مفيش أجهزة مستنية دورها',
    'قيد العمل': 'مفيش أجهزة بتتصلّح دلوقتي',
    'مكتمل': 'مفيش أجهزة جاهزة مستنية عميل',
    'مُسلَّم': 'لسه مفيش أجهزة اتسلّمت',
  }
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center sm:p-10">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-950 text-slate-50 dark:bg-slate-800">
        <Wrench className="size-7" />
      </span>
      <p className="mt-4 text-base font-extrabold">
        {noOrders ? 'الورشة فاضية' : hasQuery ? 'مفيش نتايج للبحث ده' : msg[tab]}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-foreground/65">
        {noOrders
          ? 'أول جهاز تستلمه هيظهر هنا على شكل تذكرة تتابعها لحد التسليم.'
          : !showReset
            ? 'كل الأجهزة اتسلّمت — هتلاقيها في تبويب «مُسلَّم».'
            : 'غيّر التبويب أو امسح البحث والفلاتر.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onNew} className="rounded-xl bg-slate-950 font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950">
          <Plus className="size-4" />
          استلام جهاز
        </Button>
        {!noOrders && showReset && (
          <Button variant="outline" onClick={onReset} className="rounded-xl">
            عرض اللي في الورشة
          </Button>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── دايلوج استلام / تعديل ───────────────────────── */

interface OrderDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: Order | null
  orders: Order[]
  onSaved: () => void
}

const fieldCls =
  'h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-slate-500 focus:ring-[3px] focus:ring-slate-500/25'

function OrderDialog({ open, onOpenChange, initial, orders, onSaved }: OrderDialogProps) {
  const [customerName, setCustomerName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [device, setDevice] = React.useState('')
  const [issue, setIssue] = React.useState('')
  const [cost, setCost] = React.useState('0')
  const [saving, setSaving] = React.useState(false)
  const [tried, setTried] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setCustomerName(initial?.customerName ?? '')
      setPhone(initial?.phone ?? '')
      setDevice(initial?.device ?? '')
      setIssue(initial?.issue ?? '')
      setCost(initial ? String(initial.cost) : '0')
      setTried(false)
    }
  }, [open, initial])

  // اقتراحات من الأوامر السابقة (واجهة فقط)
  const deviceSuggestions = React.useMemo(
    () => Array.from(new Set(orders.map((o) => o.device.trim()).filter(Boolean))).slice(0, 40),
    [orders]
  )
  const known = React.useMemo(() => {
    const p = digits(phone).replace(/\D/g, '')
    if (p.length < 8) return null
    const hits = orders.filter((o) => digits(o.phone ?? '').replace(/\D/g, '') === p)
    return hits.length ? { name: hits[0].customerName, n: hits.length } : null
  }, [phone, orders])

  const Icon = KIND_ICON[deviceKind(device)]
  const nameBad = tried && !customerName.trim()
  const deviceBad = tried && !device.trim()
  const costNum = parseFloat(digits(cost).replace(/[^0-9.]/g, '')) || 0

  const toggleFault = (f: string) => {
    setIssue((cur) => {
      if (cur.includes(f)) {
        return cur
          .replace(new RegExp(`(،\\s*)?${f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`), '')
          .replace(/^،\s*/, '')
          .trim()
      }
      return cur.trim() ? `${cur.trim()}، ${f}` : f
    })
  }

  const submit = async () => {
    setTried(true)
    if (!customerName.trim()) {
      toast.error('اسم العميل مطلوب')
      return
    }
    if (!device.trim()) {
      toast.error('الجهاز مطلوب')
      return
    }
    setSaving(true)
    try {
      const payload = {
        customerName: customerName.trim(),
        phone: phone.trim() || null,
        device: device.trim(),
        issue: issue.trim(),
        cost: costNum,
      }
      if (initial) {
        await api(`/api/maintenance/${initial.id}`, { method: 'PUT', body: payload })
        toast.success('تم تحديث أمر الصيانة')
      } else {
        await api('/api/maintenance', { method: 'POST', body: payload })
        toast.success('تمت إضافة أمر الصيانة')
      }
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
      <DialogContent mobileSheet className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader
          className="relative shrink-0 gap-0 bg-slate-950 px-4 pb-5 pt-4 text-start text-slate-50 sm:px-6 sm:pt-5"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,.14) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="flex items-center gap-3 sm:gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:size-11">
              <Wrench className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-extrabold leading-tight text-slate-50 sm:text-lg">
                {initial ? 'تعديل أمر صيانة' : 'استلام جهاز'}
                {initial && (
                  <span dir="ltr" className="rounded-lg bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-slate-200 ring-1 ring-white/15 sm:text-xs">
                    {orderNo(initial.id)}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[11px] font-medium leading-relaxed text-slate-300 sm:text-xs">
                {initial
                  ? 'عدّل البيانات — المرحلة بتتغيّر من التذكرة نفسها.'
                  : 'سجّل الجهاز وهيظهر في «مستلم» لحد ما تبدأ الشغل.'}
              </DialogDescription>
            </div>
            <DialogClose className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-100 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              <X className="size-4" />
              <span className="sr-only">إغلاق</span>
            </DialogClose>
          </div>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(to_left,#38bdf8,#fbbf24,#10b981,#94a3b8)]"
          />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
          {/* 1) العميل */}
          <section>
            <Title n={1}>العميل</Title>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="o-customer" className="block text-xs font-bold">
                  الاسم <span className="text-rose-600">*</span>
                </label>
                <input
                  id="o-customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  aria-invalid={nameBad || undefined}
                  className={cn(fieldCls, nameBad && 'border-rose-500 ring-[3px] ring-rose-500/20')}
                  autoFocus={!initial}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="o-phone" className="block text-xs font-bold">التليفون</label>
                <input
                  id="o-phone"
                  dir="ltr"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="اختياري"
                  className={cn(fieldCls, 'text-left tabular-nums')}
                />
              </div>
            </div>
            {known && known.name.trim() !== customerName.trim() && (
              <button
                type="button"
                onClick={() => setCustomerName(known.name)}
                className={cn(
                  'mt-2.5 inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-bold text-foreground/80 transition-colors hover:bg-muted',
                  ring
                )}
              >
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                <span className="truncate">عميل سابق: {known.name} ({known.n} {known.n === 1 ? 'أمر' : 'أوامر'}) — استخدم الاسم</span>
              </button>
            )}
          </section>

          {/* 2) الجهاز */}
          <section>
            <Title n={2}>الجهاز</Title>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-slate-50 transition-colors dark:bg-slate-800">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="o-device" className="sr-only">الجهاز</label>
                <input
                  id="o-device"
                  list="maint-devices"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="مثال: آيفون 13 / لاب توب Dell"
                  aria-invalid={deviceBad || undefined}
                  className={cn(fieldCls, deviceBad && 'border-rose-500 ring-[3px] ring-rose-500/20')}
                />
                <datalist id="maint-devices">
                  {deviceSuggestions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          {/* 3) العطل */}
          <section>
            <Title n={3}>العطل / الملاحظات</Title>
            <div className="mb-2.5 flex flex-wrap gap-1.5" role="group" aria-label="أعطال شائعة">
              {QUICK_FAULTS.map((f) => {
                const on = issue.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFault(f)}
                    aria-pressed={on}
                    className={cn(
                      'h-8 rounded-full border px-2.5 text-[11px] font-bold transition-colors sm:px-3 sm:text-xs',
                      ring,
                      on
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                        : 'bg-background text-foreground/75 hover:bg-muted'
                    )}
                  >
                    {f}
                  </button>
                )
              })}
            </div>
            <textarea
              id="o-issue"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={3}
              aria-label="العطل والملاحظات"
              placeholder="اكتب تفاصيل أكتر: حالة الجهاز، الإكسسوارات المستلمة، كلمة السر…"
              className="w-full resize-none rounded-xl border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-slate-500 focus:ring-[3px] focus:ring-slate-500/25"
            />
          </section>

          {/* 4) التكلفة */}
          <section>
            <Title n={4}>التكلفة المتوقعة</Title>
            <div className="relative">
              <input
                id="o-cost"
                dir="ltr"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="التكلفة المتوقعة"
                className={cn(fieldCls, 'pl-3 pr-14 text-left text-base font-extrabold tabular-nums')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-foreground/55">جنيه</span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {[50, 100, 200].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCost(String(costNum + n))}
                  className={cn('h-8 rounded-full border bg-background px-3 text-xs font-bold tabular-nums text-foreground/80 transition-colors hover:bg-muted', ring)}
                >
                  +{n}
                </button>
              ))}
              {costNum > 0 && (
                <button
                  type="button"
                  onClick={() => setCost('0')}
                  className={cn('h-8 rounded-full px-3 text-xs font-bold text-foreground/60 transition-colors hover:bg-muted hover:text-foreground', ring)}
                >
                  تصفير
                </button>
              )}
            </div>
            <p className="mt-2.5 text-xs font-medium leading-relaxed text-foreground/65">
              المبلغ بيتسجّل في الخزنة وقت تسليم الجهاز للعميل. تقدر تسيبه صفر وتسعّره بعدين.
            </p>
          </section>
        </div>

        {/* 📱 موبايل: التكلفة فوق، الأزرار جنب بعض تحت — من sm+ وفوق: صف أفقي واحد */}
        <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 sm:flex-1">
              <p className="text-[11px] font-semibold text-foreground/60">التكلفة المتوقعة</p>
              <p className="truncate text-lg font-extrabold tabular-nums">{formatCurrency(costNum)}</p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="h-11 flex-1 rounded-xl px-4 sm:flex-none sm:px-5"
              >
                إلغاء
              </Button>
              <Button
                onClick={submit}
                disabled={saving}
                className="h-11 flex-1 rounded-xl bg-slate-950 px-4 font-bold text-white hover:bg-slate-800 sm:flex-none sm:px-6 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                <span className="truncate">{initial ? 'حفظ التعديل' : 'تسجيل الاستلام'}</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Title({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-sm font-extrabold">
      <span className="flex size-6 items-center justify-center rounded-full bg-slate-950 text-xs font-extrabold text-white dark:bg-slate-100 dark:text-slate-950">
        {n}
      </span>
      {children}
    </h3>
  )
}