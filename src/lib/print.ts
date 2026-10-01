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
  /** POS v2: invoice total BEFORE discount + the discount amount (item prices shown are the original, pre-discount ones). */
  subtotal?: number | null
  discount?: number | null
  note?: string | null
}

export interface ShopInfo {
  name?: string
  phone?: string
  address?: string
  logo?: string
  invoicePrefix?: string
}

export function fmt(n: number) {
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Keeps dates, phone numbers, and other left-to-right values readable when
 * embedded inside the app's right-to-left printable documents. */
export function printLtr(value: string | number): string {
  return `<span dir="ltr" style="display:inline-block;unicode-bidi:isolate;white-space:nowrap">${escapeHtml(String(value))}</span>`
}

/** Shared brand tokens so every printed/exported document (invoice, report,
 *  labels) looks like it came from the same professional design system. */
export const BRAND = {
  primary: '#17843f',
  primaryDark: '#0f5c2b',
  primaryLight: '#e8f6ec',
  ink: '#16211a',
  sub: '#6b7a70',
  border: '#e3e8e4',
  amber: '#b8860b',
  amberBg: '#fdf3d9',
  red: '#c0392b',
  redBg: '#fbe9e7',
  fontStack: "'Cairo','Tahoma','Segoe UI',sans-serif",
}

/** Shared print-safe base styles (A4 page setup, brand header/footer,
 *  table + badge primitives) reused by the invoice template and, via
 *  export, by the reports export builder — keeping every exported
 *  document visually consistent. */
export function baseDocStyles(): string {
  return `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ${BRAND.fontStack};
      color: ${BRAND.ink};
      background: #f4f6f4;
      -webkit-font-smoothing: antialiased;
    }
    .page { max-width: 780px; margin: 0 auto; background: #fff; padding: 30px 34px 26px; }
    .brand-bar { height: 6px; background: linear-gradient(90deg, ${BRAND.primary}, ${BRAND.primaryDark}); }
    .doc-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; padding: 20px 0 16px; border-bottom: 2px solid ${BRAND.primaryLight};
      margin-bottom: 18px;
    }
    .shop-block { display: flex; align-items: center; gap: 12px; }
    .shop-logo { height: 52px; width: 52px; object-fit: contain; border-radius: 10px; border: 1px solid ${BRAND.border}; background: #fff; }
    .shop-name { font-size: 20px; font-weight: 800; color: ${BRAND.ink}; }
    .shop-meta { font-size: 11.5px; color: ${BRAND.sub}; margin-top: 3px; line-height: 1.6; }
    .doc-meta { text-align: left; font-size: 12px; color: ${BRAND.sub}; }
    .doc-meta .doc-title { font-size: 13px; font-weight: 700; color: ${BRAND.primary}; text-transform: uppercase; letter-spacing: .04em; }
    .doc-meta .doc-no { font-size: 19px; font-weight: 800; color: ${BRAND.ink}; margin-top: 2px; }
    .doc-meta .doc-date { margin-top: 6px; }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 11px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .badge-green { background: ${BRAND.primaryLight}; color: ${BRAND.primaryDark}; }
    .badge-amber { background: ${BRAND.amberBg}; color: ${BRAND.amber}; }
    .badge-red { background: ${BRAND.redBg}; color: ${BRAND.red}; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    thead th { background: ${BRAND.primaryDark}; color: #fff; font-weight: 700; padding: 9px 8px; text-align: center; }
    thead th:first-child { border-radius: 6px 0 0 0; }
    thead th:last-child { border-radius: 0 6px 0 0; }
    tbody td { padding: 8px; text-align: center; border-bottom: 1px solid ${BRAND.border}; }
    tbody tr:nth-child(even) { background: #fafbfa; }
    .doc-footer {
      margin-top: 26px; padding-top: 14px; border-top: 1px dashed ${BRAND.border};
      text-align: center; font-size: 11px; color: ${BRAND.sub};
    }
    .doc-footer .thanks { font-size: 13px; font-weight: 700; color: ${BRAND.primary}; margin-bottom: 3px; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 0 6mm; }
      @page { size: A4; margin: 10mm 8mm; }
    }
  `
}

export function printInvoiceHtml(sale: PrintableSale, shop?: ShopInfo): string {
  const itemsRows = sale.items
    .map(
      (it, i) => `
        <tr>
          <td style="color:${BRAND.sub}">${i + 1}</td>
          <td style="text-align:right;font-weight:600">${escapeHtml(it.name)}</td>
          <td>${it.quantity}</td>
          <td>${fmt(it.price)}</td>
          <td style="font-weight:700">${fmt(it.price * it.quantity)}</td>
        </tr>`
    )
    .join('')
  const remaining = sale.total - sale.paid
  const prefix = shop?.invoicePrefix || 'INV'
  const invoiceNo = sale.invoiceNo ?? `${prefix}-${String(sale.id).padStart(6, '0')}`

  let statusBadge = `<span class="badge badge-green">مدفوعة بالكامل</span>`
  if (remaining > 0.009 && sale.paid > 0.009) statusBadge = `<span class="badge badge-amber">مدفوعة جزئياً</span>`
  else if (remaining > 0.009) statusBadge = `<span class="badge badge-red">غير مدفوعة</span>`

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>فاتورة ${escapeHtml(invoiceNo)}</title>
<style>
  ${baseDocStyles()}
  .invoice-shell { position: relative; }
  ${
    remaining > 0.009
      ? `.watermark {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        pointer-events: none; z-index: 0; overflow: hidden;
      }
      .watermark span {
        font-size: 78px; font-weight: 800; color: ${BRAND.red}; opacity: .06; transform: rotate(-28deg);
        white-space: nowrap;
      }`
      : ''
  }
  .customer-line { font-size: 12.5px; margin-bottom: 12px; background: ${BRAND.primaryLight}; border-radius: 8px; padding: 9px 12px; }
  .customer-line b { color: ${BRAND.primaryDark}; }
  .totals-wrap { display: flex; justify-content: flex-start; margin-top: 18px; }
  .totals { width: 300px; font-size: 13.5px; }
  .totals .row { display: flex; justify-content: space-between; padding: 7px 2px; border-bottom: 1px dashed ${BRAND.border}; }
  .totals .row span:last-child { font-weight: 700; }
  .totals .grand {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 8px; padding: 12px 14px; border-radius: 8px;
    background: ${BRAND.primaryDark}; color: #fff; font-weight: 800; font-size: 16px;
  }
</style>
</head>
<body>
  <div class="brand-bar"></div>
  <div class="page">
    <div class="invoice-shell">
      ${remaining > 0.009 ? `<div class="watermark"><span>غير مسدد بالكامل</span></div>` : ''}
      <div style="position:relative;z-index:1">
        <div class="doc-header">
          <div class="shop-block">
            ${shop?.logo ? `<img src="${shop.logo}" class="shop-logo" />` : ''}
            <div>
              <div class="shop-name">${escapeHtml(shop?.name || 'محل الاتصالات')}</div>
              <div class="shop-meta">
                ${shop?.phone ? `<div>تليفون: ${escapeHtml(shop.phone)}</div>` : ''}
                ${shop?.address ? `<div>${escapeHtml(shop.address)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="doc-meta">
            <div class="doc-title">فاتورة مبيعات</div>
            <div class="doc-no">${escapeHtml(invoiceNo)}</div>
            <div class="doc-date">${fmtDate(sale.createdAt)}</div>
            <div style="margin-top:8px">${statusBadge}</div>
          </div>
        </div>

        ${
          sale.customer
            ? `<div class="customer-line"><b>العميل:</b> ${escapeHtml(sale.customer.name)}${sale.customer.phone ? `&nbsp;&nbsp;|&nbsp;&nbsp; ${escapeHtml(sale.customer.phone)}` : ''}</div>`
            : ''
        }

        <table>
          <thead>
            <tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="totals-wrap">
          <div class="totals">
            ${(sale.discount ?? 0) > 0.009 && sale.subtotal != null ? `<div class="row"><span>المجموع قبل الخصم</span><span>${fmt(sale.subtotal)} ج.م</span></div><div class="row"><span>خصم</span><span style="color:${BRAND.red}">- ${fmt(sale.discount as number)} ج.م</span></div>` : ''}
            <div class="row"><span>الإجمالي</span><span>${fmt(sale.total)} ج.م</span></div>
            <div class="row"><span>المدفوع</span><span>${fmt(sale.paid)} ج.م</span></div>
            ${remaining > 0.009 ? `<div class="row"><span>المتبقي</span><span style="color:${BRAND.red}">${fmt(remaining)} ج.م</span></div>` : ''}
            <div class="grand"><span>الإجمالي النهائي</span><span>${fmt(sale.total)} ج.م</span></div>
          </div>
        </div>

        <div class="doc-footer">
          <div class="thanks">شكراً لتعاملكم معنا</div>
          <div>${escapeHtml(shop?.name || 'محل الاتصالات')} — تم إصدار الفاتورة إلكترونياً</div>
        </div>
      </div>
    </div>
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

/** Opens a new browser window, writes the given HTML into it, and triggers the
 *  print dialog once it's rendered. Shared by every "طباعة PDF" button in the app
 *  so the open/print behavior (and popup-blocked handling) is consistent everywhere. */
export function openPrintWindow(html: string, onPopupBlocked?: () => void): void {
  const w = window.open('', '_blank', 'width=800,height=600')
  if (!w) {
    onPopupBlocked?.()
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => {
    w.focus()
    w.print()
  }, 250)
}

export interface ListReportColumn {
  header: string
  /** 'right' for text columns (names, notes), 'center' (default) for numbers/dates/badges. */
  align?: 'right' | 'center'
}

export interface ListReportKpi {
  label: string
  value: string
  /** Highlights the KPI card with the brand color, for the single most important figure. */
  emphasize?: boolean
}

export interface ListReportOptions {
  /** Page title shown in the cover band, e.g. "المعاملات المالية". */
  title: string
  /** Short subtitle under the title, e.g. "سجل الإيداعات والسحوبات". */
  subtitle?: string
  columns: ListReportColumn[]
  /** Each row is pre-formatted display strings/HTML, one per column, in order. */
  rows: string[][]
  /** Optional summary cards shown under the cover band (totals, counts, balances). */
  kpis?: ListReportKpi[]
  /** Optional free-text note shown under the KPI row, e.g. active filter/date range. */
  note?: string
  emptyMessage?: string
}

/** Builds a branded, print-ready HTML report for any list-style screen (finance,
 *  cash log, maintenance, branches, users, ...). Reuses the exact same header/footer/
 *  table styling as the flagship reports export so every printed document in the app
 *  looks like it belongs to the same professional design system. */
export function printListReportHtml(opts: ListReportOptions, shop?: ShopInfo): string {
  const generatedAt = fmtDate(new Date())

  const headCells = opts.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('')
  const bodyRows = opts.rows.length
    ? opts.rows
        .map((row) => {
          const cells = row
            .map((cell, i) => {
              const align = opts.columns[i]?.align === 'right' ? 'right' : 'center'
              return `<td style="text-align:${align}${align === 'right' ? ';font-weight:600' : ''}">${cell}</td>`
            })
            .join('')
          return `<tr>${cells}</tr>`
        })
        .join('')
    : emptyRow(opts.columns.length, opts.emptyMessage || 'لا توجد بيانات لعرضها')

  const kpiHtml = opts.kpis?.length
    ? `<div class="kpi-grid">${opts.kpis
        .map(
          (k) => `
      <div class="kpi-card${k.emphasize ? ' kpi-card-big' : ''}">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-value">${escapeHtml(k.value)}</div>
      </div>`
        )
        .join('')}</div>`
    : ''

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  ${baseDocStyles()}
  .cover {
    background: linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary});
    color: #fff; border-radius: 12px; padding: 22px 26px; margin-bottom: 20px;
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
  }
  .cover .shop-logo { height: 50px; width: 50px; object-fit: contain; border-radius: 10px; background: #fff; border: none; }
  .cover-title { font-size: 21px; font-weight: 800; }
  .cover-sub { font-size: 12px; opacity: .9; margin-top: 4px; }
  .cover-meta { text-align: left; font-size: 12px; opacity: .95; }
  .cover-meta b { font-size: 14px; display: block; }
  .kpi-grid { display: grid; grid-template-columns: repeat(${Math.min(4, Math.max(1, opts.kpis?.length || 1))}, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi-card { border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 13px; background: #fafcfa; }
  .kpi-card-big { background: ${BRAND.primaryLight}; border-color: ${BRAND.primary}; }
  .kpi-label { font-size: 10.5px; color: ${BRAND.sub}; margin-bottom: 5px; }
  .kpi-value { font-size: 16.5px; font-weight: 800; color: ${BRAND.ink}; }
  .kpi-card-big .kpi-value { color: ${BRAND.primaryDark}; }
  .rpt-note { font-size: 11.5px; color: ${BRAND.sub}; background: ${BRAND.primaryLight}; border-radius: 8px; padding: 8px 12px; margin-bottom: 18px; }
  @media print {
    .doc-footer::after {
      content: "صفحة " counter(page) " من " counter(pages);
      display: block; margin-top: 4px; font-size: 10px;
    }
  }
</style>
</head>
<body>
  <div class="brand-bar"></div>
  <div class="page">
    <div class="cover">
      <div style="display:flex;align-items:center;gap:12px">
        ${shop?.logo ? `<img src="${shop.logo}" class="shop-logo" />` : ''}
        <div>
          <div class="cover-title">${escapeHtml(opts.title)}</div>
          <div class="cover-sub">${escapeHtml(shop?.name || 'محل الاتصالات')}${shop?.phone ? ` — ${escapeHtml(shop.phone)}` : ''}</div>
        </div>
      </div>
      <div class="cover-meta">
        ${opts.subtitle ? `<b>${escapeHtml(opts.subtitle)}</b>` : ''}
        تم إنشاؤه: ${generatedAt}
      </div>
    </div>

    ${kpiHtml}
    ${opts.note ? `<div class="rpt-note">${escapeHtml(opts.note)}</div>` : ''}

    <table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>

    <div class="doc-footer">
      <div class="thanks">${escapeHtml(shop?.name || 'محل الاتصالات')}</div>
      <div>تقرير آلي تم إصداره بواسطة نظام إدارة المحل — ${generatedAt}</div>
    </div>
  </div>
</body>
</html>`
}

function emptyRow(colspan: number, message: string): string {
  return `<tr><td colspan="${colspan}" style="text-align:center;color:${BRAND.sub};padding:22px 8px">${escapeHtml(message)}</td></tr>`
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
