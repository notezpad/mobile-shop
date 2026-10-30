'use client'

import JsBarcode from 'jsbarcode'
import { barcodeFormatFor } from '@/lib/barcode'
import {
  printInvoiceHtml,
  printBarcodeLabelsHtml,
  computeLabelLayout,
  type PrintableSale,
  type LabelItem,
  type LabelOptions,
} from '@/lib/print'
import { printHtmlInFrame } from '@/lib/print-frame'

/** نقطة طابعة الملصقات الشائعة (203dpi) بالمم — عرض الوحدة بيتقصّ لمضاعفاتها
 *  عشان الخطوط تترسم بعدد صحيح من النقاط (مسح ثابت على الطابعة). */
export const PRINTER_DOT_MM = 0.125
/** أقل عرض وحدة مقبول عملياً: نقطتين (0.25مم). أقل من كده الخط بيتقري غالباً. */
export const MIN_SCANNABLE_MODULE_MM = 0.25
const MM = 3.78 // 1mm ≈ 3.78px @ 96dpi
const DOT_MM = PRINTER_DOT_MM
const svgNS = 'http://www.w3.org/2000/svg'

/** طباعة مستند HTML — جوه iframe مخفي في نفس الصفحة (print-frame.ts).
 *  مفيش نافذة منبثقة: حاجب النوافذ ملوش دعوة، ولما المستخدم يكنسل المعاينة
 *  الصفحة تفضل شغالة عادي ويقدر يضغط «طباعة» تاني فوراً — دي كانت مشكلة
 *  النافذة المنبثقة القديمة (الصفحة بتتجمّد بعد الإلغاء لحد ريفرش).
 *  بيرجّع true لو أمر الطباعة انطلق. */
export function printHtml(html: string, title = 'طباعة'): boolean {
  return printHtmlInFrame(html, title)
}

export function printSale(sale: PrintableSale, shop?: {
  name?: string
  phone?: string
  address?: string
  logo?: string
  invoicePrefix?: string
}) {
  printHtml(printInvoiceHtml(sale, shop), `فاتورة ${sale.invoiceNo ?? sale.id}`)
}

/** Export invoice as PDF — prints the invoice (styled for A5 portrait, no
 *  headers/footers) through the hidden print iframe; the user picks
 *  «حفظ كـ PDF» from the print dialog. No popup window involved. */
export function exportSalePdf(sale: PrintableSale, shop?: {
  name?: string
  phone?: string
  address?: string
  logo?: string
  invoicePrefix?: string
}) {
  const baseHtml = printInvoiceHtml(sale, shop)
  // Inject PDF-optimized styles: hide browser print chrome, force A5 portrait
  const pdfStyles = `
    <style>
      @page { size: A5 portrait; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>`
  const html = baseHtml.replace('</head>', `${pdfStyles}</head>`)

  printHtmlInFrame(html, `فاتورة-${sale.invoiceNo ?? sale.id}`)
}

/** يقيس عرض الوحدة (module) اللي هيترسم بها الباركود فعلاً جوه مساحة متاحة —
 *  بنفس حساب `renderBarcodeSvg` بالظبط (رسم مخفي بعرض وحدة 1 ثم قسمة المتاح على
 *  عدد الوحدات + الهوامش الهادية، وتقصيط العرض على نقاط الطابعة). بيستخدمه
 *  دايلوج طباعة الملصقات عشان يحذّر لما الخط يبقى نقطة واحدة (0.125مم) على
 *  المقاسات الصغيرة زي 30×20. بيرجّع null لو ماقدرش يقيس. */
export function measureBarcodeModuleMm(
  value: string,
  availMm: number,
  format: 'EAN13' | 'CODE128' = barcodeFormatFor(value),
): number | null {
  if (!value || !(availMm > 0) || typeof document === 'undefined') return null
  const probe = document.createElementNS(svgNS, 'svg')
  try {
    JsBarcode(probe, value, { format, height: 10, width: 1, margin: 0, displayValue: false, flat: true })
  } catch {
    return null
  }
  const modules = parseFloat(probe.getAttribute('width') || '0')
  if (!modules) return null
  const quiet = format === 'EAN13' ? 6 : 8
  const raw = availMm / (modules + quiet * 2)
  const snapped = Math.floor(raw / DOT_MM) * DOT_MM
  // 🛡️ ما بنسيبش العرض تحت نقطة طابعة واحدة: خط أنحف من نقطة مش هيترسم نضيف
  // على الطابعة (بيتقري/بيختفي). لو المتاح أقل من نقطة بنثبّت نقطة واحدة —
  // الزيادة الطفيفة بتمتصها الـ quiet zones و max-width:100% في CSS.
  return Math.min(0.5, Math.max(snapped, DOT_MM))
}

/** Render a single barcode value to a standalone `<svg>...</svg>` string using
 *  the bundled `jsbarcode` package (the same lib used by the on-screen Barcode
 *  component). This is done INSIDE the app — never inside the print window —
 *  so the print document can be 100% static HTML with no JS/CDN deps.
 *
 *  Returns `''` if the value can't be encoded (rare for CODE128, which accepts
 *  any ASCII string). The print HTML builder handles this case by falling back
 *  to displaying the digits as text. */
