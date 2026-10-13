// 🥬 2026-10-13: مصطلحات الباقة الغذائية — «الأصناف» بدل «المنتجات» (زي ما التاجر بيقول في البقالة).
// باقات الأزياء والإلكترونيات وغيرها بتفضل «المنتجات» زي ما هي.
// تغيير شكلي بالكامل: مفيش أي أثر على الداتابيز أو الـ API.
import { useShopStore } from '@/lib/store'

// الترتيب مهم: الأطول الأول عشان «المنتجات» ماتتحولش لـ«الأصناف» غلط بالاستبدال الجزئي
const FOOD_TERMS: Array<[string, string]> = [
  ['المنتجات', 'الأصناف'],
  ['للمنتجات', 'للأصناف'],
  ['بالمنتجات', 'بالأصناف'],
  ['منتجات', 'أصناف'],
  ['المنتج', 'الصنف'],
  ['منتج', 'صنف'],
]

/** يحوّل النص لمصطلح الباقة الغذائية (لو isFood) أو يسيبه زي ما هو */
export function foodTerm(text: string, isFood: boolean): string {
  if (!isFood) return text
  let out = text
  for (const [from, to] of FOOD_TERMS) out = out.split(from).join(to)
  return out
}

/** Hook: t('المنتجات') → 'الأصناف' في المحلات الغذائية، وغير كده نفس النص */
export function useVocab(): (text: string) => string {
  const isFood = useShopStore((s) => s.plan.businessType) === 'food'
  return (text: string) => foodTerm(text, isFood)
}
