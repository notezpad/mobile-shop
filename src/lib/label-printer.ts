'use client'

/**
 * طباعة الملصقات المباشرة على الطابعات الحرارية عبر USB — بدون نافذة طباعة.
 *
 * اللغات المدعومة:
 *  - TSPL/TSPL2 (طابعات TSC وXprinter ومعظم الصيني): SIZE/GAP/CLS + DOWNLOAD/PUTBMP + PRINT.
 *  - ZPL II (طابعات Zebra والمتوافقة): ^XA ^PW ^LL ^GFA ^PQ ^XZ.
 *
 * ليه صورة (Bitmap) مش أوامر نص؟
 *  - العربي على الطابعات الحرارية بيتطبع من أمر TEXT مشكّل غلط أو مقطوع (الخطوط
 *    المدمجة مبتدعمش تشكيل العربي). فبنرسم كل ملصق على canvas بدقة الطابعة
 *    بالظبط (203dpi = 8 نقاط/مم) ونبعته صورة أحادية اللون — الشكل مطابق
 *    للمعاينة 100% والعربي سليم، والباركود بيتحسب بوحدات مضاعفة لنقطة الطابعة
 *    (نفس منطق renderBarcodeSvg) فيطلع حاد وقابل للمسح.
 *  - الملصقات المتشابهة بتترسم مرة واحدة وبتتضرب بعدد النسخ (PRINT n / ^PQ n).
 */

import { computeLabelLayout, fmtLabelPrice, LABEL_LH, LABEL_GAP_MM, type LabelItem, type LabelOptions, type LabelLayout } from '@/lib/print'
import type { LabelDesign } from '@/lib/label-design'
import { maxLinesFor, alignOf } from '@/lib/label-design'
import { renderBarcodeSvg } from '@/lib/print-client'
import { connectUsbPrinter, sendRawToUsbPrinter, type UsbErrorKind } from '@/lib/thermal-printer'

/** دقة طابعة الملصقات الشائعة: 203dpi = 8 نقاط/مم. */
const DOTS_PER_MM = 8
/** CSS px لكل مم @96dpi — بنحول منه لوحدات النقاط. */
const CSS_PX_PER_MM = 3.78
const PX_TO_DOT = DOTS_PER_MM / CSS_PX_PER_MM
/** فجوة ملصقات الرول القياسية (مم) — نفس اللي بتتظبط في الطابعة. */
const ROLL_GAP_MM = 2

const TE = new TextEncoder()

/* ── رسم الملصق على canvas بدقة الطابعة ─────────────────────────── */

function svgSize(svg: string): { w: number; h: number } {
  try {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const el = doc.documentElement
    return { w: parseFloat(el.getAttribute('width') || '0') || 0, h: parseFloat(el.getAttribute('height') || '0') || 0 }
  } catch {
    return { w: 0, h: 0 }
  }
}

async function loadImage(svg: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await img.decode()
    return img
  } catch {
    return null
  }
}

/** سطر المقاس/اللون — نفس منطق print.ts (lbl-variant) بالظبط. */
export function variantLineOf(it: Pick<LabelItem, 'size' | 'color'>): string {
  return [it.size, it.color].filter((x) => !!x && String(x).trim()).join(' · ')
}

