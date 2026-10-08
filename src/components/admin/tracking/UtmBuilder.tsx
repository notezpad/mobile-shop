'use client'

/**
 * ═══════════════════════════════════════════════════════════════════
 *  📦 غرفة الإرسال — روابط الحملات (UTM Builder + مكتبة الحملات)
 * ═══════════════════════════════════════════════════════════════════
 *  الهوية: إسبريسو داكن + ورق كرافت + أختام طوبية (Priority Red) + باركود
 *  «كل رابط حملة = إرسالية لها رقم تتبع» — القلب الدلالي لقسم التسويق والتتبع.
 *  ─ عناصر التوقيع الخاص بهذه الصفحة فقط ─
 *   • Barcode: باركود حتمي (FNV-1a + LCG) مولَّد من نص الرابط — يتغيّر لحظياً
 *   • رقم تتبع NZ-XXXXXX لكل إرسالية (عرض فقط)
 *   • أختام Postmark دائرية مائلة: PRIORITY / READY / HELD
 *   • بوليصة الشحن: ملصق بثقوب مثقوبة (PunchHoles) + شريط لاصق + خط قطع
 *   • سجل الإرساليات برأس إسبريسو دائم + شرائح «ناقل» كرافتية
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Package, PackageOpen, ClipboardList, Facebook, Chrome, Music2, Link2,
  Search, Download, Pencil, Trash2, Archive, ArchiveRestore,
  Copy, Check, Loader2, AlertTriangle, XCircle, MoveLeft, Stamp,
} from 'lucide-react'
import {
  buildUtmUrl, getSuggestions, getMacros, toCsv, UtmPlatform,
} from '@/lib/tracking/utm'
import { fetchJson, fmtNum, fmtMoney } from './shared'
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

const PLATFORMS: { key: UtmPlatform; label: string }[] = [
  { key: 'meta', label: 'Meta (Facebook / Instagram)' },
  { key: 'google', label: 'Google Ads' },
  { key: 'tiktok', label: 'TikTok Ads' },
  { key: 'custom', label: 'مخصص' },
]

/* ─── الناقلون — شرائح كرافت بحروف أحادية (بدون ألوان العلامات) ─────── */
const CARRIERS: Record<string, { code: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  meta: { code: 'META', label: 'ميتا · فيسبوك وإنستجرام', icon: Facebook },
  google: { code: 'GGLE', label: 'جوجل — إعلانات', icon: Chrome },
  tiktok: { code: 'TTOK', label: 'تيك توك — إعلانات', icon: Music2 },
  custom: { code: 'CSTM', label: 'قناة مخصصة', icon: Link2 },
}

/* ─── ألوان الهوية: إسبريسو / كرافت / طوبي — سلسلة ناعمة متناسقة ───── */
const PAPER = 'border-[#d9c79c] bg-[#f8f2e2] dark:border-[#4a3b28] dark:bg-[#241c12]'
const PAPER_SOFT = 'bg-[#f1e8d2] dark:bg-[#2d2316]'
const FIELD =
  'border-[#d9c79c] bg-[#fdf9ec] text-[#33291c] placeholder:text-[#9d8d64] focus-visible:border-[#a13d2d]/50 focus-visible:ring-[#a13d2d]/15 dark:border-[#4a3b28] dark:bg-[#1b140d] dark:text-[#e6d5ac] dark:placeholder:text-[#7d6a48]'
const INK = 'text-[#33291c] dark:text-[#e6d5ac]'
const INK_SOFT = 'text-[#6e5c3d] dark:text-[#bfa878]'
const INK_FAINT = 'text-[#94815f] dark:text-[#8d7a57]'
const RUST = 'text-[#a13d2d] dark:text-[#d47a5f]'
const OUTLINE_BTN =
  'border-[#d9c79c] bg-[#fdf9ec] text-[#33291c] hover:bg-[#f1e8d2] hover:text-[#33291c] dark:border-[#4a3b28] dark:bg-[#241c12] dark:text-[#e6d5ac] dark:hover:bg-[#332819] dark:hover:text-[#e6d5ac]'

/* نسيج نسج كرافت مائل — بصمة هذه الصفحة (مغاير لنقاط/تخريم/مخططات الصفحات الأخرى) */
const WEAVE: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(-45deg, rgba(230,213,172,.05) 0 2px, transparent 2px 9px)',
}

/* ─── أدوات الباركود الحتمية ────────────────────────────────────────── */

/** تجزئة FNV-1a 32-bit — حتمية عبر الجلسات */
function hash32(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** نمط أعمدة باركود (LCG) — عرض 1-3px لكل عمود */
function barcodePattern(seed: string, count: number): number[] {
  const out: number[] = []
  let x = hash32(seed) || 1013904223
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    out.push(1 + (x % 3))
  }
  return out
}

/** رقم تتبع قصير حتمي من الرابط — للعرض فقط */
function trackingNo(seed: string): string {
  return `NZ-${hash32(seed).toString(36).toUpperCase().padStart(6, '0').slice(-6)}`
}

/** باركود زخرفي حتمي — يتغيّر مع النص المصدر (الرابط) لحظياً */
function Barcode({
  seed, bars = 36, className, barClass,
}: { seed: string; bars?: number; className?: string; barClass?: string }) {
  const widths = React.useMemo(() => barcodePattern(seed, bars), [seed, bars])
  return (
    <div aria-hidden dir="ltr" className={cn('flex items-stretch gap-[2px] overflow-hidden', className)}>
      {widths.map((w, i) => (
        <span
          key={i}
          style={{ width: `${w}px` }}
          className={cn('shrink-0', barClass, i % 9 === 4 && 'self-center h-[72%]')}
        />
      ))}
    </div>
  )
}

