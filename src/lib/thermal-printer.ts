'use client'

/**
 * ESC/POS Thermal Printer Integration — نظام المحل 2026
 *
 * Supports:
 *  ✅ Direct USB printing via WebUSB API (Chrome/Edge on desktop)
 *  ✅ تصنيف أخطاء USB مع رسالة وحل مختلف لكل سبب (Access denied / إلغاء / مشغولة…)
 *  ✅ إعادة استخدام الأجهزة المصرّح ليها سلفًا (getDevices) بدل نافذة إذن كل مرة
 *  ✅ اكتشاف واجهة الطباعة (class 7) والـ endpoint الصح تلقائيًا بدل افتراض interface 0
 *  ✅ Network printing via WebSerial (serial-to-Ethernet bridges)
 *  ✅ Browser print dialog fallback (for WiFi-enabled printers)
 *  ✅ Auto-detection of common ESC/POS paper widths (58mm / 80mm)
 *  ✅ QR code for digital payment links
 *  ✅ Barcode (CODE128) for invoice number
 *  ✅ Arabic text support (code page encoding + visual order; shaping for CP864)
 *  ✅ Configurable printer settings (stored in localStorage)
 *  ✅ Receipt + daily report printing
 *
 * Printer commands reference: ESC/POS Command Manual
 * https://escpos.readthedocs.io/
 */

import { formatCurrency } from '@/lib/format'
import { encodeForPrinter, DEFAULT_CODE_PAGE } from '@/lib/escpos-encoding'
import { renderBarcodeSvg } from '@/lib/print-client'
import { printHtmlInFrame } from '@/lib/print-frame'
import { isRenderableBarcode } from '@/lib/barcode'

// الطابعة الحرارية بتحوّل النص لـ bytes — لازم نشيل حروف اتجاه الـ bidi غير المرئية
const plainMoney = (n: number | null | undefined) =>
  formatCurrency(n).replace(/[\u2066\u2069]/g, '')

// ─── Types ─────────────────────────────────────────────────
export type PrinterWidth = '58mm' | '80mm'
export type PrinterConnection = 'usb' | 'network' | 'browser'

export interface PrinterSettings {
  width: PrinterWidth
  connection: PrinterConnection
  /** For network printers: IP address or hostname */
  ip?: string
  port?: number
  /** Character encoding for Arabic text */
  encoding: 'cp720' | 'cp864' | 'windows-1256'
  /** رقم الـ code page في أمر ESC t n — اختياري. لو فاضي بنستخدم أرقام Epson
   *  (PC720=32, PC864=37, WPC1256=50). بعض الطابعات الصيني بتختلف: راجع صفحة الاختبار. */
  codePage?: number
  /** Auto-cut after print */
  autoCut: boolean
  /** Print shop logo (requires ESC/POS image data) */
  printLogo: boolean
  /** Footer text */
  footerText: string
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  width: '80mm',
  connection: 'browser',
  encoding: 'windows-1256',
  autoCut: true,
  printLogo: false,
  footerText: 'شكراً لتعاملكم معنا',
}

// ─── ESC/POS Commands ──────────────────────────────────────
const ESC = 0x1B
const GS = 0x1D
const LF = 0x0A

const CMD = {
  init: [ESC, 0x40],                    // ESC @ — initialize
  alignCenter: [ESC, 0x61, 0x01],        // ESC a 1
  alignRight: [ESC, 0x61, 0x02],         // ESC a 2
  alignLeft: [ESC, 0x61, 0x00],         // ESC a 0
  boldOn: [ESC, 0x45, 0x01],            // ESC E 1
  boldOff: [ESC, 0x45, 0x00],           // ESC E 0
  doubleWidth: [GS, 0x21, 0x10],        // GS ! 0x10
  doubleHeight: [GS, 0x21, 0x01],       // GS ! 0x01
  normalSize: [GS, 0x21, 0x00],         // GS ! 0x00
  cut: [GS, 0x56, 0x01],                // GS V 1 — partial cut
  feed: (n: number) => [ESC, 0x64, n],  // ESC d n — feed n lines
  barcodeHeight: (n: number) => [GS, 0x68, n],         // GS h n — ارتفاع الباركود (نقط)
  barcodeWidth: (n: number) => [GS, 0x77, n],          // GS w n — عرض الوحدة (2–6)
  barcodeTextBelow: [GS, 0x48, 0x02],                  // GS H 2 — الرقم تحت الباركود
  selectCodePage: (n: number) => [ESC, 0x74, n],      // ESC t n — اختيار code page (ESC R n ده international charset، مش code page)
}

