'use client'

import * as React from 'react'
import JsBarcode from 'jsbarcode'

interface BarcodeProps {
  value: string | null | undefined
  height?: number
  width?: number
  fontSize?: number
  className?: string
}

/** يعرض الباركود كصورة خطوط حقيقية بدل ما يكون رقم نصي فقط */
export function Barcode({ value, height = 32, width = 1.4, fontSize = 11, className }: BarcodeProps) {
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

  return <svg ref={svgRef} className={className} {...({ dir: 'ltr' } as React.SVGProps<SVGSVGElement>)} />
}
