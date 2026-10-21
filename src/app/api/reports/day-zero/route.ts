import { NextRequest, NextResponse } from 'next/server'
import { db, withDb } from '@/lib/db'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { requireModule, featureErrorResponse } from '@/lib/features'

export const dynamic = 'force-dynamic'

/**
 * 🆕 2026-10-22 — تقرير مطابقة يوم الصفر (Day-Zero Reconciliation)
 *
 * الإجابة العملية على اعتراض «احنا بنستخدم برنامج قديم وعليانا فلوس للموردين
 * ولينا عند عملاء — إزاي ننقل؟»: بننقل الأرصدة مش التاريخ. التقرير ده هو
 * الإثنين — بعد إدخال الأرصدة الافتتاحية بيطبع كشف نهائي بالأرقام الجديدة
 * مع مقارنة بإجماليات ما قبل الترحيل، والتاجر يوقّع عليه.
 *
 * الأرقام بتيجي من قاعدة البيانات مباشرة لحظة الطلب (مفيش snapshots
 * preCustomers/preSuppliers — القوائم التفصيلية للعرض فقط)، والواجهة تبني
 * وثيقة الطباعة وتضيف اسم المحل من إعداداتها.
 *
 * 🛠️ 2026-10-22 (مراجعة ميزة الأرصدة الافتتاحية) — إصلاحان حرجان:
 *   1. الإجماليات كانت بتتجمع من قوائم مقطوعة بـ LIMIT 500 (والترتيب
 *      balance DESC كان بيقطع الأرصدة السالبة أولًا) → أي محل فيه أكثر من
 *      500 رصيد كانت أرقام الورقة الموقّعة غلط بصمت. الآن: الإجماليات
 *      بتحسب بـ SUM/COUNT على كل الصفوف في استعلامات مستقلة بدون LIMIT،
 *      والـ LIMIT بيفضل للقوائم التفصيلية فقط مع flag قصّ واضح للواجهة.
 *   2. netPosition كانت بتتجاهل الأرصدة الدائنة (عملاء لهم رصيد سالب /
 *      موردين لنا عندهم) فكان الصافي مش مطابق للأرقام المعروضة جواره.
 *      المعادلة الصحيحة:
 *        كاش + ديون العملاء − رصيد العملاء الدائن
 *            − مستحقات الموردين + أرصدة الموردين لنا
 */

/** سقف القوائم التفصيلية للعرض فقط — الإجماليات دايمًا من كل الصفوف */
const LIST_LIMIT = 500

async function __GET(_req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }
  try { await requireModule(session, 'reports') } catch (e) {
    const fe = featureErrorResponse(e); if (fe) return NextResponse.json(fe.body, { status: fe.status }); throw e
  }

  const tid = session.tenantId

  // عملاء/موردين لهم رصيد فعلي (موجب = دين على العميل/علينا للمورد، سالب = دائن)
  // ⚠️ القوائم دي للعرض في وثيقة الطباعة فقط — ممنوع تجميع إجماليات منها.
  const [customers, suppliers, cashAgg, tenant, counts, cAgg, sAgg] = await Promise.all([
    db.$queryRaw<{ id: number; name: string; phone: string | null; balance: number }[]>`
      SELECT "id", "name", "phone", "balance"::float8 AS "balance"
      FROM "Customer"
      WHERE "tenantId" = ${tid} AND ABS("balance") > 0.005
      ORDER BY "balance" DESC, "name" ASC
      LIMIT ${LIST_LIMIT}`,
    db.$queryRaw<{ id: number; name: string; phone: string | null; balance: number }[]>`
      SELECT "id", "name", "phone", "balance"::float8 AS "balance"
      FROM "Supplier"
      WHERE "tenantId" = ${tid} AND ABS("balance") > 0.005
      ORDER BY "balance" DESC, "name" ASC
      LIMIT ${LIST_LIMIT}`,
    db.cashEntry.aggregate({ where: { tenantId: tid }, _sum: { amount: true } }),
    db.tenant.findUnique({ where: { id: tid }, select: { shopName: true } }),
    Promise.all([
      db.customer.count({ where: { tenantId: tid } }),
      db.supplier.count({ where: { tenantId: tid } }),
      db.product.count({ where: { tenantId: tid } }),
    ]),
    // 🛠️ الإجماليات الحقيقية: SUM/COUNT على كل الصفوف بدون LIMIT (إصلاح المشكلة 1)
    db.$queryRaw<{ debt: number; credit: number; withBalance: number }[]>`
      SELECT
        COALESCE(SUM("balance") FILTER (WHERE "balance" > 0.005), 0)::float8 AS "debt",
        COALESCE(-SUM("balance") FILTER (WHERE "balance" < -0.005), 0)::float8 AS "credit",
        COUNT(*) FILTER (WHERE ABS("balance") > 0.005)::int AS "withBalance"
      FROM "Customer"
      WHERE "tenantId" = ${tid}`,
    db.$queryRaw<{ debt: number; credit: number; withBalance: number }[]>`
      SELECT
        COALESCE(SUM("balance") FILTER (WHERE "balance" > 0.005), 0)::float8 AS "debt",
        COALESCE(-SUM("balance") FILTER (WHERE "balance" < -0.005), 0)::float8 AS "credit",
        COUNT(*) FILTER (WHERE ABS("balance") > 0.005)::int AS "withBalance"
      FROM "Supplier"
      WHERE "tenantId" = ${tid}`,
  ])

  const r2 = (x: number) => Math.round((Number(x ?? 0) + Number.EPSILON) * 100) / 100

  const customerDebt = r2(cAgg[0]?.debt ?? 0)
  const customerCredit = r2(cAgg[0]?.credit ?? 0)
  const supplierDebt = r2(sAgg[0]?.debt ?? 0)
  const supplierCredit = r2(sAgg[0]?.credit ?? 0)
  const cashBalance = r2(cashAgg._sum?.amount ?? 0)
  const customersWithBalance = Number(cAgg[0]?.withBalance ?? 0)
  const suppliersWithBalance = Number(sAgg[0]?.withBalance ?? 0)

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    // اسم المحل من إعدادات التينانت (قبل كده كان session.name = اسم المستخدم)
    shop: { name: tenant?.shopName ?? session.name ?? '' },
    listLimit: LIST_LIMIT,
    counts: {
      customers: counts[0],
      suppliers: counts[1],
      products: counts[2],
      customersWithBalance,
      suppliersWithBalance,
    },
    totals: {
      // لينا عند الناس
      customerDebt,
      customerCredit,
      // علينا للناس
      supplierDebt,
      supplierCredit,
      cashBalance,
      // 🛠️ الصافي المالي الصحيح (إصلاح المشكلة 2) — شامل الأرصدة الدائنة:
      //   كاش + ديون العملاء − رصيد العملاء الدائن − مستحقات الموردين + أرصدة الموردين لنا
      netPosition: r2(cashBalance + customerDebt - customerCredit - supplierDebt + supplierCredit),
    },
    // 🛠️ flags قصّ القوائم — الواجهة بتعرض تنبيه فوق الجدول المقطوع
    customersTruncated: customersWithBalance > customers.length,
    suppliersTruncated: suppliersWithBalance > suppliers.length,
    customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: r2(c.balance) })),
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone, balance: r2(s.balance) })),
  })
}

export async function GET(req: NextRequest) {
  return withDb(() => __GET(req))
}