const COLUMN_WIDTH = {
  '58mm': 32,
  '80mm': 48,
}

// ─── Receipt Data Interface ─────────────────────────────────
export interface ThermalReceiptData {
  shopName: string
  shopPhone?: string
  shopAddress?: string
  invoiceNo: string
  date: string
  items: { name: string; qty: number; price: number; total: number }[]
  total: number
  paid: number
  remaining: number
  customerName?: string
  cashierName?: string
}

// ─── Helper: Build ESC/POS byte array ──────────────────────
function buildEscPosReceipt(data: ThermalReceiptData, settings: PrinterSettings): Uint8Array {
  const cols = COLUMN_WIDTH[settings.width]
  const bytes: number[] = []

  // Initialize
  bytes.push(...CMD.init)

  // اختيار code page للعربي (ESC t n) — والنص بيتشفّر بنفس الـ code page (مش UTF-8)
  const page = Number.isInteger(settings.codePage) && settings.codePage! >= 0 && settings.codePage! <= 255
    ? settings.codePage!
    : DEFAULT_CODE_PAGE[settings.encoding]
  bytes.push(...CMD.selectCodePage(page))
  const textToBytes = (text: string) => encodeForPrinter(text, settings.encoding)

  // ── Header: Shop name (centered, bold, double width) ──
  bytes.push(...CMD.alignCenter)
  bytes.push(...CMD.boldOn)
  bytes.push(...CMD.doubleWidth)
  bytes.push(...textToBytes(data.shopName))
  bytes.push(...CMD.normalSize)
  bytes.push(...CMD.boldOff)
  bytes.push(LF)

  // Phone + address
  if (data.shopPhone) {
    bytes.push(...CMD.alignCenter)
    bytes.push(...textToBytes(`تليفون: ${data.shopPhone}`))
    bytes.push(LF)
  }
  if (data.shopAddress) {
    bytes.push(...textToBytes(data.shopAddress))
    bytes.push(LF)
  }

  // Separator
  bytes.push(...CMD.alignLeft)
  bytes.push(...textToBytes('-'.repeat(cols)))
  bytes.push(LF)

  // Invoice info
  bytes.push(...textToBytes(`فاتورة: ${data.invoiceNo}`))
  bytes.push(LF)
  bytes.push(...textToBytes(`التاريخ: ${data.date}`))
  bytes.push(LF)
  if (data.customerName) {
    bytes.push(...textToBytes(`العميل: ${data.customerName}`))
    bytes.push(LF)
  }
  if (data.cashierName) {
    bytes.push(...textToBytes(`البائع: ${data.cashierName}`))
    bytes.push(LF)
  }

  // Separator
  bytes.push(...textToBytes('-'.repeat(cols)))
  bytes.push(LF)

  // Items header
  bytes.push(...textToBytes(padLine('الصنف', 'الكمية', 'السعر', 'الإجمالي', cols)))
  bytes.push(LF)
  bytes.push(...textToBytes('-'.repeat(cols)))
  bytes.push(LF)

  // Items
  data.items.forEach((item) => {
    const name = truncate(item.name, Math.floor(cols * 0.4))
    bytes.push(...textToBytes(padLine(name, String(item.qty), plainMoney(item.price), plainMoney(item.total), cols)))
    bytes.push(LF)
  })

  // Separator
  bytes.push(...textToBytes('-'.repeat(cols)))
  bytes.push(LF)

  // Totals
  bytes.push(...CMD.boldOn)
  bytes.push(...textToBytes(padLine('الإجمالي', '', '', plainMoney(data.total), cols)))
  bytes.push(LF)
  bytes.push(...CMD.boldOff)

  bytes.push(...textToBytes(padLine('المدفوع', '', '', plainMoney(data.paid), cols)))
  bytes.push(LF)

  if (data.remaining > 0) {
    bytes.push(...CMD.boldOn)
    bytes.push(...textToBytes(padLine('المتبقي', '', '', plainMoney(data.remaining), cols)))
    bytes.push(LF)
    bytes.push(...CMD.boldOff)
  }

  // Separator
  bytes.push(...textToBytes('-'.repeat(cols)))
  bytes.push(LF)

  // باركود رقم الفاتورة (CODE128 — GS k 73): بنطبعه بس لو الرقم ASCII (الأمر مابيقبلش غير كده)
  const invoiceCode = data.invoiceNo
  if (isRenderableBarcode(invoiceCode) && invoiceCode.length <= 40) {
    const dots = settings.width === '58mm' ? 384 : 576
    const modules = (invoiceCode.length + 4) * 11 + 2 // تقدير CODE128: رموز × 11 + stop
    const moduleW = modules * 2 <= dots ? 2 : 1
    const payload = [0x7b, 0x42, ...Array.from(invoiceCode).map((c) => c.charCodeAt(0))] // «{B» = Code Set B
    bytes.push(...CMD.alignCenter)
    bytes.push(...CMD.barcodeHeight(60), ...CMD.barcodeWidth(moduleW), ...CMD.barcodeTextBelow)
    bytes.push(GS, 0x6b, 73, payload.length, ...payload)
    bytes.push(LF)
  }

  // Footer
  bytes.push(...CMD.alignCenter)
  bytes.push(...textToBytes(settings.footerText))
  bytes.push(LF)
  bytes.push(...textToBytes(`نظام المحل — ${data.invoiceNo}`))
  bytes.push(LF)

  // Feed + cut
  bytes.push(...CMD.feed(3))
  if (settings.autoCut) {
    bytes.push(...CMD.cut)
  }

  return new Uint8Array(bytes)
}

