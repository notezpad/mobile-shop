'use client'

/**
 * 🛡️ v12 (ROOT FIX — "خطأ غير متوقع"): Error boundary حقيقي لكل صفحات
 * النظام — بدل شاشة ميتة بلا أي زر، الشاشة دي بتوضّح اللي حصل بالبلدي
 * وبتدي طريق رجوع واضح:
 *   - "إعادة المحاولة" → reset() بيرندر الصفحة تاني فوراً (بينفع مع
 *     الأخطاء اللحظية زي قطع شبكة لحظي أثناء أول جلب).
 *   - "تحديث الصفحة" → reload كامل بيجيب HTML/chunks جديدة (بينفع مع
 *     أخطاء الـ chunks بعد النشرات).
 *   - وأوفلاين بنوضّح إن البيانات المحلية شغّالة ومفيش حاجة اتضاعت.
 *
 * الملف ده self-contained بمقصود (مفيش أي imports من طبقة التطبيق) —
 * لأن error boundary لازم يشتغل حتى لو الطبقة نفسها هي اللي وقعت.
 */

import * as React from 'react'
import { AlertTriangle, RefreshCw, RotateCcw, WifiOff } from 'lucide-react'

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const msg = String(error?.message || '')
  const isChunkError =
    /chunkloaderror|loading chunk|dynamically imported module|failed to fetch dynamically|importing a module script/i.test(
      msg
    )

  // سجل كامل في الكونسول للتشخيص (بدون كوابس ملطخة للشاشة)
  React.useEffect(() => {
    console.error('[shop-error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 rounded-3xl border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          {isChunkError ? <RefreshCw className="size-8" /> : <AlertTriangle className="size-8" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-black">
            {isChunkError ? 'الصفحة محتاجة تحديث خفيف' : 'حصل خطأ في عرض الصفحة'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isChunkError
              ? 'النسخة اللي على جهازك من تحديث قديم — اضغط تحديث الصفحة وهترجع تشتغل فوراً.'
              : 'مش مشكلة في بياناتك — كل حاجة محفوظة. جرّب إعادة المحاولة، ولو مستمرة حدّث الصفحة.'}
          </p>
          {typeof navigator !== 'undefined' && navigator.onLine === false && (
            <p className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <WifiOff className="size-3.5" />
              أنت أوفلاين — التطبيق شغّال ببيانات جهازك
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
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

        {error?.digest ? (
          <p className="select-none text-[10px] text-muted-foreground/60" dir="ltr">
            ref: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
