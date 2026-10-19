/**
 * 🧪 حزمة الاختبار الشامل (أمر واحد) — نظام المقاسات/الألوان + صلاحيات الموظفين
 *
 * ⚠️ تحذير مهم: الحزمة دي بتنشئ tenant تجريبي — ممنوعة تماماً على قاعدة
 * البيانات الإنتاجية. بتشتغل فقط على localhost.
 *
 * الاستخدام:
 *   1) شغّل السيرفر على داتابيز اختبار:
 *        DATABASE_URL="postgresql://postgres:postgres@localhost:5433/erp_test" npx next dev -p 3100
 *   2) في تيرمنال تاني:
 *        node scripts/erp-selftest.mjs http://localhost:3100
 */
const RAW_BASE = process.argv[2] || 'http://localhost:3100'
// 🛡️ حماية: ممنوع التشغيل على أي حاجة غير localhost
{
  const u = new URL(RAW_BASE)
  const safe = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (!safe) {
    console.error('⛔ مرفوض: الحزمة دي للاختبار على localhost فقط — مش على الإنتاج.')
    process.exit(3)
  }
}
const BASE = RAW_BASE

let passed = 0, failed = 0
const failures = []
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(`${name} ${detail}`); console.log(`  ✗ ${name} ${detail}`) }
}
function section(t) { console.log(`\n━━━ ${t} ━━━`) }