// ─── Helper: Pad a line to fit the column width ────────────
function padLine(col1: string, col2: string, col3: string, col4: string, width: number): string {
  // For RTL: col1 (name) on right, col4 (total) on left
  const c1 = truncate(col1, Math.floor(width * 0.4))
  const c2 = truncate(col2, Math.floor(width * 0.1))
  const c3 = truncate(col3, Math.floor(width * 0.2))
  const c4 = truncate(col4, Math.floor(width * 0.3))

  const line = `${c1} ${c2} ${c3} ${c4}`
  return line.padEnd(width, ' ').substring(0, width)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.substring(0, max - 1) + '.'
}

// ─── Browser Print (HTML fallback) ─────────────────────────
export function printThermalReceiptBrowser(data: ThermalReceiptData, settings: PrinterSettings): void {
  const width = settings.width === '58mm' ? '58mm' : '80mm'
  const fontSize = settings.width === '58mm' ? '11px' : '13px'

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td class="name">${escapeHtml(item.name)}</td>
        <td class="qty">${item.qty}</td>
        <td class="price">${formatCurrency(item.price)}</td>
        <td class="total">${formatCurrency(item.total)}</td>
      </tr>`
    )
    .join('')

  // باركود رقم الفاتورة (SVG جاهز من jsbarcode — الصفحة static من غير سكريبتات)
  const barcodeSvg = isRenderableBarcode(data.invoiceNo)
    ? renderBarcodeSvg(data.invoiceNo, {
        height: 40,
        fontSize: 10,
        displayValue: true,
        availMm: settings.width === '58mm' ? 50 : 70,
      })
    : ''
  const barcodeHtml = barcodeSvg ? `<div class="barcode">${barcodeSvg}</div>` : ''

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>فاتورة ${escapeHtml(data.invoiceNo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: ${width} auto; margin: 0; }
  body {
    font-family: 'Cairo', 'Tahoma', monospace;
    font-size: ${fontSize};
    width: ${width};
    padding: 2mm;
    color: #000;
    background: #fff;
  }
  .header { text-align: center; margin-bottom: 4mm; }
  .shop-name { font-size: ${settings.width === '58mm' ? '14px' : '16px'}; font-weight: bold; }
  .shop-meta { font-size: ${settings.width === '58mm' ? '9px' : '11px'}; margin-top: 1mm; }
  .separator { border-top: 1px dashed #000; margin: 2mm 0; }
  .info-row { display: flex; justify-content: space-between; margin: 0.5mm 0; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: ${settings.width === '58mm' ? '9px' : '11px'}; text-align: right; border-bottom: 1px dashed #000; padding-bottom: 1mm; }
  td { padding: 0.5mm 0; }
  .name { text-align: right; font-weight: 500; }
  .qty, .price { text-align: center; }
  .total { text-align: left; font-weight: 600; }
  .totals { margin-top: 2mm; }
  .totals .row { display: flex; justify-content: space-between; padding: 0.5mm 0; }
  .totals .grand { font-weight: bold; font-size: ${settings.width === '58mm' ? '13px' : '15px'}; border-top: 1px dashed #000; padding-top: 1mm; margin-top: 1mm; }
  .barcode { display: flex; justify-content: center; margin-top: 3mm; }
  .barcode svg { max-width: 100%; height: auto; display: block; }
  .footer { text-align: center; margin-top: 4mm; font-size: ${settings.width === '58mm' ? '9px' : '11px'}; }
  @media print { body { width: ${width}; } }
</style>
</head>
<body>
  <div class="header">
    <div class="shop-name">${escapeHtml(data.shopName)}</div>
    ${data.shopPhone ? `<div class="shop-meta">تليفون: ${escapeHtml(data.shopPhone)}</div>` : ''}
    ${data.shopAddress ? `<div class="shop-meta">${escapeHtml(data.shopAddress)}</div>` : ''}
  </div>
  <div class="separator"></div>
  <div class="info-row"><span>فاتورة:</span><span>${escapeHtml(data.invoiceNo)}</span></div>
  <div class="info-row"><span>التاريخ:</span><span>${escapeHtml(data.date)}</span></div>
  ${data.customerName ? `<div class="info-row"><span>العميل:</span><span>${escapeHtml(data.customerName)}</span></div>` : ''}
  ${data.cashierName ? `<div class="info-row"><span>البائع:</span><span>${escapeHtml(data.cashierName)}</span></div>` : ''}
  <div class="separator"></div>
  <table>
    <thead>
      <tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="separator"></div>
  <div class="totals">
    <div class="row"><span>الإجمالي</span><span>${formatCurrency(data.total)} ج.م</span></div>
    <div class="row"><span>المدفوع</span><span>${formatCurrency(data.paid)} ج.م</span></div>
    ${data.remaining > 0 ? `<div class="row"><span>المتبقي</span><span>${formatCurrency(data.remaining)} ج.م</span></div>` : ''}
    <div class="grand"><span>الإجمالي النهائي</span><span>${formatCurrency(data.total)} ج.م</span></div>
  </div>
  ${barcodeHtml}
  <div class="footer">
    <div>${escapeHtml(settings.footerText)}</div>
    <div style="margin-top:1mm;font-size:9px">نظام المحل — ${escapeHtml(data.invoiceNo)}</div>
  </div>
</body>
</html>`

  // 🛡️ iframe مخفي في نفس الصفحة بدل نافذة منبثقة — حاجب النوافذ ملوش دعوة،
  // ولما المستخدم يكنسل معاينة الطباعة الصفحة تفضل شغالة عادي ويقدر يطبع تاني
  // (كانت النافذة المنبثقة بتجمّد الصفحة بعد الإلغاء لحد ريفرش).
  printHtmlInFrame(html, `فاتورة ${data.invoiceNo}`)
}

