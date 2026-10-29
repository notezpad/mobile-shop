import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { hrGuard, bad, hrSafe } from '@/lib/hr-route'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** DELETE = إلغاء سلفة لسه ماتخصمش منها أي قسط (بترجّع الفلوس للخزنة). */
async function __DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await hrGuard('admin')
  if ('res' in g) return g.res
  const { session } = g
  const id = parseInt((await params).id, 10)
  if (!Number.isFinite(id)) return bad('معرف غير صالح')

  const adv = await db.employeeAdvance.findUnique({ where: { id }, include: { employee: { select: { name: true } } } })
  if (!adv || adv.tenantId !== session.tenantId) return bad('السلفة غير موجودة', 404)
  if (adv.status !== 'open' || Math.abs(adv.remaining - adv.amount) > 0.005) {
    return bad('لا يمكن إلغاء سلفة اتخصم منها بالفعل أو انتهت', 409)
  }

  const done = await db.$transaction(async (tx) => {
    const claimed = await tx.employeeAdvance.updateMany({
      where: { id, status: 'open', remaining: adv.amount },
      data: { status: 'cancelled', remaining: 0 },
    })
    if (claimed.count === 0) throw new Error('CONFLICT')
    await tx.cashEntry.create({
      data: {
        tenantId: session.tenantId, source: 'advance', refId: id, amount: adv.amount, method: adv.method,
        note: `إلغاء سلفة الموظف ${adv.employee.name}`, userId: session.userId,
      },
    })
    return true
  }).catch((e) => {
    if (e instanceof Error && e.message === 'CONFLICT') return null
    throw e
  })
  if (!done) return bad('السلفة اتغيّرت — حدّث الصفحة وحاول تاني', 409)
  await logAudit({ action: 'hr.advance.cancel', targetType: 'advance', targetId: id }, req)
  return NextResponse.json({ ok: true })
}

export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => hrSafe(() => __DELETE(...args)))
}
