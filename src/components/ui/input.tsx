import * as React from "react"

import { cn } from "@/lib/utils"

/* Input 2026:
 * - Smooth border color transitions (border-input → border-input-hover → border-primary on focus)
 * - Ring on focus uses primary at 50% opacity for visible-but-soft halo
 * - Optional `icon` prop renders an icon on the right (RTL) for search/barcode fields
 * - Optional `error` prop toggles destructive styling for form validation
 */
function Input({
  className,
  type,
  icon,
  error,
  ...props
}: React.ComponentProps<"input"> & {
  icon?: React.ReactNode
  error?: boolean
}) {
  return (
    <div className="relative w-full">
      {icon && (
        <div className="absolute inset-y-0 right-3 flex items-center text-muted-foreground [&_svg]:size-4 pointer-events-none">
          {icon}
        </div>
      )}
      <input
        type={type}
        data-slot="input"
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground/70 selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-all duration-fast ease-out outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "hover:border-input-hover",
          "focus-visible:border-primary focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          icon && "pr-9",
          error && "border-destructive focus-visible:ring-destructive/30",
          className
        )}
        {...props}
      />
    </div>
  )
}

export { Input }
