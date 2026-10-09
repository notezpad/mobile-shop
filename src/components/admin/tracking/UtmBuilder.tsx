'use client'

/**
 * ═══════════════════════════════════════════════════════════════════
 *  🔗 روابط الحملات — UTM Builder + مكتبة الحملات  (Design 2026)
 * ═══════════════════════════════════════════════════════════════════
 *  لغة التصميم: Bento Modern بنفس tokens التطبيق (Emerald Premium)
 *   • هيرو بتدرّج Aurora ناعم + شبكة نقاط مقنّعة
 *   • بطاقات KPI على شبكة Bento + شريط توزيع الإيراد حسب المنصة
 *   • الباني بخطوات مرقّمة + منتقي منصة بالبطاقات (radiogroup)
 *   • معاينة حيّة لاصقة (sticky) تُلوِّن أجزاء الرابط (Syntax-highlighted URL)
 *   • مكتبة الروابط كقائمة صفوف غنية بدل الجدول (تعمل بنفس التخطيط على الجوال)
 *   • كل الألوان من tokens (primary / chart-* / success / warning / destructive)
 *     → يدعم الوضع الداكن تلقائياً بلا أي ألوان ثابتة
 *
 *  🔒 كل عقود API ومنطق البناء محفوظ حرفياً:
 *   GET/POST /api/admin/tracking/utm · PUT/DELETE /api/admin/tracking/utm/:id
 *   buildUtmUrl · getSuggestions · getMacros · toCsv · منطق touchedSM والتعديل
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Facebook, Chrome, Music2, Link2, Search, Download, Pencil, Trash2,
  Archive, ArchiveRestore, Copy, Check, Loader2, AlertTriangle, XCircle,
  Plus, ChevronDown, Sparkles, UserPlus, ShoppingBag, Wallet, Inbox,
} from 'lucide-react'
import {
  buildUtmUrl, getSuggestions, getMacros, toCsv, UtmPlatform,
} from '@/lib/tracking/utm'
import { fetchJson, fmtPct100 } from './shared'
import { cn } from '@/lib/utils'

// ─── الأنواع (توافق حرفي مع استجابة API) ─────────────────────────────

interface CampaignRow {
  id: number
  name: string
  platform: string
  destinationUrl: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
  utmId: string | null
  fullUrl: string
  archived: boolean
  createdAt: string
}

interface LibraryData {
  campaigns: CampaignRow[]
  performance: Record<string, { registrations: number; purchases: number; revenue: number }>
  tablesReady: boolean
}

type Perf = { registrations: number; purchases: number; revenue: number }
type MacroTarget = 'content' | 'term' | 'campaign' | 'utmId' | 'source'

const PLATFORMS: { key: UtmPlatform; label: string }[] = [
  { key: 'meta', label: 'Meta (Facebook / Instagram)' },
  { key: 'google', label: 'Google Ads' },
  { key: 'tiktok', label: 'TikTok Ads' },
  { key: 'custom', label: 'مخصص' },
]

/* ─── هوية كل منصة — ألوان من chart tokens (كلاسات ثابتة ليلتقطها Tailwind) ─── */
const PLATFORM_UI: Record<
  string,
  { short: string; sub: string; full: string; icon: React.ComponentType<{ className?: string }>; tile: string; dot: string }
> = {
  meta: { short: 'Meta', sub: 'فيسبوك وإنستجرام', full: 'ميتا · فيسبوك وإنستجرام', icon: Facebook, tile: 'bg-chart-3/12 text-chart-3', dot: 'bg-chart-3' },
  google: { short: 'Google', sub: 'Google Ads', full: 'جوجل — إعلانات', icon: Chrome, tile: 'bg-chart-2/15 text-chart-2', dot: 'bg-chart-2' },
  tiktok: { short: 'TikTok', sub: 'TikTok Ads', full: 'تيك توك — إعلانات', icon: Music2, tile: 'bg-chart-4/15 text-chart-4', dot: 'bg-chart-4' },
  custom: { short: 'مخصص', sub: 'قناة أخرى', full: 'قناة مخصصة', icon: Link2, tile: 'bg-chart-6/15 text-chart-6', dot: 'bg-chart-6' },
}

const TARGET_LABEL: Record<MacroTarget, string> = {
  content: 'utm_content', term: 'utm_term', campaign: 'utm_campaign', utmId: 'utm_id', source: 'utm_source',
}

/** خط أحادي المسافة حقيقي للروابط (خط التطبيق الأساسي ليس mono) */
const MONO = '[font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace]'

const emptyForm = {
  name: '', platform: 'meta' as UtmPlatform, destinationUrl: '',
  source: '', medium: '', campaign: '', content: '', term: '', utmId: '',
}

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' }).format(new Date(iso))

const hostOf = (url: string) => {
  try { return new URL(url).host } catch { return url }
}

/** أرقام لاتينية — الصفر العربي «٠» يظهر كنقطة في خط Cairo فيضيع المعنى */
const nf = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)

