import { getCloudflareContext } from '@opennextjs/cloudflare'
import { readEnv } from './env'

/**
 * 🖼️ تخزين الصور على Cloudflare R2 (2026-10-20).
 * - الـ binding اسمه IMAGES (wrangler.jsonc → r2_buckets).
 * - IMAGES_PUBLIC_URL = الرابط العام للـ bucket (r2.dev أو دومين مخصص) بدون "/" في الآخر.
 * - الاسم = hash المحتوى → نفس الصورة نفس الرابط، والكاش immutable سنة.
 * لو الـ binding أو الرابط العام مش مظبوطين، isR2Ready() بترجع false والرفع بيرجع
 * للـ base64 القديم — فالنشر قبل إعداد R2 ما بيكسرش حاجة.
 */
interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>
}

function getBucket(): R2BucketLike | null {
  try {
    const ctx = getCloudflareContext() as unknown as { then?: unknown; env?: Record<string, unknown> }
    if (ctx && typeof ctx.then !== 'function') {
      const b = ctx.env?.['IMAGES'] as R2BucketLike | undefined
      if (b && typeof b.put === 'function') return b
    }
  } catch {
    /* خارج سياق الـ Worker (dev) */
  }
  return null
}

function publicBase(): string | null {
  const v = (readEnv('IMAGES_PUBLIC_URL') ?? '').trim().replace(/\/+$/, '')
  return /^https:\/\//.test(v) ? v : null
}

export function isR2Ready(): boolean {
  return getBucket() !== null && publicBase() !== null
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** يرفع الصورة ويرجّع الرابط العام، أو null لو R2 مش جاهز. */
export async function putImage(tenantId: string, mime: string, data: ArrayBuffer): Promise<string | null> {
  const bucket = getBucket()
  const base = publicBase()
  const ext = EXT[mime]
  if (!bucket || !base || !ext) return null
  const hash = (await sha256Hex(data)).slice(0, 40)
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '')
  const key = `${safeTenant}/${hash}.${ext}`
  await bucket.put(key, data, {
    httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
  })
  return `${base}/${key}`
}
