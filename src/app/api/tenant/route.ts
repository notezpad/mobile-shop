import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import {
  requireAuthIgnoreSubscription,
  requireAdmin,
  authErrorResponse,
} from '@/lib/auth'
import { getPlanContext } from '@/lib/features'
import { withSql } from '@/lib/sql'

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

  // ⚡ 2026-10-17 (تقليل CPU — الخطوة 1): GET بقى SQL مباشر (postgres.js) —
  // نفس الأعمدة المحددة select بنفس الشكل. PUT فضل Prisma (عملية نادرة).
  return withSql(async (sql) => {
    const rows = await sql`
      SELECT "id", "shopName", "phone", "address", "logoPath", "invoicePrefix",
             "timezone", "commissionVodafoneCash", "commissionInstapay",
             "commissionFawry", "retailEnabled", "dynamicRetailPricingEnabled",
             "defaultRetailMarginPercent", "productCardStyle"
      FROM "Tenant"
      WHERE "id" = ${session.tenantId}
      LIMIT 1`
    const tenant = rows[0]
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
  })
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
  if (body.timezone !== undefined) {
    const tz = String(body.timezone || '').trim()
    // ✅ لازم يكون اسم منطقة زمنية IANA صحيح (زي "Africa/Cairo") — بنتأكد
    // منه عن طريق محاولة استخدامه فعليًا، لأن أي منطقة غلط هنا هتكسر
    // كل حسابات "اليوم/الشهر" في الداشبورد وتقارير المخزون والمبيعات.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      data.timezone = tz
    } catch {
      return NextResponse.json({ error: 'منطقة زمنية غير صالحة' }, { status: 400 })
    }
  }
  if (body.commissionVodafoneCash !== undefined)
    data.commissionVodafoneCash = Number(body.commissionVodafoneCash) || 0
  if (body.commissionInstapay !== undefined)
    data.commissionInstapay = Number(body.commissionInstapay) || 0
  if (body.commissionFawry !== undefined)
    data.commissionFawry = Number(body.commissionFawry) || 0
  // 🛡️ 2026-09-27: مفيش `wholesaleEnabled` تاني — البيع بالجملة بقى محكوم
  // بالكامل بـ capability الباقة (multi_unit). لو الباقة احترافية، الوحدات
  // شغالة تلقائي من غير أي تفعيل يدوي من التاجر. شوف
  // src/app/api/products/[id]/units/route.ts.
  if (body.retailEnabled !== undefined)
    data.retailEnabled = Boolean(body.retailEnabled)

  // 🛡️ 2026-10-03: التسعير الديناميكي (cost + هامش %) — باقة احترافية فقط.
  // 🛡️ 2026-10-05 (v8): الفحص بقى على التغيير الفعلي مش مجرّد وجود الحقل في
  // الجسم. صفحة الإعدادات كانت بتبعت الـ object كله (يعني dynamicRetailPricingEnabled
  // موجود دايماً حتى لو المستخدم مانسّهوش) → أي حفظ من باقة غير احترافية كان
  // بيرجع 403 «التسعير الديناميكي...» ومفيش حاجة بتتحفظ خالص. دلوقتي:
  // الحقل الموجود بنفس القيمة الحالية = مفيش تغيير = بيتمرّ عادي، وأي تغيير
  // حقيقي لسه محتاج الباقة الاحترافية (والـ client كمان بقى يبعت diff بس).
  if (
    body.dynamicRetailPricingEnabled !== undefined ||
    body.defaultRetailMarginPercent !== undefined
  ) {
    const current = await db.tenant.findUnique({
      where: { id: session.tenantId },
      select: { dynamicRetailPricingEnabled: true, defaultRetailMarginPercent: true },
    })
    const pricingChanged =
      body.dynamicRetailPricingEnabled !== undefined &&
      Boolean(body.dynamicRetailPricingEnabled) !==
        Boolean(current?.dynamicRetailPricingEnabled)
    const marginChanged =
      body.defaultRetailMarginPercent !== undefined &&
      Number(body.defaultRetailMarginPercent) !==
        Number(current?.defaultRetailMarginPercent ?? 0)
    if (pricingChanged || marginChanged) {
      const planCtxTenant = await getPlanContext(session.tenantId)
      if (!planCtxTenant.capabilities.includes('dynamic_retail_pricing')) {
        return NextResponse.json(
          { error: 'التسعير الديناميكي متاح للباقة الاحترافية فقط — يرجى ترقية الاشتراك' },
          { status: 403 }
        )
      }
    }
    if (body.dynamicRetailPricingEnabled !== undefined)
      data.dynamicRetailPricingEnabled = Boolean(body.dynamicRetailPricingEnabled)
    if (body.defaultRetailMarginPercent !== undefined) {
      const margin = Number(body.defaultRetailMarginPercent)
      if (isNaN(margin) || margin < 0) {
        return NextResponse.json({ error: 'نسبة هامش الربح غير صالحة' }, { status: 400 })
      }
      data.defaultRetailMarginPercent = margin
    }
  }

  if (body.productCardStyle !== undefined) {
    if (!['auto', 'image', 'compact'].includes(body.productCardStyle)) {
      return NextResponse.json({ error: 'قيمة شكل البطاقة غير صحيحة' }, { status: 400 })
    }
    data.productCardStyle = body.productCardStyle
  }

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
      timezone: true,
      commissionVodafoneCash: true,
      commissionInstapay: true,
      commissionFawry: true,
      retailEnabled: true,
      dynamicRetailPricingEnabled: true,
      defaultRetailMarginPercent: true,
      productCardStyle: true,
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