/** ختم بريدي دائري مائل — توقيع الصفحة للحوالة (PRIORITY/READY/HELD) */
function Postmark({
  top, sub, tone = 'rust', className,
}: { top: string; sub?: string; tone?: 'rust' | 'ink'; className?: string }) {
  return (
    <div
      aria-hidden
      dir="ltr"
      className={cn(
        'grid size-[70px] shrink-0 rotate-[-8deg] place-items-center rounded-full border-[1.5px] p-1.5 text-center',
        tone === 'rust'
          ? 'border-[#a13d2d]/75 text-[#a13d2d] dark:border-[#d47a5f]/60 dark:text-[#d47a5f]'
          : 'border-[#6e5c3d]/60 text-[#6e5c3d] dark:border-[#bfa878]/50 dark:text-[#bfa878]',
        className,
      )}
    >
      <div className="rounded-full border border-current/45 px-1 py-0.5 leading-[1.2]">
        <p className="font-mono text-[8.5px] font-black tracking-[0.12em]">{top}</p>
        {sub ? <p className="font-mono text-[6.5px] tracking-[0.06em] opacity-85">{sub}</p> : null}
      </div>
    </div>
  )
}

/** ثقوب ملصق مثقوب على حاشية البوليصة — تخترق لون خلفية الصفحة */
function PunchHoles({ side }: { side: 'start' | 'end' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-y-2 w-[7px]',
        side === 'start' ? 'start-[2px]' : 'end-[2px]',
      )}
      style={{
        backgroundImage: 'radial-gradient(circle, var(--background) 2.5px, transparent 3.1px)',
        backgroundSize: '7px 14px',
        backgroundPosition: 'center',
      }}
    />
  )
}

/** شريحة الناقل — كرافت بحرف أحادي */
function CarrierChip({ platform, className }: { platform: string; className?: string }) {
  const c = CARRIERS[platform] ?? CARRIERS.custom
  const Icon = c.icon
  return (
    <span
      title={c.label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[5px] border border-[#cbb98d] bg-[#f1e8d2] px-2 py-[3px] font-mono text-[10px] font-bold tracking-[0.08em] text-[#6e5c3d] dark:border-[#4a3b28] dark:bg-[#332819] dark:text-[#c9b586]',
        className,
      )}
    >
      <Icon className="size-3" />
      {c.code}
    </span>
  )
}

/** زر نسخ بثيم غرفة الإرسال — نفس منطق النسخ الأصلي حرفياً */
function DispatchCopy({
  text, label = 'نسخ الرابط', size = 'sm', className,
}: { text: string; label?: string; size?: 'sm' | 'icon'; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  if (size === 'icon') {
    return (
      <Button
        type="button" variant="outline" size="icon" onClick={copy} title={label}
        className={cn('size-8', OUTLINE_BTN, copied && 'border-[#a13d2d]/50 text-[#a13d2d] dark:text-[#d47a5f]', className)}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span className="sr-only">{label}</span>
      </Button>
    )
  }
  return (
    <Button
      type="button" variant="outline" size="sm" onClick={copy}
      className={cn('h-8 gap-1.5 text-xs', OUTLINE_BTN, copied && 'border-[#a13d2d]/50 text-[#a13d2d] dark:text-[#d47a5f]', className)}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'تم النسخ' : label}
    </Button>
  )
}

/** أختام الماكروز — chips المنصة الديناميكية (نفس سلوك الإضافة) */
function MacroStamps({
  platform, onApply,
}: { platform: string; onApply: (target: 'content' | 'term' | 'campaign' | 'utmId' | 'source', macro: string) => void }) {
  const items = getMacros(platform)
  if (!items.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((m) => (
        <button
          key={m.macro}
          type="button"
          onClick={() => onApply(m.target, m.macro)}
          title={`ختم: ${m.label}`}
          dir="ltr"
          className="rounded-[3px] border border-[#cbb98d] bg-[#fdf9ec] px-1.5 py-0.5 font-mono text-[10px] text-[#6e5c3d] shadow-[inset_0_1px_0_rgba(255,255,255,.65)] transition-colors hover:border-[#a13d2d]/60 hover:text-[#a13d2d] dark:border-[#4a3b28] dark:bg-[#241c12] dark:text-[#bfa878] dark:shadow-none dark:hover:border-[#d47a5f]/50 dark:hover:text-[#d47a5f]"
        >
          + {m.macro}
        </button>
      ))}
    </div>
  )
}

/** تسمية حقل البوليصة — رصاصة طوبية مربعة + نص كرافتي */
function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className={cn('flex items-center gap-1.5 text-[11px] font-bold', INK_SOFT)}>
      <span aria-hidden className="size-[5px] rounded-[1px] bg-[#a13d2d]/70" />
      {children}
    </Label>
  )
}

const emptyForm = {
  name: '', platform: 'meta' as UtmPlatform, destinationUrl: '',
  source: '', medium: '', campaign: '', content: '', term: '', utmId: '',
}

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(new Date(iso))

/* ═════════════════════════ المكون الرئيسي ═════════════════════════ */

