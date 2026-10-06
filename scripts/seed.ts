import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

// ⚙️ v9: الـ schema بيستخدم engineType="client" (queryCompiler + driverAdapters)
// عشان يشتغل على Cloudflare Workers — يعني الـ client محتاج pg adapter صريح
// حتى في سكريبتات الصيانة (كان بينفجر بـ P2038 "Missing configured driver adapter").
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://nezam:nezam@127.0.0.1:5433/nezampos'
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL, max: 10 } as never) })

const DEMO_TENANT_ID = 'demo-tenant'
const PLATFORM_TENANT_ID = 'platform-tenant'

const PLAN_SEED = [
  {
    code: 'trial',
    name: 'الباقة التجريبية',
    description: 'تجربة مجانية لمدة 14 يوم',
    priceMonthly: 0,
    priceYearly: 0,
    maxUsers: 1,
    maxProducts: 50,
    maxBranches: 1,
    trialDays: 14,
    features: ['حتى 50 منتج', 'مستخدم واحد', 'تجربة 14 يوم', 'كل الميزات الأساسية'],
    sortOrder: 0,
  },
  {
    code: 'pro',
    name: 'الباقة الاحترافية',
    description: 'للمحلات الصغيرة والمتوسطة',
    priceMonthly: 99,
    priceYearly: 1090,
    maxUsers: 5,
    maxProducts: 500,
    maxBranches: 1,
    trialDays: 0,
    features: ['حتى 500 منتج', '5 مستخدمين', 'تقارير متقدمة', 'دعم فني بالبريد'],
    sortOrder: 1,
  },
  {
    code: 'business',
    name: 'باقة الأعمال',
    description: 'للمحلات الكبيرة والفروع المتعددة',
    priceMonthly: 299,
    priceYearly: 3290,
    maxUsers: 20,
    maxProducts: 5000,
    maxBranches: 3,
    trialDays: 0,
    features: ['حتى 5000 منتج', '20 مستخدم', '3 فروع', 'تقارير متقدمة', 'دعم فني بالهاتف'],
    sortOrder: 2,
  },
  {
    code: 'enterprise',
    name: 'باقة المؤسسات',
    description: 'للشركات والسلاسل الكبرى',
    priceMonthly: 999,
    priceYearly: 10990,
    maxUsers: 999999,
    maxProducts: 999999,
    maxBranches: 10,
    trialDays: 0,
    features: ['منتجات غير محدودة', 'مستخدمين غير محدودين', '10 فروع', 'API مخصص', 'دعم مخصص 24/7'],
    sortOrder: 3,
  },
] as const

