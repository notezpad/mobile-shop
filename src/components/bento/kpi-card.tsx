"use client"

import * as React from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/* KpiCard — Bento-style metric card for dashboards.
 *
 * Replaces the old DashboardView StatCard. Differences:
 * - Adds optional `delta` (trend indicator with up/down arrow + percentage)
 * - Adds optional `sparkline` (mini line chart for trend-at-a-glance)
 * - Adds decorative gradient blob that fades in on hover (premium feel)
 * - 5 semantic `variant`s map to icon background tonal color
 * - Uses `tabular-nums` so values don't jitter when they update
 *
 * Use cases:
 * - Today's sales / profit (variant="primary")
 * - Low stock count (variant="warning")
 * - Active maintenance (variant="info")
 * - Outstanding debt (variant="danger")
 * - Cash balance (variant="default")
 */
export interface KpiCardProps {
  title: string
  value: string
  delta?: {
    value: string
    direction: "up" | "down"
    label?: string
  }
  icon?: React.ReactNode
  sparkline?: React.ReactNode
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info"
  className?: string
}

const variantStyles = {
  default: {
    iconWrap: "bg-muted text-muted-foreground",
  },
  primary: {
    iconWrap: "bg-primary-subtle text-primary-subtle-foreground",
  },
  success: {
    iconWrap: "bg-success-subtle text-success-subtle-foreground",
  },
  warning: {
    iconWrap: "bg-warning-subtle text-warning-subtle-foreground",
  },
  danger: {
    iconWrap: "bg-destructive-subtle text-destructive-subtle-foreground",
  },
  info: {
    iconWrap: "bg-info-subtle text-info-subtle-foreground",
  },
}

export function KpiCard({
  title,
  value,
  delta,
  icon,
  sparkline,
  variant = "default",
  className,
}: KpiCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card variant="bento" className={cn("relative h-full overflow-hidden p-3 sm:p-5", className)}>
      {/* Decorative gradient blob — fades in on hover for premium feel.
          Positioned top-right (RTL: top-left visually) so it doesn't
          interfere with text readability. */}
      <div className="pointer-events-none absolute -top-12 -left-12 size-32 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-slow" />

      <div className="relative flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate sm:text-xs">
            {title}
          </p>
          <p className="text-lg font-bold tracking-tight text-foreground tabular-nums truncate sm:text-2xl">
            {value}
          </p>
        </div>
        {icon && (
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-10 [&_svg]:size-4 sm:[&_svg]:size-5",
              styles.iconWrap
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {(delta || sparkline) && (
        <div className="relative mt-3 flex items-end justify-between gap-2">
          {delta && (
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold shrink-0",
                  delta.direction === "up"
                    ? "bg-success-subtle text-success-subtle-foreground"
                    : "bg-destructive-subtle text-destructive-subtle-foreground"
                )}
              >
                {delta.direction === "up" ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {delta.value}
              </span>
              {delta.label && (
                <span className="text-muted-foreground truncate">{delta.label}</span>
              )}
            </div>
          )}
          {sparkline && <div className="h-8 w-20 shrink-0">{sparkline}</div>}
        </div>
      )}
    </Card>
  )
}
