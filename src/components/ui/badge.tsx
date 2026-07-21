import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/* Badge variants 2026:
 * - default:    solid primary (for new/active items)
 * - secondary:  neutral (for counts, defaults)
 * - subtle:     tonal primary-subtle (for low-emphasis status)
 * - outline:    bordered (for tags, categories, payment methods)
 * - success:    green tonal (for completed, paid, available)
 * - warning:    amber tonal (for pending, low stock, due soon)
 * - danger:     red tonal (for cancelled, out-of-stock, overdue)
 * - destructive: ALIAS for danger (backward-compat with existing code that uses `variant="destructive"`)
 * - info:       blue tonal (for received, in-progress, informational)
 * - gradient:   emerald→amber gradient (for premium, featured, pro)
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        subtle:
          "border-transparent bg-primary-subtle text-primary-subtle-foreground",
        outline:
          "text-foreground border-border bg-card [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success:
          "border-transparent bg-success-subtle text-success-subtle-foreground",
        warning:
          "border-transparent bg-warning-subtle text-warning-subtle-foreground",
        danger:
          "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
        destructive:
          "border-transparent bg-destructive-subtle text-destructive-subtle-foreground",
        info:
          "border-transparent bg-info-subtle text-info-subtle-foreground",
        gradient:
          "border-transparent bg-gradient-to-r from-brand-600 to-accent2-500 text-white",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

/* StatusDot — small colored circle with optional pulse animation.
 * Used in tables and lists to indicate row status at a glance
 * without consuming horizontal space. */
function StatusDot({
  status,
  pulse = false,
  className,
}: {
  status: "success" | "warning" | "danger" | "info" | "primary" | "neutral"
  pulse?: boolean
  className?: string
}) {
  const colors = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    info: "bg-info",
    primary: "bg-primary",
    neutral: "bg-muted-foreground",
  }
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            colors[status]
          )}
        />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", colors[status])} />
    </span>
  )
}

export { Badge, StatusDot, badgeVariants }
