import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-base ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover hover:shadow-md hover:shadow-primary/20",
        // Bento gradient — for primary CTAs, "new sale", "add product" buttons.
        // Uses emerald gradient with subtle warm shift at the end.
        gradient:
          "bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-sm hover:shadow-md hover:shadow-brand-500/30 hover:from-brand-500 hover:to-brand-400",
        // Warm gradient — for premium CTAs (subscriptions, upgrades).
        // Emerald → amber for B2B wholesale premium feel.
        "gradient-warm":
          "bg-gradient-to-br from-brand-600 via-brand-500 to-accent2-500 text-white shadow-sm hover:shadow-md hover:shadow-accent2-500/30",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-border bg-card shadow-xs hover:bg-muted hover:border-border-strong dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        "sidebar-handle": "sidebar-close-handle",
        // Subtle — for low-emphasis actions (filters, secondary toolbar buttons).
        // Uses primary-subtle for tonal weight without competing with primary.
        subtle:
          "bg-primary-subtle text-primary-subtle-foreground hover:bg-primary-subtle/80",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        xl: "h-12 rounded-lg px-8 text-base font-semibold has-[>svg]:px-6",
        icon: "size-9",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-12 rounded-lg",
        "sidebar-handle": "sidebar-close-handle-size",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