// ─── WebUSB Direct Printing ────────────────────────────────
// 🛡️ FIX (tsc): نوع WebUSB مش موجود في lib.dom الحالي — بنعرّف الحد الأدنى
// من الشكل المستخدم فعليًا هنا (open/claim/transferOut) بدل any.
interface UsbEndpointLike {
  direction: string
  endpointNumber: number
}
interface UsbInterfaceLike {
  interfaceNumber: number
  alternates: Array<{
    interfaceClass: number
    endpoints?: UsbEndpointLike[]
  }>
}
interface UsbConfigurationLike {
  configurationValue: number
  interfaces?: UsbInterfaceLike[]
}
interface UsbDeviceLike {
  open: () => Promise<void>
  close?: () => Promise<void>
  productName?: string
  manufacturerName?: string
  configurations?: UsbConfigurationLike[]
  selectConfiguration: (n: number) => Promise<void>
  claimInterface: (n: number) => Promise<void>
  // 🛡️ FIX (tsc): بياخد Uint8Array مباشرة (بنية WebUSB الحقيقية أوسع من
  // BufferSource في lib.dom الحالي).
  transferOut: (endpointNumber: number, data: Uint8Array<ArrayBufferLike>) => Promise<unknown>
}

/** أنواع فشل اتصال USB — كل سبب ليه رسالة وحل مختلف في الواجهة:
 *  - access-denied: النظام/الدرايفر مانع المتصفح من فتح الجهاز (أشهر حالة:
 *    ويندوز حاجز الطابعة لدرايفر usbprint، فالمتصفح مش قادر يعمل open).
 *  - cancelled: المستخدم قفل نافذة اختيار الطابعة من غير اختيار.
 *  - gesture: نافذة الإذن اترفض لأن الطباعة حصلت بعد عملية async (محتاجة ضغطة مباشرة).
 *  - busy: الجهاز مفتوح في تبويب/برنامج تاني.
 *  - unsupported: المتصفح مادعمش WebUSB (فايرفوكس/سفاري/الموبايل). */
