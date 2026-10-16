#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🧪 اختبار create_purchase_order على قاعدة تجريبية — الخطوة 2 (2026-10-17)
 *
 * ⚠️ مهم: شغّل ده على قاعدة تجريبية أولًا (مش الإنتاج):
 *   TEST_DATABASE_URL="postgresql://..." node scripts/test-purchase-order-rpc.mjs
 * أو لو DATABASE_URL مشير على التجريبية:
 *   node scripts/test-purchase-order-rpc.mjs
 *
 * البيانات بتاعته مؤقتة (tenantId عشوائي) وبتتنضف تلقائيًا في الآخر —
 * السكريبت بيتحقق من:
 *   1) تركيب الدالة (CREATE OR REPLACE)
 *   2) إنشاء أمر شراء + الترقيم التسلسلي
 *   3) المتوسط المرجح للتكلفة (منتج عليه مخزون قديم + منتج جديد)
 *   4) حركات المخزون (type='in', refType='purchase')
 *   5) رصيد المورد (الفرق total-paid بالإشارة الصحيحة — وقيمة سالبة كمان)
 *   6) قيد الخزنة (amount سالب بطريقة الدفع)
 *   7) شكل الرد JSON (order + items + supplier زي Prisma القديم بالظبط)
 *   8) أمر كاشي بدون مورد (paid = total → مفيش تحديث مورد)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CS = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
if (!CS) {
  console.error('❌ محتاج TEST_DATABASE_URL (أو DATABASE_URL) يشاور على قاعدة تجريبية')
  process.exit(1)
}

