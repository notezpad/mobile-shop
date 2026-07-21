'use client'

import { Clock } from 'lucide-react'
import { formatArabicDate, formatArabicDateTime } from '@/lib/format'

/**
 * Displays a date/time as a single-line Arabic badge, e.g.
 * "18 يوليو 2026 - 4:19 م". Replaces the old two-line numeric layout so
 * every date in the app reads consistently and doesn't rely on splitting
 * lines / dir="ltr" tricks to avoid bidi reordering — the Arabic month name
 * plus a fixed "day month year - h:mm period" order reads correctly in RTL
 * without any special isolation.
 */
export function DateTimeCell({
  date,
  showTime = true,
  className = '',
}: {
  date: string | Date | null | undefined
  showTime?: boolean
  className?: string
}) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>

  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return <span className="text-muted-foreground text-xs">—</span>

  const label = showTime ? formatArabicDateTime(d) : formatArabicDate(d)

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-success-subtle bg-success-subtle px-2.5 py-1 text-xs font-medium text-success dark:border-success-subtle/40 dark:bg-success-subtle/20 dark:text-success-subtle-foreground ${className}`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0 text-success dark:text-success-subtle-foreground" />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