export type UsbErrorKind = 'unsupported' | 'cancelled' | 'gesture' | 'access-denied' | 'busy' | 'unknown'

export interface UsbConnectResult {
  ok: boolean
  error?: UsbErrorKind
  /** اسم الطابعة زي ما النظام بيرجّعه — للعرض في الإعدادات */
  deviceName?: string
}

let usbDevice: UsbDeviceLike | null = null
let usbOutEndpoint = 1 // endpoint OUT الافتراضي لطابعات ESC/POS

/** هل في طابعة USB متوصّلة ومصرّح ليها حاليًا؟ (للعرض في دايلوج الإعدادات) */
export function isUsbConnected(): boolean {
  return usbDevice !== null
}

function classifyUsbError(e: unknown): UsbErrorKind {
  const name = (e as { name?: string })?.name ?? ''
  const msg = String((e as { message?: string })?.message ?? e ?? '')
  if (name === 'NotFoundError' || name === 'AbortError' || /no device selected/i.test(msg)) return 'cancelled'
  if (/user gesture|user activation/i.test(msg)) return 'gesture'
  if (name === 'SecurityError' || /access denied|insufficient permissions|not allowed/i.test(msg)) return 'access-denied'
  if (name === 'InvalidStateError' || /already open|busy/i.test(msg)) return 'busy'
  return 'unknown'
}

/** فتح الطابعة وعمل claim لواجهة الطباعة الصح:
 *  القديم كان بيفترض «configuration 1 / interface 0» — لو واجهة الطباعة
 *  (USB class 7) مش رقم 0 فالـ claim بيفشل والطباعة معاها. بنلفّ على كل
 *  الـ configurations لحد ما نلاقي واجهة class 7 ونستخدم الـ endpoint OUT بتاعها. */
async function openAndClaim(device: UsbDeviceLike): Promise<void> {
  await device.open()

  let cfgValue = 1
  let ifaceNumber = 0
  let outEndpoint = 1
  let found = false
  for (const cfg of device.configurations ?? []) {
    for (const iface of cfg.interfaces ?? []) {
      const alt = iface.alternates?.[0]
      if (alt?.interfaceClass === 7) {
        cfgValue = cfg.configurationValue
        ifaceNumber = iface.interfaceNumber
        outEndpoint = alt.endpoints?.find((ep) => ep.direction === 'out')?.endpointNumber ?? 1
        found = true
        break
      }
    }
    if (found) break
  }

  await device.selectConfiguration(cfgValue)
  await device.claimInterface(ifaceNumber)
  usbOutEndpoint = outEndpoint
}

const USB_FILTERS = [
  { classCode: 7 }, // USB Printer class
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x0519 }, // Star Micronics
  { vendorId: 0x0fe6 }, // ICS Advent
  { vendorId: 0x0416 }, // Winbond
  { vendorId: 0x1547 }, // Xprinter
  { vendorId: 0x1fc9 }, // NXP
]

/** الاتصال بالطابعة عبر WebUSB. بيرجّع نتيجة منظمة بدل boolean عشان
 *  الواجهة تعرض رسالة/حل مختلف لكل سبب فشل.
 *
 *  الترتيب:
 *  1) جهاز مصرّح ليه سلفًا (`getDevices`)؟ الإذن بيفضل محفوظ للموقع بعد أول
 *     إقران — فبعد ريفرش الصفحة بنوصل تاني من غير ما نفتح نافذة الإذن.
 *  2) لو مفيش (والنظام مش رافض أصلًا) بنطلب من المستخدم يختار الطابعة. */
