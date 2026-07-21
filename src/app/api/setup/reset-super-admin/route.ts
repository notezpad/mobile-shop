/**
 * ⚠️ ملف مؤقت — احذفه فور ما تسجل دخول بنجاح
 * امسح المجلد كله: src/app/api/setup/reset-super-admin/
 */
import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()
const PLATFORM_TENANT_ID = 'platform-tenant'
const TARGET_EMAIL = 'm_ref87@yahoo.com'
const NEW_PASSWORD = '246810'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const hashed = await bcrypt.hash(NEW_PASSWORD, 10)

    // تأكد إن platform-tenant موجود
    await db.tenant.upsert({
      where: { id: PLATFORM_TENANT_ID },
      update: {},
      create: {
        id: PLATFORM_TENANT_ID,
        shopName: 'منصة إدارة المحلات',
        phone: '00000000000',
        address: '',
        status: 'active',
        ownerEmail: TARGET_EMAIL,
      },
    })

    // صلّح الحساب
    const updated = await db.user.update({
      where: { email: TARGET_EMAIL },
      data: {
        role: 'SUPER_ADMIN',
        tenantId: PLATFORM_TENANT_ID,
        password: hashed,
        active: true,
      },
    })

    return NextResponse.json({
      ok: true,
      message: '✅ تم إصلاح الحساب — احذف هذا الملف الآن!',
      email: updated.email,
      role: updated.role,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  } finally {
    await db.$disconnect()
  }
}
