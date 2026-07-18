import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Cloudflare Workers has no writable filesystem and this project has no R2
// bucket configured, so instead of saving a file to disk we convert the
// upload into a base64 data URL and hand it straight back. The caller
// stores that string directly in `imagePath` / `logoPath` (both are plain
// unbounded TEXT columns), and <img src="..."> renders a data URL exactly
// like a normal file URL — no extra storage/CDN setup required.
const MAX_BYTES = 2 * 1024 * 1024 // 2MB — keeps DB rows/requests reasonable
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
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
    const base64 = Buffer.from(buf).toString('base64')
    const url = `data:${file.type};base64,${base64}`
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ error: 'فشل معالجة الصورة' }, { status: 500 })
  }
}
