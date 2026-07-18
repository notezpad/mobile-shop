export interface PrintableSaleItem {
  name: string
  price: number
  quantity: number
  cost?: number
}

export interface PrintableSale {
  id: number
  invoiceNo?: string | null
  total: number
  paid: number
  status?: string
  createdAt: string | Date
  items: PrintableSaleItem[]
  customer?: { name: string; phone?: string | null } | null
}

export interface ShopInfo {
  name?: string
  phone?: string
  address?: string
  logo?: string
}

function fmt(n: number) {
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function printInvoiceHtml(sale: PrintableSale, shop?: ShopInfo): string {
  const itemsRows = sale.items
    .map(
      (it, i) => `
        <tr>
          <td>${i + 1}</td>
          <td style="text-align:right">${escapeHtml(it.name)}</td>
          <td>${it.quantity}</td>
          <td>${fmt(it.price)}</td>
          <td>${fmt(it.price * it.quantity)}</td>
        </tr>`
    )
    .join('')
  const remaining = sale.total - sale.paid
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>فاتورة ${sale.invoiceNo ?? sale.id}</title>
<style>
  * { font-family: 'Cairo', 'Tahoma', sans-serif; box-sizing: border-box; }
  body { margin: 0; padding: 20px; color: #111; }
  .invoice { max-width: 720px; margin: 0 auto; border: 1px solid #ddd; padding: 24px; border-radius: 8px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2f9e44; padding-bottom: 16px; margin-bottom: 16px; gap: 12px; }
  .shop .name { font-size: 22px; font-weight: 800; color: #2f9e44; }
  .shop .meta { font-size: 12px; color: #555; margin-top: 4px; }
  .inv-info { text-align: left; font-size: 13px; }
  .inv-info .no { font-weight: 800; font-size: 18px; color: #111; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #eee; text-align: center; }
  th { background: #f5f5f5; color: #333; }
  .totals { margin-top: 16px; margin-inline-start: auto; width: 280px; font-size: 14px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd; }
  .totals .grand { font-weight: 800; font-size: 18px; color: #2f9e44; border-bottom: 2px solid #2f9e44; padding: 10px 0; }
  .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
  .badge { display: inline-block; padding: 4px 10px; background: #2f9e44; color: #fff; border-radius: 4px; font-size: 11px; }
  @media print { body { padding: 0; } .invoice { border: none; } }
</style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="shop">
        ${shop?.logo ? `<img src="${shop.logo}" style="height:48px;margin-bottom:6px" />` : ''}
        <div class="name">${escapeHtml(shop?.name || 'محل الاتصالات')}</div>
        ${shop?.phone ? `<div class="meta">تليفون: ${escapeHtml(shop.phone)}</div>` : ''}
        ${shop?.address ? `<div class="meta">${escapeHtml(shop.address)}</div>` : ''}
      </div>
      <div class="inv-info">
        <div>فاتورة رقم</div>
        <div class="no">${escapeHtml(sale.invoiceNo ?? String(sale.id))}</div>
        <div style="margin-top:6px">${fmtDate(sale.createdAt)}</div>
        ${sale.status ? `<div style="margin-top:6px"><span class="badge">${escapeHtml(sale.status)}</span></div>` : ''}
      </div>
    </div>
    ${
      sale.customer
        ? `<div style="font-size:13px;margin-bottom:8px"><strong>العميل:</strong> ${escapeHtml(sale.customer.name)} ${sale.customer.phone ? `&nbsp;|&nbsp; ${escapeHtml(sale.customer.phone)}` : ''}</div>`
        : ''
    }
    <table>
      <thead>
        <tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>الإجمالي</span><span>${fmt(sale.total)} ج.م</span></div>
      <div class="row"><span>المدفوع</span><span>${fmt(sale.paid)} ج.م</span></div>
      ${remaining > 0 ? `<div class="row"><span>المتبقي</span><span>${fmt(remaining)} ج.م</span></div>` : ''}
      <div class="row grand"><span>الإجمالي النهائي</span><span>${fmt(sale.total)} ج.م</span></div>
    </div>
    <div class="footer">شكراً لتعاملكم معنا — ${escapeHtml(shop?.name || 'محل الاتصالات')}</div>
  </div>
</body>
</html>`
}

export interface LabelItem {
  name: string
  barcode: string
  price?: number
  quantity: number
}

export interface LabelOptions {
  showPrice?: boolean
  columns?: number
  /** 'sheet' = grid of labels on a normal A4 page (cut by hand or use pre-cut sticker paper).
   *  'roll'  = one label per printed page, sized exactly to the label — for thermal label
   *            printers (Xprinter/TSC/Zebra-type) that are installed as a normal Windows
   *            printer and just need the page size to match the sticker exactly. */
  mode?: 'sheet' | 'roll'
  /** Physical label size in mm, only used when mode === 'roll'. */
  rollSize?: { widthMm: number; heightMm: number }
}

/** Builds a self-contained printable HTML page of barcode labels.
 *  Barcodes are rendered client-side (inside the print window itself) via JsBarcode
 *  loaded from a CDN, since this HTML is opened in a brand-new window/document that
 *  has no access to the app's React tree or bundled JS. */
export function printBarcodeLabelsHtml(items: LabelItem[], opts: LabelOptions = {}): string {
  const { showPrice = true, columns = 3, mode = 'sheet', rollSize = { widthMm: 40, heightMm: 30 } } = opts

  const flat: { name: string; barcode: string; price?: number }[] = []
  items.forEach((it) => {
    const copies = Math.max(1, Math.floor(it.quantity) || 1)
    for (let i = 0; i < copies; i++) {
      flat.push({ name: it.name, barcode: it.barcode, price: it.price })
    }
  })

  const labelsHtml = flat
    .map(
      (f) => `
    <div class="label">
      <div class="lbl-name">${escapeHtml(f.name)}</div>
      <svg class="lbl-barcode" data-barcode="${escapeHtml(f.barcode)}"></svg>
      ${showPrice && f.price != null ? `<div class="lbl-price">${fmt(f.price)} ج.م</div>` : ''}
    </div>`
    )
    .join('')

  const pageCss =
    mode === 'roll'
      ? `
  @page { size: ${rollSize.widthMm}mm ${rollSize.heightMm}mm; margin: 0; }
  body { margin: 0; padding: 0; }
  .sheet { display: block; }
  .label {
    width: ${rollSize.widthMm}mm;
    height: ${rollSize.heightMm}mm;
    border: none;
    border-radius: 0;
    break-after: page;
    page-break-after: always;
  }
  .label:last-child { break-after: auto; page-break-after: auto; }
  `
      : `
  body { margin: 0; padding: 6mm; }
  .sheet { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 3mm; }
  .label { border: 1px dashed #bbb; border-radius: 2mm; height: 26mm; }
  @media print {
    body { padding: 3mm; }
    .label { border: none; }
    @page { margin: 6mm; }
  }
  `

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>طباعة ملصقات الباركود</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js"></script>
<style>
  * { font-family: 'Tahoma', sans-serif; box-sizing: border-box; }
  .label {
    padding: 1mm;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .lbl-name {
    font-size: 9px;
    font-weight: 700;
    margin-bottom: 1mm;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lbl-barcode { width: 92%; }
  .lbl-price { font-size: 10px; font-weight: 800; margin-top: 1mm; }
  .empty-msg { padding: 40px; text-align: center; color: #888; font-size: 14px; }
  ${pageCss}
</style>
</head>
<body>
  ${
    flat.length > 0
      ? `<div class="sheet">${labelsHtml}</div>`
      : `<div class="empty-msg">لا توجد ملصقات لطباعتها</div>`
  }
  <script>
    window.addEventListener('load', function () {
      document.querySelectorAll('.lbl-barcode').forEach(function (svg) {
        var val = svg.getAttribute('data-barcode')
        try {
          JsBarcode(svg, val, {
            format: 'CODE128',
            height: 30,
            width: 1.3,
            fontSize: 10,
            displayValue: true,
            margin: 2,
          })
        } catch (e) { /* invalid value for this format — leave blank */ }
      })
      setTimeout(function () { window.print() }, 200)
    })
  </script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
