'use client'

import * as React from 'react'
import {
  Pencil,
  Copy,
  Power,
  Users,
  Package,
  Building2,
  Check,
  X,
  Clock3,
  Wallet,
  TrendingUp,
  CalendarClock,
  Layers,
  Sparkles,
  Hash,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type PlanRow,
  type PlanTheme,
  BUSINESS_TYPE_LABEL,
  CAPABILITIES_META,
  CRITICAL_MODULES,
  MODULES_META,
  Pill,
  PlanGlyph,
  copyText,
  daysLeft,
  featureList,
  fmtLimit,
  modulesOf,
  num,
  parseCaps,
  periodLabel,
  planMrr,
  yearlySavings,
} from './plan-shared'

function Section({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: typeof Users
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[13.5px] font-black text-foreground">
          <Icon className="size-3.5 text-indigo-500" />
          {title}
        </h4>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function PlanDetailsSheet({
  plan,
  theme,
  open,
  onOpenChange,
  totalMrr,
  onEdit,
  onToggleActive,
  onDuplicate,
}: {
  plan: PlanRow | null
  theme: PlanTheme
  open: boolean
  onOpenChange: (o: boolean) => void
  totalMrr: number
  onEdit: (p: PlanRow, tab?: 'basic' | 'pricing' | 'features' | 'modules') => void
  onToggleActive: (p: PlanRow) => void
  onDuplicate: (p: PlanRow) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {plan ? (
          <Body
            plan={plan}
            theme={theme}
            totalMrr={totalMrr}
            onClose={() => onOpenChange(false)}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onDuplicate={onDuplicate}
          />
        ) : (
          <>
            <SheetTitle className="sr-only">تفاصيل الباقة</SheetTitle>
            <SheetDescription className="sr-only">لا توجد باقة محددة</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Body({
  plan: p,
  theme,
  totalMrr,
  onClose,
  onEdit,
  onToggleActive,
  onDuplicate,
}: {
  plan: PlanRow
  theme: PlanTheme
  totalMrr: number
  onClose: () => void
  onEdit: (p: PlanRow, tab?: 'basic' | 'pricing' | 'features' | 'modules') => void
  onToggleActive: (p: PlanRow) => void
  onDuplicate: (p: PlanRow) => void
}) {
  const mrr = planMrr(p)
  const share = totalMrr > 0 ? Math.round((mrr / totalMrr) * 100) : 0
  const features = featureList(p.features)
  const { list: mods, isDefault } = modulesOf(p)
  const caps = parseCaps(p.capabilities)
  const { pct } = yearlySavings(p)

  const monthly = p.monthlyCount ?? p.subscribersCount
  const yearly = p.yearlyCount ?? 0
  const trial = p.trialCount ?? 0
  const subTotal = Math.max(1, monthly + yearly + trial)

  const split = [
    { label: 'شهري', v: monthly, cls: 'bg-indigo-500' },
    { label: 'سنوي', v: yearly, cls: 'bg-violet-500' },
    { label: 'تجربة', v: trial, cls: 'bg-amber-400' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ترويسة */}
      <SheetHeader className="relative shrink-0 overflow-hidden border-b p-4 sm:p-5">
        <div
          aria-hidden
          className={cn('pointer-events-none absolute -top-16 -start-10 size-52 rounded-full opacity-25 blur-3xl', theme.glow)}
        />
        <div className="relative flex items-start gap-3">
          <PlanGlyph plan={p} theme={theme} size="lg" />
          <div className="min-w-0 flex-1 text-start">
            <SheetTitle className="truncate text-base font-black leading-tight">{p.name}</SheetTitle>
            <SheetDescription asChild>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyText(p.code)
                  toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الكود' : 'تعذّر النسخ')
                }}
                className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12.5px] text-foreground/70 transition-colors hover:text-foreground"
                dir="ltr"
              >
                <Hash className="size-3" />
                {p.code}
                <Copy className="size-3 opacity-60" />
              </button>
            </SheetDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone={p.isActive ? 'emerald' : 'neutral'}>{p.isActive ? 'مفعّلة' : 'معطّلة'}</Pill>
              <Pill tone={p.isCanonical ? 'indigo' : 'amber'}>{p.isCanonical ? 'قياسية' : 'مخصّصة'}</Pill>
              <Pill>{BUSINESS_TYPE_LABEL[p.businessType ?? 'electronics'] ?? p.businessType}</Pill>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-foreground/70 backdrop-blur transition-colors hover:bg-background hover:text-foreground sm:size-8"
          >
            <X className="size-4" />
          </button>
        </div>
        {p.description && (
          <p className="relative mt-3 text-start text-[13px] leading-relaxed text-foreground/70">
            {p.description}
          </p>
        )}
      </SheetHeader>

      {/* محتوى قابل للتمرير */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {/* الأسعار */}
        <Section
          icon={Wallet}
          title="التسعير"
          aside={
            <button
              type="button"
              onClick={() => onEdit(p, 'pricing')}
              className="text-[12.5px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
            >
              تعديل
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border bg-card p-3">
              <p className="text-[12px] font-semibold text-foreground/70">شهرياً</p>
              <p className="mt-0.5 font-mono text-lg font-black tabular-nums">
                {p.priceMonthly === 0 ? 'مجاناً' : num(p.priceMonthly)}
                {p.priceMonthly > 0 && <span className="ms-1 font-sans text-[12px] font-bold text-foreground/70">ج.م</span>}
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-3">
              <p className="flex items-center justify-between text-[12px] font-semibold text-foreground/70">
                سنوياً {pct > 0 && <Pill tone="emerald">-{pct}%</Pill>}
              </p>
              <p className="mt-0.5 font-mono text-lg font-black tabular-nums">
                {p.priceYearly === 0 ? '—' : num(p.priceYearly)}
                {p.priceYearly > 0 && <span className="ms-1 font-sans text-[12px] font-bold text-foreground/70">ج.م</span>}
              </p>
            </div>
          </div>
          {p.trialDays > 0 && (
            <Pill tone="indigo" icon={Clock3}>
              تجربة مجانية {p.trialDays} يوم
            </Pill>
          )}
        </Section>

        {/* الإيراد */}
        <Section icon={TrendingUp} title="الأداء">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border bg-gradient-to-br from-indigo-500/[0.09] to-violet-500/[0.04] p-3">
              <p className="text-[12px] font-semibold text-foreground/70">إيراد شهري متكرر</p>
              <p className="mt-0.5 font-mono text-lg font-black tabular-nums">
                {num(mrr)} <span className="font-sans text-[12px] font-bold text-foreground/70">ج.م</span>
              </p>
              <p className="text-[12px] font-semibold text-foreground/70">{share}% من إجمالي الإيراد</p>
            </div>
            <div className="rounded-2xl border bg-card p-3">
              <p className="text-[12px] font-semibold text-foreground/70">المشتركون النشطون</p>
              <p className="mt-0.5 font-mono text-lg font-black tabular-nums">{num(p.subscribersCount)}</p>
              <p className="text-[12px] font-semibold text-foreground/70">
                ≈ {num(mrr * 12)} ج.م سنوياً
              </p>
            </div>
          </div>

          {p.subscribersCount > 0 ? (
            <div className="space-y-2">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {split.map((s) =>
                  s.v > 0 ? (
                    <div
                      key={s.label}
                      className={cn('h-full transition-all', s.cls)}
                      style={{ width: `${(s.v / subTotal) * 100}%` }}
                      title={`${s.label}: ${s.v}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {split.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/70">
                    <span className={cn('size-2 rounded-full', s.cls)} />
                    {s.label}
                    <span className="font-mono font-black text-foreground tabular-nums">{s.v}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed px-4 py-4 text-center text-[13px] text-foreground/70">
              لا يوجد مشتركون نشطون في هذه الباقة بعد.
            </p>
          )}
        </Section>

        {/* قاربت على الانتهاء */}
        {(p.nextExpiring?.length ?? 0) > 0 && (
          <Section
            icon={CalendarClock}
            title="أقرب اشتراكات للانتهاء"
            aside={
              (p.expiringSoonCount ?? 0) > 0 ? (
                <Pill tone="amber">{p.expiringSoonCount} خلال 14 يوم</Pill>
              ) : undefined
            }
          >
            <ul className="space-y-2">
              {p.nextExpiring!.map((s) => {
                const d = daysLeft(s.endDate)
                const urgent = d <= 3
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5',
                      urgent ? 'border-rose-500/30' : d <= 14 ? 'border-amber-500/30' : '',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-black',
                        urgent
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
                      )}
                    >
                      {(s.shopName || '?').trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-tight">{s.shopName}</p>
                      <p className="mt-0.5 text-[11.5px] text-foreground/60">
                        {periodLabel(s.period)} · ينتهي{' '}
                        {new Date(s.endDate).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <Pill tone={d < 0 || urgent ? 'rose' : d <= 14 ? 'amber' : 'neutral'} className="shrink-0">
                      {d < 0 ? 'منتهٍ' : d === 0 ? 'اليوم' : `${d} يوم`}
                    </Pill>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        {/* الحدود */}
        <Section icon={Package} title="الحدود">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: Users, label: 'مستخدمين', v: p.maxUsers },
              { icon: Package, label: 'منتجات', v: p.maxProducts },
              { icon: Building2, label: 'فروع', v: p.maxBranches },
            ].map((l) => (
              <div key={l.label} className="rounded-2xl border bg-card p-3 text-center">
                <l.icon className={cn('mx-auto size-4', theme.text)} />
                <p className="mt-1.5 font-mono text-base font-black tabular-nums">{fmtLimit(l.v)}</p>
                <p className="text-[12px] font-semibold text-foreground/70">{l.label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* المزايا */}
        {features.length > 0 && (
          <Section
            icon={Sparkles}
            title={`المزايا (${features.length})`}
            aside={
              <button
                type="button"
                onClick={() => onEdit(p, 'features')}
                className="text-[12.5px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
              >
                تعديل
              </button>
            }
          >
            <ul className="space-y-1.5">
              {features.map((f, i) => (
                <li key={`${f}-${i}`} className="flex items-start gap-2 text-[13.5px] leading-snug">
                  <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full', theme.soft, theme.text)}>
                    <Check className="size-2.5" strokeWidth={3.5} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* الوحدات */}
        <Section
          icon={Layers}
          title={`الوحدات (${new Set([...mods, ...CRITICAL_MODULES]).size}/${MODULES_META.length})`}
          aside={
            <button
              type="button"
              onClick={() => onEdit(p, 'modules')}
              className="text-[12.5px] font-bold text-indigo-600 hover:underline dark:text-indigo-300"
            >
              تعديل
            </button>
          }
        >
          {isDefault && (
            <p className="text-[12.5px] text-foreground/70">
              هذه باقة قديمة بدون قائمة وحدات محفوظة — تُعرض الوحدات الافتراضية لنوع النشاط.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {MODULES_META.map((mod) => {
              const on = mods.includes(mod.key) || CRITICAL_MODULES.includes(mod.key)
              return (
                <span
                  key={mod.key}
                  title={mod.desc}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-bold',
                    on
                      ? 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                      : 'border-dashed text-foreground/70/60 line-through decoration-muted-foreground/30',
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                  {mod.label}
                </span>
              )
            })}
          </div>
        </Section>

        {/* الصلاحيات */}
        <Section icon={Sparkles} title={`الصلاحيات (${caps.length}/${CAPABILITIES_META.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {CAPABILITIES_META.map((c) => {
              const on = caps.includes(c.key)
              return (
                <span
                  key={c.key}
                  title={c.desc}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-bold',
                    on
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-dashed text-foreground/70/60 line-through decoration-muted-foreground/30',
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                  {c.label}
                </span>
              )
            })}
          </div>
        </Section>
      </div>

      {/* شريط الإجراءات */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_auto] items-center gap-2 border-t bg-background/80 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button
          onClick={() => onEdit(p)}
          className="h-11 gap-1.5 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 hover:from-indigo-500 hover:to-violet-500"
        >
          <Pencil className="size-4" />
          تعديل الباقة
        </Button>
        <Button variant="outline" size="icon" onClick={() => onDuplicate(p)} aria-label="نسخ الباقة" title="نسخ الباقة" className="size-11 rounded-xl">
          <Copy className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onToggleActive(p)}
          aria-label={p.isActive ? 'تعطيل' : 'تفعيل'}
          title={p.isActive ? 'تعطيل الباقة' : 'تفعيل الباقة'}
          className={cn('size-11 rounded-xl', !p.isActive && 'border-emerald-500/40 text-emerald-600')}
        >
          <Power className="size-4" />
        </Button>
      </div>
    </div>
  )
}
