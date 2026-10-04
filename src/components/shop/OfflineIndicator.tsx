'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wifi, WifiOff, RefreshCw, CloudUpload, CheckCircle2, AlertCircle } from 'lucide-react'
import { useSyncState, usePendingOperations, syncNow } from '@/lib/offline/use-offline'

/**
 * OfflineIndicator — shows a banner at the top when:
 * 1. User is offline (orange "أنت غير متصل")
 * 2. There are pending operations (blue "X عملية بانتظار المزامنة")
 * 3. Sync is in progress (spinner "جارٍ المزامنة...")
 * 4. Sync completed with errors (red "فشلت X عمليات")
 *
 * Also shows a "Sync now" button when online with pending operations.
 */
export function OfflineIndicator() {
  const sync = useSyncState()
  const { entries } = usePendingOperations()
  const [syncResult, setSyncResult] = React.useState<{ done: number; failed: number } | null>(null)

  // Don't show anything if everything is fine
  if (sync.online && !sync.syncing && sync.pending === 0 && !syncResult) {
    return null
  }

  const handleSyncNow = async () => {
    setSyncResult(null)
    const result = await syncNow()
    setSyncResult(result)
    setTimeout(() => setSyncResult(null), 5000)
  }

  // Offline → orange banner
  if (!sync.online) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-[60] shrink-0 flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-white"
      >
        <WifiOff className="size-4" />
        <span className="text-sm font-medium">
          أنت غير متصل — التغييرات تُحفظ محلياً وستُزامن عند عودة الاتصال
        </span>
        {sync.pending > 0 && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
            {sync.pending} بانتظار المزامنة
          </span>
        )}
      </motion.div>
    )
  }

  // Syncing → blue banner with spinner
  if (sync.syncing) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-[60] shrink-0 flex items-center justify-center gap-2 bg-blue-500 px-4 py-2 text-white"
      >
        <RefreshCw className="size-4 animate-spin" />
        <span className="text-sm font-medium">جارٍ مزامنة البيانات...</span>
      </motion.div>
    )
  }

  // Pending operations + online → show "Sync now" banner
  if (sync.pending > 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-[60] shrink-0 flex items-center justify-between gap-2 bg-blue-50 px-4 py-2 text-blue-900 border-b border-blue-200"
      >
        <div className="flex items-center gap-2">
          <CloudUpload className="size-4 text-blue-500" />
          <span className="text-sm font-medium">
            {sync.pending} عملية بانتظار المزامنة
            {sync.prewarmed > 0 && (
              <span className="mr-2 text-xs text-blue-600/70">
                · {sync.prewarmed} منتج محفوظ offline
              </span>
            )}
          </span>
          {entries.length > 0 && entries.length <= 3 && (
            <span className="text-xs text-blue-700/70">
              ({entries.map((e) => e.label).join('، ')})
            </span>
          )}
        </div>
        <button
          onClick={handleSyncNow}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-blue-700"
        >
          <RefreshCw className="size-3" />
          مزامنة الآن
        </button>
      </motion.div>
    )
  }

  // Sync result (temporary)
  if (syncResult) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`relative z-[60] shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
          syncResult.failed > 0
            ? 'bg-rose-50 text-rose-700'
            : 'bg-emerald-50 text-emerald-700'
        }`}
      >
        {syncResult.failed > 0 ? (
          <>
            <AlertCircle className="size-4" />
            تمت مزامنة {syncResult.done} عملية، فشلت {syncResult.failed}
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4" />
            تمت مزامنة {syncResult.done} عملية بنجاح
          </>
        )}
      </motion.div>
    )
  }

  return null
}
