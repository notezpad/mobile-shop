// زرع باقتي الملابس (أساسية + احترافية) وترقية المحل B — بيئة اختبار فقط
const { Client } = require('pg')

const FASHION_MODULES = [
  'dashboard', 'pos', 'products', 'sales', 'customers', 'suppliers',
  'purchases', 'inventory', 'reports', 'settings', 'users', 'branches',
]

const PLANS = [
  {
    code: 'fashion-basic',
    name: 'أساسية - ملابس وأحذية',
    description: 'محلات الملابس — نقطة بيع، مخزون بالمقاسات والألوان، عملاء وموردين.',
    priceMonthly: 399, priceYearly: 3990, maxUsers: 3, maxProducts: 2000, maxBranches: 1,
    capabilities: ['variants', 'returns_exchange'], sortOrder: 30,
  },
  {
    code: 'fashion-pro',
    name: 'احترافية - ملابس وأحذية',
    description: 'سلاسل المحلات وتجار الجملة — فروع، بيع بالكرتونة/الدستة + خصم الكوليكشن، والمقاسات والألوان متاحة برضه (البيع بالقطعة شغال).',
    priceMonthly: 699, priceYearly: 6990, maxUsers: 10, maxProducts: 10000, maxBranches: 5,
    capabilities: ['variants', 'collections', 'multi_unit', 'returns_exchange', 'dynamic_retail_pricing', 'seasonal_warehouse'],
    sortOrder: 40,
  },
]

const TENANT_B = 'cmvihzijv000157nh9mxstk49'

async function main() {
  const c = new Client({ connectionString: process.env.TEST_DB_URL || 'postgres://postgres@127.0.0.1:5433/nezam' })
  await c.connect()
  let proId = null
  for (const p of PLANS) {
    const modules = JSON.stringify(FASHION_MODULES)
    const caps = JSON.stringify(p.capabilities)
    const r = await c.query(
      `INSERT INTO "Plan" ("code","name","description","priceMonthly","priceYearly",
        "maxUsers","maxProducts","maxBranches","businessType","enabledModules","capabilities","sortOrder","isActive","visibility")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'fashion',$9,$10,$11,true,'hidden')
       ON CONFLICT ("code") DO UPDATE SET
         "name"=EXCLUDED."name", "description"=EXCLUDED."description",
         "businessType"='fashion', "enabledModules"=EXCLUDED."enabledModules",
         "capabilities"=EXCLUDED."capabilities"
       RETURNING id, code`,
      [p.code, p.name, p.description, p.priceMonthly, p.priceYearly,
       p.maxUsers, p.maxProducts, p.maxBranches, modules, caps, p.sortOrder],
    )
    console.log('plan:', r.rows[0].code, r.rows[0].id)
    if (p.code === 'fashion-pro') proId = r.rows[0].id
  }
  await c.query(
    `UPDATE "Subscription" SET "planId"=$1 WHERE "tenantId"=$2 AND status='active'`,
    [proId, TENANT_B],
  )
  const chk = await c.query(
    `SELECT p.code, p."businessType" FROM "Subscription" s JOIN "Plan" p ON p.id=s."planId"
     WHERE s."tenantId"=$1 AND s.status='active'`, [TENANT_B])
  console.log('Tenant B plan:', JSON.stringify(chk.rows))
  await c.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
