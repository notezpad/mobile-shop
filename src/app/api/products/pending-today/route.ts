import { NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * 🔔 v13: المنتجات اللي لسه ملهاش دخول فعلي للمخزون — أي منتج نشط كميته صفر
 * ومش في أي أمر شراء، مهما كان تاريخ إضافته (قبل كده كانت «النهاردة» بس،
 * فمنتج اتضاف أمس كان بيختفي من الإشعار). الاسم pending-today اتسب كما هو
 * عشان مسار الـ API والكاش القديم ما يتكسروش.
 * الأحدث أولاً، وبحد أقصى 200 عشان الإشعار ما يتحولش لقائمة ضخمة.
 */
async function __GET() {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  // saleh-mowazaf: module 'purchases'
  try { requireModule(session, 'purchases') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const where: any = {
    tenantId: session.tenantId,
    quantity: 0,
    active: true,
    purchaseOrderItems: { none: {} },
  }
  if (session.branchId) {
    where.OR = [{ branchId: session.branchId }, { branchId: null }]
  }

  const products = await db.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
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
