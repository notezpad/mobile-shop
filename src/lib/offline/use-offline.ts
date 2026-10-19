/**
 * React hooks for offline state management.
 */

import { useEffect, useState } from 'react'
import { subscribeSync, getSyncState, syncNow, type SyncState } from './sync'
import { idb, onOutboxChange, type OutboxEntry } from './idb'
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

export { syncNow, getSyncState } from './sync'
export type { OutboxEntry } from './idb'
