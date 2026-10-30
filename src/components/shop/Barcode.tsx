'use client'

import * as React from 'react'
import JsBarcode from 'jsbarcode'
import { barcodeFormatFor } from '@/lib/barcode'

interface BarcodeProps {
  value: string | null | undefined
  height?: number
  width?: number
  fontSize?: number
  className?: string
  /** When true, the barcode SVG scales down to fit its container width
   *  instead of overflowing. Useful inside narrow table columns. */
  fitContainer?: boolean
}

/**
 * ستايل باركود 2026 — مضغوط ومميز.
 *
 * الفكرة:
 * - خطوط رفيعة جدًا (width≈1) بأطراف دائرية (rx) بدل المستطيلات الحادة.
 * - إخفاء الرقم الافتراضي بتاع JsBarcode ورسم "شريحة" مونو-سبيس صغيرة تحت
 *   الباركود مع تباعد حروف واسع (tracking) — شكل عصري وسهل القراءة.
 * - إطار خفيف بأكواع ركنية (corner brackets) بدل بوردر كامل، يوفّر مساحة
 *   ويدّي إحساس "ماسح ضوئي".
 * - المكوّن كله بيتقلّص لعرض الخلية عبر preserveAspectRatio + overflow-hidden،
 *   فالخلية بتفضل ضيقة (مش بتاخد عرض كبير زي الستايل التقليدي).
 */
export function Barcode({
  value,
  height = 24,
  width = 1,
  fontSize = 9,
  className,
  fitContainer = false,
}: BarcodeProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const [failed, setFailed] = React.useState(false)

  // ارتفاع محجوز ثابت للخلية عشان الصفوف تفضل متساوية حتى بدون باركود.
  // (خطوط + فجوة 3px + شريحة الرقم الصغيرة + هامش رفيع 2px فوق وتحت —
  //  المحتوى الفعلي بالظبط: height + 3 + chipHeight + 4)
  const chipHeight = fontSize + 6
  const reservedHeight = height + chipHeight + 7

  React.useEffect(() => {
    // الـ <svg> بيفضل متركّب دايماً (حتى لو الرسم فشل) عشان الـ ref ما يبقاش null
    // ونقدر نرجع نرسم لما القيمة تتغيّر لقيمة سليمة.
    const svg = svgRef.current
    if (!value || !svg) return
    setFailed(false)
    try {
      JsBarcode(svg, value, {
        format: barcodeFormatFor(value),
        height,
        width,
        // 🛡️ flat: بدونها خطوط الحراسة في EAN-13 بتطول ~8px عن height فالمحتوى
        // يزيد عن الحاوية اللي عليها overflow:hidden وتتقص من الخطوط. flat
        // بيساوي كل الخطوط فالـ SVG يطلع بارتفاع height بالظبط.
        flat: true,
        displayValue: false,
        margin: 0,
        background: 'transparent',
        lineColor: 'currentColor', // ⚡ uses inherited text color — adapts to dark/light mode
      })
      // نضيف زوايا دائرية على كل الأعمدة عشان الشكل يبقى ناعم/عصري
      const rx = Math.max(0.6, width * 0.55)
      svg.querySelectorAll('rect').forEach((r) => {
        r.setAttribute('rx', String(rx))
        r.setAttribute('ry', String(rx))
      })
    } catch {
      svg.replaceChildren() // نشيل أي رسم قديم/نصف مرسوم
      setFailed(true)
    }
  }, [value, height, width])

  if (!value) {
    return <div style={{ height: reservedHeight }} aria-hidden="true" />
  }

  // شريحة الرقم أسفل الباركود — مونو، حروف متباعدة، خلفية muted خفيفة
  const chip = (
    <span
      dir="ltr"
      className="inline-flex items-center rounded-sm bg-muted px-1.5 font-mono text-foreground"
      style={{
        fontSize,
        lineHeight: `${chipHeight}px`,
        letterSpacing: '0.14em',
      }}
    >
      {value}
    </span>
  )

  // الحاوية: أكواع ركنية بدل بوردر كامل + توسيط + منع الفيضان
  const frame = (
    <div
      className={className ? `${className} text-foreground` : 'text-foreground'}
      style={{
        height: reservedHeight,
        maxWidth: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        position: 'relative',
        padding: '2px 6px',
      }}
    >
      {/* corner brackets */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: [
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
            'linear-gradient(currentColor,currentColor)',
          ].join(','),
          backgroundRepeat: 'no-repeat',
          backgroundSize:
            '6px 1px,1px 6px,6px 1px,1px 6px,6px 1px,1px 6px,6px 1px,1px 6px',
          backgroundPosition:
            'left top,left top,right top,right top,left bottom,left bottom,right bottom,right bottom',
          color: 'var(--color-muted-foreground)',
          opacity: 0.7,
        }}
      />
      <svg
        ref={svgRef}
        {...({ dir: 'ltr' } as React.SVGProps<SVGSVGElement>)}
        preserveAspectRatio={fitContainer ? 'xMidYMid meet' : undefined}
        style={{ maxWidth: '100%', height: 'auto', display: failed ? 'none' : 'block', color: 'inherit' }}
      />
      {chip}
    </div>
  )

  return frame
}