export function UtmBuilder() {
  // ─── الباني ───
  const [form, setForm] = React.useState({ ...emptyForm })
  const [touchedSM, setTouchedSM] = React.useState(false) // هل عدّل المستخدم source/medium يدوياً؟
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement>(null)

  // ─── المكتبة ───
  const [lib, setLib] = React.useState<LibraryData | null>(null)
  const [loadingLib, setLoadingLib] = React.useState(true)
  const [q, setQ] = React.useState('')
  const [libPlatform, setLibPlatform] = React.useState('all')
  const [showArchived, setShowArchived] = React.useState(false)
  /** عدد الإرساليات النشطة — يُحدَّث عند كل تحميل للتبويب النشط */
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

  // ─── حفظ (إنشاء/تعديل) ───
  const save = async () => {
    if (!preview.ok) {
      toast.error(preview.errors[0])
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name, platform: form.platform, destinationUrl: form.destinationUrl,
        source: form.source, medium: form.medium, campaign: form.campaign,
        content: form.content, term: form.term, utmId: form.utmId,
      }
      if (editingId) {
        await fetchJson(`/api/admin/tracking/utm/${editingId}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
        toast.success('تم تحديث الحملة')
      } else {
        await fetchJson('/api/admin/tracking/utm', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
        toast.success('تم حفظ الحملة في المكتبة')
      }
      preview.warnings.forEach((w) => toast.warning(w))
      setForm({ ...emptyForm })
      setTouchedSM(false)
      setEditingId(null)
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
    document.getElementById('waybill')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setTouchedSM(false)
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

  const macros = getMacros(form.platform)
  void macros
  const macroApply = (target: 'content' | 'term' | 'campaign' | 'utmId' | 'source', macro: string) => {
    const cur = (form as any)[target] as string
    set({ [target]: cur ? `${cur}_${macro}` : macro } as any)
  }

  const focusWaybill = () => {
    document.getElementById('waybill')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => nameRef.current?.focus(), 350)
  }

  /* إجماليات الأداء للهيرو */
  const perfTotals = React.useMemo(() => {
    const vals = Object.values(lib?.performance ?? {})
    return {
      regs: vals.reduce((a, v) => a + v.registrations, 0),
      purs: vals.reduce((a, v) => a + v.purchases, 0),
      rev: vals.reduce((a, v) => a + v.revenue, 0),
    }
  }, [lib])

  const hasFilters = q.trim() !== '' || libPlatform !== 'all'
  const newest = lib?.campaigns[0]

  return (
    <div className="space-y-3.5" dir="rtl">
      {/* ═══════════ 📦 هيرو: غرفة الإرسال ═══════════ */}
      <section className="animate-in-up relative overflow-hidden rounded-xl border border-[#4a3b28] bg-gradient-to-bl from-[#362a1a] via-[#261d11] to-[#1c150d] text-[#e6d5ac] shadow-lg shadow-[#1c150d]/25">
        <div aria-hidden className="absolute inset-0" style={WEAVE} />
        <div aria-hidden className="absolute -top-24 start-1/3 size-80 rounded-full bg-[#e6d5ac]/[0.07] blur-3xl" />
        <Barcode
          seed="NEZAM-DISPATCH-2026"
          bars={64}
          className="absolute -end-4 top-5 h-20 opacity-[0.13]"
          barClass="bg-[#e6d5ac]"
        />
        <Postmark top="PRIORITY" sub="30-DAY WINDOW" className="absolute end-5 bottom-10 hidden opacity-80 sm:grid" />

        <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
          {/* ختم الصندوق */}
          <div className="grid size-14 shrink-0 place-items-center rounded-xl border border-[#4a3b28] bg-[#1c150d]/80 text-[#e6d5ac] shadow-inner">
            <Package className="size-7" strokeWidth={1.6} aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                dir="ltr"
                className="rounded border border-[#e6d5ac]/25 bg-[#e6d5ac]/10 px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-[0.26em] text-[#e6d5ac]"
              >
                UTM · WAYBILL
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#a13d2d]/40 bg-[#a13d2d]/15 px-2 py-0.5 text-[10px] font-bold text-[#e0a893]">
                <Stamp className="size-3" aria-hidden />
                روابط يلتقطها نظام التتبع تلقائياً
              </span>
            </div>

            <h1 className="mt-2 text-xl font-black tracking-tight text-[#f5ecd7] sm:text-2xl">
              غرفة الإرسال
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[#c9b586]">
              اصنع بوليصة رابط مُعقَّمة بالكامل لكل منصة — انسخها وانشرها، وسيتولّى نظام
              التتبع الباقي من أول زيارة.
            </p>

            {/* العداد + الإحصاءات */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
              <div className="shrink-0">
                {lib ? (
                  <p dir="ltr" className="font-mono text-[2rem] font-black leading-none tabular-nums text-[#f5ecd7]">
                    {activeCount ?? 0}
                  </p>
                ) : (
                  <Skeleton className="h-8 w-12 bg-[#e6d5ac]/10" />
                )}
                <p className="mt-1 text-[11px] font-bold text-[#c9b586]">إرسالية في الخدمة</p>
              </div>
              <div className="flex flex-col justify-center gap-1.5 border-s border-[#e6d5ac]/15 ps-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-[#e6d5ac]">
                  <ClipboardList className="size-3.5 shrink-0 text-[#c9b586]" aria-hidden />
                  تسجيلات ٣٠ يوم:
                  <b className="font-mono tabular-nums text-[#f5ecd7]">{lib ? fmtNum(perfTotals.regs) : '…'}</b>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[#e6d5ac]">
                  <PackageOpen className="size-3.5 shrink-0 text-[#c9b586]" aria-hidden />
                  مدفوعات:
                  <b className="font-mono tabular-nums text-[#f5ecd7]">{lib ? fmtNum(perfTotals.purs) : '…'}</b>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[#e6d5ac]">
                  <Stamp className="size-3.5 shrink-0 text-[#e0a893]" aria-hidden />
                  إيراد مُسنَد:
                  <b className="font-mono tabular-nums text-[#e0a893]">{lib ? fmtMoney(perfTotals.rev) : '…'}</b>
                </span>
              </div>
              {newest && (
                <div className="hidden flex-col justify-center gap-1.5 border-s border-[#e6d5ac]/15 ps-4 md:flex">
                  <span className="text-[11px] font-bold text-[#c9b586]">آخر إرسالية</span>
                  <span dir="ltr" className="font-mono text-xs tabular-nums text-[#f5ecd7]">
                    {fmtDay(newest.createdAt)} · {trackingNo(newest.fullUrl)}
                  </span>
                </div>
              )}
            </div>

            {/* أوامر الهيرو */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={focusWaybill}
                className="h-9 gap-1.5 bg-[#a13d2d] font-extrabold text-[#f8f2e2] shadow-sm shadow-[#8a2f1f]/40 transition-all hover:bg-[#8a2f1f]"
              >
                <PackageOpen className="size-4" aria-hidden />
                إرسالية جديدة
              </Button>
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={!lib?.campaigns.length}
                className="h-9 gap-1.5 border-[#4a3b28] bg-transparent font-bold text-[#e6d5ac] hover:bg-[#332819] hover:text-[#f5ecd7]"
              >
                <Download className="size-4" aria-hidden />
                بيان الشحن CSV
              </Button>
            </div>
          </div>
        </div>

        {/* شريط الباركود السفلي — بصمة غرفة الإرسال */}
        <div className="relative flex items-center justify-between gap-3 border-t border-[#4a3b28] bg-[#1c150d]/70 px-4 py-1.5">
          <Barcode
            seed={`manifest-${activeCount ?? 0}`}
            bars={44}
            className="h-3.5 opacity-60"
            barClass="bg-[#e6d5ac]"
          />
          <span dir="ltr" className="shrink-0 font-mono text-[8.5px] font-bold tracking-[0.3em] text-[#8d7a57]">
            NEZAM · DISPATCH OFFICE · 2026
          </span>
        </div>
      </section>

      {/* ═══════════ 🧾 بوليصة الإرسالية (الباني) ═══════════ */}
      <section
        id="waybill"
        className={cn(PAPER, 'animate-in-up stagger-1 relative scroll-mt-24 overflow-hidden rounded-xl shadow-sm')}
      >
        <PunchHoles side="start" />
        <PunchHoles side="end" />

        {/* شريط لاصق علوي */}
        <div
          aria-hidden
          dir="ltr"
          className="pointer-events-none absolute -top-px start-10 rotate-[-1.2deg] border-x border-[#b99c62]/40 bg-[#cbb98d]/25 px-4 py-[3px] font-mono text-[7.5px] font-bold tracking-[0.34em] text-[#6e5c3d] dark:border-[#8d7a57]/25 dark:bg-[#e6d5ac]/[0.06] dark:text-[#8d7a57]"
        >
          NEZAM EXPRESS — WAYBILL — HANDLE WITH CARE
        </div>

        {/* رأس البوليصة */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#d9c79c] px-5 pb-2.5 pt-4 dark:border-[#4a3b28]">
          <div className="flex items-center gap-2.5">
            <PackageOpen className="size-5 shrink-0 text-[#a13d2d] dark:text-[#d47a5f]" aria-hidden />
            <div>
              <h2 className={cn('text-sm font-black', INK)}>
                {editingId ? `تحديث بوليصة الإرسالية #${editingId}` : 'بوليصة إرسالية جديدة'}
              </h2>
              <p className={cn('text-[11px]', INK_SOFT)}>
                املأ بيانات الشحنة — الرابط النهائي يُبنى ويتحقَّق لحظياً.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editingId && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#a13d2d]/40 bg-[#a13d2d]/10 px-2 py-0.5 text-[10px] font-bold text-[#a13d2d] dark:text-[#d47a5f]">
                <Pencil className="size-3" aria-hidden />
                قيد التعديل
              </span>
            )}
            <span
              dir="ltr"
              className="rounded border border-[#cbb98d] bg-[#fdf9ec] px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.18em] text-[#6e5c3d] dark:border-[#4a3b28] dark:bg-[#241c12] dark:text-[#c9b586]"
            >
              {editingId ? `WB-${String(editingId).padStart(4, '0')}` : 'WB-NEW'}
            </span>
          </div>
        </div>

        {/* من ← إلى */}
        <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2 text-[11px]', INK_SOFT)}>
          <span>
            من: <b className={INK}>نظام نقاط بيع نِظام</b>
          </span>
          <MoveLeft className="size-3.5 text-[#a13d2d]/70 dark:text-[#d47a5f]/70" aria-hidden />
          <span>
            إلى: <b className={INK}>{CARRIERS[form.platform]?.label ?? 'قناة مخصصة'}</b>
          </span>
        </div>
        <div aria-hidden className="border-t border-dashed border-[#d9c79c] dark:border-[#4a3b28]" />

        {/* الحقول */}
        <div className="space-y-3 px-5 pb-4 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-name">اسم الحملة (داخلي)</FieldLabel>
              <Input
                id="wb-name"
                ref={nameRef}
                className={cn(FIELD, 'h-9 text-sm')}
                placeholder="مثال: رمضان 2026 — مشاهير"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-platform">المنصة (الناقل)</FieldLabel>
              <Select value={form.platform} onValueChange={(v) => changePlatform(v as UtmPlatform)}>
                <SelectTrigger id="wb-platform" className={cn(FIELD, 'h-9 text-sm')} dir="rtl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => {
                    const C = CARRIERS[p.key]
                    const Icon = C?.icon
                    return (
                      <SelectItem key={p.key} value={p.key}>
                        <span className="flex items-center gap-1.5">
                          {Icon ? <Icon className="size-3.5" /> : null}
                          {p.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <FieldLabel htmlFor="wb-dest">الرابط الأساسي (Canonical — بدون UTM)</FieldLabel>
            <Input
              id="wb-dest"
              className={cn(FIELD, 'h-9 font-mono text-[13px]')}
              dir="ltr"
              placeholder="https://nezampos.com/register"
              value={form.destinationUrl}
              onChange={(e) => set({ destinationUrl: e.target.value })}
            />
            <p className={cn('text-[10px] leading-relaxed', INK_FAINT)}>
              أي معاملات utm_* موجودة في الرابط ستُحذف تلقائياً للحفاظ على Canonical نظيف.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-source">utm_source</FieldLabel>
              <Input
                id="wb-source"
                className={cn(FIELD, 'h-9 font-mono text-[13px]')}
                dir="ltr"
                value={form.source}
                onChange={(e) => { set({ source: e.target.value }); setTouchedSM(true) }}
                placeholder={getSuggestions(form.platform).sources[0]}
              />
              <MacroStamps platform={form.platform} onApply={macroApply} />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-medium">utm_medium</FieldLabel>
              <Input
                id="wb-medium"
                className={cn(FIELD, 'h-9 font-mono text-[13px]')}
                dir="ltr"
                value={form.medium}
                onChange={(e) => { set({ medium: e.target.value }); setTouchedSM(true) }}
                placeholder={getSuggestions(form.platform).mediums[0]}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-campaign">
                utm_campaign <span className="text-[#a13d2d] dark:text-[#d47a5f]">*</span>
              </FieldLabel>
              <Input
                id="wb-campaign"
                className={cn(FIELD, 'h-9 font-mono text-[13px]')}
                dir="ltr"
                value={form.campaign}
                onChange={(e) => set({ campaign: e.target.value })}
                placeholder="spring_sale"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-content">utm_content (اختياري)</FieldLabel>
              <Input
                id="wb-content"
                className={cn(FIELD, 'h-9 font-mono text-[13px]')}
                dir="ltr"
                value={form.content}
                onChange={(e) => set({ content: e.target.value })}
                placeholder="video_a"
              />
              <MacroStamps platform={form.platform} onApply={macroApply} />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-term">utm_term (اختياري)</FieldLabel>
              <Input
                id="wb-term"
                className={cn(FIELD, 'h-9 font-mono text-[13px]')}
                dir="ltr"
                value={form.term}
                onChange={(e) => set({ term: e.target.value })}
                placeholder="pos+erp"
              />
              <MacroStamps platform={form.platform} onApply={macroApply} />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="wb-utmId">utm_id (اختياري)</FieldLabel>
              <Input
                id="wb-utmId"
                className={cn(FIELD, 'h-9 font-mono text-[13px]')}
                dir="ltr"
                value={form.utmId}
                onChange={(e) => set({ utmId: e.target.value })}
                placeholder="12345"
              />
              <MacroStamps platform={form.platform} onApply={macroApply} />
            </div>
          </div>
        </div>

        {/* الملصق النهائي — المعاينة الحية */}
        <div className="px-5 pb-5">
          <div className="relative rounded-lg border-2 border-dashed border-[#cbb98d] bg-[#fdf9ec] p-3.5 dark:border-[#4a3b28] dark:bg-[#1b140d]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {preview.ok ? (
                  <Postmark tone="ink" top="READY" sub="CARRIER-GRADE" className="size-11" />
                ) : (
                  <Postmark top="HELD" sub="CHECK FIELDS" className="size-11" />
                )}
                <div>
                  <p className={cn('text-xs font-black', INK)}>الملصق النهائي</p>
                  <p dir="ltr" className={cn('font-mono text-[10px] tracking-[0.14em]', INK_FAINT)}>
                    {trackingNo(preview.fullUrl || 'empty')}
                  </p>
                </div>
              </div>
              {preview.ok && <DispatchCopy text={preview.fullUrl} label="نسخ الرابط" />}
            </div>

            {preview.errors.length > 0 ? (
              <div className="mt-3 space-y-1">
                {preview.errors.map((er) => (
                  <p key={er} className={cn('flex items-center gap-1.5 text-xs font-bold', RUST)}>
                    <XCircle className="size-3.5 shrink-0" aria-hidden /> {er}
                  </p>
                ))}
              </div>
            ) : (
              <>
                <p className={cn('mt-3 break-all font-mono text-[11px] leading-relaxed', INK)} dir="ltr">
                  {preview.fullUrl}
                </p>
                <div className="mt-3 flex flex-col items-center gap-1.5 border-t border-dashed border-[#d9c79c] pt-3 dark:border-[#4a3b28]">
                  <Barcode
                    seed={preview.fullUrl}
                    bars={44}
                    className="h-9"
                    barClass="bg-[#33291c] dark:bg-[#e6d5ac]"
                  />
                  <span dir="ltr" className={cn('font-mono text-[9px] tracking-[0.3em]', INK_FAINT)}>
                    {trackingNo(preview.fullUrl)}
                  </span>
                  <p className={cn('text-[9.5px]', INK_FAINT)}>
                    الباركود ورقم التتبع مولَّدان من الرابط — يتغيّران معك لحظياً
                  </p>
                </div>
              </>
            )}

            {preview.warnings.length > 0 && (
              <div className="mt-2.5 space-y-0.5">
                {preview.warnings.map((w) => (
                  <p key={w} className="text-[11px] text-[#8a6d3b] dark:text-[#d3b26a]">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={save}
              disabled={saving || !preview.ok}
              className="h-9 gap-1.5 bg-[#a13d2d] font-extrabold text-[#f8f2e2] shadow-sm shadow-[#8a2f1f]/40 transition-all hover:bg-[#8a2f1f]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PackageOpen className="size-4" aria-hidden />}
              {saving ? 'جارٍ الإرسال…' : editingId ? 'تحديث البوليصة' : 'إرسال إلى المكتبة'}
            </Button>
            {editingId && (
              <Button
                variant="ghost"
                onClick={cancelEdit}
                className={cn('h-9 font-bold', INK_SOFT)}
              >
                إلغاء التعديل
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════ 📋 سجل الإرساليات (المكتبة) ═══════════ */}
      <section className={cn(PAPER, 'animate-in-up stagger-2 overflow-hidden rounded-xl shadow-sm')}>
        {/* رأس إسبريسو دائم */}
        <div className="relative bg-gradient-to-bl from-[#332819] to-[#221a10] px-4 py-3 text-[#e6d5ac] sm:px-5">
          <div aria-hidden className="absolute inset-0 opacity-70" style={WEAVE} />
          <Barcode
            seed={`ledger-${libPlatform}-${showArchived ? 'arc' : 'act'}`}
            bars={40}
            className="absolute -end-3 top-2.5 h-9 opacity-[0.12]"
            barClass="bg-[#e6d5ac]"
          />

          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <ClipboardList className="size-5 shrink-0" aria-hidden />
              <h2 className="text-sm font-black">سجل الإرساليات</h2>
              <span
                dir="ltr"
                className="rounded border border-[#e6d5ac]/25 bg-[#e6d5ac]/10 px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-[0.14em] text-[#e6d5ac]"
              >
                {loadingLib && !lib ? '···' : `${lib?.campaigns.length ?? 0} ${showArchived ? 'ARC' : 'ACT'}`}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-[#4a3b28] bg-transparent text-xs font-bold text-[#e6d5ac] hover:bg-[#332819] hover:text-[#f5ecd7]"
              onClick={exportCsv}
              disabled={!lib?.campaigns.length}
            >
              <Download className="size-3.5" aria-hidden /> بيان الشحن
            </Button>
          </div>

          {/* شريط الأوامر */}
          <div className="relative mt-2.5 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className={cn('absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2')} aria-hidden />
              <Input
                className="h-8 w-[210px] border-[#4a3b28] bg-[#1c150d]/80 ps-8 text-xs text-[#e6d5ac] placeholder:text-[#8d7a57] focus-visible:border-[#d47a5f]/50 focus-visible:ring-[#d47a5f]/15"
                placeholder="بحث بالاسم أو الحملة أو الرابط…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={libPlatform} onValueChange={setLibPlatform}>
              <SelectTrigger
                className="h-8 w-[130px] border-[#4a3b28] bg-[#1c150d]/80 text-xs text-[#e6d5ac] focus-visible:ring-[#d47a5f]/15"
                dir="rtl"
              >
                <SelectValue placeholder="الناقل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الناقلين</SelectItem>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border border-[#4a3b28] bg-[#1c150d]/70 p-0.5">
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors',
                  !showArchived ? 'bg-[#e6d5ac] text-[#33291c]' : 'text-[#bfa878] hover:text-[#e6d5ac]',
                )}
              >
                النشطة
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors',
                  showArchived ? 'bg-[#e6d5ac] text-[#33291c]' : 'text-[#bfa878] hover:text-[#e6d5ac]',
                )}
              >
                <Archive className="size-3" aria-hidden />
                المؤرشفة
              </button>
            </div>
          </div>
        </div>

        {/* جسم السجل */}
        <div className="p-3.5 sm:p-4">
          {lib && lib.tablesReady === false && (
            <div className="relative mb-3 overflow-hidden rounded-lg border border-[#a13d2d]/35 bg-[#a13d2d]/[0.06] p-3 text-xs">
              <div aria-hidden className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-[#c96a4f] to-[#8a2f1f]" />
              <p className={cn('flex items-center gap-2 font-extrabold', RUST)}>
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                جدول مكتبة الحملات غير مُهيأ
              </p>
              <p className={cn('mt-1 leading-relaxed', INK_SOFT)}>
                شغّل ملف{' '}
                <code className="rounded bg-[#a13d2d]/10 px-1 py-0.5 font-mono text-[10px] text-[#a13d2d] dark:text-[#d47a5f]" dir="ltr">
                  TRACKING_TABLES.sql
                </code>{' '}
                في Supabase SQL Editor ثم أعد التحميل.
              </p>
            </div>
          )}

          {loadingLib && !lib ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className={cn('h-11 w-full rounded-lg', 'bg-[#e7dab8]/60 dark:bg-[#332819]/60')} />
              ))}
            </div>
          ) : !lib || lib.campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Barcode
                seed={showArchived ? 'warehouse-arc' : 'warehouse-empty'}
                bars={34}
                className="h-8 opacity-40"
                barClass="bg-[#6e5c3d] dark:bg-[#bfa878]"
              />
              <p className={cn('text-sm font-black', INK)}>
                {hasFilters ? 'لا نتائج مطابقة في هذا الرفّ' : showArchived ? 'المستودع المؤرشف فارغ' : 'المستودع فارغ'}
              </p>
              <p className={cn('max-w-md text-xs leading-relaxed', INK_FAINT)}>
                {hasFilters
                  ? 'جرّب مسح البحث أو تغيير الناقل — الإرساليات كلها ما زالت في السجل.'
                  : showArchived
                    ? 'الإرساليات المؤرشفة تُخزَّن هنا بدل الحذف — استعدها متى شئت.'
                    : 'ابنِ أول بوليصة من الأعلى — روابط utm_* يلتقطها نظام التتبع تلقائياً عند أول زيارة ويحفظ First/Last Touch لكل زائر، فتظهر نتائجها في القمع وتقارير الإسناد.'}
              </p>
              {hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('h-8 text-xs', OUTLINE_BTN)}
                  onClick={() => { setQ(''); setLibPlatform('all') }}
                >
                  مسح الفلاتر
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* جدول — شاشات متوسطة فأكبر */}
              <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#d9c79c] hover:bg-transparent dark:border-[#4a3b28]">
                      <TableHead className={cn('h-9 text-[11px] font-black', INK_SOFT)}>الإرسالية</TableHead>
                      <TableHead className={cn('h-9 text-[11px] font-black', INK_SOFT)}>الناقل</TableHead>
                      <TableHead className={cn('h-9 text-[11px] font-black', INK_SOFT)}>المسار</TableHead>
                      <TableHead className={cn('h-9 text-[11px] font-black', INK_SOFT)}>أداء ٣٠ يوم</TableHead>
                      <TableHead className={cn('h-9 w-[172px] text-[11px] font-black', INK_SOFT)}>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lib.campaigns.map((c) => {
                      const perf = lib.performance?.[c.utmCampaign.toLowerCase()]
                      return (
                        <TableRow
                          key={c.id}
                          className={cn(
                            'border-[#e3d5b0] transition-colors hover:bg-[#f1e8d2]/70 dark:border-[#332819] dark:hover:bg-[#2d2316]/70',
                            c.archived && 'opacity-60',
                          )}
                        >
                          <TableCell className="max-w-[250px] py-2.5">
                            <p className={cn('truncate text-[13px] font-bold', INK)} title={c.name}>
                              {c.name}
                            </p>
                            <p dir="ltr" className={cn('truncate font-mono text-[10px]', INK_FAINT)} title={c.fullUrl}>
                              {c.utmCampaign}
                            </p>
                            <p dir="ltr" className={cn('font-mono text-[9px] tracking-[0.1em]', RUST)}>
                              {trackingNo(c.fullUrl)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <CarrierChip platform={c.platform} />
                              {c.archived && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#94815f] dark:text-[#8d7a57]">
                                  <Archive className="size-2.5" aria-hidden /> مؤرشفة
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <p dir="ltr" className={cn('font-mono text-[11px]', INK_SOFT)}>
                              {c.utmSource} / {c.utmMedium}
                            </p>
                            <p dir="ltr" className={cn('truncate font-mono text-[9.5px]', INK_FAINT)} title={c.destinationUrl}>
                              {(() => { try { return new URL(c.destinationUrl).host } catch { return c.destinationUrl } })()}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs">
                            {perf ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className={cn('rounded-[4px] border border-[#d9c79c] bg-[#fdf9ec] px-1.5 py-0.5 text-[10px] font-bold dark:border-[#4a3b28] dark:bg-[#241c12]', INK_SOFT)}>
                                  تسجيلات <b className={cn('font-mono tabular-nums', INK)}>{fmtNum(perf.registrations)}</b>
                                </span>
                                <span className={cn('rounded-[4px] border border-[#cbb98d] bg-[#f1e8d2] px-1.5 py-0.5 text-[10px] font-bold dark:border-[#4a3b28] dark:bg-[#332819]', INK)}>
                                  مدفوعات <b className="font-mono tabular-nums">{fmtNum(perf.purchases)}</b>
                                </span>
                                <span className="rounded-[4px] border border-[#a13d2d]/30 bg-[#a13d2d]/[0.07] px-1.5 py-0.5 text-[10px] font-bold text-[#a13d2d] dark:border-[#d47a5f]/30 dark:bg-[#a13d2d]/15 dark:text-[#d47a5f]">
                                  {fmtMoney(perf.revenue)}
                                </span>
                              </div>
                            ) : (
                              <span className={cn('text-[10px]', INK_FAINT)}>بلا بيانات خلال ٣٠ يوماً</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <DispatchCopy text={c.fullUrl} size="icon" label="نسخ الرابط" />
                              <Button
                                variant="ghost" size="icon" className={cn('size-8 hover:bg-[#f1e8d2] dark:hover:bg-[#332819]', INK_SOFT)}
                                onClick={() => startEdit(c)} title="تعديل"
                              >
                                <Pencil className="size-3.5" aria-hidden />
                                <span className="sr-only">تعديل {c.name}</span>
                              </Button>
                              <Button
                                variant="ghost" size="icon" className={cn('size-8 hover:bg-[#f1e8d2] dark:hover:bg-[#332819]', INK_SOFT)}
                                onClick={() => toggleArchive(c)} title={c.archived ? 'استعادة' : 'أرشفة'}
                              >
                                {c.archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
                                <span className="sr-only">{c.archived ? 'استعادة' : 'أرشفة'} {c.name}</span>
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="size-8 text-[#a13d2d] hover:bg-[#a13d2d]/10 hover:text-[#8a2f1f] dark:text-[#d47a5f] dark:hover:bg-[#a13d2d]/15 dark:hover:text-[#d47a5f]"
                                onClick={() => remove(c)} title="حذف نهائي"
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                                <span className="sr-only">حذف {c.name}</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* بطاقات — الجوال */}
              <div className="space-y-2.5 sm:hidden">
                {lib.campaigns.map((c) => {
                  const perf = lib.performance?.[c.utmCampaign.toLowerCase()]
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'relative rounded-lg border border-[#d9c79c] bg-[#fdf9ec] p-3 dark:border-[#4a3b28] dark:bg-[#1b140d]',
                        c.archived && 'opacity-60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cn('truncate text-[13px] font-bold', INK)} title={c.name}>{c.name}</p>
                          <p dir="ltr" className={cn('truncate font-mono text-[10px]', INK_FAINT)}>{c.utmCampaign}</p>
                          <p dir="ltr" className={cn('font-mono text-[9px] tracking-[0.1em]', RUST)}>{trackingNo(c.fullUrl)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <CarrierChip platform={c.platform} />
                          {c.archived && (
                            <span className={cn('text-[9px] font-bold', INK_FAINT)}>مؤرشفة</span>
                          )}
                        </div>
                      </div>
                      <p dir="ltr" className={cn('mt-1.5 truncate font-mono text-[10px]', INK_SOFT)}>
                        {c.utmSource} / {c.utmMedium}
                      </p>
                      <div className="mt-2">
                        {perf ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className={cn('rounded-[4px] border border-[#d9c79c] px-1.5 py-0.5 text-[10px] font-bold dark:border-[#4a3b28]', INK_SOFT)}>
                              تسجيلات <b className={cn('font-mono', INK)}>{fmtNum(perf.registrations)}</b>
                            </span>
                            <span className={cn('rounded-[4px] border border-[#cbb98d] bg-[#f1e8d2] px-1.5 py-0.5 text-[10px] font-bold dark:border-[#4a3b28] dark:bg-[#332819]', INK)}>
                              مدفوعات <b className="font-mono">{fmtNum(perf.purchases)}</b>
                            </span>
                            <span className="rounded-[4px] border border-[#a13d2d]/30 bg-[#a13d2d]/[0.07] px-1.5 py-0.5 text-[10px] font-bold text-[#a13d2d] dark:border-[#d47a5f]/30 dark:bg-[#a13d2d]/15 dark:text-[#d47a5f]">
                              {fmtMoney(perf.revenue)}
                            </span>
                          </div>
                        ) : (
                          <span className={cn('text-[10px]', INK_FAINT)}>بلا بيانات خلال ٣٠ يوماً</span>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-dashed border-[#e3d5b0] pt-2.5 dark:border-[#332819]">
                        <DispatchCopy text={c.fullUrl} size="icon" label="نسخ الرابط" />
                        <Button variant="ghost" size="icon" className={cn('size-8', INK_SOFT)} onClick={() => startEdit(c)} title="تعديل">
                          <Pencil className="size-3.5" aria-hidden />
                          <span className="sr-only">تعديل {c.name}</span>
                        </Button>
                        <Button variant="ghost" size="icon" className={cn('size-8', INK_SOFT)} onClick={() => toggleArchive(c)} title={c.archived ? 'استعادة' : 'أرشفة'}>
                          {c.archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
                          <span className="sr-only">{c.archived ? 'استعادة' : 'أرشفة'} {c.name}</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-[#a13d2d] hover:bg-[#a13d2d]/10 hover:text-[#8a2f1f] dark:text-[#d47a5f] dark:hover:bg-[#a13d2d]/15" onClick={() => remove(c)} title="حذف نهائي">
                          <Trash2 className="size-3.5" aria-hidden />
                          <span className="sr-only">حذف {c.name}</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* تذييل السجل — كيف يعمل الالتقاط */}
              <div className={cn('mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-[#d9c79c] px-1 pt-3 text-[10.5px] dark:border-[#4a3b28]', INK_FAINT)}>
                <span>
                  <b className={INK_SOFT}>First Touch</b> يُحفظ من أول زيارة للرابط
                </span>
                <span>
                  <b className={INK_SOFT}>Last Touch</b> يُحدَّث مع كل زيارة جديدة
                </span>
                <span dir="ltr" className="ms-auto font-mono tracking-[0.2em]">NZ · UTM · LIB</span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
