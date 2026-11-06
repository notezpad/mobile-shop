import { findBarcodeConflict, barcodeConflictMessage } from '@/lib/barcode-conflict'
import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { requireCapability, featureErrorResponse, requireModuleWritePermission } from '@/lib/features'
import { syncProductQuantityFromVariants } from '@/lib/sync-product-quantity'
import { normalizeBarcode } from '@/lib/barcode'
import { canAccessProductBranch } from '@/lib/branch-scope-db'
import { normalizeVariantPrice } from '@/lib/variant-price'
import { normalizeCondition } from '@/lib/variant-condition'
import { normalizeBoxCondition, normalizeWarrantyMonths, normalizeEdition, MAX_WARRANTY_MONTHS } from '@/lib/variant-device'

export const dynamic = 'force-dynamic'

async function loadOwned(tenantId: string, pid: number, vid: number, sessionBranchId?: number | null) {
  const v = await db.productVariant.findUnique({ where: { id: vid } })
  if (!v || v.productId !== pid) return null
  const p = await db.product.findUnique({ where: { id: pid } })
  if (!p || p.tenantId !== tenantId) return null
  // 🛡️ مت-7 (2026-11-02): فحص فرع المنتج — قبل كده المحل بس، فموظف فرع A
  // كان يقدر يعدّل/يمسح متغير منتج فرع B لو عرف الـ id.
  if (sessionBranchId && !(await canAccessProductBranch(tenantId, p.branchId, sessionBranchId))) {
    return null
  }
  return v
}

async function __PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  // saleh-kateb-mowazaf: module 'products'
  try { requireModuleWritePermission(session, 'products') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }
  const { id, vid } = await params
  const pid = parseInt(id, 10)
  const vId = parseInt(vid, 10)
  const owned = await loadOwned(session.tenantId, pid, vId, session.branchId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (body.size !== undefined) data.size = body.size ? String(body.size).trim() : null
  if (body.color !== undefined) data.color = body.color ? String(body.color).trim() : null
  if (body.barcode !== undefined) data.barcode = normalizeBarcode(body.barcode)
  // 💰 التحديث 28: سعر المواصفة — الحقل مبعوتش = مفيش تغيير؛ مبعوت فاضي = رجّعه لسعر المنتج العام
  if (body.price !== undefined) {
    const priceNorm = normalizeVariantPrice(body.price)
    if (!priceNorm.ok) {
      return NextResponse.json({ error: 'سعر غير صالح للمتغير' }, { status: 400 })
    }
    data.price = priceNorm.price
  }
  // 📱 التحديث 30: حالة الجهاز — مبعوتش = مفيش تغيير؛ فاضي = غير محددة
  if (body.condition !== undefined) {
    const condNorm = normalizeCondition(body.condition)
    if (!condNorm.ok) {
      return NextResponse.json({ error: 'حالة غير صالحة (جديد / مستعمل)' }, { status: 400 })
    }
    data.condition = condNorm.value
  }
  // 📱 التحديث 33: بيانات جهاز الموبايل/التابلت — مبعوتش = مفيش تغيير؛ فاضي = بدون تحديد
  if (body.warrantyMonths !== undefined) {
    const wNorm = normalizeWarrantyMonths(body.warrantyMonths)
    if (!wNorm.ok) {
      return NextResponse.json({ error: `الضمان المتبقي لازم رقم من 0 لـ ${MAX_WARRANTY_MONTHS} شهر` }, { status: 400 })
    }
    data.warrantyMonths = wNorm.value
  }
  if (body.boxCondition !== undefined) {
    const boxNorm = normalizeBoxCondition(body.boxCondition)
    if (!boxNorm.ok) {
      return NextResponse.json({ error: 'كرتونة غير صالحة (بالكرتونة الكاملة / الجهاز بس)' }, { status: 400 })
    }
    data.boxCondition = boxNorm.value
  }
  if (body.edition !== undefined) {
    const edNorm = normalizeEdition(body.edition)
    if (!edNorm.ok) {
      return NextResponse.json({ error: 'الإصدار/النسخة طويلة — أقصى 60 حرف' }, { status: 400 })
    }
    data.edition = edNorm.value
  }
  if (body.quantity !== undefined) {
    // 🛡️ خ-2 (2026-11-02): رفض صريح للقيم غير الصالحة والسالبة — قبل كده
    // parseInt(...) || 0 كان بيمسك NaN بس ويسيب الكمية السالبة تعدّي فيبقى
    // المخزون سالب بدون أي قيد.
    const q = parseInt(body.quantity, 10)
    if (!Number.isFinite(q) || q < 0) {
      return NextResponse.json({ error: 'الكمية ممنوع تكون سالبة' }, { status: 400 })
    }
    // 🛡️ خ-2: تعديل الكمية اليدوي قرار مخزني حساس — أدمن فقط، زي تعديل
    // كمية المنتج الأب بالظبط (الموظف يستخدم حركات المخزون الوارد/الصرف).
    try {
      await requireAdmin()
    } catch (e) {
      const err = authErrorResponse(e)
      if (err) {
        return NextResponse.json(
          { error: 'تعديل كمية اللون/المقاس يدوي للأدمن فقط — استخدم حركات المخزون (وارد/صرف) عشان السجل يفضل موثق' },
          { status: err.status },
        )
      }
      throw e
    }
    data.quantity = q
    // 👕 التعديل اليدوي لكمية المقاس = البضاعة دي على الرف (معروضة بالكامل) —
    // التقسيمة الدقيقة بيتظبطها إغلاق/فتح الموسم وحركات المخزون بعد كده
    data.displayQty = data.quantity
  }

  if (data.barcode) {
    // 🏬 2026-10-18: باركود المقاس فريد جوه نفس (المحل + الفرع) — فحص برسالة واضحة
    // (الـ trigger في الداتابيز هو الحاجز الأخير)
    const prod = await db.product.findUnique({ where: { id: pid }, select: { branchId: true } })
    const owner = await findBarcodeConflict(session.tenantId, prod?.branchId ?? null, data.barcode, { variantId: vId })
    if (owner) return NextResponse.json({ error: barcodeConflictMessage(owner) }, { status: 400 })
  }
  try {
    // 🛡️ خ-2: العمليات التلاتة (تحديث المقاس → مزامنة كمية الأب → تسجيل الحركة)
    // في transaction واحدة — قبل كده لو تسجيل الحركة فشل يبقى الرصيد اتغير
    // من غير أثر في الدفتر.
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.productVariant.update({ where: { id: vId }, data })
      if (data.quantity !== undefined) {
        await syncProductQuantityFromVariants(tx, pid)
        // 📒 2026-10-18: تعديل كمية لون/مقاس مباشرة يتسجل في سجل الحركات (كان بيتغير من غير أثر)
        const delta = data.quantity - owned.quantity
        if (delta !== 0) {
          const prodRow = await tx.product.findUnique({ where: { id: pid }, select: { branchId: true } })
          await tx.stockMovement.create({
            data: {
              tenantId: session.tenantId,
              branchId: prodRow?.branchId ?? null,
              productId: pid,
              variantId: vId,
              type: delta > 0 ? 'in' : 'out',
              quantity: delta,
              refType: 'manual',
              note: `تعديل كمية — ${[row.color, row.size].filter(Boolean).join(' / ')}`,
              userId: session.userId,
            },
          })
        }
      }
      return row
    })
    return NextResponse.json(updated)
  } catch (e: any) {
    if (e?.code === 'P2002' || String(e?.message ?? '').includes('نفس الفرع')) {
      return NextResponse.json({ error: 'الباركود مستخدم' }, { status: 400 })
    }
    return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 })
  }
}

