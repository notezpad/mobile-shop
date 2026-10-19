import type { NextRequest } from 'next/server'
import { withSql } from '@/lib/sql'
import { getSession } from '@/lib/auth'

/**
 * 🔁 2026-10-18 — منع تنفيذ نفس العملية مرتين (Idempotency-Key).
 *
 * السيناريو اللي بيحله: الطلب اتنفّذ على السيرفر (commit) والرد ضاع بسبب انقطاع النت. الواجهة
 * كانت بتعتبره فشل، تحطه في طابور الأوفلاين، وتبعته تاني → دفعة/أمر شراء/مصروف/حركة مخزون
 * بتتسجل مرتين. (حماية الفواتير clientRef كانت بتتولّد بعد المحاولة الأولى، فمكانتش بتغطيه.)
 *
 * الواجهة بتبعت header `Idempotency-Key` بقيمة واحدة من أول محاولة وبنفس القيمة في الطابور.
 * هنا:
 *   - مفتاح جديد     → نحجزه، ننفّذ، ولو نجح (2xx) نخزّن الرد.
 *   - نفس المفتاح تاني → لو العملية خلصت: نرجّع نفس الرد من غير ما ننفّذ.
 *                        لو لسه شغالة: 409 (حاول بعد ثانية).
 *   - فشل (غير 2xx) أو استثناء → بنفك الحجز عشان المحاولة بعد التصحيح تشتغل.
 * من غير header → السلوك القديم تماماً.
 */
export async function withIdempotency(
  req: NextRequest,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get('idempotency-key')?.trim()
  if (!key || key.length < 8 || key.length > 80) return run()

  const session = await getSession().catch(() => null)
  if (!session) return run() // الـ handler نفسه هيرجّع 401
  const tenantId = session.tenantId
  const method = req.method
  const path = new URL(req.url).pathname

  const claim = await withSql(async (sql) => {
    const ins = await sql`
      INSERT INTO "IdempotencyKey" ("tenantId", "key", "method", "path")
      VALUES (${tenantId}, ${key}, ${method}, ${path})
      ON CONFLICT ("tenantId", "key") DO NOTHING
      RETURNING "id"`
    if (ins.length > 0) return { owner: true as const }
    const ex = await sql<{ status: number | null; body: string | null; contentType: string | null; method: string; path: string }[]>`
      SELECT "status", "body", "contentType", "method", "path"
        FROM "IdempotencyKey" WHERE "tenantId" = ${tenantId} AND "key" = ${key}`
    return { owner: false as const, existing: ex[0] ?? null }
  })

  if (!claim.owner) {
    const ex = claim.existing
    if (!ex) return run() // اتمسح بين الاستعلامين — ننفّذ عادي
    if (ex.method !== method || ex.path !== path) {
      return Response.json({ error: 'مفتاح التكرار مستخدم لعملية مختلفة' }, { status: 422 })
    }
    if (ex.status == null) {
      return Response.json({ error: 'العملية قيد التنفيذ — حاول بعد ثانية' }, { status: 409, headers: { 'Retry-After': '2' } })
    }
    return new Response(ex.body ?? '', {
      status: ex.status,
      headers: { 'Content-Type': ex.contentType ?? 'application/json', 'Idempotent-Replay': 'true' },
    })
  }

  const release = () =>
    withSql((sql) => sql`DELETE FROM "IdempotencyKey" WHERE "tenantId" = ${tenantId} AND "key" = ${key}`).catch(() => {})

  let res: Response
  try {
    res = await run()
  } catch (e) {
    await release()
    throw e
  }

  if (res.status >= 200 && res.status < 300) {
    try {
      const body = await res.clone().text()
      const ct = res.headers.get('content-type')
      await withSql((sql) => sql`
        UPDATE "IdempotencyKey" SET "status" = ${res.status}, "body" = ${body}, "contentType" = ${ct}
         WHERE "tenantId" = ${tenantId} AND "key" = ${key}`)
    } catch {
      /* التخزين فشل — العملية نجحت، والحجز الفاضي بيمنع التكرار لحد ما يتنضّف */
    }
  } else {
    await release()
  }

  // تنضيف انتهازي (1% من الطلبات): نحذف المفاتيح الأقدم من 7 أيام
  if (Math.random() < 0.01) {
    void withSql((sql) => sql`DELETE FROM "IdempotencyKey" WHERE "createdAt" < now() - interval '7 days'`).catch(() => {})
  }
  return res
}
