'use client'

/**
 * expense-dialog-ui — رأس وأزرار دايلوجات المصروفات.
 * هوية صفحة المصروفات: وردي غامق (rose-950) + شريط كهرماني مائل. واجهة فقط.
 */

import * as React from 'react'
import { X } from 'lucide-react'
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const ROSE_BTN =
  'border-0 bg-rose-950 text-rose-50 shadow-sm hover:bg-rose-900 focus-visible:ring-rose-500/30 dark:bg-rose-700 dark:hover:bg-rose-600'

export function ExpenseHero({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
}) {
  return (
    <DialogHeader className="relative shrink-0 gap-0 bg-rose-950 px-4 pb-5 pt-4 text-start text-rose-50 sm:px-6 sm:pt-5">
      <div className="flex items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-800/70 ring-1 ring-rose-700/60">
          <Icon className="size-5 text-rose-100" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-lg font-extrabold leading-tight text-rose-50">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="mt-1 text-xs font-medium leading-relaxed text-rose-200/80">
              {subtitle}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>
        <DialogClose className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-900/70 text-rose-100 transition-colors hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
          <X className="size-4" />
          <span className="sr-only">إغلاق</span>
        </DialogClose>
      </div>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(-45deg,rgba(251,191,36,.75)_0_6px,transparent_6px_12px)]"
      />
    </DialogHeader>
  )
}
