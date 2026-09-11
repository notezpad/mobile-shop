"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const progressSizeClasses = {
  default: "h-2",
  lg: "h-3",
} as const

type ProgressSize = keyof typeof progressSizeClasses

function Progress({
  className,
  value,
  indicatorClassName,
  size = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Extra classes applied to the inner indicator bar (e.g. a status color). */
  indicatorClassName?: string
  /** Preset track height. Default matches the previous hardcoded h-2. */
  size?: ProgressSize
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative w-full overflow-hidden rounded-full",
        progressSizeClasses[size],
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("bg-primary h-full w-full flex-1 transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