/** رسم ملصق واحد على canvas بمقاس نقاط الطابعة (w×h نقطة). */
async function renderLabelToCanvas(
  it: LabelItem,
  layout: LabelLayout,
  opts: { showName: boolean; showPrice: boolean; showText: boolean; showVariant: boolean },
): Promise<HTMLCanvasElement> {
  const W = Math.round(layout.widthMm * DOTS_PER_MM)
  const H = Math.round(layout.heightMm * DOTS_PER_MM)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  try {
    ;(ctx as { direction?: string }).direction = 'rtl'
  } catch {
    /* متصفح قديم — النص هيترسم مش مظبوط الاتجاه بس هيظهر */
  }
  try {
    ;(ctx as { letterSpacing?: string }).letterSpacing = '0px'
  } catch {
    /* ignore */
  }

  const pad = layout.paddingMm * DOTS_PER_MM
  const contentW = W - pad * 2

  // ── الاسم: لفّ الكلمات على عرض المحتوى (نفس -webkit-line-clamp) ──
  const nameFont = layout.nameFontSizePt * (4 / 3) * PX_TO_DOT
  const wrapLines: string[] = []
  if (opts.showName && it.name) {
    ctx.font = `bold ${Math.max(6, Math.round(nameFont))}px Cairo, Tahoma, sans-serif`
    const words = it.name.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const cand = line ? `${line} ${word}` : word
      if (ctx.measureText(cand).width <= contentW || !line) line = cand
      else {
        wrapLines.push(line)
        line = word
      }
      if (wrapLines.length >= layout.nameMaxLines) break
    }
    if (wrapLines.length < layout.nameMaxLines && line) wrapLines.push(line)
    if (wrapLines.length === layout.nameMaxLines && wrapLines.join(' ').length < it.name.replace(/\s+/g, ' ').trim().length) {
      // في كلام اتمقص — نضيف علامة القطع على آخر سطر
      let last = wrapLines[wrapLines.length - 1]
      while (last.length > 1 && ctx.measureText(`${last}…`).width > contentW) last = last.slice(0, -1)
      wrapLines[wrapLines.length - 1] = `${last}…`
    }
  }

  // ── سطر المقاس/اللون ──
  const vText = opts.showVariant ? variantLineOf(it) : ''
  const vFont = layout.variantFontSizePt * (4 / 3) * PX_TO_DOT

  // ── الباركود ──
  const img = it.barcodeSvg ? await loadImage(it.barcodeSvg) : null
  const dims = it.barcodeSvg ? svgSize(it.barcodeSvg) : { w: 0, h: 0 }
  let barW = 0
  let barH = 0
  if (img && dims.w > 0 && dims.h > 0) {
    barW = Math.round(dims.w * PX_TO_DOT)
    barH = Math.round(dims.h * PX_TO_DOT)
  }

  // ── رقم الباركود ──
  const textFont = layout.barcodeTextFontSizePt * (4 / 3) * PX_TO_DOT
  const priceFont = layout.priceFontSizePt * (4 / 3) * PX_TO_DOT

  // ── الحساب الرأسي — نفس ترتيب HTML: [اسم+هامش][مقاس/لون+هامش][باركود][رقم+هامش فوق][سعر+هامش فوق] ──
  const blocks: { h: number; draw: (y: number) => void }[] = []
  if (wrapLines.length) {
    const h = wrapLines.length * nameFont * LABEL_LH.name
    blocks.push({
      h,
      draw: (y) => {
        ctx.font = `bold ${Math.max(6, Math.round(nameFont))}px Cairo, Tahoma, sans-serif`
        for (let i = 0; i < wrapLines.length; i++) {
          ctx.fillText(wrapLines[i], W / 2, y + i * nameFont * LABEL_LH.name)
        }
      },
    })
    blocks.push({ h: LABEL_GAP_MM.name * DOTS_PER_MM, draw: () => {} })
  }
  if (vText) {
    blocks.push({
      h: vFont * LABEL_LH.variant,
      draw: (y) => {
        ctx.font = `bold ${Math.max(5, Math.round(vFont))}px Cairo, Tahoma, sans-serif`
        ctx.fillText(vText, W / 2, y)
      },
    })
    blocks.push({ h: LABEL_GAP_MM.variant * DOTS_PER_MM, draw: () => {} })
  }
  if (img && barW > 0) {
    blocks.push({
      h: barH,
      draw: (y) => ctx.drawImage(img, Math.round((W - barW) / 2), Math.round(y), barW, barH),
    })
  } else if (it.barcode) {
    // احتياط: الباركود مش اترسم — نطبع الرقم نص (زي HTML fallback)
    blocks.push({
      h: textFont * LABEL_LH.text,
      draw: (y) => {
        ctx.font = `bold ${Math.max(5, Math.round(textFont))}px Consolas, 'Courier New', monospace`
        ctx.fillText(it.barcode, W / 2, y)
      },
    })
  }
  if (opts.showText && it.barcode && img && barW > 0) {
    blocks.push({ h: LABEL_GAP_MM.text * DOTS_PER_MM, draw: () => {} })
    blocks.push({
      h: textFont * LABEL_LH.text,
      draw: (y) => {
        ctx.font = `bold ${Math.max(5, Math.round(textFont))}px Consolas, 'Courier New', monospace`
        ctx.fillText(it.barcode, W / 2, y)
      },
    })
  }
  if (opts.showPrice && it.price != null) {
    blocks.push({ h: LABEL_GAP_MM.price * DOTS_PER_MM, draw: () => {} })
    blocks.push({
      h: priceFont * LABEL_LH.price,
      draw: (y) => {
        ctx.font = `800 ${Math.max(6, Math.round(priceFont))}px Cairo, Tahoma, sans-serif`
        ctx.fillText(`${fmtLabelPrice(it.price as number)} ج.م`, W / 2, y)
      },
    })
  }

  const total = blocks.reduce((s, b) => s + b.h, 0)
  let y = Math.max(pad, Math.round((H - total) / 2))
  for (const b of blocks) {
    b.draw(y)
    y += b.h
  }
  return canvas
}

