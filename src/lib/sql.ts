/**
 * ⚡ src/lib/sql.ts — عميل SQL خفيف (postgres.js) للمسارات الساخنة (2026-10-17)
 * ─────────────────────────────────────────────────────────────────────────────
 * الهدف: تقليل CPU لكل طلب على خطة Cloudflare Workers المجانية (حد 10ms).
 *
 * ليه؟ Prisma wasm أتقل جزء على workerd: `new PrismaClient()` + محرك
 * الاستعلام (query compiler WASM) + ترجمة وتغليف النتائج بتاكل جزء كبير من
 * حصة الـ CPU لكل طلب — وده كان بيقع "Exceeded CPU Limit" حتى على endpoints
 * خفيفة (notifications, maintenance, tenant, branches...).
 *
 * postgres.js: تهيئته شبه مجانية (مفيش I/O غير مع أول استعلام)، وكلمة SQL
 * واحدة بتترجم مباشرة على بروتوكول Postgres عبر Hyperdrive — نفس الاستعلامات
 * بجزء بسيط جدًا من الـ CPU.
 *
 * قواعد الأمان (نفس مبادئ db.ts):
 *   1. كل طلب له عميل واحد بس (socket واحد) — workerd بيربط I/O بسياق
 *      الطلب، فمينفعش عميل مشترك بين الطلبات. بنستخدم نفس نمط WeakMap
 *      على ExecutionContext عشان requireAuth والـ route يتشاركوا نفس
 *      الاتصال بدل ما يفتحوا اتنين.
 *   2. connection string: Hyperdrive الأول (لو الـ binding موجود) وإلا
 *      DATABASE_URL — نفس منطق db.ts.
 *   3. prepare:false — أمان أكتر مع الـ pooling (Hyperdrive)، والفرق في
 *      الأداء غير محسوس لأن الكاش على الحافة هو اللي بيخدم المتكرر.
 *   4. الملف ده ممنوع يستورد أي حاجة من Prisma (db.ts/prisma-wasm.ts) —
 *      عشان المسارات الساخنة ماتحمّلش محرك Prisma في الـ bundle أصلاً.
 */

import postgres from 'postgres'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { readDatabaseUrl, isProductionRuntime } from './env'

export type Sql = postgres.Sql

/** يحل connection string: Hyperdrive أولًا ثم متغيرات البيئة (نفس منطق db.ts). */
function resolveConnectionString(): string | undefined {
  try {
    const ctx = getCloudflareContext() as unknown as {
      then?: unknown
      env?: Record<string, unknown>
    }
    if (ctx && typeof ctx.then !== 'function') {
      const hyperdrive = ctx.env?.['HYPERDRIVE'] as
        | { connectionString?: string }
        | undefined
      const cs = hyperdrive?.connectionString
      if (typeof cs === 'string' && cs.trim().length > 0) return cs.trim()
    }
  } catch {
    /* مش داخل سياق طلب Worker — نستخدم env تحت */
  }
  return readDatabaseUrl()
}

