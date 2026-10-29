/**
 * 🏬 نسخة Prisma من نطاق الفرع (راجع branch-scope.ts للقاعدة الكاملة).
 */
import { db } from '@/lib/db'

/** id الفرع الرئيسي للمحل (null لو المحل مفيهوش فروع). */
export async function getMainBranchId(tenantId: string): Promise<number | null> {
  const main = await db.branch.findFirst({
    where: { tenantId, isMain: true },
    select: { id: true },
  })
  return main?.id ?? null
}

/** where لـ Prisma على أي جدول فيه branchId (Product/Sale/Expense/PurchaseOrder...) ({} للأدمن). */
export async function productBranchWhere(
  tenantId: string,
  branchId: number | null | undefined,
): Promise<Record<string, unknown>> {
  if (!branchId) return {}
  const mainId = await getMainBranchId(tenantId)
  return mainId === branchId
    ? { OR: [{ branchId }, { branchId: null }] }
    : { branchId }
}

/** هل المستخدم يقدر يتعامل مع منتج تابع للفرع ده؟ (الأدمن دايمًا آه) */
export async function canAccessProductBranch(
  tenantId: string,
  productBranchId: number | null,
  sessionBranchId: number | null | undefined,
): Promise<boolean> {
  if (!sessionBranchId) return true
  if (productBranchId === sessionBranchId) return true
  if (productBranchId != null) return false
  return (await getMainBranchId(tenantId)) === sessionBranchId
}

/** نفس productBranchWhere — اسم عام للجداول التانية. */
export const branchWhere = productBranchWhere
/** نفس canAccessProductBranch — اسم عام للجداول التانية. */
export const canAccessBranchRecord = canAccessProductBranch

/** أمر الشراء جوه نطاق فرع المستخدم؟ (لو الأمر مش موجود بنسيب المعالج يرد 404 بتاعه) */
export async function purchaseOrderInScope(
  tenantId: string,
  orderId: number,
  sessionBranchId: number | null | undefined,
): Promise<boolean> {
  if (!sessionBranchId) return true
  const o = await db.purchaseOrder.findUnique({
    where: { id: orderId },
    select: { tenantId: true, branchId: true },
  })
  if (!o || o.tenantId !== tenantId) return true
  return canAccessProductBranch(tenantId, o.branchId, sessionBranchId)
}
