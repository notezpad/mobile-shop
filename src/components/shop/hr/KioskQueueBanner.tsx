'use client'

import * as React from 'react'
import { CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  KIOSK_QUEUE_EVENT, clearRejected, flushQueue, getQueue, getRejected,
  type QueuedPunch, type RejectedPunch,
} from '@/lib/hr-kiosk-queue'

/** حالة الطابور + مزامنة تلقائية (عند الفتح، لما النت يرجع، وكل 30 ثانية لو فيه معلّق) */
export function useKioskQueue() {
  const [queue, setQueue] = React.useState<QueuedPunch[]>([])
  const [rejected, setRejected] = React.useState<RejectedPunch[]>([])
  const [syncing, setSyncing] = React.useState(false)

  const refresh = React.useCallback(() => { setQueue(getQueue()); setRejected(getRejected()) }, [])
  const sync = React.useCallback(async (manual = false) => {
    if (getQueue().length === 0) return
    setSyncing(true)
    try {
      const r = await flushQueue()
      if (manual) {
        if (r.left > 0 && r.sent === 0 && r.rejected === 0) toast.error('لسه مفيش اتصال — هيتبعتوا أول ما النت يرجع')
        else toast.success(r.sent ? `تمت مزامنة ${r.sent} تسجيل` : 'تمت المزامنة')
      }
    } finally { setSyncing(false); refresh() }
  }, [refresh])

  React.useEffect(() => {
    refresh()
    sync()
    const onChange = () => refresh()
    const onOnline = () => { sync() }
    window.addEventListener(KIOSK_QUEUE_EVENT, onChange)
    window.addEventListener('online', onOnline)
    const t = setInterval(() => { if (getQueue().length > 0) sync() }, 30_000)
    return () => {
      window.removeEventListener(KIOSK_QUEUE_EVENT, onChange)
      window.removeEventListener('online', onOnline)
      clearInterval(t)
    }
  }, [refresh, sync])

  return { queue, rejected, syncing, sync }
}

/** يشتغل في كل صفحات الموارد البشرية عشان الطابور يتبعت حتى لو الكشك مقفول */
export function KioskAutoFlush() {
  useKioskQueue()
  return null
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })

export function KioskQueueBanner() {
  const { queue, rejected, syncing, sync } = useKioskQueue()
  if (queue.length === 0 && rejected.length === 0) return null
  return (
    <div className="mb-4 space-y-2">
      {queue.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <CloudOff className="size-4 shrink-0" />
            {queue.length} تسجيل حضور/انصراف مستني المزامنة ({[...new Set(queue.map((q) => q.name))].slice(0, 3).join('، ')})
          </div>
          <Button size="sm" variant="outline" onClick={() => sync(true)} disabled={syncing} className="gap-1.5">
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}زامن دلوقتي
          </Button>
        </div>
      )}
      {rejected.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="mb-1 text-sm font-extrabold">تسجيلات اترفضت — سجّلها يدوي من الحضور:</p>
          <ul className="space-y-0.5 text-sm">
            {rejected.map((r) => <li key={r.id}><b>{r.name}</b> ({timeOf(r.clientTime)}) — {r.reason}</li>)}
          </ul>
          <Button size="sm" variant="outline" className="mt-2" onClick={clearRejected}>تمام، تم</Button>
        </div>
      )}
    </div>
  )
}
