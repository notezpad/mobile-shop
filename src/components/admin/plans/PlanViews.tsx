'use client'

import * as React from 'react'
import {
  Pencil,
  Copy,
  MoreVertical,
  Power,
  Trash2,
  CircleOff,
  Users,
  Package,
  Building2,
  Check,
  Minus,
  Clock3,
  Flame,
  Crown,
  Layers,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Hash,
  Loader2,
  ArrowUp,
  ArrowDown,
  CalendarClock,
  Save,
  PencilLine,
  Smartphone,
  Shirt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type Billing,
  type PlanRow,
  type SortKey,
  BUSINESS_TYPE_LABEL,
  CAPABILITIES_META,
  MiniBar,
  Pill,
  PlanGlyph,
  copyText,
  featureList,
  fmtLimit,
  isFashion,
  modulesOf,
  num,
  parseCaps,
  planMrr,
  themeFor,
  yearlySavings,
} from './plan-shared'

type TabKey = 'basic' | 'pricing' | 'features' | 'modules'

export interface PlanActions {
  onEdit: (p: PlanRow, tab?: TabKey) => void
  onDetails: (p: PlanRow) => void
  onToggleActive: (p: PlanRow) => void
  onDuplicate: (p: PlanRow) => void
  onRemove: (p: PlanRow) => void
  onMove: (p: PlanRow, dir: -1 | 1) => void
  onQuickPrice: (p: PlanRow, prices: { priceMonthly: number; priceYearly: number }) => Promise<void>
  canMove: boolean
}

/* ══════════════ تعديل سريع للسعر ══════════════ */

