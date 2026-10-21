import { NextRequest, NextResponse } from 'next/server'
import { withIdempotency } from '@/lib/idempotency'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { purgeEdgeCache, purgeCatalogCaches, PURGE_KEYS } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * 🆕 2026-10-22 — قيود الرصيد (الافتتاحي والتسويات)
 *
 * ليه ده موجود؟ لأن التاجر اللي بينقل من نظام قديم/دفتر ورق عنده ديون عملاء
 * ومستحقات موردين — لازم يدخلها في النظام كأول قيد موثّق، وأي تعديل بعدها
 * لازم يكون بسبب مكتوب. الرصيد في Customer/Supplier مش بيتكتب مباشرة من
 * أي مكان تاني في الكود (بيتحرك بالبيع/الشراء/الدفعات بس) — فالقيد ده هو
 * الباب الرسمي الوحيد لتعديله.
 *
 * قواعد صارمة:
 *   1. أدمن فقط (نفس موك حركة الخزنة اليدوية).
 *   2. السبب إجباري (≥ 3 حروف) — بيتخزن وبيظهر في كشف الحساب.
 *   3. حركة دفاتر محضة — مفيش CashEntry خالص (الدين القديم مش كاش).
 *   4. داخل معاملة تفاعلية مع قفل صف (FOR UPDATE) — مفيش سباق مع بيع/شراء.
 *   5. المبلغ الجديد ممكن يكون سالب (رصيد دائن) — ده مدعوم ومقصود.
 *
 * 🛠️ 2026-10-22 (مراجعة ميزة الأرصدة الافتتاحية):
 *   6. withIdempotency — نفس نمط /api/cash: العميل الأوفلاين بيبعت
 *      Idempotency-Key مع كل كتابة، وإعادة الإرسال بعد انقطاع بترجّع الرد
 *      الأصلي بدل تسوية مكرّرة (دين مضاعف).
 *   7. expectedBalance (اختياري من الواجهة): لو الرصيد الحالي لحظة التنفيذ
 *      مختلف عن اللي شافه المستخدم (بيع/دفعات وصلت في الأثناء) بيرفض 409
 *      بدل ما يضرب «اضبط الرصيد على X» فوق حركات جديدة. ومع إلغاء طابور
 *      الأوفلاين للتسويات (api-offline) دي طبقة الحماية التانية.
 *   8. سجل التدقيق بقى **داخل** الـ transaction و fatal — إما الرصيد والقيد
 *      وسطر الـ AuditLog مع بعض، أو ولا حاجة (قبل كده كان بعد الـ commit
 *      وأي فشل فيه كان بيتبلع في catch {}).
 *   9. سقف المبلغ: ‎±999,999,999 زي الافتتاحي بالظبط — قبل كده كان بيقبل
 *      أرقام من الخيال (1e15) في newBalance/delta.
 *
 * قرار تصميمي موثّق: حذف عميل/مورد برصيد صفر بعد تسوية (وبلا فواتير) بيسيب
 * صفوف BalanceEntry يتيمة (مفيش FK على Customer/Supplier عمدًا — عشان قيود
 * الترحيل القديمة متتساش) — القيود دي هي أرشيف التسويات ومقصود إنها تفضل.
 */

const KINDS = ['customer', 'supplier'] as const
type Kind = (typeof KINDS)[number]

/** سقف أمان مالي — نفس حد الرصيد الافتتاحي في مسارات العملاء/الموردين */
const MAX_ABS_AMOUNT = 999_999_999

class BalanceEntryError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'BalanceEntryError'
    this.status = status
  }
}

