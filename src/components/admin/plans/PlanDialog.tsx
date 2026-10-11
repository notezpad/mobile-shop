'use client'

import * as React from 'react'
import {
  Plus,
  Loader2,
  Save,
  Check,
  X,
  Users,
  Package,
  Building2,
  Smartphone,
  Shirt,
  Sparkles,
  Gauge,
  Layers,
  Lock,
  LockOpen,
  Power,
  RefreshCw,
  Infinity as InfinityIcon,
  Clock3,
  Info,
  TriangleAlert,
  CircleDot,
  Wand2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type PlanRow,
  type PlanTheme,
  CAPABILITIES_META,
  CRITICAL_MODULES,
  MODULES_META,
  PlanGlyph,
  Pill,
  UNLIMITED,
  defaultsFor,
  fmtLimit,
  featureList,
  isUnlimited,
  num,
  parseCaps,
  themeFor,
  yearlySavings,
} from './plan-shared'

/* ══════════════ حالة النموذج ══════════════ */

interface FormState {
  code: string
  name: string
  description: string
  businessType: 'electronics' | 'fashion'
  priceMonthly: string
  priceYearly: string
  maxUsers: string
  maxProducts: string
  maxBranches: string
  trialDays: string
  sortOrder: string
  features: string[]
  capabilities: string[]
  enabledModules: string[]
  isActive: boolean
}

function blankForm(sortOrder: number): FormState {
  return {
    code: '',
    name: '',
    description: '',
    businessType: 'electronics',
    priceMonthly: '0',
    priceYearly: '0',
    maxUsers: '1',
    maxProducts: '50',
    maxBranches: '1',
    trialDays: '0',
    sortOrder: String(sortOrder),
    features: [],
    capabilities: [],
    enabledModules: defaultsFor('electronics'),
    isActive: true,
  }
}

function formFromPlan(p: Partial<PlanRow>, sortOrder: number): FormState {
  const bt: 'electronics' | 'fashion' = p.businessType === 'fashion' ? 'fashion' : 'electronics'
  const mods = parseCaps(p.enabledModules)
  return {
    code: p.code ?? '',
    name: p.name ?? '',
    description: p.description ?? '',
    businessType: bt,
    priceMonthly: String(p.priceMonthly ?? 0),
    priceYearly: String(p.priceYearly ?? 0),
    maxUsers: String(p.maxUsers ?? 1),
    maxProducts: String(p.maxProducts ?? 50),
    maxBranches: String(p.maxBranches ?? 1),
    trialDays: String(p.trialDays ?? 0),
    sortOrder: String(p.sortOrder ?? sortOrder),
    features: featureList(p.features),
    capabilities: parseCaps(p.capabilities),
    enabledModules: mods.length > 0 ? mods : defaultsFor(bt),
    isActive: p.isActive ?? true,
  }
}

const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type TabKey = 'basic' | 'pricing' | 'features' | 'modules'

/* ══════════════ حقول صغيرة ══════════════ */

function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[15px] font-bold">{label}</Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[13.5px] font-semibold text-rose-600 dark:text-rose-400">
          <TriangleAlert className="size-3" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13.5px] leading-relaxed text-foreground/70">{hint}</p>
      ) : null}
    </div>
  )
}

function MoneyInput({
  value,
  onChange,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        aria-invalid={invalid}
        className="h-11 rounded-xl pe-14 font-mono text-base font-bold tabular-nums"
      />
      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[13.5px] font-bold text-foreground/70">
        ج.م
      </span>
    </div>
  )
}

function LimitField({
  icon: Icon,
  label,
  value,
  onChange,
  min,
  fallback,
}: {
  icon: typeof Users
  label: string
  value: string
  onChange: (v: string) => void
  min: number
  fallback: number
}) {
  const unlimited = isUnlimited(Number(value) || 0)
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[14.5px] font-bold">
          <Icon className="size-3.5 text-indigo-500" />
          {label}
        </span>
        <button
          type="button"
          aria-pressed={unlimited}
          title="بدون حدود"
          onClick={() => onChange(unlimited ? String(fallback) : String(UNLIMITED))}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-lg border text-[14px] font-black transition-all sm:size-7',
            unlimited
              ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
              : 'bg-muted text-foreground/70 hover:border-indigo-400 hover:text-indigo-600',
          )}
        >
          <InfinityIcon className="size-4" strokeWidth={2.4} />
        </button>
      </div>
      <Input
        type={unlimited ? 'text' : 'number'}
        min={min}
        value={unlimited ? '∞' : value}
        disabled={unlimited}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="h-10 rounded-xl text-center font-mono text-base font-extrabold tabular-nums"
      />
    </div>
  )
}

