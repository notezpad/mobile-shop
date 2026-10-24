"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Store,
  User,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  Check,
  Smartphone,
  Shirt,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trackEvent, getAttributionForServer } from "@/lib/tracking/client";
import { TRACKING_EVENTS } from "@/lib/tracking/types";
import LoginShowcase from "@/components/login/LoginShowcase";
import { planBenefitItems, branchesLabel, usersLabel, productsLabel } from "@/lib/plan-features";

type PlanMetaEntry = {
  name: string
  shortName: string
  icon: React.ElementType
  cardBg: string
  cardBorder: string
  cardSelected: string
  iconColor: string
  badgeClass: string
  desc: string
  price: string
  /** حدود الباقة الحقيقية من الداتابيز (لو متاحة) */
  limits?: { branches?: number; users?: number; products?: number }
}

// 🛡️ 2026-10-10 FIX: شكل الباقة القادمة من الداتابيز (عبر /api/plans/public)
interface ApiPlan {
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  businessType?: string
  maxBranches?: number
  maxUsers?: number
  maxProducts?: number
}

// ⚠️ PLAN_META هنا للشكل فقط (أيقونة/ألوان/وصف) — أي باقة تظهر فعلياً
// بيتحدد من الداتابيز عبر /api/plans/public (المفعّلة فقط)، مش من هنا.
const PLAN_META: Record<string, PlanMetaEntry> = {
  'electronics-basic': {
    name: 'أساسية - موبايل وكمبيوتر',
    shortName: 'موبايل أساسية',
    icon: Smartphone,
    cardBg: 'bg-sky-50 dark:bg-sky-950/30',
    cardBorder: 'border-sky-200 dark:border-sky-800',
    cardSelected: 'ring-2 ring-sky-500 border-sky-400 bg-sky-100 dark:bg-sky-900/50',
    iconColor: 'text-sky-600 dark:text-sky-400',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    desc: 'POS، مخزون، صيانة، مالية',
    price: '299 EGP',
  },
  'electronics-pro': {
    name: 'احترافية - موبايل وكمبيوتر',
    shortName: 'موبايل احترافية',
    icon: Crown,
    cardBg: 'bg-violet-50 dark:bg-violet-950/30',
    cardBorder: 'border-violet-200 dark:border-violet-800',
    cardSelected: 'ring-2 ring-violet-500 border-violet-400 bg-violet-100 dark:bg-violet-900/50',
    iconColor: 'text-violet-600 dark:text-violet-400',
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
    desc: 'كل المزايا + تقارير، فروع، جملة',
    price: '599 EGP',
  },
  'fashion-basic': {
    name: 'أساسية - ملابس وأحذية',
    shortName: 'ملابس أساسية',
    icon: Shirt,
    cardBg: 'bg-rose-50 dark:bg-rose-950/30',
    cardBorder: 'border-rose-200 dark:border-rose-800',
    cardSelected: 'ring-2 ring-rose-500 border-rose-400 bg-rose-100 dark:bg-rose-900/50',
    iconColor: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
    desc: 'POS، مخزون، مقاسات، خزنة',
    price: '349 EGP',
  },
  'fashion-pro': {
    name: 'احترافية - ملابس وأحذية',
    shortName: 'ملابس احترافية',
    icon: Crown,
    cardBg: 'bg-amber-50 dark:bg-amber-950/30',
    cardBorder: 'border-amber-200 dark:border-amber-800',
    cardSelected: 'ring-2 ring-amber-500 border-amber-400 bg-amber-100 dark:bg-amber-900/50',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    desc: 'جملة — كرتونة/دستة + كوليكشن',
    price: '699 EGP',
  },
}

function planPriceLabel(p: { priceMonthly: number; priceYearly: number }): string {
  return p.priceMonthly > 0
    ? `${p.priceMonthly.toLocaleString('en-US')} EGP`
    : `${p.priceYearly.toLocaleString('en-US')} EGP`
}

function getPasswordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string; bg: string } {
  if (!pwd) return { score: 0, label: '', color: '', bg: '' }
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  const finalScore = Math.min(3, Math.floor(score / 2)) as 0 | 1 | 2 | 3
  const labels = ['ضعيفة', 'متوسطة', 'جيدة', 'قوية']
  const colors = ['text-red-500', 'text-amber-500', 'text-teal-500', 'text-emerald-500']
  const bgs = ['bg-red-500', 'bg-amber-500', 'bg-teal-500', 'bg-emerald-500']
  return { score: finalScore, label: labels[finalScore], color: colors[finalScore], bg: bgs[finalScore] }
}

/* ═══════════ اختيار الباقة: نشاط المحل (كبير وواضح) ثم المستوى ═══════════
 * المشكلة: اللي بيبيع ملابس كان بيدخل يلاقي "موبايل أساسية" مختارة ومفيش
 * حاجة بتلفت نظره إن فيه باقة ملابس (كلمة "تغيير" صغيرة بتعدّي من غير ما
 * حد ياخد باله). الحل: السؤال "إيه نوع نشاطك؟" بقى أول حاجة في الفورم بمربعين
 * كبار جنب بعض (موبايلات وكمبيوتر / ملابس وأحذية) — الاتنين ظاهرين دايماً
 * وملوّنين (مش واحد "شغّال" وواحد "مطفي")، وتحتهم المستوى (أساسي / احترافي)
 * بالسعر والمميزات. بيتبني من الباقات المفعّلة في الداتابيز، فأي باقة تتعطل
 * أو تتضاف بتظهر/تختفي لوحدها. */
type PlanEntry = { code: string; meta: PlanMetaEntry; type: string }

const PLAN_TYPE_META: Record<
  string,
  {
    label: string
    sub: string
    icon: React.ElementType
    grad: string
    glow: string
    tint: string
    soft: string
    text: string
  }
> = {
  electronics: {
    label: 'موبايلات وكمبيوتر',
    sub: 'محلات الموبايل والإلكترونيات',
    icon: Smartphone,
    grad: 'from-[#0fbf86] to-[#00875f]',
    glow: 'shadow-[0_10px_28px_-8px_rgba(0,160,116,0.6)]',
    tint: 'border-[#00c98b]/35 bg-[#effcf7] dark:border-emerald-900 dark:bg-emerald-950/30',
    soft: 'bg-[#e3f9f0] dark:bg-emerald-950/30',
    text: 'text-[#00835a] dark:text-emerald-400',
  },
  fashion: {
    label: 'ملابس وأحذية',
    sub: 'محلات الملابس والأحذية',
    icon: Shirt,
    grad: 'from-[#0fbf86] to-[#00875f]',
    glow: 'shadow-[0_10px_28px_-8px_rgba(0,160,116,0.6)]',
    tint: 'border-[#00c98b]/35 bg-[#effcf7] dark:border-emerald-900 dark:bg-emerald-950/30',
    soft: 'bg-[#e3f9f0] dark:bg-emerald-950/30',
    text: 'text-[#00835a] dark:text-emerald-400',
  },
  other: {
    label: 'باقات أخرى',
    sub: 'باقات إضافية',
    icon: Sparkles,
    grad: 'from-[#0fbf86] to-[#00875f]',
    glow: 'shadow-[0_10px_28px_-8px_rgba(0,160,116,0.6)]',
    tint: 'border-[#00c98b]/35 bg-[#effcf7] dark:border-emerald-900 dark:bg-emerald-950/30',
    soft: 'bg-[#e3f9f0] dark:bg-emerald-950/30',
    text: 'text-[#00835a] dark:text-emerald-400',
  },
}