const client = new pg.Client({ connectionString: CS })
const TID = `test-po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
let passed = 0
let failed = 0

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.error(`  ❌ ${name} ${detail}`) }
}

async function main() {
  await client.connect()
  console.log(`▶ قاعدة الاختبار: ${CS.replace(/:[^:@/]+@/, ':***@')}`)
  console.log(`▶ tenant مؤقت: ${TID}\n`)

  // 1) تركيب الدالة
  const fnSql = readFileSync(join(__dirname, '..', 'prisma', 'sql', 'create-purchase-order.sql'), 'utf8')
  await client.query(fnSql)
  console.log('✅ الدالة اتركبت (CREATE OR REPLACE)\n')

  // بيانات اختبار
  const q = (t, v) => client.query(t, v)
  await q(`INSERT INTO "Tenant" ("id", "shopName", "status") VALUES ('${TID}', 'محل اختبار RPC', 'active')`)
  const sup = await q(`INSERT INTO "Supplier" ("tenantId", "name", "phone", "balance") VALUES ('${TID}', 'مورد تجريبي', '0100', 50) RETURNING "id"`)
  const supplierId = sup.rows[0].id
  // منتج عليه مخزون قديم (متوسط مرجح) + منتج جديد خالص
  const p1 = await q(`INSERT INTO "Product" ("tenantId", "name", "price", "cost", "quantity", "minQuantity") VALUES ('${TID}', 'سكر قديم', 30, 20, 10, 2) RETURNING "id"`)
  const p2 = await q(`INSERT INTO "Product" ("tenantId", "name", "price", "cost", "quantity", "minQuantity") VALUES ('${TID}', 'شاي جديد', 40, 0, 0, 2) RETURNING "id"`)
  const prod1 = p1.rows[0].id
  const prod2 = p2.rows[0].id

  const payload = (items, paid, method = 'cash') => JSON.stringify({
    tenantId: TID,
    branchId: null,
    userId: 'test-user',
    supplierId,
    total: items.reduce((s, i) => s + i.cost * i.quantity, 0),
    paid,
    paymentMethod: method,
    year: new Date().getFullYear(),
    items,
  })

  // ── أمر شراء 1: سكر 5 كيلو بـ 25 + شاي 3 علب بـ 40، مدفوع 100 (باقي آجل 45) ──
  console.log('▶ أمر شراء 1 (آجل جزئي: مدفوع 100 من 245)')
  const r1 = await q(`SELECT create_purchase_order($1::jsonb) AS result`, [payload([
    { productId: prod1, name: 'سكر قديم', cost: 25, quantity: 5 },
    { productId: prod2, name: 'شاي جديد', cost: 40, quantity: 3 },
  ], 100)])
  const o1 = r1.rows[0].result

  check('الرد فيه orderNo بصيغة PO-YYYY-00001', /^PO-\d{4}-\d{5}$/.test(o1.orderNo), `got ${o1.orderNo}`)
  check('الإجمالي = 245', Math.abs(o1.total - 245) < 1e-9, `got ${o1.total}`)
  check('المدفوع = 100', Math.abs(o1.paid - 100) < 1e-9)
  check('الأمر مرتبط بالمورد', o1.supplierId === supplierId)
  check('الأمر فيه صفيصنف (شكل items زي القديم)',
    Array.isArray(o1.items) && o1.items.length === 2 && 'returnedQty' in o1.items[0] && 'purchaseOrderId' in o1.items[0])
  check('الرد فيه المورد كامل (شكل supplier زي القديم)',
    o1.supplier && o1.supplier.id === supplierId && 'balance' in o1.supplier && 'name' in o1.supplier)

  // المتوسط المرجح: سكر (10×20 + 5×25)/15 = 325/15 = 21.666... → 21.67
  const prod1After = (await q(`SELECT "quantity", "cost" FROM "Product" WHERE "id" = ${prod1}`)).rows[0]
  check('كمية السكر 10+5=15', Math.abs(prod1After.quantity - 15) < 1e-9, `got ${prod1After.quantity}`)
  check('تكلفة السكر بالمتوسط المرجح = 21.67', Math.abs(prod1After.cost - 21.67) < 1e-9, `got ${prod1After.cost}`)
  // شاي جديد خالص: التكلفة = سعر الشراء 40، الكمية 3
  const prod2After = (await q(`SELECT "quantity", "cost" FROM "Product" WHERE "id" = ${prod2}`)).rows[0]
  check('الشاي: كمية 3 وتكلفة 40 (مفيش مخزون قديم)', prod2After.quantity === 3 && Math.abs(prod2After.cost - 40) < 1e-9)

  const moves = await q(`SELECT * FROM "StockMovement" WHERE "tenantId" = '${TID}' AND "refId" = ${o1.id} AND "refType" = 'purchase' ORDER BY "id"`)
  check('حركتين مخزون in بـ refType=purchase', moves.rows.length === 2 && moves.rows.every((m) => m.type === 'in'))
  check('ملاحظة الحركة فيها رقم الأمر', moves.rows[0].note.includes(o1.orderNo))

  const supAfter = (await q(`SELECT "balance" FROM "Supplier" WHERE "id" = ${supplierId}`)).rows[0]
  check('رصيد المورد 50 + (245-100) = 195', Math.abs(supAfter.balance - 195) < 1e-9, `got ${supAfter.balance}`)

  const cash = (await q(`SELECT * FROM "CashEntry" WHERE "tenantId" = '${TID}' AND "source" = 'purchase' AND "refId" = ${o1.id}`)).rows
  check('قيد خزنة واحد بمبلغ -100 وطريقة الدفع', cash.length === 1 && Math.abs(cash[0].amount - -100) < 1e-9 && cash[0].method === 'cash')

  // ── أمر شراء 2: مدفوع بالزيادة عن الإجمالي (مورد يستلمنا فلوس) ──
  console.log('\n▶ أمر شراء 2 (دفع زيادة: مدفوع 90 من إجمالي 50)')
  const r2 = await q(`SELECT create_purchase_order($1::jsonb) AS result`, [payload([
    { productId: prod2, name: 'شاي جديد', cost: 10, quantity: 5 },
  ], 90, 'vodafone_cash')])
  const o2 = r2.rows[0].result
  check('الترقيم زاد (…00002)', o2.orderNo.endsWith('00002'), `got ${o2.orderNo}`)
  check('طريقة الدفع محفوظة vodafone_cash', o2.paymentMethod === 'vodafone_cash')
  const supAfter2 = (await q(`SELECT "balance" FROM "Supplier" WHERE "id" = ${supplierId}`)).rows[0]
  check('رصيد المورد 195 + (50-90) = 155 (سالب فرق = دفعنا زيادة)', Math.abs(supAfter2.balance - 155) < 1e-9, `got ${supAfter2.balance}`)
  const cash2 = (await q(`SELECT "amount", "method" FROM "CashEntry" WHERE "tenantId" = '${TID}' AND "source" = 'purchase' AND "refId" = ${o2.id}`)).rows
  check('قيد خزنة -90 بطريقة vodafone_cash', cash2.length === 1 && Math.abs(cash2[0].amount - -90) < 1e-9 && cash2[0].method === 'vodafone_cash')

  // ── أمر كاشي بدون مورد (paid = total) ──
  console.log('\n▶ أمر شراء 3 (كاشي كامل بدون مورد)')
  const r3 = await q(`SELECT create_purchase_order($1::jsonb) AS result`, [JSON.stringify({
    tenantId: TID, branchId: null, userId: 'test-user', supplierId: null,
    total: 30, paid: 30, paymentMethod: 'cash', year: new Date().getFullYear(),
    items: [{ productId: prod1, name: 'سكر قديم', cost: 30, quantity: 1 }],
  })])
  const o3 = r3.rows[0].result
  check('الأمر اتعمل بدون مورد', o3.id > 0 && o3.supplier === null)
  check('paymentMethod اتحول cash (مدفوع > 0 كاش)', o3.paymentMethod === 'cash')

  // ── نظافة ──
  console.log('\n▶ تنظيف البيانات المؤقتة...')
  await q(`DELETE FROM "CashEntry" WHERE "tenantId" = '${TID}'`)
  await q(`DELETE FROM "StockMovement" WHERE "tenantId" = '${TID}'`)
  await q(`DELETE FROM "PurchaseOrderItem" WHERE "purchaseOrderId" IN (SELECT "id" FROM "PurchaseOrder" WHERE "tenantId" = '${TID}')`)
  await q(`DELETE FROM "PurchaseOrder" WHERE "tenantId" = '${TID}'`)
  await q(`DELETE FROM "Product" WHERE "tenantId" = '${TID}'`)
  await q(`DELETE FROM "Supplier" WHERE "tenantId" = '${TID}'`)
  await q(`DELETE FROM "Tenant" WHERE "id" = '${TID}'`)
  console.log('✅ اتنضفت\n')

  console.log(`═══ النتيجة: ${passed} نجح / ${failed} فشل ═══`)
  await client.end()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('❌ فشل السكريبت:', e.message)
  try { await client.end() } catch {}
  process.exit(1)
})