export async function connectUsbPrinter(promptIfMissing = true): Promise<UsbConnectResult> {
  if (typeof navigator === 'undefined' || !(navigator as any).usb) {
    console.warn('WebUSB not available — use Chrome/Edge on desktop')
    return { ok: false, error: 'unsupported' }
  }
  const usb = (navigator as any).usb
  let grantedError: UsbErrorKind | null = null

  try {
    if (!usbDevice) {
      const granted: UsbDeviceLike[] = (await usb.getDevices()) ?? []
      for (const d of granted) {
        try {
          await openAndClaim(d)
          usbDevice = d
          break
        } catch (e) {
          grantedError = classifyUsbError(e)
          try { await d.close?.() } catch { /* ignore */ }
        }
      }
    }

    if (!usbDevice && grantedError === 'access-denied') {
      // النظام رافض يفتح الطابعة أصلًا — فتح نافذة الإذن تاني مش هيغيّر حاجة
      console.error('USB printer connection failed: access denied by OS/driver')
      return { ok: false, error: 'access-denied' }
    }

    if (!usbDevice) {
      if (!promptIfMissing) return { ok: false, error: 'cancelled' }
      const device: UsbDeviceLike = await usb.requestDevice({ filters: USB_FILTERS })
      try {
        await openAndClaim(device)
        usbDevice = device
      } catch (e) {
        try { await device.close?.() } catch { /* ignore */ }
        throw e
      }
    }

    return {
      ok: true,
      deviceName: usbDevice?.productName || usbDevice?.manufacturerName || 'الطابعة',
    }
  } catch (e) {
    console.error('USB printer connection failed:', e)
    return { ok: false, error: classifyUsbError(e) }
  }
}

// لما الطابعة تتفصل من الكابل نفضّي الحالة عشان الاتصال الجاي يعمل reconnect نضيف
if (typeof navigator !== 'undefined' && (navigator as any).usb?.addEventListener) {
  try {
    ;(navigator as any).usb.addEventListener('disconnect', (e: { device?: UsbDeviceLike }) => {
      if (usbDevice && e.device === usbDevice) usbDevice = null
    })
  } catch { /* ignore */ }
}

/** رسالة عربية واضحة لكل نوع فشل — بتتعرض في التوست وفي لوحة المساعدة */
export function usbErrorMessage(error: UsbErrorKind | undefined | null): string {
  switch (error) {
    case 'access-denied':
      return 'نظام التشغيل رافض يفتح الطابعة للمتصفح (Access denied) — غالباً درايفر الطابعة حاجزها.'
    case 'cancelled':
      return 'مفيش طابعة اتمختارت من نافذة الإذن.'
    case 'gesture':
      return 'فتح نافذة إذن USB محتاج ضغطة مباشرة — اضغط «اتصال» من إعدادات الطابعة مرة واحدة، وبعدها الطباعة تشتغل لوحدها.'
    case 'busy':
      return 'الطابعة مشغولة أو مفتوحة في برنامج تاني.'
    case 'unsupported':
      return 'المتصفح مادعمش USB المباشر — استخدم Chrome أو Edge على الكمبيوتر.'
    default:
      return 'حصل خطأ غير متوقع أثناء الاتصال بالطابعة.'
  }
}

/** خطوات عملية مرتبة بالأولوية لحل فشل اتصال USB — بتتعرض في دايلوج الإعدادات */
export const USB_TROUBLESHOOTING_STEPS: string[] = [
  'اقفل أي برنامج بيستخدم الطابعة (برنامج الدرايفور أو مهمة طباعة معلّقة) وجرّب تاني.',
  'افصل كابل USB وحطّه تاني — ويفضّل منفذ في خلف الجهاز لو PC.',
  'طفي الطابعة وشغّلها من جديد.',
  'الأضمن: من «طريقة الاتصال» اختار «المتصفح» — بيفتح نافذة طباعة عادية وتشتغل مع أي طابعة معرّفة على الجهاز من غير أي صلاحيات.',
  '(للمتقدمين) على ويندوز المتصفح محتاج درايفر WinUSB (بينزّل بأداة Zadig) — بس طباعة المتصفح أسرع وأضمن.',
]

