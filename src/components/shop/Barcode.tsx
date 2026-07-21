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
 * يعرض الباركود كصورة خطوط حقيقية بدل ما يكون رقم نصي فقط.
 *
 * مشكلة الـ Overflow:
 * - JsBarcode بيرسم SVG بعرض ثابت حسب قيمة الـ barcode (كل digit بـ ~7px × count).
 * - في الـ table columns الضيقة (زي w-44 = 176px) الباركود بيتجاوز الخلية.
 * - الحل: لما `fitContainer=true` نحط الـ SVG جوّه div بـ `overflow-hidden` + `max-w-full`
 *   + `preserveAspectRatio="xMidYMid meet"` عشان الباركود يتقلّص (scale down) لحد ما يدخل.
 *
 * لو الباركود لسه أعرض من الخلية حتى بعد التقلّص، الـ overflow-hidden بيقطّعه
 * بدل ما يكسر layout الجدول.
 */
export function Barcode({
  value,
  height = 32,
  width = 1.4,
  fontSize = 11,
  className,
  fitContainer = false,
}: BarcodeProps) {
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const [failed, setFailed] = React.useState(false)

  // الارتفاع الكلي المحجوز للخلية (خطوط الباركود + مسافة الرقم تحتها + الهامش)
  // بيتفعّل حتى لو مفيش باركود، عشان صفوف الجدول تفضل بنفس الارتفاع
  const reservedHeight = height + fontSize + 12

  React.useEffect(() => {
    if (!value || !svgRef.current) return
    setFailed(false)
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        height,
        width,
        fontSize,
        displayValue: true,
        margin: 4,
        background: 'transparent',
      })
    } catch {
      // قيمة لا تصلح لتنسيق الباركود (نادر) — نعرض الرقم كنص بديل
      setFailed(true)
    }
  }, [value, height, width, fontSize])

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

  // fitContainer mode: wrap SVG in a constrained div so it scales down
  // instead of overflowing the parent cell. preserveAspectRatio keeps the
  // barcode centered and proportional.
  if (fitContainer) {
    return (
      <div
        className={className}
        style={{
          height: reservedHeight,
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          ref={svgRef}
          dir="ltr"
          preserveAspectRatio="xMidYMid meet"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
    )
  }

  return (
    <svg
      ref={svgRef}
      className={className}
      {...({ dir: 'ltr' } as React.SVGProps<SVGSVGElement>)}
    />
  )
}
