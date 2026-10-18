/**
 * 📋 2026-10-18 — سياسة حركات المخزون اليدوية (مصدر واحد للأرقام والأسباب).
 *
 * المشكلة اللي بتحلها: السبب كان نص حر، فالنظام مابيفهمش منه إن «تالف» = خسارة، أو إن
 * «استلام بضاعة» = دين على مورد. دلوقتي كل سبب ليه كود وقاعدة ثابتة على السيرفر:
 *   - مين يقدر يستخدمه (الموظف بحد أقصى، فوق الحد = المدير).
 *   - هل بيسجّل خسارة (مصروف غير نقدي بسعر التكلفة، من غير ما يمس الخزنة).
 *   - هل ممنوع من الحركة اليدوية ومتحوّل لمكانه الصح (أمر شراء / مرتجع مورد / هالك).
 *
 * الملف ده pure (من غير أي import سيرفر) فالواجهة والسيرفر بيستخدموا نفس القوايم.
 * ✏️ عدّل الأرقام من هنا بس.
 */

export const STOCK_POLICY = {
  /** أقصى كمية للحركة اليدوية الواحدة اللي الموظف يقدر يعملها بنفسه */
  employeeMaxQty: 5,
  /** أقصى قيمة (بسعر التكلفة، جنيه) للحركة الواحدة للموظف */
  employeeMaxValue: 500,
  /** عجز جرد قيمته من الرقم ده فأكتر → ملاحظة إجبارية قبل الاعتماد */
  stocktakeNoteThreshold: 1000,
} as const

export type ManualMoveType = 'in' | 'out' | 'damage' | 'adjust'

export interface ReasonRule {
  code: string
  /** يسجّل خسارة (مصروف غير نقدي بسعر التكلفة)؟ */
  loss: boolean
  /** تصنيف المصروف لو loss */
  lossCategory?: string
  /** لازم توضيح إضافي (ملاحظة) مع السبب */
  needsNote?: boolean
}

/** الأسباب المسموحة في حركة «وارد» اليدوية */
export const IN_REASONS: Record<string, ReasonRule> = {
  'تسوية زيادة (جرد)': { code: 'count_surplus', loss: false },
  'هدايا/عينات': { code: 'gift_in', loss: false },
  'خطأ تسجيل': { code: 'entry_fix', loss: false },
  'أخرى': { code: 'other', loss: false, needsNote: true },
}

/** الأسباب المسموحة في حركة «صادر» اليدوية (التالف ليه زر الهالك) */
export const OUT_REASONS: Record<string, ReasonRule> = {
  'هدايا/عينات': { code: 'gift_out', loss: true, lossCategory: 'هدايا وعينات' },
  'خطأ تسجيل': { code: 'entry_fix', loss: false },
  'أخرى': { code: 'other', loss: false, needsNote: true },
}

export const DAMAGE_RULE: ReasonRule = { code: 'damage', loss: true, lossCategory: 'هالك وتالف' }

/** أسباب ممنوعة يدوياً ومتحوّلة لمكانها الصح */
export const REDIRECTED_REASONS: Record<string, { redirect: 'purchase' | 'return' | 'damage'; message: string }> = {
  'استلام بضاعة': {
    redirect: 'purchase',
    message: 'بضاعة جاية من مورد؟ سجّلها من «المشتريات ← أمر شراء جديد» عشان الدين والتكلفة والخزنة تتسجل صح',
  },
  'مرتجع مورد': {
    redirect: 'return',
    message: 'إرجاع بضاعة لمورد؟ استخدم «المشتريات ← مرتجع» عشان حساب المورد والخزنة يتحدّثوا',
  },
  'تالف': {
    redirect: 'damage',
    message: 'بضاعة تالفة؟ سجّلها من زر ⚠ «هالك» عشان الخسارة تتحسب في المصروفات والأرباح',
  },
}

export const reasonLabelsFor = (type: ManualMoveType): string[] =>
  Object.keys(type === 'in' ? IN_REASONS : OUT_REASONS)

/** «السبب — الملاحظة» → { reason, extra } (للعملاء القدام اللي بيبعتوا الاتنين في note واحد) */
export function splitReasonNote(raw: string): { reason: string; extra: string } {
  const i = raw.indexOf(' — ')
  if (i < 0) return { reason: raw.trim(), extra: '' }
  return { reason: raw.slice(0, i).trim(), extra: raw.slice(i + 3).trim() }
}

export type PolicyDecision =
  | { ok: true; reasonCode: string; recordLoss: boolean; lossCategory?: string; needsReview: boolean }
  | { ok: false; status: number; error: string; redirect?: 'purchase' | 'return' | 'damage' | 'admin' }

export function evaluateManualMovement(input: {
  type: ManualMoveType
  reason: string
  extraNote: string
  /** الكمية المطلقة للحركة */
  qty: number
  /** تكلفة الوحدة (للتحقق من حد القيمة) */
  unitCost: number
  role: string
}): PolicyDecision {
  const { type, reason, extraNote, qty, unitCost, role } = input
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'

  // الهالك: للمدير فقط (زي ما كان)
  if (type === 'damage') {
    if (!isAdmin) return { ok: false, status: 403, error: 'تسجيل الهالك متاح للمدير فقط', redirect: 'admin' }
    return { ok: true, reasonCode: DAMAGE_RULE.code, recordLoss: true, lossCategory: DAMAGE_RULE.lossCategory, needsReview: false }
  }
  // 'adjust' (API قديم) ماعادش متاح للموظفين
  if (type === 'adjust' && !isAdmin) {
    return { ok: false, status: 403, error: 'التسوية متاحة للمدير فقط', redirect: 'admin' }
  }

  const redirected = REDIRECTED_REASONS[reason]
  if (redirected) return { ok: false, status: 400, error: redirected.message, redirect: redirected.redirect }

  const table = type === 'in' ? IN_REASONS : OUT_REASONS
  const rule = table[reason]
  if (!rule) {
    return { ok: false, status: 400, error: 'اختار سبب الحركة' }
  }
  if (rule.needsNote && extraNote.trim().length < 3) {
    return { ok: false, status: 400, error: 'اكتب ملاحظة توضّح السبب (٣ حروف على الأقل)' }
  }

  // الموظف: حد أقصى للكمية والقيمة — فوقه محتاج المدير
  if (!isAdmin) {
    const value = Math.round(qty * Math.max(0, unitCost) * 100) / 100
    if (qty > STOCK_POLICY.employeeMaxQty || value > STOCK_POLICY.employeeMaxValue) {
      return {
        ok: false,
        status: 403,
        redirect: 'admin',
        error: `الحركة دي أكبر من الحد المسموح للموظف (${STOCK_POLICY.employeeMaxQty} قطع أو ${STOCK_POLICY.employeeMaxValue} جنيه) — محتاجة المدير`,
      }
    }
  }

  return {
    ok: true,
    reasonCode: rule.code,
    recordLoss: rule.loss,
    lossCategory: rule.lossCategory,
    // حركات الموظفين اليدوية بتظهر للمدير للمراجعة
    needsReview: !isAdmin,
  }
}
