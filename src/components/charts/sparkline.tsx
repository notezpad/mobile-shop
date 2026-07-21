"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Sparkline — pure SVG mini line chart, no dependencies.
 *
 * Used by: KpiCard (in the delta row), table cells (for 7-day trends),
 * ReportsView (per-product micro-charts).
 *
 * Why not Recharts? Recharts adds ~40kb to the dashboard bundle and
 * renders sparklines with axes/legends by default. For a 80x32px mini
 * chart, pure SVG is lighter and visually cleaner.
 */
export function Sparkline({
  data,
  color = "var(--primary)",
  height = 32,
  width = 80,
  strokeWidth = 2,
  className,
}: {
  data: number[]
  color?: string
  height?: number
  width?: number
  strokeWidth?: number
  className?: string
}) {
  if (!data.length) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1 || 1)

  const points = data.map((d, i) => {
    const x = i * stepX
    const y = height - ((d - min) / range) * (height - strokeWidth * 2) - strokeWidth
    return [x, y]
  })

  const path = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ")

  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`

  const gradientId = React.useId()

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