function ToggleCard({
  checked,
  disabled,
  locked,
  onClick,
  title,
  desc,
  badge,
}: {
  checked: boolean
  disabled?: boolean
  locked?: boolean
  onClick: () => void
  title: string
  desc: string
  badge?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex items-start gap-2.5 rounded-2xl border p-3 text-start transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
        disabled
          ? 'cursor-not-allowed border-border bg-muted/40'
          : checked
            ? 'cursor-pointer border-indigo-500/40 bg-indigo-500/[0.07] shadow-sm'
            : 'cursor-pointer border-border bg-card hover:border-indigo-400/50 hover:bg-muted/40',
        disabled && !locked && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-all',
          checked
            ? 'border-indigo-500 bg-gradient-to-br from-indigo-500 to-violet-600 text-white'
            : 'border-muted-foreground/30 text-transparent',
        )}
      >
        {locked ? (
          <Lock className="size-2.5" strokeWidth={2.6} />
        ) : (
          <Check className="size-3" strokeWidth={3.5} />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-[15.5px] font-bold leading-tight">
          {title}
          {badge && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[12px] font-bold text-foreground/70">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-foreground/70">{desc}</span>
      </span>
    </button>
  )
}

/* ══════════════ معاينة حيّة ══════════════ */

function PlanPreview({ form, theme }: { form: FormState; theme: PlanTheme }) {
  const m = Number(form.priceMonthly) || 0
  const y = Number(form.priceYearly) || 0
  const { pct } = yearlySavings({ priceMonthly: m, priceYearly: y })
  const isFree = m === 0 && y === 0
  const Icon = form.businessType === 'fashion' ? Shirt : Smartphone
  const limits = [
    { icon: Users, label: 'مستخدمين', v: Number(form.maxUsers) || 0 },
    { icon: Package, label: 'منتجات', v: Number(form.maxProducts) || 0 },
    { icon: Building2, label: 'فروع', v: Number(form.maxBranches) || 0 },
  ]
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-foreground/15 bg-card p-4 shadow-lg ring-1',
        theme.ring,
        !form.isActive && 'opacity-70 saturate-50',
      )}
    >
      <div
        aria-hidden
        className={cn('pointer-events-none absolute -top-16 -end-12 size-44 rounded-full opacity-25 blur-3xl', theme.glow)}
      />
      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-1 ring-inset ring-white/30',
            theme.grad,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-extrabold leading-tight">{form.name || 'اسم الباقة'}</p>
          <p className="truncate font-mono text-[13px] text-foreground/70" dir="ltr">
            {form.code || 'plan-code'}
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        {isFree ? (
          <p className={cn('text-3xl font-black', theme.text)}>مجاناً</p>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="text-4xl font-black tracking-tight tabular-nums">{num(m)}</span>
            <span className="text-[14px] font-bold text-foreground/70">ج.م / شهر</span>
          </p>
        )}
        {y > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-foreground/70">
            أو <span className="font-mono font-extrabold text-foreground">{num(y)}</span> ج.م سنوياً
            {pct > 0 && <Pill tone="emerald">وفّر {pct}%</Pill>}
          </p>
        )}
        {(Number(form.trialDays) || 0) > 0 && (
          <Pill tone="indigo" icon={Clock3} className="mt-2">
            تجربة مجانية {Number(form.trialDays)} يوم
          </Pill>
        )}
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-1.5">
        {limits.map((l) => (
          <div key={l.label} className="rounded-xl bg-muted px-2 py-2 text-center">
            <l.icon className={cn('mx-auto size-3.5', theme.text)} />
            <p className="mt-1 font-mono text-[15.5px] font-black tabular-nums">{fmtLimit(l.v)}</p>
            <p className="text-[12px] font-semibold text-foreground/70">{l.label}</p>
          </div>
        ))}
      </div>

      {form.features.length > 0 && (
        <ul className="relative mt-4 space-y-1.5">
          {form.features.slice(0, 5).map((f, i) => (
            <li key={`${f}-${i}`} className="flex items-start gap-1.5 text-[14px] leading-snug">
              <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full', theme.soft, theme.text)}>
                <Check className="size-2.5" strokeWidth={3.5} />
              </span>
              <span>{f}</span>
            </li>
          ))}
          {form.features.length > 5 && (
            <li className="ps-5 text-[13px] font-bold text-foreground/70">
              +{form.features.length - 5} مميزات أخرى
            </li>
          )}
        </ul>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3">
        <Pill icon={Layers}>{form.enabledModules.length} وحدة</Pill>
        <Pill>{form.capabilities.length} صلاحية</Pill>
        <Pill tone={form.isActive ? 'emerald' : 'neutral'}>{form.isActive ? 'مفعّلة' : 'معطّلة'}</Pill>
      </div>
    </div>
  )
}

