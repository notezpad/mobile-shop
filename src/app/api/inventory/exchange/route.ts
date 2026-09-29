import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'
import { round2 } from '@/lib/purchase-return'

export const dynamic = 'force-dynamic'

/**
 * 🛡️ 2026-09-30: استبدال بضاعة مع المورد (بضاعة تالفة/مردودة ← بضاعة بديلة).
 *
 * قبل كده مفيش أي طريقة لتسجيل استبدال مع المورد — الحل البيتي كان "حركة
 * مخزون يدوية" وهي بتغيّر الكمية بس: لا بتلمس حساب المورد، ولا بتسجّل
 * فرق القيمة، ولا حتى سبب واضح. هنا الحركة الكاملة:
 *
 *   1. بضاعة خارجة للمورد   (نوع out،  refType = supplier_exchange)
 *   2. بضاعة بديلة داخلية    (نوع in،   refType = supplier_exchange)
 *   3. فرق القيمة بيروح على حساب المورد تلقائياً:
 *        diff = قيمة الوارد − قيمة الصادر
 *        diff > 0 → علينا للمورد زيادة (بضاعة الزيادة عليها حساب)
 *        diff < 0 → رصيد المورد بيقل (البضاعة الراجعة أغلى من البديلة)
 *      لو الصفر → استبدال متكافئ ومفيش أي أثر على الحساب.
 *
 * مفيش قيد خزنة لأن العملية مقايضة بضاعة — الفلوس بس هي اللي بتتحرك
 * من/إلى الخزنة (ده دور مرتجع الشراء الموجود بالفعل).
 *
 * القيمة بتتحسب بسعر التكلفة الحالي (المتوسط المرجح) للصنفين.
 */

interface ExchangeLine {
  productId: number
  quantity: number
}

