/**
 * 🎁 demo-data.ts — البيانات التجريبية لأول دخول (2026-10-23)
 * ─────────────────────────────────────────────────────────────────────────────
 * المشكلة: أي عميل جديد يفتح النظام يلاقي لوحة التحكم فاضية بالكامل.
 *
 * الحل: وقت التسجيل (وبزر «حمّل بيانات تجريبية» لو المحل فاضي) بنزرع محل
 * تجريبي كامل حسب نشاط الباقة (موبايل/كمبيوتر · ملابس وأحذية · مواد غذائية):
 * منتجات، عملاء، موردين، مشتريات، ~45 فاتورة آخر أسبوعين (بعضها آجل)،
 * مصروفات، تحصيلات، سداد موردين، وأوامر صيانة للإلكترونيات.
 *
 * الملف ده نصّين:
 *   1) buildDemoPayload() — دالة صافية (من غير أي استيراد من السيرفر) بتبني
 *      الـ payload من كتالوج ثابت + مولّد عشوائي بـ seed ثابت (نفس البيانات
 *      كل مرة = قابل للتوقّع والاختبار). بتتأكد بنفسها إن المخزون ما يبقاش
 *      سالب وإن الخزنة ما تنزلش تحت الصفر.
 *   2) seedDemoData / purgeDemoData / getDemoStatus — بيكلّموا دوال Postgres
 *      في prisma/sql/demo-data-v1.sql (استدعاء واحد لكل عملية → CPU أقل).
 *
 * ⚠️ كل الدوال هنا fail-open: لو الـ migration/SQL لسه ما اتركبش أو حصل أي
 * خطأ، التسجيل ما يتأثرش أبداً — العميل بس يلاقي محل فاضي زي الأول.
 */

import type { Sql } from '@/lib/sql'
import { DEFAULT_UNITS } from '@/lib/default-units'

export type DemoVertical = 'electronics' | 'fashion' | 'food'