/* ══════════════ الديالوق ══════════════ */

export function PlanDialog({
  plan,
  seed,
  open,
  onOpenChange,
  onSaved,
  initialTab = 'basic',
  nextSortOrder,
  existingCodes,
  themeIndex,
}: {
  plan: PlanRow | null
  /** بيانات مبدئية لإنشاء باقة جديدة (مثلاً عند نسخ باقة موجودة) */
  seed?: Partial<PlanRow> | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
  initialTab?: TabKey
  nextSortOrder: number
  existingCodes: string[]
  themeIndex: number
}) {
  const isEdit = !!plan
  const theme = themeFor(themeIndex)

  const [tab, setTab] = React.useState<TabKey>('basic')
  const [form, setForm] = React.useState<FormState>(() => blankForm(nextSortOrder))
  const [initialJson, setInitialJson] = React.useState('')
  const [featureDraft, setFeatureDraft] = React.useState('')
  const [codeUnlocked, setCodeUnlocked] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [confirmClose, setConfirmClose] = React.useState(false)
  /** معاينة حيّة قابلة للطي — تظهر على الجوال/التابلت فقط (على lg+ لها عمود جانبي) */
  const [previewOpen, setPreviewOpen] = React.useState(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // تهيئة النموذج عند كل فتح
  React.useEffect(() => {
    if (!open) return
    const f = plan
      ? formFromPlan(plan, nextSortOrder)
      : seed
        ? formFromPlan(seed, nextSortOrder)
        : blankForm(nextSortOrder)
    setForm(f)
    setInitialJson(JSON.stringify(f))
    setTab(initialTab)
    setFeatureDraft('')
    setCodeUnlocked(false)
    setTouched(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan?.id])

  const dirty = open && JSON.stringify(form) !== initialJson

  /* ─── التحقق ─── */
  const m = Number(form.priceMonthly) || 0
  const y = Number(form.priceYearly) || 0
  const { savings, pct } = yearlySavings({ priceMonthly: m, priceYearly: y })

  const codeNorm = form.code.trim().toLowerCase()
  const errors = {
    code: !codeNorm
      ? 'الكود مطلوب'
      : !CODE_RE.test(codeNorm)
        ? 'حروف إنجليزية صغيرة وأرقام وشرطات فقط (مثال: fashion-pro)'
        : existingCodes.some((c) => c === codeNorm && c !== plan?.code)
          ? 'هذا الكود مستخدم في باقة أخرى'
          : null,
    name: !form.name.trim() ? 'الاسم مطلوب' : null,
  }
  const tabHasError: Record<TabKey, boolean> = {
    basic: !!(errors.code || errors.name),
    pricing: false,
    features: false,
    modules: false,
  }
  const hasErrors = !!(errors.code || errors.name)
  const showErr = (k: 'code' | 'name') => (touched ? errors[k] : null)

  const yearlyNoDiscount = m > 0 && y > 0 && y >= m * 12

  /* ─── المزايا ─── */
  const addFeatures = (raw: string) => {
    const parts = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setForm((f) => ({
      ...f,
      features: [...f.features, ...parts.filter((p) => !f.features.includes(p))],
    }))
  }

  const generateFromLimits = () => {
    const u = Number(form.maxUsers) || 1
    const p = Number(form.maxProducts) || 0
    const b = Number(form.maxBranches) || 1
    const lines = [
      isUnlimited(u) ? 'مستخدمون غير محدودون' : u === 1 ? 'مستخدم واحد' : `حتى ${num(u)} مستخدمين`,
      isUnlimited(p) ? 'منتجات غير محدودة' : `حتى ${num(p)} منتج`,
      isUnlimited(b) ? 'فروع غير محدودة' : b === 1 ? 'فرع واحد' : `حتى ${num(b)} فروع`,
    ]
    addFeatures(lines.join('\n'))
  }

  /* ─── الوحدات ─── */
  const toggleModule = (key: string) =>
    setForm((f) => ({
      ...f,
      enabledModules: f.enabledModules.includes(key)
        ? f.enabledModules.filter((x) => x !== key)
        : [...f.enabledModules, key],
    }))

  const availableModules = MODULES_META.filter(
    (mod) => !(form.businessType === 'fashion' && mod.electronicsOnly),
  )
  const enabledCount = new Set([...form.enabledModules, ...CRITICAL_MODULES]).size

  /* ─── الحفظ ─── */
  const save = async () => {
    setTouched(true)
    if (hasErrors) {
      setTab('basic')
      toast.error(errors.code || errors.name || 'تحقق من البيانات')
      return
    }
    setSaving(true)
    try {
      // 🛡️ الوحدات الحرجة (الإعدادات/المستخدمين) تُضاف دائماً
      const finalModules = Array.from(new Set([...form.enabledModules, ...CRITICAL_MODULES]))
      const payload = {
        code: codeNorm,
        name: form.name.trim(),
        description: form.description,
        businessType: form.businessType,
        capabilities: form.capabilities,
        enabledModules: finalModules,
        priceMonthly: m,
        priceYearly: y,
        maxUsers: Number(form.maxUsers) || 1,
        maxProducts: Number(form.maxProducts) || 50,
        maxBranches: Number(form.maxBranches) || 1,
        trialDays: Number(form.trialDays) || 0,
        features: form.features.join('\n'),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      }
      if (isEdit && plan) {
        await api(`/api/admin/plans/${plan.id}`, { method: 'PUT', body: payload })
        toast.success(`تم تحديث «${payload.name}»`)
      } else {
        await api('/api/admin/plans', { method: 'POST', body: payload })
        toast.success(`تم إنشاء «${payload.name}»`)
      }
      setInitialJson(JSON.stringify(form))
      onOpenChange(false)
      onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const requestClose = (o: boolean) => {
    if (!o && dirty && !saving) {
      setConfirmClose(true)
      return
    }
    onOpenChange(o)
  }

  const tabs: { v: TabKey; label: string; icon: typeof Sparkles }[] = [
    { v: 'basic', label: 'الأساسيات', icon: Sparkles },
    { v: 'pricing', label: 'التسعير والحدود', icon: Gauge },
    { v: 'features', label: 'المزايا والصلاحيات', icon: Check },
    { v: 'modules', label: 'الوحدات', icon: Layers },
  ]

  const codeLocked = isEdit && !!plan?.isCanonical && !codeUnlocked

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          mobileSheet
          className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-5xl"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              if (!saving) save()
            }
          }}
        >
          {/* ═══ الترويسة ═══ */}
          <div className="relative shrink-0 overflow-hidden border-b px-4 pb-3.5 pt-6 sm:px-5 sm:pb-4 sm:pt-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/[0.12] via-violet-500/[0.07] to-transparent"
            />
            <div
              aria-hidden
              className={cn('pointer-events-none absolute -top-20 -start-10 size-56 rounded-full opacity-20 blur-3xl', theme.glow)}
            />
            <DialogHeader className="relative gap-1">
              <div className="flex items-center gap-3">
                <PlanGlyph
                  plan={{ businessType: form.businessType, isActive: form.isActive }}
                  theme={theme}
                  size="md"
                />
                <div className="min-w-0 flex-1 text-start">
                  <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-black">
                    {isEdit ? 'تعديل الباقة' : seed ? 'نسخة جديدة من باقة' : 'باقة جديدة'}
                    {dirty && (
                      <Pill tone="amber" icon={CircleDot}>
                        تعديلات غير محفوظة
                      </Pill>
                    )}
                  </DialogTitle>
                  <DialogDescription className="truncate text-[14.5px]">
                    {isEdit
                      ? `${plan?.name} · ${plan?.subscribersCount ?? 0} مشترك نشط`
                      : 'حدّد التسعير والحدود والمزايا والوحدات — والمعاينة الحيّة بجانب النموذج'}
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  onClick={() => requestClose(false)}
                  aria-label="إغلاق"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-foreground/70 backdrop-blur transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </DialogHeader>

            {isEdit && (plan?.subscribersCount ?? 0) > 0 && (
              <p className="relative mt-3 flex items-start gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[14px] font-medium leading-relaxed text-amber-800 dark:text-amber-200">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                هذه الباقة مرتبطة بـ {plan?.subscribersCount} اشتراك نشط — تغيير الوحدات والحدود يؤثّر عليهم مباشرة.
              </p>
            )}
          </div>

          {/* ═══ الجسم: نموذج + معاينة ═══ */}
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_310px]">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as TabKey)}
              className="flex min-h-0 min-w-0 flex-col gap-0"
            >
              <div className="shrink-0 border-b px-4 py-2.5">
                <TabsList className="scrollbar-none h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-muted p-1">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.v}
                      value={t.v}
                      className="relative shrink-0 flex-none gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[14px] font-bold sm:px-3 sm:py-1.5 data-[state=active]:bg-background data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm dark:data-[state=active]:text-indigo-300"
                    >
                      <t.icon className="size-3.5" />
                      {t.label}
                      {touched && tabHasError[t.v] && (
                        <span className="size-1.5 rounded-full bg-rose-500" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
                {/* ── الأساسيات ── */}
                <TabsContent value="basic" className="mt-0 space-y-5">
                  <Field label="نوع النشاط التجاري" hint="يحدّد الوحدات الافتراضية المتاحة للباقة (الصيانة والمعاملات المالية للإلكترونيات فقط).">
                    <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
                      {(
                        [
                          { v: 'electronics', label: 'موبايل وكمبيوتر', icon: Smartphone },
                          { v: 'fashion', label: 'ملابس وأحذية', icon: Shirt },
                        ] as const
                      ).map((o) => {
                        const active = form.businessType === o.v
                        return (
                          <button
                            key={o.v}
                            type="button"
                            aria-pressed={active}
                            onClick={() => set('businessType', o.v)}
                            className={cn(
                              'flex items-center gap-3 rounded-2xl border p-3 text-start transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                              active
                                ? 'border-indigo-500/50 bg-indigo-500/[0.08] shadow-sm ring-1 ring-indigo-500/20'
                                : 'bg-card hover:border-indigo-400/40 hover:bg-muted/40',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-10 items-center justify-center rounded-xl transition-colors',
                                active
                                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                                  : 'bg-muted text-foreground/70',
                              )}
                            >
                              <o.icon className="size-5" />
                            </span>
                            <span className="text-[15.5px] font-extrabold">{o.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="اسم الباقة *" error={showErr('name')}>
                      <Input
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        placeholder="الباقة الاحترافية"
                        aria-invalid={!!showErr('name')}
                        className="h-11 rounded-xl"
                      />
                    </Field>
                    <Field
                      label={
                        <span className="flex items-center justify-between gap-2">
                          الكود *
                          {isEdit && plan?.isCanonical && (
                            <button
                              type="button"
                              onClick={() => setCodeUnlocked((v) => !v)}
                              className="inline-flex items-center gap-1 text-[13px] font-bold text-foreground/70 hover:text-foreground"
                            >
                              {codeLocked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                              {codeLocked ? 'فتح التعديل' : 'قفل'}
                            </button>
                          )}
                        </span>
                      }
                      error={showErr('code')}
                      hint={
                        codeLocked
                          ? 'كود قياسي مرتبط بالنظام — تغييره قد يكسر الربط مع الاشتراكات.'
                          : 'يُستخدم داخلياً وفي الربط مع الاشتراكات.'
                      }
                    >
                      <Input
                        value={form.code}
                        onChange={(e) => set('code', e.target.value)}
                        placeholder="electronics-pro"
                        dir="ltr"
                        readOnly={codeLocked}
                        aria-invalid={!!showErr('code')}
                        className={cn('h-11 rounded-xl font-mono', codeLocked && 'bg-muted text-foreground/70')}
                      />
                    </Field>
                  </div>

                  <Field
                    label="الوصف"
                    hint={`${form.description.length}/160 — يظهر للعملاء في صفحة الأسعار.`}
                  >
                    <Textarea
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      rows={3}
                      maxLength={160}
                      placeholder="وصف مختصر يقنع العميل بهذه الباقة…"
                      className="rounded-xl"
                    />
                  </Field>

                  <label
                    htmlFor="plan-active"
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25">
                        <Power className="size-4.5" />
                      </span>
                      <span>
                        <span className="block text-[15.5px] font-extrabold">الباقة مفعّلة</span>
                        <span className="block text-[13.5px] text-foreground/70">
                          الباقات المعطّلة لا تظهر للعملاء الجدد، وتستمر الاشتراكات الحالية.
                        </span>
                      </span>
                    </span>
                    <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} id="plan-active" />
                  </label>
                </TabsContent>

                {/* ── التسعير والحدود ── */}
                <TabsContent value="pricing" className="mt-0 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="السعر الشهري">
                      <MoneyInput value={form.priceMonthly} onChange={(v) => set('priceMonthly', v)} />
                    </Field>
                    <Field label="السعر السنوي">
                      <MoneyInput
                        value={form.priceYearly}
                        onChange={(v) => set('priceYearly', v)}
                        invalid={yearlyNoDiscount}
                      />
                    </Field>
                  </div>

                  {/* مساعد الخصم السنوي */}
                  {m > 0 && (
                    <div className="rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/[0.04] p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-indigo-700 dark:text-indigo-300">
                        <Wand2 className="size-3.5" />
                        احسب السعر السنوي تلقائياً
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'خصم 10%', f: 0.9 },
                          { label: 'خصم 15%', f: 0.85 },
                          { label: 'خصم 20%', f: 0.8 },
                          { label: 'شهران مجاناً', f: 10 / 12 },
                          { label: 'بدون خصم', f: 1 },
                        ].map((c) => {
                          const target = Math.round(m * 12 * c.f)
                          const active = y === target
                          return (
                            <button
                              key={c.label}
                              type="button"
                              onClick={() => set('priceYearly', String(target))}
                              className={cn(
                                'rounded-full border px-3 py-1 text-[13.5px] font-bold transition-all',
                                active
                                  ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                                  : 'bg-background hover:border-indigo-400 hover:text-indigo-600',
                              )}
                            >
                              {c.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {m > 0 && y > 0 && (
                    <div
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3',
                        savings > 0
                          ? 'border-emerald-500/25 bg-emerald-500/10'
                          : 'border-amber-500/30 bg-amber-500/10',
                      )}
                    >
                      <span className="text-[14.5px] font-bold">
                        {savings > 0 ? 'يوفّر العميل سنوياً' : 'السنوي أغلى من أو يساوي ١٢ × الشهري'}
                      </span>
                      <span className="font-mono text-[15.5px] font-black tabular-nums">
                        {savings > 0 ? `${num(savings)} ج.م (${pct}%)` : `+${num(-savings)} ج.م`}
                        <span className="ms-2 font-sans text-[13.5px] font-semibold text-foreground/70">
                          ≈ {num(Math.round(y / 12))} ج.م/شهر
                        </span>
                      </span>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[15px] font-bold">الحدود</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <LimitField icon={Users} label="المستخدمون" value={form.maxUsers} onChange={(v) => set('maxUsers', v)} min={1} fallback={5} />
                      <LimitField icon={Package} label="المنتجات" value={form.maxProducts} onChange={(v) => set('maxProducts', v)} min={0} fallback={500} />
                      <LimitField icon={Building2} label="الفروع" value={form.maxBranches} onChange={(v) => set('maxBranches', v)} min={1} fallback={1} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="أيام التجربة المجانية" hint="0 = بدون تجربة (النظام يستخدم 14 يوماً عند بدء تجربة بباقة مدفوعة).">
                      <Input
                        type="number"
                        min={0}
                        value={form.trialDays}
                        onChange={(e) => set('trialDays', e.target.value)}
                        dir="ltr"
                        className="h-11 rounded-xl font-mono font-bold"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[0, 7, 14, 30].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => set('trialDays', String(d))}
                            className={cn(
                              'rounded-full border px-2.5 py-0.5 text-[13px] font-bold transition-colors',
                              Number(form.trialDays) === d
                                ? 'border-indigo-500 bg-indigo-500 text-white'
                                : 'bg-background text-foreground/70 hover:border-indigo-400 hover:text-indigo-600',
                            )}
                          >
                            {d === 0 ? 'بدون' : `${d} يوم`}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="ترتيب العرض" hint="الأصغر يظهر أولاً في صفحة الأسعار.">
                      <Input
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) => set('sortOrder', e.target.value)}
                        dir="ltr"
                        className="h-11 rounded-xl font-mono font-bold"
                      />
                    </Field>
                  </div>
                </TabsContent>

                {/* ── المزايا والصلاحيات ── */}
                <TabsContent value="features" className="mt-0 space-y-6">
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-[15px] font-bold">
                        المزايا <span className="text-foreground/70">({form.features.length})</span>
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={generateFromLimits} className="h-9 gap-1.5 rounded-full text-[13.5px] sm:h-7">
                          <Wand2 className="size-3" />
                          من الحدود
                        </Button>
                        {form.features.length > 0 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => set('features', [])} className="h-9 gap-1 rounded-full text-[13.5px] text-rose-600 hover:text-rose-600 sm:h-7">
                            <Trash2 className="size-3" />
                            مسح الكل
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        value={featureDraft}
                        onChange={(e) => setFeatureDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addFeatures(featureDraft)
                            setFeatureDraft('')
                          }
                        }}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData('text')
                          if (text.includes('\n')) {
                            e.preventDefault()
                            addFeatures(text)
                          }
                        }}
                        placeholder="اكتب ميزة واضغط Enter — أو الصق عدة أسطر دفعة واحدة"
                        className="h-10 rounded-xl"
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          addFeatures(featureDraft)
                          setFeatureDraft('')
                        }}
                        disabled={!featureDraft.trim()}
                        className="h-10 gap-1 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500"
                      >
                        <Plus className="size-4" />
                        إضافة
                      </Button>
                    </div>

                    {form.features.length === 0 ? (
                      <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-[14px] text-foreground/70">
                        لا توجد مزايا بعد — ستظهر كقائمة ✓ في بطاقة الباقة وجدول المقارنة.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {form.features.map((f, i) => (
                          <li
                            key={`${f}-${i}`}
                            className="group inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card py-1 ps-3 pe-1 text-[14.5px] font-medium shadow-sm"
                          >
                            <span className="truncate">{f}</span>
                            <button
                              type="button"
                              aria-label={`حذف ${f}`}
                              onClick={() => set('features', form.features.filter((_, j) => j !== i))}
                              className="flex size-5 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-rose-500/15 hover:text-rose-600"
                            >
                              <X className="size-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <Label className="text-[15px] font-bold">
                      الصلاحيات المتاحة (Capabilities){' '}
                      <span className="text-foreground/70">({form.capabilities.length}/{CAPABILITIES_META.length})</span>
                    </Label>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {CAPABILITIES_META.map((cap) => {
                        const checked = form.capabilities.includes(cap.key)
                        return (
                          <ToggleCard
                            key={cap.key}
                            checked={checked}
                            title={cap.label}
                            desc={cap.desc}
                            onClick={() =>
                              set(
                                'capabilities',
                                checked
                                  ? form.capabilities.filter((c) => c !== cap.key)
                                  : [...form.capabilities, cap.key],
                              )
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                </TabsContent>

                {/* ── الوحدات ── */}
                <TabsContent value="modules" className="mt-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label className="text-[15.5px] font-bold">الصفحات المتاحة في القائمة الجانبية</Label>
                      <p className="text-[13.5px] text-foreground/70">
                        {enabledCount} من {availableModules.length} مفعّلة · الإعدادات والمستخدمين مفعّلان دائماً.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => set('enabledModules', defaultsFor(form.businessType))}
                        className="h-10 gap-1.5 rounded-full text-[13.5px] sm:h-8"
                      >
                        <RefreshCw className="size-3" />
                        الافتراضي لـ{form.businessType === 'fashion' ? 'ملابس' : 'موبايل'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => set('enabledModules', availableModules.map((x) => x.key))}
                        className="h-10 rounded-full text-[13.5px] sm:h-8"
                      >
                        تفعيل الكل
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => set('enabledModules', [...CRITICAL_MODULES])}
                        className="h-10 rounded-full text-[13.5px] sm:h-8"
                      >
                        الأساسيات فقط
                      </Button>
                    </div>
                  </div>
                  {form.businessType === 'fashion' && (
                    <p className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-[13.5px] text-foreground/70">
                      <Info className="size-3.5 shrink-0" />
                      عناصر موبايل/كمبيوتر (الصيانة، المعاملات المالية) غير متاحة لباقات الملابس.
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {MODULES_META.map((mod) => {
                      const isCritical = CRITICAL_MODULES.includes(mod.key)
                      const checked = isCritical || form.enabledModules.includes(mod.key)
                      const disabledForType = form.businessType === 'fashion' && !!mod.electronicsOnly
                      return (
                        <ToggleCard
                          key={mod.key}
                          checked={checked}
                          disabled={isCritical || disabledForType}
                          locked={isCritical}
                          title={mod.label}
                          desc={mod.desc}
                          badge={isCritical ? 'إجباري' : disabledForType ? 'غير متاح للملابس' : undefined}
                          onClick={() => toggleModule(mod.key)}
                        />
                      )
                    })}
                  </div>
                </TabsContent>

                {/* معاينة حيّة قابلة للطي — جوال/تابلت */}
                <div className="mt-6 border-t pt-4 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen((v) => !v)}
                    aria-expanded={previewOpen}
                    className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border bg-muted/40 px-3.5 text-[14.5px] font-black outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="size-4 text-indigo-500" />
                      معاينة حيّة للباقة
                    </span>
                    <span className="text-[13px] font-bold text-indigo-600 dark:text-indigo-300">
                      {previewOpen ? 'إخفاء' : 'عرض'}
                    </span>
                  </button>
                  {previewOpen && (
                    <div className="mt-3 rounded-2xl bg-muted/30 p-3">
                      <PlanPreview form={form} theme={theme} />
                    </div>
                  )}
                </div>
              </div>
            </Tabs>

            {/* المعاينة الحيّة */}
            <aside className="hidden min-h-0 overflow-y-auto border-s bg-muted/30 p-4 lg:block">
              <p className="mb-3 flex items-center gap-1.5 text-[13.5px] font-black tracking-wide text-foreground/70">
                <Sparkles className="size-3.5 text-indigo-500" />
                معاينة حيّة
              </p>
              <PlanPreview form={form} theme={theme} />
              <p className="mt-3 text-center text-[13px] leading-relaxed text-foreground/70">
                هكذا ستظهر الباقة في لوحة التحكم — تتحدّث أثناء الكتابة.
              </p>
            </aside>
          </div>

          {/* ═══ التذييل ═══ */}
          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t bg-background/80 px-4 py-3 backdrop-blur sm:justify-between sm:px-5">
            <span className="hidden items-center gap-1.5 text-[13.5px] text-foreground/70 sm:flex">
              <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12.5px] font-bold">Ctrl</kbd>
              +
              <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12.5px] font-bold">S</kbd>
              للحفظ السريع
            </span>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Button variant="outline" onClick={() => requestClose(false)} className="h-11 rounded-xl max-sm:flex-1 sm:h-9">
                إلغاء
              </Button>
              <Button
                onClick={save}
                disabled={saving || (isEdit && !dirty)}
                className="h-11 gap-1.5 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-5 text-white shadow-lg shadow-indigo-600/25 hover:from-indigo-500 hover:to-violet-500 max-sm:flex-[2] sm:h-9"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {isEdit ? 'حفظ التغييرات' : 'إنشاء الباقة'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد تجاهل التعديلات */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تجاهل التعديلات؟</AlertDialogTitle>
            <AlertDialogDescription>
              لديك تعديلات لم تُحفظ بعد. إذا أغلقت النافذة الآن ستفقدها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>متابعة التعديل</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false)
                onOpenChange(false)
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              تجاهل وإغلاق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
