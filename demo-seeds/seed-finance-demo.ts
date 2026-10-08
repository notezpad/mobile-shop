/**
 * ⚡ DEMO ONLY (2026-10-08) — seed-finance-demo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * إثراء بيانات "صفحة الإيرادات" لبيئة المعاينة فقط (لا يُنقل للموقع الحقيقي):
 *
 *  1. تنويع طرق الدفع على كل الاشتراكات المدفوعة القائمة (كلها كانت "manual")
 *     — تعديل cosmetic بالكامل: الحقل معروض فقط في تقارير المالية/الاشتراكات.
 *  2. إضافة 6 اشتراكات مدفوعة جديدة بتواريخ موزّعة:
 *     · تجديدان "اليوم" (مودرن شوز 349 · الرحمة موبايل 299) — لمحلين نشطين
 *       اشتراكهما كان ينتهي خلال أيام (سيناريو تجديد واقعي تماماً).
 *     · 4 مدفوعات تاريخية (فبراير/يونيو/يوليو/أغسطس) لمحلات "منتهية/موقوفة"
 *       فقط وباشتراكات منتهية — صفر تأثير على حالات أي محل في باقي الصفحات.
 *  3. النتيجة: أبراج إيرادات 12 شهر أغنى + خريطة طرق دفع حقيقية (كاش/
 *     إنستا باي/محافظ/فوري/كود/يدوي) + "إيرادات اليوم" بمعاملات فعلية.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const paid = await db.subscription.findMany({
    where: { amountPaid: { gt: 0 }, tenantId: { not: 'platform' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  console.log(`paid subs found: ${paid.length}`)

  /* 1 ── تنويع طرق الدفع (توزيع مرجّح واقعي) */
  const MIX = [
    'cash', 'instapay', 'vodafone_cash', 'cash', 'fawry', 'instapay',
    'cash', 'vodafone_cash', 'instapay', 'cash', 'fawry', 'code',
    'vodafone_cash', 'cash', 'instapay', 'manual', 'fawry', 'cash',
    'instapay', 'vodafone_cash', 'cash', 'fawry', 'code', 'cash',
    'instapay', 'vodafone_cash', 'cash', 'fawry', 'instapay', 'cash',
    'vodafone_cash',
  ]
  for (let i = 0; i < paid.length; i++) {
    await db.subscription.update({
      where: { id: paid[i].id },
      data: { paymentMethod: MIX[i % MIX.length] },
    })
  }
  console.log(`payment methods diversified on ${paid.length} subs`)

  /* 2 ── الاشتراكات الجديدة */
  const t = (iso: string) => new Date(iso)
  const days = (n: number) => n * 86400000

  const newSubs = [
    // تجديدان اليوم (Cairo day = 2026-10-08)
    {
      tenant: 'مودرن شوز', planCode: 'fashion-basic', period: 'monthly',
      amount: 349, method: 'fawry',
      createdAt: t('2026-10-08T10:00:00Z'), endDays: 30, status: 'active',
    },
    {
      tenant: 'الرحمة موبايل', planCode: 'electronics-basic', period: 'monthly',
      amount: 299, method: 'cash',
      createdAt: t('2026-10-08T12:30:00Z'), endDays: 30, status: 'active',
    },
    // مدفوعات تاريخية لمحلات منتهية/موقوفة (اشتراكات منتهية)
    {
      tenant: 'زيرو ون موبايل', planCode: 'electronics-basic', period: 'monthly',
      amount: 299, method: 'vodafone_cash',
      createdAt: t('2026-02-12T14:00:00Z'), endDays: 30, status: 'expired',
    },
    {
      tenant: 'فاشن بوي', planCode: 'fashion-pro', period: 'monthly',
      amount: 699, method: 'instapay',
      createdAt: t('2026-06-05T11:00:00Z'), endDays: 30, status: 'expired',
    },
    {
      tenant: 'ديجيتال زون', planCode: 'electronics-pro', period: 'monthly',
      amount: 599, method: 'cash',
      createdAt: t('2026-07-18T13:00:00Z'), endDays: 30, status: 'expired',
    },
    {
      tenant: 'الأمير للأحذية', planCode: 'fashion-basic', period: 'monthly',
      amount: 349, method: 'instapay',
      createdAt: t('2026-08-22T15:00:00Z'), endDays: 30, status: 'expired',
    },
  ]

  for (const s of newSubs) {
    const tenant = await db.tenant.findFirst({
      where: { shopName: { contains: s.tenant } }, select: { id: true },
    })
    const plan = await db.plan.findFirst({
      where: { code: s.planCode }, select: { id: true },
    })
    if (!tenant || !plan) {
      console.log(`skip (not found): ${s.tenant} / ${s.planCode}`)
      continue
    }
    const start = s.createdAt
    await db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: s.status,
        startDate: start,
        endDate: new Date(start.getTime() + days(s.endDays)),
        period: s.period,
        amountPaid: s.amount,
        paymentMethod: s.method,
        paymentNote: '⚡ demo seed (finance view)',
      },
    })
    console.log(`+ ${s.tenant} · ${s.amount} EGP · ${s.method} · ${start.toISOString().slice(0, 10)}`)
  }

  const total = await db.subscription.count({ where: { amountPaid: { gt: 0 }, tenantId: { not: 'platform' } } })
  console.log(`done — paid subs now: ${total}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
