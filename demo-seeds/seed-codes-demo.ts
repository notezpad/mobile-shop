/**
 * ⚡ SANDBOX DEMO SEED (2026-10-08) — أكواد التفعيل:
 * بيانات تجريبية واقعية لصفحة "أكواد الاشتراك" في لوحة الأدمن —
 * دفعات (باتشات) بأسماء حملات، أكواد متاحة/مستخدمة/منتهية الصلاحية،
 * أكواد بمدد مخصصة، وأكواد مخصصة لمحلات معينة.
 *
 * التشغيل: bun prisma/seed-codes-demo.ts
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const day = 24 * 60 * 60 * 1000
const now = new Date()

function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * day)
}
function daysFromNow(n: number): Date {
  return new Date(now.getTime() + n * day)
}

/** نفس مولّد الأكواد في admin-utils (بدون استيراد alias). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function suffix(len = 4): string {
  let out = ''
  const buf = new Uint32Array(len)
  globalThis.crypto.getRandomValues(buf)
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length]
  return out
}
function code(prefix: string): string {
  return `NEZAM-${prefix}-${suffix()}`
}

type Seed = {
  prefix: string
  planCode: string
  period: string
  createdAt: Date
  redeemedAt?: Date | null
  redeemTenant?: string | null
  expiresAt?: Date | null
  assignedTenantId?: string | null
  batchLabel?: string | null
  durationDays?: number | null
  notes?: string | null
}

async function main() {
  const plans = await db.plan.findMany()
  const byCode = new Map(plans.map((p) => [p.code, p]))
  const planId = (c: string) => {
    const p = byCode.get(c)
    if (!p) throw new Error(`plan ${c} not found`)
    return p.id
  }

  const tenants = await db.tenant.findMany({
    where: { id: { not: 'platform-tenant' } },
  })
  const tn = (shopName: string) =>
    tenants.find((t) => t.shopName === shopName)?.id ?? null

  // التنظيف: الأكواد التجريبية السابقة لهذا السكربت فقط (NEZAM-*)
  // مع الحفاظ على الأكواد الأصلية الأربعة.
  const existing = await db.activationCode.findMany()
  const toDelete = existing.filter((c) =>
    ['BSC', 'PRO', 'TRIAL', 'FSH', 'E2E'].some((p) => c.code.includes(`-${p}-`)) &&
    c.batchLabel,
  )
  if (toDelete.length) {
    await db.activationCode.deleteMany({
      where: { id: { in: toDelete.map((c) => c.id) } },
    })
    console.log(`🧹 cleaned ${toDelete.length} old demo codes`)
  }

  const seeds: Seed[] = [
    /* ─── دفعة: حملة أكتوبر 2026 (أساسية إلكترونيات شهرية) ─── */
    ...Array.from({ length: 6 }).map((_, i) => ({
      prefix: 'BSC',
      planCode: 'electronics-basic',
      period: 'monthly',
      createdAt: daysAgo(12),
      batchLabel: 'حملة أكتوبر 2026',
      notes: 'خصم موسم الخريفة — توزيع عبر واتساب',
      expiresAt: i < 2 ? daysFromNow(20) : null,
    })),
    ...[
      { shop: 'تك سنتر للكمبيوتر', ago: 9 },
      { shop: 'الرحمة موبايل', ago: 7 },
      { shop: 'ستار فون', ago: 5 },
      { shop: 'سمارت لاين إلكترونيات', ago: 3 },
    ].map((r) => ({
      prefix: 'BSC',
      planCode: 'electronics-basic',
      period: 'monthly',
      createdAt: daysAgo(12),
      redeemedAt: daysAgo(r.ago),
      redeemTenant: tn(r.shop),
      batchLabel: 'حملة أكتوبر 2026',
      notes: 'خصم موسم الخريفة — توزيع عبر واتساب',
    })),

    /* ─── دفعة: عرض رمضان الكبير (احترافية ملابس سنوية) ─── */
    ...Array.from({ length: 3 }).map((_, i) => ({
      prefix: 'FSH',
      planCode: 'fashion-pro',
      period: 'yearly',
      createdAt: daysAgo(25),
      batchLabel: 'عرض رمضان الكبير',
      notes: 'عرض سنوي محدود — ٢ منهم صلاحيتهم انتهت',
      expiresAt: i === 0 ? daysAgo(4) : i === 1 ? daysAgo(1) : daysFromNow(15),
    })),
    ...[
      { shop: 'مودرن شوز', ago: 20 },
      { shop: 'الأمير للأحذية', ago: 11 },
      { shop: 'براند أوريجينال', ago: 6 },
    ].map((r) => ({
      prefix: 'FSH',
      planCode: 'fashion-pro',
      period: 'yearly',
      createdAt: daysAgo(25),
      redeemedAt: daysAgo(r.ago),
      redeemTenant: tn(r.shop),
      batchLabel: 'عرض رمضان الكبير',
      notes: 'عرض سنوي محدود — استُخدمت قبل انتهاء الصلاحية',
    })),

    /* ─── دفعة: تجارب عملاء محتملين (تجريبية) ─── */
    ...Array.from({ length: 2 }).map(() => ({
      prefix: 'TRIAL',
      planCode: 'electronics-basic',
      period: 'trial',
      createdAt: daysAgo(8),
      batchLabel: 'تجارب عملاء محتملين',
      notes: 'متابعة مبيعات — تُرسل للعملاء المهتمين',
    })),
    ...Array.from({ length: 2 }).map((_, i) => ({
      prefix: 'TRIAL',
      planCode: 'electronics-basic',
      period: 'trial',
      createdAt: daysAgo(8),
      redeemedAt: daysAgo(4 - i),
      redeemTenant: tn(i === 0 ? 'ديجيتال زون' : 'زيرو ون موبايل'),
      batchLabel: 'تجارب عملاء محتملين',
      notes: 'متابعة مبيعات — تم التفعيل',
    })),

    /* ─── أكواد مفردة بدون دفعة ─── */
    {
      prefix: 'PRO',
      planCode: 'electronics-pro',
      period: 'monthly',
      createdAt: daysAgo(6),
      durationDays: 45,
      notes: 'مدة مخصصة — عميل تعاقد نص شهور',
    },
    {
      prefix: 'PRO',
      planCode: 'electronics-pro',
      period: 'monthly',
      createdAt: daysAgo(6),
      durationDays: 45,
      redeemedAt: daysAgo(2),
      redeemTenant: tn('إيفولوشن تك'),
      notes: 'مدة مخصصة — استُخدمت من إيفولوشن',
    },
    {
      prefix: 'BSC',
      planCode: 'fashion-basic',
      period: 'yearly',
      createdAt: daysAgo(4),
      assignedTenantId: tn('كلاسيك وير'),
      notes: 'مخصصة لكلاسيك وير — اتفاق سنوي',
      expiresAt: daysFromNow(60),
    },
    {
      prefix: 'BSC',
      planCode: 'electronics-basic',
      period: 'monthly',
      createdAt: daysAgo(2),
      notes: 'كود احتياطي للدعم الفني',
    },
  ]

  let created = 0
  for (const s of seeds) {
    await db.activationCode.create({
      data: {
        code: code(s.prefix),
        planId: planId(s.planCode),
        period: s.period,
        createdAt: s.createdAt,
        redeemedAt: s.redeemedAt ?? null,
        tenantId: s.redeemTenant ?? null,
        expiresAt: s.expiresAt ?? null,
        assignedTenantId: s.assignedTenantId ?? null,
        batchLabel: s.batchLabel ?? null,
        durationDays: s.durationDays ?? null,
        notes: s.notes ?? null,
        createdBy: 'demo-seed',
      },
    })
    created++
  }

  const total = await db.activationCode.count()
  console.log(
    `✅ seeded ${created} demo codes (batches: حملة أكتوبر / عرض رمضان / تجارب) — total now: ${total}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
