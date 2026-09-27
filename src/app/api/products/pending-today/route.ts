import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { getTenantTimezone, startOfDayInTz } from '@/lib/tenantTime'

export const dynamic = 'force-dynamic'

/**
 * منتجات اتضافت للكتالوج النهاردة، بكمية صفر (يعني لسه معملهاش دخول فعلي للمخزون)،
 * ولسه مش مرتبطة بأي أمر شراء سابق — دي المرشحة إنها "منتجات فاتورة النهاردة"
 * اللي لسه محتاجة تتحط في سلة أمر شراء.
 */
async function __GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // 🕐 نفس إصلاح توقيت المحل الموجود في /api/dashboard — "النهاردة" لازم
  // يتحسب بتوقيت المحل نفسه، مش بتوقيت السيرفر (UTC).
  const tz = await getTenantTimezone(session.tenantId)
  const startOfDay = startOfDayInTz(new Date(), tz)

  const where: any = {
    tenantId: session.tenantId,
    quantity: 0,
    createdAt: { gte: startOfDay },
    purchaseOrderItems: { none: {} },
  }
  if (session.branchId) {
    where.OR = [{ branchId: session.branchId }, { branchId: null }]
  }

  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      barcode: true,
      cost: true,
      quantity: true,
    },
  })

  return NextResponse.json(products)
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