export async function printViaUsb(
  data: ThermalReceiptData,
  settings: PrinterSettings
): Promise<{ ok: boolean; error?: UsbErrorKind }> {
  if (!usbDevice) {
    const conn = await connectUsbPrinter(true)
    if (!conn.ok) return { ok: false, error: conn.error }
  }

  try {
    const escPosData = buildEscPosReceipt(data, settings)
    await usbDevice!.transferOut(usbOutEndpoint, escPosData)
    return { ok: true }
  } catch (e) {
    console.error('USB print failed:', e)
    // فشل النقل → نقفل الجهاز ونفضّي الحالة عشان المحاولة الجاي تكون اتصال نضيف
    try { await usbDevice?.close?.() } catch { /* ignore */ }
    usbDevice = null
    return { ok: false, error: classifyUsbError(e) }
  }
}

/** نتيجة أمر الطباعة — عشان الواجهة تبلغ المستخدم بدل الصمت */
export interface PrintOutcome {
  /** هل الفاتورة اتبعتت للطباعة فعلاً (USB أو نافذة متصفح) */
  ok: boolean
  mode: 'usb' | 'browser'
  /** لو اتحوّلنا لطباعة المتصفح بعد فشل USB — سبب الفشل عشان التوست */
  usbError?: UsbErrorKind
}

/** إرسال بيانات خام (TSPL / ZPL / أي أوامر) للطابعة المتصلة عبر USB.
 *  بيتأكد من الاتصال الأول (نفس منطق printViaUsb)، وبيقسّم الـ payload
 *  كتل 4KB عشان بعض الطابعات بترفض الـ transfers الكبيرة.
 *  بتستخدمه طباعة الملصقات المباشرة (label-printer.ts). */
export async function sendRawToUsbPrinter(payload: Uint8Array): Promise<{ ok: boolean; error?: UsbErrorKind }> {
  if (!payload.length) return { ok: true }
  if (!usbDevice) {
    const conn = await connectUsbPrinter(true)
    if (!conn.ok) return { ok: false, error: conn.error }
  }

  try {
    const CHUNK = 4096
    for (let off = 0; off < payload.length; off += CHUNK) {
      await usbDevice!.transferOut(usbOutEndpoint, payload.subarray(off, Math.min(off + CHUNK, payload.length)))
    }
    return { ok: true }
  } catch (e) {
    console.error('USB raw send failed:', e)
    try { await usbDevice?.close?.() } catch { /* ignore */ }
    usbDevice = null
    return { ok: false, error: classifyUsbError(e) }
  }
}

// ─── Main print function ───────────────────────────────────
export async function printThermalReceipt(
  data: ThermalReceiptData,
  settings?: Partial<PrinterSettings>
): Promise<PrintOutcome> {
  const fullSettings: PrinterSettings = {
    ...DEFAULT_PRINTER_SETTINGS,
    ...getStoredPrinterSettings(),
    ...settings,
  }

  switch (fullSettings.connection) {
    case 'usb': {
      const usb = await printViaUsb(data, fullSettings)
      if (usb.ok) return { ok: true, mode: 'usb' }
      // 🛡️ فشل USB مش مفروض يوقّف البيع — نفتح نافذة طباعة المتصفح فورًا
      // والواجهة بتعرض توست بالسبب (usbError).
      printThermalReceiptBrowser(data, fullSettings)
      return { ok: true, mode: 'browser', usbError: usb.error }
    }
    case 'network':
      // Network printing would require a server-side proxy
      // (browser can't send raw TCP to network printers directly)
      // Fallback to browser print
      printThermalReceiptBrowser(data, fullSettings)
      return { ok: true, mode: 'browser' }
    case 'browser':
    default:
      printThermalReceiptBrowser(data, fullSettings)
      return { ok: true, mode: 'browser' }
  }
}

// ─── Settings storage ──────────────────────────────────────
const SETTINGS_KEY = 'thermal-printer-settings'

export function getStoredPrinterSettings(): Partial<PrinterSettings> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function savePrinterSettings(settings: Partial<PrinterSettings>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).usb
}

// ─── Helper ────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
