import { NextRequest, NextResponse } from 'next/server'
import { db, PLATFORM_TENANT_ID, hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function createSuperAdmin(email: string, password: string, name: string) {
  const existingSuperAdmin = await db.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true },
  })

  if (existingSuperAdmin) {
    return NextResponse.json(
      {
        error:
          'يوجد حساب أدمن أعلى بالفعل — هذا المسار متاح مرة واحدة فقط لأسباب أمنية. احذف هذا الملف من المشروع.',
      },
      { status: 403 },
    )
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
      { status: 400 },
    )
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
      { status: 400 },
    )
  }

  // Ensure the logical "platform" tenant row exists (super admin users are
  // attached to it, same convention as scripts/seed.ts).
  await db.tenant.upsert({
    where: { id: PLATFORM_TENANT_ID },
    update: {},
    create: {
      id: PLATFORM_TENANT_ID,
      shopName: 'منصة إدارة المحلات',
      phone: '00000000000',
      address: '',
      status: 'active',
      ownerEmail: email,
    },
  })

  const hashed = await hashPassword(password)
  const user = await db.user.create({
    data: {
      tenantId: PLATFORM_TENANT_ID,
      name,
      email,
      password: hashed,
      role: 'SUPER_ADMIN',
      active: true,
    },
  })

  return NextResponse.json({
    ok: true,
    message:
      'تم إنشاء حساب الأدمن الأعلى بنجاح. احذف هذا الملف الآن (src/app/api/setup/bootstrap-super-admin) وأعد النشر.',
    user: { id: user.id, email: user.email, role: user.role },
  })
}

// GET so it can be triggered by simply visiting a URL in the browser, e.g.:
// /api/setup/bootstrap-super-admin?email=you@example.com&password=yourpassword&name=Name
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const email = (searchParams.get('email') ?? '').trim().toLowerCase()
    const password = searchParams.get('password') ?? ''
    const name = searchParams.get('name') ?? 'الأدمن الأعلى'
    return await createSuperAdmin(email, password, name)
  } catch (e: any) {
    console.error('[bootstrap-super-admin] Unexpected error:', e)
    return NextResponse.json(
      { error: e?.message || 'خطأ داخلي في الخادم' },
      { status: 500 },
    )
  }
}

/**
 * TEMPORARY / ONE-TIME SETUP ROUTE.
 *
 * The seed script (scripts/seed.ts) that normally creates the platform
 * Super Admin account only ran against a local/dev database — it never ran
 * against the production Supabase database this deployment actually uses.
 * This route lets us bootstrap that first Super Admin account directly in
 * production, without needing direct DB access from a local machine.
 *
 * SAFETY: it only works ONCE. If a SUPER_ADMIN user already exists, it
 * refuses and does nothing — so it can't be used to create extra admin
 * accounts or take over an already-provisioned platform.
 *
 * IMPORTANT: delete this file (and redeploy) right after you've used it
 * once. Leaving it in the deployed app means anyone who finds the URL
 * before you use it could create the first Super Admin account themselves.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const name = String(body.name ?? 'الأدمن الأعلى')
    return await createSuperAdmin(email, password, name)
  } catch (e: any) {
    console.error('[bootstrap-super-admin] Unexpected error:', e)
    return NextResponse.json(
      { error: e?.message || 'خطأ داخلي في الخادم' },
      { status: 500 },
    )
  }
}