async function __DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  let session
  try {
    session = await requireAuth()
    await requireCapability(session, 'variants')
  } catch (e) {
    const fe = featureErrorResponse(e)
    if (fe) return NextResponse.json(fe.body, { status: fe.status })
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  const { id, vid } = await params
  const pid = parseInt(id, 10)
  const vId = parseInt(vid, 10)
  const owned = await loadOwned(session.tenantId, pid, vId, session.branchId)
  if (!owned) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  await db.productVariant.delete({ where: { id: vId } })
  await syncProductQuantityFromVariants(db, pid)
  // 📒 2026-10-18: حذف لون/مقاس بمخزون = خروج كمية — يتسجل في سجل الحركات
  if (owned.quantity > 0) {
    const prodRow = await db.product.findUnique({ where: { id: pid }, select: { branchId: true } })
    await db.stockMovement.create({
      data: {
        tenantId: session.tenantId,
        branchId: prodRow?.branchId ?? null,
        productId: pid,
        variantId: null, // الـ variant اتمسح
        type: 'out',
        quantity: -owned.quantity,
        refType: 'manual',
        note: `حذف لون/مقاس — ${[owned.color, owned.size].filter(Boolean).join(' / ')}`,
        userId: session.userId,
      },
    })
  }
  return NextResponse.json({ ok: true })
}

export async function PUT(...args: Parameters<typeof __PUT>) {
  return withDb(() => __PUT(...args))
}
export async function DELETE(...args: Parameters<typeof __DELETE>) {
  return withDb(() => __DELETE(...args))
}