async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  const kind = body?.kind as Kind | undefined
  const refId = Number(body?.refId)
  const reason = String(body?.reason ?? '').trim()

  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: 'نوع القيد غير صالح' }, { status: 400 })
  }
  if (!Number.isInteger(refId)) {
    return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: 'سبب التسوية مطلوب (3 حروف على الأقل)' }, { status: 400 })
  }

  // الواجهة بترسل newBalance (الرصيد الجديد المطلوب) — أنضف من delta للتاجر.
  // الدلتا بتتحسب هنا داخل القفل عشان مفيش سباق.
  const hasNew = body?.newBalance !== undefined && body?.newBalance !== null && String(body.newBalance) !== ''
  const hasDelta = body?.delta !== undefined && body?.delta !== null && String(body.delta) !== ''
  if (hasNew === hasDelta) {
    return NextResponse.json(
      { error: 'مطلوب قيمة واحدة بالظبط: الرصيد الجديد أو مقدار التعديل' },
      { status: 400 },
    )
  }
  const newBalance = hasNew ? Number(body.newBalance) : null
  const deltaInput = hasDelta ? Number(body.delta) : null
  if (hasNew && !Number.isFinite(newBalance as number)) {
    return NextResponse.json({ error: 'الرصيد الجديد غير صالح' }, { status: 400 })
  }
  if (hasDelta && (!Number.isFinite(deltaInput as number) || (deltaInput as number) === 0)) {
    return NextResponse.json({ error: 'مقدار التعديل غير صالح' }, { status: 400 })
  }
  // 🛡️ سقف مالي — نفس حد الافتتاحي، عشان خطأ إدخال أو ثغرة ماتعديش 9 خانات
  if (hasNew && Math.abs(newBalance as number) > MAX_ABS_AMOUNT) {
    return NextResponse.json({ error: 'الرصيد الجديد خارج النطاق المسموح' }, { status: 400 })
  }
  if (hasDelta && Math.abs(deltaInput as number) > MAX_ABS_AMOUNT) {
    return NextResponse.json({ error: 'مقدار التعديل خارج النطاق المسموح' }, { status: 400 })
  }

  // 🛠️ حماية «اضبط الرصيد على X» فوق حركات جديدة: الواجهة بتبعت الرصيد
  // اللي شافه المستخدم شاشةً، ولو اللي على السيرفر مختلف بنرفض بدل ما
  // نمسح مبيعات/دفعات حصلت أثناء تأخّر الشبكة. (اختياري — للتوافق الخلفي)
  const hasExpected =
    body?.expectedBalance !== undefined && body?.expectedBalance !== null && String(body.expectedBalance) !== ''
  const expectedBalance = hasExpected ? Number(body.expectedBalance) : null
  if (hasExpected && !Number.isFinite(expectedBalance as number)) {
    return NextResponse.json({ error: 'الرصيد المتوقع غير صالح' }, { status: 400 })
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. قفل صف الكيان — مفيش بيع/شراء/دفعة متزامنة تدخل بين القرار والكتابة
      if (kind === 'customer') {
        const locked = await tx.$queryRaw<{ id: number }[]>`
          SELECT "id" FROM "Customer" WHERE "id" = ${refId} AND "tenantId" = ${session.tenantId} FOR UPDATE`
        if (locked.length === 0) throw new BalanceEntryError('العميل غير موجود', 404)
        const c = await tx.customer.findUnique({ where: { id: refId }, select: { id: true, name: true, balance: true } })
        if (!c) throw new BalanceEntryError('العميل غير موجود', 404)
        // 🛠️ تأمين القفل: الرصيد الحالي مختلف عن اللي شافه المستخدم؟ ارفض.
        if (hasExpected && Math.abs(c.balance - (expectedBalance as number)) > 0.005) {
          throw new BalanceEntryError(
            'الرصيد اتغيّر أثناء التسجيل (حركات جديدة وصلت) — حدّث الشاشة وجرّب تاني بأحدث رصيد',
            409,
          )
        }
        const delta = hasNew ? Math.round(((newBalance as number) - c.balance + Number.EPSILON) * 100) / 100 : (deltaInput as number)
        if (Math.abs(delta) < 0.005) throw new BalanceEntryError('الرصيد الحالي منضبط على القيمة المطلوبة أصلاً', 409)
        const entry = await tx.balanceEntry.create({
          data: {
            tenantId: session.tenantId,
            kind: 'customer',
            refId,
            delta,
            reason,
            createdBy: session.name || session.email || null,
          },
        })
        const updated = await tx.customer.update({
          where: { id: refId },
          data: { balance: { increment: delta } },
          select: { id: true, name: true, balance: true },
        })
        // 🛠️ سجل التدقيق جوه الـ transaction (ذريّة + fatal) — مفيش تغيير رصيد
        // من غير سطر تدقيق، وأي فشل في التدقيق بيرجّع الحركة كلها.
        await logAudit(
          {
            action: 'balance.entry',
            targetType: 'customer',
            targetId: String(refId),
            details: {
              tenantId: session.tenantId,
              entryId: entry.id,
              delta,
              before: c.balance,
              after: updated.balance,
              reason,
            },
            actor: { id: String(session.userId ?? ''), email: session.email },
          },
          undefined,
          { tx, fatal: true },
        )
        return { entry, entity: updated, before: c.balance }
      } else {
        const locked = await tx.$queryRaw<{ id: number }[]>`
          SELECT "id" FROM "Supplier" WHERE "id" = ${refId} AND "tenantId" = ${session.tenantId} FOR UPDATE`
        if (locked.length === 0) throw new BalanceEntryError('المورد غير موجود', 404)
        const s = await tx.supplier.findUnique({ where: { id: refId }, select: { id: true, name: true, balance: true } })
        if (!s) throw new BalanceEntryError('المورد غير موجود', 404)
        // 🛠️ نفس تأمين القفل للمورد
        if (hasExpected && Math.abs(s.balance - (expectedBalance as number)) > 0.005) {
          throw new BalanceEntryError(
            'الرصيد اتغيّر أثناء التسجيل (حركات جديدة وصلت) — حدّث الشاشة وجرّب تاني بأحدث رصيد',
            409,
          )
        }
        const delta = hasNew ? Math.round(((newBalance as number) - s.balance + Number.EPSILON) * 100) / 100 : (deltaInput as number)
        if (Math.abs(delta) < 0.005) throw new BalanceEntryError('الرصيد الحالي منضبط على القيمة المطلوبة أصلاً', 409)
        const entry = await tx.balanceEntry.create({
          data: {
            tenantId: session.tenantId,
            kind: 'supplier',
            refId,
            delta,
            reason,
            createdBy: session.name || session.email || null,
          },
        })
        const updated = await tx.supplier.update({
          where: { id: refId },
          data: { balance: { increment: delta } },
          select: { id: true, name: true, balance: true },
        })
        // 🛠️ نفس سجل التدقيق الذري للمورد
        await logAudit(
          {
            action: 'balance.entry',
            targetType: 'supplier',
            targetId: String(refId),
            details: {
              tenantId: session.tenantId,
              entryId: entry.id,
              delta,
              before: s.balance,
              after: updated.balance,
              reason,
            },
            actor: { id: String(session.userId ?? ''), email: session.email },
          },
          undefined,
          { tx, fatal: true },
        )
        return { entry, entity: updated, before: s.balance }
      }
    })

    // ⚡ تفريغ الكاش — الرصيد يظهر في القوائم والتقارير فوراً
    if (kind === 'customer') {
      await purgeEdgeCache(
        [PURGE_KEYS.customersDefault, PURGE_KEYS.dashboard(7), PURGE_KEYS.dashboard(14), PURGE_KEYS.dashboard(30)],
        session.tenantId,
        2,
      )
    } else {
      await purgeCatalogCaches(session.tenantId, session.branchId)
    }

    return NextResponse.json({ ok: true, entry: result.entry, balance: result.entity.balance }, { status: 201 })
  } catch (e) {
    if (e instanceof BalanceEntryError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    // 🛠️ قبل كده الخطأ غير المتوقع كان بيختفي بدون أي أثر — دلوقتي بيتسجل
    // في سيرفر اللوج برسالة واضحة (مع تحديد المصدر) قبل رد الـ 500.
    console.error('[balance-entries] unexpected error:', e)
    return NextResponse.json({ error: 'تعذّر تسجيل التسوية — حاول تاني' }, { status: 500 })
  }
}

/** GET?kind=customer&refId=12 — آخر 50 قيد للكيان (للكشوف والأرشفة) */
async function __GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind') as Kind | null
  const refId = Number(searchParams.get('refId'))
  if (!kind || !KINDS.includes(kind) || !Number.isInteger(refId)) {
    return NextResponse.json({ error: 'معطيات غير صالحة' }, { status: 400 })
  }
  const entries = await db.balanceEntry.findMany({
    where: { tenantId: session.tenantId, kind, refId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, delta: true, reason: true, createdBy: true, createdAt: true },
  })
  return NextResponse.json({ entries })
}

export async function POST(req: NextRequest) {
  // 🛡️ 2026-10-22 (مراجعة): withIdempotency — نفس نمط /api/cash؛ إعادة إرسال
  // نفس المفتاح بعد انقطاع بترجّع الرد الأصلي بدل تسوية مكرّرة.
  return withIdempotency(req, () => withDb(() => __POST(req)))
}
export async function GET(req: NextRequest) {
  return withDb(() => __GET(req))
}
