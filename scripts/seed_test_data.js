/**
 * Seed test data for Nezam POS review:
 * - Tenant A + ADMIN (admin@test.local) + EMPLOYEE (emp@test.local)
 * - Tenant B + ADMIN (admin2@test.local)  — for tenant-isolation tests
 * Password scheme matches src/lib/auth.ts: pbkdf2:<saltHex>:<hashHex> (100k, SHA-256, 32B)
 */
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const crypto = require('crypto')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 })
const prisma = new PrismaClient({ adapter })

function hashPassword(password) {
  const salt = crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(16))
    : crypto.randomBytes(16)
  const saltHex = Buffer.from(salt).toString('hex')
  const hash = crypto.pbkdf2Sync(password, Buffer.from(salt), 100000, 32, 'sha256')
  return `pbkdf2:${saltHex}:${hash.toString('hex')}`
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@test.local' } })
  if (existing) {
    console.log('already seeded')
    return
  }

  const tenantA = await prisma.tenant.create({
    data: { shopName: 'محل اختبار A', status: 'active', timezone: 'Africa/Cairo' },
  })
  const tenantB = await prisma.tenant.create({
    data: { shopName: 'محل اختبار B', status: 'active', timezone: 'Africa/Cairo' },
  })

  await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      name: 'أدمن A',
      email: 'admin@test.local',
      password: hashPassword('Passw0rd!'),
      role: 'ADMIN',
      active: true,
    },
  })
  await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      name: 'موظف A',
      email: 'emp@test.local',
      password: hashPassword('Passw0rd!'),
      role: 'EMPLOYEE',
      active: true,
      permissions: JSON.stringify(['customers', 'suppliers', 'reports', 'pos', 'products', 'inventory', 'cash', 'expenses', 'dashboard']),
    },
  })
  await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      name: 'أدمن B',
      email: 'admin2@test.local',
      password: hashPassword('Passw0rd!'),
      role: 'ADMIN',
      active: true,
    },
  })

  console.log('TENANT_A=' + tenantA.id)
  console.log('TENANT_B=' + tenantB.id)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
