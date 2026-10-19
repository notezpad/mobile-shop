'use client'

import * as React from 'react'
import { WifiOff, RefreshCw, CloudUpload, CheckCircle2, AlertCircle } from 'lucide-react'
import { useSyncState, usePendingOperations, syncNow, getSyncState } from '@/lib/offline/use-offline'

/**
 * OfflineIndicator — floating status toasts (bottom-center overlay):
 * 1. User is offline → orange gradient pill (with live pulse + pending count)
 * 2. Sync in progress → blue gradient pill with spinner
 * 3. Pending operations while online → light glass card + "مزامنة الآن"
 * 4. Sync result → emerald/rose toast (auto-hides after 5s)
 *
 * 🎨 v15: الكروت دي بترجع من غير تمركز ثابت — الحاوية fixed بتاعتها في
 * (shop)/layout.tsx فبتظهر فوق المحتوى من غير ما تزحّح أي عنصر (الهيدر
 * والتولبار ثابتين في أماكنهم مهما ظهر أو اختفى من البانرات دي).
 *
 * Also keeps the protective side-effects (SW update nudge, chunk-error
 * self-heal reload, global error logger) — untouched since v13/v12.
 *
 * ⚡ PERF FIX (2026-10-05): اتبدّل framer-motion بـ CSS animation
 * (animate-in fade-in) — المكون ده عايش في الـ shell اللي بيتحمّل مع
 * كل صفحة، وframer-motion كان بيزيد ~35KB gzip على كل تحميل بدون داعي.
 */
