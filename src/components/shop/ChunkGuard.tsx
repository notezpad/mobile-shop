'use client'

/**
 * 🛡️ 2026-10-07 (v14): حارس النسخة الجديدة — إصلاح "شاشة سوداء بعد التحديث".
 *
 * المشكلة: لما بينزل تحديث جديد للسيستم، المتصفح ممكن يكون ماسك نسخة قديمة
 * من الصفحة (HTML/RSC من الكاش) بتطالب بملفات JS chunks بأسماء قديمة اتحذت
 * من السيرفر. النتيجة: تحميل الموديول يفشل، وReact يفضّي الشاشة بالكامل
 * (شاشة سوداء/بيضا بدون أي رسالة) — وده بالظبط اللي كان بيحصل على صفحة
 * الحركات بعد نشر v13: "بتظهر أول 3 ثواني وبعدها شاشة سوداء".
 *
 * الحل: نسمع لأخطاء تحميل الـ chunks عالميًا، وأول ما نكتشف واحدة نعمل
 * ريلود كامل مرة واحدة (بحارس sessionStorage ضد اللوب) عشان المتصفح يسحب
 * HTML + chunks النسخة الجديدة متطابقين.
 */

import * as React from 'react'

const RELOAD_KEY = 'v14-chunk-reload-at'

function isChunkError(msg: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed|ChunkLoadError|Load failed.*_next|dynamically imported module/i.test(
    msg,
  )
}

export function ChunkGuard() {
  React.useEffect(() => {
    const recover = () => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
        if (Date.now() - last < 15000) return // ضد اللوب: مرة واحدة كل 15 ثانية
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      } catch {
        // sessionStorage مقفول (وضع خصوصي) → ريلود عادي، اللوب مستحيل عمليًا
        // لأن الخطأ نفسه بيختفي بعد ما الكاش يتحدث
      }
      window.location.reload()
    }

    const onReject = (e: PromiseRejectionEvent) => {
      const reason: any = e?.reason
      const msg = String(reason?.message ?? reason ?? '')
      if (isChunkError(msg)) recover()
    }
    const onError = (e: ErrorEvent) => {
      if (isChunkError(String(e?.message ?? ''))) recover()
    }

    window.addEventListener('unhandledrejection', onReject)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onReject)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
