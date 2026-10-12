import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, requireAdmin, authErrorResponse } from '@/lib/auth'
import { getPlanContext } from '@/lib/features'
import { ensureCategory } from '../route'
import { purgeCatalogCaches } from '@/lib/edgeCache'

export const dynamic = 'force-dynamic'

/**
 * 🚀 2026-09-13: All handlers wrapped in `withDb` to reuse ONE PrismaClient
 * per request on Cloudflare Workers. The PUT handler especially makes
 * multiple queries (existing lookup + ensureCategory + barcode dup check +
 * update + unit price recompute loop) — without `withDb` each query was
 * establishing a NEW TCP+TLS+auth connection = ~200-500ms × 5+ = ~1-3s.
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { id } = await params
    const pid = parseInt(id, 10)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }
    const existing = await db.product.findUnique({ where: { id: pid } })
    if (!existing || existing.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
    }

    // 🛡️ 2026-09-30 (X9): تعديل التكلفة/الكمية من شاشة المنتج كان أي موظف
    // يقدر يعمله وبصمت — التكلفة بتغير ربح كل الفواتير الجاية، والكمية
    // كانت بتتغير من غير أي حركة مخزون (دفتر الحركات ميغطيهاش).
    // دلوقتي: الاتنين أدمن بس، وأي تغيير كمية بيتوثق كحركة 'adjust'.
    // 🥬 2026-10-12: الكمية بقيت Float (منتجات البيع بالوزن بالكيلو بكسور)
    // — المقارنة بقت بتفاوت عشري آمن (1e-9) بدل === الصارم.
    const newCost = body.cost !== undefined ? Number(body.cost) || 0 : existing.cost
    const newQty =
      body.quantity !== undefined
        ? Number.isFinite(Number(body.quantity))
          ? Math.round((Number(body.quantity) || 0) * 1000) / 1000
          : existing.quantity
        : existing.quantity
    const costChanged = Math.abs(newCost - existing.cost) > 1e-9
    const qtyChanged = Math.abs(newQty - existing.quantity) > 1e-9
    if (costChanged || qtyChanged) {
      try {
        await requireAdmin()
      } catch (e) {
        const err = authErrorResponse(e)
        if (err) {
          return NextResponse.json(
            { error: 'تعديل التكلفة أو الكمية من شاشة المنتج للأدمن فقط — استخدم حركات المخزون (وارد/صرف) عشان السجل يفضل موثق' },
            { status: err.status },
          )
        }
        throw e
      }
    }
    const name = String(body.name ?? existing.name).trim()
    if (!name) {
      return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
    }
    const price = Number(body.price ?? existing.price)
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: 'سعر البيع غير صالح' }, { status: 400 })
    }
    let category: string | null = null
    if (body.category !== undefined) {
      if (body.category && String(body.category).trim()) {
        category = await ensureCategory(String(body.category), session.tenantId)
      } else {
        category = null
      }
    } else {
      category = existing.category
    }
    let barcode: string | null = null
    if (body.barcode !== undefined) {
      barcode = body.barcode ? String(body.barcode).trim() || null : null
      if (barcode) {
        const dup = await db.product.findUnique({ where: { barcode } })
        if (dup && dup.id !== pid) {
          return NextResponse.json(
            { error: 'الباركود مستخدم بالفعل' },
            { status: 400 }
          )
        }
      }
    } else {
      barcode = existing.barcode
    }
    // 🛡️ 2026-10-03: التسعير الديناميكي — باقة احترافية فقط.
    const planCtxPatch = await getPlanContext(session.tenantId)
    const hasDynamicRetail = planCtxPatch.capabilities.includes('dynamic_retail_pricing')
    // 🥬 2026-10-12: بيع بالوزن — للمحلات الغذائية فقط. أي tenant تاني
    // بيبعت الحقل ده بنفسه؟ بنتجاهله (حماية السيرفر).
    const canSetWeight = planCtxPatch.businessType === 'food'

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.product.update({
        where: { id: pid },
        data: {
          name,
          category,
          barcode,
          price,
          cost:
            body.cost !== undefined ? Number(body.cost) || 0 : existing.cost,
          // 🥬 2026-10-12: الكمية Float — الكسور المسموحة لحد 3 خانات (جرام)
          quantity:
            body.quantity !== undefined
              ? Math.round((Number(body.quantity) || 0) * 1000) / 1000
              : existing.quantity,
          minQuantity:
            body.minQuantity !== undefined
              ? Math.round((Number(body.minQuantity) || 0) * 100) / 100 || 1
              : existing.minQuantity,
          // 🥬 2026-10-12: بيع بالوزن (كيلو بكسور) — غذائية فقط
          soldByWeight: canSetWeight
            ? body.soldByWeight === true || body.soldByWeight === 'true'
            : false,
          imagePath:
            body.imagePath !== undefined
              ? body.imagePath
                ? String(body.imagePath)
                : null
              : existing.imagePath,
          branchId:
            body.branchId !== undefined
              ? body.branchId
                ? parseInt(body.branchId, 10) || null
                : null
              : existing.branchId,
          // collection — اسم الكوليكشن لميزة الخصم الجماعي (فاشون فقط)
          collection:
            body.collection !== undefined
              ? body.collection
                ? String(body.collection).trim() || null
                : null
              : existing.collection,
          // Unit-Based Dynamic Pricing: per-product override of the tenant's
          // default retail margin %. Sending null/'' clears the override back
          // to "use the tenant default".
          // 🛡️ 2026-10-03: نسبة الهامش — باقة احترافية فقط.
          // لو الباقة أساسية: نتجاهل أي قيمة جاية من الـ client ونفضل على الـ null.
          retailMarginPercent: hasDynamicRetail
            ? body.retailMarginPercent !== undefined
              ? (body.retailMarginPercent === null || body.retailMarginPercent === ''
                  ? null
                  : Number(body.retailMarginPercent))
              : existing.retailMarginPercent
            : null,
        },
      })
      // 🛡️ 2026-09-30 (X9): تغيير الكمية من شاشة المنتج بيتوثق كحركة 'adjust'
      // — قبل كده كان بيحصل بصمت ودفتر الحركات ميغطيهش خالص.
      if (qtyChanged) {
        await tx.stockMovement.create({
          data: {
            tenantId: session.tenantId,
            branchId: session.branchId ?? null,
            productId: pid,
            type: 'adjust',
            quantity: newQty - existing.quantity,
            refType: 'manual',
            refId: pid,
            note: `تعديل كمية من شاشة المنتج (${existing.quantity} → ${newQty})`,
            userId: session.userId,
          },
        })
      }
      return row
    })
    // عند تغيير سعر البيع: إعادة حساب أسعار الوحدات تلقائياً (سعر × factor).
    // يمكن تعطيلها بإرسال recomputeUnitPrices=false.
    const shouldRecompute =
      price !== existing.price && body.recomputeUnitPrices !== false
    if (shouldRecompute) {
      const units = await db.productUnit.findMany({ where: { productId: pid } })
      await Promise.all(
        units.map((u) =>
          db.productUnit.update({
            where: { id: u.id },
            data: { price: Number((price * u.factor).toFixed(2)) },
          }),
        ),
      )
    }
    // ⚡ v9: مسح كاش الكتالوج بعد تعديل المنتج (سعر/كمية/وحدات...)
    await purgeCatalogCaches(session.tenantId, session.branchId)
    return NextResponse.json(updated)
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { id } = await params
    const pid = parseInt(id, 10)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
    }
    const existing = await db.product.findUnique({ where: { id: pid } })
    if (!existing || existing.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
    }
    const updated = await db.product.update({
      where: { id: pid },
      data: { active: body.active },
    })
    // ⚡ v9: مسح كاش الكتالوج بعد تعطيل/تنشيط المنتج
    await purgeCatalogCaches(session.tenantId, session.branchId)
    return NextResponse.json(updated)
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    let session
    try {
      session = await requireAuth()
    } catch (e) {
      const err = authErrorResponse(e)
      return NextResponse.json(err?.body, { status: err?.status })
    }

    const { id } = await params
    const pid = parseInt(id, 10)
    if (isNaN(pid)) {
      return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 })
    }
    const existing = await db.product.findUnique({ where: { id: pid } })
    if (!existing || existing.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'المنتج غير موجود' }, { status: 404 })
    }

    // ─────────────────────────────────────────────────────────────────
    // 🛡️ 2026-09-15 (v3): SMART, ACCOUNTING-AWARE product deletion.
    //
    // The user wants to be able to permanently delete a product without
    // harming:
    //   - The cash drawer (CashEntry doesn't FK to Product directly)
    //   - The sales history (SaleItem FKs to Product via productId)
    //   - The accounting reports (use SaleItem.name/price/cost/quantity
    //     which are snapshot values stored at sale time)
    //
    // Approach: 3 modes selectable via `?mode=...` query param.
    //
    // ─────────────────────────────────────────────────────────────────

    const url = new URL(req.url)
    const mode = (url.searchParams.get('mode') ?? 'check').toLowerCase()

    // ─── Step 1: Pre-scan all FK references ───
    // We count how many rows in each historical table reference this product.
    // The response tells the user what would be affected by `mode=archive`.
    const [saleItemsCount, stockMovementsCount, transferItemsCount,
           stocktakeItemsCount, purchaseOrderItemsCount] = await Promise.all([
      db.saleItem.count({ where: { productId: pid } }),
      db.stockMovement.count({ where: { productId: pid } }),
      db.transferItem.count({ where: { productId: pid } }),
      db.stocktakeItem.count({ where: { productId: pid } }),
      db.purchaseOrderItem.count({ where: { productId: pid } }),
    ])

    const totalRefs = saleItemsCount + stockMovementsCount + transferItemsCount
                     + stocktakeItemsCount + purchaseOrderItemsCount

    // ─── Mode: 'check' (default) — informational, no destructive action ───
    // Returns a structured report so the UI can show the user "X صنف بيع،
    // Y حركة مخزون... هل تريد الحذف النهائي بـ archive mode؟"
    if (mode === 'check') {
      // If no references at all → safe to delete immediately
      if (totalRefs === 0) {
        // No FK references — just hard delete
        try {
          await db.product.delete({ where: { id: pid } })
          // ⚡ v9: مسح كاش الكتالوج بعد الحذف الفوري
          await purgeCatalogCaches(session.tenantId, session.branchId)
          return NextResponse.json({
            ok: true,
            hard_deleted: true,
            mode: 'immediate',
            message: 'تم حذف المنتج نهائياً (مفيش بيانات مربوطة بيه).',
          })
        } catch (e: any) {
          return NextResponse.json(
            {
              error: 'تعذّر حذف المنتج',
              detail: e?.message ?? String(e),
            },
            { status: 500 }
          )
        }
      }

      // Has references → return a structured report so UI can ask for confirmation
      return NextResponse.json({
        ok: false,
        mode: 'check',
        blocked: true,
        message: 'المنتج مربوط ببيانات تاريخية. اختر طريقة الحذف:',
        // What's affected:
        references: {
          sale_items: saleItemsCount,            // ← affects sales + cash drawer accounting
          stock_movements: stockMovementsCount,  // ← affects inventory audit trail
          transfer_items: transferItemsCount,    // ← affects transfer history
          stocktake_items: stocktakeItemsCount,  // ← affects stocktake history
          purchase_order_items: purchaseOrderItemsCount, // ← affects purchase history
        },
        total_references: totalRefs,
        // Available modes the user can pick from:
        available_modes: [
          {
            mode: 'archive',
            label: 'حذف ذكي محاسبياً (موصى به)',
            description: 'يفصل ربط المنتج عن السجل التاريخي بس بيحتفظ بكل القيم المالية (الاسم، السعر، التكلفة، الكمية). الخزنة والمبيعات والأرباح تفضل سليمة في التقارير.',
            safe: true,
            endpoint: `/api/products/${pid}?mode=archive`,
          },
          {
            mode: 'deactivate',
            label: 'تعطيل فقط (الأكثر أماناً)',
            description: 'مش بيحذف المنتج، بـ يعطّله بس. المنتج يختفي من القائمة العادية بس يفضل موجود في الـ DB. تقدر تفعلّه تاني أي وقت.',
            safe: true,
            endpoint: `/api/products/${pid}`,
            method: 'PATCH',
            body: { active: false },
          },
        ],
        // What gets preserved vs lost in archive mode:
        accounting_impact: {
          cash_drawer: 'محفوظة 100% — الخزنة مستقلة عن المنتج.',
          sales_history: 'محفوظة — كل صنف بيع يفضل سجّل باسمه و سعره و تكلفته.',
          profit_reports: 'محفوظة — التقارير بتقرأ من snapshot values (SaleItem.name/price/cost/quantity).',
          audit_trail: 'محفوظ — حركات المخزون التاريخية تفضل موجودة لكن بدون ربط بالمنتج.',
          inventory_count: 'يتغير — المنتج هيتشال من inventory فوراً.',
          product_record: 'يتحذف — الـ Product row نفسه هيتمسح.',
        },
      }, { status: 409 })
    }

    // ─── Mode: 'archive' — the smart, accounting-safe delete ───
    // Sets productId = NULL on all historical rows, then deletes the Product.
    // Snapshot values (name, price, cost, quantity) remain → reports stay correct.
    if (mode === 'archive') {
      try {
        // 🛡️ Transaction: all FK clears + Product delete must succeed together
        // (or none of them do).
        //
        // 🛡️ 2026-10-05 ROOT-CAUSE FIX: the ARRAY form of $transaction breaks
        // with our proxied `db` (src/lib/db.ts wraps every delegate in a Proxy
        // for socket-error retry) — Prisma rejects the wrapped promises with
        // "All elements of the array need to be Prisma Client promises" AFTER
        // the statements already started executing independently → the client
        // received a 500 "فشل الحذف المحاسبي" while the product WAS actually
        // deleted (non-atomically!). That was the exact reported bug:
        //   red "فشل حذف: <اسم>" toast + product gone.
        // The INTERACTIVE form (callback + tx) is proxy-safe AND truly atomic
        // — it's the same pattern the PUT handler in this very file uses.
        await db.$transaction(async (tx) => {
          // 1. SaleItem — set productId = NULL (keep name/price/cost/quantity)
          await tx.saleItem.updateMany({
            where: { productId: pid },
            data: { productId: null },
          })
          // 2. StockMovement — set productId = NULL (keep type/quantity/refType)
          await tx.stockMovement.updateMany({
            where: { productId: pid },
            data: { productId: null },
          })
          // 3. TransferItem — set productId = NULL (keep quantity)
          await tx.transferItem.updateMany({
            where: { productId: pid },
            data: { productId: null },
          })
          // 4. StocktakeItem — set productId = NULL (keep systemQty/countedQty/diff)
          await tx.stocktakeItem.updateMany({
            where: { productId: pid },
            data: { productId: null },
          })
          // 5. PurchaseOrderItem — set productId = NULL (keep name/cost/quantity)
          await tx.purchaseOrderItem.updateMany({
            where: { productId: pid },
            data: { productId: null },
          })
          // 6. Finally delete the Product. This cascades:
          //    - ProductUnit (sub-product variants) — fine, no historical value
          //    - ProductVariant (color/size variants) — fine, no historical value
          await tx.product.delete({ where: { id: pid } })
        })

        // ⚡ v9: مسح كاش الكتالوج بعد حذف الأرشفة
        await purgeCatalogCaches(session.tenantId, session.branchId)
        return NextResponse.json({
          ok: true,
          hard_deleted: true,
          mode: 'archive',
          message: 'تم حذف المنتج نهائياً. السجل المالي (المبيعات + الخزنة + الأرباح) محفوظ.',
          cleared_references: {
            sale_items: saleItemsCount,
            stock_movements: stockMovementsCount,
            transfer_items: transferItemsCount,
            stocktake_items: stocktakeItemsCount,
            purchase_order_items: purchaseOrderItemsCount,
          },
          preserved: {
            cash_drawer: true,
            sales_history: true,
            profit_reports: true,
            audit_trail: true,
          },
        })
      } catch (e: any) {
        return NextResponse.json(
          {
            error: 'فشل الحذف المحاسبي — حاول مرة تانية أو استخدم mode=deactivate',
            detail: e?.message ?? String(e),
            suggestion: 'لو المشكلة فضلت، استخدم PATCH { active: false } لتعطيل المنتج بدلاً من حذفه.',
          },
          { status: 500 }
        )
      }
    }

    // ─── Mode: 'force' — DESTRUCTIVE, admin only ───
    // Hard deletes everything (cascade), losing all historical data.
    // Use only when you're 100% sure you want to wipe all history.
    if (mode === 'force') {
      // Only SUPER_ADMIN can use force mode
      if (session.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { error: 'mode=force متاح للمشرف العام فقط (SUPER_ADMIN).' },
          { status: 403 }
        )
      }
      try {
        // Delete all FK rows first, then the Product.
        // 🛡️ 2026-10-05: same array→interactive $transaction fix as archive
        // mode above (proxied db breaks the array form → false 500 after the
        // statements already ran).
        await db.$transaction(async (tx) => {
          await tx.saleItem.deleteMany({ where: { productId: pid } })
          await tx.stockMovement.deleteMany({ where: { productId: pid } })
          await tx.transferItem.deleteMany({ where: { productId: pid } })
          await tx.stocktakeItem.deleteMany({ where: { productId: pid } })
          await tx.purchaseOrderItem.deleteMany({ where: { productId: pid } })
          await tx.product.delete({ where: { id: pid } })
        })
        // ⚡ v9: مسح كاش الكتالوج بعد الحذف الكامل (force)
        await purgeCatalogCaches(session.tenantId, session.branchId)
        return NextResponse.json({
          ok: true,
          hard_deleted: true,
          mode: 'force',
          warning: '⚠️ تم حذف كل البيانات التاريخية المرتبطة بالمنتج. السجل المالي اتأثر.',
          cleared: {
            sale_items: saleItemsCount,
            stock_movements: stockMovementsCount,
            transfer_items: transferItemsCount,
            stocktake_items: stocktakeItemsCount,
            purchase_order_items: purchaseOrderItemsCount,
          },
        })
      } catch (e: any) {
        return NextResponse.json(
          {
            error: 'فشل الحذف الكامل',
            detail: e?.message ?? String(e),
          },
          { status: 500 }
        )
      }
    }

    // Unknown mode
    return NextResponse.json(
      {
        error: `mode غير معروف: '${mode}'. المتاح: check | archive | force`,
      },
      { status: 400 }
    )
  })
}
