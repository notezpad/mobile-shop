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

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