async function main() {
  console.log('🚀 بدء تهيئة قاعدة البيانات...\n')

  // 1. Plans
  for (const p of PLAN_SEED) {
    await db.plan.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        maxBranches: p.maxBranches,
        trialDays: p.trialDays,
        features: JSON.stringify(p.features),
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        maxBranches: p.maxBranches,
        trialDays: p.trialDays,
        features: JSON.stringify(p.features),
        isActive: true,
        sortOrder: p.sortOrder,
      },
    })
    console.log(`✓ تم تأكيد الباقة: ${p.name} (${p.code})`)
  }

  // 2. Platform tenant for super admin
  await db.tenant.upsert({
    where: { id: PLATFORM_TENANT_ID },
    update: {},
    create: {
      id: PLATFORM_TENANT_ID,
      shopName: 'منصة إدارة المحلات',
      phone: '08000000000',
      address: 'القاهرة - مصر',
      status: 'active',
      ownerEmail: 'super@admin.com',
    },
  })
  console.log('✓ تم إنشاء/تأكيد المحل المنطقي للمنصة')

  // 3. Super admin user
  const superHash = await bcrypt.hash('super123', 10)
  await db.user.upsert({
    where: { email: 'super@admin.com' },
    update: { role: 'SUPER_ADMIN', active: true },
    create: {
      tenantId: PLATFORM_TENANT_ID,
      name: 'الأدمن الأعلى',
      email: 'super@admin.com',
      password: superHash,
      role: 'SUPER_ADMIN',
      active: true,
    },
  })
  console.log('✓ تم إنشاء حساب الأدمن الأعلى: super@admin.com / super123')

  // 4. Demo tenant
  const tenant = await db.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: {},
    create: {
      id: DEMO_TENANT_ID,
      shopName: 'محل الاتصالات التجريبي',
      phone: '01000000000',
      address: 'القاهرة - مصر',
      invoicePrefix: 'INV',
      commissionVodafoneCash: 1.0,
      commissionInstapay: 0.5,
      commissionFawry: 1.0,
      status: 'active',
      ownerEmail: 'admin@demo.com',
      ownerPhone: '01000000000',
    },
  })
  console.log(`✓ تم إنشاء/تأكيد المحل التجريبي: ${tenant.shopName}`)

  // 5. Demo admin user
  const adminHash = await bcrypt.hash('admin123', 10)
  await db.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'المدير',
      email: 'admin@demo.com',
      password: adminHash,
      role: 'ADMIN',
      active: true,
    },
  })
  console.log('✓ تم إنشاء حساب المدير: admin@demo.com / admin123')

  // 6. Demo employee user
  const empHash = await bcrypt.hash('emp123', 10)
  await db.user.upsert({
    where: { email: 'emp@demo.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'موظف المحل',
      email: 'emp@demo.com',
      password: empHash,
      role: 'EMPLOYEE',
      active: true,
    },
  })
  console.log('✓ تم إنشاء حساب الموظف: emp@demo.com / emp123')

  // 7. Demo subscription — pro plan, 1 year
  const proPlan = await db.plan.findUnique({ where: { code: 'pro' } })
  if (proPlan) {
    const existingSub = await db.subscription.findFirst({
      where: { tenantId: tenant.id },
    })
    if (!existingSub) {
      const start = new Date()
      start.setMonth(start.getMonth() - 1)
      const end = new Date(start)
      end.setFullYear(end.getFullYear() + 1)
      await db.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: proPlan.id,
          status: 'active',
          startDate: start,
          endDate: end,
          period: 'yearly',
          amountPaid: proPlan.priceYearly,
          paymentMethod: 'manual',
          paymentNote: 'اشتراك تجريبي لمدة سنة',
        },
      })
      console.log('✓ تم إنشاء اشتراك تجريبي (pro - سنوي) للمحل التجريبي')
    } else {
      console.log('• اشتراك تجريبي موجود بالفعل، تخطي')
    }
  }

  // 8. Categories
  const categories = ['إكسسوارات', 'شواحن', 'سماعات']
  for (const name of categories) {
    const exists = await db.category.findFirst({
      where: { tenantId: tenant.id, name },
    })
    if (!exists) {
      await db.category.create({
        data: { tenantId: tenant.id, name },
      })
    }
  }
  console.log('✓ تم إضافة التصنيفات')

  // 9. Sample products (only if none exist for this tenant)
  const count = await db.product.count({ where: { tenantId: tenant.id } })
  if (count === 0) {
    await db.product.createMany({
      data: [
        {
          tenantId: tenant.id,
          name: 'شاحن سريع 20W',
          category: 'شواحن',
          barcode: '2000000000017',
          price: 250,
          cost: 180,
          quantity: 15,
          minQuantity: 3,
        },
        {
          tenantId: tenant.id,
          name: 'سماعة بلوتوث',
          category: 'سماعات',
          barcode: '2000000000024',
          price: 450,
          cost: 320,
          quantity: 8,
          minQuantity: 2,
        },
        {
          tenantId: tenant.id,
          name: 'كفر آيفون 13',
          category: 'إكسسوارات',
          barcode: '2000000000031',
          price: 120,
          cost: 70,
          quantity: 2,
          minQuantity: 3,
        },
        {
          tenantId: tenant.id,
          name: 'سماعة سلكية',
          category: 'سماعات',
          barcode: '2000000000048',
          price: 90,
          cost: 50,
          quantity: 0,
          minQuantity: 5,
        },
        {
          tenantId: tenant.id,
          name: 'كابل شحن Type-C',
          category: 'شواحن',
          barcode: '2000000000055',
          price: 60,
          cost: 30,
          quantity: 25,
          minQuantity: 5,
        },
      ],
    })
    console.log('✓ تم إضافة المنتجات التجريبية')
  } else {
    console.log('• المنتجات موجودة بالفعل، تخطي')
  }

  // 10. Sample customers
  const custCount = await db.customer.count({
    where: { tenantId: tenant.id },
  })
  if (custCount === 0) {
    await db.customer.createMany({
      data: [
        { tenantId: tenant.id, name: 'عمرو أحمد', phone: '01012345678', balance: 0 },
        { tenantId: tenant.id, name: 'سارة محمود', phone: '01198765432', balance: 0 },
        { tenantId: tenant.id, name: 'محمد علي', phone: '01234567890', balance: 150 },
      ],
    })
    console.log('✓ تم إضافة العملاء التجريبيين')
  } else {
    console.log('• العملاء موجودون بالفعل، تخطي')
  }

  // 11. Sample maintenance orders
  const mtnCount = await db.maintenanceOrder.count({
    where: { tenantId: tenant.id },
  })
  if (mtnCount === 0) {
    await db.maintenanceOrder.createMany({
      data: [
        {
          tenantId: tenant.id,
          customerName: 'عمرو أحمد',
          phone: '01012345678',
          device: 'iPhone 13',
          issue: 'شاشة مكسورة',
          cost: 800,
          status: 'مستلم',
        },
        {
          tenantId: tenant.id,
          customerName: 'أحمد خالد',
          phone: '01122223333',
          device: 'Samsung A52',
          issue: 'بطارية',
          cost: 350,
          status: 'قيد العمل',
        },
      ],
    })
    console.log('✓ تم إضافة أوامر صيانة تجريبية')
  } else {
    console.log('• أوامر الصيانة موجودة بالفعل، تخطي')
  }

  console.log('\n✅ اكتملت عملية التهيئة\n')
  console.log('════════ بيانات الدخول ════════')
  console.log('👨‍💼 الأدمن الأعلى: super@admin.com  /  super123')
  console.log('👨‍💼 مدير المحل:   admin@demo.com   /  admin123')
  console.log('🙋 الموظف:        emp@demo.com     /  emp123')
  console.log('═══════════════════════════════════════')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
