'use client'

/**
 * مشتركات كومبوننتات التحليلات — Funnel / Attribution / UTM
 */

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** fetch مباشر بدون كاش أوفلاين — بيانات التحليلات يجب أن تكون حية */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...options })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw Object.assign(new Error(body?.error || `فشل الطلب (${res.status})`), { body })
  }
  return body as T
}

export type Preset = 'today' | '7d' | '30d' | 'custom'

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: '7d', label: '7 أيام' },
  { key: '30d', label: '30 يوم' },
  { key: 'custom', label: 'مخصص' },
]

export function presetRange(preset: Preset, fromStr?: string, toStr?: string): { from: string; to: string } {
  const now = new Date()
  if (preset === 'custom' && fromStr && toStr) {
    const to = new Date(`${toStr}T23:59:59.999`)
    return { from: new Date(`${fromStr}T00:00:00.000`).toISOString(), to: (isNaN(to.getTime()) ? now : to).toISOString() }
  }
  if (preset === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { from: start.toISOString(), to: now.toISOString() }
  }
  const days = preset === '7d' ? 7 : 30
  return { from: new Date(now.getTime() - days * 864e5).toISOString(), to: now.toISOString() }
}

export const fmtNum = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n)

export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null ? '—' : `${(v * 100).toFixed(digits)}%`

export const fmtPct100 = (v: number | null | undefined, digits = 1): string =>
  v == null ? '—' : `${v.toFixed(digits)}%`

export const fmtMoney = (v: number | null | undefined): string =>
  v == null ? '—' : `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(v)} ج.م`

// ─── شريط الفلاتر المشترك ─────────────────────────────────────────────

export interface RangeFilterState {
  preset: Preset
  fromStr: string
  toStr: string
  platform: string
  source: string
  medium: string
  campaign: string
  model: 'first' | 'last'
}

export const initialRange: RangeFilterState = {
  preset: '30d',
  fromStr: '',
  toStr: '',
  platform: 'all',
  source: '',
  medium: '',
  campaign: '',
  model: 'first',
}

export function rangeParams(f: RangeFilterState): URLSearchParams {
  const { from, to } = presetRange(f.preset, f.fromStr, f.toStr)
  const p = new URLSearchParams({ from, to, model: f.model })
  if (f.platform && f.platform !== 'all') p.set('platform', f.platform)
  if (f.source.trim()) p.set('source', f.source.trim())
  if (f.medium.trim()) p.set('medium', f.medium.trim())
  if (f.campaign.trim()) p.set('campaign', f.campaign.trim())
  return p
}

const PLATFORM_LABELS: Record<string, string> = {
  all: 'كل المنصات',
  meta: 'ميتا (فيسبوك وإنستجرام)',
  google_ads: 'إعلانات جوجل',
  ga4: 'جوجل أناليتكس',
  tiktok: 'تيك توك',
}

const MODEL_LABELS: Record<'first' | 'last', { label: string; hint: string }> = {
  first: { label: 'أول نقرة', hint: 'ينسب العميل لأول مصدر جاء منه' },
  last: { label: 'آخر نقرة', hint: 'ينسب العميل لآخر مصدر قبل التحويل' },
}

const UTM_FIELDS: { key: 'source' | 'medium' | 'campaign'; label: string; placeholder: string }[] = [
  { key: 'source', label: 'المصدر', placeholder: 'مثال: facebook' },
  { key: 'medium', label: 'الوسيلة', placeholder: 'مثال: cpc' },
  { key: 'campaign', label: 'الحملة', placeholder: 'مثال: ramadan_offer' },
]

/**
 * 🎛️ شريط الفلاتر 2026 — صف واحد مضغوط بالعربي بالكامل:
 * الفترة + المنصة + نموذج الإسناد + زر "فلاتر متقدمة" (مصدر/وسيلة/حملة)
 * مع شرائح للفلاتر النشطة قابلة للإزالة، و slot اختياري للأدوات الجانبية.
 */
