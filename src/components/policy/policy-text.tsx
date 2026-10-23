import * as React from 'react'

/**
 * Helpers مشتركة لصفحات السياسات (الاسترجاع / الخصوصية / الكوكيز / الشروط)
 *  - inline(): يحوّل **نص** إلى <strong> بدل ظهور النجوم حرفيًا
 *  - numbered(): يثبّت ترقيم "10." على يمين العنوان بدل ما النقطة تتقلب (.10)
 *  - isSubhead(): السطر كله عريض (عنوان فرعي) وليس فقرة فيها كلمة عريضة
 */

export function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="pol-strong">{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

export function numbered(text: string): React.ReactNode {
  const m = text.match(/^(\d+\.)\s*([\s\S]*)$/)
  if (!m) return text
  return (
    <>
      <bdi dir="ltr" className="pol-num">{m[1]}</bdi>{' '}{m[2]}
    </>
  )
}

export function isSubhead(para: string): boolean {
  return /^\*\*[^*]+\*\*:?$/.test(para.trim())
}

export function subheadText(para: string): string {
  return para.replace(/\*\*/g, '').trim()
}
