import { compressImage } from './compress-image'

/**
 * ⚡ 2026-10-19: نقطة الرفع الوحيدة لأي صورة في النظام (منتج / شعار / أي شاشة جديدة).
 * بتضغط الصورة في المتصفح الأول ثم ترفعها لـ /api/upload وترجع الـ url.
 * أي شاشة جديدة فيها رفع صورة لازم تستخدم الدالة دي بدل fetch('/api/upload') مباشرة
 * عشان الصور الكبيرة ماتتخزنش في الداتابيز (بتتحمل مع كل صفحة).
 */
const PRESETS = {
  product: { maxSize: 800, targetBytes: 60 * 1024 },
  logo: { maxSize: 300, targetBytes: 25 * 1024, minSize: 96 },
  general: { maxSize: 800, targetBytes: 60 * 1024 },
} as const

export async function uploadImage(
  file: File,
  kind: keyof typeof PRESETS = 'general',
  failMessage = 'فشل رفع الصورة',
): Promise<string> {
  const fd = new FormData()
  fd.append('file', await compressImage(file, PRESETS[kind]))
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || failMessage)
  return data.url as string
}
