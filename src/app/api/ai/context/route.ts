import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { buildAIContext, type DictCategory } from '@/lib/arabic-dictionary'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/context
 *
 * 🛡️ 2026-09-15 (v1): Returns the dictionary as a single text string
 * formatted for injection into an LLM prompt.
 *
 * Query params:
 *   - categories: comma-separated list of categories to include
 *     (default: all)
 *   - maxLength: max character count (default: 8000)
 *
 * Example output (truncated):
 *   ── COLORS ──
 *     أسود (black): أسود | اسود | إسود
 *     أبيض (white): أبيض | ابيض | نص أبيض
 *   ── CLOTHING ──
 *     قميص (shirt): قميص | قميص رجالي | ياقة
 *   ...
 *
 * The AI assistant uses this to know the dialect → canonical mapping so
 * it can normalize the user's input before storing it.
 */
export async function GET(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const url = new URL(req.url)
  const categoriesParam = url.searchParams.get('categories')
  const maxLength = Number(url.searchParams.get('maxLength') ?? 8000)

  let categories: DictCategory[] | undefined
  if (categoriesParam) {
    categories = categoriesParam.split(',').map((c) => c.trim()).filter(Boolean) as DictCategory[]
  }

  const contextText = buildAIContext({ categories, maxLength })

  return NextResponse.json({
    ok: true,
    context_length: contextText.length,
    max_length: maxLength,
    categories: categories ?? 'all',
    context: contextText,
  })
}
