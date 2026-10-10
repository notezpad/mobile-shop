'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Smartphone, Shirt, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ══════════════════════════════════════════════════════════════════
   خطط الاشتراك — الأنواع والثوابت والعناصر المشتركة
   ══════════════════════════════════════════════════════════════════ */

export interface PlanSubscriberPreview {
  id: number
  shopName: string
  period: string
  endDate: string
}

export interface PlanRow {
  id: number
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxUsers: number
  maxProducts: number
  maxBranches: number
  trialDays: number
  features: string | null
  isActive: boolean
  sortOrder: number
  subscribersCount: number
  businessType?: string | null
  capabilities?: string | null
  enabledModules?: string | null
  isCanonical?: boolean
  // ── تحليلات إضافية من الـ API (اختيارية للتوافق مع النسخ القديمة) ──
  trialCount?: number
  monthlyCount?: number
  yearlyCount?: number
  mrr?: number
  expiringSoonCount?: number
  nextExpiring?: PlanSubscriberPreview[]
}

export type Billing = 'monthly' | 'yearly'
export type ViewMode = 'cards' | 'list' | 'compare'
export type SortKey = 'manual' | 'price-asc' | 'price-desc' | 'subs' | 'revenue' | 'name'
export type TypeFilter = 'all' | 'electronics' | 'fashion'
export type StatusFilter = 'all' | 'active' | 'inactive'
export type QuickFilter = 'none' | 'expiring' | 'no-subs' | 'trials'

export const UNLIMITED = 999999

/* ─── البيانات الوصفية (محفوظة من النسخة السابقة بدون تغيير في المعنى) ─── */

export const CAPABILITIES_META: { key: string; label: string; desc: string }[] = [
  {
    key: 'multi_unit',
    label: 'وحدات الجملة (دستة)',
    desc: 'بيع بالجملة — نص دستة / دستة / كرتونة. لو حاب تبيع بلقطعة، ضيف وحدة factor=1.',
  },
  { key: 'collections', label: 'الكوليكشن', desc: 'تجميع المنتجات في كوليكشنات وخصم جماعي' },
  {
    key: 'variants',
    label: 'الأشكال/المقاسات (Variants)',
    desc: 'إدارة منتجات بأشكال أو مقاسات متعددة (ألوان/مقاسات) + المساعد الذكي — متاحة في كل باقات الملابس.',
  },
  { key: 'returns_exchange', label: 'المرتجعات والاستبدال', desc: 'تسجيل مرتجعات واستبدال الفواتير' },
  { key: 'loyalty', label: 'نقاط الولاء', desc: 'تجميع واستبدال نقاط ولاء العملاء' },
]

export const MODULES_META: { key: string; label: string; desc: string; electronicsOnly?: boolean }[] = [
  { key: 'dashboard', label: 'لوحة المعلومات', desc: 'الصفحة الرئيسية للنظام' },
  { key: 'pos', label: 'نقطة البيع', desc: 'شاشة الكاشير لإنشاء الفواتير' },
  { key: 'products', label: 'المنتجات', desc: 'إدارة المنتجات والباركود' },
  { key: 'sales', label: 'سجل المبيعات', desc: 'الفواتير السابقة ومرتجعاتها' },
  { key: 'customers', label: 'العملاء', desc: 'قاعدة بيانات العملاء وأرصدتهم' },
  { key: 'suppliers', label: 'الموردين', desc: 'قائمة الموردين والمستحقات' },
  { key: 'purchases', label: 'المشتريات', desc: 'أوامر الشراء من الموردين' },
  { key: 'inventory', label: 'المخزون', desc: 'حركات المخزون والجرد والتحويلات' },
  { key: 'reports', label: 'التقارير', desc: 'تقارير المبيعات والأرباح' },
  { key: 'branches', label: 'الفروع', desc: 'إدارة الفروع المتعددة' },
  { key: 'settings', label: 'الإعدادات', desc: 'إعدادات المحل (حرجة — مفعّلة دائماً)' },
  { key: 'users', label: 'المستخدمين', desc: 'إدارة المستخدمين (حرجة — مفعّلة دائماً)' },
  { key: 'maintenance', label: 'الصيانة', desc: 'أوامر صيانة الأجهزة — إلكترونيات فقط', electronicsOnly: true },
  {
    key: 'finance',
    label: 'المعاملات المالية',
    desc: 'فودافون كاش/إنستاباي/فوري — إلكترونيات فقط',
    electronicsOnly: true,
  },
  { key: 'expenses', label: 'المصروفات', desc: 'مصروفات المحل (إيجار، مرتبات، كهرباء)' },
  { key: 'cash', label: 'الخزنة', desc: 'حركات الخزنة (نقدية)' },
]