/** مفتاح الطلب الحالي (ExecutionContext) لمشاركة عميل واحد داخل نفس الطلب. */
function getCurrentRequestKey(): object | null {
  try {
    const ctx = getCloudflareContext() as unknown as {
      then?: unknown
      ctx?: object
    }
    if (ctx && typeof ctx.then !== 'function' && ctx.ctx && typeof ctx.ctx === 'object') {
      return ctx.ctx
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * 🕐 فك ترميز التواريخ متطابق مع Prisma: أعمدة DateTime في Prisma بتتخزن
 * `timestamp(3)` **بدون** منطقة زمنية (UTC wall-clock)، وبرisma/adapter-pg
 * بيفسرها كـ UTC دايمًا. postgres.js الافتراضي بيفسرها بتوقيت البيئة المحلية
 * (صحيح على Workers لأن TZ=UTC، بس بيفرق في dev على Node بتوقيت القاهرة).
 * التثبيت هنا يضمن نفس اللحظة بالضبط في أي بيئة.
 * DATE (1082) → منتصف ليل UTC — نفس فك Prisma.
 */
const utcDateType = {
  to: 1184,
  from: [1082, 1114],
  serialize: (x: unknown) => (x instanceof Date ? x : new Date(x as string)).toISOString(),
  parse: (x: string) =>
    new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(x)
        ? `${x}T00:00:00.000Z`
        : /[zZ]$|[+-]\d{2}:?\d{2}$/.test(x) || x.includes('T')
          ? x.replace(' ', 'T')
          : `${x.replace(' ', 'T')}Z`,
    ),
}

function createSql(): Sql {
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not reachable at runtime. Add DATABASE_URL as a secret/variable, or bind Hyperdrive as HYPERDRIVE.',
    )
  }
  // ⚡ 2026-10-19: max:3 (كان 1). مع max:1 كل Promise.all في الراوتات (الداشبورد
  // والمنتجات والتقارير) كانت بتتنفذ ورا بعض على سوكت واحد = رحلة لأيرلندا لكل
  // استعلام. دلوقتي لحد 3 استعلامات بالتوازي. Hyperdrive بيعمل الـ pooling الحقيقي
  // والـ Workers بتسمح بـ 6 اتصالات. للرجوع للسلوك القديم: غيّر الرقم لـ 1.
  return postgres(connectionString, {
    max: 3,
    // انظر شرح الترويسة — أمان مع pooling وأقل كمية CPU ممكنة.
    prepare: false,
    // ⚡ CPU: بدون ده postgres.js بيشغّل استعلام إضافي في *كل* اتصال جديد (pg_type)
    // ويعالج مئات الصفوف داخل الـ Worker. الكود مفيهوش أعمدة/باراميترات مصفوفات
    // (كله IN ${sql(list)})، فآمن. نفس توصية Cloudflare لـ Hyperdrive.
    fetch_types: false,
    connect_timeout: 8,
    idle_timeout: 5,
    // لو الـ pooler/الشبكة قطعت: خطأ سريع يرجع retry بدل تعليق → 503.
    max_lifetime: 60 * 30,
    types: { date: utcDateType },
  })
}

// Node.js (تطوير) — عميل واحد طويل العمر كافٍ.
let devSql: Sql | null = null

// عملاء لكل طلب (بره withSql — مثلاً requireAuth) بمفتاح ExecutionContext.
const ctxClients = new WeakMap<object, Sql>()

/**
 * يجيب عميل SQL مرتبط بالطلب الحالي (أو singleton على Node dev).
 * ⚠️ مينفعش يتعمد عليه بين الطلبات على Workers — استخدم withSql().
 */
export function getSql(): Sql {
  if (!isProductionRuntime()) {
    if (!devSql) devSql = createSql()
    return devSql
  }

  const key = getCurrentRequestKey()
  if (key) {
    let sql = ctxClients.get(key)
    if (!sql) {
      sql = createSql()
      ctxClients.set(key, sql)
    }
    return sql
  }

  // آخر حل — بناء عميل مؤقت (نفس سلوك fallbackClient في db.ts)
  return createSql()
}

/** إغلاق هادئ — مستخدم في finally عشان السوكت ميفضلش مفتوح للطلب. */
export async function endSqlQuietly(sql: Sql | null): Promise<void> {
  if (!sql) return
  try {
    await sql.end({ timeout: 1 })
  } catch {
    /* ignore */
  }
}

/**
 * يغلّف handler بعميل SQL واحد للطلب كله ثم يقفله.
 * الـ requireAuth/requireModule (بنفس الطلب) هتشارك نفس الاتصال
 * لأنها بتمر على getSql() بنفس مفتاح ExecutionContext.
 */
export async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = getSql()
  try {
    return await fn(sql)
  } finally {
    if (isProductionRuntime()) {
      const key = getCurrentRequestKey()
      if (key) ctxClients.delete(key)
      await endSqlQuietly(sql)
    }
  }
}

/**
 * هل الخطأ ده "تضارب فريد" (unique violation)؟ — بديل P2002 بتاع Prisma.
 * postgres.js بيطلّع SQLSTATE في err.code لأخطاء السيرفر.
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null
  if (!e) return false
  if (e.code === '23505') return true
  return e?.cause?.code === '23505'
}

/** أدوات تحويل بسيطة لضمان تطابق شكل JSON مع اللي Prisma كان بيرجعه. */
export const n = (v: unknown): number => (v == null ? 0 : Number(v))
export const numOrNull = (v: unknown): number | null =>
  v == null ? null : Number(v)
