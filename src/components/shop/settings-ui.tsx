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
  'h-10 rounded-xl bg-background/60 hover:border-foreground/30 focus-visible:border-foreground focus-visible:ring-foreground/10'

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
        'animate-in-up motion-reduce:animate-none relative rounded-2xl border bg-card text-card-foreground',
        'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.7),0_1px_2px_rgb(15_23_42/0.05)]',
        'dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05),0_1px_2px_rgb(0_0_0/0.4)]',
        className
      )}
    >
      {/* علامات القص — توقيع الهوية */}
      <i aria-hidden className="pointer-events-none absolute -top-px -start-px size-3 rounded-ss-2xl border-s-2 border-t-2 border-foreground/60" />
      <i aria-hidden className="pointer-events-none absolute -bottom-px -end-px size-3 rounded-ee-2xl border-b-2 border-e-2 border-foreground/60" />

      <header className="flex items-start gap-3 border-b border-dashed px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p dir="ltr" className="text-start text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-muted-foreground/80">
            {tag}
          </p>
          <h2 className="mt-1 text-[15px] font-extrabold leading-tight">{title}</h2>
          {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>

      <div className={cn('p-5', bodyClassName)}>{children}</div>
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

/** مفتاح تشغيل/إيقاف — حبري، ومتوافق مع RTL */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-base outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-45',
        checked ? 'border-foreground bg-foreground' : 'border-border bg-muted'
      )}
    >
      <span
        className={cn(
          'absolute start-0.5 top-0.5 size-[18px] rounded-full shadow-sm transition-transform duration-base ease-out',
          checked
            ? 'translate-x-5 bg-background rtl:-translate-x-5'
            : 'translate-x-0 bg-muted-foreground/60'
        )}
      />
    </button>
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
}: {
  title: string
  desc?: string
  on?: boolean
  badge?: string
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-background/50 px-4 py-3 transition-colors',
        on && 'border-foreground/25 bg-foreground/[0.03]',
        muted && 'opacity-60'
      )}
    >
      <Led tone={on ? 'on' : 'idle'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold leading-tight">
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
