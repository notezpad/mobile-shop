import * as React from 'react'

/**
 * useUnsavedConfirm — يمنع إغلاق الـ Dialog لو في بيانات مكتوبة
 *
 * الاستخدام:
 *   const { onOpenChange } = useUnsavedConfirm({ dirty, onClose })
 *   <Dialog open={open} onOpenChange={onOpenChange}>
 *
 * dirty = true لما المستخدم يعدّل أي حقل
 */
export function useUnsavedConfirm({
  dirty,
  onClose,
}: {
  dirty: boolean
  onClose: () => void
}) {
  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open && dirty) {
        const confirmed = window.confirm(
          'لديك تعديلات غير محفوظة. هل تريد الخروج؟'
        )
        if (!confirmed) return
      }
      if (!open) onClose()
    },
    [dirty, onClose]
  )

  return { onOpenChange }
}
