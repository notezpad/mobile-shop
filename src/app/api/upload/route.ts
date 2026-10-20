import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { putImage } from '@/lib/r2'

export const dynamic = 'force-dynamic'

// Cloudflare Workers has no writable filesystem and this project has no R2
// bucket configured, so instead of saving a file to disk we convert the
// upload into a base64 data URL and hand it straight back. The caller
// stores that string directly in `imagePath` / `logoPath` (both are plain
// unbounded TEXT columns), and <img src="..."> renders a data URL exactly
// like a normal file URL — no extra storage/CDN setup required.
// ⚡ 2026-10-19: الواجهة بتضغط أي صورة لأقل حجم قبل الرفع (upload-image.ts) — عادةً
// أقل من 60KB. الحد هنا مجرد حماية من الإساءة، مش قيد على المستخدم (لو الضغط فشل
// في متصفح قديم بنقبل الأصلي لحد 10MB بدل ما نرفض).
// 🛡️ 2026-10-20: الحد نزل من 10MB لـ 3MB (الواجهة بتضغط الصورة لأقل من ~60KB قبل الرفع،
// فمفيش استخدام شرعي بيقرّب من الحد ده) — بيقلل إساءة استخدام الداتابيز كتخزين ملفات.
const MAX_BYTES = 3 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

async function __POST(req: NextRequest) {
  let tenantId: string
  try {
    tenantId = (await requireAuth()).tenantId
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'لم يتم اختيار ملف' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'صيغة الصورة غير مدعومة — استخدم PNG أو JPG أو WEBP أو GIF' },
      { status: 400 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `حجم الصورة كبير — الحد الأقصى ${MAX_BYTES / (1024 * 1024)} ميجابايت` },
      { status: 400 }
    )
  }

  try {
    const buf = await file.arrayBuffer()
    // 🛡️ التحقق من محتوى الملف الفعلي (magic bytes) — file.type بييجي من العميل ويتزوّر بسهولة.
    // والنوع المخزّن في الـ data URL هو النوع المكتشف من المحتوى مش اللي العميل قاله.
    const sniffed = sniffImageType(new Uint8Array(buf.slice(0, 16)))
    if (!sniffed) {
      return NextResponse.json({ error: 'الملف ليس صورة صالحة' }, { status: 400 })
    }
    // 🖼️ المسار الأساسي: R2 → بيرجّع رابط قصير (العمود في الداتابيز بيخزن الرابط بس).
    // لو R2 مش مظبوط لسه (binding/رابط عام) بنرجع للـ base64 القديم عشان ما يتكسرش حاجة.
    try {
      const r2Url = await putImage(tenantId, sniffed, buf)
      if (r2Url) return NextResponse.json({ url: r2Url })
    } catch (e) {
      console.error('[upload] R2 put failed, falling back to base64:', e)
    }
    const base64 = Buffer.from(buf).toString('base64')
    const url = `data:${sniffed};base64,${base64}`
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ error: 'فشل معالجة الصورة' }, { status: 500 })
  }
}

function sniffImageType(b: Uint8Array): string | null {
  const eq = (off: number, sig: number[]) => sig.every((v, i) => b[off + i] === v)
  if (eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (eq(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (eq(0, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  return null
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
