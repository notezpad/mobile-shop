// الوحدات الافتراضية التي تُنشأ تلقائياً فور حفظ المنتج.
// price في كل وحدة = سعر البيع (القطاعي) × factor  →  سعر الجملة للوحدة.
export const DEFAULT_UNITS: { name: string; factor: number }[] = [
  { name: 'ربع دستة', factor: 3 },
  { name: 'نص دستة', factor: 6 },
  { name: 'دستة', factor: 12 },
  { name: 'ونص دستة', factor: 18 },
]

export function buildDefaultUnitsData(productId: number, price: number) {
  return DEFAULT_UNITS.map((u) => ({
    productId,
    name: u.name,
    factor: u.factor,
    price: Number((price * u.factor).toFixed(2)),
  }))
}
