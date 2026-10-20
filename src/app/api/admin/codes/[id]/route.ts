import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireSuperAdmin, authErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const { id } = await params
  const codeId = Number(id)
  if (Number.isNaN(codeId)) {
    return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 })
  }

  const existing = await db.activationCode.findUnique({ where: { id: codeId } })
  if (!existing) {
    return NextResponse.json({ error: 'الكود غير موجود' }, { status: 404 })
  }
  if (existing.redeemedAt) {
    return NextResponse.json(
      { error: 'لا يمكن حذف كود مستخدم بالفعل' },
      { status: 400 }
    )
  }

  await db.activationCode.delete({ where: { id: codeId } })
  await logAudit({ action: 'code.delete', targetType: 'code', targetId: codeId }, _req)
  return NextResponse.json({ ok: true })
}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
