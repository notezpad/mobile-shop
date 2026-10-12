'use client'

/**
 * product-dialog-ui — مكوّنات دايلوجات المنتجات.
 * هوية صفحة المنتجات: «بطاقة التعليق» (Hang-Tag) — حبر وورق من tokens النظام
 * (الأسود في الفاتح والأبيض في الداكن)، بثقب وخط تمزيق متقطع في الهيدر.
 * الألوان الوظيفية الوحيدة: كهرماني للتنبيه، أحمر للحذف. ما فيش أي منطق أعمال هنا.
 */

import * as React from 'react'
import { Lock, X } from 'lucide-react'
import {
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export const INK_RING = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-foreground/20'

/** رأس الدايلوج: ورقة حبر بثقب التعليق + خط تمزيق متقطع */
export function DialogHero({
  icon: Icon,
  title,
  chip,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  chip?: string
  subtitle?: string
}) {
  return (
    <DialogHeader className="relative shrink-0 gap-0 bg-foreground px-4 pb-5 pt-4 text-start text-background sm:px-6 sm:pt-5">
      <div className="flex items-center gap-3.5">
        {/* ثقب التعليق */}
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background/12 ring-1 ring-background/25">
          <Icon className="size-5" />
          <i aria-hidden className="absolute -top-1 start-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground ring-1 ring-background/50" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold leading-tight text-background">
            {title}
            {chip && (
              <span className="max-w-full truncate rounded-lg bg-background/15 px-2 py-0.5 text-xs font-bold ring-1 ring-background/25">
                {chip}
              </span>
            )}
          </DialogTitle>
          {subtitle ? (
            <DialogDescription className="mt-1 truncate text-xs font-medium leading-relaxed text-background/70">
              {subtitle}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        <DialogClose
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl bg-background/15 text-background transition-colors hover:bg-background/25',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/70'
          )}
        >
          <X className="size-4" />
          <span className="sr-only">إغلاق</span>
        </DialogClose>
      </div>
      {/* خط التمزيق */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--background)_70%,transparent)_0_8px,transparent_8px_14px)]"
      />
    </DialogHeader>
  )
}

/** عنوان قسم برقم */
export function SectionTitle({
  n,
  children,
  aside,
}: {
  n?: number
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-extrabold">
        {n !== undefined && (
          <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-extrabold text-background">
            {n}
          </span>
        )}
        {children}
      </h3>
      {aside}
    </div>
  )
}

/** حقل: عنوان + محتوى + تلميح */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-bold text-foreground/80">
        {label}
        {required && <span className="ms-1 text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] font-medium leading-relaxed text-foreground/60">{hint}</p>}
    </div>
  )
}

export const INK_INPUT =
  'h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-foreground focus:ring-[3px] focus:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-60'

type InkInputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  /** أرقام: اتجاه LTR وخط tabular */
  num?: boolean
  suffix?: string
  size?: 'md' | 'sm'
  wrapperClassName?: string
}

/** حقل إدخال بتركيز حبري (مع لاحقة اختيارية زي «جنيه») */
export function InkInput({ num, suffix, size = 'md', className, wrapperClassName, ...props }: InkInputProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <input
        dir={num ? 'ltr' : undefined}
        inputMode={num ? 'decimal' : undefined}
        {...props}
        className={cn(
          INK_INPUT,
          size === 'sm' && 'h-9 rounded-lg px-2.5 text-sm',
          num && 'text-left font-bold tabular-nums',
          // الأرقام (dir=ltr): الرقم أقصى الشمال و«جنيه» أقصى اليمين — بمسافات فيزيائية
          // (pr/right) لأن الحقل LTR فالـ pe/end كانوا بيرموا اللاحقة على نفس جهة الرقم.
          suffix && (num ? 'pr-14' : 'pe-14'),
          className
        )}
      />
      {suffix && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-semibold text-foreground/55',
            num ? 'right-3' : 'end-3'
          )}
        >
          {suffix}
        </span>
      )}
    </div>
  )
}

/** ملاحظة «الميزة دي مش في باقتك» */
export function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-foreground/25 bg-card p-4 text-sm font-medium leading-relaxed text-foreground/80">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Lock className="size-4" aria-hidden />
      </span>
      <p className="pt-1.5">{children}</p>
    </div>
  )
}

/** قرص صغير قابل للضغط (اختصارات) */
export function QuickChip({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        INK_RING,
        active ? 'border-foreground bg-foreground text-background' : 'bg-background text-foreground/80 hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

/** زر أيقونة صغير (حذف/تفعيل/توليد) */
export function IconBtn({
  children,
  onClick,
  label,
  danger,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-xl text-foreground/65 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-[3px]',
        danger ? 'focus-visible:ring-destructive/30' : 'focus-visible:ring-foreground/20'
      )}
    >
      {children}
    </button>
  )
}
