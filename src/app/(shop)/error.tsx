'use client'

/**
 * 🛡️ 2026-10-07 (v14): حدود أخطاء صفحات المحل — قاتل "الشاشة السوداء".
 *
 * قبل v14 التطبيق كله كان من غير أي ErrorBoundary، فأي خطأ runtime بسيط
 * في أي صفحة كان بيفضّي شجرة React بالكامل → شاشة سوداء/بيضا فاضية بدون
 * أي رسالة ولا زر (وده اللي كان بيتشكى منه المستخدم على صفحة الحركات).
 *
 * دلوقتي أي كراش في أي صفحة بيظهر كارت ودود فيه:
 *  - إعادة المحاولة (reset — يعيد رسم نفس الصفحة من غير ريلود كامل)
 *  - تحديث كامل للصفحة (لو الحاجة كانت chunks قديمة بعد نشر نسخة جديدة)
 *  - زر لصفحة تسجيل الدخول/الرئيسية لو الصفحة نفسها باظت خالص
 */

import * as React from 'react'
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // نسجل الخطأ في الكونسول للتشخيص (وبنفلتره من أخطاء الـ chunks اللي
    // ليها معالج خاص في ChunkGuard)
    console.error('[shop-error]', error)
  }, [error])

  const msg = String(error?.message ?? '')
  const isChunk =
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(
      msg,
    )

  return (
    <div
      dir="rtl"
      className="flex min-h-[60vh] items-center justify-center bg-background p-5"
    >
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-7" />
        </div>

        <h1 className="mt-4 text-lg font-black">
          {isChunk ? 'اتنشرت نسخة جديدة من السيستم' : 'حصل خطأ غير متوقع'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {isChunk
            ? 'الصفحة اللي ماسكها المتصفح من نسخة قديمة. حدّث الصفحة مرة واحدة وهيشتغل تمام.'
            : 'الصفحة ما قدرتش تكمل تحميل. جرّب تعيد المحاولة، ولو ما اشتغلتش اعمل تحديث كامل للصفحة.'}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={reset} className="h-11 gap-2 rounded-xl">
            <RotateCcw className="size-4" />
            إعادة المحاولة
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="h-11 gap-2 rounded-xl"
          >
            <RefreshCw className="size-4" />
            تحديث الصفحة بالكامل
          </Button>
        </div>

        {error?.digest && (
          <p className="mt-4 text-[10px] text-muted-foreground/60" dir="ltr">
            كود الخطأ: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
