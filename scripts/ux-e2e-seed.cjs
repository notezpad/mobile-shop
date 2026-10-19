/**
 * تجهيز داتا اختبار UX بمتصفح حقيقي:
 * حساب أدمن جديد + منتج مخزونه منخفض + عميل مديون + فاتورة متأخرة + إشعار
 * البيئة: TEST_BASE (default http://localhost:3100)
 */
const BASE = process.env.TEST_BASE || 'http://localhost:3100'
const { Client } = require('pg')

const STAMP = Date.now().toString().slice(-8)
const ADMIN = {
  email: `ux${STAMP}@testshop.dev`,
  phone: `012${STAMP}`,
  password: 'Test123456',
}

async function api(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') }
}

;(async () => {
  // 1) تسجيل حساب أدمن على باقة fashion-pro
  const su = await api('POST', '/api/auth/signup', {
    name: 'صاحب محل UX', shopName: 'محل اختبار UX', businessType: 'fashion',
    email: ADMIN.email, phone: ADMIN.phone, password: ADMIN.password, agree: true,
    planCode: 'fashion-pro',
  })
  const cookie = (su.setCookie || '').split(';')[0]
  if (!cookie) {
    const l = await api('POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password })
    console.log('LOGIN-FALLBACK', l.status)
    process.exit(1)
  }
  console.log('COOKIE=' + cookie)
  console.log('ADMIN=' + JSON.stringify(ADMIN))

  // 2) منتج مخزونه منخفض (2 من 5) — لكارت المخزون المنخفض في الداشبورد
  const p1 = await api('POST', '/api/products', {
    name: 'قميص UX ناقص', category: 'ملابس', price: 150, cost: 80,
    quantity: 2, minQuantity: 5,
  }, cookie)
  console.log('LOW-PRODUCT', p1.status, JSON.stringify(p1.json)?.slice(0, 120))

  // 3) عميل مديون: عميل + فاتورة جزئية الدفع
  const cu = await api('POST', '/api/customers', { name: 'عميل مديون UX', phone: '01000000000' }, cookie)
  console.log('CUSTOMER', cu.status, JSON.stringify(cu.json)?.slice(0, 120))
  const customerId = cu.json?.id ?? cu.json?.data?.id

  const p2 = await api('POST', '/api/products', {
    name: 'بنطلون UX', category: 'ملابس', price: 200, cost: 100,
    quantity: 50, minQuantity: 5,
  }, cookie)
  const productId2 = p2.json?.id ?? p2.json?.data?.id

  // فاتورة آجلة: paid جزئي — بدون dueDate (المتأخرات بتتحسب من التاريخ)
  const sale = await api('POST', '/api/sales', {
    items: [{ productId: productId2, quantity: 2, price: 200 }],
    customerId, paid: 100, paymentMethod: 'deferred',
  }, cookie)
  console.log('SALE', sale.status, JSON.stringify(sale.json)?.slice(0, 200))

  // 4) فاتورة متأخرة dueDate في الماضي (عشان بانر المتأخرات في الداشبورد)
  const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5433/erp_test' })
  await c.connect()
  await c.query(`UPDATE "Sale" SET "dueDate" = NOW() - INTERVAL '10 days' WHERE "customerId" = $1`, [customerId])
  // 5) إشعار مخزون منخفض باللينك الجديد بسياق المنتج
  await c.query(
    `INSERT INTO "Notification" ("tenantId", "userId", "type", "title", "message", link, "isRead", "createdAt")
     SELECT t.id, u.id, 'low_stock', 'مخزون منخفض — قميص UX ناقص', 'المنتج "قميص UX ناقص" وصل للحد الأدنى (2 متبقي)', '/products?search=' || encode('قميص UX ناقص', 'hex')::text, false, NOW()
     FROM "Tenant" t CROSS JOIN "User" u
     WHERE t."shopName" = 'محل اختبار UX' AND u."tenantId" = t.id LIMIT 1`,
  )
  const tenant = await c.query(`SELECT id FROM "Tenant" WHERE "shopName" = 'محل اختبار UX'`)
  const tid = tenant.rows[0]?.id
  // link hex غلط — نصلحه بالنص الصريح
  await c.query(`UPDATE "Notification" SET link = '/products?search=' || $1 WHERE link LIKE '/products?search=%' AND "tenantId" = $2`, ['قميص UX ناقص', tid])
  const notif = await c.query(`SELECT id, link FROM "Notification" WHERE "tenantId" = $1`, [tid])
  console.log('NOTIF', JSON.stringify(notif.rows))
  const late = await c.query(`SELECT id, "invoiceNo", "dueDate" FROM "Sale" WHERE "customerId" = $1`, [customerId])
  console.log('LATE-SALE', JSON.stringify(late.rows))
  await c.end()
  console.log('UX-SEED-DONE tenantId=' + tid)
})().catch((e) => { console.error('ERR:', e); process.exit(1) })
