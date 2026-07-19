'use client'

/**
 * Renders a date + time pair as two stacked lines instead of one inline
 * string. A single "2026/07/18 22:18" string inside an RTL table cell gets
 * visually reordered by the browser's bidi algorithm (the two number groups
 * can swap places depending on context), which is what reads as "متداخل" /
 * jumbled to the user. Isolating the block with dir="ltr" and splitting date
 * from time onto their own lines fixes the ordering and gives a clear,
 * low-distraction visual hierarchy: the date is the primary fact (regular
 * weight), the time is secondary (smaller, muted).
 */
export function DateTimeCell({
  date,
}: {
  date: string | Date | null | undefined
}) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>

  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return <span className="text-muted-foreground text-xs">—</span>

  const pad = (x: number) => String(x).padStart(2, '0')
  const dateStr = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  return (
    <div dir="ltr" className="text-right leading-tight">
      <div className="text-xs font-medium tabular-nums text-foreground">
        {dateStr}
      </div>
      <div className="text-[11px] tabular-nums text-muted-foreground">
        {timeStr}
      </div>
    </div>
  )
}