/* ── 🎨 التحديث 27: رسم الملصق الحر (سحب وإفلات) على canvas ────────── */

/** يلفّ نص على عرض صندوق العنصر مع علامة قطع … لو في كلام اتمقص —
 *  نفس منطق لفّ الاسم في الرسم التلقائي (renderLabelToCanvas) بالظبط. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const cand = line ? `${line} ${word}` : word
    if (ctx.measureText(cand).width <= maxW || !line) line = cand
    else {
      lines.push(line)
      line = word
    }
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && line) lines.push(line)
  // في كلام اتمقص — نضيف علامة القطع على آخر سطر
  if (
    lines.length >= maxLines &&
    lines.length > 0 &&
    lines.join(' ').length < text.replace(/\s+/g, ' ').trim().length
  ) {
    let last = lines[lines.length - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

/** يرسم سطر نص بمحاذاة صريحة داخل صندوق العنصر. بنستخدم textAlign='center'
 *  مع حساب المركز يدوياً — center هي المحاذاة الوحيدة اللي معناها ثابت مهما
 *  كان اتجاه الكانفس (direction rtl/ltr)، فنضمن تطابق الطباعة مع المعاينة. */
function drawAligned(ctx: CanvasRenderingContext2D, text: string, x: number, w: number, y: number, align: 'center' | 'right' | 'left') {
  const tw = ctx.measureText(text).width
  let cx = x + w / 2
  if (align === 'right') cx = x + w - tw / 2
  else if (align === 'left') cx = x + tw / 2
  ctx.fillText(text, cx, y)
}

/** رسم ملصق بتصميم حر على canvas بدقة نقاط الطابعة — نفس إحداثيات المعاينة
 *  والطباعة HTML بالمليمتر، محوّلة لنقاط 203dpi. (التحديث 27) */
