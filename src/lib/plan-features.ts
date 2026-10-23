/**
 * مصدر واحد لمميزات وحدود الباقات (صفحة الأسعار + شاشة اختيار الباقة في التسجيل).
 * الحدود (فروع/مستخدمين/منتجات) بتيجي من الداتابيز، والمميزات حسب نوع الباقة
 * (-basic / -pro) عشان أي باقة جديدة بنفس الكود تظهر تلقائياً.
 */

export type PlanFeatureItem = { ok: boolean; label: string }

export type PlanLimitsInput = {
  code: string
  maxProducts?: number | null
  maxUsers?: number | null
  maxBranches?: number | null
  trialDays?: number | null
}

/** القيم الكبيرة (مثل 999,999) = غير محدود */
export const LIMIT_UNLIMITED = 9999

export function branchesLabel(n: number): string {
  if (n >= LIMIT_UNLIMITED) return 'فروع غير محدودة'
  if (n <= 1) return 'فرع واحد'
  if (n === 2) return 'فرعان'
  return `حتى ${n} فروع`
}

export function usersLabel(n: number): string {
  if (n >= LIMIT_UNLIMITED) return 'مستخدمين غير محدودين'
  if (n <= 1) return 'مستخدم واحد'
  if (n === 2) return 'مستخدمان'
  return `حتى ${n} مستخدمين`
}

export function productsLabel(n: number): string {
  if (n >= LIMIT_UNLIMITED) return 'منتجات غير محدودة'
  return `حتى ${n.toLocaleString('en-US')} منتج`
}

/** مميزات الباقة (غير الحدود). ok=false → ميزة غير متاحة في الباقة */
export function planBenefitItems(code: string): PlanFeatureItem[] {
  if (code === 'trial') {
    return [
      { ok: true, label: 'كل ميزات نقطة البيع' },
      { ok: true, label: 'كل ميزات المخزون' },
      { ok: false, label: 'تقارير متقدمة' },
      { ok: false, label: 'بيع بالجملة' },
    ]
  }
  if (code.endsWith('-basic')) {
    return [
      { ok: true, label: 'كل ميزات نقطة البيع' },
      { ok: true, label: 'إدارة المخزون والعملاء' },
      { ok: true, label: 'المعاملات المالية والخزنة' },
      { ok: false, label: 'تقارير متقدمة' },
      { ok: false, label: 'بيع بالجملة' },
    ]
  }
  if (code.endsWith('-pro')) {
    return [
      { ok: true, label: 'كل ميزات الباقة الأساسية' },
      { ok: true, label: 'تقارير متقدمة + Excel' },
      { ok: true, label: 'بيع بالجملة (وحدات وقسم)' },
    ]
  }
  return []
}

/** الحدود بالترتيب: منتجات، مستخدمين، فروع */
export function planLimitItems(plan: PlanLimitsInput): PlanFeatureItem[] {
  const rows: PlanFeatureItem[] = []
  const products = plan.code === 'trial' ? plan.maxProducts || 50 : plan.maxProducts
  const users = plan.code === 'trial' ? plan.maxUsers || 1 : plan.maxUsers
  if (typeof products === 'number') rows.push({ ok: true, label: productsLabel(products) })
  if (typeof users === 'number') rows.push({ ok: true, label: usersLabel(users) })
  if (plan.code !== 'trial' && typeof plan.maxBranches === 'number') {
    rows.push({ ok: true, label: branchesLabel(plan.maxBranches) })
  }
  return rows
}

/** القائمة الكاملة لكارت الأسعار: الحدود ثم المميزات */
export function planFeatureItems(plan: PlanLimitsInput): PlanFeatureItem[] {
  return [...planLimitItems(plan), ...planBenefitItems(plan.code)]
}
