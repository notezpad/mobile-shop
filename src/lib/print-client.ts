'use client'

import { printInvoiceHtml, printBarcodeLabelsHtml, type PrintableSale, type LabelItem, type LabelOptions } from '@/lib/print'

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
}) {
  printHtml(printInvoiceHtml(sale, shop), `فاتورة ${sale.invoiceNo ?? sale.id}`)
}

/** Opens the barcode-label sheet in its own window. Unlike printHtml, this does NOT
 *  call w.print() itself — the label page renders barcodes via a CDN script and
 *  triggers window.print() on its own once that's done, so we don't print a blank/
 *  half-rendered sheet on a slow connection. */
export function printBarcodeLabels(items: LabelItem[], opts?: LabelOptions) {
  const html = printBarcodeLabelsHtml(items, opts)
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    alert('الرجاء السماح بالنوافذ المنبثقة للطباعة')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.document.title = 'طباعة ملصقات الباركود'
}
