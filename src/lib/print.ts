import { printHtmlInFrame } from '@/lib/print-frame'
import type { LabelDesign, LabelElement } from '@/lib/label-design'
import { maxLinesFor, alignOf } from '@/lib/label-design'

export interface PrintableSaleItem {
  name: string
  price: number
  quantity: number
  cost?: number
  /** 🧾 IMEI/سيريال الجهاز المباع (سطر لكل جهاز) — بيتطبع تحت اسم الصنف */
  serials?: string | null
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
  invoicePrefix?: string
  /** 🧾 التحديث 28: كلام أسفل الفاتورة (شروط الضمان...) — '' = بدون */
  terms?: string
}

export function fmt(n: number) {
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** تنسيق مبالغ الفاتورة: أرقام عربية بدون أصفار زيادة (١٥٬٠٠٠ بدل ١٥٬٠٠٠٫٠٠) */
function fmtInv(n: number): string {
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

/** سعر الملصق بأرقام إنجليزية — متسق مع رقم الباركود المطبوع تحته (والمعاينة بتستخدمه برضه). */
export function fmtLabelPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 🕐 مساعد: يعيد أجزاء التاريخ/الوقت بتوقيت القاهرة (Africa/Cairo = UTC+2) بغض النظر عن timezone السيرفر */
function cairoparts(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(date).map(({ type, value }) => [type, value]))
  return p  // { year, month, day, hour, minute }
}

export function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const p = cairoparts(date)
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`
}

/** التاريخ فقط — YYYY/MM/DD (بتوقيت القاهرة) */
export function fmtDateOnly(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const p = cairoparts(date)
  return `${p.year}/${p.month}/${p.day}`
}

/** الوقت فقط — HH:MM صباحاً/مساءً (بتوقيت القاهرة) */
export function fmtTimeOnly(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const p = cairoparts(date)
  const h = parseInt(p.hour, 10)
  const suffix = h < 12 ? 'صباحاً' : 'مساءً'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const hh = String(h12).padStart(2, '0')
  return `${hh}:${p.minute} ${suffix}`
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
    /* 🧾 التحديث 28: كلام الفاتورة الحر (شروط الضمان...) — بين «شكراً» وسطر اسم المحل */
    .doc-terms {
      margin: 6px auto 4px; max-width: 92%;
      font-size: 10.5px; line-height: 1.65; color: ${BRAND.ink}; opacity: .85;
      background: ${BRAND.primaryLight}; border-radius: 6px; padding: 7px 10px;
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 0 6mm; }
      @page { size: A4; margin: 10mm 8mm; }
    }
  `
}

/** شريط صغير بزر «إغلاق النافذة» بيتحطّ في مستندات الطباعة — يظهر على الشاشة فقط
 *  ومش بيتطبع (@media print بيخفيه). تاريخياً كان ل النوافذ المنبثقة؛ دلوقتي
 *  الطباعة بتمرّ جوه iframe مخفي (print-frame.ts) فالشريط ده بيبقى مخفي فعلياً
 *  جوّه الإطار — بنسيبه في الـ HTML للتوافق مع أي عرض خارجي للمستند. */
export function printCloseBarHtml(): string {
  return `
  <div id="print-close-bar" dir="rtl" style="position:fixed;bottom:14px;inset-inline-end:14px;z-index:9999;">
    <button id="print-close-btn" type="button"
      style="font-family:inherit;font-size:13px;font-weight:700;color:#16211a;background:#fff;border:1px solid #e3e8e4;border-radius:10px;padding:9px 14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.14);">
      ✕&nbsp; إغلاق النافذة
    </button>
  </div>
  <style>@media print { #print-close-bar { display: none !important; } }</style>`
}

/** 🧾 استايل "أسود/دهبي" (Tajawal) — منفصل عمدًا عن BRAND/baseDocStyles المشتركين
 *  مع التقارير وملفات الإكسل، عشان تغيير شكل الفاتورة ما يأثرش عليهم. */