export interface DemoOptions {
  tenantId: string
  /** المستخدم الأدمن صاحب المحل (يتسجل عليه الفواتير والخزنة) */
  userId: string
  vertical: DemoVertical
  /** الموديولات المتاحة في الباقة (من getPlanContext) */
  modules: string[]
  /** الـ capabilities المتاحة في الباقة (multi_unit / variants / ...) */
  capabilities: string[]
  limits: { maxUsers: number; maxProducts: number; maxBranches: number }
  /** مرجع فريد للمستخدم التجريبي (بيتحول لإيميل مش قابل للدخول) */
  demoUserEmail?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// الكتالوج
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogProduct {
  key: string
  name: string
  category: string
  price: number
  cost: number
  /** حد التنبيه */
  min: number
  /** الكمية المشتراة (لكل لون/مقاس لو فيه variants) */
  buy: number
  /** الشعبية (وزن اختيار المنتج في البيع) */
  pop: number
  /** true = المنتج هينزل لحد التنبيه (عشان تبان «تنبيهات المخزون المنخفض») */
  low?: boolean
  weight?: boolean
  unit?: string
  collection?: string
  variants?: { size?: string; color?: string }[]
  supplier: 'a' | 'b' | 'c'
}

const TSHIRT_VARIANTS = ['M', 'L', 'XL'].flatMap((size) => ['أبيض', 'أسود'].map((color) => ({ size, color })))
const JEANS_VARIANTS = ['30', '32', '34'].map((size) => ({ size, color: 'أزرق' }))
const DRESS_VARIANTS = ['S', 'M', 'L'].flatMap((size) => ['أسود', 'نبيتي'].map((color) => ({ size, color })))
const SHOE_VARIANTS = ['40', '41', '42', '43'].map((size) => ({ size, color: 'أبيض' }))

const CATALOGS: Record<DemoVertical, {
  categories: string[]
  products: CatalogProduct[]
  suppliers: [string, string, string]
}> = {
  electronics: {
    categories: ['موبايلات', 'إكسسوارات', 'شواحن وكابلات', 'سماعات', 'كمبيوتر'],
    suppliers: ['شركة النيل للموبايلات (تجريبي)', 'مؤسسة الأمل للإكسسوارات (تجريبي)', 'الشروق لمستلزمات الكمبيوتر (تجريبي)'],
    products: [
      { key: 'a15', name: 'سامسونج Galaxy A15 — 128 جيجا', category: 'موبايلات', price: 6200, cost: 5400, min: 2, buy: 8, pop: 3, supplier: 'a' },
      { key: 'c13', name: 'شاومي Redmi 13C — 128 جيجا', category: 'موبايلات', price: 4300, cost: 3700, min: 2, buy: 10, pop: 4, supplier: 'a' },
      { key: 'cover', name: 'جراب حماية شفاف', category: 'إكسسوارات', price: 120, cost: 60, min: 10, buy: 60, pop: 9, supplier: 'b' },
      { key: 'glass', name: 'اسكرينة حماية زجاج', category: 'إكسسوارات', price: 80, cost: 30, min: 10, buy: 80, pop: 10, supplier: 'b' },
      { key: 'chg', name: 'شاحن سريع 25 وات أصلي', category: 'شواحن وكابلات', price: 350, cost: 230, min: 5, buy: 25, pop: 6, supplier: 'b' },
      { key: 'cable', name: 'كابل Type-C مقوّى', category: 'شواحن وكابلات', price: 90, cost: 45, min: 8, buy: 40, pop: 8, supplier: 'b' },
      { key: 'buds', name: 'سماعة بلوتوث لاسلكية', category: 'سماعات', price: 450, cost: 300, min: 4, buy: 15, pop: 5, supplier: 'b' },
      { key: 'pb', name: 'باور بانك 10000 مللي أمبير', category: 'إكسسوارات', price: 520, cost: 380, min: 3, buy: 7, pop: 6, low: true, supplier: 'b' },
      { key: 'flash', name: 'فلاشة 32 جيجا', category: 'كمبيوتر', price: 190, cost: 120, min: 4, buy: 20, pop: 4, supplier: 'c' },
      { key: 'mouse', name: 'ماوس لاسلكي', category: 'كمبيوتر', price: 210, cost: 140, min: 3, buy: 8, pop: 5, low: true, supplier: 'c' },
    ],
  },
  fashion: {
    categories: ['تيشيرتات', 'بناطيل', 'فساتين', 'أحذية', 'إكسسوارات'],
    suppliers: ['مصنع النيل للملابس (تجريبي)', 'دار الأناقة (تجريبي)', 'مصنع الأحذية الحديثة (تجريبي)'],
    products: [
      { key: 'tee', name: 'تيشيرت قطن أساسي', category: 'تيشيرتات', price: 250, cost: 130, min: 3, buy: 5, pop: 10, collection: 'خريف 2026', variants: TSHIRT_VARIANTS, supplier: 'a' },
      { key: 'jeans', name: 'بنطلون جينز كلاسيك', category: 'بناطيل', price: 650, cost: 380, min: 3, buy: 6, pop: 7, collection: 'خريف 2026', variants: JEANS_VARIANTS, supplier: 'a' },
      { key: 'dress', name: 'فستان سهرة', category: 'فساتين', price: 1200, cost: 700, min: 2, buy: 3, pop: 4, variants: DRESS_VARIANTS, supplier: 'b' },
      { key: 'belt', name: 'حزام جلد طبيعي', category: 'إكسسوارات', price: 180, cost: 90, min: 4, buy: 20, pop: 5, supplier: 'b' },
      { key: 'shoe', name: 'كوتشي رياضي', category: 'أحذية', price: 850, cost: 520, min: 3, buy: 5, pop: 6, variants: SHOE_VARIANTS, supplier: 'c' },
      { key: 'scarf', name: 'إيشارب شتوي', category: 'إكسسوارات', price: 140, cost: 70, min: 4, buy: 14, pop: 3, low: true, supplier: 'b' },
    ],
  },
  food: {
    categories: ['لحوم وفراخ', 'ألبان وأجبان', 'بقالة', 'عطارة', 'منظفات'],
    suppliers: ['مزرعة الدلتا (تجريبي)', 'تجارة الجملة المتحدة (تجريبي)', 'شركة النظافة الحديثة (تجريبي)'],
    products: [
      { key: 'beef', name: 'لحم بقري مفروم (كيلو)', category: 'لحوم وفراخ', price: 380, cost: 300, min: 5, buy: 30, pop: 6, weight: true, supplier: 'a' },
      { key: 'chick', name: 'فراخ بيضاء (كيلو)', category: 'لحوم وفراخ', price: 95, cost: 72, min: 8, buy: 45, pop: 9, weight: true, supplier: 'a' },
      { key: 'cheese', name: 'جبنة رومي (كيلو)', category: 'ألبان وأجبان', price: 260, cost: 200, min: 3, buy: 6, pop: 6, weight: true, low: true, supplier: 'a' },
      { key: 'sugar', name: 'سكر (كيلو)', category: 'بقالة', price: 32, cost: 26, min: 15, buy: 120, pop: 8, weight: true, supplier: 'b' },
      { key: 'rice', name: 'أرز مصري (كيلو)', category: 'بقالة', price: 38, cost: 30, min: 15, buy: 100, pop: 7, weight: true, supplier: 'b' },
      { key: 'oil', name: 'زيت عباد الشمس 1 لتر', category: 'بقالة', price: 75, cost: 58, min: 10, buy: 48, pop: 8, unit: 'زجاجة', supplier: 'b' },
      { key: 'pasta', name: 'مكرونة 400 جرام', category: 'بقالة', price: 14, cost: 10, min: 20, buy: 100, pop: 9, unit: 'كيس', supplier: 'b' },
      { key: 'tea', name: 'شاي 200 جرام', category: 'عطارة', price: 85, cost: 65, min: 6, buy: 30, pop: 6, unit: 'علبة', supplier: 'b' },
      { key: 'soap', name: 'صابون سائل 1 لتر', category: 'منظفات', price: 60, cost: 42, min: 5, buy: 9, pop: 5, unit: 'زجاجة', low: true, supplier: 'c' },
    ],
  },
}

const CUSTOMER_NAMES = [
  'أحمد محمود (تجريبي)', 'سارة عبد الله (تجريبي)', 'محمد علي (تجريبي)',
  'منى السيد (تجريبي)', 'خالد إبراهيم (تجريبي)',
]

const EXPENSES: { daysAgo: number; category: string; amount: number; note: string }[] = [
  { daysAgo: 13, category: 'إيجار', amount: 3500, note: 'إيجار المحل' },
  { daysAgo: 10, category: 'كهرباء ومياه', amount: 420, note: 'فاتورة الكهرباء' },
  { daysAgo: 7, category: 'مرتبات', amount: 2000, note: 'مرتب موظف' },
  { daysAgo: 4, category: 'نقل ومواصلات', amount: 150, note: 'توصيل بضاعة' },
  { daysAgo: 2, category: 'إنترنت واتصالات', amount: 250, note: 'باقة الإنترنت' },
  { daysAgo: 1, category: 'ضيافة', amount: 90, note: 'شاي وقهوة' },
]

const MAINTENANCE = [
  { customerName: 'عمرو حسن (تجريبي)', phone: '01000000021', device: 'سامسونج A12', issue: 'شاشة مكسورة', cost: 850, status: 'مستلم', daysAgo: 1 },
  { customerName: 'هدى فتحي (تجريبي)', phone: '01000000022', device: 'آيفون 11', issue: 'بطارية ضعيفة', cost: 600, status: 'قيد العمل', daysAgo: 3 },
  { customerName: 'كريم سامي (تجريبي)', phone: '01000000023', device: 'شاومي Note 10', issue: 'لا يشحن', cost: 250, status: 'مكتمل', daysAgo: 5 },
  { customerName: 'ياسمين رضا (تجريبي)', phone: '01000000024', device: 'هواوي Y9', issue: 'تحديث سوفت وير', cost: 150, status: 'مُسلَّم', daysAgo: 8 },
]

/** عدد الفواتير في كل يوم من 13 يوم مضت لحد النهاردة */
const SALES_PER_DAY = [3, 2, 3, 4, 2, 3, 5, 3, 2, 4, 3, 3, 4, 4]

// ─────────────────────────────────────────────────────────────────────────────
// مولّد عشوائي بـ seed ثابت (نفس النتيجة كل مرة)
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const roundTo = (n: number, step: number) => Math.round(n / step) * step

// ─────────────────────────────────────────────────────────────────────────────
// بناء الـ payload
// ─────────────────────────────────────────────────────────────────────────────

export interface DemoPayload {
  tenantId: string
  userId: string
  vertical: DemoVertical
  prefix: string
  withBranch: boolean
  demoUser: { name: string; email: string } | null
  capital: number
  units: { name: string; factor: number }[]
  categories: string[]
  products: unknown[]
  customers: unknown[]
  suppliers: unknown[]
  purchases: unknown[]
  sales: SaleSpec[]
  customerPayments: unknown[]
  supplierPayments: unknown[]
  expenses: unknown[]
  maintenance: unknown[]
}

interface SaleSpec {
  daysAgo: number
  at: number
  customer?: string
  method: string
  paid: 'full' | number
  total: number
  lines: { p: string; qty: number; size?: string; color?: string }[]
}

export function buildDemoPayload(opts: DemoOptions): DemoPayload {
  const { vertical } = opts
  const cat = CATALOGS[vertical]
  const rng = mulberry32(20261023 + vertical.length * 7919)
  const supKeys = ['s1', 's2', 's3'] as const
  const supOf = { a: 's1', b: 's2', c: 's3' } as const

  // ── المنتجات (باركود داخلي ثابت لكل منتج/لون-مقاس) ──
  let bc = 1000
  const nextBarcode = () => `2990000${String(bc++).padStart(6, '0')}`
  const products = cat.products.map((p) => ({
    key: p.key, name: p.name, category: p.category, price: p.price,
    minQty: p.min, barcode: p.variants ? '' : nextBarcode(),
    soldByWeight: !!p.weight, unitLabel: p.unit ?? '', collection: p.collection ?? '',
    variants: (p.variants ?? []).map((v) => ({ ...v, barcode: nextBarcode() })),
  }))

  const customers = CUSTOMER_NAMES.map((name, i) => ({
    key: `c${i + 1}`, name, phone: `010000000${String(i + 1).padStart(2, '0')}`,
  }))
  const suppliers = cat.suppliers.map((name, i) => ({
    key: supKeys[i], name, phone: `010000001${String(i + 1).padStart(2, '0')}`,
  }))

  // ── المشتريات: كل مورد أمر شراء — المورد الأول آجل جزئي (بيظهر دين للموردين) ──
  const purchaseDays = { a: 13, b: 12, c: 11 } as const
  const purchases: unknown[] = []
  let paidOut = 0
  const supplierOwed: Record<string, number> = {}
  for (const s of ['a', 'b', 'c'] as const) {
    const mine = cat.products.filter((p) => p.supplier === s)
    if (!mine.length) continue
    const lines: { p: string; qty: number; cost: number; size?: string; color?: string }[] = []
    for (const p of mine) {
      if (p.variants) for (const v of p.variants) lines.push({ p: p.key, qty: p.buy, cost: p.cost, ...v })
      else lines.push({ p: p.key, qty: p.buy, cost: p.cost })
    }
    const total = round2(lines.reduce((t, l) => t + l.qty * l.cost, 0))
    const paid = s === 'a' ? roundTo(total * 0.6, 100) : total
    paidOut += paid
    supplierOwed[supOf[s]] = round2(total - paid)
    purchases.push({
      daysAgo: purchaseDays[s], at: 540 + (s === 'a' ? 0 : s === 'b' ? 15 : 30),
      supplier: supOf[s], paid: paid === total ? 'full' : paid,
      method: s === 'c' ? 'instapay' : 'cash', lines,
    })
  }

  // ── المبيعات: مولّد بيراعي المخزون (مفيش سالب) وبيخلّي منتجات «low» توصل لحد التنبيه ──
  const stock = new Map<string, number>()
  const stopAt = new Map<string, number>()
  const skey = (p: CatalogProduct, v?: { size?: string; color?: string }) =>
    v ? `${p.key}|${v.size ?? ''}|${v.color ?? ''}` : p.key
  for (const p of cat.products) {
    for (const v of p.variants ?? [undefined]) {
      stock.set(skey(p, v), p.buy)
      // low: يقف عند حد التنبيه بالظبط · غير كده: يفضل فوق الحد (مفيش تنبيه مزعج)
      stopAt.set(skey(p, v), p.low && !p.variants ? p.min : p.variants ? 1 : p.min + 1)
    }
  }
  const popTotal = cat.products.reduce((t, p) => t + p.pop, 0)
  const pickProduct = (exclude: Set<string>) => {
    for (let guard = 0; guard < 20; guard++) {
      let r = rng() * popTotal
      for (const p of cat.products) {
        r -= p.pop
        if (r <= 0) { if (!exclude.has(p.key)) return p; break }
      }
    }
    return null
  }

  const sales: SaleSpec[] = []
  const debt: Record<string, { day: number; amount: number }[]> = {}
  let creditSeq = 0
  SALES_PER_DAY.forEach((count, i) => {
    const daysAgo = SALES_PER_DAY.length - 1 - i
    const daySales: SaleSpec[] = []
    for (let n = 0; n < count; n++) {
      const nLines = 1 + (rng() < 0.45 ? 1 : 0) + (rng() < 0.15 ? 1 : 0)
      const used = new Set<string>()
      const lines: SaleSpec['lines'] = []
      let total = 0
      for (let k = 0; k < nLines; k++) {
        const p = pickProduct(used)
        if (!p) continue
        const v = p.variants ? p.variants[Math.floor(rng() * p.variants.length)] : undefined
        const sk = skey(p, v)
        const room = (stock.get(sk) ?? 0) - (stopAt.get(sk) ?? 0)
        let qty = p.weight
          ? [0.5, 1, 1.5, 2, 2.5][Math.floor(rng() * 5)]
          : 1 + (rng() < 0.25 ? 1 : 0) + (rng() < 0.08 ? 1 : 0)
        if (qty > room) qty = p.weight ? Math.floor(room * 2) / 2 : Math.floor(room)
        if (qty <= 0) continue
        used.add(p.key)
        stock.set(sk, (stock.get(sk) ?? 0) - qty)
        lines.push({ p: p.key, qty, ...(v ? { size: v.size, color: v.color } : {}) })
        total += p.price * qty
      }
      if (!lines.length) continue
      total = round2(total)

      const r = rng()
      let customer: string | undefined
      let method = 'cash'
      let paid: 'full' | number = 'full'
      if (r < 0.62) {
        if (rng() < 0.4) customer = `c${1 + Math.floor(rng() * 5)}`
      } else if (r < 0.78) {
        method = rng() < 0.5 ? 'vodafone_cash' : 'instapay'
      } else {
        // بيع آجل: لازم عميل مسجّل. نوزّع على أول 4 عملاء بالتناوب
        customer = `c${1 + (creditSeq++ % 4)}`
        paid = rng() < 0.5 ? 0 : Math.max(10, roundTo(total * 0.4, 10))
        if (typeof paid === 'number' && paid >= total) paid = 'full'
        if (paid !== 'full') (debt[customer] ??= []).push({ day: daysAgo, amount: round2(total - paid) })
      }
      daySales.push({ daysAgo, at: 600 + Math.floor(rng() * 600), customer, method, paid, total, lines })
    }
    daySales.sort((a, b) => a.at - b.at)
    sales.push(...daySales)
  })

  // ── تحصيل: أكبر عميلين مديونين يسدّدوا جزء (بعد الدين بيوم على الأقل) ──
  const customerPayments: { daysAgo: number; customer: string; amount: number; method: string; note: string }[] = []
  Object.entries(debt)
    .map(([c, rows]) => ({ c, sum: rows.reduce((t, r) => t + r.amount, 0), firstDay: Math.max(...rows.map((r) => r.day)) }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 2)
    .forEach((d, idx) => {
      const payDay = Math.max(0, d.firstDay - 2 - idx)
      const owedByThen = debt[d.c].filter((r) => r.day > payDay).reduce((t, r) => t + r.amount, 0)
      const amount = Math.floor((owedByThen * 0.5) / 10) * 10
      if (amount >= 10) customerPayments.push({ daysAgo: payDay, customer: d.c, amount, method: idx ? 'instapay' : 'cash', note: 'دفعة على الحساب' })
    })

  // ── سداد للمورد الأول (نص المتبقي) ──
  const supplierPayments: unknown[] = []
  const owed1 = supplierOwed.s1 ?? 0
  if (owed1 >= 100) {
    const amount = roundTo(owed1 * 0.5, 100)
    paidOut += amount
    supplierPayments.push({ supplier: 's1', daysAgo: 6, amount, method: 'cash', note: 'دفعة من الحساب' })
  }

  const expenses = EXPENSES
  paidOut += expenses.reduce((t, e) => t + e.amount, 0)
  // رأس مال يغطي كل الخارج → الخزنة ما تنزلش تحت الصفر في أي لحظة
  const capital = Math.ceil((paidOut + 5000) / 5000) * 5000

  const mods = new Set(opts.modules)
  const withMaint = vertical === 'electronics' && mods.has('maintenance')
  const withBranch = mods.has('branches') && opts.limits.maxBranches >= 1
  const demoUser = opts.limits.maxUsers >= 3
    ? { name: 'كاشير تجريبي (معطّل)', email: opts.demoUserEmail ?? `demo-${opts.tenantId}@demo.invalid` }
    : null

  return {
    tenantId: opts.tenantId,
    userId: opts.userId,
    vertical,
    prefix: 'INV',
    withBranch,
    demoUser,
    capital,
    units: opts.capabilities.includes('multi_unit') && vertical !== 'food' ? DEFAULT_UNITS : [],
    categories: cat.categories,
    products,
    customers,
    suppliers,
    purchases,
    sales,
    customerPayments,
    supplierPayments,
    expenses,
    maintenance: withMaint ? MAINTENANCE : [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// دوال قاعدة البيانات (استدعاء SQL واحد لكل عملية)
// ─────────────────────────────────────────────────────────────────────────────

export type SeedResult =
  | { ok: true; counts: Record<string, number | boolean> }
  | { ok: false; skipped: string }

/** يزرع البيانات التجريبية. fail-open: أي خطأ يرجّع {ok:false} ومايرميش exception. */
export async function seedDemoData(sql: Sql, opts: DemoOptions): Promise<SeedResult> {
  try {
    const payload = buildDemoPayload(opts)
    if (opts.limits.maxProducts < payload.products.length) return { ok: false, skipped: 'plan_limit' }
    const rows = await sql`SELECT seed_demo_data(${sql.json(payload as never)}::jsonb) AS r`
    return (rows[0]?.r ?? { ok: false, skipped: 'no_result' }) as SeedResult
  } catch (e) {
    console.error('[demo-data] seed failed (non-fatal):', e)
    return { ok: false, skipped: 'error' }
  }
}

export async function purgeDemoData(sql: Sql, tenantId: string) {
  const rows = await sql`SELECT purge_demo_data(${tenantId}) AS r`
  return rows[0]?.r as {
    ok: boolean
    purged: boolean
    reason?: string
    deleted?: Record<string, number>
    keptAsReal?: Record<string, number>
  }
}

export interface DemoStatus {
  active: boolean
  counts: { products: number; customers: number; suppliers: number; sales: number }
  /** المحل فيه فواتير حقيقية (مش تجريبية) — الواجهة بتحذّر قبل المسح */
  hasRealSales: boolean
  /** المحل فاضي تماماً → ينفع نزرع بيانات تجريبية */
  canSeed: boolean
}

export async function getDemoStatus(sql: Sql, tenantId: string): Promise<DemoStatus> {
  const empty: DemoStatus = {
    active: false, counts: { products: 0, customers: 0, suppliers: 0, sales: 0 },
    hasRealSales: false, canSeed: false,
  }
  try {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE d."tbl" = 'Product')::int  AS products,
        COUNT(*) FILTER (WHERE d."tbl" = 'Customer')::int AS customers,
        COUNT(*) FILTER (WHERE d."tbl" = 'Supplier')::int AS suppliers,
        COUNT(*) FILTER (WHERE d."tbl" = 'Sale')::int     AS sales,
        COUNT(*)::int AS total,
        EXISTS (
          SELECT 1 FROM "Sale" s
          WHERE s."tenantId" = ${tenantId}
            AND NOT EXISTS (SELECT 1 FROM "DemoRecord" x
                            WHERE x."tenantId" = ${tenantId} AND x."tbl" = 'Sale' AND x."rowId" = s."id"::text)
        ) AS "hasRealSales",
        NOT (
          EXISTS (SELECT 1 FROM "Product"  WHERE "tenantId" = ${tenantId}) OR
          EXISTS (SELECT 1 FROM "Customer" WHERE "tenantId" = ${tenantId}) OR
          EXISTS (SELECT 1 FROM "Supplier" WHERE "tenantId" = ${tenantId}) OR
          EXISTS (SELECT 1 FROM "Sale"     WHERE "tenantId" = ${tenantId}) OR
          EXISTS (SELECT 1 FROM "CashEntry" WHERE "tenantId" = ${tenantId})
        ) AS "canSeed"
      FROM "DemoRecord" d WHERE d."tenantId" = ${tenantId}`
    const r = rows[0]
    if (!r) return empty
    return {
      active: Number(r.total) > 0,
      counts: { products: r.products, customers: r.customers, suppliers: r.suppliers, sales: r.sales },
      hasRealSales: !!r.hasRealSales,
      canSeed: !!r.canSeed,
    }
  } catch {
    return empty // الجدول لسه ما اتركبش → الميزة مخفية
  }
}
