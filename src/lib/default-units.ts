// الوحدات الافتراضية التي تُنشأ تلقائياً فور حفظ المنتج.
// price في كل وحدة = سعر البيع (القطاعي) × factor  →  سعر الجملة للوحدة.
export const DEFAULT_UNITS: { name: string; factor: number }[] = [
  { name: 'ربع دستة', factor: 3 },
  { name: 'نص دستة', factor: 6 },
  { name: 'دستة', factor: 12 },
  { name: 'دستة و نص', factor: 18 },
]

// صيغ قديمة/بديلة لاسم الوحدة (بنفس العدد) كانت بتتكتب بأكتر من شكل — بنعتبرها نفس الوحدة
// عشان زر «الوحدات التلقائية» ما يكرّرش وحدة موجودة بصيغة تانية. المقارنة بعد حذف المسافات.
const UNIT_NAME_ALIASES: Record<number, string[]> = {
  18: ['دستةونص', 'دستةونصف', 'ونصدستة', 'ونصفدستة'],
}

const squash = (s: string) => s.replace(/\s+/g, '')

/** هل الوحدة التلقائية دي موجودة بالفعل في وحدات المنتج؟ (نفس الاسم، أو صيغة معروفة بنفس العدد) */
export function hasDefaultUnit(
  units: { name: string; factor: number }[],
  preset: { name: string; factor: number }
): boolean {
  const target = squash(preset.name)
  const aliases = UNIT_NAME_ALIASES[preset.factor] ?? []
  return units.some((u) => {
    const n = squash(u.name)
    return n === target || (u.factor === preset.factor && aliases.includes(n))
  })
}

export function buildDefaultUnitsData(productId: number, price: number) {
  return DEFAULT_UNITS.map((u) => ({
    productId,
    name: u.name,
    factor: u.factor,
    price: Number((price * u.factor).toFixed(2)),
  }))
}
