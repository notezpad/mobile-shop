/**
 * 🎨 التحديث 27 (2026-11-04): مصمم ملصقات الباركود الحر — سحب وإفلات.
 *
 * الملف ده هو «العقل المشترك» للتصميم الحر: الأنواع + الترتيب الافتراضي +
 * التحقق/التنظيف (sanitize) + حسابات مشتركة بين:
 *   - مصمم الملصقات (LabelDesignerDialog.tsx)
 *   - معاينة دايلوج الطباعة (PrintLabelsDialog.tsx)
 *   - بناء HTML الطباعة (print.ts → printFreeLabelsHtml)
 *   - الطباعة المباشرة USB (label-printer.ts → renderFreeLabelToCanvas)
 *
 * نظام الإحداثيات: أصل أعلى-يسار بوحدة المليمتر — الملصق دايماً يُرسم في حاوية
 * dir="ltr" (نفس قرار معاينة الملصقات القديمة: جوه RTL المليمترات بتنعكس
 * والمعاينة بترمي المحتوى برّه الإطار). النصوص العربية جوّه كل عنصر dir="rtl".
 *
 * ملاحظة استيراد: print.ts بيستورد الأنواع من هنا بـ `import type` بس (بيتمسح
 * وقت البناء) — وهنا بنستورد computeLabelLayout منه وقت التشغيل، فمفيش دورة.
 */

import { computeLabelLayout } from '@/lib/print'

/* ───────────────────────── الأنواع ───────────────────────── */

/** أنواع العناصر المسموح وضعها على الملصق. */
export type LabelElementType = 'name' | 'price' | 'barcode' | 'barcodeText' | 'variant'

/** عنصر واحد على الملصق — موضعه وحجمه بالمليمتر.
 *  ⚠️ type alias مش interface: عشان ياخد implicit index signature ويشتغل
 *  مع حقول Prisma JSON (InputJsonValue) من غير casts. */
export type LabelElement = {
  /** معرّف فريد داخل التصميم (بيستخدم في React key والسحب). */
  id: string
  type: LabelElementType
  /** يسار العنصر (مم) — من أصل أعلى-يسار. */
  xMm: number
  /** أعلى العنصر (مم). */
  yMm: number
  /** عرض صندوق العنصر (مم) — النص بيلف جواه والباركود بيتوسّط جواه. */
  wMm: number
  /** حجم خط العناصر النصية (pt). */
  fontSizePt?: number
  /** غامق؟ (الافتراضي true للنصوص). */
  bold?: boolean
  /** محاذاة النص/الباركود داخل الصندوق (الافتراضي center). */
  align?: 'center' | 'right' | 'left'
  /** ارتفاع خطوط الباركود (مم) — لعنصر barcode فقط. */
  heightMm?: number
}

/** تصميم ملصق كامل = مقاس الورقة + قائمة العناصر. */
export type LabelDesign = {
  v: 1
  widthMm: number
  heightMm: number
  elements: LabelElement[]
}

/** أسماء العناصر بالعربي — مشتركة بين المصمم وقوائم الإضافة. */
export const LABEL_ELEMENT_META: Record<LabelElementType, { label: string }> = {
  name: { label: 'اسم المنتج' },
  price: { label: 'السعر' },
  barcode: { label: 'خطوط الباركود' },
  barcodeText: { label: 'رقم الباركود' },
  variant: { label: 'المقاس واللون' },
}

/** line-height لكل نوع — نفس قيم LABEL_LH في print.ts بالظبط
 *  (مكرّرة هنا عشان نتفادى استيراد وقت تشغيل زايد؛ لو اتغيّرت هناك غيّرها هنا). */
const LH = { name: 1.15, text: 1.2, price: 1.2, variant: 1.15 } as const
/** المليمترات لكل نقطة مطبعية: 1pt = 25.4/72 مم. */
export const PT_MM = 25.4 / 72
/** 1 مم ≈ 3.78px @96dpi — نفس ثابت MM في دايلوج الطباعة. */
export const MM_PX = 3.78

/* ───────────────────────── حسابات مشتركة ───────────────────────── */

const r2 = (n: number) => Math.round(n * 100) / 100