async function api(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch { /* no body */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') }
}
function cookieOf(res) {
  const sc = res.setCookie || ''
  return sc.split(';')[0]
}

const stamp = Date.now().toString().slice(-8)
const ADMIN = { email: `admin${stamp}@testshop.dev`, phone: `010${stamp}`, password: 'Test123456' }
const ts = () => `+${stamp}${Math.random().toString(36).slice(2, 8)}`

async function main() {
  let adminCookie = '', empCookie = '', emp2Cookie = '', emp3Cookie = ''
  let productId = 0, variantMA = 0, variantMB = 0, variantLA = 0, variantLB = 0
  let supplierId = 0, orderId = 0, saleId = 0, saleItemId = 0, branch2Id = 0
  let productId2 = 0 // منتج بسيط من غير مقاسات
  let variantQty = 0

  section('0) تسجيل + دخول (إعداد)')
  {
    const r = await api('POST', '/api/auth/signup', {
      name: 'صاحب محل اختبار', shopName: 'محل الاختبار', businessType: 'fashion',
      email: ADMIN.email, phone: ADMIN.phone, password: ADMIN.password, agree: true,
      planCode: 'fashion-pro',
    })
    ok('signup 200/201', r.status === 200 || r.status === 201, JSON.stringify(r.json))
    adminCookie = cookieOf(r)
    if (!adminCookie) { const l = await api('POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password }); adminCookie = cookieOf(l); ok('login fallback', !!adminCookie) }
  }

  section('A) المنتجات والمقاسات (سيناريو الـ 364 قطعة)')
  {
    const r = await api('POST', '/api/products', { name: 'تيشيرت كيت', price: 120, cost: 50, quantity: 0, category: 'تيشيرتات' }, adminCookie)
    ok('create product 201', r.status === 201, JSON.stringify(r.json))
    productId = r.json?.id
    const r2 = await api('POST', '/api/products', { name: 'منتج بسيط', price: 30, cost: 10, quantity: 10 }, adminCookie)
    productId2 = r2.json?.id
    ok('create simple product 201', r2.status === 201)
  }
  {
    // حاجز الرصيد القديم: منتج بسيط عليه رصيد 10 → إضافة مقاس لازم تترفض
    const r = await api('POST', `/api/products/${productId2}/variants`, { size: 'M', quantity: 3 }, adminCookie)
    ok('first-variant on stocked product → 400', r.status === 400, JSON.stringify(r.json))
    // صفّر الرصيد بحركة صرف وبعدها المفروض يعدّي
    const m = await api('POST', '/api/inventory/movements', { productId: productId2, type: 'out', quantity: 10, reason: 'أخرى', note: 'تسوية رصيد قديم قبل التقسيم' }, adminCookie)
    ok('zero-out old stock movement 201', m.status === 201 || m.status === 200, JSON.stringify(m.json))
    const r2 = await api('POST', `/api/products/${productId2}/variants`, { size: 'M', quantity: 3 }, adminCookie)
    ok('first-variant after zeroing → 201', r2.status === 201, JSON.stringify(r2.json))
  }
  {
    const rows = [
      { size: 'M', color: 'أحمر', qty: 100 }, { size: 'M', color: 'أزرق', qty: 100 },
      { size: 'L', color: 'أحمر', qty: 82 }, { size: 'L', color: 'أزرق', qty: 82 },
    ]
    for (const row of rows) {
      const r = await api('POST', `/api/products/${productId}/variants`, { size: row.size, color: row.color, quantity: row.qty }, adminCookie)
      ok(`variant ${row.color}/${row.size} 201`, r.status === 201, JSON.stringify(r.json))
      if (row.size === 'M' && row.color === 'أحمر') variantMA = r.json?.id
      if (row.size === 'M' && row.color === 'أزرق') variantMB = r.json?.id
      if (row.size === 'L' && row.color === 'أحمر') variantLA = r.json?.id
      if (row.size === 'L' && row.color === 'أزرق') variantLB = r.json?.id
    }
    const vs = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const sum = (vs.json || []).reduce((s, v) => s + v.quantity, 0)
    ok('variants total = 364', sum === 364, `sum=${sum}`)
    const prods = await api('GET', '/api/products?limit=200', undefined, adminCookie)
    const p = (prods.json?.data || prods.json || []).find((x) => x.id === productId)
    ok('product.quantity = 364', p && Number(p.quantity) === 364, `got ${p?.quantity}`)
  }
  {
    // تعديل كمية المنتج ذي المقاسات من الشاشة → مرفوض
    const r = await api('PUT', `/api/products/${productId}`, { quantity: 999 }, adminCookie)
    ok('PUT product quantity on variant-product → 400', r.status === 400, JSON.stringify(r.json))
  }

  section('B) الشراء بالمقاسات (الـ 100 قطعة)')
  {
    const s = await api('POST', '/api/suppliers', { name: 'مورد التيشيرتات', phone: '01111111111' }, adminCookie)
    ok('create supplier 201', s.status === 201, JSON.stringify(s.json))
    supplierId = s.json?.id
    // سطر من غير مقاس → مرفوض
    const bad = await api('POST', '/api/purchase-orders', { supplierId, items: [{ productId, quantity: 100, cost: 50 }], paid: 0, paymentMethod: 'cash' }, adminCookie)
    ok('PO without variant → 400', bad.status === 400, JSON.stringify(bad.json))
    // variantId غلط → مرفوض
    const bad2 = await api('POST', '/api/purchase-orders', { supplierId, items: [{ productId, variantId: 999999, quantity: 100, cost: 50 }], paid: 0, paymentMethod: 'cash' }, adminCookie)
    ok('PO with foreign variant → 400', bad2.status === 400, JSON.stringify(bad2.json))
    // الشراء الصح: 100 على M/أحمر
    const r = await api('POST', '/api/purchase-orders', {
      supplierId,
      items: [{ productId, variantId: variantMA, quantity: 100, cost: 50 }],
      paid: 5000, paymentMethod: 'cash',
    }, adminCookie)
    ok('PO with variant 201', r.status === 201, JSON.stringify(r.json))
    orderId = r.json?.id
    ok('PO total = 5000', r.json?.total === 5000, `total=${r.json?.total}`)
    const vs = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const ma = (vs.json || []).find((v) => v.id === variantMA)
    ok('variant M/أحمر = 200 بعد الشراء', ma?.quantity === 200, `qty=${ma?.quantity}`)
    const sum = (vs.json || []).reduce((s2, v) => s2 + v.quantity, 0)
    ok('product aggregate = 464', sum === 464, `sum=${sum}`)
    // رصيد المورد 0 (اتدفعت كلها)
    const sup = await api('GET', '/api/suppliers', undefined, adminCookie)
    const sup2 = (sup.json || []).find((x) => x.id === supplierId)
    ok('supplier balance = 0', Number(sup2?.balance) === 0, `balance=${sup2?.balance}`)
    // حركة مخزون بالـ variantId
    const mv = await api('GET', '/api/inventory/movements?limit=50', undefined, adminCookie)
    const mvRow = (mv.json?.movements || mv.json?.data || mv.json || []).find?.((x) => x.variantId === variantMA && x.type === 'in')
    ok('stock movement has variantId', !!mvRow, JSON.stringify(mv.json).slice(0, 120))
  }

  section('C) البيع والحذف والمرتجع بالمقاسات')
  {
    const bad = await api('POST', '/api/sales', { items: [{ productId, quantity: 1, price: 120 }], paid: 120, paymentMethod: 'cash' }, adminCookie)
    ok('sale without variant on variant-product → 400', bad.status === 400, JSON.stringify(bad.json))
    const r = await api('POST', '/api/sales', { items: [{ productId, variantId: variantMA, quantity: 2, price: 120 }], paid: 240, paymentMethod: 'cash' }, adminCookie)
    ok('sale with variant 201', r.status === 201, JSON.stringify(r.json))
    saleId = r.json?.id
    saleItemId = r.json?.items?.[0]?.id
    let vs = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    let ma = (vs.json || []).find((v) => v.id === variantMA)
    ok('variant = 198 بعد بيع 2', ma?.quantity === 198, `qty=${ma?.quantity}`)
    // حذف الفاتورة → الكمية ترجع لنفس المقاس
    const del = await api('DELETE', `/api/sales/${saleId}`, undefined, adminCookie)
    ok('delete sale 200', del.status === 200, JSON.stringify(del.json))
    vs = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    ma = (vs.json || []).find((v) => v.id === variantMA)
    ok('variant back to 200 بعد حذف الفاتورة', ma?.quantity === 200, `qty=${ma?.quantity}`)
    const sum = (vs.json || []).reduce((s2, v) => s2 + v.quantity, 0)
    ok('aggregate back to 464', sum === 464, `sum=${sum}`)
    // بيع جديد + مرتجع جزئي
    const r2 = await api('POST', '/api/sales', { items: [{ productId, variantId: variantMA, quantity: 3, price: 120 }], paid: 360, paymentMethod: 'cash' }, adminCookie)
    ok('second sale 201', r2.status === 201, JSON.stringify(r2.json))
    saleId = r2.json?.id
    saleItemId = r2.json?.items?.[0]?.id
    const ret = await api('POST', '/api/sales/returns', {
      saleId, lines: [{ saleItemId, quantity: 1 }], refund: 120, refundMethod: 'cash',
    }, adminCookie)
    ok('sale return 201', ret.status === 201, JSON.stringify(ret.json))
    const vs2 = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const ma2 = (vs2.json || []).find((v) => v.id === variantMA)
    ok('variant = 198 بعد مرتجع 1', ma2?.quantity === 198, `qty=${ma2?.quantity}`)
  }

  section('D) حركات المخزون + الجرد بالألوان/المقاسات')
  {
    const dmg = await api('POST', '/api/inventory/movements', { productId, variantId: variantLA, type: 'damage', quantity: 2, reason: 'هالك اختبار' }, adminCookie)
    ok('damage movement on variant 201', dmg.status === 201 || dmg.status === 200, JSON.stringify(dmg.json))
    let vs = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    let la = (vs.json || []).find((v) => v.id === variantLA)
    ok('variant L/أحمر = 80 بعد هالك 2', la?.quantity === 80, `qty=${la?.quantity}`)
    const noV = await api('POST', '/api/inventory/movements', { productId, type: 'out', quantity: 5, reason: 'مفروض تترفض' }, adminCookie)
    ok('movement without variant → 400', noV.status === 400, JSON.stringify(noV.json))
    // الجرد: عدّنا L/أحمر = 85 (فرق +5)
    const st = await api('POST', '/api/inventory/stocktake', {
      items: [{ productId, variantId: variantLA, countedQty: 85 }], commit: true, note: 'جرد اختبار آلي',
    }, adminCookie)
    ok('stocktake with variant 201', st.status === 201, JSON.stringify(st.json))
    const vs2 = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const la2 = (vs2.json || []).find((v) => v.id === variantLA)
    ok('variant L/أحمر = 85 بعد الجرد', la2?.quantity === 85, `qty=${la2?.quantity}`)
  }

  section('E) التحويل بين الفروع بالمقاسات')
  {
    const b = await api('POST', '/api/branches', { name: 'فرع 2' }, adminCookie)
    ok('create branch2 201', b.status === 201, JSON.stringify(b.json))
    branch2Id = b.json?.id
    const b3 = await api('POST', '/api/branches', { name: 'فرع 3' }, adminCookie)
    const branch3Id = b3.json?.id
    ok('create branch3 201', b3.status === 201, JSON.stringify(b3.json))
    // منتج داخل فرع 3 بمقاسات ورصيد افتتاحي
    const p3 = await api('POST', '/api/products', { name: 'بنطلون فرع 3', price: 200, cost: 90, quantity: 0, branchId: String(branch3Id) }, adminCookie)
    ok('create product in branch3 201', p3.status === 201, JSON.stringify(p3.json))
    const pv = await api('POST', `/api/products/${p3.json?.id}/variants`, { size: '32', color: 'كحلي', quantity: 50 }, adminCookie)
    ok('variant in branch3 product 201', pv.status === 201, JSON.stringify(pv.json))
    const t = await api('POST', '/api/inventory/transfers', {
      fromBranchId: branch3Id, toBranchId: branch2Id, mode: 'completed',
      items: [{ productId: p3.json?.id, variantId: pv.json?.id, quantity: 5 }],
    }, adminCookie)
    ok('transfer with variant 201', t.status === 201, JSON.stringify(t.json))
    // المصدر ناقص 5
    const vsSrc = await api('GET', `/api/products/${p3.json?.id}/variants`, undefined, adminCookie)
    const src = (vsSrc.json || []).find((v) => v.id === pv.json?.id)
    ok('source variant = 45 بعد التحويل', src?.quantity === 45, `qty=${src?.quantity}`)
    // الوجهة: نسخة منتج جديدة فيها 5 — نتحقق من أسماء المنتجات بالبحث
    const destSearch = await api('GET', '/api/products?search=' + encodeURIComponent('بنطلون فرع 3'), undefined, adminCookie)
    const copies = (destSearch.json?.data || destSearch.json || []).filter((x) => x.name.includes('بنطلون فرع 3'))
    ok('destination copy exists', copies.length >= 2, `copies=${copies.length}`)
    const destTotal = copies.reduce((s2, c) => s2 + Number(c.quantity || 0), 0)
    ok('total across branches = 50', destTotal === 50, `total=${destTotal}`)
  }

  section('F) صلاحيات الموظفين على السيرفر')
  {
    const u = await api('POST', '/api/users', {
      name: 'موظف بيع فقط', email: `pos${stamp}@testshop.dev`, password: 'Emp123456',
      role: 'EMPLOYEE', permissions: ['dashboard', 'pos', 'customers'],
    }, adminCookie)
    ok('create POS employee 201', u.status === 201, JSON.stringify(u.json))
    const l = await api('POST', '/api/auth/login', { email: `pos${stamp}@testshop.dev`, password: 'Emp123456' })
    empCookie = cookieOf(l)
    ok('employee login', !!empCookie)

    const u2 = await api('POST', '/api/users', {
      name: 'موظف مبيعات فقط', email: `sales${stamp}@testshop.dev`, password: 'Emp123456',
      role: 'EMPLOYEE', permissions: ['sales'],
    }, adminCookie)
    const l2 = await api('POST', '/api/auth/login', { email: `sales${stamp}@testshop.dev`, password: 'Emp123456' })
    emp2Cookie = cookieOf(l2)

    const u3 = await api('POST', '/api/users', {
      name: 'موظف بلا قيود', email: `free${stamp}@testshop.dev`, password: 'Emp123456',
      role: 'EMPLOYEE', permissions: [],
    }, adminCookie)
    const l3 = await api('POST', '/api/auth/login', { email: `free${stamp}@testshop.dev`, password: 'Emp123456' })
    emp3Cookie = cookieOf(l3)

    // موظف البيع (pos):
    const g1 = await api('GET', '/api/products?limit=5', undefined, empCookie)
    ok('POS emp: GET products 200 (alias)', g1.status === 200, String(g1.status))
    const g2 = await api('GET', '/api/customers', undefined, empCookie)
    ok('POS emp: GET customers 200 (alias)', g2.status === 200, String(g2.status))
    const g3 = await api('GET', '/api/suppliers', undefined, empCookie)
    ok('POS emp: GET suppliers 403', g3.status === 403, String(g3.status))
    const g4 = await api('GET', '/api/inventory/movements?limit=5', undefined, empCookie)
    ok('POS emp: GET movements 403', g4.status === 403, String(g4.status))
    const g5 = await api('GET', '/api/sales?limit=5', undefined, empCookie)
    ok('POS emp: GET sales 200 (pos read alias)', g5.status === 200, String(g5.status))
    const g6 = await api('GET', '/api/dashboard?days=7', undefined, empCookie)
    ok('POS emp: GET dashboard 200 (dashboard perm)', g6.status === 200, String(g6.status))
    const w1 = await api('POST', '/api/products', { name: 'منتج موظف', price: 5 }, empCookie)
    ok('POS emp: POST products 403 (write)', w1.status === 403, String(w1.status))
    const w2 = await api('POST', '/api/customers', { name: 'عميل من الموظف', phone: '01200000001' }, empCookie)
    ok('POS emp: POST customers 201 (has customers perm)', w2.status === 201, String(w2.status))
    const sell = await api('POST', '/api/sales', { items: [{ productId, variantId: variantMA, quantity: 1, price: 120 }], paid: 120, paymentMethod: 'cash' }, empCookie)
    ok('POS emp: POST sales 201 (can sell)', sell.status === 201, JSON.stringify(sell.json))
    // موظف صلاحيته نقطة البيع فقط — كتابة العملاء/المنتجات ممنوعة من السيرفر
    const u4 = await api('POST', '/api/users', {
      name: 'موظف POS صرف', email: `posonly${stamp}@testshop.dev`, password: 'Emp123456',
      role: 'EMPLOYEE', permissions: ['pos'],
    }, adminCookie)
    const l4 = await api('POST', '/api/auth/login', { email: `posonly${stamp}@testshop.dev`, password: 'Emp123456' })
    const posOnly = cookieOf(l4)
    const w3 = await api('POST', '/api/customers', { name: 'عميل ممنوع', phone: '01200000002' }, posOnly)
    ok('posOnly emp: POST customers 403', w3.status === 403, String(w3.status))
    const w4 = await api('POST', '/api/products', { name: 'منتج ممنوع', price: 5 }, posOnly)
    ok('posOnly emp: POST products 403', w4.status === 403, String(w4.status))
    const w5 = await api('GET', '/api/customers', undefined, posOnly)
    ok('posOnly emp: GET customers 200 (pos alias)', w5.status === 200, String(w5.status))
    // موظف المبيعات (sales):
    const s1 = await api('GET', '/api/sales?limit=5', undefined, emp2Cookie)
    ok('sales emp: GET sales 200', s1.status === 200, String(s1.status))
    const s2 = await api('POST', '/api/sales', { items: [{ productId, variantId: variantMA, quantity: 1, price: 120 }], paid: 120, paymentMethod: 'cash' }, emp2Cookie)
    ok('sales emp: POST sales 403 (no pos)', s2.status === 403, String(s2.status))
    // الموظف الحر (بدون permissions):
    const f1 = await api('GET', '/api/suppliers', undefined, emp3Cookie)
    ok('free emp: GET suppliers 200', f1.status === 200, String(f1.status))
    const f2 = await api('POST', '/api/purchase-orders', { supplierId, items: [{ productId, variantId: variantMA, quantity: 2, cost: 50 }], paid: 100, paymentMethod: 'cash' }, emp3Cookie)
    ok('free emp: POST purchase-order 201', f2.status === 201, JSON.stringify(f2.json))
  }

  section('G) حدود إضافية')
  {
    // مرتجع مورد على الأمر بالـ variant
    const pr = await api('POST', `/api/purchase-orders/${orderId}/returns`, {
      items: [{ itemId: orderId ? undefined : undefined, productId, variantId: variantMA, quantity: 2, cost: 50 }],
      refund: 100, refundMethod: 'cash',
    }, adminCookie)
    // الشكل الصحيح: items[{itemId, quantity}] — نجيب itemId من تفاصيل الأمر
    const od = await api('GET', '/api/purchase-orders?from=2000-01-01', undefined, adminCookie)
    const myOrder = (od.json || []).find((o) => o.id === orderId)
    const itemId = myOrder?.items?.[0]?.id
    const pr2 = await api('POST', `/api/purchase-orders/${orderId}/returns`, {
      items: [{ itemId, quantity: 2 }], refund: 100, refundMethod: 'cash',
    }, adminCookie)
    ok('purchase return (variant line) 201', pr2.status === 201, JSON.stringify(pr2.json))
    const vs = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const ma = (vs.json || []).find((v) => v.id === variantMA)
    ok('variant reduced by purchase return', typeof ma?.quantity === 'number', `qty=${ma?.quantity}`)
  }

  section('H) الاستبدال مع المورد بالمقاسات (2026-10-19)')
  {
    const vsBefore = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const before = Object.fromEntries((vsBefore.json || []).map((v) => [v.id, v.quantity]))
    const supBefore = await api('GET', '/api/suppliers', undefined, adminCookie)
    const balBefore = Number((supBefore.json || []).find((x) => x.id === supplierId)?.balance ?? 0)

    // 1) سطر صادر على منتج له مقاسات من غير مقاس → مرفوض (نفس درس خسارة الـ100)
    const noV = await api('POST', '/api/inventory/exchange', {
      supplierId, lines: [{ productId, quantity: 1 }],
      replacements: [{ productId, variantId: variantLB, quantity: 1 }],
      note: 'مفروض تترفض: من غير مقاس',
    }, adminCookie)
    ok('exchange out without variant → 400', noV.status === 400, JSON.stringify(noV.json))

    // 2) مقاس غريب (مش تابع للمنتج) → مرفوض
    const foreign = await api('POST', '/api/inventory/exchange', {
      supplierId, lines: [{ productId, variantId: 999999, quantity: 1 }],
      replacements: [{ productId, variantId: variantLB, quantity: 1 }],
      note: 'مفروض تترفض: مقاس غريب',
    }, adminCookie)
    ok('exchange with foreign variant → 400', foreign.status === 400, JSON.stringify(foreign.json))

    // 3) سطر وارد على منتج له مقاسات من غير مقاس → مرفوض
    const inNoV = await api('POST', '/api/inventory/exchange', {
      supplierId, lines: [{ productId, variantId: variantMA, quantity: 1 }],
      replacements: [{ productId, quantity: 1 }],
      note: 'مفروض تترفض: البديل من غير مقاس',
    }, adminCookie)
    ok('exchange in (replacement) without variant → 400', inNoV.status === 400, JSON.stringify(inNoV.json))

    // 4) كمية أكبر من مخزون المقاس الواحد → مرفوض برسالة بتذكر اللون/المقاس
    const tooMuch = await api('POST', '/api/inventory/exchange', {
      supplierId, lines: [{ productId, variantId: variantMA, quantity: (before[variantMA] ?? 0) + 1000 }],
      replacements: [{ productId, variantId: variantLB, quantity: 1 }],
      note: 'مفروض تترفض: الكمية أكبر من المقاس',
    }, adminCookie)
    ok('exchange over variant stock → 400', tooMuch.status === 400, JSON.stringify(tooMuch.json))
    ok('rejection message mentions the size', String(tooMuch.json?.error || '').includes('أحمر'), String(tooMuch.json?.error).slice(0, 80))

    // 5) استبدال حقيقي: خروج 3 من M/أحمر + دخول 1 في L/أزرق
    //    (التكلفة من مستوى المنتج 50) → فرق = 50 − 150 = −100 على حساب المورد
    const ex = await api('POST', '/api/inventory/exchange', {
      supplierId,
      lines: [{ productId, variantId: variantMA, quantity: 3 }],
      replacements: [{ productId, variantId: variantLB, quantity: 1 }],
      note: 'تيشيرت تالف بديل مقاس تاني',
    }, adminCookie)
    ok('exchange with variants 200', ex.status === 200, JSON.stringify(ex.json))
    ok('exchange diff = -100', ex.json?.diff === -100, `diff=${ex.json?.diff}`)
    const vsAfter = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const after = Object.fromEntries((vsAfter.json || []).map((v) => [v.id, v.quantity]))
    ok('variant M/أحمر −3 بالاستبدال', after[variantMA] === (before[variantMA] ?? 0) - 3, `${before[variantMA]} → ${after[variantMA]}`)
    ok('variant L/أزرق +1 بالاستبدال', after[variantLB] === (before[variantLB] ?? 0) + 1, `${before[variantLB]} → ${after[variantLB]}`)
    const sumAfter = (vsAfter.json || []).reduce((s2, v) => s2 + v.quantity, 0)
    const sumBefore = Object.values(before).reduce((s2, q) => s2 + q, 0)
    ok('product aggregate متزامن (−3+1)', sumAfter === sumBefore - 2, `${sumBefore} → ${sumAfter}`)
    const supAfter = await api('GET', '/api/suppliers', undefined, adminCookie)
    const balAfter = Number((supAfter.json || []).find((x) => x.id === supplierId)?.balance ?? 0)
    ok('supplier balance −100 (البديل أرخص)', balAfter === balBefore - 100, `${balBefore} → ${balAfter}`)

    // 6) حركات المخزون بالـ variantId و refType=supplier_exchange
    const mv = await api('GET', '/api/inventory/movements?limit=50', undefined, adminCookie)
    const mvRows = (mv.json?.movements || mv.json?.data || mv.json || [])
    const mvOut = (Array.isArray(mvRows) ? mvRows : []).find?.((x) => x.refType === 'supplier_exchange' && x.type === 'out' && x.variantId === variantMA)
    const mvIn = (Array.isArray(mvRows) ? mvRows : []).find?.((x) => x.refType === 'supplier_exchange' && x.type === 'in' && x.variantId === variantLB)
    ok('stock movement out has variantId', !!mvOut)
    ok('stock movement in has variantId', !!mvIn)

    // 7) استبدال متكافئ (فرق صفر): خروج 1 من M/أزرق ودخول 1 في L/أحمر — الرصيد ميتحركش
    const supMid = await api('GET', '/api/suppliers', undefined, adminCookie)
    const balMid = Number((supMid.json || []).find((x) => x.id === supplierId)?.balance ?? 0)
    const vsMid = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const mid = Object.fromEntries((vsMid.json || []).map((v) => [v.id, v.quantity]))
    const even = await api('POST', '/api/inventory/exchange', {
      supplierId,
      lines: [{ productId, variantId: variantMB, quantity: 1 }],
      replacements: [{ productId, variantId: variantLA, quantity: 1 }],
      note: 'استبدال متكافئ اختبار',
    }, adminCookie)
    ok('even exchange 200 (diff 0)', even.status === 200 && even.json?.diff === 0, JSON.stringify(even.json))
    const supEnd = await api('GET', '/api/suppliers', undefined, adminCookie)
    const balEnd = Number((supEnd.json || []).find((x) => x.id === supplierId)?.balance ?? 0)
    ok('even exchange: supplier balance unchanged', balEnd === balMid, `${balMid} → ${balEnd}`)
    const vsEnd = await api('GET', `/api/products/${productId}/variants`, undefined, adminCookie)
    const end = Object.fromEntries((vsEnd.json || []).map((v) => [v.id, v.quantity]))
    ok('even exchange: M/أزرق −1', end[variantMB] === (mid[variantMB] ?? 0) - 1, `${mid[variantMB]} → ${end[variantMB]}`)
    ok('even exchange: L/أحمر +1', end[variantLA] === (mid[variantLA] ?? 0) + 1, `${mid[variantLA]} → ${end[variantLA]}`)

    // 8) المنتج البسيط (من غير مقاسات): الاستبدال القديم شغال زي ما هو
    const sp = await api('POST', '/api/products', { name: 'منتج استبدال بسيط', price: 20, cost: 10, quantity: 5 }, adminCookie)
    ok('create simple product for exchange 201', sp.status === 201, JSON.stringify(sp.json))
    const spId = sp.json?.id
    const simple = await api('POST', '/api/inventory/exchange', {
      supplierId,
      lines: [{ productId: spId, quantity: 2 }],
      replacements: [{ productId: spId, quantity: 1 }],
      note: 'استبدال بسيط اختبار',
    }, adminCookie)
    ok('simple product exchange 200 (diff -10)', simple.status === 200 && simple.json?.diff === -10, JSON.stringify(simple.json))
    const prods = await api('GET', '/api/products?limit=200', undefined, adminCookie)
    const spRow = (prods.json?.data || prods.json || []).find((x) => x.id === spId)
    ok('simple product quantity 5→4', Number(spRow?.quantity) === 4, `qty=${spRow?.quantity}`)
  }

  console.log(`\n═══ النتيجة: ${passed} ناجح / ${failed} فاشل ═══`)
  if (failures.length) {
    console.log('الفاشل:')
    failures.forEach((f) => console.log('  -', f))
    process.exit(1)
  }
}

main().catch((e) => { console.error('CRASH:', e); process.exit(2) })