export function FilterBar({
  value,
  onChange,
  showModel = true,
  trailing,
}: {
  value: RangeFilterState
  onChange: (next: RangeFilterState) => void
  showModel?: boolean
  trailing?: React.ReactNode
}) {
  const set = (patch: Partial<RangeFilterState>) => onChange({ ...value, ...patch })
  const activeUtm = UTM_FIELDS.filter((f) => value[f.key].trim())
  const [advanced, setAdvanced] = React.useState(activeUtm.length > 0)
  const activeCount = activeUtm.length + (value.platform !== 'all' ? 1 : 0)

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {/* الفترة */}
        <div role="group" aria-label="الفترة الزمنية" className="flex rounded-xl border bg-muted/40 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={value.preset === p.key}
              onClick={() => set({ preset: p.key })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-primary ${
                value.preset === p.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* المنصة */}
        <Select value={value.platform} onValueChange={(v) => set({ platform: v })}>
          <SelectTrigger className="h-9 w-auto min-w-[140px] gap-2 rounded-xl text-xs" dir="rtl">
            <span className="text-muted-foreground">المنصة:</span>
            <SelectValue>{PLATFORM_LABELS[value.platform] ?? value.platform}</SelectValue>
          </SelectTrigger>
          <SelectContent dir="rtl">
            {Object.entries(PLATFORM_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* نموذج الإسناد */}
        {showModel && (
          <Select value={value.model} onValueChange={(v) => set({ model: v as 'first' | 'last' })}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] gap-2 rounded-xl text-xs" dir="rtl">
              <span className="text-muted-foreground">الإسناد:</span>
              <SelectValue>{MODEL_LABELS[value.model].label}</SelectValue>
            </SelectTrigger>
            <SelectContent dir="rtl">
              {(Object.keys(MODEL_LABELS) as ('first' | 'last')[]).map((k) => (
                <SelectItem key={k} value={k}>
                  <div className="flex flex-col text-right">
                    <span>{MODEL_LABELS[k].label}</span>
                    <span className="text-[10px] text-muted-foreground">{MODEL_LABELS[k].hint}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* فلاتر متقدمة */}
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
            advanced || activeUtm.length ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" /></svg>
          فلاتر الحملة
          {activeUtm.length > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{activeUtm.length}</span>
          )}
        </button>

        {trailing && <div className="ms-auto flex flex-wrap items-center gap-2">{trailing}</div>}
      </div>

      {/* تاريخ مخصص */}
      {value.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-muted/20 p-2.5 text-xs animate-in fade-in slide-in-from-top-1">
          <span className="text-muted-foreground">من</span>
          <Input type="date" className="h-8 w-[150px] rounded-lg" value={value.fromStr} onChange={(e) => set({ fromStr: e.target.value })} />
          <span className="text-muted-foreground">إلى</span>
          <Input type="date" className="h-8 w-[150px] rounded-lg" value={value.toStr} onChange={(e) => set({ toStr: e.target.value })} />
        </div>
      )}

      {/* حقول الحملة */}
      {advanced && (
        <div className="grid gap-2 rounded-xl border border-dashed bg-muted/20 p-2.5 sm:grid-cols-3 animate-in fade-in slide-in-from-top-1">
          {UTM_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">{f.label}</span>
              <Input
                className="h-8 rounded-lg text-xs"
                placeholder={f.placeholder}
                value={value[f.key]}
                onChange={(e) => set({ [f.key]: e.target.value } as Partial<RangeFilterState>)}
                dir="ltr"
              />
            </label>
          ))}
        </div>
      )}

      {/* الفلاتر النشطة */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">فلاتر مفعّلة:</span>
          {value.platform !== 'all' && (
            <button type="button" onClick={() => set({ platform: 'all' })} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20">
              {PLATFORM_LABELS[value.platform] ?? value.platform} ✕
            </button>
          )}
          {activeUtm.map((f) => (
            <button key={f.key} type="button" onClick={() => set({ [f.key]: '' } as Partial<RangeFilterState>)} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20">
              {f.label}: <span dir="ltr">{value[f.key]}</span> ✕
            </button>
          ))}
          <button type="button" onClick={() => set({ platform: 'all', source: '', medium: '', campaign: '' })} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
            مسح الكل
          </button>
        </div>
      )}
    </div>
  )
}

export function StatChip({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'success' }) {
  const tones: Record<string, string> = {
    default: 'border bg-muted/40',
    primary: 'border border-primary/30 bg-primary/10',
    success: 'border border-emerald-500/40 bg-emerald-500/10',
  }
  return (
    <div className={`rounded-lg px-3 py-1.5 text-xs ${tones[tone]}`}>
      <span className="text-muted-foreground">{label}: </span>
      <b className="text-foreground">{value}</b>
    </div>
  )
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>
  )
}

/**
 * 🛡️ بانر مشترك لعدم جهوزية بيانات التحليلات — يظهر بدل 500:
 * يشرح خطوة الإصلاح (تشغيل TRACKING_TABLES.sql) ويعرض تفاصيل الخطأ
 * التقنية بشكل قابل للطي حتى تصلنا رسالة السبب الحقيقي من الإنتاج.
 */
export function DataIssueBanner({ errorDetail, degraded }: { errorDetail?: string; degraded?: boolean }) {
  const [open, setOpen] = React.useState(false)
  if (degraded) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        ⚠️ يتم العرض الآن بالمسار الاحتياطي (استعلام مبسط) — الأرقام صحيحة لكن فلاتر المصدر/الحملة معطلة مؤقتاً.
        {errorDetail && (
          <>
            {' '}
            <button onClick={() => setOpen((v) => !v)} className="underline underline-offset-2">
              {open ? 'إخفاء التفاصيل' : 'التفاصيل'}
            </button>
            {open && <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] opacity-80" dir="ltr">{errorDetail}</pre>}
          </>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
      <b>تعذّر قراءة بيانات التحليلات.</b> السبب غالباً أن جدولا التتبع أو جدول الحملات لم يُنشأ بعد في قاعدة البيانات.
      <br />
      الحل: شغّل ملف <code className="rounded bg-amber-500/20 px-1 font-mono">TRACKING_TABLES.sql</code> في Supabase ← SQL Editor (آمن — لا يمس البيانات) ثم أعد تحميل الصفحة.
      {errorDetail && (
        <>
          {' '}
          <button onClick={() => setOpen((v) => !v)} className="underline underline-offset-2">
            {open ? 'إخفاء تفاصيل الخطأ' : 'تفاصيل الخطأ'}
          </button>
          {open && <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded bg-amber-500/10 p-2 font-mono text-[10px] opacity-90" dir="ltr">{errorDetail}</pre>}
        </>
      )}
    </div>
  )
}

export function CopyButton({ text, label = 'نسخ', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'icon' }) {
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
  return (
    <Button type="button" variant="outline" size={size} onClick={copy} className={size === 'sm' ? 'h-8 gap-1.5 text-xs' : 'size-8'}>
      {copied ? '✓ تم النسخ' : label}
    </Button>
  )
}
