/**
 * ⚡ 2026-10-19: ضغط الصورة في المتصفح قبل الرفع.
 * الصور بتتخزن base64 في الداتابيز، فكل 1MB زيادة بيتحمل مع الصفحات (خصوصًا الشعار
 * اللي بيتحمل في كل صفحة). الضغط بيصغّر الأبعاد ويحوّل لـ WebP (بيحافظ على الشفافية).
 * أي فشل (متصفح قديم / صيغة غريبة) → بيرجع الملف الأصلي زي ما هو، فمفيش خطر.
 */
export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number; skipBelowBytes?: number } = {},
): Promise<File> {
  const { maxSize = 900, quality = 0.82, skipBelowBytes = 120 * 1024 } = opts
  try {
    // GIF ممكن يكون متحرك — منلمسوش. الصور الصغيرة أصلًا مش محتاجة ضغط.
    if (file.type === 'image/gif' || file.size <= skipBelowBytes) return file
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    )
    // لو المتصفح مادعمش WebP هيرجع PNG — مش هنستخدمه (ممكن يبقى أكبر)
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
    return new File([blob], name, { type: 'image/webp' })
  } catch {
    return file
  }
}
