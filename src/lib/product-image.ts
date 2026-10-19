/**
 * رابط صورة المنتج الداخلي اللي بترجعه قايمة /api/products بدل الـ base64
 * (مثال: /api/products/12/image?v=345678). لو الواجهة بعتته تاني في POST/PUT
 * فمعناه إن الصورة ماتغيرتش — مينفعش يتخزن مكان الـ base64 الأصلي.
 */
export function isInternalImageUrl(v: unknown): boolean {
  return typeof v === 'string' && /^\/api\/products\/\d+\/image(\?|$)/.test(v)
}
