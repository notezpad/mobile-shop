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

/** نقطة طابعة الملصقات الشائعة (203dpi) بالمم — عرض الوحدة بيتقصّ لمضاعفاتها
 *  عشان الخطوط تترسم بعدد صحيح من النقاط (مسح ثابت على الطابعة). */
export const PRINTER_DOT_MM = 0.125
/** أقل عرض وحدة مقبول عملياً: نقطتين (0.25مم). أقل من كده الخط بيتقري غالباً. */
export const MIN_SCANNABLE_MODULE_MM = 0.25
const MM = 3.78 // 1mm ≈ 3.78px @ 96dpi
const DOT_MM = PRINTER_DOT_MM
const svgNS = 'http://www.w3.org/2000/svg'

/** تجهيز نافذة الطباعة بعد كتابة الـ HTML فيها:
 *  1) زر «إغلاق النافذة» اللي في الـ HTML — الضغطة بتتركّب من هنا (مش inline onclick)
 *     عشان تشتغل تحت أي CSP.
 *  2) إغلاق تلقائي لما حوار الطباعة يتقفل (طبع فعلًا أو كنسل) عبر `onafterprint` —
 *     كان السيناريو المزعج: المستخدم يكنسل الطباعة فالنافذة تفضل مفتوحة فاضية
 *     ومبيقفلهاش غير الريفرش. لو المتصفح مادعمش afterprint، زر الإغلاق الظاهر
 *     بيغطّي الحالة دي.
 *  `autoClose: false` للنوافذ اللي المستخدم ممكن يعايز يفضل فيها (تصدير PDF/تقارير). */
function armPrintWindow(w: Window, autoClose = true) {
  try {
    w.document
      .getElementById('print-close-btn')
      ?.addEventListener('click', () => {
        try {
          w.close()
        } catch {
          /* ignore */
        }
      })
  } catch {
    /* ignore */
  }
  if (!autoClose) return
  try {
    w.onafterprint = () => {
      try {
        w.close()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Open a print window with the given HTML and trigger print dialog. */
export function printHtml(html: string, title = 'طباعة') {
  const w = window.open('', '_blank', 'width=800,height=600')
  if (!w) {
    alert('الرجاء السماح بالنوافذ المنبثقة للطباعة')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.document.title = title
  armPrintWindow(w)
  // give the browser a tick to lay out before printing
  setTimeout(() => {
    w.focus()
    w.print()
  }, 250)
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

/** Export invoice as PDF — opens the invoice in a new window with print dialog
 *  pre-configured for PDF output (no headers/footers, portrait A5). */
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

  const w = window.open('', '_blank', 'width=600,height=800')
  if (!w) { alert('الرجاء السماح بالنوافذ المنبثقة'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.document.title = `فاتورة-${sale.invoiceNo ?? sale.id}`
  // تصدير PDF: من من غير إغلاق تلقائي — المستخدم ممكن يكنسل عشان يتصفّح/يحفظ،
  // بس زر «إغلاق النافذة» الظاهر متاح دايماً.
  armPrintWindow(w, false)
  setTimeout(() => {
    w.focus()
    w.print() // user can choose "Save as PDF" from the print dialog
  }, 300)
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

/** Opens the barcode-label sheet in its own window. Barcodes are pre-rendered
 *  to SVG strings here (using the bundled `jsbarcode`), then handed to
 *  `printBarcodeLabelsHtml` which produces a 100% static HTML document — no
 *  CDN script, no async rendering, no chance of a blank/half-rendered sheet.
 *
 *  بترجّع boolean: true = النافذة اتفتحت وأمر الطباعة انطلق، false = المتصفح
 *  حجب النافذة المنبثقة — عشان الدايلوج ميتقفلش ويضيّع اختيار الكميات لما
 *  الطباعة تفشل. */
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
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    alert('الرجاء السماح بالنوافذ المنبثقة للطباعة')
    return false // الدايلوج بيفضل مفتوح والاختيارات زي ما هي
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.document.title = 'طباعة ملصقات الباركود'
  // 🛡️ نافذة الطباعة بتتقفل لوحدها لما حوار الطباعة يتقفل (طبع أو كنسل) —
  // وكانت بتفضل مفتوحة والمستخدم ميقدرش يقفلها غير الريفرش. + زر إغلاق ظاهر احتياط.
  armPrintWindow(w)
  // The print document is now fully static — no scripts to load, no async
  // barcode rendering to wait for. A short tick is enough for layout/paint.
  setTimeout(() => {
    w.focus()
    w.print()
  }, 250)
  return true
}