/** مبلغ بعملة صغيرة منفصلة — ترتيب ثابت بغض النظر عن اتجاه النص */
function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <span dir="ltr">{nf(value)}</span>
      <span className="text-[0.62em] font-semibold text-muted-foreground">ج.م</span>
    </span>
  )
}

/** حقل موحّد: حدّ واضح وخلفية ثابتة في الفاتح والداكن */
const FIELD = 'h-10 rounded-xl border-border-strong bg-card dark:bg-input/30'

/* ═════════════════════════ مكونات مساعدة ═════════════════════════ */

/** نسخ إلى الحافظة (clipboard + fallback) — مشترك بين الأزرار وحفظ-ونسخ */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

/** زر نسخ */
function CopyAction({
  text, label = 'نسخ الرابط', compact, className,
}: { text: string; label?: string; compact?: boolean; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    await copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      title={label}
      aria-label={label}
      className={cn(
        'h-8 shrink-0 gap-1.5 rounded-xl px-3 text-xs transition-colors',
        compact && 'max-sm:w-8 max-sm:px-0',
        copied && 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground',
        className,
      )}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span className={cn('whitespace-nowrap', compact && 'max-sm:hidden')}>{copied ? 'تم النسخ' : label}</span>
    </Button>
  )
}

/** تبديل مقطّع (Segmented control) — نفس روح شريط الفلاتر في صفحات التتبع الأخرى */
function Segmented<T extends string>({
  value, onChange, options, label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: React.ReactNode }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap rounded-xl border bg-muted/40 p-1">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** بطاقة KPI على شبكة Bento */
function Kpi({
  icon: Icon, label, value, money, hint, loading, tone = 'default', index,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  money?: boolean
  hint?: string
  loading?: boolean
  tone?: 'default' | 'primary'
  index: number
}) {
  return (
    <div
      className={cn(
        'group animate-in-up relative overflow-hidden rounded-[1.25rem] border p-3.5 transition-shadow hover:shadow-md',
        tone === 'primary' ? 'border-primary/25 bg-primary-subtle/70' : 'bg-card',
        index === 1 && 'stagger-1', index === 2 && 'stagger-2', index === 3 && 'stagger-3', index === 4 && 'stagger-4',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            'grid size-8 place-items-center rounded-xl transition-transform group-hover:scale-105',
            tone === 'primary' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 min-h-9">
        {loading ? (
          <Skeleton className="h-8 w-24 rounded-lg" />
        ) : (
          <p className="truncate text-2xl font-black tabular-nums tracking-tight">
            {money ? <Money value={value} /> : <span dir="ltr">{nf(value)}</span>}
          </p>
        )}
      </div>
      {hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** الرابط النهائي مُلوَّن الأجزاء: الأساس / المفاتيح / القيم */
function UrlHighlight({ url }: { url: string }) {
  const parsed = React.useMemo(() => {
    try {
      const u = new URL(url)
      return { base: `${u.origin}${u.pathname}`, params: Array.from(u.searchParams.entries()), hash: u.hash }
    } catch {
      return null
    }
  }, [url])

  if (!parsed) {
    return <p dir="ltr" className={cn('break-all text-[12.5px] leading-7', MONO)}>{url}</p>
  }
  return (
    <p dir="ltr" className={cn('text-[12.5px] leading-7 [overflow-wrap:anywhere]', MONO)}>
      <span className="font-semibold text-foreground">{parsed.base}</span>
      {parsed.params.map(([k, v], i) => (
        <React.Fragment key={`${k}-${i}`}>
          <wbr />
          <span className="text-muted-foreground/70">{i === 0 ? '?' : '&'}</span>
          <span className={k.startsWith('utm_') ? 'rounded-md bg-primary/10 px-1 text-primary' : 'text-muted-foreground'}>{k}</span>
          <span className="text-muted-foreground/70">=</span>
          <span className="rounded-md bg-muted px-1 text-foreground">{v}</span>
        </React.Fragment>
      ))}
      {parsed.hash && <span className="text-muted-foreground">{parsed.hash}</span>}
    </p>
  )
}

/** شرائح المتغيرات الديناميكية للمنصة — نفس سلوك الإضافة (تُطبَّق على target الخاص بها) */
function MacroChips({
  platform, onApply,
}: { platform: string; onApply: (target: MacroTarget, macro: string) => void }) {
  const items = getMacros(platform)
  if (!items.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        متغيرات المنصة الديناميكية — تستبدلها المنصة تلقائياً عند عرض الإعلان
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((m) => (
          <button
            key={`${m.macro}-${m.target}`}
            type="button"
            onClick={() => onApply(m.target, m.macro)}
            title={`${m.macro} ← يُضاف إلى ${TARGET_LABEL[m.target]}`}
            className="group flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Plus className="size-3 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
            <span className="font-medium">{m.label}</span>
            <span dir="ltr" className={cn('text-[10px] text-muted-foreground', MONO)}>{TARGET_LABEL[m.target]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** اقتراحات سريعة لقيم source / medium */
function SuggestChips({ values, current, onPick }: { values: string[]; current: string; onPick: (v: string) => void }) {
  if (!values.length) return null
  return (
    <div className="flex flex-wrap gap-1" dir="ltr">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10.5px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
            MONO,
            current === v
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'text-muted-foreground hover:border-border-strong hover:text-foreground',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/** صف رابط في المكتبة */
function CampaignItem({
  c, perf, maxRev, onEdit, onToggleArchive, onRemove,
}: {
  c: CampaignRow
  perf?: Perf
  maxRev: number
  onEdit: () => void
  onToggleArchive: () => void
  onRemove: () => void
}) {
  const ui = PLATFORM_UI[c.platform] ?? PLATFORM_UI.custom
  const Icon = ui.icon
  const share = perf && maxRev > 0 ? Math.max(4, Math.round((perf.revenue / maxRev) * 100)) : 0

  return (
    <li
      className={cn(
        'group grid gap-3 rounded-2xl border bg-card p-3.5 transition-all hover:border-border-strong hover:shadow-md md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-5',
        c.archived && 'opacity-65',
      )}
    >
      {/* الهوية */}
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', ui.tile)} title={ui.full}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold" title={c.name}>{c.name}</p>
            {c.archived && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Archive className="size-2.5" aria-hidden /> مؤرشفة
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span dir="ltr" className={cn('max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80', MONO)} title={c.fullUrl}>
              {c.utmCampaign}
            </span>
            <span dir="ltr" className={cn('text-[10.5px] text-muted-foreground', MONO)}>
              {c.utmSource} / {c.utmMedium}
            </span>
            <span aria-hidden className="hidden text-muted-foreground/40 sm:inline">•</span>
            <span dir="ltr" className={cn('hidden truncate text-[10.5px] text-muted-foreground/80 sm:inline', MONO)} title={c.destinationUrl}>
              {hostOf(c.destinationUrl)}
            </span>
          </div>
        </div>
      </div>

      {/* الأداء */}
      <div className="min-w-0">
        {perf ? (
          <>
            <dl className="grid grid-cols-3 gap-2">
              <div>
                <dt className="text-[10px] text-muted-foreground">تسجيلات</dt>
                <dd className="text-[13px] font-bold tabular-nums"><span dir="ltr">{nf(perf.registrations)}</span></dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">مدفوعات</dt>
                <dd className="text-[13px] font-bold tabular-nums"><span dir="ltr">{nf(perf.purchases)}</span></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] text-muted-foreground">إيراد</dt>
                <dd className="truncate text-[13px] font-bold tabular-nums text-primary"><Money value={perf.revenue} /></dd>
              </div>
            </dl>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary/70 transition-[width] duration-slow ease-out" style={{ width: `${share}%` }} />
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">لا بيانات خلال 30 يوماً</p>
        )}
      </div>

      {/* الإجراءات */}
      <div className="flex items-center justify-end gap-1 border-t border-dashed pt-3 md:border-t-0 md:pt-0">
        <CopyAction text={c.fullUrl} compact />
        <Button variant="ghost" size="icon-sm" className="rounded-xl text-muted-foreground hover:text-foreground" onClick={onEdit} title="تعديل">
          <Pencil className="size-3.5" aria-hidden />
          <span className="sr-only">تعديل {c.name}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-xl text-muted-foreground hover:text-foreground" onClick={onToggleArchive} title={c.archived ? 'استعادة' : 'أرشفة'}>
          {c.archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
          <span className="sr-only">{c.archived ? 'استعادة' : 'أرشفة'} {c.name}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" className="rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} title="حذف نهائي">
          <Trash2 className="size-3.5" aria-hidden />
          <span className="sr-only">حذف {c.name}</span>
        </Button>
      </div>
    </li>
  )
}

/* ═════════════════════════ المكون الرئيسي ═════════════════════════ */

export function UtmBuilder() {
  // ─── الباني ───
  const [form, setForm] = React.useState(() => {
    const d = getSuggestions('meta')
    return { ...emptyForm, source: d.sources[0] ?? '', medium: d.mediums[0] ?? '' }
  })
  const [touchedSM, setTouchedSM] = React.useState(false) // هل عدّل المستخدم source/medium يدوياً؟
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [adv, setAdv] = React.useState(false) // الخيارات المتقدمة
  const urlRef = React.useRef<HTMLInputElement>(null)
  const campaignRef = React.useRef<HTMLInputElement>(null)

  // ─── المكتبة ───
  const [lib, setLib] = React.useState<LibraryData | null>(null)
  const [loadingLib, setLoadingLib] = React.useState(true)
  const [q, setQ] = React.useState('')
  const [libPlatform, setLibPlatform] = React.useState('all')
  const [showArchived, setShowArchived] = React.useState(false)
  /** عدد الروابط النشطة — يُحدَّث عند كل تحميل للتبويب النشط */
  const [activeCount, setActiveCount] = React.useState<number | null>(null)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  // تغيير المنصة → اقتراح source/medium (إن لم يكتبهما المستخدم)
  const changePlatform = (p: UtmPlatform) => {
    const sug = getSuggestions(p)
    setForm((f) => ({
      ...f,
      platform: p,
      source: touchedSM ? f.source : sug.sources[0] ?? '',
      medium: touchedSM ? f.medium : sug.mediums[0] ?? '',
    }))
  }

  // تذكّر آخر رابط وجهة — يوفّر الكتابة عند إنشاء عدة روابط لنفس الصفحة
  React.useEffect(() => {
    try {
      const last = localStorage.getItem('utm:lastDest')
      if (last) setForm((f) => (f.destinationUrl ? f : { ...f, destinationUrl: last }))
    } catch { /* التخزين غير متاح */ }
  }, [])

  // معاينة حية
  const preview = React.useMemo(
    () => buildUtmUrl({
      destinationUrl: form.destinationUrl, platform: form.platform,
      campaign: form.campaign, content: form.content, term: form.term,
      utmId: form.utmId, source: form.source || undefined, medium: form.medium || undefined,
    }),
    [form]
  )

  // ─── تحميل المكتبة ───
  const loadLib = React.useCallback(async () => {
    setLoadingLib(true)
    try {
      const p = new URLSearchParams()
      if (q.trim()) p.set('q', q.trim())
      if (libPlatform !== 'all') p.set('platform', libPlatform)
      if (showArchived) p.set('archived', '1')
      const d = await fetchJson<LibraryData>(`/api/admin/tracking/utm?${p.toString()}`)
      setLib(d)
      if (!showArchived) setActiveCount(d.campaigns.length)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل مكتبة الحملات')
    } finally {
      setLoadingLib(false)
    }
  }, [q, libPlatform, showArchived])

  React.useEffect(() => {
    const t = setTimeout(() => void Promise.resolve().then(loadLib), 250)
    return () => clearTimeout(t)
  }, [loadLib])

  // ─── حفظ (إنشاء/تعديل) — copy=true: حفظ ثم نسخ الرابط في خطوة واحدة ───
  const save = async (copy = false) => {
    if (!preview.ok) {
      toast.error(preview.errors[0])
      return
    }
    const url = preview.fullUrl
    const warnings = preview.warnings
    const wasEditing = editingId
    setSaving(true)
    try {
      const body = {
        name: form.name, platform: form.platform, destinationUrl: form.destinationUrl,
        source: form.source, medium: form.medium, campaign: form.campaign,
        content: form.content, term: form.term, utmId: form.utmId,
      }
      if (wasEditing) {
        await fetchJson(`/api/admin/tracking/utm/${wasEditing}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
      } else {
        await fetchJson('/api/admin/tracking/utm', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
      }
      if (copy) await copyText(url)
      toast.success(
        wasEditing
          ? (copy ? 'تم التحديث ونسخ الرابط' : 'تم تحديث الحملة')
          : (copy ? 'تم الحفظ ونسخ الرابط' : 'تم حفظ الحملة في المكتبة'),
      )
      warnings.forEach((w) => toast.warning(w))
      try { localStorage.setItem('utm:lastDest', form.destinationUrl.trim()) } catch { /* ignore */ }
      if (wasEditing) {
        // بعد التعديل: تصفير كامل
        setForm({ ...emptyForm, ...(() => { const d = getSuggestions('meta'); return { source: d.sources[0] ?? '', medium: d.mediums[0] ?? '' } })() })
        setTouchedSM(false)
      } else {
        // بعد الإنشاء: نُبقي المنصة والوجهة والمصدر/الوسيلة لإنشاء الرابط التالي بسرعة
        setForm((f) => ({ ...emptyForm, platform: f.platform, destinationUrl: f.destinationUrl, source: f.source, medium: f.medium }))
        setTimeout(() => campaignRef.current?.focus(), 50)
      }
      setEditingId(null)
      setAdv(false)
      void loadLib()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (c: CampaignRow) => {
    setEditingId(c.id)
    setForm({
      name: c.name, platform: (c.platform as UtmPlatform) || 'custom', destinationUrl: c.destinationUrl,
      source: c.utmSource, medium: c.utmMedium, campaign: c.utmCampaign,
      content: c.utmContent ?? '', term: c.utmTerm ?? '', utmId: c.utmId ?? '',
    })
    setTouchedSM(true)
    setAdv(true)
    document.getElementById('utm-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    const d = getSuggestions('meta')
    setForm({ ...emptyForm, source: d.sources[0] ?? '', medium: d.mediums[0] ?? '' })
    setTouchedSM(false)
    setAdv(false)
  }

  const toggleArchive = async (c: CampaignRow) => {
    try {
      await fetchJson(`/api/admin/tracking/utm/${c.id}`, { method: 'PUT', body: JSON.stringify({ archived: !c.archived }), headers: { 'Content-Type': 'application/json' } })
      toast.success(c.archived ? 'تمت الاستعادة' : 'تمت الأرشفة')
      void loadLib()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التنفيذ')
    }
  }

  const remove = async (c: CampaignRow) => {
    if (!window.confirm(`حذف حملة "${c.name}" نهائياً؟`)) return
    try {
      await fetchJson(`/api/admin/tracking/utm/${c.id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      void loadLib()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const exportCsv = () => {
    if (!lib?.campaigns.length) return
    const csv = toCsv(
      lib.campaigns.map((c) => ({
        name: c.name, platform: c.platform, destination: c.destinationUrl,
        utm_source: c.utmSource, utm_medium: c.utmMedium, utm_campaign: c.utmCampaign,
        utm_content: c.utmContent ?? '', utm_term: c.utmTerm ?? '', utm_id: c.utmId ?? '',
        url: c.fullUrl, created: new Date(c.createdAt).toLocaleDateString('ar-EG'),
      })),
      [
        { key: 'name', label: 'الحملة' }, { key: 'platform', label: 'المنصة' },
        { key: 'destination', label: 'الرابط الأساسي' },
        { key: 'utm_source', label: 'utm_source' }, { key: 'utm_medium', label: 'utm_medium' },
        { key: 'utm_campaign', label: 'utm_campaign' }, { key: 'utm_content', label: 'utm_content' },
        { key: 'utm_term', label: 'utm_term' }, { key: 'utm_id', label: 'utm_id' },
        { key: 'url', label: 'الرابط الكامل' }, { key: 'created', label: 'التاريخ' },
      ]
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nezam-utm-campaigns-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const macroApply = (target: MacroTarget, macro: string) => {
    const cur = (form as any)[target] as string
    set({ [target]: cur ? `${cur}_${macro}` : macro } as any)
  }

  const focusBuilder = () => {
    document.getElementById('utm-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => (form.destinationUrl ? campaignRef : urlRef).current?.focus(), 350)
  }

  /* Enter داخل أي حقل نصي = حفظ + نسخ */
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    if ((e.target as HTMLElement).tagName !== 'INPUT') return
    e.preventDefault()
    if (preview.ok && !saving) void save(true)
  }

  /* إجماليات الأداء للـ KPI */
  const perfTotals = React.useMemo(() => {
    const vals = Object.values(lib?.performance ?? {})
    return {
      regs: vals.reduce((a, v) => a + v.registrations, 0),
      purs: vals.reduce((a, v) => a + v.purchases, 0),
      rev: vals.reduce((a, v) => a + v.revenue, 0),
    }
  }, [lib])

  /* توزيع المنصات (إيراد إن وُجد وإلا عدد الروابط) — كل مفتاح حملة يُحسب مرة واحدة */
  const mix = React.useMemo(() => {
    const rows = PLATFORMS.map((p) => ({ key: p.key as string, links: 0, rev: 0 }))
    const seen = new Set<string>()
    for (const c of lib?.campaigns ?? []) {
      const row = rows.find((r) => r.key === c.platform) ?? rows[rows.length - 1]
      row.links += 1
      const k = c.utmCampaign.toLowerCase()
      if (!seen.has(k)) {
        seen.add(k)
        row.rev += lib?.performance?.[k]?.revenue ?? 0
      }
    }
    const byRevenue = rows.reduce((a, r) => a + r.rev, 0) > 0
    const total = rows.reduce((a, r) => a + (byRevenue ? r.rev : r.links), 0)
    return {
      byRevenue,
      rows: rows
        .map((r) => ({ ...r, value: byRevenue ? r.rev : r.links }))
        .filter((r) => r.value > 0)
        .map((r) => ({ ...r, pct: total > 0 ? (r.value / total) * 100 : 0 })),
    }
  }, [lib])

  const maxRev = React.useMemo(
    () => Math.max(0, ...Object.values(lib?.performance ?? {}).map((v) => v.revenue)),
    [lib]
  )

  const hasFilters = q.trim() !== '' || libPlatform !== 'all'
  const newest = lib?.campaigns[0]
  const advFilled = [form.content, form.term, form.utmId].filter((v) => v.trim()).length
  const pristine = !form.campaign.trim()
  const sug = getSuggestions(form.platform)
  const macros = getMacros(form.platform)
  const conversion = perfTotals.regs > 0 ? fmtPct100((perfTotals.purs / perfTotals.regs) * 100) : '—'

  return (
    <div className="space-y-4" dir="rtl">
      {/* ═══════════ شريط الأرقام ═══════════ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi index={1} icon={Link2} label="روابط نشطة" value={activeCount ?? 0} hint="في المكتبة الآن" loading={!lib} />
        <Kpi index={2} icon={UserPlus} label="تسجيلات 30 يوم" value={perfTotals.regs} hint="من روابط الحملات" loading={!lib} />
        <Kpi index={3} icon={ShoppingBag} label="مدفوعات" value={perfTotals.purs} hint={`معدل التحويل ${conversion}`} loading={!lib} />
        <Kpi index={4} icon={Wallet} label="إيراد مُسنَد" value={perfTotals.rev} money hint="آخر 30 يوماً" loading={!lib} tone="primary" />
      </div>

      {/* ═══════════ الباني + المعاينة الحيّة ═══════════ */}
      <div id="utm-builder" className="grid scroll-mt-24 items-start gap-3 lg:grid-cols-12">
        {/* ── النموذج: حقلان إلزاميان فقط (الرابط + اسم الحملة) والباقي تلقائي ── */}
        <section className="animate-in-up stagger-1 rounded-[1.5rem] border bg-card lg:col-span-7" onKeyDown={onEnter}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                {editingId ? <Pencil className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              </span>
              <div>
                <h2 className="text-sm font-black">{editingId ? 'تعديل الرابط' : 'رابط جديد'}</h2>
                <p className="text-[11px] text-muted-foreground">اكتب الرابط واسم الحملة فقط — الباقي يُملأ تلقائياً.</p>
              </div>
            </div>
            {editingId && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-subtle px-2.5 py-1 text-[11px] font-semibold text-warning-subtle-foreground">
                <Pencil className="size-3" aria-hidden />
                قيد التعديل
                <span dir="ltr" className={cn('opacity-70', MONO)}>#{editingId}</span>
              </span>
            )}
          </header>

          <div className="space-y-4 p-5">
            {/* المنصة — نقرة واحدة */}
            <div role="radiogroup" aria-label="المنصة" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATFORMS.map((p) => {
                const ui = PLATFORM_UI[p.key]
                const Icon = ui.icon
                const active = form.platform === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => changePlatform(p.key)}
                    title={ui.full}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-xl border px-2.5 text-start outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      active
                        ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/15'
                        : 'hover:border-border-strong hover:bg-muted/50',
                    )}
                  >
                    <span className={cn('grid size-6 shrink-0 place-items-center rounded-md', ui.tile)}>
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="truncate text-xs font-bold">{ui.short}</span>
                    {active && <Check className="ms-auto size-3.5 shrink-0 text-primary" aria-hidden />}
                  </button>
                )
              })}
            </div>

            {/* الرابط الأساسي */}
            <div className="space-y-1.5">
              <Label htmlFor="utm-dest" className="text-xs font-medium text-muted-foreground">
                الرابط الأساسي <span className="text-destructive">*</span>
                <span className="font-normal opacity-70">— صفحة الوصول، بدون UTM</span>
              </Label>
              <Input
                id="utm-dest"
                ref={urlRef}
                className={cn(FIELD, 'text-[13px]', MONO)}
                dir="ltr"
                placeholder="https://nezampos.com/register"
                value={form.destinationUrl}
                onChange={(e) => set({ destinationUrl: e.target.value })}
              />
            </div>

            {/* UTM: الحملة أولاً (المطلوب كتابته) ثم المصدر والوسيلة (جاهزان) */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label dir="ltr" htmlFor="utm-campaign" className={cn('text-xs font-medium text-muted-foreground', MONO)}>
                  utm_campaign <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="utm-campaign"
                  ref={campaignRef}
                  className={cn(FIELD, 'text-[13px]', MONO)}
                  dir="ltr"
                  value={form.campaign}
                  onChange={(e) => set({ campaign: e.target.value })}
                  placeholder="spring_sale"
                  autoFocus
                />
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">حروف صغيرة وشرطات سفلية، بدون مسافات.</p>
              </div>
              <div className="space-y-1.5">
                <Label dir="ltr" htmlFor="utm-source" className={cn('text-xs font-medium text-muted-foreground', MONO)}>utm_source</Label>
                <Input
                  id="utm-source"
                  className={cn(FIELD, 'text-[13px]', MONO)}
                  dir="ltr"
                  value={form.source}
                  onChange={(e) => { set({ source: e.target.value }); setTouchedSM(true) }}
                  placeholder={sug.sources[0]}
                />
                <SuggestChips values={sug.sources} current={form.source} onPick={(v) => { set({ source: v }); setTouchedSM(true) }} />
              </div>
              <div className="space-y-1.5">
                <Label dir="ltr" htmlFor="utm-medium" className={cn('text-xs font-medium text-muted-foreground', MONO)}>utm_medium</Label>
                <Input
                  id="utm-medium"
                  className={cn(FIELD, 'text-[13px]', MONO)}
                  dir="ltr"
                  value={form.medium}
                  onChange={(e) => { set({ medium: e.target.value }); setTouchedSM(true) }}
                  placeholder={sug.mediums[0]}
                />
                <SuggestChips values={sug.mediums.slice(0, 2)} current={form.medium} onPick={(v) => { set({ medium: v }); setTouchedSM(true) }} />
              </div>
            </div>

            {/* اختياري: الاسم الداخلي + content/term/id + المتغيرات */}
            <div>
              <button
                type="button"
                onClick={() => setAdv((v) => !v)}
                aria-expanded={adv}
                aria-controls="utm-advanced"
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-start outline-none transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  اختياري
                  <span className="font-normal text-muted-foreground">الاسم الداخلي · content · term · id · متغيرات المنصة</span>
                  {advFilled + (form.name.trim() ? 1 : 0) > 0 && (
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {advFilled + (form.name.trim() ? 1 : 0)}
                    </span>
                  )}
                </span>
                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', adv && 'rotate-180')} aria-hidden />
              </button>

              {adv && (
                <div id="utm-advanced" className="animate-in-up mt-3 space-y-4 rounded-xl bg-muted/30 p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="utm-name" className="text-xs font-medium text-muted-foreground">
                      الاسم الداخلي <span className="font-normal opacity-70">— إن تركته فارغاً يُولَّد تلقائياً</span>
                    </Label>
                    <Input
                      id="utm-name"
                      className={cn(FIELD, 'text-sm')}
                      placeholder="مثال: رمضان 2026 — مشاهير"
                      value={form.name}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label dir="ltr" htmlFor="utm-content" className={cn('text-xs font-medium text-muted-foreground', MONO)}>utm_content</Label>
                      <Input id="utm-content" className={cn(FIELD, 'text-[13px]', MONO)} dir="ltr" value={form.content} onChange={(e) => set({ content: e.target.value })} placeholder="video_a" />
                    </div>
                    <div className="space-y-1.5">
                      <Label dir="ltr" htmlFor="utm-term" className={cn('text-xs font-medium text-muted-foreground', MONO)}>utm_term</Label>
                      <Input id="utm-term" className={cn(FIELD, 'text-[13px]', MONO)} dir="ltr" value={form.term} onChange={(e) => set({ term: e.target.value })} placeholder="pos+erp" />
                    </div>
                    <div className="space-y-1.5">
                      <Label dir="ltr" htmlFor="utm-id" className={cn('text-xs font-medium text-muted-foreground', MONO)}>utm_id</Label>
                      <Input id="utm-id" className={cn(FIELD, 'text-[13px]', MONO)} dir="ltr" value={form.utmId} onChange={(e) => set({ utmId: e.target.value })} placeholder="12345" />
                    </div>
                  </div>
                  {macros.length > 0 && <MacroChips platform={form.platform} onApply={macroApply} />}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── المعاينة الحيّة + الإجراءات (لاصقة: الزر دائماً أمامك) ── */}
        <aside className="animate-in-up stagger-2 lg:sticky lg:top-4 lg:col-span-5">
          <div className="relative overflow-hidden rounded-[1.5rem] border bg-card shadow-sm">
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/60 to-transparent" />
            <div aria-hidden className="pointer-events-none absolute -top-20 -start-10 size-56 rounded-full bg-primary/10 blur-3xl" />

            <div className="relative p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black">المعاينة الحيّة</h2>
                <span
                  aria-live="polite"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    preview.ok ? 'bg-success-subtle text-success-subtle-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', preview.ok ? 'bg-success' : 'bg-muted-foreground/60')} />
                  {preview.ok ? 'جاهز للنشر' : pristine ? 'بانتظار البيانات' : 'غير مكتمل'}
                </span>
              </div>

              {pristine ? (
                <div className="mt-4 rounded-2xl border border-dashed px-4 py-5 text-center">
                  <p className="text-sm font-bold">
                    {form.destinationUrl.trim() ? 'اكتب اسم الحملة ليكتمل الرابط' : 'ابدأ بالرابط الأساسي واسم الحملة'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">سيظهر هنا الرابط النهائي ملوَّن الأجزاء.</p>
                </div>
              ) : preview.errors.length > 0 ? (
                <ul className="mt-4 space-y-1.5 rounded-2xl bg-destructive/5 p-3.5">
                  {preview.errors.map((er) => (
                    <li key={er} className="flex items-start gap-2 text-xs font-medium text-destructive">
                      <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {er}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-2xl border bg-muted/30 p-3.5">
                  <UrlHighlight url={preview.fullUrl} />
                </div>
              )}

              {preview.warnings.length > 0 && !pristine && (
                <ul className="mt-3 space-y-1">
                  {preview.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2 rounded-xl bg-warning-subtle px-3 py-2 text-[11px] text-warning-subtle-foreground">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              {/* الإجراءات */}
              <div className="mt-4 space-y-2">
                <Button
                  variant="gradient"
                  onClick={() => void save(true)}
                  disabled={saving || !preview.ok}
                  className="h-11 w-full gap-2 rounded-xl text-sm font-bold"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {saving ? 'جارٍ الحفظ…' : editingId ? 'تحديث ونسخ الرابط' : 'حفظ ونسخ الرابط'}
                  <kbd className="ms-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium sm:inline">Enter ↵</kbd>
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void save(false)}
                    disabled={saving || !preview.ok}
                    className="h-9 flex-1 gap-1.5 rounded-xl text-xs"
                  >
                    <Check className="size-3.5" aria-hidden />
                    {editingId ? 'تحديث فقط' : 'حفظ فقط'}
                  </Button>
                  {preview.ok ? (
                    <CopyAction text={preview.fullUrl} label="نسخ بدون حفظ" className="h-9 flex-1 justify-center" />
                  ) : (
                    <Button variant="outline" disabled className="h-9 flex-1 gap-1.5 rounded-xl text-xs">
                      <Copy className="size-3.5" aria-hidden /> نسخ بدون حفظ
                    </Button>
                  )}
                </div>
                {editingId && (
                  <Button variant="ghost" onClick={cancelEdit} className="h-9 w-full rounded-xl text-xs text-muted-foreground">
                    إلغاء التعديل
                  </Button>
                )}
              </div>

              <div className="mt-4 grid gap-1.5 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span><b className="text-foreground">First Touch</b> يُحفظ من أول زيارة للرابط.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-chart-2" aria-hidden />
                  <span><b className="text-foreground">Last Touch</b> يُحدَّث مع كل زيارة جديدة.</span>
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ═══════════ توزيع المنصات ═══════════ */}
      {lib && mix.rows.length > 0 && (
        <section className="animate-in-up stagger-1 rounded-[1.25rem] border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold">توزيع المنصات</h2>
            <span className="text-[11px] text-muted-foreground">
              {mix.byRevenue ? 'حسب الإيراد المُسنَد' : 'حسب عدد الروابط (لا إيراد بعد)'}
            </span>
          </div>
          <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="توزيع المنصات">
            {mix.rows.map((r) => (
              <div
                key={r.key}
                className={cn('h-full rounded-full transition-[flex-grow] duration-slow ease-out', PLATFORM_UI[r.key].dot)}
                style={{ flexGrow: r.value, flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {mix.rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2 text-xs">
                <span className={cn('size-2 rounded-full', PLATFORM_UI[r.key].dot)} aria-hidden />
                <span className="font-medium">{PLATFORM_UI[r.key].short}</span>
                <span dir="ltr" className="font-bold tabular-nums">{Math.round(r.pct)}%</span>
                <span aria-hidden className="text-muted-foreground/40">•</span>
                <span className="text-muted-foreground"><span dir="ltr">{nf(r.links)}</span> رابط</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ═══════════ مكتبة الروابط ═══════════ */}
      <section className="animate-in-up stagger-4 rounded-[1.5rem] border bg-card">
        <header className="space-y-3 border-b p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-black">مكتبة الروابط</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                {loadingLib && !lib ? '…' : nf(lib?.campaigns.length ?? 0)}
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-xl text-xs" onClick={exportCsv} disabled={!lib?.campaigns.length}>
              <Download className="size-3.5" aria-hidden /> تصدير CSV
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64">
              <Input
                icon={<Search />}
                className="h-9 rounded-xl border-border-strong text-xs"
                placeholder="بحث بالاسم أو الحملة أو الرابط…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="بحث في المكتبة"
              />
            </div>
            <Segmented
              label="المنصة"
              value={libPlatform}
              onChange={setLibPlatform}
              options={[
                { value: 'all', label: 'الكل' },
                ...PLATFORMS.map((p) => ({ value: p.key as string, label: PLATFORM_UI[p.key].short })),
              ]}
            />
            <div className="sm:ms-auto">
              <Segmented
                label="الحالة"
                value={showArchived ? 'arc' : 'act'}
                onChange={(v) => setShowArchived(v === 'arc')}
                options={[
                  { value: 'act', label: 'النشطة' },
                  { value: 'arc', label: 'المؤرشفة', icon: <Archive className="size-3" aria-hidden /> },
                ]}
              />
            </div>
          </div>
        </header>

        <div className="p-3.5 sm:p-4">
          {lib && lib.tablesReady === false && (
            <div className="mb-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                جدول مكتبة الحملات غير مُهيأ
              </p>
              <p className="mt-1 leading-relaxed">
                شغّل ملف{' '}
                <code className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px]" dir="ltr">TRACKING_TABLES.sql</code>{' '}
                في Supabase SQL Editor ثم أعد التحميل.
              </p>
            </div>
          )}

          {loadingLib && !lib ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
              ))}
            </div>
          ) : !lib || lib.campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Inbox className="size-6" aria-hidden />
              </span>
              <p className="text-sm font-black">
                {hasFilters ? 'لا نتائج مطابقة' : showArchived ? 'لا توجد روابط مؤرشفة' : 'المكتبة فارغة'}
              </p>
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                {hasFilters
                  ? 'جرّب مسح البحث أو تغيير المنصة — الروابط كلها ما زالت في المكتبة.'
                  : showArchived
                    ? 'الروابط المؤرشفة تُخزَّن هنا بدل الحذف — استعدها متى شئت.'
                    : 'أنشئ أول رابط من الأعلى — روابط utm_* يلتقطها نظام التتبع تلقائياً عند أول زيارة ويحفظ First/Last Touch لكل زائر.'}
              </p>
              {hasFilters ? (
                <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={() => { setQ(''); setLibPlatform('all') }}>
                  مسح الفلاتر
                </Button>
              ) : !showArchived ? (
                <Button variant="gradient" size="sm" className="h-9 gap-1.5 rounded-xl" onClick={focusBuilder}>
                  <Plus className="size-4" aria-hidden /> رابط جديد
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {lib.campaigns.map((c) => (
                <CampaignItem
                  key={c.id}
                  c={c}
                  perf={lib.performance?.[c.utmCampaign.toLowerCase()]}
                  maxRev={maxRev}
                  onEdit={() => startEdit(c)}
                  onToggleArchive={() => toggleArchive(c)}
                  onRemove={() => remove(c)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
