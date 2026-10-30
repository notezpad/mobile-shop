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
  invoicePrefix?: string
}

export function fmt(n: number) {
  return n.toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** سعر الملصق بأرقام إنجليزية — متسق مع رقم الباركود المطبوع تحته (والمعاينة بتستخدمه برضه). */
export function fmtLabelPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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

/** شريط صغير في نافذة الطباعة بزر «إغلاق النافذة» — يظهر على الشاشة فقط ومش بيتطبع
 *  (@media print ب يخفيه). كان السيناريو المزعج: المستخدم يطبع أو يكنسل حوار الطباعة
 *  فالنافذة تفضل مفتوحة فاضية وميلاقيش طريقة يقفلها غير ما يريفرش الصفحة.
 *  الضغطة نفسها بتتركّب من الـ opener (`armPrintWindow` في print-client.ts) —
 *  مش inline onclick — عشان تشتغل حتى لو اتضاف CSP صارم بعدين. */
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
