/**
 * ⚡ SANDBOX DEMO SEED (2026-10-08):
 * بيانات تجريبية واقعية لصفحة "المحلات المشتركة" في لوحة الأدمن —
 * محلات مصرية بأسماء شائعة، باقات متنوعة (أساسية/احترافية × إلكترونيات/ملابس)،
 * وحالات اشتراك مختلفة (نشط/تجريبي/موقوف/منتهي/ملغي) + مستخدمين ومنتجات
 * ومبيعات خفيفة علشان كارت التفاصيل يعرض أرقام حقيقية.
 *
 * التشغيل: bunx tsx prisma/seed-demo.ts  (أو bun prisma/seed-demo.ts)
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const PLATFORM_TENANT_ID = 'platform-tenant'

const day = 24 * 60 * 60 * 1000
const now = new Date()

function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * day)
}
function daysFromNow(n: number): Date {
  return new Date(now.getTime() + n * day)
}

async function hashPasswordDemo(password: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key, 32 * 8
  )
  const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2:${toHex(salt)}:${toHex(new Uint8Array(bits))}`
}

const PLANS = [
  {
    code: 'electronics-basic',
    name: 'أساسية - موبايل وكمبيوتر',
    description: 'للمحلات الصغيرة: نقطة بيع + مخزون + تقارير أساسية',
    priceMonthly: 299,
    priceYearly: 2990,
    maxUsers: 2,
    maxProducts: 300,
    maxBranches: 1,
    trialDays: 14,
    sortOrder: 1,
    businessType: 'electronics',
  },
  {
    code: 'electronics-pro',
    name: 'احترافية - موبايل وكمبيوتر',
    description: 'للمحلات المحترفة: صيانة + مشتريات + موردين + فروع',
    priceMonthly: 599,
    priceYearly: 5990,
    maxUsers: 6,
    maxProducts: 3000,
    maxBranches: 3,
    trialDays: 14,
    sortOrder: 2,
    businessType: 'electronics',
  },
  {
    code: 'fashion-basic',
    name: 'أساسية - ملابس وأحذية',
    description: 'لمحلات الملابس: نقطة بيع + مقاسات وألوان + تقارير',
    priceMonthly: 349,
    priceYearly: 3490,
    maxUsers: 2,
    maxProducts: 500,
    maxBranches: 1,
    trialDays: 14,
    sortOrder: 3,
    businessType: 'fashion',
  },
  {
    code: 'fashion-pro',
    name: 'احترافية - ملابس وأحذية',
    description: 'لمحلات الملابس المحترفة: فروع + موردين + خصومات مجموعات',
    priceMonthly: 699,
    priceYearly: 6990,
    maxUsers: 8,
    maxProducts: 5000,
    maxBranches: 4,
    trialDays: 14,
    sortOrder: 4,
    businessType: 'fashion',
  },
]

interface TenantSeed {
  shopName: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  address: string
  planCode: string
  status: 'active' | 'suspended' | 'expired' | 'cancelled' | 'trial'
  period: 'monthly' | 'yearly' | 'trial'
  subEndInDays: number // +future / -past
  joinedDaysAgo: number
  lastLoginDaysAgo: number | null
  usersCount: number
  productsCount: number
  salesCount: number
  sales30: number
  profit30: number
  cashBalance: number
  adminNotes?: string
  employees?: string[]
}

const TENANTS: TenantSeed[] = [
  {
    shopName: 'محل النور للاتصالات',
    ownerName: 'محمد النور',
    ownerEmail: 'mohamed@alnoor-mobiles.com',
    ownerPhone: '01001234567',
    address: 'القاهرة - مدينة نصر - شارع عباس العقاد',
    planCode: 'electronics-pro',
    status: 'active',
    period: 'yearly',
    subEndInDays: 213,
    joinedDaysAgo: 420,
    lastLoginDaysAgo: 0,
    usersCount: 4,
    productsCount: 842,
    salesCount: 3120,
    sales30: 186500,
    profit30: 27900,
    cashBalance: 45200,
    adminNotes: 'من أفضل العملاء — يجدد سنوي من ٣ سنوات. يدفع فودافون كاش.',
    employees: ['أحمد سيد', 'كريم فؤاد'],
  },
  {
    shopName: 'مووبايل هاب',
    ownerName: 'أحمد الشريف',
    ownerEmail: 'ahmed@mobilehub.eg',
    ownerPhone: '01112345678',
    address: 'الجيزة - الدقي - شارع التحرير',
    planCode: 'electronics-pro',
    status: 'active',
    period: 'monthly',
    subEndInDays: 18,
    joinedDaysAgo: 260,
    lastLoginDaysAgo: 1,
    usersCount: 3,
    productsCount: 615,
    salesCount: 2210,
    sales30: 142300,
    profit30: 21400,
    cashBalance: 31800,
    adminNotes: 'طلب ترقية للباقة السنوية الشهر الجاي — متابعة بعد التجديد.',
    employees: ['محمود عبد الله'],
  },
  {
    shopName: 'الرحمة موبايل',
    ownerName: 'مصطفى الرحمة',
    ownerEmail: 'mostafa@rahma-mobile.com',
    ownerPhone: '01223456789',
    address: 'الإسكندرية - سموحة - شارع فوزي معاذ',
    planCode: 'electronics-basic',
    status: 'active',
    period: 'monthly',
    subEndInDays: 5,
    joinedDaysAgo: 95,
    lastLoginDaysAgo: 2,
    usersCount: 2,
    productsCount: 287,
    salesCount: 940,
    sales30: 68200,
    profit30: 9800,
    cashBalance: 12400,
    employees: ['إسلام رمضان'],
  },
  {
    shopName: 'ستار فون',
    ownerName: 'عمر ستار',
    ownerEmail: 'omar@starphone.eg',
    ownerPhone: '01034567890',
    address: 'القاهرة - وسط البلد - شارع طلعت حرب',
    planCode: 'electronics-pro',
    status: 'active',
    period: 'monthly',
    subEndInDays: 27,
    joinedDaysAgo: 150,
    lastLoginDaysAgo: 0,
    usersCount: 5,
    productsCount: 1204,
    salesCount: 4105,
    sales30: 231000,
    profit30: 34600,
    cashBalance: 58900,
    adminNotes: 'محل كبير — طلب فتح فرع تاني قريب (هيحتاج ترقية فروع).',
    employees: ['يوسف حسن', 'سارة منير', 'طارق زكي'],
  },
  {
    shopName: 'أناقة للأزياء',
    ownerName: 'هدى أناقة',
    ownerEmail: 'huda@anaqa-fashion.com',
    ownerPhone: '01145678901',
    address: 'القاهرة - مصر الجديدة - شارع الحجاز',
    planCode: 'fashion-pro',
    status: 'active',
    period: 'yearly',
    subEndInDays: 156,
    joinedDaysAgo: 380,
    lastLoginDaysAgo: 1,
    usersCount: 6,
    productsCount: 1560,
    salesCount: 2890,
    sales30: 198400,
    profit30: 49600,
    cashBalance: 76500,
    adminNotes: 'أعلى ARPU في القسم النسائي — مرشحة لحالة دراسية تسويقية.',
    employees: ['نورهان سامي', 'مي كمال', 'دينا فتحي'],
  },
  {
    shopName: 'براند أوريجينال',
    ownerName: 'كريم براند',
    ownerEmail: 'karim@brandoriginal.eg',
    ownerPhone: '01256789012',
    address: 'الجيزة - الشيخ زايد - مول أركانيا',
    planCode: 'fashion-pro',
    status: 'active',
    period: 'monthly',
    subEndInDays: 12,
    joinedDaysAgo: 210,
    lastLoginDaysAgo: 3,
    usersCount: 4,
    productsCount: 980,
    salesCount: 1750,
    sales30: 121600,
    profit30: 30400,
    cashBalance: 22300,
    employees: ['أمين رشاد'],
  },
  {
    shopName: 'مودرن شوز',
    ownerName: 'شريف مودرن',
    ownerEmail: 'sherif@modernshoes.com',
    ownerPhone: '01067890123',
    address: 'القاهرة - المعادي - شارع ٩',
    planCode: 'fashion-basic',
    status: 'active',
    period: 'monthly',
    subEndInDays: 3,
    joinedDaysAgo: 120,
    lastLoginDaysAgo: 5,
    usersCount: 2,
    productsCount: 420,
    salesCount: 860,
    sales30: 54700,
    profit30: 13700,
    cashBalance: 9800,
    adminNotes: 'محتاج تذكير تجديد — آخر شهرين بيجدد متأخر يومين.',
  },
  {
    shopName: 'تك سنتر للكمبيوتر',
    ownerName: 'علاء تك',
    ownerEmail: 'alaa@techcenter.eg',
    ownerPhone: '01178901234',
    address: 'القاهرة - المهندسين - شارع جامعة الدول',
    planCode: 'electronics-pro',
    status: 'trial',
    period: 'trial',
    subEndInDays: 8,
    joinedDaysAgo: 6,
    lastLoginDaysAgo: 0,
    usersCount: 2,
    productsCount: 145,
    salesCount: 42,
    sales30: 31800,
    profit30: 4700,
    cashBalance: 8200,
    adminNotes: 'تجربة جديدة — نشطة جداً. تجهيز عرض ترقية قبل نهاية التجربة.',
  },
  {
    shopName: 'سمارت لاين إلكترونيات',
    ownerName: 'هاني سمارت',
    ownerEmail: 'hani@smartline.eg',
    ownerPhone: '01289012345',
    address: 'المنصورة - شارع الجمهورية',
    planCode: 'electronics-basic',
    status: 'trial',
    period: 'trial',
    subEndInDays: 4,
    joinedDaysAgo: 10,
    lastLoginDaysAgo: 1,
    usersCount: 1,
    productsCount: 86,
    salesCount: 18,
    sales30: 12600,
    profit30: 1900,
    cashBalance: 4100,
  },
  {
    shopName: 'زيرو ون موبايل',
    ownerName: 'زياد ون',
    ownerEmail: 'ziad@zeroone.mobile',
    ownerPhone: '01090123456',
    address: 'طنطا - شارع البحر',
    planCode: 'electronics-basic',
    status: 'suspended',
    period: 'monthly',
    subEndInDays: -3,
    joinedDaysAgo: 200,
    lastLoginDaysAgo: 12,
    usersCount: 2,
    productsCount: 210,
    salesCount: 640,
    sales30: 0,
    profit30: 0,
    cashBalance: 5200,
    adminNotes: 'إيقاف مؤقت بطلب العميل — سفر للخارج. يرجع الشهر القادم.',
  },
  {
    shopName: 'فاشن بوي',
    ownerName: 'إسلام بوي',
    ownerEmail: 'islam@fashionboy.eg',
    ownerPhone: '01101234567',
    address: 'الإسكندرية - العجمي',
    planCode: 'fashion-basic',
    status: 'suspended',
    period: 'monthly',
    subEndInDays: -12,
    joinedDaysAgo: 330,
    lastLoginDaysAgo: 25,
    usersCount: 2,
    productsCount: 340,
    salesCount: 1120,
    sales30: 0,
    profit30: 0,
    cashBalance: 3100,
    adminNotes: 'تأخر الدفع شهرين — تم الإيقاف بعد ٣ تنبيهات واتساب.',
  },
  {
    shopName: 'ديجيتال زون',
    ownerName: 'رامي ديجيتال',
    ownerEmail: 'rami@digitalzone.eg',
    ownerPhone: '01212345678',
    address: 'القاهرة - شبرا - شارع ترعة',
    planCode: 'electronics-basic',
    status: 'expired',
    period: 'monthly',
    subEndInDays: -22,
    joinedDaysAgo: 290,
    lastLoginDaysAgo: 21,
    usersCount: 1,
    productsCount: 175,
    salesCount: 480,
    sales30: 0,
    profit30: 0,
    cashBalance: 6700,
    adminNotes: 'بيسأل عن عروض رجوع — مرشح لكود خصم ٢٠٪.',
  },
  {
    shopName: 'الأمير للأحذية',
    ownerName: 'سيد الأمير',
    ownerEmail: 'sayed@alamir.shoes',
    ownerPhone: '01023456789',
    address: 'الجيزة - فيصل - شارع الملك فيصل',
    planCode: 'fashion-basic',
    status: 'expired',
    period: 'monthly',
    subEndInDays: -8,
    joinedDaysAgo: 175,
    lastLoginDaysAgo: 8,
    usersCount: 2,
    productsCount: 290,
    salesCount: 720,
    sales30: 0,
    profit30: 0,
    cashBalance: 4500,
  },
  {
    shopName: 'يونيفرس فون',
    ownerName: 'وليد يونيفرس',
    ownerEmail: 'waleed@universephone.eg',
    ownerPhone: '01134567890',
    address: 'القاهرة - حلوان',
    planCode: 'electronics-basic',
    status: 'cancelled',
    period: 'monthly',
    subEndInDays: -60,
    joinedDaysAgo: 500,
    lastLoginDaysAgo: 65,
    usersCount: 1,
    productsCount: 120,
    salesCount: 310,
    sales30: 0,
    profit30: 0,
    cashBalance: 0,
    adminNotes: 'قفل المحل نهائياً — سبب: تغيير نشاط.',
  },
  {
    shopName: 'كلاسيك وير',
    ownerName: 'مينا كلاسيك',
    ownerEmail: 'mina@classicwear.eg',
    ownerPhone: '01245678901',
    address: 'القاهرة - شبرا الخيمة',
    planCode: 'fashion-basic',
    status: 'cancelled',
    period: 'monthly',
    subEndInDays: -45,
    joinedDaysAgo: 240,
    lastLoginDaysAgo: 48,
    usersCount: 1,
    productsCount: 95,
    salesCount: 210,
    sales30: 0,
    profit30: 0,
    cashBalance: 1200,
  },
  {
    shopName: 'إيفولوشن تك',
    ownerName: 'نبيل إيفولوشن',
    ownerEmail: 'nabil@evolutiontech.eg',
    ownerPhone: '01056789012',
    address: 'القاهرة - التجمع الخامس - شارع التسعين',
    planCode: 'electronics-pro',
    status: 'active',
    period: 'monthly',
    subEndInDays: 22,
    joinedDaysAgo: 45,
    lastLoginDaysAgo: 0,
    usersCount: 3,
    productsCount: 530,
    salesCount: 380,
    sales30: 89400,
    profit30: 13400,
    cashBalance: 18700,
    adminNotes: 'عميل جديد واعد — جهّز نفسك لعرض سنوي بعد أول تجديد.',
    employees: ['حسن علي'],
  },
]

async function main() {
  console.log('🌱 Seeding demo data…')

  // Reset (demo only)
  await db.trackingEvent.deleteMany()
  await db.notification.deleteMany()
  await db.stocktakeItem.deleteMany()
  await db.stocktake.deleteMany()
  await db.transferItem.deleteMany()
  await db.transfer.deleteMany()
  await db.stockMovement.deleteMany()
  await db.expense.deleteMany()
  await db.cashEntry.deleteMany()
  await db.transaction.deleteMany()
  await db.maintenanceOrder.deleteMany()
  await db.saleReturnItem.deleteMany()
  await db.saleReturn.deleteMany()
  await db.salePayment.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.purchaseReturnItem.deleteMany()
  await db.purchaseReturn.deleteMany()
  await db.purchaseOrderItem.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.supplierPayment.deleteMany()
  await db.supplier.deleteMany()
  await db.payment.deleteMany()
  await db.customer.deleteMany()
  await db.category.deleteMany()
  await db.productVariant.deleteMany()
  await db.productUnit.deleteMany()
  await db.product.deleteMany()
  await db.user.deleteMany()
  await db.subscription.deleteMany()
  await db.activationCode.deleteMany()
  await db.branch.deleteMany()
  await db.tenant.deleteMany()
  await db.plan.deleteMany()
  await db.platformSetting.deleteMany()

  // Platform tenant (logical)
  await db.tenant.create({
    data: { id: PLATFORM_TENANT_ID, shopName: 'منصة نظام', status: 'active' },
  })

  // Super admin user
  const superAdminHash = await hashPasswordDemo('Admin@123')
  await db.user.create({
    data: {
      name: 'أحمد الأدمن',
      email: 'admin@nezam.pos',
      password: superAdminHash,
      role: 'SUPER_ADMIN',
      tenantId: PLATFORM_TENANT_ID,
      active: true,
    },
  })

  // Plans
  const planMap = new Map<string, number>()
  for (const p of PLANS) {
    const created = await db.plan.create({
      data: {
        code: p.code,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxUsers: p.maxUsers,
        maxProducts: p.maxProducts,
        maxBranches: p.maxBranches,
        trialDays: p.trialDays,
        sortOrder: p.sortOrder,
        businessType: p.businessType,
        isActive: true,
        features: JSON.stringify([
          'نقطة بيع (POS)',
          'إدارة مخزون',
          'تقارير وأرباح',
          p.code.endsWith('pro') ? 'الصيانة والمشتريات' : 'دعم واتساب',
        ]),
      },
    })
    planMap.set(p.code, created.id)
  }

  // Tenants + users + subscriptions + light shop data
  for (const t of TENANTS) {
    const planId = planMap.get(t.planCode)!
    const createdAt = daysAgo(t.joinedDaysAgo)
    const subStart = daysAgo(Math.max(t.joinedDaysAgo - 30, 1))
    const subEnd = daysFromNow(t.subEndInDays)

    const tenant = await db.tenant.create({
      data: {
        shopName: t.shopName,
        phone: t.ownerPhone,
        address: t.address,
        ownerEmail: t.ownerEmail,
        ownerPhone: t.ownerPhone,
        status: t.status,
        adminNotes: t.adminNotes ?? null,
        createdAt,
        lastLoginAt: t.lastLoginDaysAgo === null ? null : daysAgo(t.lastLoginDaysAgo),
        invoicePrefix: 'INV',
        timezone: 'Africa/Cairo',
      },
    })

    // Owner user
    const ownerHash = await hashPasswordDemo('Owner@123')
    await db.user.create({
      data: {
        name: t.ownerName,
        email: t.ownerEmail,
        password: ownerHash,
        role: 'ADMIN',
        tenantId: tenant.id,
        active: true,
        lastLoginAt: t.lastLoginDaysAgo === null ? null : daysAgo(t.lastLoginDaysAgo),
        createdAt,
      },
    })
    // Employees
    for (const emp of t.employees ?? []) {
      await db.user.create({
        data: {
          name: emp,
          email: `${emp.replace(/\s+/g, '.').toLowerCase()}@${t.ownerEmail.split('@')[1]}`,
          password: ownerHash,
          role: 'EMPLOYEE',
          tenantId: tenant.id,
          active: true,
          createdAt: daysAgo(Math.max(t.joinedDaysAgo - 20, 1)),
        },
      })
    }

    // Primary category + products (a small representative batch)
    const cat = await db.category.create({
      data: {
        name: t.planCode.startsWith('fashion') ? 'ملابس' : 'موبايلات',
        tenantId: tenant.id,
      },
    })
    const productCount = Math.min(t.productsCount, 24)
    for (let i = 0; i < productCount; i++) {
      await db.product.create({
        data: {
          tenantId: tenant.id,
          name: `منتج ${t.shopName} ${i + 1}`,
          category: cat.name,
          price: 1500 + i * 137,
          cost: 1100 + i * 100,
          quantity: Math.max(3, 30 - i),
          minQuantity: 5,
          active: true,
          createdAt: daysAgo(Math.max(t.joinedDaysAgo - 10, 1)),
        },
      })
    }

    // Sales (a few completed sales with items so detail stats look real)
    const salesToCreate = Math.min(t.salesCount, 6)
    for (let i = 0; i < salesToCreate; i++) {
      const total = 1200 + i * 640
      const sale = await db.sale.create({
        data: {
          tenantId: tenant.id,
          invoiceNo: `${1000 + i}`,
          total,
          paid: total,
          status: 'مكتملة',
          paymentMethod: i % 2 === 0 ? 'cash' : 'vodafone_cash',
          createdAt: daysAgo(i + 1),
        },
      })
      await db.saleItem.create({
        data: {
          saleId: sale.id,
          name: `منتج ${t.shopName} ${i + 1}`,
          price: total,
          cost: Math.round(total * 0.78),
          quantity: 1,
        },
      })
    }

    // Cash entry (cash balance)
    if (t.cashBalance > 0) {
      await db.cashEntry.create({
        data: {
          tenantId: tenant.id,
          source: 'manual',
          amount: t.cashBalance,
          note: 'رصيد افتتاحي',
          method: 'cash',
          createdAt: daysAgo(7),
        },
      })
    }

    // Subscription — always create one row reflecting the current state
    await db.subscription.create({
      data: {
        tenantId: tenant.id,
        planId,
        status:
          t.status === 'cancelled' ? 'cancelled'
          : t.status === 'expired' ? 'expired'
          : t.status === 'suspended' ? 'expired'
          : 'active',
        startDate: subStart,
        endDate: subEnd,
        period: t.period,
        amountPaid:
          t.period === 'trial' ? 0
          : t.period === 'yearly'
            ? PLANS.find(p => p.code === t.planCode)!.priceYearly
            : PLANS.find(p => p.code === t.planCode)!.priceMonthly,
        paymentMethod: 'manual',
        paymentNote: t.period === 'trial' ? 'فترة تجريبية مجانية' : 'تحصيل نقدي',
        createdAt: subStart,
      },
    })

    // Older subscription history (one past row for realism)
    if (t.joinedDaysAgo > 60 && t.status !== 'cancelled') {
      await db.subscription.create({
        data: {
          tenantId: tenant.id,
          planId,
          status: 'expired',
          startDate: daysAgo(t.joinedDaysAgo),
          endDate: daysAgo(Math.max(t.joinedDaysAgo - 30, 31)),
          period: 'monthly',
          amountPaid: PLANS.find(p => p.code === t.planCode)!.priceMonthly,
          paymentMethod: 'manual',
          paymentNote: 'اشتراك سابق',
          createdAt: daysAgo(t.joinedDaysAgo),
        },
      })
    }
  }

  // A few activation codes (for the codes view demo)
  const codes = [
    { code: 'NEZAM-PRO-8F2K', planCode: 'electronics-pro', period: 'monthly', redeemed: true, notes: 'حملة أكتوبر' },
    { code: 'NEZAM-BSC-3M7X', planCode: 'electronics-basic', period: 'monthly', redeemed: false, notes: 'مخصص لعميل محتمل' },
    { code: 'NEZAM-FSH-9Q1Z', planCode: 'fashion-pro', period: 'yearly', redeemed: false, notes: null },
    { code: 'NEZAM-TRIAL-2A5C', planCode: 'electronics-basic', period: 'trial', redeemed: true, notes: 'تجربة عبر اللاندنج' },
  ]
  for (const c of codes) {
    await db.activationCode.create({
      data: {
        code: c.code,
        planId: planMap.get(c.planCode)!,
        period: c.period,
        redeemedAt: c.redeemed ? daysAgo(12) : null,
        notes: c.notes,
        createdBy: 'admin@nezam.pos',
      },
    })
  }

  // Platform settings
  await db.platformSetting.create({
    data: { key: 'tracking_config', value: JSON.stringify({ version: 1, enabled: false }) },
  })

  console.log(`✅ Seeded ${TENANTS.length} tenants, ${PLANS.length} plans, super admin + activation codes.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
