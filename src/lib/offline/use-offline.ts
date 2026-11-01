/**
 * React hooks for offline state management.
 */

import { useEffect, useState } from 'react'
import { subscribeSync, getSyncState, syncNow, type SyncState } from './sync'
import { idb, onOutboxChange, type OutboxEntry, type RejectedOp } from './idb'
import { startSyncEngine } from './sync'

export function useSyncState(): SyncState {
  const [s, setS] = useState<SyncState>(getSyncState())

  useEffect(() => {
    const un1 = subscribeSync(setS)
    const un2 = onOutboxChange((pending) => setS((prev) => ({ ...prev, pending })))
    const onOn = () => setS((prev) => ({ ...prev, online: true }))
    const onOff = () => setS((prev) => ({ ...prev, online: false }))
    window.addEventListener('online', onOn)
    window.addEventListener('offline', onOff)
    setS((prev) => ({ ...prev, online: navigator.onLine !== false }))
    return () => {
      un1()
      un2()
      window.removeEventListener('online', onOn)
      window.removeEventListener('offline', onOff)
    }
  }, [])

  return s
}

export function usePendingOperations() {
  const [entries, setEntries] = useState<OutboxEntry[]>([])
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const load = async () => {
      const all = await idb.getOutbox()
      setEntries(all)
      setPending(all.length)
    }
    load()
    const un = onOutboxChange((count) => {
      setPending(count)
      load()
    })
    // 🛡️ FIX (tsc): الـ effect لازم يرجّع void أو destructor — onOutboxChange
    // بيرجّع boolean (هل الاشتراك اتعمل) فبنغلّفه.
    return () => {
      un()
    }
  }, [])

  return { entries, pending }
}

export function useOfflineReady() {
  useEffect(() => {
    const stop = startSyncEngine()
    return stop
  }, [])
}

/**
 * 🛡️ مت-17 (2026-11-02): قائمة «العمليات الفاشلة» — قيود أوفلاين اترفضت
 * نهائيًا من السيرفر (4xx × 5 أو حساب مختلف) بدل ما كانت تترمي بصمت.
 */
export function useRejectedOperations() {
  const [ops, setOps] = useState<RejectedOp[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const list = await idb.getRejectedOps().catch(() => [])
      if (alive) setOps(list)
    }
    load()
    window.addEventListener('rejected-ops-changed', load)
    return () => {
      alive = false
      window.removeEventListener('rejected-ops-changed', load)
    }
  }, [])

  return ops
}

/** إعادة إرسال عملية فاشلة — بترجع للطابور من الأول (بنفس مفتاح منع التكرار) */
export async function retryRejectedOp(op: RejectedOp): Promise<void> {
  await idb.addToOutbox({
    url: op.url,
    method: op.method,
    body: op.body,
    label: op.label,
    idempotencyKey: op.idempotencyKey,
  })
  await idb.removeRejectedOp(op.id)
}

/** حذف عملية فاشلة نهائيًا من الجهاز */
export async function discardRejectedOp(id: string): Promise<void> {
  await idb.removeRejectedOp(id)
}

export { syncNow, getSyncState } from './sync'
export type { OutboxEntry } from './idb'