export const CRITICAL_MODULES = ['settings', 'users']

export const ELECTRONICS_DEFAULTS = [
  'dashboard', 'pos', 'products', 'sales', 'maintenance', 'customers', 'suppliers',
  'purchases', 'inventory', 'finance', 'expenses', 'cash', 'reports', 'settings', 'users', 'branches',
]
export const FASHION_DEFAULTS = [
  'dashboard', 'pos', 'products', 'sales', 'customers', 'suppliers',
  'purchases', 'inventory', 'expenses', 'cash', 'reports', 'settings', 'users', 'branches',
]

export const BUSINESS_TYPE_LABEL: Record<string, string> = {
  electronics: 'موبايل وكمبيوتر',
  fashion: 'ملابس وأحذية',
}

export const SORT_LABEL: Record<SortKey, string> = {
  manual: 'الترتيب اليدوي',
  'price-asc': 'السعر: الأقل أولاً',
  'price-desc': 'السعر: الأعلى أولاً',
  subs: 'الأكثر مشتركين',
  revenue: 'الأعلى إيراداً',
  name: 'الاسم (أ → ي)',
}

/* ─── ألوان الباقات — كل باقة تأخذ لوناً ثابتاً حسب موضعها في الترتيب اليدوي ─── */

export interface PlanTheme {
  grad: string
  soft: string
  text: string
  dot: string
  glow: string
  ring: string
  hoverRing: string
  hex: string
}

