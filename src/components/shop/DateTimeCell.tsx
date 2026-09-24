'use client'

import { Clock } from 'lucide-react'
import { formatArabicDate, formatArabicDateTime } from '@/lib/format'

/**
 * Displays a date/time as a single-line Arabic badge, e.g.
 * "18 يوليو 2026 - 4:19 م".
 *
 * The label text is wrapped in dir="ltr" (see below) because a plain
 * Arabic-month string like this still mixes multiple separate numeric
 * runs (day, year, hour:minute) with Arabic words and neutral characters
 * (-, :) — inside an RTL page the browser's bidi algorithm can reorder
 * those runs relative to each other, which is exactly the jumbled-date
 * bug this component exists to avoid.
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
      {/* dir="ltr" pins the day/month/year/time sequence to source order —
          without it, the browser's bidi algorithm can reorder the separate
          numeric runs (day, year, hour:minute) relative to each other and
          even flip "6:37" into "37:6" inside this RTL page. The Arabic
          month name and ص/م marker still render with correct script
          shaping; only the run ORDER is pinned. */}
      <span dir="ltr" style={{ unicodeBidi: "isolate" }} className="tabular-nums">{label}</span>
    </span>
  )
}
