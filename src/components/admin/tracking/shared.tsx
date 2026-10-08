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

export function FilterBar({
  value,
  onChange,
  showModel = true,
}: {
  value: RangeFilterState
  onChange: (next: RangeFilterState) => void
  showModel?: boolean
}) {
  const set = (patch: Partial<RangeFilterState>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-background p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => set({ preset: p.key })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                value.preset === p.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {value.preset === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs">
            <Input type="date" className="h-8 w-[135px]" value={value.fromStr} onChange={(e) => set({ fromStr: e.target.value })} />
            <span className="text-muted-foreground">→</span>
            <Input type="date" className="h-8 w-[135px]" value={value.toStr} onChange={(e) => set({ toStr: e.target.value })} />
          </div>
        )}

        <Select value={value.platform} onValueChange={(v) => set({ platform: v })}>
          <SelectTrigger className="h-8 w-[150px] text-xs" dir="rtl">
            <SelectValue placeholder="المنصة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المنصات</SelectItem>
            <SelectItem value="meta">Meta</SelectItem>
            <SelectItem value="google_ads">Google Ads</SelectItem>
            <SelectItem value="ga4">GA4</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
          </SelectContent>
        </Select>

        {showModel && (
          <Select value={value.model} onValueChange={(v) => set({ model: v as 'first' | 'last' })}>
            <SelectTrigger className="h-8 w-[135px] text-xs" dir="rtl">
              <SelectValue placeholder="نموذج الإسناد" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">First Touch</SelectItem>
              <SelectItem value="last">Last Touch</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-[120px] text-xs" placeholder="Source" value={value.source} onChange={(e) => set({ source: e.target.value })} dir="ltr" />
        <Input className="h-8 w-[120px] text-xs" placeholder="Medium" value={value.medium} onChange={(e) => set({ medium: e.target.value })} dir="ltr" />
        <Input className="h-8 w-[150px] text-xs" placeholder="Campaign" value={value.campaign} onChange={(e) => set({ campaign: e.target.value })} dir="ltr" />
      </div>
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
