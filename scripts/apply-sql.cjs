/**
 * تطبيق دوال SQL (create_purchase_order / create_sale) على داتابيز الاختبار
 * بديل psql باستخدام node + pg — لأن embedded-postgres مافيهوش psql binary
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const DB = process.argv[2] || 'postgresql://postgres:postgres@localhost:5433/erp_test'
const FILES = [
  'prisma/sql/create-purchase-order.sql',
  'prisma/sql/create-sale.sql',
]

;(async () => {
  const c = new Client({ connectionString: DB })
  await c.connect()
  for (const f of FILES) {
    const p = path.join(__dirname, '..', f)
    const sql = fs.readFileSync(p, 'utf8')
    await c.query(sql)
    console.log('applied:', f)
  }
  await c.end()
  console.log('ALL SQL APPLIED')
})().catch((e) => { console.error('ERR:', e.message); process.exit(1) })
