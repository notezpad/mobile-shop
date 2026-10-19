"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ChartDatum {
  label: string
  value: number
  color?: string
}

/* DonutChart — pure SVG donut with optional center label.
 *
 * Used by: DashboardView (payment methods breakdown),
 * ReportsView (sales by category), AdminDashboard (plan distribution).
 *
 * Center label/value appears inside the donut hole — useful for
 * showing the total ("127 معاملة") next to the proportional breakdown.
 */
export function DonutChart({
  data,
  size = 160,
  thickness = 18,
  className,
  centerLabel,
  centerValue,
}: {
  data: ChartDatum[]
  size?: number
  thickness?: number
  className?: string
  centerLabel?: string
  centerValue?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  // 🛡️ 2026-10-19: الإزاحات بتتحسب مرة واحدة بـ reduce بدل متغيّر بيتعدّل
  // جوه callback أثناء الرندر (قاعدة react-hooks/immutability) — نفس النتيجة بالظبط
  const offsets = data.reduce<number[]>((acc, d) => {
    acc.push((acc[acc.length - 1] ?? 0) + (d.value / total) * circumference)
    return acc
  }, [])

  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
  ]

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {/* Data segments */}
        {data.map((d, i) => {
          const len = (d.value / total) * circumference
          const start = offsets[i - 1] ?? 0
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color || colors[i % colors.length]}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-start}
              strokeLinecap="round"
              className="transition-all duration-slow ease-out"
            />
          )
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && (
            <span className="text-xl font-bold text-foreground tabular-nums">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