function planType(code: string, businessType?: string): string {
  const t = (businessType || code.split('-')[0] || '').toLowerCase()
  if (t.includes('fashion')) return 'fashion'
  if (t.includes('electronic')) return 'electronics'
  return 'other'
}

function planLevel(e: PlanEntry): string {
  if (/pro/i.test(e.code)) return 'احترافي'
  if (/basic/i.test(e.code)) return 'أساسي'
  return e.meta.shortName
}

/** يقسّم وصف الباقة ("POS، مخزون + تقارير") لنقاط قصيرة تتعرض كشارات */
function planFeatures(desc: string): string[] {
  return desc
    .split(/[،,+]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4)
}

const priceNum = (p: string) => p.replace(/\s*EGP\s*/i, '')

/** يقسّم وصف الباقة ("POS، مخزون + تقارير") لنقاط تتعرض كقائمة مميزات */
function planChecklist(desc: string): string[] {
  return desc
    .split(/[،,+]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6)
}

/** شريط التقدّم: الخطوة 1 من 2 */
function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <div
      className="flex items-center gap-3"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={2}
      aria-valuenow={step}
      aria-label={`الخطوة ${step} من 2`}
    >
      <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">الخطوة {step} من 2</span>
      <span className="grid flex-1 grid-cols-2 gap-1.5" aria-hidden>
        <span className="h-1.5 rounded-full bg-[#00c98b]" />
        <span className={cn('h-1.5 rounded-full transition-colors duration-300', step === 2 ? 'bg-[#00c98b]' : 'bg-muted')} />
      </span>
    </div>
  )
}

/** سلايدر أفقي لكروت الباقات على الموبايل: الكارت النشط واضح + نقاط تنقّل (من sm: بيرجع شبكة عمودين). */
function PlanRail({ children, labels }: { children: React.ReactElement<{ className?: string }>[]; labels: string[] }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [idx, setIdx] = React.useState(0)

  const onScroll = React.useCallback(() => {
    const el = ref.current
    const first = el?.children[0] as HTMLElement | undefined
    if (!el || !first) return
    const step = first.offsetWidth + 10 // عرض الكارت + gap-2.5
    // scrollLeft سالب في RTL → نستخدم القيمة المطلقة
    setIdx(Math.max(0, Math.min(children.length - 1, Math.round(Math.abs(el.scrollLeft) / step))))
  }, [children.length])

  const goTo = (i: number) => {
    const el = ref.current?.children[i] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  return (
    <div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain scroll-px-3 -mx-3 px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {React.Children.map(children, (child, i) =>
          React.cloneElement(child, {
            className: cn(
              child.props.className,
              'max-sm:transition-all max-sm:duration-300',
              i !== idx && 'max-sm:scale-[0.96] max-sm:opacity-70',
            ),
          }),
        )}
      </div>
      {/* نقاط التنقل — موبايل فقط */}
      <div className="mt-1.5 flex items-center justify-center gap-1.5 sm:hidden" role="tablist" aria-label="الباقات">
        {labels.map((l, i) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-label={l}
            onClick={() => goTo(i)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === idx ? 'w-6 bg-[#00c98b]' : 'w-1.5 bg-foreground/25',
            )}
          />
        ))}
      </div>
    </div>
  )
}

/* ═══════════ الخطوة ١: شاشة اختيار النشاط + الباقة ═══════════
 * النشاط (مربعين) ثم الباقة (كارتين جنب بعض بالسعر والمميزات). الضغط على
 * أي كارت = اختيار + انتقال فوري لفورم التسجيل (الخطوة ٢). مفيش باقة
 * "مختارة مسبقاً" في أول زيارة → الزائر لازم يشوف الاتنين ويقرر. */
