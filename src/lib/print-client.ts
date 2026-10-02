'use client'

import JsBarcode from 'jsbarcode'
import {
  printInvoiceHtml,
  printBarcodeLabelsHtml,
  computeLabelLayout,
  type PrintableSale,
  type LabelItem,
  type LabelOptions,
} from '@/lib/print'

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
  setTimeout(() => {
    w.focus()
    w.print() // user can choose "Save as PDF" from the print dialog
  }, 300)
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
  opts: { height: number; width: number; fontSize: number; displayValue: boolean }
): string {
  if (!value) return ''
  // Use an off-DOM SVG element so we don't trigger a React re-render or affect
  // the visible page. document.createElementNS is required for SVG elements.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  try {
    JsBarcode(svg, value, {
      format: 'CODE128',
      height: opts.height,
      width: opts.width,
      displayValue: opts.displayValue,
      fontSize: opts.fontSize,
      margin: 0,
      background: 'transparent',
      lineColor: '#000',
    })
    // outerHTML gives us the full `<svg>...</svg>` string with all the <rect>
    // children JsBarcode generated.
    return svg.outerHTML
  } catch {
    return ''
  }
}

/** Opens the barcode-label sheet in its own window. Barcodes are pre-rendered
 *  to SVG strings here (using the bundled `jsbarcode`), then handed to
 *  `printBarcodeLabelsHtml` which produces a 100% static HTML document — no
 *  CDN script, no async rendering, no chance of a blank/half-rendered sheet. */
export function printBarcodeLabels(items: LabelItem[], opts?: LabelOptions) {
  const mode = opts?.mode ?? 'sheet'
  const labelSize = opts?.labelSize ?? opts?.rollSize ?? { widthMm: 40, heightMm: 30 }
  const showName = opts?.showName ?? true
  const showPrice = opts?.showPrice ?? true
  const showBarcodeText = opts?.showBarcodeText ?? true
  const layout = computeLabelLayout(labelSize.widthMm, labelSize.heightMm, mode, {
    showName,
    showPrice,
    showBarcodeText,
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
        width: layout.barcodeBarWidth,
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
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.document.title = 'طباعة ملصقات الباركود'
  // The print document is now fully static — no scripts to load, no async
  // barcode rendering to wait for. A short tick is enough for layout/paint.
  setTimeout(() => {
    w.focus()
    w.print()
  }, 250)
}
