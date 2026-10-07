'use client'

/**
 * 🛡️ v13 (ROOT FIX — "خطأ غير متوقع" الغامضة): Error boundary تشخيصي لكل
 * صفحات النظام — بيلغي الغموض نهائياً:
 *
 *   1) بيعرض سبب الخطأ **الحقيقي** على الشاشة (نص تقني قابل للنسخ) — أي
 *      سكرين شوت من المستخدم بيقولنا السطر اللي وقع بالظبط، بدل "خطأ غير
 *      متوقع" اللي مفيش منها أي معلومة.
 *   2) شفاء ذاتي: أول ما يقع خطأ بنجرّب reset() تلقائياً مرة واحدة بعد
 *      ثانية — أغلب الأعطال اللحظية (قطع شبكة أثناء أول جلب، RSC قديم
 *      لحظة نشر) بتتعالج لوحدها والمستخدم مش بيحس بحاجة.
 *   3) أخطاء chunks (بعد نشر جديد) → reload واحد محسوب بيجيب HTML جديد.
 *   4) كل خطأ بيتسجّل في localStorage (آخر 10) — عشان يفضل فيه سجل حتى لو
 *      المستخدم ما صورش الشاشة.
 *   5) زر "نسخ تفاصيل الخطأ" — نسخة كاملة (الرسالة + الستاك + الصفحة +
 *      الوقت) جاهزة للإرسال.
 *
 * الملف ده self-contained بمقصود (React + lucide فقط) — لأن error boundary
 * لازم يشتغل حتى لو طبقة التطبيق نفسها هي اللي وقعت.
 */

import * as React from 'react'
import { AlertTriangle, Copy, Check, RefreshCw, RotateCcw, WifiOff } from 'lucide-react'

const ERROR_LOG_KEY = 'nezam-error-log'
const AUTO_RETRY_KEY = 'nezam-err-autoretry-at'
const CHUNK_RELOAD_KEY = 'nezam-chunk-heal-at'

const CHUNK_ERR_RE =
  /chunkloaderror|loading chunk|loading css chunk|dynamically imported module|failed to fetch dynamically|error loading dynamically|importing a module script|chunk.*failed|failed to load chunk/i

function pushErrorLog(entry: Record<string, unknown>) {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY)
    const list: unknown[] = raw ? JSON.parse(raw) : []
    list.unshift({ at: new Date().toISOString(), ...entry })
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    /* التسجيل ترف — عمره ما يعطل الشاشة */
  }
}

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const msg = String(error?.message || '').slice(0, 500)
  const stack = String(error?.stack || '').slice(0, 900)
  const digest = error?.digest || ''
  const isChunkError = CHUNK_ERR_RE.test(msg)

  const [copied, setCopied] = React.useState(false)
  const [autoRetried, setAutoRetried] = React.useState(false)

  // سجل كامل في الكونسول + localStorage للتشخيص
  React.useEffect(() => {
    console.error('[shop-error]', error)
    pushErrorLog({ source: 'boundary', message: msg, digest, href: window.location.href })
  }, [error, msg, digest])

  // 🛡️ شفاء ذاتي #1: خطأ chunks → reload واحد (بحد أقصى مرة/دقيقة)
  React.useEffect(() => {
    if (!isChunkError) return
    const t = setTimeout(() => {
      try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
        if (Date.now() - last < 60_000) return
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
      } catch {
        /* نكمل بالريلود على أي حال */
      }
      window.location.reload()
    }, 700)
    return () => clearTimeout(t)
  }, [isChunkError])

  // 🛡️ شفاء ذاتي #2: أي خطأ تاني → reset تلقائي مرة واحدة (بحد أقصى
  // مرة/10 ثواني عشان ما ندخلش حلقة إعادة محاولة لو الخطأ مستمر)
  React.useEffect(() => {
    if (isChunkError) return
    const t = setTimeout(() => {
      try {
        const last = Number(sessionStorage.getItem(AUTO_RETRY_KEY) || 0)
        if (Date.now() - last < 10_000) {
          setAutoRetried(true)
          return
        }
        sessionStorage.setItem(AUTO_RETRY_KEY, String(Date.now()))
      } catch {
        setAutoRetried(true)
        return
      }
      setAutoRetried(true)
      reset()
    }, 1_200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const copyDetails = async () => {
    const details = [
      '=== تفاصيل خطأ نظام المحل ===',
      `الوقت: ${new Date().toLocaleString('ar-EG')}`,
      `الصفحة: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `الرسالة: ${msg || '(بدون رسالة)'}`,
      digest ? `المرجع: ${digest}` : '',
      `النوع: ${error?.constructor?.name || 'Error'}`,
      stack ? `الستاك:\n${stack}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // fallback قديم بسيط
      try {
        const ta = document.createElement('textarea')
        ta.value = details
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        /* مفيش نسخ — النص ظاهر على الشاشة والصورة تكفي */
      }
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-3xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          {isChunkError ? <RefreshCw className="size-7" /> : <AlertTriangle className="size-7" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-black">
            {isChunkError ? 'الصفحة محتاجة تحديث خفيف' : 'حصل خطأ في عرض الصفحة'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isChunkError
              ? 'النسخة اللي على جهازك من تحديث قديم — بنحدّثها تلقائياً دلوقتي.'
              : 'التطبيق بيحاول يصلّح لوحده تلقائياً… لو الشاشة دي فضلت ظاهرة، ابعتلنا الصورة دي أو اضغط "نسخ تفاصيل الخطأ".'}
          </p>
          {typeof navigator !== 'undefined' && navigator.onLine === false && (
            <p className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <WifiOff className="size-3.5" />
              أنت أوفلاين — بياناتك المحفوظة على الجهاز سليمة
            </p>
          )}
        </div>

        {/* 🛡️ السبب الحقيقي — ظاهر دايماً (مختصر وقابل للتمرير) */}
        {msg ? (
          <div className="space-y-1 rounded-2xl border bg-muted/40 p-3 text-start">
            <p className="text-[11px] font-bold text-muted-foreground">سبب الخطأ (تقني):</p>
            <p dir="ltr" className="max-h-24 overflow-auto break-all font-mono text-[11px] leading-relaxed text-foreground/80">
              {msg}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RotateCcw className="size-4" />
            إعادة المحاولة
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-bold transition-colors hover:bg-muted"
          >
            <RefreshCw className="size-4" />
            تحديث الصفحة
          </button>
        </div>

        <button
          onClick={copyDetails}
          className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          {copied ? 'تم النسخ — ابعته لنا' : 'نسخ تفاصيل الخطأ'}
        </button>

        {digest ? (
          <p className="select-none text-[10px] text-muted-foreground/60" dir="ltr">
            ref: {digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
