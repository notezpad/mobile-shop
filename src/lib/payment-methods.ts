/**
 * وسائل الدفع — إعداد لكل محل (Per-tenant payment methods config).
 *
 * 🧩 2026-10-31 (طلب صاحب المنصة): كل عميل عايز مجموعة وسائل مختلفة في
 * نقطة البيع — عميل بياخد كاش + فيزا + انستاباي + محفظة، وعميل كاش +
 * محفظة بس، وعميل كاش فقط. قبل كده ده كان كود ثابت (hardcoded) وكل تغيير
 * كان محتاج تعديل في الكود وإعادة نشر. دلوقتي الوسائل بقت **بيانات**:
 *
 *   - صاحب المحل يتحكم فيها من الإعدادات → «وسائل الدفع» بمفاتيح تشغيل/إيقاف.
 *   - قسمن لكل وسيلة: تظهر في «نقطة البيع»؟ وتظهر في «دفعات العملاء»؟
 *   - الاسم نفسه قابل للتعديل (مثلاً «محفظة» → «فودافون كاش»).
 *   - وسائل مخصصة بإضافة + حذف (أي حاجة المستخدم عايزها — أمان، محفظة تانية...).
 *
 * 🛡️ سلوك المحلات الموجودة: لو الحقل فاضي ('' — يعني المحل لسه ما فتحش
 * الإعدادات)، النظام يرجع للسلوك القديم بالظبط:
 *   - نقطة البيع: كاش + محفظة فقط (انستاباي/فوري اتشالوا من الكاشير بطلب
 *     صاحب المحل — ده كان hardcoded في POSView).
 *   - دفعات العملاء: كاش + محفظة + انستاباي + فوري (زي customer-dialog-ui).
 * يعني الترقية صفر تأثير بصري على أي محل موجود، والمرونة بتفعّل أول ما
 * صاحب المحل يحفظ إعداداته لأول مرة.
 *
 * 🛡️ قاعدة ثابتة: «كاش» مش بتتقفل أبداً (ولا في نقطة البيع ولا في الدفعات) —
 * محل من غير كاش مالوش معنى، ودي ضمانة إن أي شاشة دفع يبقى فيها اختيار صحيح.
 *
 * الملف ده isomorphic (شغال على السيرفر في الـ API وعلى العميل في الـ UI)
 * — مفيش فيه أي React أو lucide، عشان كده الأيقونات متعرفة في ملفات الواجهة.
 */

export interface PaymentMethodConfig {
  /** معرّف ثابت يُخزَّن مع الفاتورة/الدفعة: builtin زي 'cash' أو مخصص 'custom_...' */
  id: string
  /** الاسم المعروض — قابل للتعديل من صاحب المحل */
  label: string
  /** يظهر كزر في نقطة البيع (شاشة الكاشير) */
  pos: boolean
  /** يظهر في دفعات/تحصيل العملاء (دايلوج «تسجيل دفعة عميل») */
  collect: boolean
  /** وسيلة مدمجة في النظام (مش قابلة للحذف — العكس: مخصصة وقابلة للحذف) */
  builtin: boolean
}

export const BUILTIN_PAYMENT_METHOD_IDS = [
  'cash',
  'card',
  'vodafone_cash',
  'instapay',
  'fawry',
] as const

export type BuiltinPaymentMethodId = (typeof BUILTIN_PAYMENT_METHOD_IDS)[number]

/** الحد الأقصى لعدد الوسائل (مدمجة + مخصصة) — عشان شاشة الكاشير تفضل مرتبة */
export const MAX_PAYMENT_METHODS = 12

export function isBuiltinMethodId(id: string): boolean {
  return (BUILTIN_PAYMENT_METHOD_IDS as readonly string[]).includes(id)
}

