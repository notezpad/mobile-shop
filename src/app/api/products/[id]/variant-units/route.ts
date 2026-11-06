import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse, requireModuleWritePermission } from '@/lib/features'
import { canAccessProductBranch } from '@/lib/branch-scope-db'
import {
  normalizeImei, normalizeBatteryHealth, isIphoneDevice,
} from '@/lib/variant-device'

export const dynamic = 'force-dynamic'

/**
 * 📱 التحديث 33 (2026-11-06): أجهزة المتغير — IMEI/سيريال لكل قطعة على حدة.
 *
 * المتغير (ProductVariant) بيتابع الكمية كرقم إجمالي («2 قطعة ايفون 256GB أسود»)،
 * والجدول ده بيربط كل قطعة بـ IMEI خاص بيها + نسبة صحة البطارية (للآيفون بس).
 *
 * GET    /api/products/[id]/variant-units                → كل أجهزة منتج (كل المتغيرات)
 * POST   /api/products/[id]/variant-units                → تسجيل جهاز { variantId, imei, batteryHealth?, note? }
 * PATCH  /api/products/[id]/variant-units?unitId=N       → تعديل (batteryHealth / note / status)
 * DELETE /api/products/[id]/variant-units?unitId=N       → حذف جهاز
 *
 * الـ IMEI فريد على مستوى المحل (tenantId + imeiNorm) — نفس الجهاز ممنوع يتسجل مرتين
 * (حماية من بيع جهاز مسروق/مباع قبل كده، وتتبع الضمان لو رجع بعيب).
 */

interface UnitRow {
  id: number
  variantId: number
  imei: string
  batteryHealth: number | null
  note: string | null
  status: string
  createdAt: Date
}

async function loadTenantProduct(tenantId: string, productId: number) {
  const p = await db.product.findUnique({ where: { id: productId } })
  if (!p || p.tenantId !== tenantId) return null
  return p
}

async function __GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // saleh-mowazaf: module 'products'
  try { await requireModule(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })

  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  if (session.branchId && !(await canAccessProductBranch(session.tenantId, prod.branchId, session.branchId))) {
    return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  }

  const units = await db.variantUnit.findMany({
    where: { tenantId: session.tenantId, variant: { productId: pid } },
    orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
    select: { id: true, variantId: true, imei: true, batteryHealth: true, note: true, status: true, createdAt: true },
  })
  return NextResponse.json(units as UnitRow[])
}

async function __POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // saleh-kateb-mowazaf: module 'products'
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  if (session.branchId && !(await canAccessProductBranch(session.tenantId, prod.branchId, session.branchId))) {
    return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const variantId = parseInt(body?.variantId, 10)
  if (isNaN(variantId)) return NextResponse.json({ error: 'المتغير مطلوب' }, { status: 400 })

  // المتغير تابع لنفس المنتج والمحل؟
  const variant = await db.productVariant.findUnique({ where: { id: variantId } })
  if (!variant || variant.productId !== pid) {
    return NextResponse.json({ error: 'المتغير غير موجود' }, { status: 404 })
  }

  // 📱 الـ IMEI مطلوب وموحّد (بلا فواصل/مسافات) وفريد على مستوى المحل
  const imeiNorm = normalizeImei(body?.imei)
  if (!imeiNorm.ok) {
    return NextResponse.json({ error: imeiNorm.error }, { status: 400 })
  }

  // 🔋 نسبة صحة البطارية: للآيفون بس (من اسم المنتج) — وأي قيمة ممنوعة غير 1..100
  let batteryHealth: number | null = null
  if (body?.batteryHealth !== undefined && body?.batteryHealth !== null && body?.batteryHealth !== '') {
    if (!isIphoneDevice(prod.name)) {
      return NextResponse.json({ error: 'صحة البطارية متاحة للآيفون بس' }, { status: 400 })
    }
    const bNorm = normalizeBatteryHealth(body.batteryHealth)
    if (!bNorm.ok) {
      return NextResponse.json({ error: 'صحة البطارية لازم رقم صحيح من 1 لـ 100' }, { status: 400 })
    }
    batteryHealth = bNorm.value
  }

  const note = body?.note ? String(body.note).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null

  try {
    const created = await db.variantUnit.create({
      data: {
        tenantId: session.tenantId,
        variantId,
        imei: imeiNorm.imei,
        imeiNorm: imeiNorm.imeiNorm,
        batteryHealth,
        note,
      },
      select: { id: true, variantId: true, imei: true, batteryHealth: true, note: true, status: true, createdAt: true },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'الـ IMEI ده مسجل قبل كده على جهاز تاني في المحل' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل تسجيل الجهاز' }, { status: 500 })
  }
}

async function __PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

  const unitId = parseInt(new URL(req.url).searchParams.get('unitId') ?? '', 10)
  if (isNaN(unitId)) return NextResponse.json({ error: 'معرف الجهاز غير صالح' }, { status: 400 })

  const unit = await db.variantUnit.findFirst({
    where: { id: unitId, tenantId: session.tenantId, variant: { productId: pid } },
  })
  if (!unit) return NextResponse.json({ error: 'الجهاز غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: { batteryHealth?: number | null; note?: string | null; status?: string } = {}

  if (body.batteryHealth !== undefined) {
    // 🔋 للآيفون بس — حتى التعديل
    if (!isIphoneDevice(prod.name)) {
      return NextResponse.json({ error: 'صحة البطارية متاحة للآيفون بس' }, { status: 400 })
    }
    const bNorm = normalizeBatteryHealth(body.batteryHealth)
    if (!bNorm.ok) {
      return NextResponse.json({ error: 'صحة البطارية لازم رقم صحيح من 1 لـ 100' }, { status: 400 })
    }
    data.batteryHealth = bNorm.value
  }
  if (body.note !== undefined) {
    data.note = body.note ? String(body.note).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null
  }
  if (body.status !== undefined) {
    const s = String(body.status).trim().toLowerCase()
    if (s !== 'in_stock' && s !== 'sold') {
      return NextResponse.json({ error: 'حالة غير صالحة (بالمخزن / تم بيعه)' }, { status: 400 })
    }
    data.status = s
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'مفيش حاجة للتعديل' }, { status: 400 })
  }
  try {
    const updated = await db.variantUnit.update({
      where: { id: unitId },
      data,
      select: { id: true, variantId: true, imei: true, batteryHealth: true, note: true, status: true, createdAt: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
  }
}

async function __DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id } = await params
  const pid = parseInt(id, 10)
  if (isNaN(pid)) return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  const prod = await loadTenantProduct(session.tenantId, pid)
  if (!prod) return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })

  const unitId = parseInt(new URL(req.url).searchParams.get('unitId') ?? '', 10)
  if (isNaN(unitId)) return NextResponse.json({ error: 'معرف الجهاز غير صالح' }, { status: 400 })

  const unit = await db.variantUnit.findFirst({
    where: { id: unitId, tenantId: session.tenantId, variant: { productId: pid } },
  })
  if (!unit) return NextResponse.json({ error: 'الجهاز غير موجود' }, { status: 404 })

  await db.variantUnit.delete({ where: { id: unitId } })
  return NextResponse.json({ ok: true })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
export async function PATCH(...args: Parameters<typeof __PATCH>) {
  return withDb(() => __PATCH(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