export function OfflineIndicator() {
  const sync = useSyncState()
  const { entries } = usePendingOperations()
  const [syncResult, setSyncResult] = React.useState<{ done: number; failed: number; error?: string } | null>(null)

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

  // 🛡️ v12 ROOT FIX ("خطأ غير متوقع" بعد أي نشر): شفاء ذاتي من أخطاء
  // تحميل الـ chunks. بعد كل نشر جديد أسماء ملفات الـ JS بتتغيّر — فأي
  // HTML/RSC قديم في المتصفح (من جلسة قبل النشر) بيحاول يحمّل chunk
  // باسم قديم → 404 → dynamic import يفشل → الصفحة تموت على error
  // boundary. بدل الشاشة الميتة: بنكتشف الخطأ ده وبنعمل reload واحد
  // (بحد أقصى مرة كل دقيقة عشان ما ندخلشش حلقة) — الـ reload بيجيب
  // HTML جديد بأسماء chunks جديدة وكل حاجة ترجع تشتغل من غير تدخل.
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const CHUNK_ERR_RE =
      /chunkloaderror|loading chunk|loading css chunk|dynamically imported module|failed to fetch dynamically|error loading dynamically|importing a module script|chunk.*failed|failed to load chunk/i
    let armed = true
    const heal = () => {
      if (!armed) return
      // أوفلاين؟ المشكلة مش النشر — السيشن بتاعة الأوفلاين بتتكفل بحالتها
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      try {
        const KEY = 'nezam-chunk-heal-at'
        const last = Number(sessionStorage.getItem(KEY) || 0)
        if (Date.now() - last < 60_000) return // حماية من حلقة reload
        sessionStorage.setItem(KEY, String(Date.now()))
      } catch {
        /* sessionStorage مرفوض — نكمل بالريلود على أي حال */
      }
      armed = false
      window.location.reload()
    }
    const onError = (e: ErrorEvent) => {
      if (e?.message && CHUNK_ERR_RE.test(e.message)) heal()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e?.reason as any)?.message || e?.reason || '')
      if (msg && CHUNK_ERR_RE.test(msg)) heal()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      armed = false
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  // 🛡️ v13 (تشخيص جذر "خطأ غير متوقع"): مسجّل أخطاء عالمي — أي خطأ JS
  // في أي مكان (حتى خارج error boundary) بيتسجل في localStorage (آخر 10)
  // بنفس صيغة سجل الـ boundary — فلو حصل عطل وصوّر المستخدم الشاشة أو
  // دخل من جهاز تاني، السجل كله موجود للتشخيص الدقيق.
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const push = (source: string, message: string, extra?: Record<string, unknown>) => {
      try {
        const KEY = 'nezam-error-log'
        const raw = localStorage.getItem(KEY)
        const list: unknown[] = raw ? JSON.parse(raw) : []
        list.unshift({
          at: new Date().toISOString(),
          source,
          message: String(message).slice(0, 500),
          href: window.location.href,
          ...extra,
        })
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)))
      } catch {
        /* التسجيل ترف */
      }
    }
    const onError = (e: ErrorEvent) => {
      if (e?.message) push('window', e.message)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const m = String((e?.reason as any)?.message || e?.reason || '')
      if (m) push('unhandledrejection', m)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  // Don't show anything if everything is fine
  if (sync.online && !sync.syncing && sync.pending === 0 && !syncResult) {
    return null
  }

  const handleSyncNow = async () => {
    setSyncResult(null)
    const result = await syncNow()
    // 🛡️ لو الدفعة اتوقفت بخطأ سيرفر (5xx) مفيش فيها حاجة اترفعت ولا فشلت
    // رسمياً — بنعرض الخطأ نفسه بدل «كل البيانات متزامنة» الكاذبة.
    const lastError = getSyncState().lastError
    setSyncResult(
      result.done === 0 && result.failed === 0 && lastError
        ? { done: 0, failed: -1, error: lastError }
        : result,
    )
    setTimeout(() => setSyncResult(null), 5000)
  }

  // ────────────────────────────────────────────────────────────────────
  // 🎨 v15 — FLOATING TOASTS (صفر إزاحة للعناصر)
  //
  // المكون بيرجّع «الكارت نفسه» فقط — التمركز الثابت بيتم في الشِل
  // (layout.tsx) جوّه حاوية fixed inset-x-0 bottom-0 pointer-events-none.
  // يعني الكارت بيتعرض فوق المحتوى كطبقة عائمة، وعمره ما بياخد ارتفاع
  // من تدفق الصفحة → الهيدر/التولبار/السايدبار ما بيتزحّقوش خالص.
  // كل كارت عليه pointer-events-auto عشان يستقبل الضغط/اللمس هو فقط.
  // ────────────────────────────────────────────────────────────────────

  // Offline → orange gradient pill with a live pulse dot
  if (!sync.online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-[min(92vw,460px)] items-center gap-2.5 rounded-2xl bg-gradient-to-l from-amber-500 via-orange-500 to-orange-600 py-2.5 pe-3 ps-3 text-white shadow-xl shadow-orange-950/30 ring-1 ring-white/25 backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300"
      >
        {/* نبضة حية — إحساس إن النظام "بيتنفس" وواعي بحالته */}
        <span aria-hidden="true" className="relative mx-0.5 flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-white/95" />
        </span>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <WifiOff className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-extrabold">أنت تعمل بدون إنترنت</p>
          <p className="truncate text-[11px] font-medium text-white/85">
            التطبيق شغّال ببيانات جهازك — التغييرات بتتزامن تلقائياً
          </p>
        </div>
        {sync.pending > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold tabular-nums">
            {sync.pending} بانتظار المزامنة
          </span>
        )}
      </div>
    )
  }

  // Syncing → blue gradient pill with spinner
  if (sync.syncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-[min(92vw,460px)] items-center gap-2.5 rounded-2xl bg-gradient-to-l from-blue-500 via-blue-600 to-indigo-600 py-2.5 pe-3 ps-3 text-white shadow-xl shadow-blue-950/30 ring-1 ring-white/25 backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <RefreshCw className="size-[18px] animate-spin" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-extrabold">جارٍ مزامنة البيانات…</p>
          <p className="truncate text-[11px] font-medium text-white/85">
            ثواني ويكتمل رفع كل حاجة للسيرفر
          </p>
        </div>
      </div>
    )
  }

  // Pending operations + online → light glass card with "Sync now" action
  if (sync.pending > 0) {
    const labelPreview =
      entries.length > 0 && entries.length <= 3
        ? entries.map((e) => e.label).join('، ')
        : ''
    return (
      <div className="pointer-events-auto flex w-full max-w-[min(92vw,460px)] items-center gap-2.5 rounded-2xl bg-white/95 py-2.5 pe-2.5 ps-3 text-slate-800 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/10 backdrop-blur-xl animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <CloudUpload className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-extrabold">
            <span className="tabular-nums">{sync.pending}</span> عملية بانتظار المزامنة
          </p>
          <p className="truncate text-[11px] font-medium text-slate-500">
            {labelPreview ||
              (sync.prewarmed > 0
                ? `هتترفع تلقائياً · ${sync.prewarmed} منتج محفوظ على جهازك`
                : 'هتترفع تلقائياً للسيرفر')}
          </p>
        </div>
        <button
          onClick={handleSyncNow}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm shadow-blue-600/30 transition-all hover:bg-blue-700 active:scale-95"
        >
          <RefreshCw className="size-3.5" />
          مزامنة الآن
        </button>
      </div>
    )
  }

  // Sync result (temporary toast — auto-hides after 5s)
  if (syncResult) {
    const serverStop = syncResult.failed === -1 && syncResult.error
    const ok = syncResult.failed === 0 && !serverStop
    // 🛡️ ROOT FIX («0 عنصر»): لو الضغطة مالقاش حاجة تستنى (المزامنة التلقائية
    // رفعتها قبلها) نطمنّ رسالة صريحة بدل «تمت مزامنة 0 عملية» المحيّرة.
    const nothing = ok && syncResult.done === 0
    return (
      <div
        role="status"
        className={`pointer-events-auto flex w-full max-w-[min(92vw,460px)] items-center gap-2.5 rounded-2xl py-2.5 pe-3 ps-3 shadow-xl ring-1 backdrop-blur-xl animate-in slide-in-from-bottom-4 fade-in duration-300 ${
          ok
            ? 'bg-emerald-50/95 text-emerald-800 shadow-emerald-900/10 ring-emerald-600/20'
            : 'bg-rose-50/95 text-rose-800 shadow-rose-900/10 ring-rose-600/20'
        }`}
      >
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
            ok ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
          }`}
        >
          {ok ? <CheckCircle2 className="size-[18px]" /> : <AlertCircle className="size-[18px]" />}
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold leading-tight">
          {serverStop
            ? `المزامنة متوقفت: ${syncResult.error}`
            : nothing
              ? 'كل البيانات متزامنة بالفعل — مفيش حاجة في الانتظار'
              : ok
                ? `تمت مزامنة ${syncResult.done} عملية بنجاح`
                : `تمت مزامنة ${syncResult.done}، وفشلت ${syncResult.failed} — هتتجرب تاني تلقائياً`}
        </p>
      </div>
    )
  }

  return null
}
