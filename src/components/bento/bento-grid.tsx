"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* BentoGrid — Apple/Vercel 2026 style asymmetric grid.
 *
 * Used by: DashboardView, AdminDashboard, ReportsView — anywhere
 * we want a non-uniform, content-aware grid instead of equal columns.
 *
 * The `cols` prop sets the max grid columns; cells can span fewer
 * via <BentoCell colSpan={...}>.
 */
export function BentoGrid({
  children,
  className,
  cols = 4,
}: {
  children: React.ReactNode
  className?: string
  cols?: 2 | 3 | 4 | 5
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5 sm:gap-4",
        cols === 2 && "grid-cols-1 md:grid-cols-2",
        cols === 3 && "grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-2 lg:grid-cols-4",
        cols === 5 && "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  )
}

/* BentoCell — spans columns/rows in the bento grid.
 *
 * Pattern: a 2-col chart next to a 1-col donut that spans 2 rows,
 * with 1-col KPI cells below. This pattern is used in the main
 * dashboard layout.
 */
export function BentoCell({
  children,
  className,
  colSpan = 1,
  rowSpan = 1,
}: {
  children: React.ReactNode
  className?: string
  colSpan?: 1 | 2 | 3 | 4
  rowSpan?: 1 | 2
}) {
  return (
    <div
      className={cn(
        "col-span-1 min-w-0",
        colSpan === 2 && "col-span-2",
        colSpan === 3 && "lg:col-span-3",
        colSpan === 4 && "lg:col-span-4",
        rowSpan === 2 && "lg:row-span-2",
        className
      )}
    >
      {children}
    </div>
  )
}
