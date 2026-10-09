/**
 * ═══════════════════════════════════════════════════════════════════════
 *  plan-billing — الترقية النسبية (Proration) + سجل تغييرات الباقات
 * ═══════════════════════════════════════════════════════════════════════
 *  🛡️ 2026-10-10 (Plan Control):
 *
 *  قبل كده: switch-plan كان بيبدّل الباقة مجاناً بالكامل — المحل اللي على
 *  «أساسية 299» يقدر يحوّل نفسه لـ«احترافية 599» ولا يدفع فرق جنيه لحد
 *  التجديد الجاي. دي فتحة خسارة مباشرة لصاحب المنصة.
 *
 *  الحل هنا (سياسة عادلة ومفهومة للطرفين):
 *   - ترقية (الباقة الجديدة أغلى): المحل يكمل لنهاية مدته الحالية بس يدفع
 *     «فرق القيمة اليومية × الأيام المتبقية» — المستحق بيتسجل في
 *     PlanChangeLog بمبلغ due غير محصّل، والأدمن بيشوفه ويحصّله من
 *     «سجل الاشتراكات».
 *   - هبوط (الباقة الجديدة أرخص): الفرق بيتحول لأيام مجانية إضافية
 *     (creditDays) — تعويض قيمي عادل بدون استرداد نقدي.
 *   - تجربة (period = trial): التبديل مجاني — لسه مفيش فلوس في اللعبة.
 *
 *  كل الحسابات بالجنيه المصري (نفس عملة الأسعار في DB).
 */

const DAY_MS = 86_400_000

/** تقريب لأقرب قرش (منزلتان) لتجنب فواصل عشرية طويلة */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ProrationSubscription {
  startDate: Date
  endDate: Date
  period: string // 'monthly' | 'yearly' | 'trial'
  amountPaid: number
}

export interface ProrationPlan {
  priceMonthly: number
  priceYearly: number
}

export interface ProrationResult {
  /** عدد أيام الفترة الحالية كاملة (start → end) */
  periodDays: number
  /** الأيام المتبقية من الاشتراك الحالي */
  remainingDays: number
  /** القيمة الفعلية المدفوعة/المفترضة للاشتراك الحالي */
  paidValue: number
  /** سعر الباقة الجديدة على نفس أساس الفترة */
  targetPrice: number
  /** القيمة اليومية للباقة الحالية */
  dailyOld: number
  /** القيمة اليومية للباقة الجديدة */
  dailyNew: number
  /** القيمة غير المستخدمة من اشتراك المحل الحالي */
  unusedValue: number
  /** > 0 عند الترقية: المبلغ المستحق على المحل لحد نهاية مدته */
  upgradeCost: number
  /** > 0 عند الهبوط: قيمة التعويض المستحقة للمحل */
  creditValue: number
  /** أيام مجانية مقترحة تعوّض قيمة الهبوط (creditValue ÷ dailyNew) */
  creditDays: number
  isTrial: boolean
  isUpgrade: boolean
}

/** سعر الباقة على أساس فترة الاشتراك الحالية */
function priceForPeriod(plan: ProrationPlan, period: string): number {
  if (period === 'yearly') return plan.priceYearly
  if (period === 'monthly') return plan.priceMonthly
  return 0
}

/**
 * حساب الترقية النسبية عند تبديل الباقة في منتصف الفترة.
 * - أساس القيمة: المبلغ المدفوع فعلاً (amountPaid)، ولو صفر (تعيين أدمن
 *   مجاني) نعتبر قيمة الاشتراك = سعر الباقة الكامل للفترة.
 * - الترقية تُبقي endDate كما هي مع مستحق نقدي؛ الهبوط يمدّد endDate
 *   بعدد أيام تعوّض قيمة الفرق.
 */
export function computeProration(
  sub: ProrationSubscription,
  currentPlan: ProrationPlan,
  targetPlan: ProrationPlan,
  now: Date = new Date(),
): ProrationResult {
  const isTrial = sub.period === 'trial'

  const startMs = sub.startDate.getTime()
  const endMs = sub.endDate.getTime()
  const periodDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS))
  const remainingDays = Math.max(0, Math.ceil((endMs - now.getTime()) / DAY_MS))

  const paidValue = isTrial
    ? 0
    : sub.amountPaid > 0
      ? sub.amountPaid
      : priceForPeriod(currentPlan, sub.period)

  const dailyOld = round2(paidValue / periodDays)
  const targetPrice = isTrial ? 0 : priceForPeriod(targetPlan, sub.period)
  const dailyNew = round2(targetPrice / periodDays)

  const unusedValue = round2(dailyOld * remainingDays)
  const delta = round2((dailyNew - dailyOld) * remainingDays)

  const upgradeCost = delta > 0 ? delta : 0
  const creditValue = delta < 0 ? -delta : 0
  const creditDays =
    creditValue > 0 && dailyNew > 0
      ? Math.min(365, Math.floor(creditValue / dailyNew))
      : 0

  return {
    periodDays,
    remainingDays,
    paidValue: round2(paidValue),
    targetPrice: round2(targetPrice),
    dailyOld,
    dailyNew,
    unusedValue,
    upgradeCost,
    creditValue,
    creditDays,
    isTrial,
    isUpgrade: upgradeCost > 0,
  }
}

/* ═══════════════════ تسجيل تغييرات الباقات ═══════════════════ */

/** أصغر شكل للعميل يكفي للتسجيل — لا نربط المكتبة بنوع Prisma الكامل */
export interface PlanChangeLogClient {
  planChangeLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  }
}

export interface PlanChangeLogInput {
  tenantId: string
  subscriptionId?: number | null
  fromPlanId?: number | null
  fromPlanCode?: string | null
  toPlanId?: number | null
  toPlanCode?: string | null
  changeType: 'switch' | 'assign' | 'renew' | 'manual' | 'trial'
  period?: string | null
  amountPaid?: number
  amountDue?: number
  creditValue?: number
  creditDays?: number
  remainingDays?: number
  note?: string | null
  actor?: string | null
}

/**
 * تسجيل عملية تغيير باقة في PlanChangeLog.
 * التسجيل أبداً لا يفشل العملية الرئيسية — أي خطأ يُطبع في اللوج فقط.
 */
export async function logPlanChange(
  dbx: PlanChangeLogClient,
  input: PlanChangeLogInput,
): Promise<void> {
  try {
    await dbx.planChangeLog.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId ?? null,
        fromPlanId: input.fromPlanId ?? null,
        fromPlanCode: input.fromPlanCode ?? null,
        toPlanId: input.toPlanId ?? null,
        toPlanCode: input.toPlanCode ?? null,
        changeType: input.changeType,
        period: input.period ?? null,
        amountPaid: input.amountPaid ?? 0,
        amountDue: input.amountDue ?? 0,
        creditValue: input.creditValue ?? 0,
        creditDays: input.creditDays ?? 0,
        remainingDays: input.remainingDays ?? 0,
        note: input.note ?? null,
        actor: input.actor ?? null,
      },
    })
  } catch (e) {
    // 🛡️ التسجيل مساعد — لا يسمح أبداً بإفشال العملية الأساسية
    console.error('[plan-billing] failed to write PlanChangeLog:', e)
  }
}
