import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { productBranchWhere } from '@/lib/branch-scope-db'
import { normalizeImeiNorm } from '@/lib/variant-device'

export const dynamic = 'force-dynamic'

/**
 * 🔎 التحديث 33 (2026-11-06) — GET /api/inventory/imei-lookup?q=...
 * بحث بالـ IMEI/السيريال في مخزون المحل كله (عبر كل المنتجات والمتغيرات).
 *
 * بيرجّع الأجهزة المطابقة (بحث جزئي — بادئة/جزء من الرقم) مع المنتج والمتغير
 * والحالة وصحة البطارية — عشان تتتبع أي جهاز في ثانية (ضمان / مسروق / مباع).
 * الحد الأدنى 4 حرف/رقم بعد التطبيع عشان البحث يفضل سريع.
 */
async function __GET(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  const norm = normalizeImeiNorm(q)
  if (norm.length < 4) return NextResponse.json({ error: 'اكتب 4 حرف/رقم على الأقل من الـ IMEI' }, { status: 400 })

  const branchWhere = await productBranchWhere(s.tenantId, s.branchId ?? null)

  const units = await db.variantUnit.findMany({
    where: {
      tenantId: s.tenantId,
      imeiNorm: { contains: norm },
      variant: { product: branchWhere },
    },
    orderBy: { id: 'asc' },
    take: 20,
    select: {
      id: true, imei: true, batteryHealth: true, status: true, note: true, createdAt: true,
      variant: {
        select: {
          id: true, size: true, color: true, condition: true, quantity: true,
          product: { select: { id: true, name: true, branchId: true, branch: { select: { name: true } } } },
        },
      },
    },
  })

  return NextResponse.json({
    found: units.length > 0,
    units: units.map((u) => ({
      id: u.id,
      imei: u.imei,
      batteryHealth: u.batteryHealth,
      status: u.status,
      note: u.note,
      createdAt: u.createdAt,
      productId: u.variant.product.id,
      productName: u.variant.product.name,
      branchName: u.variant.product.branch?.name ?? null,
      variant: {
        id: u.variant.id,
        size: u.variant.size,
        color: u.variant.color,
        condition: u.variant.condition,
      },
    })),
  })
}

export async function GET(req: NextRequest) {
  return withDb(() => __GET(req))
}
