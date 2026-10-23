// 🧹 مرشحو «الحسابات الوهمية»: تجربة مالهاش أي نشاط فعلي.
// المعيار صارم عشان الحذف النهائي آمن: صفر منتجات + صفر مبيعات + مفيش دفع + عدّى عليها يوم
// (عشان ما نمسحش حد لسه في أول تسجيل). منطق الاختيار واحد للقائمة وللحذف (السيرفر بيعيد التحقق).
import { db } from '@/lib/db'
import { PLATFORM_TENANT_ID } from '@/lib/auth'
import { suspiciousSignupReason } from '@/lib/tracking/fake-signup'

export const FAKE_MIN_AGE_MS = 24 * 3600 * 1000

export function inactiveTrialWhere(extra: Record<string, unknown> = {}) {
  return {
    id: { not: PLATFORM_TENANT_ID },
    createdAt: { lt: new Date(Date.now() - FAKE_MIN_AGE_MS) },
    products: { none: {} },
    sales: { none: {} },
    subscriptions: { none: { amountPaid: { gt: 0 } } },
    ...extra,
  }
}

/**
 * 🎁 محلات كل بياناتها «تجريبية» (seed_demo_data) ولا شغل فعلي — بقت عندها
 * منتجات/مبيعات فمعيار «صفر منتجات» وحده كان هيفلتها من قائمة التنظيف.
 * بنسأل دالة SQL (demo-data-v1.sql) — لو لسه ما اتركبتش نرجّع [] بهدوء.
 */
async function demoOnlyTenantIds(): Promise<string[]> {
  try {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT "id" FROM demo_only_tenant_ids()`
    return rows.map((r) => r.id)
  } catch {
    return []
  }
}

export async function findInactiveTrials(ids?: string[], take = 400) {
  const demoOnly = (await demoOnlyTenantIds()).filter((id) => !ids || ids.includes(id))
  const base = inactiveTrialWhere(ids ? { id: { in: ids, not: PLATFORM_TENANT_ID } } : {})
  const where = demoOnly.length
    ? {
        OR: [
          base,
          {
            id: { in: demoOnly, not: PLATFORM_TENANT_ID },
            createdAt: { lt: new Date(Date.now() - FAKE_MIN_AGE_MS) },
            subscriptions: { none: { amountPaid: { gt: 0 } } },
          },
        ],
      }
    : base
  const rows = await db.tenant.findMany({
    where: where as any,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      shopName: true,
      phone: true,
      ownerEmail: true,
      ownerPhone: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      users: { select: { id: true, name: true, email: true }, take: 3 },
    },
  })
  return rows.map((t) => {
    const owner = t.users[0]
    const email = (t.ownerEmail || owner?.email || '').trim().toLowerCase()
    const phone = (t.ownerPhone || t.phone || '').trim()
    const reason = suspiciousSignupReason({ name: owner?.name, email, phone, shopName: t.shopName })
    return {
      id: t.id,
      shopName: t.shopName,
      ownerName: owner?.name ?? '',
      email,
      phone,
      status: t.status,
      createdAt: t.createdAt,
      lastLoginAt: t.lastLoginAt,
      suspicious: !!reason,
      reason,
      userIds: t.users.map((u) => u.id),
    }
  })
}

/**
 * حذف نهائي لمحل + سطر «جمهور الاستبعاد» (email,phone مهشّمين) قبل ما البيانات تضيع.
 * لو الداتابيز منعت الحذف (قيد FK) بنعمل إلغاء ناعم ونرجّع mode='cancelled'.
 */
export async function hardDeleteTenant(
  t: { id: string; email: string; phone: string; userIds: string[] },
): Promise<{ mode: 'deleted' | 'cancelled'; csvLine: string | null }> {
  const { normalizeEmail, normalizePhone, sha256Hex } = await import('@/lib/tracking/server')
  const e = t.email ? await sha256Hex(normalizeEmail(t.email)) : ''
  const p = t.phone ? await sha256Hex(normalizePhone(t.phone)) : ''
  const csvLine = e || p ? `${e},${p}` : null
  try {
    if (t.userIds.length) await db.userAttribution.deleteMany({ where: { userId: { in: t.userIds } } })
    await db.tenant.delete({ where: { id: t.id } }) // cascade: مستخدمين، اشتراكات، فروع، ...
    return { mode: 'deleted', csvLine }
  } catch {
    await db.tenant.update({ where: { id: t.id }, data: { status: 'cancelled' } }).catch(() => {})
    await db.subscription.updateMany({ where: { tenantId: t.id, status: 'active' }, data: { status: 'cancelled' } }).catch(() => {})
    return { mode: 'cancelled', csvLine }
  }
}
