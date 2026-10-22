import postgres from 'postgres'
import { insertProductsBulk, mergeQuantitiesBulk, closeSeasonBulk, openSeasonBulk, SeasonError, BULK_CHUNK } from '../../src/lib/bulk-sql'

let stmts = 0
// نفس إعدادات src/lib/sql.ts بالظبط
const sql = postgres({
  host: '/tmp', port: 5433, user: 'postgres', database: 'shop',
  max: 3, prepare: false, fetch_types: false,
  debug: () => { stmts++ },
}) as any

const ok = (c: boolean, m: string) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1 }
const T = 'tenant-1'

async function main() {
  await sql`INSERT INTO "Tenant"(id) VALUES (${T}) ON CONFLICT DO NOTHING`
  await sql`INSERT INTO "Category"("tenantId", name) VALUES (${T}, 'تيشيرتات')`   // تصنيف موجود مسبقًا

  // ─── 1) استيراد ١٢٠٠ منتج (٣ دفعات) مع الوحدات الافتراضية ───
  const N = 1200
  const mk = (i: number) => ({
    name: `منتج ${i}`, category: i % 3 === 0 ? 'تيشيرتات' : i % 3 === 1 ? ' بناطيل ' : null,
    barcode: i % 2 === 0 ? `bc${i}` : null, price: 100 + i, cost: 60 + i, qty: i % 5 === 0 ? 0 : 10 + (i % 7),
    minQuantity: 1, season: i % 2 ? 'SUMMER' : 'WINTER', displayQty: i % 5 === 0 ? 0 : 5, unitLabel: null,
  })
  const all = Array.from({ length: N }, (_, i) => mk(i + 1))
  stmts = 0
  let created = 0
  for (let i = 0; i < all.length; i += BULK_CHUNK)
    created += await insertProductsBulk(sql, { tenantId: T, branchId: null, userId: 'u1', withDefaultUnits: true }, all.slice(i, i + BULK_CHUNK))
  console.log(`   ↳ ${stmts} statements لاستيراد ${N} منتج`)
  ok(created === N, `created = ${created}`)
  const [c1] = await sql`SELECT count(*)::int n, count(DISTINCT id)::int d FROM "Product"`
  ok(c1.n === N && c1.d === N, 'عدد المنتجات وids فريدة')
  const [u1] = await sql`SELECT count(*)::int n FROM "ProductUnit"`
  ok(u1.n === N * 4, `الوحدات الافتراضية = ${u1.n} (٤ لكل منتج)`)
  const [unitPrice] = await sql`SELECT u.price, u.factor FROM "ProductUnit" u JOIN "Product" p ON p.id=u."productId" WHERE p.name='منتج 7' AND u.name='دستة'`
  ok(unitPrice.price === (107 * 12), `سعر وحدة الدستة = ${unitPrice.price}`)
  const [m1] = await sql`SELECT count(*)::int n FROM "StockMovement" WHERE type='in' AND note='رصيد افتتاحي (استيراد Excel)'`
  ok(m1.n === all.filter(r => r.qty > 0).length, `حركات الرصيد الافتتاحي = ${m1.n} (من غير الكمية 0)`)
  const cats = await sql`SELECT name FROM "Category" WHERE "tenantId"=${T} ORDER BY name`
  ok(cats.length === 2 && cats.some((c: any) => c.name === 'بناطيل'), `التصنيفات من غير تكرار ومترّمة: ${cats.map((c: any) => c.name).join(' | ')}`)
  const [p5] = await sql`SELECT category, quantity, "displayQty", season FROM "Product" WHERE name='منتج 4'`
  ok(p5.category === 'بناطيل' && p5.quantity === 14 && p5.displayQty === 5 && p5.season === 'WINTER', 'حقول المنتج صحيحة (category اتشال منها المسافات)')

  // ─── 2) دمج كميات: موجود + موقوف يتفعّل + تحديث سعر ───
  await sql`UPDATE "Product" SET active=false WHERE name='منتج 1'`
  const ids = await sql`SELECT id, name, quantity, price FROM "Product" WHERE name IN ('منتج 1','منتج 2','منتج 3') ORDER BY name`
  stmts = 0
  const mr = await mergeQuantitiesBulk(sql, { tenantId: T, branchId: null, userId: 'u1' }, [
    { id: ids[0].id, qty: 5, setPrice: 999, setCost: null, reactivate: true },
    { id: ids[1].id, qty: 0, setPrice: null, setCost: null, reactivate: false },
    { id: ids[2].id, qty: 2.5, setPrice: null, setCost: 1, reactivate: false },
  ])
  console.log(`   ↳ ${stmts} statement للدمج`)
  ok(mr.merged === 3 && mr.qty === 7.5, `merge: merged=${mr.merged}, qty=${mr.qty}`)
  const [p1] = await sql`SELECT active, price, quantity FROM "Product" WHERE id=${ids[0].id}`
  ok(p1.active === true && p1.price === 999 && p1.quantity === ids[0].quantity + 5, 'المنتج الموقوف اتفعّل + السعر اتحدّث + الكمية زادت')
  const [p2] = await sql`SELECT price FROM "Product" WHERE id=${ids[1].id}`
  ok(p2.price === ids[1].price, 'السعر ماتغيرش لما setPrice = null')
  const [m2] = await sql`SELECT count(*)::int n FROM "StockMovement" WHERE note LIKE '%دمج كمية%'`
  ok(m2.n === 2, `حركة لكل دمج بكمية > 0 فقط (${m2.n})`)

  // ─── 3) إغلاق موسم الصيف (٦٠٠ منتج، منهم واحد بمقاسات) ───
  const [vp] = await sql`SELECT id FROM "Product" WHERE season='SUMMER' AND "displayQty">0 ORDER BY id LIMIT 1`
  await sql`INSERT INTO "ProductVariant"("productId", size, quantity, "displayQty") VALUES (${vp.id}, 'M', 5, 3), (${vp.id}, 'L', 5, 2)`
  const [pre] = await sql`SELECT count(*)::int n, sum("displayQty")::float8 s FROM "Product" WHERE season='SUMMER' AND active AND "displayQty">0`
  stmts = 0
  const cl = await closeSeasonBulk(sql, { tenantId: T, userId: 'u1', season: 'SUMMER', label: 'صيفي' })
  console.log(`   ↳ ${stmts} statement لإغلاق ${cl.products} صنف`)
  ok(cl.products === pre.n && cl.pieces === pre.s, `close: ${cl.products} صنف / ${cl.pieces} قطعة (متوقع ${pre.n}/${pre.s})`)
  const [post] = await sql`SELECT count(*)::int n FROM "Product" WHERE season='SUMMER' AND "displayQty">0`
  ok(post.n === 0, 'المعروض اتصفّر لكل أصناف الصيف')
  const [vv] = await sql`SELECT sum("displayQty")::int s FROM "ProductVariant" WHERE "productId"=${vp.id}`
  ok(vv.s === 0, 'المقاسات اتصفّرت مع المنتج')
  const [wi] = await sql`SELECT count(*)::int n FROM "StockMovement" WHERE type='warehouse_in' AND "refType"='season'`
  ok(wi.n === pre.n, `حركات warehouse_in = ${wi.n}`)
  const [note] = await sql`SELECT note FROM "StockMovement" WHERE type='warehouse_in' ORDER BY id LIMIT 1`
  console.log('   ↳ نص الحركة:', note.note)
  const [ten] = await sql`SELECT "closedSeasons" cs FROM "Tenant" WHERE id=${T}`
  ok(ten.cs === '["SUMMER"]', `closedSeasons = ${ten.cs}`)
  const [wtot] = await sql`SELECT sum(quantity)::float8 q FROM "Product" WHERE season='SUMMER'`
  console.log('   ↳ إجمالي الكميات ماتغيرش (حركة موقع مش مال):', wtot.q)

  // إغلاق تاني = لا شيء
  const cl2 = await closeSeasonBulk(sql, { tenantId: T, userId: 'u1', season: 'SUMMER', label: 'صيفي' })
  ok(cl2.products === 0, 'إغلاق تاني للموسم = صفر أصناف')

  // ─── 4) فتح الموسم: ٥٠٠ صنف (منهم الصنف بالمقاسات) ───
  const wh = await sql`SELECT p.id, p.quantity - p."displayQty" AS wh, (SELECT count(*) FROM "ProductVariant" v WHERE v."productId"=p.id)::int vc
                       FROM "Product" p WHERE p.season='SUMMER' AND p.active AND p.quantity - p."displayQty" > 0 ORDER BY p.id LIMIT 500`
  const items = wh.map((r: any) => ({ productId: r.id, qty: r.wh }))
  stmts = 0
  const op = await openSeasonBulk(sql, { tenantId: T, userId: 'u1', season: 'SUMMER', label: 'صيفي' }, items)
  console.log(`   ↳ ${stmts} statement لفتح ${op.products} صنف`)
  ok(op.products === wh.length, `open: ${op.products} صنف / ${op.pieces} قطعة`)
  const [dn] = await sql`SELECT count(*)::int n FROM "Product" WHERE id IN ${sql(wh.map((r: any) => r.id))} AND "displayQty" <> quantity`
  ok(dn.n === 0, 'المعروض = الكمية الكلية للأصناف المفتوحة')
  const [ten2] = await sql`SELECT "closedSeasons" cs FROM "Tenant" WHERE id=${T}`
  ok(ten2.cs === '[]', `closedSeasons بعد الفتح = ${ten2.cs}`)
  const [vo] = await sql`SELECT count(*)::int n FROM "ProductVariant" WHERE "displayQty" <> quantity`
  ok(vo.n === 0, 'المقاسات اتفتحت كلها')

  // ─── 5) مسارات الأخطاء (نفس الرسائل/الأكواد القديمة) + rollback ───
  await closeSeasonBulk(sql, { tenantId: T, userId: 'u1', season: 'WINTER', label: 'شتوي' })
  const [w1] = await sql`SELECT id, quantity - "displayQty" AS wh FROM "Product" WHERE season='WINTER' AND quantity-"displayQty">0 ORDER BY id LIMIT 1`
  const [w2] = await sql`SELECT id, quantity - "displayQty" AS wh FROM "Product" WHERE season='WINTER' AND quantity-"displayQty">0 ORDER BY id OFFSET 1 LIMIT 1`
  const before = await sql`SELECT count(*)::int n FROM "StockMovement"`
  const expectErr = async (items: any[], status: number, label: string) => {
    try { await openSeasonBulk(sql, { tenantId: T, userId: 'u1', season: 'WINTER', label: 'شتوي' }, items); ok(false, label + ' (ما رماش خطأ)') }
    catch (e: any) { ok(e instanceof SeasonError && e.status === status, `${label} → ${e.status} «${e.message}»`) }
  }
  await expectErr([{ productId: w1.id, qty: 1 }, { productId: w2.id, qty: w2.wh + 5 }], 400, 'كمية أكبر من المخزن')
  await expectErr([{ productId: 99999999, qty: 1 }], 404, 'منتج غير موجود')
  await expectErr([{ productId: w1.id, qty: 0 }], 400, 'كمية صفر')
  const [afterRb] = await sql`SELECT count(*)::int n FROM "StockMovement"`
  const [w1chk] = await sql`SELECT "displayQty" d FROM "Product" WHERE id=${w1.id}`
  ok(afterRb.n === before[0].n && w1chk.d === 0, 'الخطأ في صنف = rollback كامل (الصنف الصحيح ما اتفتحش)')
  // تكرار نفس الصنف في الطلب → بيتجمّع
  const dup = await openSeasonBulk(sql, { tenantId: T, userId: 'u1', season: 'WINTER', label: 'شتوي' }, [{ productId: w1.id, qty: 1 }, { productId: w1.id, qty: 1 }])
  ok(dup.products === 1 && dup.pieces === 2, 'صنف مكرر في الطلب اتجمّع (2 قطعة)')
  // عزل المحلات: tenant تاني ما يقدرش يفتح أصناف محل تاني
  await sql`INSERT INTO "Tenant"(id) VALUES ('tenant-2') ON CONFLICT DO NOTHING`
  try { await openSeasonBulk(sql, { tenantId: 'tenant-2', userId: 'x', season: 'WINTER', label: 'شتوي' }, [{ productId: w2.id, qty: 1 }]); ok(false, 'عزل المحلات') }
  catch (e: any) { ok(e.status === 404, 'عزل المحلات: محل تاني → 404') }

  await sql.end()
}
main().catch((e) => { console.error('💥', e); process.exit(1) })
