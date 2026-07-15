'use client'

import { printInvoiceHtml, type PrintableSale } from '@/lib/print'

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
