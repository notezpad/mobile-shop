import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { withSql } from '@/lib/sql'

export const dynamic = 'force-dynamic'

/**
 * ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): GET/POST بقوا SQL مباشر عبر
 * postgres.js — الرد بنفس شكل Prisma القديم بالظبط (SELECT * بيرجّع نفس
 * الأعمدة بنفس الأنواع). الراوتر ده بيتسحب مع كل فتح لصفحة الصيانة، وكان
 * بيقع في wrangler tail بـ "Exceeded CPU Limit" بسبب إنشاء PrismaClient.
 */

async function __GET() {
  let session
  try {
    session = await requireAuth()
    await requireModule(session, 'maintenance')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  return withSql(async (sql) => {
    const orders = await sql`
      SELECT * FROM "MaintenanceOrder"
      WHERE "tenantId" = ${session.tenantId}
      ORDER BY "id" DESC
      LIMIT 500`
    return NextResponse.json(orders)
  })
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
    await requireModule(session, 'maintenance')
  } catch (e) {
    const fErr = featureErrorResponse(e)
    if (fErr) return NextResponse.json(fErr.body, { status: fErr.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body?.customerName || !String(body.customerName).trim()) {
    return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 })
  }
  if (!body?.device || !String(body.device).trim()) {
    return NextResponse.json({ error: 'الجهاز مطلوب' }, { status: 400 })
  }

  return withSql(async (sql) => {
    const rows = await sql`
      INSERT INTO "MaintenanceOrder"
        ("tenantId", "customerName", "phone", "device", "issue", "cost", "status")
      VALUES
        (${session.tenantId},
         ${String(body.customerName).trim()},
         ${body.phone ? String(body.phone).trim() : null},
         ${String(body.device).trim()},
         ${body.issue ? String(body.issue) : ''},
         ${Number(body.cost ?? 0) || 0},
         'مستلم')
      RETURNING *`
    return NextResponse.json(rows[0], { status: 201 })
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return __GET(...args)
}
export async function POST(...args: Parameters<typeof __POST>) {
  return __POST(...args)
}
