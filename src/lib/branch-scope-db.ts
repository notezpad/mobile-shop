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

/** where لـ Prisma على Product حسب فرع المستخدم ({} للأدمن). */
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
