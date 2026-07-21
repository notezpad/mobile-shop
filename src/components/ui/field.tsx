import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/* Field 2026:
 * - Wraps a form control with a Label above and optional hint/error text below
 * - `required` renders a small asterisk next to the label
 * - `hint` renders muted helper text; `error` (if present) overrides it with destructive text
 */
function Field({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
        {hint && !error && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { Field }
