/**
 * v9 PERF SEED — بذر بيانات ضخمة واقعية للمحل التجريبي
 * ─────────────────────────────────────────────────────────────────────────
 * الهدف: محاكاة محل شغال فعلاً (90 يوم تشغيل) عشان قياسات الأداء قبل/بعد
 * تكون معبرة عن الإنتاج، مش عن قاعدة فاضية.
 *
 * الأحجام:
 *   2 فرع · 400 منتج · 220 عميل · 8 موردين · 3000 فاتورة (≈8500 صنف)
 *   ≈2900 قيد خزنة + 300 عمولة · 1200 حركة مخزون · 260 مصروف
 *   160 معاملة محفظة · 45 أمر صيانة · 80 أمر شراء · 12 تحويل · 5 جرد
 *
 * التشغيل:  bun run scripts/seed-v9-perf.ts
 * آمن للتكرار (idempotent): لو الفواتير موجودة بيخرج من غير ما يضيف.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://nezam:nezam@127.0.0.1:5433/nezampos'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 10 } as never) })

const TENANT = 'demo-tenant'
const ADMIN = 'admin@demo.com'

// مولد أرقام عشوائية بثابت (reproducible)
let seedState = 20261006
function rnd(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648
  return seedState / 2147483648
}
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const PRODUCT_NAMES: [string, string, number, number][] = [
  // [اسم، تصنيف، سعر، تكلفة]
  ['شاحن سريع', 'شواحن', 180, 120],
  ['شاحن أصلي', 'شواحن', 320, 240],
  ['كابل Type-C', 'كابلات', 55, 30],
  ['كابل Lightning', 'كابلات', 75, 45],
  ['سماعة بلوتوث TWS', 'سماعات', 450, 310],
  ['سماعة سلكية', 'سماعات', 90, 50],
  ['سماعة رأس Gaming', 'سماعات', 850, 620],
  ['كفر شفاف', 'كفرات', 65, 28],
  ['كفر جلد فاخر', 'كفرات', 190, 110],
  ['اسكرين حماية زجاج', 'إكسسوارات', 45, 18],
  ['باور بانك 10000mAh', 'باور بانك', 520, 380],
  ['باور بانك 20000mAh', 'باور بانك', 780, 560],
  ['حامل موبايل للسيارة', 'إكسسوارات', 140, 80],
  ['ذاكرة فلاش 64GB', 'تخزين', 160, 100],
  ['ذاكرة فلاش 128GB', 'تخزين', 260, 175],
  ['ماوس لاسلكي', 'كمبيوتر', 220, 140],
  ['كيبورد بلوتوث', 'كمبيوتر', 380, 260],
  ['ساعة ذكية', 'إلكترونيات', 1200, 880],
  ['سوار لياقة', 'إلكترونيات', 650, 440],
  ['سبيكر بلوتوث', 'سماعات', 550, 390],
]
const BRANDS = ['Aurora', 'TechPro', 'MaxFit', 'UltraCell', 'PowerLine', 'SmartGrip', 'NovaTech']
const CUST_FIRST = ['أحمد', 'محمد', 'مصطفى', 'عمر', 'خالد', 'كريم', 'يوسف', 'حسن', 'طارق', 'سامي', 'منى', 'سارة', 'هدى', 'نورا', 'دينا', 'أميرة', 'فاطمة', 'ليلى']
const CUST_LAST = ['عبد الله', 'السيد', 'إبراهيم', 'منصور', 'شعبان', 'رمضان', 'الشريف', 'عوض', 'بيومي', 'زكي']
const EXPENSE_CATS = ['إيجار', 'كهرباء', 'رواتب', 'نقل وشحن', 'صيانة', 'دعاية وإعلان', 'قرطاسية', 'هالك وتالف']
const METHODS = ['cash', 'cash', 'cash', 'vodafone_cash', 'instapay', 'fawry']

async function main() {
  console.log('🚀 v9 PERF SEED — بدء البذر...')
  const N_SALES = 3000

  // ── 0. تأكيد أن البذر الأساسي اتنفذ ──
  const baseUser = await db.user.findUnique({ where: { email: ADMIN } })
  if (!baseUser) throw new Error('نفّذ scripts/seed.ts الأول (بيأنشئ admin@demo.com)')
  const existingSales = await db.sale.count({ where: { tenantId: TENANT } })
  if (existingSales >= N_SALES) {
    console.log(`⏩ فيه ${existingSales} فاتورة كاملة بالفعل — البذر متخطى (idempotent)`)
    return
  }
  // 🧹 تنظيف بذر جزئي من محاولة فاشلة (سكيبت اتوقف في النص) — بنمسح البيانات
  // التشغيلية بس ونسب الأصول/العملاء/الموردين زي ما هما، وبنصفر الأرصدة.
  if (existingSales > 0) {
    console.log(`🧹 فيه ${existingSales} فاتورة جزئية — تنظيف وإعادة بذر...`)
    await db.saleItem.deleteMany({ where: { sale: { tenantId: TENANT } } })
    await db.sale.deleteMany({ where: { tenantId: TENANT } })
    await db.cashEntry.deleteMany({ where: { tenantId: TENANT } })
    await db.stockMovement.deleteMany({ where: { tenantId: TENANT } })
    await db.expense.deleteMany({ where: { tenantId: TENANT } })
    await db.transaction.deleteMany({ where: { tenantId: TENANT } })
    await db.maintenanceOrder.deleteMany({ where: { tenantId: TENANT } })
    await db.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId: TENANT } } })
    await db.purchaseOrder.deleteMany({ where: { tenantId: TENANT } })
    await db.transferItem.deleteMany({ where: { transfer: { tenantId: TENANT } } })
    await db.transfer.deleteMany({ where: { tenantId: TENANT } })
    await db.stocktakeItem.deleteMany({ where: { stocktake: { tenantId: TENANT } } })
    await db.stocktake.deleteMany({ where: { tenantId: TENANT } })
    await db.customer.updateMany({ where: { tenantId: TENANT }, data: { balance: 0 } })
    await db.supplier.updateMany({ where: { tenantId: TENANT }, data: { balance: 0 } })
  }

  // ── 1. فروع ──
  const bCount = await db.branch.count({ where: { tenantId: TENANT } })
  let branchIds: number[] = []
  if (bCount === 0) {
    const b1 = await db.branch.create({ data: { tenantId: TENANT, name: 'الفرع الرئيسي', isMain: true, active: true } })
    const b2 = await db.branch.create({ data: { tenantId: TENANT, name: 'فرع المعادي', isMain: false, active: true } })
    branchIds = [b1.id, b2.id]
  } else {
    branchIds = (await db.branch.findMany({ where: { tenantId: TENANT } })).map((b) => b.id)
  }
  console.log(`✓ فروع: ${branchIds.length}`)

  // ── 2. منتجات (400) ──
  const pCount = await db.product.count({ where: { tenantId: TENANT } })
  if (pCount < 400) {
    const products: any[] = []
    for (let i = 0; i < 400; i++) {
      const [base, cat, price, cost] = PRODUCT_NAMES[i % PRODUCT_NAMES.length]
      const brand = BRANDS[i % BRANDS.length]
      const variant = ['S', 'M', 'L', 'XL', 'أسود', 'أبيض', 'أزرق', 'فضي', 'Pro', 'Max'][i % 10]
      const qty = ri(0, 60)
      products.push({
        tenantId: TENANT,
        branchId: i % 5 === 0 ? branchIds[1] : branchIds[0],
        name: `${base} ${brand} ${variant} ${Math.floor(i / PRODUCT_NAMES.length) + 1}`,
        category: cat,
        barcode: `200${String(1000000 + i).slice(-7)}${ri(0, 9)}`,
        price: price + ri(-10, 40),
        cost,
        quantity: qty,
        minQuantity: ri(2, 8),
      })
    }
    for (const c of chunk(products, 200)) await db.product.createMany({ data: c })
  }
  const products = await db.product.findMany({ where: { tenantId: TENANT }, select: { id: true, name: true, price: true, cost: true, category: true } })
  console.log(`✓ منتجات: ${products.length}`)

  // ── 3. عملاء (220) ──
  const cCount = await db.customer.count({ where: { tenantId: TENANT } })
  if (cCount < 220) {
    const customers: any[] = []
    for (let i = 0; i < 220; i++) {
      customers.push({
        tenantId: TENANT,
        name: `${pick(CUST_FIRST)} ${pick(CUST_LAST)} ${i + 1}`,
        phone: `01${ri(0, 2)}${String(10000000 + i * 37).slice(-8)}`,
        balance: 0,
      })
    }
    for (const c of chunk(customers, 200)) await db.customer.createMany({ data: c })
  }
  const customers = await db.customer.findMany({ where: { tenantId: TENANT }, select: { id: true } })
  console.log(`✓ عملاء: ${customers.length}`)

  // ── 4. موردين (8) ──
  const sCount = await db.supplier.count({ where: { tenantId: TENANT } })
  if (sCount < 8) {
    const names = ['الشركة المتحدة للتوريدات', 'مؤسسة النور للإلكترونيات', 'مصر تريد', 'الشرق للأصول', 'التوكيل العالمي', 'دلتا سباير', 'النيل للتكنولوجيا', 'ألفا ستور']
    for (let i = 0; i < names.length; i++) {
      await db.supplier.create({ data: { tenantId: TENANT, name: names[i], phone: `012${String(70000000 + i * 101).slice(-8)}`, balance: 0 } })
    }
  }
  const suppliers = await db.supplier.findMany({ where: { tenantId: TENANT }, select: { id: true } })
  console.log(`✓ موردين: ${suppliers.length}`)

  // ── 5. فواتير البيع (3000 على 90 يوم) ──
  const NOW = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  const sales: any[] = []
  const cashEntries: any[] = []
  const custBalance = new Map<number, number>()
  for (let i = 0; i < N_SALES; i++) {
    const createdAt = new Date(NOW - ri(0, 89) * DAY - ri(8, 22) * 3600 * 1000 - ri(0, 59) * 60000)
    const itemCount = ri(1, 4)
    let total = 0
    const saleItems: { productId: number; name: string; price: number; cost: number; quantity: number }[] = []
    for (let j = 0; j < itemCount; j++) {
      const p = pick(products)
      const qty = ri(1, 3)
      total += p.price * qty
      saleItems.push({ productId: p.id, name: p.name, price: p.price, cost: p.cost, quantity: qty })
    }
    const r = rnd()
    let status = 'مكتملة'
    if (r > 0.97) status = 'مرتجعة'
    else if (r > 0.92) status = 'مرتجعة جزئياً'
    const method = pick(METHODS)
    const hasCustomer = rnd() > 0.45
    const customerId = hasCustomer ? pick(customers).id : null
    let paid = status === 'مكتملة' ? total : status === 'مرتجعة جزئياً' ? total * 0.6 : 0
    let dueDate: Date | null = null
    if (status === 'مكتملة' && customerId && rnd() > 0.82) {
      // فاتورة آجلة: مدفوع جزئي + استحقاق
      paid = Math.round(total * 0.5)
      dueDate = new Date(createdAt.getTime() + 14 * DAY)
      custBalance.set(customerId, (custBalance.get(customerId) ?? 0) + (total - paid))
    }
    const sale: any = {
      _items: saleItems,
      tenantId: TENANT,
      branchId: branchIds[i % branchIds.length],
      invoiceNo: `INV-${1001 + i}`,
      customerId,
      userId: ADMIN,
      total: Math.round(total * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      paymentMethod: method,
      status,
      dueDate,
      createdAt,
    }
    sales.push(sale)
    // قيد خزنة لكل مدفوع
    if (paid > 0) {
      cashEntries.push({ tenantId: TENANT, source: 'sale', refId: null, amount: paid, method, note: null, userId: ADMIN, createdAt })
      // عمولة المحفظة
      if (method !== 'cash') {
        const comm = Math.round(paid * (method === 'vodafone_cash' ? 0.01 : method === 'instapay' ? 0.005 : 0.01) * 100) / 100
        cashEntries.push({ tenantId: TENANT, source: 'commission', refId: null, amount: comm, method, note: 'عمولة محفظة', userId: ADMIN, createdAt })
      }
    }
  }
  for (const c of chunk(sales.map(({ _items, ...rest }) => rest), 300)) await db.sale.createMany({ data: c })
  console.log(`✓ فواتير: ${sales.length}`)

  // ── 6. أصناف الفواتير (saleId بالترتيب) ──
  const saleRows = await db.sale.findMany({ where: { tenantId: TENANT }, select: { id: true }, orderBy: { id: 'asc' } })
  const items: any[] = []
  for (let i = 0; i < saleRows.length; i++) {
    for (const it of (sales[i] as any)._items ?? []) {
      items.push({ saleId: saleRows[i].id, ...it, returnedQty: 0 })
    }
  }
  for (const c of chunk(items, 1500)) await db.saleItem.createMany({ data: c })
  console.log(`✓ أصناف الفواتير: ${items.length}`)

  // ── 7. قيود الخزنة + أرصدة العملاء ──
  // ربط refId بآخر ids (تقريبي كفاية للعرض)
  const minSaleId = saleRows[0]?.id ?? 1
  for (const e of cashEntries) if (e.source === 'sale' && e.refId === null) e.refId = minSaleId + ri(0, N_SALES - 1)
  for (const c of chunk(cashEntries, 500)) await db.cashEntry.createMany({ data: c })
  console.log(`✓ قيود الخزنة: ${cashEntries.length}`)
  const balRows = [...custBalance.entries()]
  for (const [cid, bal] of balRows) {
    await db.customer.update({ where: { id: cid }, data: { balance: { increment: Math.round(bal * 100) / 100 } } })
  }
  console.log(`✓ أرصدة آجلة لـ ${balRows.length} عميل`)

  // ── 8. حركات مخزون (1200) ──
  const movements: any[] = []
  const mvTypes = ['in', 'out', 'adjust', 'sale', 'transfer_in', 'transfer_out', 'damage', 'return']
  for (let i = 0; i < 1200; i++) {
    const p = pick(products)
    const type = pick(mvTypes)
    const qty = type === 'in' ? ri(5, 40) : ri(1, 6)
    movements.push({
      tenantId: TENANT,
      branchId: pick(branchIds),
      productId: p.id,
      type,
      quantity: type === 'in' ? qty : -qty,
      refType: 'manual',
      refId: null,
      note: type === 'in' ? 'توريد من المورد' : type === 'damage' ? 'هالك منقول' : null,
      userId: ADMIN,
      createdAt: new Date(NOW - ri(0, 89) * DAY - ri(0, 20) * 3600 * 1000),
    })
  }
  for (const c of chunk(movements, 400)) await db.stockMovement.createMany({ data: c })
  console.log(`✓ حركات مخزون: ${movements.length}`)

  // ── 9. مصروفات (260) ──
  const expenses: any[] = []
  for (let i = 0; i < 260; i++) {
    expenses.push({
      tenantId: TENANT,
      branchId: i % 4 === 0 ? branchIds[1] : branchIds[0],
      category: pick(EXPENSE_CATS),
      amount: ri(60, 4500),
      note: null,
      userId: ADMIN,
      createdAt: new Date(NOW - ri(0, 89) * DAY),
    })
  }
  await db.expense.createMany({ data: expenses })
  console.log(`✓ مصروفات: ${expenses.length}`)

  // ── 10. معاملات محفظة (160) ──
  const transactions: any[] = []
  for (let i = 0; i < 160; i++) {
    const method = pick(['vodafone_cash', 'instapay', 'fawry'])
    transactions.push({
      tenantId: TENANT,
      method,
      kind: rnd() > 0.4 ? 'deposit' : 'withdraw',
      amount: ri(100, 6000),
      commission: method === 'vodafone_cash' ? 1 : 0.5,
      note: null,
      userId: ADMIN,
      status: 'active',
      createdAt: new Date(NOW - ri(0, 89) * DAY),
    })
  }
  await db.transaction.createMany({ data: transactions })
  console.log(`✓ معاملات محفظة: ${transactions.length}`)

  // ── 11. صيانة (45) ──
  const maintenance: any[] = []
  for (let i = 0; i < 45; i++) {
    const receivedAt = new Date(NOW - ri(0, 89) * DAY)
    const done = rnd() > 0.35
    maintenance.push({
      tenantId: TENANT,
      customerName: `${pick(CUST_FIRST)} ${pick(CUST_LAST)}`,
      phone: `010${ri(10000000, 99999999)}`,
      device: pick(['iPhone 12', 'iPhone 13', 'Samsung A52', 'Xiaomi Redmi Note 11', 'Oppo A54', 'Realme C55']),
      issue: pick(['شاشة', 'بطارية', 'شحن', 'سوفت وير', 'شبكة']),
      cost: ri(150, 2500),
      status: done ? 'مُسلَّم' : pick(['مستلم', 'قيد العمل', 'مكتمل']),
      receivedAt,
      deliveredAt: done ? new Date(receivedAt.getTime() + ri(1, 5) * DAY) : null,
    })
  }
  await db.maintenanceOrder.createMany({ data: maintenance })
  console.log(`✓ أوامر صيانة: ${maintenance.length}`)

  // ── 12. أوامر شراء (80) ──
  const poRows: any[] = []
  for (let i = 0; i < 80; i++) {
    const poItems: any[] = []
    let total = 0
    for (let j = 0; j < ri(2, 5); j++) {
      const p = pick(products)
      const qty = ri(10, 50)
      total += p.cost * qty
      poItems.push({ productId: p.id, name: p.name, cost: p.cost, quantity: qty, returnedQty: 0 })
    }
    const status = rnd() > 0.9 ? 'مرتجعة جزئياً' : 'مكتملة'
    poRows.push({
      data: {
        tenantId: TENANT,
        branchId: branchIds[i % branchIds.length],
        orderNo: `PO-${2001 + i}`,
        supplierId: pick(suppliers).id,
        userId: ADMIN,
        total: Math.round(total * 100) / 100,
        paid: Math.round(total * 100) / 100,
        paymentMethod: pick(METHODS),
        status,
        createdAt: new Date(NOW - ri(0, 89) * DAY),
      },
      items: poItems,
    })
  }
  for (const po of poRows) {
    const created = await db.purchaseOrder.create({ data: po.data })
    await db.purchaseOrderItem.createMany({ data: po.items.map((it: any) => ({ ...it, purchaseOrderId: created.id })) })
  }
  console.log(`✓ أوامر شراء: ${poRows.length}`)

  // ── 13. تحويلات (12) + جرد (5) ──
  for (let i = 0; i < 12; i++) {
    const items2 = Array.from({ length: ri(2, 5) }, () => {
      const p = pick(products)
      return { productId: p.id, quantity: ri(1, 8), product: { connect: { id: p.id } } }
    })
    await db.transfer.create({
      data: {
        tenantId: TENANT,
        status: i < 3 ? 'pending' : 'completed',
        note: null,
        fromBranchId: branchIds[0],
        toBranchId: branchIds[1],
        createdBy: ADMIN,
        completedAt: i < 3 ? null : new Date(NOW - ri(0, 40) * DAY),
        createdAt: new Date(NOW - ri(0, 60) * DAY),
        items: { create: items2.map((x) => ({ productId: x.productId, quantity: x.quantity })) },
      },
    })
  }
  for (let i = 0; i < 5; i++) {
    const stItems = Array.from({ length: 20 }, () => {
      const p = pick(products)
      const systemQty = ri(5, 40)
      const countedQty = systemQty + ri(-2, 2)
      return { productId: p.id, systemQty, countedQty, diff: countedQty - systemQty }
    })
    await db.stocktake.create({
      data: {
        tenantId: TENANT,
        status: i < 2 ? 'draft' : 'committed',
        note: null,
        branchId: branchIds[i % branchIds.length],
        createdBy: ADMIN,
        committedAt: i < 2 ? null : new Date(NOW - ri(0, 40) * DAY),
        createdAt: new Date(NOW - ri(0, 60) * DAY),
        items: { create: stItems },
      },
    })
  }
  console.log('✓ تحويلات + جرد')

  console.log('\n✅ اكتمل البذر — بيانات واقعية لقياسات v9')
  console.log('   admin@demo.com / admin123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
