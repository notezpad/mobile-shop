/**
 * 🏬 نطاق الفرع — مصدر الحقيقة الوحيد (SQL مباشر، بدون Prisma)
 * ─────────────────────────────────────────────────────────────────────────────
 * القاعدة (بتتطبق على المنتجات والمبيعات والمشتريات والمصروفات... أي جدول فيه branchId):
 *   - السجل بيتبع فرع واحد (branchId).
 *   - سجل branchId = NULL (قديم/غير مسند) بيتعامل كأنه تابع «للفرع الرئيسي».
 *   - موظف تابع لفرع بيشوف سجلات فرعه بس. لو فرعه هو الرئيسي بيشوف كمان الغير مسندة.
 *   - الأدمن/الحساب الرئيسي (بدون فرع) بيشوف كل حاجة.
 *
 * الملف ده ممنوع يستورد Prisma/db (المسارات الساخنة بتستخدم postgres.js بس).
 * نسخة Prisma في branch-scope-db.ts.
 */
import type { Sql } from '@/lib/sql'

/**
 * شرط WHERE جاهز للتركيب بعد AND.
 * column: اسم العمود (مع alias لو فيه join) — مثال: 'branchId' أو 's.branchId'.
 */
export function branchScopeSql(
  sql: Sql,
  tenantId: string,
  branchId: number | null | undefined,
  column = 'branchId',
) {
  if (!branchId) return sql`TRUE`
  return sql`(${sql(column)} = ${branchId} OR (${sql(column)} IS NULL AND ${branchId} = (
    SELECT "id" FROM "Branch" WHERE "tenantId" = ${tenantId} AND "isMain" = true LIMIT 1)))`
}

/** اسم قديم — نفس الدالة على عمود "branchId" في Product. */
export function productBranchScopeSql(
  sql: Sql,
  tenantId: string,
  branchId: number | null | undefined,
) {
  return branchScopeSql(sql, tenantId, branchId)
}

/** id الفرع الرئيسي بـ postgres.js (null لو المحل مفيهوش فروع). */
export async function getMainBranchIdSql(sql: Sql, tenantId: string): Promise<number | null> {
  const rows = await sql<{ id: number }[]>`
    SELECT "id" FROM "Branch" WHERE "tenantId" = ${tenantId} AND "isMain" = true LIMIT 1`
  return rows[0]?.id ?? null
}