export function renderBarcodeSvg(
  value: string,
  opts: {
    height: number
    /** عرض الوحدة بالبكسل — بيتجاهل لو `availMm` اتحدد. */
    width?: number
    fontSize: number
    displayValue: boolean
    /** العرض المتاح للباركود (شامل المساحة الهادية) بالمم — الباركود بيتحسب عشان يتسع بالظبط من غير تصغير CSS. */
    availMm?: number
  }
): string {
  if (!value) return ''

  const draw = (format: 'EAN13' | 'CODE128'): string => {
    let barWidth = opts.width ?? 1.4
    let quietPx = 0
    if (opts.availMm && opts.availMm > 0) {
      const moduleMm = measureBarcodeModuleMm(value, opts.availMm, format)
      if (moduleMm) {
        barWidth = moduleMm * MM
        quietPx = (format === 'EAN13' ? 6 : 8) * barWidth
      }
    }
    const svg = document.createElementNS(svgNS, 'svg')
    JsBarcode(svg, value, {
      format,
      height: opts.height,
      width: barWidth,
      // 🛡️ flat: بدونها خطوط الحراسة في EAN-13 بتطول عن باقي الخطوط (زيادة ~8px
      // فوق الارتفاع المطلوب) فالـ SVG يطلع أعلى من المحسوب، والمحتوى يزيد عن
      // الملصق والهوامش تتآكل من فوق ومن تحت. flat بيساوي كل الخطوط على نفس
      // الارتفاع بالظبط.
      flat: true,
      displayValue: opts.displayValue,
      fontSize: opts.fontSize,
      margin: 0,
      marginLeft: quietPx,
      marginRight: quietPx,
      background: 'transparent',
      lineColor: '#000',
    })
    return svg.outerHTML
  }

  const preferred = barcodeFormatFor(value)
  try {
    return draw(preferred)
  } catch {
    if (preferred === 'CODE128') return ''
    try {
      return draw('CODE128')
    } catch {
      return ''
    }
  }
}

/** يطبع ورقة ملصقات الباركود جوه iframe مخفي في نفس الصفحة. الباركودات مترندرة
 *  مسبقاً كـ SVG (بـ jsbarcode المدمج) وبتتم للـ `printBarcodeLabelsHtml` اللي
 *  بيطلّع مستند HTML ثابت 100% — من غير CDN ولا سكريبتات ولا رندر async —
 *  فمستحيل الورقة تطلع فاضية أو نصف مرسومة.
 *
 *  بترجّع boolean: true = أمر الطباعة انطلق (المعاينة هتظهر فوق نفس الصفحة —
 *  لو المستخدم كنسلها الصفحة تفضل شغالة ويقدر يضغط طباعة تاني فوراً)،
 *  false = الطباعة ماقدرتش تنطلق (حالة نظرية — البيئة مش متصفح). */
export function printBarcodeLabels(items: LabelItem[], opts?: LabelOptions): boolean {
  const mode = opts?.mode ?? 'sheet'
  const labelSize = opts?.labelSize ?? opts?.rollSize ?? { widthMm: 40, heightMm: 30 }
  const showName = opts?.showName ?? true
  const showPrice = opts?.showPrice ?? true
  const showBarcodeText = opts?.showBarcodeText ?? true
  const showVariant = opts?.showVariant ?? true
  const layout = computeLabelLayout(labelSize.widthMm, labelSize.heightMm, mode, {
    showName,
    showPrice,
    showBarcodeText,
    showVariant,
    nameScale: opts?.nameScale,
    priceScale: opts?.priceScale,
    barcodeScale: opts?.barcodeScale,
  })

  // Pre-render every distinct barcode value once, then reuse the SVG markup
  // for all copies. (Most print jobs use 1-3 distinct barcodes × N copies, so
  // this dedup matters for big runs of 200+ labels.)
  const svgCache = new Map<string, string>()
  const enriched: LabelItem[] = items.map((it) => {
    if (!it.barcode) return it
    let svg = svgCache.get(it.barcode)
    if (!svg) {
      svg = renderBarcodeSvg(it.barcode, {
        height: layout.barcodeHeightPx,
        availMm: layout.widthMm - layout.paddingMm * 2,
        fontSize: layout.barcodeTextFontSizePt,
        displayValue: false, // we render the digits separately for full control
      })
      svgCache.set(it.barcode, svg)
    }
    return { ...it, barcodeSvg: svg }
  })

  const html = printBarcodeLabelsHtml(enriched, { ...opts, mode, labelSize })
  // 🛡️ iframe مخفي في نفس الصفحة بدل نافذة منبثقة — الإلغاء مبيسيبش الصفحة
  // مجمدة، ومفيش نافذة فاضية تفضل مفتوحة، وحاجب النوافذ ملوش دعوة.
  return printHtmlInFrame(html, 'طباعة ملصقات الباركود')
}