async function renderFreeLabelToCanvas(
  it: LabelItem,
  design: LabelDesign,
): Promise<HTMLCanvasElement> {
  const W = Math.round(design.widthMm * DOTS_PER_MM)
  const H = Math.round(design.heightMm * DOTS_PER_MM)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  try {
    ;(ctx as { direction?: string }).direction = 'rtl'
  } catch {
    /* متصفح قديم — ignore */
  }

  const PT_PX = (pt: number) => Math.max(5, Math.round(pt * (4 / 3) * PX_TO_DOT))
  const family = `Cairo, Tahoma, sans-serif`
  const mono = `Consolas, 'Courier New', monospace`

  for (const el of design.elements) {
    const x = el.xMm * DOTS_PER_MM
    const y = el.yMm * DOTS_PER_MM
    const w = el.wMm * DOTS_PER_MM
    const align = alignOf(el)

    switch (el.type) {
      case 'name': {
        if (!it.name) break
        const px = PT_PX(el.fontSizePt ?? 9)
        ctx.font = `${el.bold !== false ? 'bold ' : ''}${px}px ${family}`
        const lines = wrapWords(ctx, it.name, w, maxLinesFor(el, design))
        const lineH = px * LABEL_LH.name
        for (let i = 0; i < lines.length; i++) drawAligned(ctx, lines[i], x, w, y + i * lineH, align)
        break
      }
      case 'variant': {
        const v = variantLineOf(it)
        if (!v) break
        const px = PT_PX(el.fontSizePt ?? 9)
        ctx.font = `${el.bold !== false ? 'bold ' : ''}${px}px ${family}`
        // سطر المقاس/اللون سطر واحد — بنقص لو أطول من الصندوق
        let text = v
        while (text.length > 1 && ctx.measureText(text).width > w) text = text.slice(0, -1)
        if (text !== v) text = `${text}…`
        drawAligned(ctx, text, x, w, y, align)
        break
      }
      case 'price': {
        if (it.price == null) break
        const px = PT_PX(el.fontSizePt ?? 9)
        ctx.font = `${el.bold !== false ? '800 ' : '600 '}${px}px ${family}`
        drawAligned(ctx, `${fmtLabelPrice(it.price as number)} ج.م`, x, w, y, align)
        break
      }
      case 'barcodeText': {
        if (!it.barcode) break
        const px = PT_PX(el.fontSizePt ?? 9)
        ctx.font = `bold ${px}px ${mono}`
        drawAligned(ctx, it.barcode, x, w, y, align)
        break
      }
      case 'barcode': {
        const img = it.barcodeSvg ? await loadImage(it.barcodeSvg) : null
        const dims = it.barcodeSvg ? svgSize(it.barcodeSvg) : { w: 0, h: 0 }
        if (img && dims.w > 0 && dims.h > 0) {
          // 1:1 من CSS px لنقاط الطابعة — الـ SVG نفسه متولّد بارتفاع العنصر
          // وعرضه متقصّ على نقاط 203dpi، فالخطوط بتطلع بعدد صحيح من النقاط.
          const bw = Math.round(dims.w * PX_TO_DOT)
          const bh = Math.round(dims.h * PX_TO_DOT)
          const off = align === 'right' ? w - bw : align === 'left' ? 0 : Math.round((w - bw) / 2)
          ctx.drawImage(img, Math.round(x + off), Math.round(y), bw, bh)
        } else if (it.barcode) {
          const px = PT_PX(8)
          ctx.font = `bold ${px}px ${mono}`
          drawAligned(ctx, it.barcode, x, w, y, align)
        }
        break
      }
      default:
        break
    }
  }
  return canvas
}

/* ── تحويل الرسم لصورة أحادية اللون ─────────────────────────────── */

