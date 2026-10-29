import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { canAccessBranchRecord } from '@/lib/branch-scope-db'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['مستلم', 'قيد العمل', 'مكتمل', 'مُسلَّم']

async function __PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }
  const existing = await db.maintenanceOrder.findUnique({ where: { id: oid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: 'أوردر الصيانة غير موجود' },
      { status: 404 }
    )
  }

  if (!(await canAccessBranchRecord(session.tenantId, existing.branchId ?? null, session.branchId))) {
    return NextResponse.json({ error: 'أوردر الصيانة غير موجود' }, { status: 404 })
  }

  const nextStatus =
    body.status !== undefined ? String(body.status) : existing.status
  if (!VALID_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
  }

  // transition to delivered → set deliveredAt + create CashEntry once
  const becomingDelivered =
    nextStatus === 'مُسلَّم' && existing.status !== 'مُسلَّم'

  const updated = await db.$transaction(async (tx) => {
    const ord = await tx.maintenanceOrder.update({
      where: { id: oid },
      data: {
        customerName: body.customerName !== undefined ? String(body.customerName).trim() : undefined,
        phone: body.phone !== undefined ? (body.phone ? String(body.phone) : null) : undefined,
        device: body.device !== undefined ? String(body.device).trim() : undefined,
        issue: body.issue !== undefined ? String(body.issue) : undefined,
        cost: body.cost !== undefined ? Number(body.cost) || 0 : undefined,
        status: nextStatus,
        deliveredAt: becomingDelivered ? new Date() : existing.deliveredAt,
      },
    })
    if (becomingDelivered && ord.cost > 0) {
      // 🛡️ 2026-09-30 (X1): قيد واحد بس لكل أوردر — قبل كده لو الحالة رجعت
      // مستلم ورجعت مُسلّم تاني، قيد خزنة تاني كان بيتسجل (الخزنة بتتضخم).
      const existingEntry = await tx.cashEntry.findFirst({
        where: {
          tenantId: session.tenantId,
          source: 'maintenance',
          refId: oid,
          amount: { gt: 0 },
        },
        select: { id: true },
      })
      if (!existingEntry) {
        await tx.cashEntry.create({
          data: {
            tenantId: session.tenantId,
            source: 'maintenance',
            refId: oid,
            amount: ord.cost,
            note: `صيانة - ${ord.customerName} (${ord.device})`,
            userId: session.userId,
          },
        })
      }
    }
    return ord
  })

  return NextResponse.json(updated)
}

async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  const oid = parseInt(id, 10)
  if (isNaN(oid)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  const existing = await db.maintenanceOrder.findUnique({ where: { id: oid } })
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json(
      { error: 'أوردر الصيانة غير موجود' },
      { status: 404 }
    )
  }
  if (!(await canAccessBranchRecord(session.tenantId, existing.branchId ?? null, session.branchId))) {
    return NextResponse.json({ error: 'أوردر الصيانة غير موجود' }, { status: 404 })
  }
  // 🛡️ 2026-09-30 (X1): حذف الأوردر كان بيسيب قيد الخزنة يتيم — الفلوس
  // بتفضل في الخزنة على حاجة اتمسحت. دلوقتي القيد بيعكس الأول.
  await db.$transaction(async (tx) => {
    const entry = await tx.cashEntry.findFirst({
      where: {
        tenantId: session.tenantId,
        source: 'maintenance',
        refId: oid,
      },
      orderBy: { id: 'desc' },
    })
    if (entry && entry.amount > 0) {
      await tx.cashEntry.create({
        data: {
          tenantId: session.tenantId,
          source: 'maintenance',
          refId: oid,
          amount: -entry.amount,
          method: entry.method,
          note: `عكس قيد صيانة محذوفة - ${existing.customerName} (${existing.device})`,
          userId: session.userId,
        },
      })
    }
    await tx.maintenanceOrder.delete({ where: { id: oid } })
  })
  return NextResponse.json({ ok: true })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