/** 🧾 سطر/أسطر IMEI تحت اسم الصنف — خط صغير ورمادي خفيف */
function serialsHtml(serials?: string | null): string {
  const list = (serials ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  if (list.length === 0) return ''
  return list
    .map(
      (s) =>
        `<div style="font-size:9px;font-weight:600;color:#9ca3af;margin-top:4px;direction:ltr;text-align:right;letter-spacing:.3px;font-family:'Courier New',monospace">IMEI: ${escapeHtml(s)}</div>`
    )
    .join('')
}

export function printInvoiceHtml(sale: PrintableSale, shop?: ShopInfo): string {
  const GOLD = '#d4af37'
  const INK = '#111111'
  const INK_SOFT = '#1a1a1a'

  const itemsRows = sale.items
    .map(
      (it, i) => `
        <tr>
          <td style="color:#9ca3af">${i + 1}</td>
          <td style="text-align:right;font-weight:800;color:${INK}">${escapeHtml(it.name)}${serialsHtml(it.serials)}</td>
          <td class="center">${it.quantity}</td>
          <td class="num">${fmtInv(it.price)} جنيه</td>
          <td class="num" style="color:#b45309;font-weight:800">${fmtInv(it.price * it.quantity)} جنيه</td>
        </tr>`
    )
    .join('')

  const remaining = sale.total - sale.paid
  const prefix = shop?.invoicePrefix || 'INV'
  const invoiceNo = sale.invoiceNo ?? `${prefix}-${String(sale.id).padStart(6, '0')}`

  let statusLabel = '✔️ مدفوعة بالكامل'
  let statusColor = '#10b981'
  if (remaining > 0.009 && sale.paid > 0.009) { statusLabel = '◐ مدفوعة جزئياً'; statusColor = GOLD }
  else if (remaining > 0.009) { statusLabel = '✕ غير مدفوعة'; statusColor = '#ef4444' }

  // 🧠 حجم خط اسم المحل يتقلص تدريجياً مع طول الاسم — يمنع الاقتطاع بـ ellipsis
  const shopName = shop?.name || 'محل الاتصالات'
  const brandNameFontPx = (() => {
    const len = shopName.length
    if (len <= 10) return 26
    if (len <= 14) return 23
    if (len <= 18) return 20
    if (len <= 22) return 18
    if (len <= 26) return 16
    if (len <= 32) return 14
    return 12
  })()

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>فاتورة ${escapeHtml(invoiceNo)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; background: #d1d5db; font-family: 'Tajawal','Cairo','Tahoma','Segoe UI',sans-serif; color: ${INK}; }
  .mc-wrap { width: 850px; max-width: 100%; margin: 0 auto; background: #fff; position: relative; overflow: hidden; }
  .mc-top { height: 6px; background: linear-gradient(90deg, ${GOLD} 0%, #f4e8c1 50%, ${GOLD} 100%); }
  .mc-header { display: flex; justify-content: space-between; align-items: stretch; background: ${INK}; color: #fff; }
  .mc-brand { padding: 20px 30px; flex: 1; min-width: 0; border-left: 1px solid #333; display: flex; flex-direction: row; align-items: center; gap: 18px; }
  .mc-brand-text { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; flex: 1; min-width: 0; }
  .mc-brand h1 { font-weight: 900; color: ${GOLD}; margin-bottom: 6px; letter-spacing: .5px; text-shadow: 1px 1px 3px rgba(0,0,0,.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .mc-logo { width: 72px; height: 72px; object-fit: contain; border-radius: 12px; border: 2px solid ${GOLD}; background: #fff; flex-shrink: 0; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
  .mc-meta-note { font-size: 11.5px; color: #d1d5db; margin-top: 3px; line-height: 1.6; }
  .mc-phone-badge { display: inline-flex; align-items: center; gap: 6px; background: ${GOLD}; color: ${INK}; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 900; margin-top: 8px; }
  .mc-meta { padding: 20px 30px; width: 300px; background: ${INK_SOFT}; display: flex; flex-direction: column; justify-content: center; }
  .mc-meta-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; border-bottom: 1px dashed #444; padding-bottom: 6px; }
  .mc-meta-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .mc-meta-row span:first-child { color: #9ca3af; font-weight: 500; }
  .mc-meta-row span:last-child { color: #fff; font-weight: 700; }
  .mc-customer { background: #f9fafb; border-bottom: 2px solid ${GOLD}; padding: 14px 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .mc-customer h4 { font-size: 11px; color: #6b7280; font-weight: 700; margin-bottom: 5px; }
  .mc-customer p { font-size: 13.5px; font-weight: 800; color: ${INK}; }
  .mc-customer .dotted { color: #9ca3af; font-weight: 400; }
  .mc-items { padding: 20px 30px; position: relative; z-index: 1; }
  .mc-items table { width: 100%; border-collapse: collapse; }
  .mc-items th { background: ${INK}; color: ${GOLD}; padding: 10px; font-size: 13px; font-weight: 700; text-align: center; }
  .mc-items th:nth-child(2) { text-align: right; }
  .mc-items td { padding: 14px 8px; border-bottom: 2px solid #f3f4f6; font-size: 13px; vertical-align: middle; }
  .mc-items td.center { text-align: center; }
  .mc-items td.num { text-align: center; }
  /* 🧾 Totals — layout جديد: المجاميع تأخذ نصف العرض اليمين، النوتة تملأ اليسار */
  .mc-totals-wrap { display: flex; align-items: stretch; padding: 0 30px 16px; gap: 24px; }
  .mc-totals { flex: 0 0 44%; min-width: 260px; display: flex; flex-direction: column; justify-content: flex-end; }
  .mc-totals .row { display: flex; align-items: baseline; gap: 6px; padding: 9px 0; font-size: 13.5px; color: #4b5563; font-weight: 700; border-bottom: 1px solid #e5e7eb; }
  .mc-totals .row-label, .mc-totals .row-value { flex-shrink: 0; white-space: nowrap; }
  .mc-totals .row-leader { flex: 1; min-width: 12px; border-bottom: 2px dotted #c9ced3; margin-bottom: 3px; }
  .mc-totals .grand { display: flex; justify-content: space-between; align-items: center; background: ${INK}; color: ${GOLD}; padding: 14px 18px; border-radius: 0; font-size: 19px; font-weight: 900; margin-top: 10px; }
  .mc-totals .grand span:last-child { color: #fff; }
  .mc-totals-note { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; opacity: .5; border-right: 2px dashed #e5e7eb; padding-right: 24px; }
  .mc-totals-note .tn-icon { font-size: 32px; }
  .mc-totals-note .tn-text { font-size: 12px; font-weight: 800; color: ${INK}; text-align: center; line-height: 1.7; }
  .mc-totals-note .tn-divider { width: 50px; height: 2px; background: linear-gradient(90deg, ${GOLD}, transparent); border-radius: 2px; }
  /* 🛡️ قسم الضمان والشروط — مُصحَّح: mc-terms أولاً ثم mc-terms.empty لضمان الـ cascade الصحيح */
  .mc-terms { background: linear-gradient(135deg, #f9fafb 0%, #f0f4f0 100%); border-top: 2px solid ${GOLD}; border-bottom: 1px solid #e5e7eb; padding: 14px 30px; }
  .mc-terms-header { font-size: 12.5px; font-weight: 900; color: ${INK}; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px dashed #d9ddd9; padding-bottom: 7px; }
  .mc-terms-body { font-size: 11.5px; color: #374151; line-height: 1.85; }
  .mc-terms-line { display: flex; align-items: flex-start; gap: 7px; padding: 1.5px 0; }
  .mc-terms-line::before { content: '◈'; color: ${GOLD}; font-size: 10px; flex-shrink: 0; margin-top: 3px; }
  .mc-terms.empty { font-size: 11.5px; color: #9ca3af; font-style: italic; }
  .mc-footer { padding: 18px 30px; display: flex; justify-content: space-between; align-items: flex-end; }
  .mc-sign { display: flex; align-items: flex-end; gap: 12px; }
  .mc-sign p { font-size: 12px; color: #6b7280; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .mc-sign-line { flex: 1; min-width: 120px; width: 180px; border-bottom: 2px dashed #9ca3af; }
  .mc-thanks { text-align: center; }
  .mc-thanks .big { font-size: 18px; font-weight: 900; color: ${GOLD}; margin-bottom: 3px; }
  .mc-thanks .sub { font-size: 11px; color: #9ca3af; font-weight: 700; }
  .mc-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; overflow: hidden; }
  .mc-watermark span { font-size: 70px; font-weight: 800; color: #ef4444; opacity: .07; transform: rotate(-28deg); white-space: nowrap; }
  @media print {
    html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
    .mc-wrap { width: 100% !important; max-width: none !important; margin: 0 !important; }
    /* الهوامش تتحكم بها @page فقط — مش body padding — عشان يتسع لأقصى عرض */
    @page { size: A4; margin: 8mm 10mm; }
  }
</style>
</head>
<body>
  <div class="mc-wrap">
    <div class="mc-top"></div>
    <div class="mc-header">
      <div class="mc-brand">
        ${shop?.logo ? `<img src="${shop.logo}" class="mc-logo" alt="لوجو المحل" />` : ''}
        <div class="mc-brand-text">
          <h1 style="font-size:${brandNameFontPx}px">${escapeHtml(shopName)}</h1>
          ${shop?.address ? `<div class="mc-meta-note">${escapeHtml(shop.address)}</div>` : ''}
          ${shop?.phone ? `<div class="mc-phone-badge" dir="ltr"><span>📞</span><span>${escapeHtml(shop.phone)}</span></div>` : ''}
        </div>
      </div>
      <div class="mc-meta">
        <div class="mc-meta-row"><span>رقم الفاتورة:</span><span dir="ltr">${escapeHtml(invoiceNo)}</span></div>
        <div class="mc-meta-row"><span>التاريخ:</span><span dir="ltr">${fmtDateOnly(sale.createdAt)}</span></div>
        <div class="mc-meta-row"><span>الوقت:</span><span dir="ltr">${fmtTimeOnly(sale.createdAt)}</span></div>
        <div class="mc-meta-row"><span>الحالة:</span><span style="color:${statusColor}">${statusLabel}</span></div>
      </div>
    </div>

    <div class="mc-customer">
      <div>
        <h4>بيانات العميل</h4>
        <p>${sale.customer ? escapeHtml(sale.customer.name) : '<span class="dotted">......................................</span>'}</p>
      </div>
      <div>
        <h4>رقم الهاتف</h4>
        <p>${sale.customer?.phone ? escapeHtml(sale.customer.phone) : '<span class="dotted">.................</span>'}</p>
      </div>
    </div>

    <div class="mc-items">
      ${remaining > 0.009 ? `<div class="mc-watermark"><span>غير مسدد بالكامل</span></div>` : ''}
      <table>
        <thead><tr><th style="width:36px">#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </div>

    <div class="mc-totals-wrap">
      <div class="mc-totals">
        <div class="row"><span class="row-label">الإجمالي</span><span class="row-leader"></span><span class="row-value">${fmtInv(sale.total)} جنيه</span></div>
        <div class="row"><span class="row-label">المدفوع</span><span class="row-leader"></span><span class="row-value">${fmtInv(sale.paid)} جنيه</span></div>
        ${remaining > 0.009 ? `<div class="row"><span class="row-label">المتبقي</span><span class="row-leader"></span><span class="row-value" style="color:#ef4444">${fmtInv(remaining)} جنيه</span></div>` : ''}
        <div class="grand">
          <span>${remaining > 0.009 ? 'المدفوع فعلياً' : 'الإجمالي النهائي'}</span>
          <span>${fmtInv(remaining > 0.009 ? sale.paid : sale.total)} جنيه</span>
        </div>
      </div>
      <div class="mc-totals-note">
        <div class="tn-icon">🤝</div>
        <div class="tn-divider"></div>
        <div class="tn-text">نقدر ثقتكم<br/>ونسعى دائماً<br/>لخدمتكم</div>
      </div>
    </div>

    ${
      shop?.terms
        ? (() => {
            const lines = escapeHtml(shop.terms)
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0)
              .map(l => `<div class="mc-terms-line"><span>${l}</span></div>`)
              .join('')
            return `<div class="mc-terms">
              <div class="mc-terms-header">🛡️ الضمان والشروط</div>
              <div class="mc-terms-body">${lines}</div>
            </div>`
          })()
        : `<div class="mc-terms empty" style="padding:12px 30px;font-size:11.5px;">🛡️ لم يتم إضافة شروط ضمان بعد — أضفها من الإعدادات ← «كلام أسفل الفاتورة» لتظهر هنا تلقائيًا في كل فاتورة.</div>`
    }

    <div class="mc-footer">
      <div class="mc-sign"><p>توقيع البائع / ختم المحل</p><div class="mc-sign-line"></div></div>

      <div class="mc-thanks">
        <div class="big">شكراً لتعاملكم معنا</div>
        <div class="sub">${escapeHtml(shop?.name || 'محل الاتصالات')} — تم إصدار الفاتورة إلكترونياً</div>
      </div>
      <div style="width:150px"></div>
    </div>
  </div>
  ${printCloseBarHtml()}
</body>
</html>`
}

export interface LabelItem {
  name: string
  barcode: string
  price?: number
  quantity: number
  /** 🎨 المقاس (ملابس) — بيتطبع سطر مستقل تحت الاسم لو `showVariant` مفعل. */
  size?: string | null
  /** 🎨 اللون — بيتطبع مع المقاس في نفس السطر. */
  color?: string | null
  /** Pre-rendered SVG markup for the barcode (the full `<svg>...</svg>` string),
   *  produced by `renderBarcodeSvg()` in print-client.ts. When provided, the print
   *  document uses this SVG directly — no CDN, no JS, no async rendering — so the
   *  print window can never end up blank or half-rendered. */
  barcodeSvg?: string
}

export interface LabelOptions {
  showName?: boolean
  showPrice?: boolean
  /** Show the barcode digits below the bars (e.g. "2000000000017"). */
  showBarcodeText?: boolean
  /** 'sheet' = grid of labels on a normal A4 page (cut by hand or use pre-cut sticker paper).
   *  'roll'  = one label per printed page, sized exactly to the label — for thermal label
   *            printers (Xprinter/TSC/Zebra-type) that are installed as a normal Windows
   *            printer and just need the page size to match the sticker exactly. */
  mode?: 'sheet' | 'roll'
  /** Physical label size in mm — used for BOTH modes. In roll mode this is also the
   *  page size; in sheet mode this is the size of each individual sticker on the A4
   *  sheet, and the grid is computed automatically from this. */
  labelSize?: { widthMm: number; heightMm: number }
  /** @deprecated kept for backward compat — use `labelSize` instead. */
  rollSize?: { widthMm: number; heightMm: number }
  /** 🎚️ حجم اسم المنتج كنسبة من الحجم التلقائي (0.6–1.6، الافتراضي 1 = تلقائي). */
  nameScale?: number
  /** 🎚️ حجم السعر كنسبة من الحجم التلقائي (0.6–1.6، الافتراضي 1 = تلقائي). */
  priceScale?: number
  /** 🎚️ طول خطوط الباركود كنسبة من أقصى ارتفاع متاح (0.5–1، الافتراضي 1 = أقصى ارتفاع). */
  barcodeScale?: number
  /** 👕 طباعة سطر «المقاس واللون» للمتغيرات/الملابس (الافتراضي true). */
  showVariant?: boolean
  /** 🖨️ اللغة المباشرة للطابعات الحرارية — تُهمل في نافذة المتصفح، تُستخدم في `printBarcodeLabelsDirect`. */
  directLang?: 'tspl' | 'zpl'
  /** 🎨 التحديث 27: تصميم حر (سحب وإفلات) — لو موجود بيتجاهل كل مفاتيح
   *  الظهور (show*) والأحجام (scales) والتخطيط التلقائي، وبيطبع العناصر
   *  في مواضعها المحددة بالمليمتر. شوف src/lib/label-design.ts. */
  design?: LabelDesign
}

/** line-height والهوامش الرأسية (مم) لعناصر الملصق — مشتركة بين حساب التخطيط وCSS الطباعة والمعاينة
 *  (لو اتغيّرت هنا لازم تتغير في الاتنين، وعشان كده بتتقرا منها مباشرة). */
export const LABEL_LH = { name: 1.15, text: 1.2, price: 1.2, variant: 1.15 } as const
export const LABEL_GAP_MM = { name: 0.6, text: 0.4, price: 0.6, variant: 0.3 } as const

/** A4 page dimensions in mm. Used to compute the label grid in sheet mode. */
export const A4 = { widthMm: 210, heightMm: 297 }

export interface LabelLayout {
  widthMm: number
  heightMm: number
  /** Internal padding (mm) on each side of the label content. */
  paddingMm: number
  /** Font size (pt) for the product name line. */
  nameFontSizePt: number
  /** Max number of lines the name can wrap to before being truncated. */
  nameMaxLines: number
  /** Barcode bar height (px) passed to JsBarcode. */
  barcodeHeightPx: number
  /** Font size (pt) for the barcode digits text (when shown). */
  barcodeTextFontSizePt: number
  /** Font size (pt) for the price line. */
  priceFontSizePt: number
  /** 👕 Font size (pt) for the size/color (variant) line. */
  variantFontSizePt: number
  /** A4 grid layout — only meaningful in sheet mode. */
  sheet?: {
    columns: number
    rows: number
    /** Horizontal gap (mm) between labels = cut margin. */
    gapXMm: number
    /** Vertical gap (mm) between labels = cut margin. */
    gapYMm: number
    /** Outer page margin (mm) applied to the A4 sheet. */
    pageMarginMm: number
    /** Total labels per A4 sheet. */
    perSheet: number
  }
}

/** Compute the label layout (font sizes, barcode size, padding, A4 grid) from
 *  the physical label dimensions AND which elements are shown. Used by both
 *  print-client.ts (to know what barcode size to pre-render) and
 *  printBarcodeLabelsHtml (to lay out each label and the A4 sheet grid).
 *
 *  The layout is content-aware: if `showName` / `showBarcodeText` / `showPrice`
 *  are off, the freed-up vertical space goes to the barcode so it scans better.
 *  All sizes are computed in mm first (so they correspond to physical paper),
 *  then converted to pt (1mm ≈ 2.83pt) or px (1mm ≈ 3.78px @ 96dpi) as needed. */
export function computeLabelLayout(
  widthMm: number,
  heightMm: number,
  mode: 'sheet' | 'roll' = 'roll',
  opts: {
    showName?: boolean
    showPrice?: boolean
    showBarcodeText?: boolean
    /** 👕 حجز ارتفاع لسطر المقاس/اللون (الافتراضي true — الملصقات اللي ملهاش مقاس مش بتأثر). */
    showVariant?: boolean
    /** 🎚️ حجم اسم المنتج كنسبة من التلقائي (0.6–1.6) — تحكّم المستخدم من الدايلوج. */
    nameScale?: number
    /** 🎚️ حجم السعر كنسبة من التلقائي (0.6–1.6). */
    priceScale?: number
    /** 🎚️ طول خطوط الباركود كنسبة من أقصى ارتفاع متاح (0.5–1). */
    barcodeScale?: number
  } = {}
): LabelLayout {
  const { showName = true, showPrice = true, showBarcodeText = true, showVariant = true } = opts
  // تحكّم المستخدم — بيتكلَم قبل حلقة التصغير التلقائية، فلو كبّر الخط أكتر من
  // اللي الملصق بيحتمل، الحلقة تصغّر الكل نسبةً وتحافظ على قراءة الباركود.
  const clampScale = (v: number | undefined, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 1
  const nameScale = clampScale(opts.nameScale, 0.6, 1.6)
  const priceScale = clampScale(opts.priceScale, 0.6, 1.6)
  const barcodeScale = clampScale(opts.barcodeScale, 0.5, 1)

  // Padding: ~6% of the smaller dimension, clamped to 1–2.5mm so the content
  // never crowds the label edge on small stickers.
  const paddingMm = Math.max(1, Math.min(2.5, Math.round(Math.min(widthMm, heightMm) * 0.06 * 10) / 10))

  // Available content height = label height − top/bottom padding.
  const contentH = Math.max(4, heightMm - paddingMm * 2)

  // Name lines: tiny labels get 1 line, roomy labels get 2.
  let nameMaxLines = showName ? (heightMm < 24 ? 1 : 2) : 1

  // الأحجام الأساسية (pt) من ارتفاع الملصق. الارتفاع الفعلي لكل عنصر =
  // حجم الخط × line-height (نفس القيم المثبّتة في CSS الطباعة والمعاينة) + الهامش —
  // ده اللي كان ناقص: الحجز القديم كان بيحسب سطر واحد من غير line-height،
  // فالمحتوى يزيد عن الملصق ويتقص من فوق ومن تحت.
  const PT_MM = 25.4 / 72
  const baseName = Math.max(6, Math.min(12, Math.round(Math.max(2.5, Math.min(5, heightMm * 0.13)) * 2.83)))
  const baseText = Math.max(5.5, Math.min(10, Math.round(Math.max(2, Math.min(3.5, heightMm * 0.09)) * 2.83)))
  const basePrice = Math.max(7, Math.min(13, Math.round(Math.max(2.5, Math.min(4.5, heightMm * 0.12)) * 2.83)))

  const textMm = (scale: number, lines: number) =>
    (showName ? baseName * nameScale * scale * PT_MM * LABEL_LH.name * lines + LABEL_GAP_MM.name : 0) +
    (showVariant ? baseText * 1.1 * scale * PT_MM * LABEL_LH.variant + LABEL_GAP_MM.variant : 0) +
    (showBarcodeText ? baseText * scale * PT_MM * LABEL_LH.text + LABEL_GAP_MM.text : 0) +
    (showPrice ? basePrice * priceScale * scale * PT_MM * LABEL_LH.price + LABEL_GAP_MM.price : 0)

  const MIN_BARCODE_MM = 5
  const COMFY_BARCODE_MM = 8
  let scale = 1
  let barcodeMm = contentH - textMm(scale, nameMaxLines)
  // 1) لو الباركود ضيّق: الاسم يبقى سطر واحد
  if (barcodeMm < COMFY_BARCODE_MM && nameMaxLines === 2) {
    nameMaxLines = 1
    barcodeMm = contentH - textMm(scale, nameMaxLines)
  }
  // 2) لسه ضيّق: نصغّر الخطوط تدريجياً (حد أدنى ~60%) لحد ما الباركود ياخد 5مم على الأقل
  while (barcodeMm < MIN_BARCODE_MM && scale > 0.6) {
    scale = Math.round((scale - 0.05) * 100) / 100
    barcodeMm = contentH - textMm(scale, nameMaxLines)
  }
  // الباركود ياخد الباقي بالظبط — مفيش تجاوز لارتفاع الملصق
  barcodeMm = Math.max(3, barcodeMm)
  // 🎚️ طول الخطوط اللي حدده المستخدم: نسبة من المساحة المتاحة — الفرق بيفضل فراغ
  // والمحتوى متوسّط رأسياً (flex center) فالشكل بيفضل مرتب. الحلقة اللي فوق بتضمن
  // إن المساحة المتاحة نفسها كافية للقراءة قبل ما نضرب في النسبة.
  barcodeMm = Math.max(3, Math.round(barcodeMm * barcodeScale * 100) / 100)
  const barcodeHeightPx = Math.floor(barcodeMm * 3.78)

  const r1 = (n: number) => Math.round(n * 10) / 10
  const nameFontSizePt = r1(baseName * nameScale * scale)
  const barcodeTextFontSizePt = r1(baseText * scale)
  const priceFontSizePt = r1(basePrice * priceScale * scale)
  const variantFontSizePt = r1(baseText * 1.1 * scale)

  let sheet: LabelLayout['sheet']
  if (mode === 'sheet') {
    // A4 = 210 × 297 mm. Pick a sensible page margin and gap, then fit the grid.
    const pageMarginMm = 7
    const gapXMm = 3
    const gapYMm = 3
    const availW = A4.widthMm - pageMarginMm * 2
    const availH = A4.heightMm - pageMarginMm * 2
    const columns = Math.max(1, Math.floor((availW + gapXMm) / (widthMm + gapXMm)))
    const rows = Math.max(1, Math.floor((availH + gapYMm) / (heightMm + gapYMm)))
    sheet = { columns, rows, gapXMm, gapYMm, pageMarginMm, perSheet: columns * rows }
  }

  return {
    widthMm,
    heightMm,
    paddingMm,
    nameFontSizePt,
    nameMaxLines,
    barcodeHeightPx,
    barcodeTextFontSizePt,
    priceFontSizePt,
    variantFontSizePt,
    sheet,
  }
}

/** Builds a self-contained printable HTML page of barcode labels.
 *
 *  Each label's barcode is supplied as a pre-rendered `<svg>...</svg>` string
 *  in `LabelItem.barcodeSvg` (produced by `renderBarcodeSvg()` in print-client.ts
 *  using the bundled `jsbarcode` package). This means the print document has
 *  ZERO JavaScript dependencies and ZERO network requests — barcodes appear
 *  instantly when the page loads, so the print dialog can never fire on a
 *  blank/half-rendered sheet (which was the main cause of "white pages" with
 *  the old CDN-based approach). */
export function printBarcodeLabelsHtml(items: LabelItem[], opts: LabelOptions = {}): string {
  const {
    showName = true,
    showPrice = true,
    showBarcodeText = true,
    showVariant = true,
    mode = 'sheet',
  } = opts
  const labelSize = opts.labelSize ?? opts.rollSize ?? { widthMm: 40, heightMm: 30 }
  const layout = computeLabelLayout(labelSize.widthMm, labelSize.heightMm, mode, {
    showName,
    showPrice,
    showBarcodeText,
    showVariant,
    nameScale: opts.nameScale,
    priceScale: opts.priceScale,
    barcodeScale: opts.barcodeScale,
  })

  const flat: LabelItem[] = []
  items.forEach((it) => {
    const copies = Math.max(1, Math.floor(it.quantity) || 1)
    for (let i = 0; i < copies; i++) {
      flat.push({ ...it })
    }
  })

  const buildLabelHtml = (f: LabelItem) => {
    const parts: string[] = []
    if (showName) {
      parts.push(
        `<div class="lbl-name" style="-webkit-line-clamp:${layout.nameMaxLines}">${escapeHtml(f.name)}</div>`
      )
    }
    // 👕 سطر المقاس/اللون — الملصقات اللي ملهاش مقاس/لون مش بيطبعلها السطر ده
    if (showVariant && (f.size || f.color)) {
      const v = [f.size, f.color].filter((x) => !!x && String(x).trim()).join(' · ')
      if (v) parts.push(`<div class="lbl-variant">${escapeHtml(v)}</div>`)
    }
    if (f.barcodeSvg) {
      parts.push(`<div class="lbl-barcode-wrap">${f.barcodeSvg}</div>`)
    } else if (f.barcode) {
      // Fallback: if no pre-rendered SVG, show the digits as text. Should never
      // happen in practice (print-client.ts always renders), but we never want
      // a totally blank label.
      parts.push(`<div class="lbl-barcode-fallback" dir="ltr">${escapeHtml(f.barcode)}</div>`)
    }
    if (showBarcodeText && f.barcode) {
      parts.push(`<div class="lbl-barcode-text" dir="ltr">${escapeHtml(f.barcode)}</div>`)
    }
    if (showPrice && f.price != null) {
      parts.push(`<div class="lbl-price">${fmtLabelPrice(f.price)} ج.م</div>`)
    }
    return `<div class="label">${parts.join('')}</div>`
  }

  // وضع A4: بنقسّم الملصقات لصفحات صريحة (perSheet في كل صفحة) بدل الاعتماد على كسر
  // الصفحات التلقائي للـ grid — كل صفحة عنصر .sheet مستقل بكسر صفحة بعده.
  const perPage = mode === 'sheet' ? Math.max(1, layout.sheet?.perSheet ?? 1) : flat.length || 1
  const pages: LabelItem[][] = []
  for (let i = 0; i < flat.length; i += perPage) pages.push(flat.slice(i, i + perPage))
  const sheetsHtml =
    mode === 'sheet'
      ? pages.map((pg) => `<div class="sheet">${pg.map(buildLabelHtml).join('')}</div>`).join('')
      : `<div class="sheet">${flat.map(buildLabelHtml).join('')}</div>`

  // Per-label CSS — the size is fixed to physical mm so it never stretches.
  const labelCss = `
  .label {
    width: ${layout.widthMm}mm;
    height: ${layout.heightMm}mm;
    padding: ${layout.paddingMm}mm;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    box-sizing: border-box;
  }
  .lbl-name {
    font-family: 'Tahoma','Cairo',sans-serif;
    font-size: ${layout.nameFontSizePt}pt;
    font-weight: 700;
    line-height: ${LABEL_LH.name};
    flex-shrink: 0;
    max-width: 100%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    margin: 0 0 ${LABEL_GAP_MM.name}mm 0;
    word-break: break-word;
  }
  /* 🛡️ الملصق نفسه RTL عشان نص الاسم/السعر يفضل سليم — حتى في وضع A4 اللي
     بنحوّل فيه الشبكة لـ LTR (تحت) عشان تطابق المعاينة وترتيب الاستيكرز المقطّع */
  .label {
    direction: rtl;
  }
  .lbl-barcode-wrap {
    flex-shrink: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }
  .lbl-barcode-wrap svg {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .lbl-variant {
    font-family: 'Tahoma','Cairo',sans-serif;
    font-size: ${layout.variantFontSizePt}pt;
    font-weight: 700;
    line-height: ${LABEL_LH.variant};
    flex-shrink: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0 0 ${LABEL_GAP_MM.variant}mm 0;
    color: #000;
  }
  .lbl-barcode-fallback {
    font-family: 'Consolas','Courier New',monospace;
    font-size: ${layout.barcodeTextFontSizePt}pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #000;
  }
  .lbl-barcode-text {
    font-family: 'Consolas','Courier New',monospace;
    font-size: ${layout.barcodeTextFontSizePt}pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: ${LABEL_LH.text};
    flex-shrink: 0;
    margin-top: ${LABEL_GAP_MM.text}mm;
    color: #000;
  }
  .lbl-price {
    font-family: 'Tahoma','Cairo',sans-serif;
    font-size: ${layout.priceFontSizePt}pt;
    font-weight: 800;
    line-height: ${LABEL_LH.price};
    flex-shrink: 0;
    margin-top: ${LABEL_GAP_MM.price}mm;
    color: #000;
  }
  `

  // Page-level CSS differs by mode.
  let pageCss: string
  if (mode === 'roll') {
    // One label per page, page size = label size, zero margins. Each label
    // forces a page break after it so we get exactly one sticker per printed
    // sheet regardless of how many labels the user requested.
    pageCss = `
  @page { size: ${layout.widthMm}mm ${layout.heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet { display: block; margin: 0; padding: 0; overflow: hidden; }
  /* ارتفاع الملصق أقل من الصفحة بـ 0.3مم: لو بالظبط نفس الارتفاع، تقريب البكسل بيطلّع
     صفحة فاضية بعد كل ملصق في بعض الطابعات/المتصفحات. */
  .label {
    height: ${Math.max(1, layout.heightMm - 0.3)}mm;
    margin: 0;
    border: none;
    border-radius: 0;
    break-after: page;
    page-break-after: always;
  }
  .label:last-child { break-after: auto; page-break-after: auto; }
    `
  } else {
    // A4 sheet with a regular grid of labels at the chosen size, with visible
    // cut margins (gap) between labels and a sensible outer page margin. The
    // grid is computed from physical mm so it never stretches or collapses.
    const g = layout.sheet!
    pageCss = `
  @page { size: A4; margin: ${g.pageMarginMm}mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet {
    display: grid;
    /* 🛡️ LTR: الصفحة dir="rtl" فالـ grid كان بيبدأ من اليمين وبيتلزق فيه —
       بينما المعاينة LTR وبتبدأ من الشمال. ورق الاستيكرز المقطّع جاهز مقاسه
       على ترتيب الشمال، فبنوحّل الشبكة لـ LTR عشان الطباعة تطابق المعاينة
       حرفياً («بترتيب الطباعة الفعلي»). نصوص الملصق نفسه بتفضل RTL عبر
       .label{direction:rtl} فوق. */
    direction: ltr;
    grid-template-columns: repeat(${g.columns}, ${layout.widthMm}mm);
    grid-template-rows: repeat(${g.rows}, ${layout.heightMm}mm);
    gap: ${g.gapYMm}mm ${g.gapXMm}mm;
    justify-content: start;
    align-content: start;
    break-after: page;
    page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .label {
    border: 1px dashed #c8c8c8;
    border-radius: 1mm;
  }
  @media print {
    .label { border: none; }
  }
    `
  }

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>طباعة ملصقات الباركود</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; }
  body { font-family: 'Tahoma','Cairo',sans-serif; color: #000; }
  ${labelCss}
  ${pageCss}
  .empty-msg { padding: 40px; text-align: center; color: #888; font-size: 14px; }
</style>
</head>
<body>
  ${
    flat.length > 0
      ? sheetsHtml
      : `<div class="empty-msg">لا توجد ملصقات لطباعتها</div>`
  }
  ${printCloseBarHtml()}
</body>
</html>`
}

/** يطبع مستند HTML جوه iframe مخفي في نفس الصفحة (print-frame.ts) — بدل نافذة
 *  منبثقة. مشترك بين كل أزرار «طباعة PDF» في التطبيق عشان سلوك الطباعة يكون
 *  موحّد. الـ iframe مبيتمنعش من حاجب النوافذ، ولما المستخدم يكنسل معاينة
 *  الطباعة الصفحة تفضل شغالة عادي (كانت النافذة المنبثقة بتجمد الصفحة بعد
 *  الإلغاء لحد ريفرش).
 *  `onPopupBlocked` اتبقى للتوافق — بيتنادى بس لو الطباعة ماقدرتش تنطلق خالص
 *  (بيئة غير متصفح)، وحاجب النوافذ المنبثقة ملوش علاقة تاني. */
export function openPrintWindow(html: string, onPopupBlocked?: () => void): void {
  const ok = printHtmlInFrame(html, 'طباعة')
  if (!ok) onPopupBlocked?.()
}

/* ═══════════ 🎨 التحديث 27: طباعة التصميم الحر (سحب وإفلات) ═══════════ */

/** محاذاة عنصر لنص عادي (جوّه dir مناسب). */
function elTextAlign(el: LabelElement): string {
  return alignOf(el)
}

/** محاذاة عنصر باركود في حاوية flex بـ dir=ltr (flex-start = يسار فعلي). */
function elJustify(el: LabelElement): string {
  const a = alignOf(el)
  return a === 'right' ? 'flex-end' : a === 'left' ? 'flex-start' : 'center'
}

/** HTML لعنصر واحد من التصميم الحر — نفس تنسيقات معاينة المصمم بالظبط
 *  (نفس الخطوط ونفس اللف والقص) عشان الطباعة تطابق المعاينة. */
function freeElementHtml(el: LabelElement, f: LabelItem, design: LabelDesign): string {
  const pos = `left:${el.xMm}mm;top:${el.yMm}mm;width:${el.wMm}mm;`
  const alignCss = `text-align:${elTextAlign(el)};`
  const family = `'Tahoma','Cairo',sans-serif`

  switch (el.type) {
    case 'name': {
      const lines = maxLinesFor(el, design)
      return `<div class="el" dir="rtl" style="${pos}${alignCss}font-family:${family};font-size:${el.fontSizePt ?? 9}pt;font-weight:${el.bold !== false ? 700 : 400};line-height:1.15;word-break:break-word;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};text-overflow:ellipsis;">${escapeHtml(f.name)}</div>`
    }
    case 'variant': {
      const v = [f.size, f.color].filter((x) => !!x && String(x).trim()).join(' · ')
      if (!v) return ''
      return `<div class="el" dir="rtl" style="${pos}${alignCss}font-family:${family};font-size:${el.fontSizePt ?? 9}pt;font-weight:${el.bold !== false ? 700 : 400};line-height:1.15;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(v)}</div>`
    }
    case 'price': {
      if (f.price == null) return ''
      return `<div class="el" dir="rtl" style="${pos}${alignCss}font-family:${family};font-size:${el.fontSizePt ?? 9}pt;font-weight:${el.bold !== false ? 800 : 600};line-height:1.2;">${fmtLabelPrice(f.price)} ج.م</div>`
    }
    case 'barcodeText': {
      if (!f.barcode) return ''
      return `<div class="el" dir="ltr" style="${pos}${alignCss}font-family:'Consolas','Courier New',monospace;font-size:${el.fontSizePt ?? 9}pt;font-weight:700;letter-spacing:0.06em;line-height:1.2;">${escapeHtml(f.barcode)}</div>`
    }
    case 'barcode': {
      const hMm = el.heightMm ?? 8
      const inner = f.barcodeSvg
        ? f.barcodeSvg
        : f.barcode
          ? `<div class="el-fallback" dir="ltr">${escapeHtml(f.barcode)}</div>`
          : ''
      if (!inner) return ''
      return `<div class="el el-bar" dir="ltr" style="${pos}height:${hMm}mm;display:flex;align-items:flex-start;justify-content:${elJustify(el)};">${inner}</div>`
    }
    default:
      return ''
  }
}

/** Builds a self-contained printable HTML page for FREE-designed barcode labels
 *  (التحديث 27). نفس عقد `printBarcodeLabelsHtml`: الباركودات واصلة كـ SVG
 *  مُ render مسبقاً في `LabelItem.barcodeSvg` — صفر جافاسكريبت وصفر طلبات شبكة
 *  جوه صفحة الطباعة، فمستحيل تطلع ورقة فاضية. كل عنصر متحطّط absolutely
 *  بالمليمتر على مقاس الملصق — نفس إحداثيات المصمم والمعاينة. */
export function printFreeLabelsHtml(
  items: LabelItem[],
  design: LabelDesign,
  opts: { mode?: 'sheet' | 'roll' } = {},
): string {
  const mode = opts.mode ?? 'roll'

  const flat: LabelItem[] = []
  items.forEach((it) => {
    const copies = Math.max(1, Math.floor(it.quantity) || 1)
    for (let i = 0; i < copies; i++) flat.push({ ...it })
  })

  const buildLabelHtml = (f: LabelItem) => {
    const parts = design.elements.map((el) => freeElementHtml(el, f, design)).filter(Boolean)
    return `<div class="label" style="width:${design.widthMm}mm;height:${Math.max(1, design.heightMm - (mode === 'roll' ? 0.3 : 0))}mm;">${parts.join('')}</div>`
  }

  // شبكة A4 — نفس حسابات الوضع القديم (اعتماداً على مقاس الملصق فقط)
  const grid =
    mode === 'sheet'
      ? computeLabelLayout(design.widthMm, design.heightMm, 'sheet', {}).sheet
      : undefined
  const perPage = grid?.perSheet ?? (flat.length || 1)
  const pages: LabelItem[][] = []
  for (let i = 0; i < flat.length; i += perPage) pages.push(flat.slice(i, i + perPage))
  const sheetsHtml =
    mode === 'sheet'
      ? pages.map((pg) => `<div class="sheet">${pg.map(buildLabelHtml).join('')}</div>`).join('')
      : `<div class="sheet">${flat.map(buildLabelHtml).join('')}</div>`

  // Per-label CSS: الحاوية relative والعناصر absolute — الملصق نفسه RTL للنصوص،
  // وكل عنصر بيحدد اتجاهه بنفسه (dir=ltr للباركود وأرقامه).
  const labelCss = `
  .label {
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    background: #fff;
    direction: rtl;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .el {
    position: absolute;
    overflow: hidden;
    color: #000;
    box-sizing: border-box;
  }
  .el-bar svg { max-width: 100%; height: auto; display: block; }
  .el-fallback {
    font-family: 'Consolas','Courier New',monospace;
    font-size: 8pt; font-weight: 700; letter-spacing: 0.05em; color: #000;
  }
  `

  let pageCss: string
  if (mode === 'roll') {
    pageCss = `
  @page { size: ${design.widthMm}mm ${design.heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet { display: block; margin: 0; padding: 0; overflow: hidden; }
  /* ارتفاع الملصق أقل من الصفحة بـ 0.3مم (مطبّق فوق في style) — يمنع صفحة فاضية */
  .label { margin: 0; border: none; break-after: page; page-break-after: always; }
  .label:last-child { break-after: auto; page-break-after: auto; }
    `
  } else {
    const g = grid!
    pageCss = `
  @page { size: A4; margin: ${g.pageMarginMm}mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .sheet {
    display: grid;
    direction: ltr; /* ترتيب الاستيكرز الفعلي — زي الوضع القديم بالظبط */
    grid-template-columns: repeat(${g.columns}, ${design.widthMm}mm);
    grid-template-rows: repeat(${g.rows}, ${design.heightMm}mm);
    gap: ${g.gapYMm}mm ${g.gapXMm}mm;
    justify-content: start;
    align-content: start;
    break-after: page;
    page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .label { border: 1px dashed #c8c8c8; border-radius: 1mm; }
  @media print { .label { border: none; } }
    `
  }

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>طباعة ملصقات الباركود</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff; }
  body { font-family: 'Tahoma','Cairo',sans-serif; color: #000; }
  ${labelCss}
  ${pageCss}
  .empty-msg { padding: 40px; text-align: center; color: #888; font-size: 14px; }
</style>
</head>
<body>
  ${
    flat.length > 0
      ? sheetsHtml
      : `<div class="empty-msg">لا توجد ملصقات لطباعتها</div>`
  }
  ${printCloseBarHtml()}
</body>
</html>`
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

/**
 * Cell value for ListReport rows that must render Left-To-Right inside the RTL
 * printed table (dates, numbers, phones, tracking codes).
 *
 * Contract fix (2026-09-30): ListReportOptions.rows is string[][] — JSX spans
 * passed by Cash/Finance/Maintenance views interpolated as "[object Object]"
 * in printListReportHtml's raw `${cell}` template. Views must pass plain
 * strings/HTML; use this helper (never JSX) for LTR-isolated cells.
 */
export function printLtr(text: string): string {
  return `<span dir="ltr" style="unicode-bidi:isolate">${escapeHtml(text)}</span>`
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