/** أي id مخصص بيتولد بصيغة موحدة عشان الـ API يعرف يميّزه */
export function customMethodId(): string {
  return `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const BUILTIN_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  vodafone_cash: 'محفظة',
  instapay: 'انستاباي',
  fawry: 'فوري',
}

/**
 * الترتيب القياسي للوسائل المدمجة — نقطة البيع والقوائم بتظهر كده
 * (الكاش الأول دايماً، لأنه الأكثر استخداماً).
 */
function builtinOrder(id: string): number {
  const i = (BUILTIN_PAYMENT_METHOD_IDS as readonly string[]).indexOf(id)
  return i === -1 ? BUILTIN_PAYMENT_METHOD_IDS.length : i
}

function sortMethods(list: PaymentMethodConfig[]): PaymentMethodConfig[] {
  return [...list].sort(
    (a, b) =>
      (a.builtin ? builtinOrder(a.id) : 1000) - (b.builtin ? builtinOrder(b.id) : 1000)
  )
}

/**
 * الإعداد الافتراضي (اللي بيتعرض في الإعدادات أول مرة / لما الحقل فاضي):
 * نفس سلوك النظام الحالي — نقطة البيع: كاش + محفظة، والدفعات: كاش + محفظة
 * + انستاباي + فوري. البطاقة موجودة كاختيار متوقف لحد ما صاحب المحل يفعّلها.
 */
export function defaultPaymentMethodsConfig(): PaymentMethodConfig[] {
  return [
    { id: 'cash', label: 'كاش', pos: true, collect: true, builtin: true },
    { id: 'card', label: 'بطاقة', pos: false, collect: false, builtin: true },
    { id: 'vodafone_cash', label: 'محفظة', pos: true, collect: true, builtin: true },
    { id: 'instapay', label: 'انستاباي', pos: false, collect: true, builtin: true },
    { id: 'fawry', label: 'فوري', pos: false, collect: true, builtin: true },
  ]
}

/* ─────────────── القراءة (عميل + سيرفر) ─────────────── */

function sanitizeItem(raw: any): PaymentMethodConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!/^[a-z0-9_]{2,32}$/.test(id)) return null
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 24) : ''
  if (!label) return null
  return {
    id,
    label,
    pos: raw.pos === true,
    collect: raw.collect === true,
    builtin: isBuiltinMethodId(id),
  }
}

/**
 * يقرأ إعداد الوسائل من قاعدة البيانات (JSON string) بأمان تام —
 * أي شكل غلط/قديم/تالف يرجّع الافتراضي (سلوك النظام الحالي) بدل ما يكسر شاشة.
 */
export function parsePaymentMethodsConfig(raw: unknown): PaymentMethodConfig[] {
  if (raw == null) return defaultPaymentMethodsConfig()
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return defaultPaymentMethodsConfig()
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return defaultPaymentMethodsConfig()
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return defaultPaymentMethodsConfig()
  }
  const seen = new Set<string>()
  const list: PaymentMethodConfig[] = []
  for (const item of parsed) {
    const m = sanitizeItem(item)
    if (!m || seen.has(m.id)) continue
    seen.add(m.id)
    list.push(m)
  }
  // 🛡️ «كاش» دايماً شغالة في الاتنين — أي إعداد قديم/يدوي من غيرها بيتصحح تلقائياً
  if (!seen.has('cash')) {
    list.push({ id: 'cash', label: BUILTIN_LABELS.cash, pos: true, collect: true, builtin: true })
  } else {
    const cash = list.find((m) => m.id === 'cash')
    if (cash) {
      cash.pos = true
      cash.collect = true
    }
  }
  // لازم فيه وسيلة واحدة على الأقل لكل شاشة — «كاش» بيكفل ده عملياً،
  // بس لو إعداد قديم فاضي الاتنين بيرجع للافتراضي كله.
  if (!list.some((m) => m.pos) || !list.some((m) => m.collect)) {
    return defaultPaymentMethodsConfig()
  }
  return sortMethods(list)
}

/** التخزين في قاعدة البيانات: JSON string مختصر (من غير حقل builtin — بيتشتق) */
export function serializePaymentMethodsConfig(list: PaymentMethodConfig[]): string {
  return JSON.stringify(
    list.map((m) => ({ id: m.id, label: m.label, pos: m.pos, collect: m.collect }))
  )
}

/** الوسائل المفعّلة لشاشة معينة — دي اللي بتترسم في الواجهة */
export function enabledMethods(
  list: PaymentMethodConfig[],
  surface: 'pos' | 'collect'
): PaymentMethodConfig[] {
  return list.filter((m) => (surface === 'pos' ? m.pos : m.collect))
}

/** اسم وسيلة للعرض (تقارير/سجل) — بيرجع للـ id نفسه لو مش معروف */
export function methodLabelOf(list: PaymentMethodConfig[], id?: string | null): string | null {
  if (!id) return null
  return list.find((m) => m.id === id)?.label ?? id
}

/* ─────────────── التحقق على السيرفر (PUT /api/tenant) ─────────────── */

export interface NormalizeResult {
  ok: boolean
  error?: string
  list?: PaymentMethodConfig[]
  /** JSON string جاهز للتخزين في عمود Tenant.paymentMethodsConfig */
  serialized?: string
}

/**
 * تحقق صارم من إعداد الوسائل القادم من الواجهة قبل التخزين.
 * القواعد:
 *   - من 1 إلى MAX_PAYMENT_METHODS وسيلة، بدون تكرار معرفات.
 *   - الـ id: حروف لاتينية صغيرة/أرقام/شرطة سفلية (2-32). غير المدمج لازم 'custom_'.
 *   - الاسم: 1-24 حرف بعد التشذيب.
 *   - «كاش» بتتفرض مفعّلة في الشاشتين — السيرفر بيفرضها حتى لو الطلب عكس.
 */
export function normalizePaymentMethodsConfig(input: unknown): NormalizeResult {
  // 🛡️ 2026-11-01 (v15 — إصلاح «شكل وسائل الدفع غير صالح»): صفحة الإعدادات
  // بتبعت الإعداد **كنص JSON** (نفس شكل التخزين في قاعدة البيانات بالظبط —
  // TenantData.paymentMethodsConfig نوعه string، وsetPmList بترسّله بـ
  // serializePaymentMethodsConfig). التحقق هنا كان بيطالب بمصفوفة مباشرة
  // فأي حفظ فيه تغيير وسائل كان بيرجع 400 دايماً والوسائل عمرها ما بتتحفظ.
  // بنقبل الشكلين: نص JSON بنفكّه بنفسنا (و failure في الفكّ بنرجّع نفس
  // رسالة «شكل غير صالح»)، أو مصفوفة زي ما هي.
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    } catch {
      return { ok: false, error: 'شكل وسائل الدفع غير صالح' }
    }
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'شكل وسائل الدفع غير صالح' }
  }
  if (input.length < 1 || input.length > MAX_PAYMENT_METHODS) {
    return { ok: false, error: `عدد وسائل الدفع يجب أن يكون من 1 إلى ${MAX_PAYMENT_METHODS}` }
  }
  const seen = new Set<string>()
  const list: PaymentMethodConfig[] = []
  for (const raw of input) {
    const m = sanitizeItem(raw)
    if (!m) {
      return { ok: false, error: 'أحدى وسائل الدفع ببيانات ناقصة أو غير صالحة' }
    }
    if (!m.builtin && !m.id.startsWith('custom_')) {
      return { ok: false, error: 'معرّف الوسيلة المخصصة غير صالح' }
    }
    if (seen.has(m.id)) {
      return { ok: false, error: 'فيه وسيلة دفع مكررة' }
    }
    seen.add(m.id)
    list.push(m)
  }
  const cash = list.find((m) => m.id === 'cash')
  if (!cash) {
    return { ok: false, error: 'وسيلة «كاش» إجبارية — مش ممكن تتشال من الإعداد' }
  }
  cash.pos = true
  cash.collect = true
  if (!list.some((m) => m.pos) || !list.some((m) => m.collect)) {
    return { ok: false, error: 'لازم وسيلة واحدة مفعّلة على الأقل في كل شاشة' }
  }
  const finalList = sortMethods(list)
  return { ok: true, list: finalList, serialized: serializePaymentMethodsConfig(finalList) }
}
