'use client'

/**
 * 🛡️ 2026-10-07 (v14): حدود الخطأ الأخيرة — لو كراش حصل خارج حدود
 * (shop)/error.tsx (مثلًا في الـ root layout نفسه) بدل ما يفضل الشاشة
 * فاضية تمامًا، بنعرض رسالة بسيطة بزر تحديث.
 * global-error لازم يرسم <html> و<body> بنفسه.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html dir="rtl" lang="ar">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafaf9',
          fontFamily:
            "system-ui, 'Segoe UI', Tahoma, Arial, sans-serif",
          padding: '20px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 24,
            border: '1px solid #e7e5e4',
            background: '#fff',
            padding: 28,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              margin: '0 auto',
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(245,158,11,.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
            }}
          >
            <AlertTriangle size={26} />
          </div>
          <h1 style={{ marginTop: 16, fontSize: 18, fontWeight: 800, color: '#1c1917' }}>
            حصل خطأ غير متوقع
          </h1>
          <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.7, color: '#78716c' }}>
            السيستم ما قدرش يكمل. جرّب تحدّث الصفحة ولو المشكلة استمرت سجّل دخول من جديد.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 18,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 12,
              border: '1px solid #e7e5e4',
              background: '#fff',
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 700,
              color: '#1c1917',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={15} />
            تحديث الصفحة
          </button>
          {error?.digest && (
            <p style={{ marginTop: 14, fontSize: 10, color: '#a8a29e', direction: 'ltr' }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