function PlanStep({
  entries,
  selected,
  chosen,
  onPickType,
  onChoose,
  loading,
}: {
  entries: PlanEntry[]
  selected: string
  chosen: boolean
  onPickType: (type: string) => void
  onChoose: (code: string) => void
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-[104px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[104px] animate-pulse rounded-2xl bg-muted" />
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="h-[220px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[220px] animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        لا توجد باقات متاحة حالياً — تواصل معنا.
      </p>
    )
  }

  const order = ['electronics', 'fashion', 'other']
  const types = order.filter((t) => entries.some((e) => e.type === t))
  const current = entries.find((e) => e.code === selected) ?? entries[0]
  const curType = current.type
  const levels = entries
    .filter((e) => e.type === curType)
    .sort((a, b) => (parseInt(priceNum(a.meta.price).replace(/\D/g, ''), 10) || 0) - (parseInt(priceNum(b.meta.price).replace(/\D/g, ''), 10) || 0))
  const tm = PLAN_TYPE_META[curType]

  // المميزات الرسمية (نفس صفحة الأسعار). لو الباقة بكود غير معروف نرجع لوصفها من الداتابيز.
  const featsOf = (e: PlanEntry, i: number): string[] => {
    const official = planBenefitItems(e.code).filter((x) => x.ok).map((x) => x.label)
    if (official.length > 0) return official
    const clean = (x: PlanEntry) => planChecklist(x.meta.desc || '').filter((f) => !/^فروع?$/.test(f))
    const own = clean(e)
    if (i === 0) return own
    const prev = clean(levels[i - 1])
    const extra = own.filter((f) => !prev.includes(f))
    if (own.some((f) => f.startsWith('كل '))) return own
    const lvl = planLevel(levels[i - 1])
    return [`كل مميزات ${lvl.startsWith('ال') ? lvl : 'ال' + lvl}`, ...(extra.length ? extra : own)]
  }

  // حدود الباقة (من الداتابيز): الفروع دايماً، والمستخدمين/المنتجات لو بتختلف بين الباقتين
  const limitRows = (e: PlanEntry): string[] => {
    const l = e.meta.limits
    if (!l) return []
    const rows: string[] = []
    if (typeof l.branches === 'number') rows.push(branchesLabel(l.branches))
    const differs = (k: 'users' | 'products') => new Set(levels.map((x) => x.meta.limits?.[k])).size > 1
    if (typeof l.users === 'number' && differs('users')) rows.push(usersLabel(l.users))
    if (typeof l.products === 'number' && differs('products')) rows.push(productsLabel(l.products))
    return rows
  }

  const cards = levels.map((e, i) => {
              const picked = chosen && e.code === current.code
              const feats = featsOf(e, i)
              const limits = limitRows(e)
              return (
                <button
                  key={e.code}
                  type="button"
                  onClick={() => onChoose(e.code)}
                  aria-label={`${planLevel(e)} — ${priceNum(e.meta.price)} جنيه في الشهر — ابدأ التجربة المجانية`}
                  className={cn(
                    levels.length > 1 && 'max-sm:w-[84%] max-sm:shrink-0 max-sm:snap-start',
                    'group flex min-w-0 flex-col gap-1.5 rounded-2xl border-2 p-2.5 text-right transition-all duration-200 active:scale-[0.98] sm:gap-3 sm:p-4',
                    picked
                      ? 'border-[#00c98b] bg-[#effcf7] ring-2 ring-[#00c98b]/30'
                      : 'border-border bg-card hover:border-[#00c98b] hover:shadow-md',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-extrabold text-foreground">{planLevel(e)}</span>
                    {picked && (
                      <span className="grid size-5 place-items-center rounded-full bg-[#00c98b] text-white" aria-hidden>
                        <Check className="size-3" strokeWidth={3.5} />
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className={cn('text-[1.4rem] font-black leading-none tabular-nums sm:text-3xl', tm.text)}>{priceNum(e.meta.price)}</span>
                    <span className="text-xs font-bold text-muted-foreground">جنيه / شهر</span>
                  </span>
                  {(limits.length > 0 || feats.length > 0) && (
                    <ul className="space-y-0.5 text-[11.5px] leading-tight text-foreground/80 sm:space-y-1.5 sm:text-[13px] sm:leading-snug">
                      {limits.map((f) => (
                        <li key={'lim-' + f} className="flex items-start gap-1.5 font-extrabold text-foreground">
                          <Store className="mt-0.5 size-3.5 shrink-0 text-[#00946a]" aria-hidden />
                          <span>{f}</span>
                        </li>
                      ))}
                      {feats.map((f, fi) => (
                        <li key={f} className={cn('flex items-start gap-1.5', fi >= 4 && 'max-sm:hidden')}>
                          <Check className="mt-0.5 size-3.5 shrink-0 text-[#00946a]" strokeWidth={3} aria-hidden />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-xl sm:h-11 bg-[#00c98b] text-sm font-extrabold text-[#04261b] shadow-md shadow-[#00c98b]/25 transition-colors group-hover:bg-[#00b87e]">
                    <span className="sm:hidden">ابدأ مجاناً</span>
                    <span className="max-sm:hidden">ابدأ التجربة المجانية</span>
                    <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                  </span>
                </button>
              )
            })

  return (
    <div className="space-y-2.5 sm:space-y-5">
      {types.length > 1 && (
        <section className="space-y-2" aria-labelledby="su-q-type">
          <h2 id="su-q-type" className="text-sm font-extrabold text-foreground sm:text-[15px]">إيه نوع محلك؟</h2>
          <div
            className={cn('grid gap-2.5', types.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}
            role="radiogroup"
            aria-labelledby="su-q-type"
          >
            {types.map((t) => {
              const m = PLAN_TYPE_META[t]
              const Icon = m.icon
              const sel = t === curType
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => onPickType(t)}
                  className={cn(
                    'relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-1 text-center sm:min-h-[104px] sm:gap-2 sm:py-3 transition-all duration-200 active:scale-[0.97]',
                    sel
                      ? cn('border-transparent bg-gradient-to-br text-white', m.grad, m.glow)
                      : 'border-border bg-card text-foreground hover:border-[#00c98b]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute end-2 top-2 grid size-5 place-items-center rounded-full border-2',
                      sel ? 'border-transparent bg-white text-[#00875f]' : 'border-foreground/30',
                    )}
                    aria-hidden
                  >
                    {sel && <Check className="size-3" strokeWidth={3.5} />}
                  </span>
                  <span className={cn('grid size-7 place-items-center rounded-lg sm:size-12 sm:rounded-2xl', sel ? 'bg-black/15' : cn('bg-[#e3f9f0]', m.text))}>
                    <Icon className="size-4 sm:size-6" strokeWidth={1.9} />
                  </span>
                  <span className="text-[13px] font-extrabold leading-tight">{m.label}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="su-q-lvl">
        <h2 id="su-q-lvl" className="text-sm font-extrabold text-foreground sm:text-[15px]">اختار الباقة المناسبة</h2>
        {levels.length > 1 ? (
          <PlanRail labels={levels.map(planLevel)}>{cards}</PlanRail>
        ) : (
          <div className="grid gap-2.5 sm:gap-3">{cards}</div>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground max-sm:hidden">14 يوم تجربة مجانية بكل المزايا — بدون بطاقة ائتمان</p>
    </div>
  )
}

/** ملخص الاختيار أعلى الفورم (الخطوة ٢) + زر رجوع واضح */
function PlanSummary({ entry, onBack, error }: { entry: PlanEntry; onBack: () => void; error?: string }) {
  const tm = PLAN_TYPE_META[entry.type]
  return (
    <div className="su-span space-y-1.5">
      <div className={cn('flex w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5', tm.tint)}>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-sm', tm.grad)}>
          <Check className="size-4" strokeWidth={3.5} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[13px] font-extrabold leading-tight text-foreground">
            {tm.label} — {planLevel(entry)}
          </p>
          <p className="text-[11.5px] font-bold leading-tight text-foreground/70">
            14 يوم مجاناً ثم{' '}
            <span className={cn('font-black tabular-nums', tm.text)}>{priceNum(entry.meta.price)} جنيه/شهر</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="رجوع لاختيار الباقة"
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-[#00c98b]/50 bg-white px-3 text-[13px] font-bold text-[#00694c] transition-colors hover:bg-[#effcf7]"
        >
          <ArrowRight className="size-4" aria-hidden />
          رجوع
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

const SIGNUP_CSS = `
.su-side input[data-slot="input"]:focus-visible{border-color:#00c98b !important;box-shadow:0 0 0 3px rgba(0,201,139,.25) !important}
.su-side input:-webkit-autofill,
.su-side input:-webkit-autofill:hover,
.su-side input:-webkit-autofill:focus{
  -webkit-box-shadow:0 0 0 1000px #effcf7 inset !important;
  box-shadow:0 0 0 1000px #effcf7 inset !important;
  -webkit-text-fill-color:#0b2a20 !important;
  caret-color:#0b2a20;
  border-color:rgba(0,201,139,.45);
  transition:background-color 9999s ease-out 0s;
}
.su-invite-d{display:none}
@media (min-width:1024px){
  /* ScaleWrapper بيصغّر الصفحة على الشاشات ≤1536px وبيظبط --app-h على الارتفاع المعدّل،
     بس lg:h-screen ما بتتأثرش بيه → كانت الصفحة بتقف قبل آخر الشاشة (الهيرو مقصوص من تحت) */
  main{height:var(--app-h,100vh)}
  main .su-side{height:var(--app-h,100vh)}
  main .su-side{align-items:flex-start;padding:16px 24px}
  main .su-wrap{max-width:580px;margin-block:auto}
  main .su-card{display:flex;flex-direction:column;padding:0}
  main .su-card>*{margin:0}
  main .su-body{display:flex;flex-direction:column;gap:12px;padding:20px}
  main .su-body>*{margin:0}
  main .su-title{display:flex;align-items:center;justify-content:space-between;gap:12px}
  main .su-chips{margin-top:0}
  main .su-form{display:grid;grid-template-columns:1fr 1fr;gap:24px 12px;align-items:start}
  main .su-form>*{margin:0}
  main .su-form>.su-span{grid-column:1/-1}
  main .su-fld{display:flex;flex-direction:column;gap:16px;min-width:0}
  main .su-fld>*{margin:0}
  main .su-form input[data-slot="input"]{height:40px}
  main .su-invite-btn{display:none}
  main .su-invite-d{display:flex}
  /* زر الإنشاء: عادي (مش ثابت أسفل الشاشة) */
  main .su-cta{position:static;margin:0;padding:0;border:0;background:transparent;backdrop-filter:none;border-radius:0}
}
@media (min-width:1024px) and (max-height:760px){
  main .su-side{padding-block:8px}
  main .su-body{padding:14px;gap:10px}
  main .su-hd{padding-block:12px}
  main .su-form{gap:16px 8px}
  main .su-fld{gap:12px}
  main .su-copy{display:none}
}
`

type SignupError = { field: string; message: string }

/**
 * 📱 طلب التسجيل — fetch مباشر (مش api() بتاعة الأوفلاين).
 *
 * ليه؟ api() لما الشبكة تقطع بتحط الطلب في outbox على الجهاز وترجّع "نجاح
 * وهمي" — يعني على موبايل بشبكة ضعيفة (متصفح فيسبوك مثلاً) المستخدم كان بيشوف
 * "فشل إنشاء الحساب" وبياناته (وكلمة المرور!) متخزنة محلياً وبتتبعت لاحقاً.
 * هنا: مهلة 25 ثانية + إعادة محاولة تلقائية (حتى مرتين) لو 500/502/503/504
 * أو انقطاع شبكة (cold-start للـ DB زي PERF_FIX_503). ولو المحاولة الأولى
 * نجحت فعلاً والرد ضاع، الإعادة هترجع "البريد مسجّل" — فنجرّب نسجّل دخول
 * بنفس البيانات ونعتبرها نجاح.
 */
// ─── 🛡️ 2026-10-12: إيميل جاهز (gmail/yahoo) + موبايل مصري إجباري ───
/** الدومينات اللي بنقترحها أثناء الكتابة (بالترتيب) */
const EMAIL_SUGGEST_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com']

/** مسافة Damerau–Levenshtein (التبديل بين حرفين = 1) — لاكتشاف أخطاء زي gmial / gmail.con */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/**
 * لو الدومين المكتوب شبه دومين معروف بحرف واحد غلط (gmial.com / gmail.con / yaho.com)
 * بنرجّع الدومين الصحيح. لو الدومين نفسه معروف أو مختلف تماماً → null.
 * `typing`: المستخدم لسه بيكتب → ما نقترحش على دومين ناقص (gmail.co وهو في طريقه لـ gmail.com).
 */
function suggestDomainFix(domain: string, typing: boolean): string | null {
  if (!domain || !/^[a-z0-9\-]+\.[a-z]{2,}$/.test(domain)) return null
  if (EMAIL_SUGGEST_DOMAINS.includes(domain)) return null
  if (typing && EMAIL_SUGGEST_DOMAINS.some((k) => k.startsWith(domain))) return null
  let best: string | null = null
  for (const k of EMAIL_SUGGEST_DOMAINS) {
    if (editDistance(domain, k) === 1) { best = k; break }
  }
  return best
}

/** نفس منطق السيرفر (src/lib/signup-guard.ts → normalizeEgyptPhone). */
function normalizeEgyptPhoneClient(raw: string): string | null {
  let v = (raw || '')
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[\s\-().]/g, '')
  if (v.startsWith('+')) v = v.slice(1)
  if (v.startsWith('0020')) v = v.slice(4)
  else if (v.startsWith('20') && v.length === 12) v = v.slice(2)
  if (v.length === 10 && v.startsWith('1')) v = '0' + v
  return /^01[0125]\d{8}$/.test(v) ? v : null
}

async function postSignup(body: Record<string, any>): Promise<any> {
  const RETRYABLE = new Set([500, 502, 503, 504])
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  let ambiguous = false // حصل فشل ممكن يكون السيرفر نفّذ فيه الطلب
  let lastErr: Error = new Error('فشل إنشاء الحساب')
  for (let attempt = 0; attempt <= 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) return data
      const msg: string = data?.error || `فشل إنشاء الحساب (${res.status})`
      if (RETRYABLE.has(res.status) && attempt < 2) {
        ambiguous = true
        lastErr = new Error(msg)
        await sleep(500 * (attempt + 1))
        continue
      }
      // الإعادة لقت الحساب موجود = غالباً المحاولة السابقة نجحت → سجّل دخول
      if (ambiguous && (msg.includes('مسجّل') || msg.includes('موجود'))) {
        const lr = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: body.email, password: body.password }),
        })
        const ld = await lr.json().catch(() => null)
        if (lr.ok && ld?.ok) return { ok: true, user: ld.user, tracking: undefined }
      }
      throw new Error(msg)
    } catch (err: any) {
      if (err?.name === 'AbortError' || err instanceof TypeError) {
        // انقطاع/بطء شبكة
        ambiguous = true
        lastErr = new Error('الاتصال ضعيف — اتأكد من الإنترنت وجرّب تاني')
        if (attempt < 2) { await sleep(600 * (attempt + 1)); continue }
        throw lastErr
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planFromUrl = searchParams.get('plan') ?? ''
  const [selectedPlan, setSelectedPlan] = React.useState<string>(
    searchParams.get('plan') ?? ''
  )

  // 🛡️ 2026-10-10 FIX: صفحة التسجيل كانت بتعرض 4 باقات ثابتة في الكود
  // (PLAN_META) مش مربوطة بالداتابيز — فالباقة اللي الأدمن يعطّلها من
  // لوحة التحكم كانت بتظهر هنا عادي رغم إنها مخفية من /pricing والرئيسية.
  // الآن: الباقات المعروضة = اللي /api/plans/public بيرجعه فقط (المفعّلة)،
  // و PLAN_META بيفضل مسؤول عن الشكل بس.
  // null = لسه بنحمّل · فشل الشبكة = plansFailed → نرجع للقائمة الثابتة
  const [apiPlans, setApiPlans] = React.useState<ApiPlan[] | null>(null)
  const [plansFailed, setPlansFailed] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    api<{ items: ApiPlan[] }>('/api/plans/public')
      .then((d) => {
        if (!alive) return
        setApiPlans(Array.isArray(d?.items) ? d.items : [])
      })
      .catch(() => {
        // فشل الشبكة فقط → نرجع للقائمة الثابتة عشان التسجيل ميتوقفش،
        // والسيرفر بيتحقق من الباقة تاني عند إنشاء الحساب فعلياً.
        if (!alive) return
        setPlansFailed(true)
      })
    return () => { alive = false }
  }, [])

  // 📱 إزالة احتكاك: المستخدم مش مطلوب منه "يختار باقة" قبل ما يسجّل.
  // التجربة مجانية على أي حال، فبنختار تلقائياً الباقة الأساسية (أو أول باقة
  // مفعّلة) — ولو الباقة اللي في الرابط (?plan=...) مش مفعّلة نرجع للافتراضية.
  // الاختيار بيتغيّر من PlanChooser (نشاط + مستوى) — مش بيتمسح.
  React.useEffect(() => {
    if (apiPlans === null) return
    if (selectedPlan && apiPlans.some((p) => p.code === selectedPlan)) return
    const def = apiPlans.find((p) => p.code === 'electronics-basic') ?? apiPlans[0]
    setSelectedPlan(def?.code ?? '')
  }, [apiPlans, selectedPlan])
  // فشل تحميل الباقات (شبكة ضعيفة): نكمل بالباقة الافتراضية والسيرفر هيتحقق منها
  React.useEffect(() => {
    if (plansFailed && !selectedPlan) setSelectedPlan('electronics-basic')
  }, [plansFailed, selectedPlan])

  const plansLoading = apiPlans === null && !plansFailed

  // قائمة اختيار الباقات — من الداتابيز (المفعّلة فقط) أو الثابتة عند فشل الشبكة
  const pickerEntries = React.useMemo<{ code: string; meta: PlanMetaEntry }[]>(() => {
    if (apiPlans === null) {
      return Object.entries(PLAN_META).map(([code, m]) => ({ code, meta: m }))
    }
    return apiPlans.map((p) => {
      const fb = PLAN_META[p.code]
      return {
        code: p.code,
        meta: {
          name: p.name || fb?.name || p.code,
          shortName: fb?.shortName ?? (p.name || p.code),
          icon: fb?.icon ?? Sparkles,
          cardBg: fb?.cardBg ?? 'bg-muted/60 dark:bg-muted/30',
          cardBorder: fb?.cardBorder ?? 'border-border',
          cardSelected: fb?.cardSelected ?? 'ring-2 ring-primary border-primary',
          iconColor: fb?.iconColor ?? 'text-primary',
          badgeClass: fb?.badgeClass ?? 'bg-muted text-foreground',
          desc: fb?.desc ?? p.description ?? '',
          price: planPriceLabel(p),
          limits: { branches: p.maxBranches, users: p.maxUsers, products: p.maxProducts },
        },
      }
    })
  }, [apiPlans])

  const [shopName, setShopName] = React.useState('')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [emailFocused, setEmailFocused] = React.useState(false)
  const [emailActiveIdx, setEmailActiveIdx] = React.useState(-1)
  const [phone, setPhone] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [inviteCode, setInviteCode] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [showInvite, setShowInvite] = React.useState(false)
  // بوابة زر الإنشاء الثابت على الموبايل (بتتحط في body عشان fixed يشتغل صح بره أي transform)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState<SignupError[]>([])

  // ─── خطوتين: 1) اختيار النشاط والباقة  2) فورم التسجيل ───
  // لو الباقة جاية من الرابط (?plan=…) نبدأ من الخطوة 2 مباشرة.
  const [step, setStep] = React.useState<1 | 2>(planFromUrl ? 2 : 1)
  const [levelChosen, setLevelChosen] = React.useState<boolean>(!!planFromUrl)
  const pushedRef = React.useRef(false)

  // باقة الرابط مش مفعّلة → ارجع لاختيار الباقة
  React.useEffect(() => {
    if (apiPlans && planFromUrl && !apiPlans.some((p) => p.code === planFromUrl)) {
      setStep(1)
      setLevelChosen(false)
    }
  }, [apiPlans, planFromUrl])

  // زر الرجوع في المتصفح/الموبايل يرجّع للخطوة 1 بدل ما يخرج من الصفحة
  React.useEffect(() => {
    const onPop = (e: PopStateEvent) => setStep(e.state?.signupStep === 2 ? 2 : 1)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // عند تغيّر الخطوة: ارجع لأول الصفحة، وعلى الديسكتوب ركّز على أول حقل
  React.useEffect(() => {
    window.scrollTo({ top: 0 })
    document.querySelector('.su-side')?.scrollTo({ top: 0 })
    if (step === 2 && window.matchMedia('(min-width: 1024px)').matches) {
      requestAnimationFrame(() => document.getElementById('su-shop')?.focus({ preventScroll: true }))
    }
  }, [step])

  // ─── إيميل: اقتراح الدومين أثناء الكتابة + تصحيح الأخطاء الشائعة ───
  const emailLower = email.trim().toLowerCase()
  const emailAt = emailLower.indexOf('@')
  const emailLocal = emailAt === -1 ? emailLower : emailLower.slice(0, emailAt)
  const emailDomainTyped = emailAt === -1 ? '' : emailLower.slice(emailAt + 1)
  const emailSuggestions: string[] =
    !emailFocused || !emailLocal
      ? []
      : EMAIL_SUGGEST_DOMAINS
          .filter((d) => d.startsWith(emailDomainTyped) && d !== emailDomainTyped)
          .map((d) => `${emailLocal}@${d}`)
  const emailTypoFix = emailAt === -1 ? null : suggestDomainFix(emailDomainTyped, emailFocused)
  const emailTypoFixFull = emailTypoFix ? `${emailLocal}@${emailTypoFix}` : null

  const pickEmail = (full: string) => {
    setEmail(full); setEmailActiveIdx(-1); clearFieldError('email')
  }

  const passStrength = getPasswordStrength(password)

  const setFieldError = (field: string, message: string) =>
    setErrors((prev) => [...prev.filter((e) => e.field !== field), { field, message }])
  const clearFieldError = (field: string) =>
    setErrors((prev) => prev.filter((e) => e.field !== field))
  const getFieldError = (field: string) => errors.find((e) => e.field === field)?.message

  const planEntries = React.useMemo<PlanEntry[]>(
    () => pickerEntries.map((e) => ({
      ...e,
      type: planType(e.code, apiPlans?.find((p) => p.code === e.code)?.businessType),
    })),
    [pickerEntries, apiPlans],
  )
  const currentEntry = planEntries.find((e) => e.code === selectedPlan) ?? planEntries[0]

  const pickPlanType = (t: string) => {
    const group = planEntries.filter((e) => e.type === t)
    if (group.length === 0) return
    const sameLevel = currentEntry ? group.find((e) => planLevel(e) === planLevel(currentEntry)) : undefined
    setSelectedPlan((sameLevel ?? group[0]).code)
    setLevelChosen(false)
    clearFieldError('plan')
  }
  const choosePlan = (code: string) => {
    setSelectedPlan(code)
    setLevelChosen(true)
    clearFieldError('plan')
    // تأخير بسيط عشان المستخدم يشوف الكارت اتحدد قبل الانتقال
    window.setTimeout(() => {
      try { window.history.pushState({ signupStep: 2 }, ''); pushedRef.current = true } catch { /* ignore */ }
      setStep(2)
    }, 160)
  }
  const backToPlans = () => {
    if (pushedRef.current) window.history.back()
    else setStep(1)
  }

  const validate = (): boolean => {
    const newErrors: SignupError[] = []
    if (!selectedPlan) newErrors.push({ field: 'plan', message: 'اختر باقة أولاً' })
    if (!shopName.trim()) newErrors.push({ field: 'shopName', message: 'اسم المحل مطلوب' })
    if (!name.trim()) newErrors.push({ field: 'name', message: 'اسم المسؤول مطلوب' })
    if (!email.trim()) newErrors.push({ field: 'email', message: 'البريد مطلوب' })
    else if (!/^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/i.test(email.trim())) newErrors.push({ field: 'email', message: 'صيغة البريد غير صحيحة' })
    if (!phone.trim()) newErrors.push({ field: 'phone', message: 'رقم الموبايل مطلوب' })
    else if (!normalizeEgyptPhoneClient(phone)) newErrors.push({ field: 'phone', message: 'اكتب رقم موبايل مصري صحيح (مثال: 01012345678)' })
    if (!password) newErrors.push({ field: 'password', message: 'كلمة المرور مطلوبة' })
    else if (password.length < 6) newErrors.push({ field: 'password', message: 'الحد الأدنى 6 أحرف' })
    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (!validate()) {
      toast.error('من فضلك صحّح الأخطاء')
      // على الموبايل الخطأ ممكن يكون فوق الشاشة — نوصّل المستخدم له
      requestAnimationFrame(() =>
        document.querySelector('form p.text-destructive')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      )
      return
    }
    setLoading(true)
    try {
      // 📊 التقاط مصدر الاكتساب (utm_* + click ids) من طبقة التتبع
      const attribution = getAttributionForServer()
      const data: { ok: boolean; user?: any; error?: string; tracking?: { registrationEventId: string; trialEventId: string; planName?: string } } = await postSignup({
        shopName: shopName.trim(), name: name.trim(), email: email.trim().toLowerCase(), phone: normalizeEgyptPhoneClient(phone) ?? phone.trim(), password,
        inviteCode: inviteCode.trim() || undefined, agree: true, planCode: selectedPlan || undefined, attribution: attribution ?? undefined,
      })
      if (data?.ok && data.user) {
        // ═══ 📊 Tracking Browser-side ═══
        // يُطلق هنا فقط لأن الاستجابة تأتي من السيرفر بعد نجاح إنشاء
        // الحساب فعلياً — وليس عند فتح الصفحة أو الضغط أو وجود خطأ.
        // نفس event_id الذي أرسله السيرفر → Deduplication مثالي.
        try {
          // 🛡️ السيرفر بيرجّع tracking فقط للتسجيل الحقيقي؛ المشكوك فيه (بريد مؤقت/test) مفيش حدث.
          if (data.tracking) trackEvent(TRACKING_EVENTS.CompleteRegistration, {
            eventId: data.tracking.registrationEventId,
            contentName: data.tracking.planName,
            contentType: 'subscription_plan',
          })
          if (data.tracking?.trialEventId) {
            trackEvent(TRACKING_EVENTS.StartTrial, {
              eventId: data.tracking.trialEventId,
              currency: 'EGP',
              planName: data.tracking.planName,
              period: 'trial',
            })
          }
        } catch { /* التتبع لا يوقف التسجيل أبداً */ }
        toast.success(`تم إنشاء محلك «${shopName.trim()}» — تجربة 14 يوم`)
        try { sessionStorage.setItem('welcome_contact', JSON.stringify({ phone: normalizeEgyptPhoneClient(phone) ?? phone.trim(), email: email.trim().toLowerCase() })) } catch { /* ignore */ }
        // 🎁 2026-10-23: مفيش شاشة «ضيف أول منتج» — المحل بيتفتح ببيانات تجريبية، فندخل لوحة التحكم على طول
        router.push('/dashboard')
        router.refresh()
      } else { toast.error(data?.error ?? 'فشل إنشاء الحساب') }
    } catch (err: any) {
      const msg = err?.message ?? 'تعذّر الاتصال'
      toast.error(msg)
      if (msg.includes('الموبايل')) setFieldError('phone', msg)
      else if (msg.includes('مسجّل') || msg.includes('موجود') || msg.includes('البريد')) setFieldError('email', msg)
    } finally { setLoading(false) }
  }

  return (
    <main className="min-h-dvh grid lg:h-screen lg:grid-cols-2 bg-background lg:overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: SIGNUP_CSS }} />

      {/* ─── Form side ─── */}
      <div className="su-side min-h-dvh lg:h-screen lg:overflow-y-auto flex items-start justify-center py-1.5 px-3 sm:px-4 sm:py-5 bg-[#f7fbf9]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="su-wrap w-full max-w-md"
        >
          {/* Card wrapper */}
          <div className="su-card bg-card rounded-2xl border border-border shadow-lg shadow-black/5 overflow-clip">

            {/* الهيدر — شريط التذكرة (نفس أسلوب صفحة الدخول) */}
            <header className="su-hd relative px-4 pt-3 pb-3 sm:px-5 sm:pt-5 sm:pb-4 bg-gradient-to-b from-[#e3f9f0] via-[#f1fcf8] to-card border-b-2 border-dashed border-[#00c98b]/35">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: "radial-gradient(rgba(0,148,106,.26) 1px, transparent 1.4px)",
                  backgroundSize: "14px 14px",
                  WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 0% 0%, #000, transparent 75%)",
                  maskImage: "radial-gradient(ellipse 60% 70% at 0% 0%, #000, transparent 75%)",
                }}
              />
              <span aria-hidden className="absolute -bottom-2.5 -left-2.5 size-5 rounded-full border border-border bg-[#f7fbf9]" />
              <span aria-hidden className="absolute -bottom-2.5 -right-2.5 size-5 rounded-full border border-border bg-[#f7fbf9]" />

              <div className="relative space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="Nezam POS">
                    <img
                      src="/logo.svg" alt="" width={38} height={38}
                      className="size-8 sm:size-[38px] rounded-xl shadow-md shadow-[#00c98b]/35 ring-2 ring-white transition-transform group-hover:scale-105 group-hover:-rotate-3"
                    />
                    <div className="leading-none">
                      <p dir="ltr" className="text-[17px] font-black tracking-tight text-foreground text-right">
                        Nezam <span className="text-[#00946a]">POS</span>
                      </p>
                      <p className="mt-1 text-[10.5px] font-medium text-muted-foreground">نظام المحل</p>
                    </div>
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#00c98b]/35 bg-white/80 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-[#00c98b] hover:bg-white"
                  >
                    <span className="max-[380px]:hidden">لديك حساب؟</span> <span className="font-extrabold text-[#00946a]">دخول</span>
                  </Link>
                </div>

                <div className="su-title">
                  <div>
                    <h1 className="text-[1.25rem] sm:text-[1.6rem] font-extrabold leading-tight tracking-tight text-foreground">
                      {step === 1 ? 'ابدأ تجربتك المجانية' : 'أنشئ حسابك'}
                    </h1>
                    {step === 1 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11.5px] font-bold text-[#00694c] sm:hidden">
                        <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden />
                        14 يوم مجاناً بكل المزايا — بدون بطاقة ائتمان
                      </p>
                    )}
                    {step === 1 && (
                      <p className="mt-1 text-[12.5px] text-muted-foreground max-sm:hidden">اختار نشاطك والباقة، وبعدها بيانات الحساب في خطوة واحدة.</p>
                    )}
                  </div>
                  {step === 2 && (
                    <ul className="su-chips mt-2 flex flex-wrap max-sm:hidden gap-x-3 gap-y-1 text-[11.5px] font-medium text-muted-foreground">
                      {['14 يوم مجاناً', 'بدون بطاقة', 'جاهز في دقيقتين'].map((x) => (
                        <li key={x} className="inline-flex items-center gap-1">
                          <Check className="size-3 text-[#00946a]" strokeWidth={3} />
                          {x}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </header>

            <div className={cn("su-body p-2.5 sm:p-5 space-y-2 sm:space-y-4", step === 2 && "max-lg:pb-24")}>

            <StepBar step={step} />

            {step === 1 ? (
              <motion.div key="step-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <PlanStep
                  loading={plansLoading && planEntries.length === 0}
                  entries={planEntries}
                  selected={selectedPlan}
                  chosen={levelChosen}
                  onPickType={pickPlanType}
                  onChoose={choosePlan}
                />
              </motion.div>
            ) : (
            <motion.div key="step-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {/* Form */}
            <form id="su-form" onSubmit={handleSubmit} noValidate className="su-form min-w-0 space-y-3 sm:space-y-4">
              {/* اختيار النشاط + المستوى — ظاهر دايماً وأول حاجة في الفورم (مفيش "تغيير" مخفي) */}
              {currentEntry ? (
                <PlanSummary entry={currentEntry} onBack={backToPlans} error={getFieldError('plan')} />
              ) : plansLoading ? (
                <div className="su-span h-[58px] animate-pulse rounded-xl bg-muted" aria-busy="true" />
              ) : null}

              {/* Row 1: اسم المحل + اسم المسؤول */}
              <div className="su-span grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                <Field className="su-fld space-y-1.5 sm:space-y-2.5" label="اسم المحل" required error={getFieldError('shopName')}>
                  <Input id="su-shop" type="text" placeholder="مثال: النور للموبايلات" icon={<Store className="size-4" />}
                    value={shopName} onChange={(e: any) => { setShopName(e.target.value); clearFieldError('shopName') }}
                    disabled={loading} required autoComplete="organization" enterKeyHint="next" className="h-10 lg:h-10" />
                </Field>
                <Field className="su-fld space-y-1.5 sm:space-y-2.5" label="اسم المسؤول" required error={getFieldError('name')}>
                  <Input type="text" placeholder="مثال: أحمد محمد" icon={<User className="size-4" />}
                    value={name} onChange={(e: any) => { setName(e.target.value); clearFieldError('name') }}
                    disabled={loading} required autoComplete="name" enterKeyHint="next" className="h-10 lg:h-10" />
                </Field>
              </div>

              {/* Row 2: البريد + الهاتف */}
              <div className="su-span grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                <Field className="su-fld space-y-1.5 sm:space-y-2.5" label="البريد الإلكتروني" required error={getFieldError('email')}>
                  <div className="relative">
                    <Input type="text" placeholder="example@gmail.com" icon={<Mail className="size-4" />}
                      value={email}
                      onChange={(e: any) => { setEmail(e.target.value.replace(/\s/g, '')); setEmailActiveIdx(-1); clearFieldError('email') }}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => { setEmailFocused(false); setEmailActiveIdx(-1) }}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (!emailSuggestions.length) return
                        if (e.key === 'ArrowDown') { e.preventDefault(); setEmailActiveIdx((i) => (i + 1) % emailSuggestions.length) }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setEmailActiveIdx((i) => (i <= 0 ? emailSuggestions.length - 1 : i - 1)) }
                        else if (e.key === 'Enter' && emailActiveIdx >= 0) { e.preventDefault(); pickEmail(emailSuggestions[emailActiveIdx]) }
                        else if (e.key === 'Escape') { setEmailActiveIdx(-1); (e.target as HTMLElement).blur() }
                      }}
                      dir="ltr" className="text-left h-10 lg:h-10" disabled={loading} required autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                      role="combobox" aria-expanded={emailSuggestions.length > 0} aria-autocomplete="list" />
                    {/* قائمة الاقتراحات: عائمة فوق المحتوى (absolute) → ما بتطوّلش الفورم */}
                    {emailSuggestions.length > 0 && (
                      <ul role="listbox" dir="ltr"
                        className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
                        {emailSuggestions.map((full, i) => {
                          const at = full.indexOf('@')
                          return (
                            <li key={full} role="option" aria-selected={i === emailActiveIdx}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickEmail(full)}
                              onMouseEnter={() => setEmailActiveIdx(i)}
                              className={cn('cursor-pointer px-3 py-2 text-left text-sm', i === emailActiveIdx ? 'bg-primary/10' : 'hover:bg-muted')}>
                              <span className="text-muted-foreground">{full.slice(0, at)}</span>
                              <span className="font-semibold">{full.slice(at)}</span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                  {/* تنبيه «قصدك…؟» — بيظهر بس لو في غلطة إملائية في الدومين (gmial.com / gmail.con) */}
                  {emailTypoFixFull && (
                    <button type="button" disabled={loading} dir="ltr"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickEmail(emailTypoFixFull)}
                      className="h-9 w-full truncate rounded-md border border-amber-400 bg-amber-50 px-3 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200">
                      قصدك <span className="font-semibold">{emailTypoFixFull}</span> ؟ اضغط للتصحيح
                    </button>
                  )}
                </Field>
                <Field className="su-fld space-y-1.5 sm:space-y-2.5" label="رقم الموبايل" required error={getFieldError('phone')}>
                  <Input type="tel" placeholder="01012345678" icon={<Smartphone className="size-4" />}
                    value={phone} onChange={(e: any) => { setPhone(e.target.value); clearFieldError('phone') }}
                    dir="ltr" className="text-left h-10 lg:h-10" disabled={loading} required autoComplete="tel" inputMode="tel" enterKeyHint="next" />
                </Field>
              </div>

              {/* كلمة المرور */}
              <Field className="su-fld space-y-1.5 sm:space-y-2.5" label="كلمة المرور" required error={getFieldError('password')} hint="الحد الأدنى 6 أحرف">
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} placeholder="••••••"
                    icon={<Lock className="size-4" />} value={password}
                    onChange={(e: any) => { setPassword(e.target.value); clearFieldError('password') }}
                    dir="ltr" className="text-left pl-10 h-10 lg:h-10" disabled={loading} required minLength={6} autoComplete="new-password" autoCapitalize="none" enterKeyHint="done" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1} aria-label={showPass ? 'إخفاء' : 'إظهار'}>
                    {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 grid grid-cols-3 gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i < passStrength.score ? passStrength.bg : 'bg-muted'}`} />
                      ))}
                    </div>
                    <span className={`text-[10px] font-medium ${passStrength.color} w-9`}>{passStrength.label}</span>
                  </div>
                )}
              </Field>

              {/* كود الدعوة — collapsible */}
              {!showInvite ? (
                <>
                <button type="button" onClick={() => setShowInvite(true)}
                  className="su-invite-btn hidden text-[11px] text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline">
                  + عندك كود دعوة؟
                </button>
                {/* ديسكتوب فقط (CSS): كود الدعوة ظاهر دايماً جنب كلمة المرور */}
                <Field className="su-invite-d su-fld" label="كود الدعوة (اختياري)">
                  <Input type="text" placeholder="اكتب كود الدعوة" value={inviteCode}
                    onChange={(e: any) => setInviteCode(e.target.value)} disabled={loading} />
                </Field>
                </>
              ) : (
                <Field className="su-fld space-y-1.5 sm:space-y-2.5" label="كود الدعوة (اختياري)">
                  <Input type="text" placeholder="اكتب كود الدعوة" value={inviteCode}
                    onChange={(e: any) => setInviteCode(e.target.value)} disabled={loading} autoFocus />
                </Field>
              )}

              {/* الموافقة ضمنية عند الضغط — بدل Checkbox إجباري كان بيوقف ناس كتير */}
              <p className="su-span text-center text-[11px] leading-relaxed text-muted-foreground">
                بالضغط على «إنشاء الحساب» أنت توافق على{' '}
                <Link href="/terms-and-conditions" className="font-semibold text-[#00946a] hover:underline">الشروط</Link>
                {' '}و{' '}
                <Link href="/privacy-policy" className="font-semibold text-[#00946a] hover:underline">الخصوصية</Link>
                {' '}— تجربة 14 يوم مجانية بدون بطاقة.
              </p>

              {/* ديسكتوب: زر الإنشاء داخل الفورم (على الموبايل بيتعرض ثابت من البوابة تحت) */}
              <div className="su-cta su-span max-lg:hidden">
              <Button type="submit" variant="gradient" size="lg"
                className="w-full gap-2 !bg-none !bg-[#00c98b] hover:!bg-[#00b87e] !text-[#04261b] shadow-lg shadow-[#00c98b]/30 h-11 lg:h-10 text-sm font-bold"
                disabled={loading}>
                {loading
                  ? <><Loader2 className="size-4 animate-spin" />جاري الإنشاء...</>
                  : <><ShieldCheck className="size-4" />إنشاء الحساب وبدء التجربة<ArrowRight className="size-4 rtl:rotate-180" /></>
                }
              </Button>
              </div>
            </form>
            {/* موبايل: زر الإنشاء ثابت أسفل الشاشة دايماً (fixed في body — مش بينزل مع الصفحة) */}
            {mounted && createPortal(
              <div
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 pt-2.5 shadow-[0_-10px_28px_-12px_rgba(0,60,40,0.25)] backdrop-blur lg:hidden"
                style={{ paddingBottom: 'calc(0.6rem + env(safe-area-inset-bottom, 0px))' }}
              >
                <Button type="submit" form="su-form" variant="gradient" size="lg"
                  className="w-full gap-2 !bg-none !bg-[#00c98b] hover:!bg-[#00b87e] !text-[#04261b] shadow-lg shadow-[#00c98b]/30 h-11 text-sm font-bold"
                  disabled={loading}>
                  {loading
                    ? <><Loader2 className="size-4 animate-spin" />جاري الإنشاء...</>
                    : <><ShieldCheck className="size-4" />إنشاء الحساب وبدء التجربة<ArrowRight className="size-4 rtl:rotate-180" /></>
                  }
                </Button>
              </div>,
              document.body,
            )}
            </motion.div>
            )}

            <p className="su-copy max-sm:hidden text-center text-[10px] text-muted-foreground/50">© 2026 نظام المحل</p>

            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── Visual side ─── */}
      <LoginShowcase
        title={["ابدأ بأول فاتورة", "النهارده."]}
        sub="إعداد في أقل من دقيقتين، و14 يوم تجربة بكل المزايا، وبياناتك محفوظة وآمنة."
      />
    </main>
  )
}

export default function SignupPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f7fbf9]">
          <Loader2 className="size-8 animate-spin text-[#00c98b]" />
        </div>
      }
    >
      <SignupContent />
    </React.Suspense>
  )
}