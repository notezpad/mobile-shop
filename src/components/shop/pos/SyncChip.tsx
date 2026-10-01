'use client'

import { CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { syncNow, useSyncState } from '@/lib/offline/use-offline'

/** Shows only when it matters: offline, syncing, or operations still waiting in the outbox. */
export function SyncChip() {
  const s = useSyncState()
  if (s.online && !s.syncing && s.pending === 0) return null

  const label = !s.online
    ? `بدون اتصال${s.pending ? ` · ${s.pending} معلّقة` : ''}`
    : s.syncing
      ? 'جاري المزامنة…'
      : `${s.pending} عملية بانتظار المزامنة`

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!s.online || s.syncing}
      onClick={() => void syncNow()}
      title={s.lastError ?? undefined}
      className={`h-8 gap-1.5 rounded-full px-3 text-xs ${!s.online ? 'border-warning-subtle bg-warning-subtle text-warning-subtle-foreground' : ''}`}
    >
      {!s.online ? <CloudOff className="size-3.5" /> : s.syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {label}
    </Button>
  )
}
