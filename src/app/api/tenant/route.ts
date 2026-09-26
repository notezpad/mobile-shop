import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import {
  requireAuthIgnoreSubscription,
  requireAdmin,
  authErrorResponse,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function __GET() {
  let session
  try {
    // 🛡️ 2026-09-21: Use requireAuthIgnoreSubscription instead of requireAuth.
    // This lets a tenant with an EXPIRED subscription still load their shop
    // info (shop name, logo, commission rates) on the Settings page — so they
    // can see their settings AND apply a redeem code. Previously this endpoint
    // returned 402 on expired subs, which made the Settings page unusable
    // (the user couldn't even see the redeem form).
    session = await requireAuthIgnoreSubscription()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      shopName: true,
      phone: true,
      address: true,
      logoPath: true,
      invoicePrefix: true,
      commissionVodafoneCash: true,
      commissionInstapay: true,
      commissionFawry: true,
      wholesaleEnabled: true,
      retailEnabled: true,
    },
  })
  if (!tenant) {
    return NextResponse.json({ error: 'المحل غير موجود' }, { status: 404 })
  }
  const res = NextResponse.json(tenant)
  // 🛡️ FIX (stuck-logout / stale data across sessions): same class of bug
  // as /api/auth/me — caching a per-session response in the browser's own
  // HTTP cache means it can outlive the session itself. If tenant A logs
  // out and tenant B logs in on the same browser within the cache window,
  // B could briefly see A's cached shop name/branding too. See the note
  // in src/app/api/auth/me/route.ts for the full explanation.
  res.headers.set('Cache-Control', 'no-store')
  return res
}

async function __PUT(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const data: any = {}
  if (body.shopName !== undefined) data.shopName = String(body.shopName)
  if (body.phone !== undefined)
    data.phone = body.phone ? String(body.phone) : null
  if (body.address !== undefined)
    data.address = body.address ? String(body.address) : null
  if (body.logoPath !== undefined)
    data.logoPath = body.logoPath ? String(body.logoPath) : null
  if (body.invoicePrefix !== undefined)
    data.invoicePrefix = String(body.invoicePrefix || 'INV')
  if (body.commissionVodafoneCash !== undefined)
    data.commissionVodafoneCash = Number(body.commissionVodafoneCash) || 0
  if (body.commissionInstapay !== undefined)
    data.commissionInstapay = Number(body.commissionInstapay) || 0
  if (body.commissionFawry !== undefined)
    data.commissionFawry = Number(body.commissionFawry) || 0
  if (body.wholesaleEnabled !== undefined)
    data.wholesaleEnabled = Boolean(body.wholesaleEnabled)
  if (body.retailEnabled !== undefined)
    data.retailEnabled = Boolean(body.retailEnabled)

  const updated = await db.tenant.update({
    where: { id: session.tenantId },
    data,
    select: {
      id: true,
      shopName: true,
      phone: true,
      address: true,
      logoPath: true,
      invoicePrefix: true,
      commissionVodafoneCash: true,
      commissionInstapay: true,
      commissionFawry: true,
      wholesaleEnabled: true,
      retailEnabled: true,
    },
  })
  return NextResponse.json(updated)
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