export async function POST(req: NextRequest) {
  let s
  try { s = await requireAuth() } catch (e) {
    const err = authErrorResponse(e); return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(s, 'inventory') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const b = await req.json().catch(() => null)
  const supplierId = parseInt(b?.supplierId, 10)
  if (!supplierId) {
    return NextResponse.json({ error: 'اختار المورد أولاً' }, { status: 400 })
  }

  const reason = b?.note ? String(b.note).trim() : ''
  if (reason.length < 3) {
    return NextResponse.json({ error: 'اكتب سبب الاستبدال (إجباري)' }, { status: 400 })
  }

  // تحويل الأسطر والتحقق الأساسي
  const parseLines = (raw: any): ExchangeLine[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((l: any) => ({ productId: parseInt(l?.productId, 10), quantity: parseInt(l?.quantity, 10) }))
      .filter((l: ExchangeLine) => Number.isInteger(l.productId) && Number.isInteger(l.quantity) && l.quantity > 0)
  }
  const outLines = parseLines(b?.lines) // البضاعة الراجعة للمورد
  const inLines = parseLines(b?.replacements) // البضاعة البديلة

  if (outLines.length === 0 || inLines.length === 0) {
    return NextResponse.json(
      { error: 'لازم تحدد البضاعة الراجعة والبضاعة البديلة على الأقل صنف في كل جانب' },
      { status: 400 },
    )
  }

  // المورد لازم يبقى تابع لنفس المحل
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier || supplier.tenantId !== s.tenantId) {
    return NextResponse.json({ error: 'المورد غير صالح' }, { status: 400 })
  }

  // تحميل كل الأصناف المطلوبة (الجانبين) بنطاق المحل
  const allIds = [...new Set([...outLines, ...inLines].map((l) => l.productId))]
  const products = await db.product.findMany({
    where: { id: { in: allIds }, tenantId: s.tenantId },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))
  for (const l of [...outLines, ...inLines]) {
    const p = productMap.get(l.productId)
    if (!p) {
      return NextResponse.json({ error: `صنف غير موجود (#${l.productId})` }, { status: 400 })
    }
    if (s.branchId && p.branchId && p.branchId !== s.branchId) {
      return NextResponse.json({ error: `لا صلاحية على الصنف "${p.name}" (فرع آخر)` }, { status: 403 })
    }
  }

  // فحص توفر الكميات الخارجة (فحص مبدئي للرسالة اللطيفة — الفحص الذري جوه الـ tx)
  for (const l of outLines) {
    const p = productMap.get(l.productId)!
    if (p.quantity < l.quantity) {
      return NextResponse.json(
        { error: `الكمية غير متوفرة من "${p.name}" (المتاح: ${p.quantity})` },
        { status: 400 },
      )
    }
  }

  // قيم التكلفة الحالية (المتوسط المرجح)
  const costOf = (pid: number) => Math.max(0, productMap.get(pid)?.cost ?? 0)
  const nameOf = (pid: number) => productMap.get(pid)?.name ?? `#${pid}`
  const valueOut = round2(outLines.reduce((sum, l) => sum + costOf(l.productId) * l.quantity, 0))
  const valueIn = round2(inLines.reduce((sum, l) => sum + costOf(l.productId) * l.quantity, 0))
  const diff = round2(valueIn - valueOut)

  try {
    const result = await db.$transaction(async (tx) => {
      // ── 1. الصادر: البضاعة الراجعة للمورد (خروج ذري مشروط بالتوفر)
      for (const l of outLines) {
        const upd = await tx.product.updateMany({
          where: { id: l.productId, tenantId: s.tenantId, quantity: { gte: l.quantity } },
          data: { quantity: { decrement: l.quantity } },
        })
        if (upd.count !== 1) {
          throw new Error(`INSUFFICIENT_STOCK:${l.productId}`)
        }
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId,
            branchId: productMap.get(l.productId)?.branchId ?? (s.branchId ?? null),
            productId: l.productId,
            type: 'out',
            quantity: -l.quantity,
            refType: 'supplier_exchange',
            refId: supplierId,
            note: `استبدال مع مورد ${supplier.name} — ${nameOf(l.productId)} × ${l.quantity} — ${reason}`,
            userId: s.userId,
          },
        })
      }

      // ── 2. الوارد: البضاعة البديلة (دخول — التكلفة متتغيرش: مقايضة مش شراء جديد)
      for (const l of inLines) {
        await tx.product.update({
          where: { id: l.productId },
          data: { quantity: { increment: l.quantity } },
        })
        await tx.stockMovement.create({
          data: {
            tenantId: s.tenantId,
            branchId: productMap.get(l.productId)?.branchId ?? (s.branchId ?? null),
            productId: l.productId,
            type: 'in',
            quantity: l.quantity,
            refType: 'supplier_exchange',
            refId: supplierId,
            note: `بديل من مورد ${supplier.name} — ${nameOf(l.productId)} × ${l.quantity} — ${reason}`,
            userId: s.userId,
          },
        })
      }

      // ── 3. فرق القيمة على حساب المورد
      let supplierBalance: number | null = null
      if (diff !== 0) {
        const sup = await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { increment: diff } },
          select: { balance: true },
        })
        supplierBalance = sup.balance
      }

      return { valueOut, valueIn, diff, supplierBalance }
    }, { maxWait: 10000, timeout: 20000 })

    return NextResponse.json({
      ok: true,
      valueOut: result.valueOut,
      valueIn: result.valueIn,
      diff: result.diff,
      supplierBalance: result.supplierBalance,
      message:
        result.diff === 0
          ? 'تم الاستبدال (قيمة متكافئة — مفيش أثر على حساب المورد)'
          : result.diff > 0
            ? `تم الاستبدال — زيادة قيمة ${result.diff} اتحملت على حساب المورد`
            : `تم الاستبدال — قيمة ${Math.abs(result.diff)} بقت رصيد لك عند المورد`,
    })
  } catch (e: any) {
    if (e instanceof Error && e.message.startsWith('INSUFFICIENT_STOCK')) {
      return NextResponse.json(
        { error: 'كمية من البضاعة الراجعة باعت أثناء العملية — حدّث الصفحة وحاول تاني' },
        { status: 409 },
      )
    }
    throw e
  }
}
