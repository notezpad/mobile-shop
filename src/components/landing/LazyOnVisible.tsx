'use client'

import * as React from 'react'

/**
 * يحمّل الأقسام التقيلة (زي الصور) لما الزائر يقرّب منها بس — مش مع أول تحميل
 * للصفحة. الـ placeholder بيشيل نفس الـ id عشان روابط #anchor تفضل شغالة
 * (الضغط عليها بيسكرول للـ placeholder فيتحمّل القسم).
 */
export function LazyOnVisible({
  id,
  minHeight = 640,
  rootMargin = '700px',
  children,
}: {
  id?: string
  minHeight?: number
  rootMargin?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible, rootMargin])

  if (visible) return <>{children}</>
  return <div ref={ref} id={id} style={{ minHeight }} aria-hidden />
}