export const PLAN_THEMES: PlanTheme[] = [
  { grad: 'from-indigo-500 to-violet-600', soft: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-300', dot: 'bg-indigo-500', glow: 'bg-indigo-500', ring: 'ring-indigo-500/30', hoverRing: 'hover:ring-indigo-500/30', hex: '#6366f1' },
  { grad: 'from-violet-500 to-fuchsia-600', soft: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-300', dot: 'bg-violet-500', glow: 'bg-violet-500', ring: 'ring-violet-500/30', hoverRing: 'hover:ring-violet-500/30', hex: '#8b5cf6' },
  { grad: 'from-fuchsia-500 to-pink-600', soft: 'bg-fuchsia-500/10', text: 'text-fuchsia-600 dark:text-fuchsia-300', dot: 'bg-fuchsia-500', glow: 'bg-fuchsia-500', ring: 'ring-fuchsia-500/30', hoverRing: 'hover:ring-fuchsia-500/30', hex: '#d946ef' },
  { grad: 'from-sky-500 to-blue-600', soft: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-300', dot: 'bg-sky-500', glow: 'bg-sky-500', ring: 'ring-sky-500/30', hoverRing: 'hover:ring-sky-500/30', hex: '#0ea5e9' },
  { grad: 'from-emerald-500 to-teal-600', soft: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-500', glow: 'bg-emerald-500', ring: 'ring-emerald-500/30', hoverRing: 'hover:ring-emerald-500/30', hex: '#10b981' },
  { grad: 'from-amber-500 to-orange-600', soft: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-500', glow: 'bg-amber-500', ring: 'ring-amber-500/30', hoverRing: 'hover:ring-amber-500/30', hex: '#f59e0b' },
  { grad: 'from-rose-500 to-red-600', soft: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-300', dot: 'bg-rose-500', glow: 'bg-rose-500', ring: 'ring-rose-500/30', hoverRing: 'hover:ring-rose-500/30', hex: '#f43f5e' },
  { grad: 'from-cyan-500 to-sky-600', soft: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-300', dot: 'bg-cyan-500', glow: 'bg-cyan-500', ring: 'ring-cyan-500/30', hoverRing: 'hover:ring-cyan-500/30', hex: '#06b6d4' },
]

export const themeFor = (i: number): PlanTheme => PLAN_THEMES[((i % PLAN_THEMES.length) + PLAN_THEMES.length) % PLAN_THEMES.length]

/* ─── دوال مساعدة ─── */

export const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const isUnlimited = (v: number) => v >= UNLIMITED
export const fmtLimit = (v: number) => (isUnlimited(v) ? '∞' : num(v))

export function parseFeatures(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join('\n')
    return raw
  } catch {
    return raw
  }
}

export function featureList(raw: string | null | undefined): string[] {
  return parseFeatures(raw)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseCaps(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map(String)
  } catch {
    /* ignore */
  }
  return []
}

export const isFashion = (p: Pick<PlanRow, 'businessType'>) => (p.businessType ?? 'electronics') === 'fashion'

export function defaultsFor(businessType: string | null | undefined): string[] {
  return businessType === 'fashion' ? [...FASHION_DEFAULTS] : [...ELECTRONICS_DEFAULTS]
}

/** الوحدات الفعلية للباقة: المحفوظة، أو الافتراضية حسب نوع النشاط (للباقات القديمة) */
export function modulesOf(p: PlanRow): { list: string[]; isDefault: boolean } {
  const saved = parseCaps(p.enabledModules)
  if (saved.length > 0) return { list: saved, isDefault: false }
  return { list: defaultsFor(p.businessType), isDefault: true }
}

export function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function periodLabel(period: string): string {
  if (period === 'monthly') return 'شهري'
  if (period === 'yearly') return 'سنوي'
  if (period === 'trial') return 'تجربة'
  return period
}

/** الإيراد الشهري المتكرر للباقة (من الـ API، أو تقدير بسيط للنسخ القديمة) */
export function planMrr(p: PlanRow): number {
  if (typeof p.mrr === 'number') return p.mrr
  return p.priceMonthly * p.subscribersCount
}

export function yearlySavings(p: Pick<PlanRow, 'priceMonthly' | 'priceYearly'>) {
  const full = p.priceMonthly * 12
  const savings = full - p.priceYearly
  const pct = p.priceMonthly > 0 && p.priceYearly > 0 && savings > 0 ? Math.round((savings / full) * 100) : 0
  return { savings: p.priceYearly > 0 ? savings : 0, pct }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/* ══════════════ عناصر واجهة صغيرة ══════════════ */

/** عدّاد متحرّك للأرقام الكبيرة (يحترم تفضيل تقليل الحركة) */
export function useCountUp(target: number, duration = 800) {
  const reduce = useReducedMotion()
  const [val, setVal] = React.useState(0)
  const fromRef = React.useRef(0)

  React.useEffect(() => {
    if (reduce) {
      fromRef.current = target
      setVal(target)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = from + (target - from) * eased
      fromRef.current = v
      setVal(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduce])

  return val
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value)
  return <span className={cn('tabular-nums', className)}>{num(Math.round(v))}</span>
}

const PILL_TONES = {
  neutral: 'border-border bg-muted text-foreground/70',
  indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  fuchsia: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
} as const

export type PillTone = keyof typeof PILL_TONES

export function Pill({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: PillTone
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-bold leading-4',
        PILL_TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  )
}

/** أيقونة الباقة — مربع متدرّج بلون الباقة ورمز نوع النشاط */
export function PlanGlyph({
  plan,
  theme,
  size = 'md',
  className,
}: {
  plan: Pick<PlanRow, 'businessType' | 'isActive'>
  theme: PlanTheme
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = isFashion(plan) ? Shirt : Smartphone
  const box = size === 'lg' ? 'size-14 rounded-2xl' : size === 'sm' ? 'size-8 rounded-xl' : 'size-11 rounded-2xl'
  const ic = size === 'lg' ? 'size-6' : size === 'sm' ? 'size-4' : 'size-5'
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/30',
        box,
        theme.grad,
        !plan.isActive && 'opacity-60 saturate-50',
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-full bg-white/25 blur-[6px]" />
      <Icon className={cn('relative drop-shadow-sm', ic)} strokeWidth={2.2} />
    </span>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  badge?: number | string
}

/** مفتاح تبديل بحركة انسيابية (مؤشر ينزلق بين الخيارات) */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  compact = false,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentedOption<T>[]
  ariaLabel: string
  compact?: boolean
  className?: string
}) {
  const id = React.useId()
  const reduce = useReducedMotion()
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-muted p-0.5 backdrop-blur',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative inline-flex items-center rounded-full font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/50',
              compact ? 'px-2.5 py-1 text-[13.5px]' : 'px-3.5 py-1.5 text-[14px]',
              active ? 'text-foreground' : 'text-foreground/70 hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={id}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
                className="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {o.icon ? <o.icon className="size-3.5" /> : null}
              {o.label}
              {o.badge !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[12px] font-black tabular-nums',
                    active ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'bg-muted text-foreground/70',
                  )}
                >
                  {o.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** شريط تقدّم رفيع بحواف دائرية */
export function MiniBar({
  pct,
  className,
  barClassName,
}: {
  pct: number
  className?: string
  barClassName?: string
}) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full bg-gradient-to-l from-indigo-500 to-violet-500 transition-[width] duration-700', barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  )
}
