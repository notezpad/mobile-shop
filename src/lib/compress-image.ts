/**
 * ⚡ 2026-10-19: ضغط إجباري للصورة في المتصفح قبل الرفع — لأقل حجم معقول.
 * الصور بتتخزن base64 في الداتابيز وبتتحمل مع الصفحات، فكل KB زيادة له تمن.
 *
 * الطريقة: تصغير الأبعاد لـ maxSize + تحويل WebP (بيحافظ على الشفافية)، وبعدين
 * لو لسه أكبر من targetBytes بنقلّل الجودة على خطوات، وبعدها نصغّر الأبعاد تاني،
 * لحد ما توصل للهدف أو لأقل حد (minSize). بتشتغل على أي حجم وأي صيغة
 * (PNG/JPG/WEBP/GIF — الـ GIF بياخد أول فريم). أي فشل → الملف الأصلي زي ما هو.
 */
export type CompressOpts = {
  maxSize: number // أقصى بُعد (عرض/ارتفاع) بالبكسل
  targetBytes: number // الحجم المستهدف
  minSize?: number // أقل بُعد مسموح بالتصغير ليه
}

const QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4]

export async function compressImage(file: File, opts: CompressOpts): Promise<File> {
  const { maxSize, targetBytes, minSize = 160 } = opts
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

    const bmp = await createImageBitmap(file)
    const longest = Math.max(bmp.width, bmp.height)
    let dim = Math.min(maxSize, longest)

    const render = (d: number, q: number): Promise<Blob | null> => {
      const scale = d / longest
      const w = Math.max(1, Math.round(bmp.width * scale))
      const h = Math.max(1, Math.round(bmp.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return Promise.resolve(null)
      ctx.drawImage(bmp, 0, 0, w, h)
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q))
    }

    let best: Blob | null = null
    for (;;) {
      for (const q of QUALITIES) {
        const blob = await render(dim, q)
        // لو المتصفح مادعمش WebP هيرجع PNG — مش هنستخدمه
        if (!blob || blob.type !== 'image/webp') {
          bmp.close?.()
          return best ? toFile(best, file) : file
        }
        if (!best || blob.size < best.size) best = blob
        if (blob.size <= targetBytes) {
          bmp.close?.()
          return smaller(best, file)
        }
      }
      if (dim <= minSize) break
      dim = Math.max(minSize, Math.round(dim * 0.8))
    }
    bmp.close?.()
    return best ? smaller(best, file) : file
  } catch {
    return file
  }
}

function toFile(blob: Blob, orig: File): File {
  return new File([blob], orig.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}

/** نرجّع المضغوط بس لو أصغر فعلًا من الأصلي. */
function smaller(blob: Blob, orig: File): File {
  return blob.size < orig.size ? toFile(blob, orig) : orig
}
