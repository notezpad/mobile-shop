import { NextRequest, NextResponse } from 'next/server'
import { withDb } from '@/lib/db'
import { withIdempotency } from '@/lib/idempotency'
import { getSql } from '@/lib/sql'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { isDateStr } from '@/lib/hr'
import { getTenantTimezone, localDateStrToUtcBounds } from '@/lib/tenantTime'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * POST { rows: [{ name, baseSalary, jobTitle?, phone?, weeklyOffDay?, hireDate? }] }
 * الأسماء المكررة (موجودة بالفعل عند المحل) بتتخطى — مفيش تكرار بالغلط لو الملف اترفع مرتين.
 */
async function __POST(req: NextRequest) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const b = await req.json().catch(() => null)
  const rows: any[] = Array.isArray(b?.rows) ? b.rows : []
  if (rows.length === 0) return bad('الملف فاضي')
  if (rows.length > 300) return bad('أقصى عدد 300 موظف في المرة الواحدة')

  const tz = await getTenantTimezone(session.tenantId)
  const sql = getSql()
  const existing = new Set(
    (await sql<{ name: string }[]>`SELECT "name" FROM "Employee" WHERE "tenantId" = ${session.tenantId}`).map((e) => norm(e.name)),
  )
  const clean: any[] = []
  const skipped: string[] = []
  for (const r of rows) {
    const name = String(r?.name ?? '').trim()
    const salary = Number(r?.baseSalary)
    if (!name || !Number.isFinite(salary) || salary < 0) return bad(`بيانات غير صالحة عند الموظف "${name || '؟'}"`)
    if (existing.has(norm(name))) { skipped.push(name); continue }
    existing.add(norm(name))
    const off = r.weeklyOffDay === undefined || r.weeklyOffDay === null || r.weeklyOffDay === '' ? 5 : Math.floor(Number(r.weeklyOffDay))
    clean.push({
      name, baseSalary: salary,
      jobTitle: r.jobTitle ? String(r.jobTitle).trim() || null : null,
      phone: r.phone ? String(r.phone).trim() || null : null,
      weeklyOffDay: off >= 0 && off <= 6 ? off : 5,
      hireDate: isDateStr(r.hireDate) ? localDateStrToUtcBounds(r.hireDate, 'start', tz).toISOString() : new Date().toISOString(),
    })
  }
  if (clean.length > 0) {
    const payload = JSON.stringify(clean)
    await sql`
      INSERT INTO "Employee" ("tenantId", "branchId", "name", "phone", "jobTitle", "baseSalary", "weeklyOffDay", "hireDate")
      SELECT ${session.tenantId}, ${session.branchId ?? null}, r."name", r."phone", r."jobTitle", r."baseSalary", r."weeklyOffDay", r."hireDate"::timestamp
      FROM jsonb_to_recordset(${payload}::text::jsonb)
        AS r("name" text, "phone" text, "jobTitle" text, "baseSalary" float8, "weeklyOffDay" int, "hireDate" text)`
  }
  await logAudit({ action: 'hr.employee.import', targetType: 'tenant', targetId: session.tenantId, details: { inserted: clean.length, skipped: skipped.length } }, req)
  return NextResponse.json({ ok: true, inserted: clean.length, skipped })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withIdempotency(args[0] as NextRequest, () => withDb(() => hrSafe(() => __POST(...args))))
}