/** ارتفاع العنصر التقديري بالمليمتر (سطر نص واحد أو ارتفاع خطوط الباركود). */
export function elementHeightMm(el: LabelElement): number {
  if (el.type === 'barcode') return Math.max(2, el.heightMm ?? 8)
  const pt = el.fontSizePt ?? 9
  const lh = el.type === 'price' || el.type === 'barcodeText' ? LH.text : LH.name
  return pt * PT_MM * lh
}

/** كم سطر نص يتسع للعنصر من موضعه لحد خرم الملصق (بهامش أمان 0.3مم) —
 *  نفس الرقم بيتطبق في المعاينة (WebkitLineClamp) والطباعة HTML والكانفس،
 *  فالقص متطابق في التلاتة. */
export function maxLinesFor(el: LabelElement, design: Pick<LabelDesign, 'heightMm'>): number {
  if (el.type === 'barcode' || el.type === 'variant') return 1
  const lineH = elementHeightMm(el)
  const avail = Math.max(lineH, design.heightMm - el.yMm - 0.3)
  return Math.max(1, Math.floor(avail / lineH + 1e-6))
}

export function alignOf(el: LabelElement): 'center' | 'right' | 'left' {
  return el.align ?? 'center'
}

/** id فريد لعنصر جديد من نوع معيّن داخل تصميم. */
export function nextElementId(design: LabelDesign, type: LabelElementType): string {
  const taken = new Set(design.elements.map((e) => e.id))
  const base = `el-${type}`
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/* ───────────────────────── الترتيب الافتراضي ───────────────────────── */

/**
 * يبني التصميم الافتراضي: نفس الشكل الكلاسيكي المتراص (اسم → مقاس/لون → باركود
 * → رقم → سعر) في المنتصف رأسياً — عشان أول ما المستخدم يفتح المصمم يلاقي
 * نفس شكل طباعته الحالية، وأي حركة بعدها اختيارية.
 *
 * الأحجام بتيجي من computeLabelLayout نفسها (نفس محرّك الطباعة التلقائية)،
 * فالتصميم الافتراضي مطابق للطباعة القديمة حرفياً.
 */
export function defaultDesign(
  widthMm: number,
  heightMm: number,
  opts: { name?: boolean; price?: boolean; text?: boolean; variant?: boolean } = {},
): LabelDesign {
  const show = {
    name: opts.name ?? true,
    price: opts.price ?? true,
    text: opts.text ?? true,
    variant: opts.variant ?? false,
  }
  const W = clampDim(widthMm, 10, 300)
  const H = clampDim(heightMm, 10, 300)
  const layout = computeLabelLayout(W, H, 'roll', {
    showName: show.name,
    showPrice: show.price,
    showBarcodeText: show.text,
    showVariant: show.variant,
  })
  const pad = layout.paddingMm
  const contentW = Math.max(6, r2(W - pad * 2))
  const barH = r2(Math.max(2, layout.barcodeHeightPx / MM_PX))

  // بنبني بلوكات مرتبة: [عنصر + ارتفاعه الفعلي + المسافة بعده] — نفس ترتيب
  // وأرقام الطباعة التلقائية (LABEL_LH / LABEL_GAP_MM في print.ts).
  const blocks: { el: LabelElement; hMm: number; gapMm: number }[] = []
  if (show.name) {
    blocks.push({
      el: { id: 'el-name', type: 'name', xMm: pad, yMm: 0, wMm: contentW, fontSizePt: layout.nameFontSizePt, bold: true, align: 'center' },
      hMm: layout.nameFontSizePt * PT_MM * LH.name * layout.nameMaxLines,
      gapMm: 0.6,
    })
  }
  if (show.variant) {
    blocks.push({
      el: { id: 'el-variant', type: 'variant', xMm: pad, yMm: 0, wMm: contentW, fontSizePt: layout.variantFontSizePt, bold: true, align: 'center' },
      hMm: layout.variantFontSizePt * PT_MM * LH.variant,
      gapMm: 0.3,
    })
  }
  blocks.push({
    el: { id: 'el-barcode', type: 'barcode', xMm: pad, yMm: 0, wMm: contentW, heightMm: barH, align: 'center' },
    hMm: barH,
    gapMm: 0.4,
  })
  if (show.text) {
    blocks.push({
      el: { id: 'el-barcodeText', type: 'barcodeText', xMm: pad, yMm: 0, wMm: contentW, fontSizePt: layout.barcodeTextFontSizePt, bold: true, align: 'center' },
      hMm: layout.barcodeTextFontSizePt * PT_MM * LH.text,
      gapMm: 0.6,
    })
  }
  if (show.price) {
    blocks.push({
      el: { id: 'el-price', type: 'price', xMm: pad, yMm: 0, wMm: contentW, fontSizePt: layout.priceFontSizePt, bold: true, align: 'center' },
      hMm: layout.priceFontSizePt * PT_MM * LH.price,
      gapMm: 0,
    })
  }

  // توسيط المحتوى رأسياً — نفس justify-content:center في الطباعة القديمة
  const total = blocks.reduce((s, b) => s + b.hMm + b.gapMm, 0)
  let cursor = pad + Math.max(0, (H - pad * 2 - total) / 2)
  const elements: LabelElement[] = []
  for (const b of blocks) {
    elements.push({ ...b.el, yMm: r2(cursor) })
    cursor += b.hMm + b.gapMm
  }
  return { v: 1, widthMm: W, heightMm: H, elements }
}

/* ───────────────────────── التنظيف والتحقق ───────────────────────── */

function clampDim(n: number, lo: number, hi: number, fallback?: number): number {
  const v = Number.isFinite(n) ? n : NaN
  if (!Number.isFinite(v)) return fallback ?? lo
  return Math.max(lo, Math.min(hi, Math.round(v * 10) / 10))
}

function clampNum(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(lo, Math.min(hi, v))
}

/**
 * ينظّف تصميم قادم من قاعدة البيانات أو من المتصفح (Defense in depth):
 * مقاسات ضمن 10–300مم، إحداثيات جوّه الملصق، أنواع معروفة بس، 12 عنصر كحد أقصى.
 * بيرجّع null لو المدخل مش تصميم أصلاً — والمستدعي يرجّع للوضع الكلاسيكي.
 */
export function sanitizeDesign(raw: unknown, fallbackW = 40, fallbackH = 30): LabelDesign | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const W = clampDim(Number(r.widthMm), 10, 300, fallbackW)
  const H = clampDim(Number(r.heightMm), 10, 300, fallbackH)
  if (!Array.isArray(r.elements)) return null

  const seen = new Set<string>()
  const els: LabelElement[] = []
  const list = (r.elements as unknown[]).slice(0, 12)
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const t = String(o.type ?? '')
    if (!(t in LABEL_ELEMENT_META)) continue
    const type = t as LabelElementType
    let id = String(o.id ?? '') || `el-${type}-${i}`
    while (seen.has(id)) id = `${id}x`
    seen.add(id)
    const el: LabelElement = {
      id,
      type,
      xMm: r2(clampNum(o.xMm, 0, Math.max(0, W - 2), 0)),
      yMm: r2(clampNum(o.yMm, 0, Math.max(0, H - 1), 0)),
      wMm: r2(clampNum(o.wMm, 4, W, Math.min(W, 30))),
    }
    if (type === 'barcode') {
      el.heightMm = r2(clampNum(o.heightMm, 2, H, 8))
      const a = o.align
      el.align = a === 'right' || a === 'left' ? a : 'center'
    } else {
      el.fontSizePt = r2(clampNum(o.fontSizePt, 4, 40, 9))
      el.bold = o.bold !== false
      const a = o.align
      el.align = a === 'right' || a === 'left' ? a : 'center'
    }
    els.push(el)
  }
  return { v: 1, widthMm: W, heightMm: H, elements: els }
}

/** يضبط إحداثيات العناصر بعد تغيير مقاس الملصق (بتصغير/تكبير) — مفيش عنصر يطلع برّه. */
export function refitDesign(design: LabelDesign, widthMm: number, heightMm: number): LabelDesign {
  const W = clampDim(widthMm, 10, 300)
  const H = clampDim(heightMm, 10, 300)
  const elements = design.elements.map((el) => ({
    ...el,
    xMm: r2(clampNum(el.xMm, 0, Math.max(0, W - 2), 0)),
    yMm: r2(clampNum(el.yMm, 0, Math.max(0, H - 1), 0)),
    wMm: r2(clampNum(el.wMm, 4, W, Math.min(W, 30))),
    ...(el.type === 'barcode' ? { heightMm: r2(clampNum(el.heightMm, 2, H, 8)) } : {}),
  }))
  return { v: 1, widthMm: W, heightMm: H, elements }
}
