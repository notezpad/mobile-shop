import { NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { withSql, type Sql } from '@/lib/sql'
import { getTenantTimezone } from '@/lib/tenantTime'
import { isCycleScheduleDue, scopeLabel, type CycleScheduleLike } from '@/lib/cycle-count'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * 🔄 2026-10-31 (التحديث الثاني عشر) — محرك الأتمتة للجرد الدوري المجدول.
 *
 * بيُنادى منه تلقائياً من أول تشغيل للتطبيق (الداشبورد / محطة الجرد) —
 * زي فحوصات الإشعارات بالظبط: أي مستخدم مسجّل يقدر يشغّله، والمحصلة
 * نفسها مهما تزامنوا. لكل جدول مستحق:
 *
 *   1. **Claim ذري**: UPDATE "lastRunAt" بشرط إن قيمتها القديمة نفسها —
 *      لو جهازين اتنفذوا مع بعض، واحد بس بيكسب الـ claim → مستحيل ورقتين.
 *   2. **منع تراكم المسودات**: فيه مسودة معلّقة من الجدول ده؟ نتخطى —
 *      المدير لازم يتعامل مع اللي على إيده الأول.
 *   3. **تخطي النطاق الفاضي**: مفيش منتجات في نطاق الجدول؟ نتخطى.
 *   4. توليد ورقة جرد (مسودة — بنوع الجدول أعمي/تقليدي) + إشعار للمحل.
 *
 * الرد: أعداد فقط { created, skipped } — مفيش أي بيانات حساسة.
 */

interface DueRow extends CycleScheduleLike {
  note: string | null
}

async function __POSTImpl(sql: Sql) {
  let s
  try {
    s = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const tz = await getTenantTimezone(s.tenantId)

  const rows = await sql<
    DueRow[]
  >`SELECT "id", "branchId", "category", "mode", "frequency", "dayOfWeek", "dayOfMonth",
            "enabled", "note", "lastRunAt"
     FROM "CycleCountSchedule"
     WHERE "tenantId" = ${s.tenantId} AND "enabled" = true`

  const due = rows.filter((r) => isCycleScheduleDue(r, tz))
  if (due.length === 0) return NextResponse.json({ created: 0, skipped: 0 })

  let created = 0
  let skipped = 0

  for (const sched of due) {
    // ── 1) claim ذري: أسجّل أنا اللي شغّلت الجدول ده في الموعد ده
    const claimed = await sql`
      UPDATE "CycleCountSchedule"
      SET "lastRunAt" = NOW()
      WHERE "id" = ${sched.id} AND "tenantId" = ${s.tenantId}
        AND "lastRunAt" IS NOT DISTINCT FROM ${sched.lastRunAt}`
    if (claimed.count !== 1) {
      skipped += 1
      continue
    }

    // ── 2) مسودة جرد دوري معلّقة من الجدول ده؟ منع تراكم المسودات
    const pending = await sql<{ id: number }[]>`
      SELECT "id" FROM "Stocktake"
      WHERE "cycleScheduleId" = ${sched.id} AND "status" = 'draft'
      LIMIT 1`
    if (pending.length > 0) {
      skipped += 1
      continue
    }

    // ── 3) نطاق العدّ: فاضي؟ نتخطى (نفس فلتر المحطة: فرع الجدول + غير المسندة)
    const branchScope =
      sched.branchId != null
        ? sql` AND (p."branchId" = ${sched.branchId} OR p."branchId" IS NULL)`
        : sql``
    const categoryScope = sched.category
      ? sql` AND p."category" = ${sched.category}`
      : sql``
    const countRows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "Product" p
      WHERE p."tenantId" = ${s.tenantId} ${branchScope} ${categoryScope}`
    if ((countRows[0]?.n ?? 0) === 0) {
      skipped += 1
      continue
    }

    // ── 4) توليد ورقة الجرد (مسودة) + إشعار للمحل
    const note = sched.note?.trim() || `جرد دوري — ${scopeLabel(sched.category)}`
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO "Stocktake"
        ("tenantId", "branchId", "status", "mode", "note", "createdBy", "cycleScheduleId")
      VALUES
        (${s.tenantId}, ${sched.branchId}, 'draft', ${sched.mode === 'open' ? 'open' : 'blind'}, ${note}, ${s.userId}, ${sched.id})
      RETURNING "id"`
    created += 1

    await createNotification(sql, s.tenantId, {
      type: 'cycle_count',
      title: 'جرد دوري مجدول 🔄',
      message: `اتولّد ${sched.mode === 'blind' ? 'جرد أعمي' : 'جرد تقليدي'} — ${scopeLabel(sched.category)} · ${note}. بانتظار العدّ من محطة الجرد.`,
      link: '/inventory/stocktake',
    })
    void inserted
  }

  return NextResponse.json({ created, skipped })
}

export async function POST() {
  return withSql((sql) => __POSTImpl(sql))
}
