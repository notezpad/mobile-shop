'use client'

import * as React from 'react'

/**
 * 🛡️ إصلاح (2026-11-05): تعارض الطبقات أسفل الشاشة.
 *
 * شريط التحديد الجماعي في صفحة المنتجات والبانرات العائمة (تثبيت التطبيق /
 * تنبيه الاشتراك / بيانات تجريبية) بيجلسوا كلهم في نفس المساحة أسفل الشاشة —
 * والبانرات كانت بترتفع فوق الشريط فتمنع النقر على زر «طباعة ملصقات» تماماً
 * (بانر z-[60] فوق الشريط z-30). أول جلسة للمستخدم الجديد بتتعطل خالص.
 *
 * الحل المركزي: أي بانر عائم أسفل الشاشة يسمع حدث `nezam:bulk-selection`
 * ويختفي طالما التحديد الجماعي نشط — والشريط نفسه اترفع لـ z-50.
 * ProductsView هو مَن يبعت الحدث (detail: boolean).
 *
 * الاستخدام: const bulkActive = useBulkSelectionActive()
 */
const EVENT_NAME = 'nezam:bulk-selection'

export function useBulkSelectionActive(): boolean {
  const [active, setActive] = React.useState(false)

  React.useEffect(() => {
    const onBulkSelection = (e: Event) => {
      try {
        setActive(Boolean((e as CustomEvent).detail))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener(EVENT_NAME, onBulkSelection)
    return () => window.removeEventListener(EVENT_NAME, onBulkSelection)
  }, [])

  return active
}
