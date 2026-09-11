'use client'

import * as React from 'react'
import JsBarcode from 'jsbarcode'

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
  // (خطوط + شريحة الرقم الصغيرة + هامش رفيع)
  const chipHeight = fontSize + 6
  const reservedHeight = height + chipHeight + 6

  React.useEffect(() => {
    if (!value || !svgRef.current) return
    setFailed(false)
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        height,
        width,
        displayValue: false, // هنعرض الرقم بأنفسنا في شريحة مخصّصة
        margin: 0,
        background: 'transparent',
      })
      // نضيف زوايا دائرية على كل الأعمدة عشان الشكل يبقى ناعم/عصري
      const svg = svgRef.current
      const rx = Math.max(0.6, width * 0.55)
      svg.querySelectorAll('rect').forEach((r) => {
        r.setAttribute('rx', String(rx))
        r.setAttribute('ry', String(rx))
      })
    } catch {
      setFailed(true)
    }
  }, [value, height, width])

  if (!value) {
    return <div style={{ height: reservedHeight }} aria-hidden="true" />
  }

  if (failed) {
    return (
      <div className="flex items-center" style={{ height: reservedHeight }}>
        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
          {value}
        </span>
      </div>
    )
  }

  // شريحة الرقم أسفل الباركود — مونو، حروف متباعدة، خلفية muted خفيفة
  const chip = (
    <span
      dir="ltr"
      className="inline-flex items-center rounded-sm bg-muted/60 px-1.5 font-mono text-foreground/80"
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
      className={className}
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
          opacity: 0.55,
        }}
      />
      <svg
        ref={svgRef}
        {...({ dir: 'ltr' } as React.SVGProps<SVGSVGElement>)}
        preserveAspectRatio={fitContainer ? 'xMidYMid meet' : undefined}
        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      />
      {chip}
    </div>
  )

  return frame
}
