'use client'

/**
 * settings-ui — هوية صفحة الإعدادات: «غرفة التحكم».
 *
 * كل صفحة في النظام ليها لون ووظيفة (عملاء=سماوي، موردين=برتقالي، فروع=ليموني…).
 * الإعدادات هي «غرفة الماكينات» اللي بتحكم في كل ده، فهويتها حبر/جرافيت محايد
 * (الأسود في الفاتح والأبيض في الداكن) ومفيهاش لون خاص بيها — الألوان الوحيدة
 * هنا هي «LED» الحالة (أخضر شغّال / كهرماني تحذير / أحمر متوقف).
 * التوقيع البصري: علامات القص (crop marks) في ركنين + عناوين صغيرة بالإنجليزي.
 */

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** حقول الإدخال — نفس Input/Select بس بتركيز حبري بدل اللون الأساسي للتطبيق */
export const INK_FIELD =
  'h-10 rounded-xl border-foreground/15 bg-muted/50 hover:border-foreground/35 focus-visible:border-foreground focus-visible:bg-background focus-visible:ring-foreground/10'

/** زر أساسي بلون الحبر */
export const INK_BTN =
  'border-0 bg-foreground text-background shadow-sm hover:bg-foreground/90 focus-visible:ring-foreground/25'

/** زر ثانوي بحدود رفيعة */
export const INK_BTN_OUTLINE =
  'border-border bg-transparent text-foreground hover:border-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground'

export function Panel({
  tag,
  title,
  hint,
  icon: Icon,
  aside,
  children,
  className,
  bodyClassName,
}: {
  tag: string
  title: string
  hint?: string
  icon: LucideIcon
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        'animate-in-up motion-reduce:animate-none relative flex flex-col rounded-2xl border border-foreground/15 bg-card text-card-foreground',
        'shadow-[0_1px_2px_rgb(15_23_42/0.06),0_8px_24px_-12px_rgb(15_23_42/0.14)]',
        'dark:border-white/10 dark:shadow-[0_1px_2px_rgb(0_0_0/0.5)]',
        className
      )}
    >
      {/* علامات القص — توقيع الهوية (برّه الكارت بـ 5px عشان تبان زي علامات الطباعة) */}
      <i aria-hidden className="pointer-events-none absolute -start-[5px] -top-[5px] size-3 border-s-2 border-t-2 border-foreground/70" />
      <i aria-hidden className="pointer-events-none absolute -bottom-[5px] -end-[5px] size-3 border-b-2 border-e-2 border-foreground/70" />

      <header className="flex items-start gap-3 rounded-t-2xl border-b border-dashed border-foreground/20 bg-muted/60 px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* dir=ltr عشان الإنجليزي يتكتب صح، و text-right (فيزيائي) عشان يقف فوق العنوان العربي مش في الجهة التانية */}
          <p dir="ltr" className="text-right text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-muted-foreground">
            {tag}
          </p>
          <h2 className="mt-1.5 text-base font-extrabold leading-tight">{title}</h2>
          {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        {aside && <div className="shrink-0 whitespace-nowrap">{aside}</div>}
      </header>

      <div className={cn('flex-1 rounded-b-2xl p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** مؤشر LED صغير — اللون الوحيد المسموح بيه في هوية الإعدادات */
export function Led({
  tone,
  pulse,
  className,
}: {
  tone: 'on' | 'warn' | 'off' | 'idle'
  pulse?: boolean
  className?: string
}) {
  const color =
    tone === 'on'
      ? 'bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.18)]'
      : tone === 'warn'
        ? 'bg-amber-500 shadow-[0_0_0_3px_rgb(245_158_11/0.2)]'
        : tone === 'off'
          ? 'bg-rose-500 shadow-[0_0_0_3px_rgb(244_63_94/0.18)]'
          : 'bg-muted-foreground/40'
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', color, pulse && 'animate-pulse motion-reduce:animate-none', className)}
    />
  )
}

/** مفتاح تشغيل/إيقاف — أخضر لما يكون شغّال + كلمة الحالة جنبه، فمفيش لبس */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  stateLabel,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
  /** نص بديل لكلمة الحالة (مثلاً «قريباً» للميزات غير المتاحة) */
  stateLabel?: string
}) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          'w-11 text-end text-[11px] font-bold transition-colors',
          checked ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
        )}
      >
        {stateLabel ?? (checked ? 'مفعّل' : 'متوقف')}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-base outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-45',
          checked ? 'border-emerald-600 bg-emerald-500' : 'border-foreground/40 bg-foreground/15'
        )}
      >
        <span
          className={cn(
            'absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform duration-base ease-out',
            checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </span>
  )
}

/** صف إعداد: LED + عنوان + وصف + أي عنصر تحكم على الطرف */
export function SettingRow({
  title,
  desc,
  on,
  badge,
  children,
  muted,
  className,
}: {
  title: string
  desc?: string
  on?: boolean
  badge?: string
  children: React.ReactNode
  muted?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-foreground/15 bg-muted/40 px-4 py-3.5 transition-colors',
        on && 'border-emerald-500/40 bg-emerald-500/[0.07]',
        muted && 'opacity-60',
        className
      )}
    >
      <Led tone={on ? 'on' : 'idle'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold leading-tight">
          {title}
          {badge && (
            <span className="rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {badge}
            </span>
          )}
        </p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

/** حقل بعنوان صغير فوقه */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block text-[11px] font-bold tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] leading-relaxed text-muted-foreground/90">{hint}</span>}
    </label>
  )
}
