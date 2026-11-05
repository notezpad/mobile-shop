/**
 * 📱 التحديث 31: تنضيف اقتراحات المعالج/كارت الشاشة — مشترك بين السيرفر والواجهة.
 * الهدف: «i7-8550h» و«I7-8550H» و«i7 - 8550H» (مسافات زيادة) يبقوا نفس القيمة ومايتكررش.
 */
export type SuggestionKind = 'cpu' | 'gpu'
export const MAX_SUGGESTION_LEN = 60

/** القيمة للعرض: مسافات مظبوطة بس (الحروف بتفضل زي ما اتكتبت) */
export function cleanSuggestionValue(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** مفتاح المقارنة: حروف صغيرة + بدون مسافات حوالين الشرطة */
export function normalizeSuggestionKey(raw: unknown): string {
  return cleanSuggestionValue(raw).toLowerCase()
}
