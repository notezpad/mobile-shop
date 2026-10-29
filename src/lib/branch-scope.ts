/**
 * 🏬 نطاق الفرع للمنتجات — مصدر الحقيقة الوحيد (SQL مباشر، بدون Prisma)
 * ─────────────────────────────────────────────────────────────────────────────
 * القاعدة:
 *   - المنتج بيتبع فرع واحد (Product.branchId) ومخزونه خاص بالفرع ده.
 *   - منتج branchId = NULL (قديم/غير مسند) بيتعامل كأنه تابع «للفرع الرئيسي».
 *   - موظف تابع لفرع بيشوف/يبيع/يعدّل منتجات فرعه بس. لو فرعه هو الرئيسي
 *     بيشوف كمان المنتجات غير المسندة.
 *   - الأدمن/الحساب الرئيسي (بدون فرع) بيشوف كل حاجة.
 *
 * الملف ده ممنوع يستورد Prisma/db (المسارات الساخنة بتستخدم postgres.js بس).
 * نسخة Prisma في branch-scope-db.ts.
 */
import type { Sql } from '@/lib/sql'

/** شرط WHERE جاهز للتركيب بعد AND — العمود "branchId" في جدول Product. */
export function productBranchScopeSql(
  sql: Sql,
  tenantId: string,
  branchId: number | null | undefined,
) {
  if (!branchId) return sql`TRUE`
  return sql`("branchId" = ${branchId} OR ("branchId" IS NULL AND ${branchId} = (
    SELECT "id" FROM "Branch" WHERE "tenantId" = ${tenantId} AND "isMain" = true LIMIT 1)))`
}
