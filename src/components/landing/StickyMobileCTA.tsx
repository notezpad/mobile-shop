'use client'

import * as React from 'react'
import { Rocket } from 'lucide-react'

/**
 * زر ثابت أسفل الشاشة على الموبايل فقط — بيظهر بعد ما الزائر يعدّي الهيرو
 * (وقبل ما يوصل لـ CTA الأخير) عشان زر التسجيل يبقى دايماً في متناول إبهامه.
 */
export function StickyMobileCTA({ onClick }: { onClick: () => void }) {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    const check = () => {
      const y = window.scrollY
      const nearEnd = y + window.innerHeight > document.documentElement.scrollHeight - 700
      setShow(y > 520 && !nearEnd)
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => window.removeEventListener('scroll', check)
  }, [])

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-[#00573f]/15 bg-white/95 shadow-[0_-12px_30px_-12px_rgba(0,60,40,0.25)] px-4 pt-2 backdrop-blur transition-transform duration-300 md:hidden ${
        show ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <button
        type="button"
        tabIndex={show ? 0 : -1}
        onClick={onClick}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-brand-500 to-brand-700 text-base font-extrabold text-white shadow-lg shadow-brand-600/30 active:scale-[0.98]"
      >
        <Rocket className="size-5" />
        ابدأ تجربتك المجانية — 14 يوم
      </button>
    </div>
  )
}