/** بكسلات الملصق كصفوف بت (bit=1 أسود) — نفس ترتيب ^GFA في ZPL. */
function canvasToBlackBits(canvas: HTMLCanvasElement): { w: number; h: number; rowBytes: number; bits: Uint8Array } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  const { width: w, height: h } = canvas
  const data = ctx.getImageData(0, 0, w, h).data
  const rowBytes = Math.ceil(w / 8)
  const bits = new Uint8Array(rowBytes * h)
  for (let y = 0; y < h; y++) {
    const rowOff = y * rowBytes
    const pxOff = y * w * 4
    for (let x = 0; x < w; x++) {
      const i = pxOff + x * 4
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (data[i + 3] >= 128 && lum < 128) bits[rowOff + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return { w, h, rowBytes, bits }
}

/** بناء ملف BMP أحادي اللون (1-bit) — صيغة PUTBMP في TSPL. الصفوف من تحت لفوق والعرض padded لـ 4 بايت. (مُصدَّر للاختبار) */
export function blackBitsToBmp(b: { w: number; h: number; rowBytes: number; bits: Uint8Array }): Uint8Array {
  const stride = Math.ceil(b.rowBytes / 4) * 4
  const size = stride * b.h
  const file = new Uint8Array(62 + size)
  const dv = new DataView(file.buffer)
  // BITMAPFILEHEADER (14)
  file[0] = 0x42
  file[1] = 0x4d
  dv.setUint32(2, file.length, true)
  dv.setUint32(10, 62, true) // bfOffBits
  // BITMAPINFOHEADER (40)
  dv.setUint32(14, 40, true)
  dv.setInt32(18, b.w, true)
  dv.setInt32(22, b.h, true) // موجب = صفوف من تحت لفوق
  dv.setUint16(26, 1, true)
  dv.setUint16(28, 1, true) // 1-bit
  dv.setUint32(34, size, true)
  dv.setInt32(38, Math.round(1 / 0.0254), true) // ~px/m
  dv.setInt32(42, Math.round(1 / 0.0254), true)
  dv.setUint32(46, 2, true)
  dv.setUint32(50, 2, true)
  // لوحة ألوان: 0 = أسود (يُطبع)، 1 = أبيض
  // 0,0,0,0 جاهزة (أسود) — أبيض عند 58
  file[58] = 255
  file[59] = 255
  file[60] = 255
  // البكسلات — بت=1 أبيض (عكس بتاتنا: بت=1 أسود)
  for (let y = 0; y < b.h; y++) {
    const src = y * b.rowBytes
    const dst = 62 + (b.h - 1 - y) * stride
    for (let i = 0; i < b.rowBytes; i++) file[dst + i] = ~b.bits[src + i] & 0xff
  }
  return file
}

/* ── بناء أوامر الطابعة ─────────────────────────────────────────── */

export interface RasterLabel {
  blackBits: { w: number; h: number; rowBytes: number; bits: Uint8Array }
  copies: number
}

/** بناء أوامر ZPL — كل تصميم فريد = كتلة ^XA..^XZ بعدد نسخها. (مُصدَّر للاختبار) */
export function buildZplPayload(labels: RasterLabel[]): Uint8Array {
  const parts: Uint8Array[] = []
  const push = (s: string) => parts.push(TE.encode(s))
  for (const l of labels) {
    const { w, h, rowBytes, bits } = l.blackBits
    const total = bits.length
    let hex = ''
    const CH = 4096
    for (let i = 0; i < bits.length; i += CH) {
      hex += Array.from(bits.subarray(i, Math.min(i + CH, bits.length)), (x) => x.toString(16).padStart(2, '0')).join('')
    }
    push(`\r\n^XA\r\n^PW${w}\r\n^LL${h}\r\n^LH0,0\r\n^LT0\r\n^FO0,0^GFA,${total},${total},${rowBytes},${hex}\r\n^PQ${l.copies}\r\n^XZ\r\n`)
  }
  return concat(parts)
}

/** بناء أوامر TSPL — SIZE/GAP/CLS ثم لكل تصميم: DOWNLOAD (BMP ثنائي) + PUTBMP + PRINT n. (مُصدَّر للاختبار) */
export function buildTsplPayload(labels: RasterLabel[], widthMm: number, heightMm: number): Uint8Array {
  const parts: Uint8Array[] = []
  const push = (s: string) => parts.push(TE.encode(s))
  push(`SIZE ${widthMm} mm,${heightMm} mm\r\n`)
  push(`GAP ${ROLL_GAP_MM} mm,0\r\n`)
  push(`DIRECTION 1\r\n`)
  push(`CLS\r\n`)
  labels.forEach((l, i) => {
    const bmp = blackBitsToBmp(l.blackBits)
    push(`DOWNLOAD "NL${i}.BMP",${bmp.length},`)
    parts.push(bmp)
    push(`\r\nCLS\r\nPUTBMP 0,0,"NL${i}.BMP"\r\nPRINT ${l.copies},1\r\n`)
  })
  push(`CLS\r\n`)
  return concat(parts)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/* ── نقطة الدخول: طباعة مباشرة ──────────────────────────────────── */

export interface DirectPrintResult {
  ok: boolean
  error?: UsbErrorKind
  /** عدد الملصقات المطلوبة (بالنسخ) لو نجحت */
  labels?: number
}

/** طباعة الملصقات مباشرة على طابعة حرارية USB بلغة TSPL أو ZPL — من غير نافذة طباعة.
 *  - بتتصل بالطابعة الأول (عشان نافذة الإذن تاخد ضغطة المستخدم وهي طازة).
 *  - بتترسم كل ملصق مرة واحدة وتبعته للطابعة وعدد النسخ بيتضرب في الطابعة نفسها.
 *  - بتقبل نفس خيارات `LabelOptions` بتاعة نافذة المتصفح — فالشكل مطابق. */
export async function printBarcodeLabelsDirect(
  items: LabelItem[],
  opts: LabelOptions & { labelSize: { widthMm: number; heightMm: number } },
  lang: 'tspl' | 'zpl',
): Promise<DirectPrintResult> {
  if (typeof document === 'undefined') return { ok: false, error: 'unsupported' }

  const mode = opts.mode ?? 'roll'
  const labelSize = opts.labelSize
  const design = opts.design ?? null // 🎨 التحديث 27: تصميم حر مفعّل؟
  const showName = opts.showName ?? true
  const showPrice = opts.showPrice ?? true
  const showText = opts.showBarcodeText ?? true
  const showVariant = opts.showVariant ?? true
  const layout = computeLabelLayout(
    design ? design.widthMm : labelSize.widthMm,
    design ? design.heightMm : labelSize.heightMm,
    mode,
    {
      showName,
      showPrice,
      showBarcodeText: showText,
      showVariant,
      nameScale: opts.nameScale,
      priceScale: opts.priceScale,
      barcodeScale: opts.barcodeScale,
    },
  )

  // 1) الاتصال الأول — نفس مسار الفواتير (بيستخدم الأجهزة المصرّح ليها قبل ما يفتح نافذة إذن)
  const conn = await connectUsbPrinter(true)
  if (!conn.ok) return { ok: false, error: conn.error }

  // 2) رسم الباركود SVG (نفس دالة نافذة الطباعة) ثم raster لكل تصميم فريد
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.catch(() => {})
  } catch {
    /* ignore */
  }

  // 🎨 في التصميم الحر: الباركود بيتولّد بارتفاع عنصر الباركود وعلى عرض صندوقه
  const freeBarEl = design?.elements.find((e) => e.type === 'barcode') ?? null
  const barHpx = Math.max(10, Math.round((freeBarEl?.heightMm ?? 8) * 3.78))
  const barAvailMm = freeBarEl ? freeBarEl.wMm : layout.widthMm - layout.paddingMm * 2

  const byContent = new Map<string, RasterLabel>()
  let labels = 0
  for (const it of items) {
    const copies = Math.max(1, Math.floor(it.quantity) || 1)
    labels += copies
    const svg = it.barcodeSvg || (it.barcode ? renderBarcodeSvg(it.barcode, {
      height: design ? barHpx : layout.barcodeHeightPx,
      availMm: barAvailMm,
      fontSize: layout.barcodeTextFontSizePt,
      displayValue: false,
    }) : '')
    const key = `${it.name}|${it.size ?? ''}|${it.color ?? ''}|${it.price ?? ''}|${it.barcode}|${svg.length}`
    if (!byContent.has(key)) {
      const canvas = design
        ? await renderFreeLabelToCanvas({ ...it, barcodeSvg: svg }, design)
        : await renderLabelToCanvas({ ...it, barcodeSvg: svg }, layout, { showName, showPrice, showText, showVariant })
      byContent.set(key, { blackBits: canvasToBlackBits(canvas), copies: 0 })
    }
    const label = byContent.get(key)!
    label.copies += copies
  }

  const rasterLabels = [...byContent.values()]
  const pageW = design ? design.widthMm : labelSize.widthMm
  const pageH = design ? design.heightMm : labelSize.heightMm
  const payload = lang === 'zpl' ? buildZplPayload(rasterLabels) : buildTsplPayload(rasterLabels, pageW, pageH)

  // 3) الإرسال
  const sent = await sendRawToUsbPrinter(payload)
  if (!sent.ok) return { ok: false, error: sent.error }
  return { ok: true, labels }
}