function QuickPriceEditor({
  plan,
  onSave,
  children,
}: {
  plan: PlanRow
  onSave: PlanActions['onQuickPrice']
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [m, setM] = React.useState('')
  const [y, setY] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setM(String(plan.priceMonthly))
      setY(String(plan.priceYearly))
    }
  }, [open, plan.priceMonthly, plan.priceYearly])

  const changed = Number(m) !== plan.priceMonthly || Number(y) !== plan.priceYearly
  const { pct } = yearlySavings({ priceMonthly: Number(m) || 0, priceYearly: Number(y) || 0 })

  const submit = async () => {
    setSaving(true)
    try {
      await onSave(plan, { priceMonthly: Number(m) || 0, priceYearly: Number(y) || 0 })
      setOpen(false)
    } catch {
      // الخطأ يُعرض كـ toast من المكوّن الأب — نُبقي النافذة مفتوحة للمحاولة مجدداً
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="center" className="w-72 space-y-3 rounded-2xl p-4">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-black">
            <PencilLine className="size-3.5 text-indigo-500" />
            تعديل سريع للسعر
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{plan.name}</p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (changed && !saving) submit()
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold">شهري</Label>
              <Input
                autoFocus
                type="number"
                min={0}
                value={m}
                onChange={(e) => setM(e.target.value)}
                dir="ltr"
                className="h-9 rounded-xl font-mono font-bold"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold">سنوي</Label>
              <Input
                type="number"
                min={0}
                value={y}
                onChange={(e) => setY(e.target.value)}
                dir="ltr"
                className="h-9 rounded-xl font-mono font-bold"
              />
            </div>
          </div>
          {pct > 0 && <Pill tone="emerald">خصم سنوي {pct}%</Pill>}
          <Button
            type="submit"
            disabled={!changed || saving}
            className="w-full gap-1.5 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ السعر
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/* ══════════════ قائمة الإجراءات ══════════════ */

function PlanMenu({
  plan,
  actions,
  className,
}: {
  plan: PlanRow
  actions: PlanActions
  className?: string
}) {
  const canHardDelete = !plan.isCanonical && plan.subscribersCount === 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="خيارات إضافية"
          onClick={(e) => e.stopPropagation()}
          className={cn('size-9 rounded-xl', className)}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => actions.onEdit(plan)} className="gap-2 rounded-lg">
          <Pencil className="size-3.5" />
          تعديل الباقة
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.onDetails(plan)} className="gap-2 rounded-lg">
          <Eye className="size-3.5" />
          عرض التفاصيل
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.onDuplicate(plan)} className="gap-2 rounded-lg">
          <Copy className="size-3.5" />
          نسخ كباقة جديدة
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            const ok = await copyText(plan.code)
            toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الكود' : 'تعذّر النسخ')
          }}
          className="gap-2 rounded-lg"
        >
          <Hash className="size-3.5" />
          نسخ الكود
        </DropdownMenuItem>
        {actions.canMove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onMove(plan, -1)} className="gap-2 rounded-lg">
              <ArrowUp className="size-3.5" />
              تقديم في الترتيب
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onMove(plan, 1)} className="gap-2 rounded-lg">
              <ArrowDown className="size-3.5" />
              تأخير في الترتيب
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => actions.onToggleActive(plan)} className="gap-2 rounded-lg">
          <Power className="size-3.5" />
          {plan.isActive ? 'تعطيل مؤقت' : 'تفعيل الباقة'}
        </DropdownMenuItem>
        {(plan.isActive || canHardDelete) && (
          <DropdownMenuItem
            onClick={() => actions.onRemove(plan)}
            className="gap-2 rounded-lg text-rose-600 focus:bg-rose-500/10 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
          >
            {canHardDelete ? <Trash2 className="size-3.5" /> : <CircleOff className="size-3.5" />}
            {canHardDelete ? 'حذف الباقة نهائياً' : 'إلغاء التفعيل'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ══════════════ بطاقة الباقة ══════════════ */

export function PlanCard({
  plan: p,
  themeIndex,
  billing,
  totalSubs,
  totalMrr,
  isTop,
  isTopRevenue,
  stagger,
  actions,
}: {
  plan: PlanRow
  themeIndex: number
  billing: Billing
  totalSubs: number
  totalMrr: number
  isTop: boolean
  isTopRevenue: boolean
  stagger: number
  actions: PlanActions
}) {
  const theme = themeFor(themeIndex)
  const [expanded, setExpanded] = React.useState(false)
  const features = featureList(p.features)
  const shown = expanded ? features : features.slice(0, 4)
  const { list: mods } = modulesOf(p)
  const caps = parseCaps(p.capabilities)
  const mrr = planMrr(p)
  const sharePct = totalMrr > 0 ? Math.round((mrr / totalMrr) * 100) : totalSubs > 0 ? Math.round((p.subscribersCount / totalSubs) * 100) : 0
  const { savings, pct } = yearlySavings(p)
  const isFree = p.priceMonthly === 0 && p.priceYearly === 0
  const price = billing === 'monthly' ? p.priceMonthly : p.priceYearly
  const fashion = isFashion(p)

  const limits = [
    { icon: Users, label: 'مستخدمين', v: p.maxUsers },
    { icon: Package, label: 'منتجات', v: p.maxProducts },
    { icon: Building2, label: 'فروع', v: p.maxBranches },
  ]

  return (
    <article
      className={cn(
        'group/card animate-in-up relative flex flex-col overflow-hidden rounded-3xl border bg-card/90 shadow-sm backdrop-blur transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-xl hover:ring-1',
        theme.hoverRing,
        !p.isActive && 'opacity-75 saturate-[.7]',
      )}
      style={{ animationDelay: `${Math.min(stagger, 8) * 50}ms` }}
    >
      {/* توهّج لون الباقة */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-20 -end-16 size-56 rounded-full opacity-[0.18] blur-3xl transition-opacity duration-500 group-hover/card:opacity-30',
          theme.glow,
        )}
      />
      <div aria-hidden className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-l', theme.grad)} />

      <div className="relative flex flex-1 flex-col gap-4 p-5">
        {/* الرأس */}
        <header className="flex items-start gap-3">
          <PlanGlyph plan={p} theme={theme} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-black leading-tight">{p.name}</h3>
            <button
              type="button"
              dir="ltr"
              title="انسخ الكود"
              onClick={async () => {
                const ok = await copyText(p.code)
                toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الكود' : 'تعذّر النسخ')
              }}
              className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-md font-mono text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">{p.code}</span>
              <Copy className="size-2.5 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-70" />
            </button>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Switch
              checked={p.isActive}
              onCheckedChange={() => actions.onToggleActive(p)}
              aria-label={p.isActive ? 'تعطيل الباقة' : 'تفعيل الباقة'}
              title={p.isActive ? 'مفعّلة — اضغط للتعطيل' : 'معطّلة — اضغط للتفعيل'}
            />
            <span className="text-[9.5px] font-bold text-muted-foreground">{p.isActive ? 'مفعّلة' : 'معطّلة'}</span>
          </div>
        </header>

        {/* الشارات */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill icon={fashion ? Shirt : Smartphone}>{BUSINESS_TYPE_LABEL[p.businessType ?? 'electronics'] ?? 'باقة'}</Pill>
          <Pill tone={p.isCanonical ? 'indigo' : 'amber'}>{p.isCanonical ? 'قياسية' : 'مخصّصة'}</Pill>
          {isTop && (
            <Pill tone="fuchsia" icon={Flame}>
              الأكثر اشتراكاً
            </Pill>
          )}
          {isTopRevenue && !isTop && (
            <Pill tone="emerald" icon={Crown}>
              الأعلى إيراداً
            </Pill>
          )}
          {(p.expiringSoonCount ?? 0) > 0 && (
            <Pill tone="amber" icon={CalendarClock}>
              {p.expiringSoonCount} ينتهي قريباً
            </Pill>
          )}
        </div>

        {p.description && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{p.description}</p>
        )}

        {/* السعر */}
        <QuickPriceEditor plan={p} onSave={actions.onQuickPrice}>
          <button
            type="button"
            title="اضغط لتعديل السعر بسرعة"
            className="group/price relative w-full rounded-2xl border border-transparent bg-muted/50 p-3.5 text-start outline-none transition-all hover:border-indigo-500/30 hover:bg-indigo-500/[0.06] focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <span className="absolute end-3 top-3 flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/price:opacity-100 group-focus-visible/price:opacity-100">
              <PencilLine className="size-3" />
            </span>
            {isFree ? (
              <span className={cn('text-3xl font-black', theme.text)}>مجاناً</span>
            ) : billing === 'yearly' && p.priceYearly === 0 ? (
              <>
                <span className="block text-2xl font-black text-muted-foreground/60">—</span>
                <span className="text-[11px] font-semibold text-muted-foreground">لا يوجد سعر سنوي</span>
              </>
            ) : (
              <>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black tracking-tight tabular-nums">{num(price)}</span>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    ج.م / {billing === 'monthly' ? 'شهر' : 'سنة'}
                  </span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  {billing === 'monthly' ? (
                    p.priceYearly > 0 ? (
                      <>
                        سنوياً <span className="font-mono font-extrabold text-foreground">{num(p.priceYearly)}</span> ج.م
                        {pct > 0 && <Pill tone="emerald">-{pct}%</Pill>}
                      </>
                    ) : (
                      'بدون سعر سنوي'
                    )
                  ) : (
                    <>
                      ≈ <span className="font-mono font-extrabold text-foreground">{num(Math.round(p.priceYearly / 12))}</span> ج.م / شهر
                      {savings > 0 && <Pill tone="emerald">وفّر {num(savings)}</Pill>}
                    </>
                  )}
                </span>
              </>
            )}
            {p.trialDays > 0 && (
              <Pill tone="indigo" icon={Clock3} className="mt-2">
                تجربة {p.trialDays} يوم
              </Pill>
            )}
          </button>
        </QuickPriceEditor>

        {/* الحدود */}
        <div className="grid grid-cols-3 gap-2">
          {limits.map((l) => (
            <div key={l.label} className="rounded-2xl border bg-background/60 px-2 py-2.5 text-center">
              <l.icon className={cn('mx-auto size-3.5', theme.text)} />
              <p className="mt-1 font-mono text-[15px] font-black leading-none tabular-nums">{fmtLimit(l.v)}</p>
              <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{l.label}</p>
            </div>
          ))}
        </div>

        {/* المزايا */}
        {features.length > 0 && (
          <div>
            <ul className="space-y-1.5">
              {shown.map((f, i) => (
                <li key={`${f}-${i}`} className="flex items-start gap-2 text-[12px] leading-snug">
                  <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full', theme.soft, theme.text)}>
                    <Check className="size-2.5" strokeWidth={3.5} />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {features.length > 4 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {expanded ? (
                  <>
                    عرض أقل <ChevronUp className="size-3" />
                  </>
                ) : (
                  <>
                    +{features.length - 4} مزايا أخرى <ChevronDown className="size-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* الوحدات والصلاحيات */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => actions.onEdit(p, 'modules')} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50">
            <Pill icon={Layers} className="cursor-pointer transition-colors hover:border-indigo-500/40">
              {mods.length} وحدة
            </Pill>
          </button>
          <button type="button" onClick={() => actions.onEdit(p, 'features')} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50">
            <Pill className="cursor-pointer transition-colors hover:border-indigo-500/40">
              {caps.length}/{CAPABILITIES_META.length} صلاحية
            </Pill>
          </button>
        </div>

        {/* التذييل */}
        <footer className="mt-auto space-y-3 border-t pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10.5px] font-semibold text-muted-foreground">المشتركون</p>
              <p className="font-mono text-lg font-black leading-tight tabular-nums">
                {num(p.subscribersCount)}
                {(p.trialCount ?? 0) > 0 && (
                  <span className="ms-1.5 font-sans text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    ({p.trialCount} تجربة)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold text-muted-foreground">إيراد شهري</p>
              <p className="font-mono text-lg font-black leading-tight tabular-nums">
                {num(mrr)} <span className="font-sans text-[10px] font-bold text-muted-foreground">ج.م</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MiniBar pct={sharePct} barClassName={cn('bg-gradient-to-l', theme.grad)} />
            <span className="w-9 shrink-0 text-end font-mono text-[10.5px] font-black tabular-nums text-muted-foreground">
              {sharePct}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => actions.onEdit(p)}
              className="h-9 flex-1 gap-1.5 rounded-xl bg-foreground text-background shadow-sm hover:bg-foreground/90"
            >
              <Pencil className="size-3.5" />
              تعديل
            </Button>
            <Button
              variant="outline"
              onClick={() => actions.onDetails(p)}
              className="h-9 gap-1.5 rounded-xl"
            >
              <Eye className="size-3.5" />
              تفاصيل
            </Button>
            <PlanMenu plan={p} actions={actions} />
          </div>
        </footer>
      </div>
    </article>
  )
}

/* ══════════════ جدول القائمة المدمج ══════════════ */

function SortHeader({
  label,
  asc,
  desc,
  sort,
  onSort,
}: {
  label: string
  /** مفتاح الترتيب التصاعدي/الأساسي */
  asc: SortKey
  /** مفتاح الترتيب التنازلي (اختياري — للأعمدة التي تدعم الاتجاهين) */
  desc?: SortKey
  sort: SortKey
  onSort: (k: SortKey) => void
}) {
  const active = sort === asc || (!!desc && sort === desc)
  const Icon = !active ? ChevronsUpDown : desc && sort === asc ? ChevronUp : ChevronDown
  return (
    <th scope="col" className="px-3 py-3 text-start">
      <button
        type="button"
        onClick={() => onSort(desc && sort === asc ? desc : asc)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-black tracking-wide transition-colors hover:text-foreground',
          active ? 'text-indigo-600 dark:text-indigo-300' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className={cn('size-3', !active && 'opacity-50')} />
      </button>
    </th>
  )
}

export function PlansList({
  plans,
  themeIndexById,
  totalSubs,
  totalMrr,
  sort,
  onSort,
  actions,
}: {
  plans: PlanRow[]
  themeIndexById: Map<number, number>
  totalSubs: number
  totalMrr: number
  sort: SortKey
  onSort: (k: SortKey) => void
  actions: PlanActions
}) {
  return (
    <div className="animate-in-up overflow-hidden rounded-3xl border bg-card/90 shadow-sm backdrop-blur">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <SortHeader label="الباقة" asc="name" sort={sort} onSort={onSort} />
              <SortHeader label="السعر" asc="price-asc" desc="price-desc" sort={sort} onSort={onSort} />
              <th scope="col" className="px-3 py-3 text-start text-[11px] font-black tracking-wide text-muted-foreground">
                الحدود
              </th>
              <SortHeader label="المشتركون" asc="subs" sort={sort} onSort={onSort} />
              <SortHeader label="الإيراد الشهري" asc="revenue" sort={sort} onSort={onSort} />
              <th scope="col" className="px-3 py-3 text-center text-[11px] font-black tracking-wide text-muted-foreground">
                مفعّلة
              </th>
              <th scope="col" className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {plans.map((p) => {
              const theme = themeFor(themeIndexById.get(p.id) ?? 0)
              const mrr = planMrr(p)
              const share = totalMrr > 0 ? (mrr / totalMrr) * 100 : totalSubs > 0 ? (p.subscribersCount / totalSubs) * 100 : 0
              const { pct } = yearlySavings(p)
              return (
                <tr
                  key={p.id}
                  onClick={() => actions.onDetails(p)}
                  className={cn(
                    'group cursor-pointer transition-colors hover:bg-indigo-500/[0.04]',
                    !p.isActive && 'opacity-65',
                  )}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <PlanGlyph plan={p} theme={theme} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-extrabold leading-tight">{p.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-[10.5px] text-muted-foreground" dir="ltr">
                            {p.code}
                          </span>
                          <Pill tone={p.isCanonical ? 'indigo' : 'amber'} className="px-1.5 py-0 text-[9.5px]">
                            {p.isCanonical ? 'قياسية' : 'مخصّصة'}
                          </Pill>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <QuickPriceEditor plan={p} onSave={actions.onQuickPrice}>
                      <button
                        type="button"
                        className="group/price rounded-xl px-2 py-1 text-start outline-none transition-colors hover:bg-indigo-500/10 focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                      >
                        <span className="flex items-center gap-1 font-mono text-[13.5px] font-black tabular-nums">
                          {p.priceMonthly === 0 ? 'مجاناً' : num(p.priceMonthly)}
                          {p.priceMonthly > 0 && <span className="font-sans text-[10px] font-bold text-muted-foreground">/شهر</span>}
                          <PencilLine className="ms-1 size-3 text-muted-foreground opacity-0 transition-opacity group-hover/price:opacity-100" />
                        </span>
                        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted-foreground">
                          {p.priceYearly > 0 ? `${num(p.priceYearly)} سنوياً` : '—'}
                          {pct > 0 && <span className="font-black text-emerald-600 dark:text-emerald-400">-{pct}%</span>}
                        </span>
                      </button>
                    </QuickPriceEditor>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3 font-mono text-[12px] font-bold tabular-nums">
                      <span className="inline-flex items-center gap-1" title="مستخدمين">
                        <Users className="size-3 text-muted-foreground" />
                        {fmtLimit(p.maxUsers)}
                      </span>
                      <span className="inline-flex items-center gap-1" title="منتجات">
                        <Package className="size-3 text-muted-foreground" />
                        {fmtLimit(p.maxProducts)}
                      </span>
                      <span className="inline-flex items-center gap-1" title="فروع">
                        <Building2 className="size-3 text-muted-foreground" />
                        {fmtLimit(p.maxBranches)}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <p className="font-mono text-[13.5px] font-black tabular-nums">
                      {num(p.subscribersCount)}
                      {(p.trialCount ?? 0) > 0 && (
                        <span className="ms-1 font-sans text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {p.trialCount} تجربة
                        </span>
                      )}
                    </p>
                    {(p.expiringSoonCount ?? 0) > 0 && (
                      <p className="flex items-center gap-1 text-[10.5px] font-bold text-amber-600 dark:text-amber-400">
                        <CalendarClock className="size-3" />
                        {p.expiringSoonCount} ينتهي قريباً
                      </p>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="w-36">
                      <p className="font-mono text-[13px] font-black tabular-nums">
                        {num(mrr)} <span className="font-sans text-[10px] font-bold text-muted-foreground">ج.م</span>
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <MiniBar pct={share} barClassName={cn('bg-gradient-to-l', theme.grad)} />
                        <span className="w-8 shrink-0 text-end font-mono text-[10px] font-black tabular-nums text-muted-foreground">
                          {Math.round(share)}%
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={p.isActive}
                      onCheckedChange={() => actions.onToggleActive(p)}
                      aria-label={p.isActive ? 'تعطيل الباقة' : 'تفعيل الباقة'}
                    />
                  </td>

                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => actions.onEdit(p)}
                        className="h-9 gap-1.5 rounded-xl"
                      >
                        <Pencil className="size-3.5" />
                        تعديل
                      </Button>
                      <PlanMenu plan={p} actions={actions} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t bg-muted/30 px-4 py-2.5 text-center text-[10.5px] font-medium text-muted-foreground">
        اضغط على أي صف لعرض التفاصيل · اضغط على السعر لتعديله بسرعة · العناوين قابلة للترتيب
      </p>
    </div>
  )
}

/* ══════════════ جدول المقارنة ══════════════ */

export function PlansCompare({
  plans,
  themeIndexById,
  billing,
  topId,
  actions,
}: {
  plans: PlanRow[]
  themeIndexById: Map<number, number>
  billing: Billing
  topId: number | null
  actions: PlanActions
}) {
  const bestValueId = React.useMemo(() => {
    let best: { id: number; pct: number } | null = null
    for (const p of plans) {
      const { pct } = yearlySavings(p)
      if (pct > 0 && (!best || pct > best.pct)) best = { id: p.id, pct }
    }
    return best?.id ?? null
  }, [plans])

  const featureUnion = React.useMemo(() => {
    const seen = new Set<string>()
    for (const p of plans) for (const f of featureList(p.features)) seen.add(f)
    return Array.from(seen)
  }, [plans])

  type Row = { label: string; render: (p: PlanRow) => React.ReactNode }
  const group = (title: string): Row => ({ label: `__group__${title}`, render: () => null })

  const rows: Row[] = [
    group('التسعير'),
    {
      label: billing === 'monthly' ? 'السعر الشهري' : 'السعر السنوي',
      render: (p) => {
        const v = billing === 'monthly' ? p.priceMonthly : p.priceYearly
        return v === 0 ? (
          <span className="font-black text-muted-foreground">{billing === 'monthly' ? 'مجاناً' : '—'}</span>
        ) : (
          <span className="font-mono text-[15px] font-black tabular-nums">{num(v)}</span>
        )
      },
    },
    {
      label: billing === 'monthly' ? 'السعر السنوي' : 'السعر الشهري',
      render: (p) => {
        const v = billing === 'monthly' ? p.priceYearly : p.priceMonthly
        return <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">{v === 0 ? '—' : num(v)}</span>
      },
    },
    {
      label: 'الخصم السنوي',
      render: (p) => {
        const { pct } = yearlySavings(p)
        return pct > 0 ? <Pill tone="emerald">-{pct}%</Pill> : <span className="text-muted-foreground/50">—</span>
      },
    },
    {
      label: 'أيام التجربة',
      render: (p) => (
        <span className="inline-flex items-center gap-1 text-xs font-bold">
          {p.trialDays > 0 ? (
            <>
              <Clock3 className="size-3 text-indigo-500" />
              {p.trialDays} يوم
            </>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </span>
      ),
    },
    group('الحدود'),
    { label: 'المستخدمون', render: (p) => <span className="font-mono text-xs font-black tabular-nums">{fmtLimit(p.maxUsers)}</span> },
    { label: 'المنتجات', render: (p) => <span className="font-mono text-xs font-black tabular-nums">{fmtLimit(p.maxProducts)}</span> },
    { label: 'الفروع', render: (p) => <span className="font-mono text-xs font-black tabular-nums">{fmtLimit(p.maxBranches)}</span> },
    group('الأداء'),
    { label: 'المشتركون', render: (p) => <span className="font-mono text-xs font-black tabular-nums">{num(p.subscribersCount)}</span> },
    {
      label: 'الإيراد الشهري',
      render: (p) => <span className="font-mono text-xs font-black tabular-nums">{num(planMrr(p))}</span>,
    },
    group('النطاق'),
    {
      label: 'نوع النشاط',
      render: (p) => (
        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold">
          {isFashion(p) ? <Shirt className="size-3 text-fuchsia-500" /> : <Smartphone className="size-3 text-sky-500" />}
          {BUSINESS_TYPE_LABEL[p.businessType ?? 'electronics'] ?? p.businessType}
        </span>
      ),
    },
    {
      label: 'الوحدات المفعّلة',
      render: (p) => {
        const { list, isDefault } = modulesOf(p)
        return (
          <span className="inline-flex items-center gap-1 text-xs font-black">
            <Layers className="size-3 text-indigo-500" />
            {list.length}
            {isDefault && <Pill className="px-1.5 py-0 text-[9px]">افتراضي</Pill>}
          </span>
        )
      },
    },
    ...CAPABILITIES_META.map<Row>((c) => ({
      label: c.label,
      render: (p) => <Tick on={parseCaps(p.capabilities).includes(c.key)} />,
    })),
  ]

  return (
    <div className="animate-in-up overflow-hidden rounded-3xl border bg-card/90 shadow-sm backdrop-blur">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 z-20 w-40 bg-card px-4 py-4 text-start align-bottom text-[11px] font-black tracking-wide text-muted-foreground">
                وجه المقارنة
              </th>
              {plans.map((p) => {
                const theme = themeFor(themeIndexById.get(p.id) ?? 0)
                return (
                  <th
                    key={p.id}
                    className={cn(
                      'relative min-w-[170px] px-3 pb-4 pt-5 align-top',
                      topId === p.id && 'bg-indigo-500/[0.05]',
                    )}
                  >
                    <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-l', theme.grad)} />
                    <div className="flex flex-col items-center gap-2 text-center">
                      <PlanGlyph plan={p} theme={theme} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black leading-tight">{p.name}</p>
                        <p className="font-mono text-[10px] font-medium text-muted-foreground" dir="ltr">
                          {p.code}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {!p.isActive && <Pill>معطّلة</Pill>}
                        {topId === p.id && (
                          <Pill tone="fuchsia" icon={Flame}>
                            الأكثر اشتراكاً
                          </Pill>
                        )}
                        {bestValueId === p.id && (
                          <Pill tone="emerald" icon={Crown}>
                            أفضل قيمة
                          </Pill>
                        )}
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.label.startsWith('__group__') ? (
                <tr key={row.label}>
                  <th
                    colSpan={plans.length + 1}
                    className="bg-muted/40 px-4 py-2 text-start text-[10.5px] font-black tracking-widest text-muted-foreground"
                  >
                    {row.label.replace('__group__', '')}
                  </th>
                </tr>
              ) : (
                <tr key={row.label} className="border-t transition-colors hover:bg-muted/20">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 bg-card px-4 py-3 text-start text-[12px] font-bold text-muted-foreground"
                  >
                    {row.label}
                  </th>
                  {plans.map((p) => (
                    <td
                      key={p.id}
                      className={cn('px-3 py-3 text-center', topId === p.id && 'bg-indigo-500/[0.05]')}
                    >
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ),
            )}

            {featureUnion.length > 0 && (
              <>
                <tr>
                  <th
                    colSpan={plans.length + 1}
                    className="bg-muted/40 px-4 py-2 text-start text-[10.5px] font-black tracking-widest text-muted-foreground"
                  >
                    المزايا
                  </th>
                </tr>
                {featureUnion.map((f) => (
                  <tr key={f} className="border-t transition-colors hover:bg-muted/20">
                    <th
                      scope="row"
                      title={f}
                      className="sticky start-0 z-10 max-w-[170px] truncate bg-card px-4 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground"
                    >
                      {f}
                    </th>
                    {plans.map((p) => (
                      <td
                        key={p.id}
                        className={cn('px-3 py-2.5 text-center', topId === p.id && 'bg-indigo-500/[0.05]')}
                      >
                        <Tick on={featureList(p.features).includes(f)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}

            <tr className="border-t">
              <th scope="row" className="sticky start-0 z-10 bg-card px-4 py-3.5" />
              {plans.map((p) => (
                <td key={p.id} className={cn('px-3 py-3.5 text-center', topId === p.id && 'bg-indigo-500/[0.05]')}>
                  <Button variant="outline" size="sm" onClick={() => actions.onEdit(p)} className="h-9 gap-1.5 rounded-xl">
                    <Pencil className="size-3.5" />
                    تعديل
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t bg-muted/30 px-4 py-2.5 text-center text-[10.5px] font-medium text-muted-foreground">
        مقارنة {plans.length} باقة · الأسعار بالجنيه المصري · الوحدات الافتراضية محسوبة بحسب نوع النشاط
      </p>
    </div>
  )
}

function Tick({ on }: { on: boolean }) {
  return on ? (
    <span className="mx-auto flex size-5.5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  ) : (
    <span className="mx-auto flex size-5.5 items-center justify-center text-muted-foreground/35">
      <Minus className="size-3.5" strokeWidth={3} />
    </span>
  )
}
