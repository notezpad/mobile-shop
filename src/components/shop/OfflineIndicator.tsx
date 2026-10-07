'use client'

import * as React from 'react'
import { WifiOff, RefreshCw, CloudUpload, CheckCircle2, AlertCircle } from 'lucide-react'
import { useSyncState, usePendingOperations, syncNow } from '@/lib/offline/use-offline'

/**
 * OfflineIndicator — shows a banner at the top when:
 * 1. User is offline (orange "أنت غير متصل")
 * 2. There are pending operations (blue "X عملية بانتظار المزامنة")
 * 3. Sync is in progress (spinner "جارٍ المزامنة...")
 * 4. Sync completed with errors (red "فشلت X عمليات")
 *
 * Also shows a "Sync now" button when online with pending operations.
 *
 * ⚡ PERF FIX (2026-10-05): اتبدّل framer-motion بـ CSS animation
 * (animate-in fade-in) — المكون ده عايش في الـ shell اللي بيتحمّل مع
 * كل صفحة، وframer-motion كان بيزيد ~35KB gzip على كل تحميل بدون داعي.
 */
export function OfflineIndicator() {
  const sync = useSyncState()
  const { entries } = usePendingOperations()
  const [syncResult, setSyncResult] = React.useState<{ done: number; failed: number } | null>(null)

  // 🛡️ PWA OFFLINE ROOT FIX (2026-10-07): دفعة فحص تحديث الـ Service Worker.
  // الجهاز اللي فضل أوفلاين وقت النشر بيكمّل شغال بالـ SW القديم (بأخطائه
  // القديمة زي ERR_FAILED) لحد ما حاجة تطلب sw.js تاني — بنطلب الفحص عند
  // تحميل المكون + عند رجوع النت + كل 30 دقيقة. آمن تماماً: لو مفيش
  // إصدار جديد الفحص بيرجع بدون أي تأثير، والإصدار الجديد عندنا بيعمل
  // skipWaiting + clients.claim بنفسه فبينتشد فوراً.
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const nudge = () => {
      try {
        navigator.serviceWorker
          .getRegistration()
          .then((r) => r?.update().catch(() => {}))
          .catch(() => {})
      } catch {
        /* ignore */
      }
    }
    nudge()
    window.addEventListener('online', nudge)
    const t = window.setInterval(nudge, 30 * 60 * 1000)
    return () => {
      window.removeEventListener('online', nudge)
      window.clearInterval(t)
    }
  }, [])

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
      <div
        className="relative z-[60] shrink-0 flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-white animate-in fade-in duration-200"
      >
        <WifiOff className="size-4" />
        <span className="text-sm font-medium">
          أنت تعمل بدون إنترنت — التطبيق شغّال ببيانات جهازك، والتغييرات هتتزامن تلقائياً عند رجوع النت
        </span>
        {sync.pending > 0 && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
            {sync.pending} بانتظار المزامنة
          </span>
        )}
      </div>
    )
  }

  // Syncing → blue banner with spinner
  if (sync.syncing) {
    return (
      <div
        className="relative z-[60] shrink-0 flex items-center justify-center gap-2 bg-blue-500 px-4 py-2 text-white animate-in fade-in duration-200"
      >
        <RefreshCw className="size-4 animate-spin" />
        <span className="text-sm font-medium">جارٍ مزامنة البيانات...</span>
      </div>
    )
  }

  // Pending operations + online → show "Sync now" banner
  if (sync.pending > 0) {
    return (
      <div
        className="relative z-[60] shrink-0 flex items-center justify-between gap-2 bg-blue-50 px-4 py-2 text-blue-900 border-b border-blue-200 animate-in fade-in duration-200"
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
      </div>
    )
  }

  // Sync result (temporary)
  if (syncResult) {
    return (
      <div
        className={`relative z-[60] shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium animate-in fade-in duration-200 ${
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
      </div>
    )
  }

  return null
}
