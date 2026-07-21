'use client'

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ConfirmOptions {
  /** Short question shown as the dialog title, e.g. "حذف الفرع "سوهاج"؟" */
  title: string
  /** Optional extra explanation line, e.g. "سيتم فك ارتباط منتجاته وموظفيه به." */
  description?: string
  confirmText?: string
  cancelText?: string
  /** Renders the confirm button in red and shows a warning icon — the default,
   *  since every current caller is a destructive delete/cancel action. */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

/** Drop-in replacement for window.confirm(): `const ok = await confirm('حذف العميل؟')`.
 *  Renders a branded AlertDialog instead of the browser's native popup, so every
 *  confirmation in the app looks and behaves consistently. */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used within <ConfirmDialogProvider>')
  }
  return ctx
}

interface PendingState {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingState | null>(null)

  const confirm = React.useCallback<ConfirmFn>((options) => {
    const normalized: ConfirmOptions =
      typeof options === 'string' ? { title: options } : options
    return new Promise<boolean>((resolve) => {
      setPending({ options: normalized, resolve })
    })
  }, [])

  const handleOpenChange = (open: boolean) => {
    if (!open && pending) {
      pending.resolve(false)
      setPending(null)
    }
  }

  const handleConfirm = () => {
    if (pending) {
      pending.resolve(true)
      setPending(null)
    }
  }

  const handleCancel = () => {
    if (pending) {
      pending.resolve(false)
      setPending(null)
    }
  }

  const destructive = pending?.options.destructive ?? true

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!pending} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  destructive
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/10 text-primary'
                )}
              >
                <AlertTriangle className="size-4.5" />
              </span>
              <div className="flex-1 space-y-1.5">
                <AlertDialogTitle>{pending?.options.title}</AlertDialogTitle>
                {pending?.options.description && (
                  <AlertDialogDescription>
                    {pending.options.description}
                  </AlertDialogDescription>
                )}
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {pending?.options.cancelText ?? 'إلغاء'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                destructive &&
                  buttonVariants({ variant: 'destructive' })
              )}
            >
              {pending?.options.confirmText ?? (destructive ? 'حذف' : 'تأكيد')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
