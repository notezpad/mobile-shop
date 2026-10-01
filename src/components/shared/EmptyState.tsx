import * as React from 'react'
import { cn } from '@/lib/utils'

interface Props {
  icon?: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}

/** Shared empty state: icon + one line + optional hint/CTA. Used across dashboard pages. */
export function EmptyState({ icon, title, hint, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-10 text-center', className)}>
      {icon && <div className="text-muted-foreground/60 [&_svg]:size-9">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
