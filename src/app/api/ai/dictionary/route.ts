import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { ALL_DICTIONARIES, DICTIONARY_STATS, lookupArabicWord, type DictCategory } from '@/lib/arabic-dictionary'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/dictionary
 *
 * 🛡️ 2026-09-15 (v1): Returns the Arabic product dictionary.
 *
 * Query params:
 *   - category: 'colors' | 'clothing_sizes' | 'shoe_sizes' | 'clothing' |
 *               'shoes' | 'electronics_brands' | 'electronics_models' |
 *               'accessories'
 *     (optional) — return only this category. If omitted, returns all.
 *   - format: 'full' (default) | 'compact'
 *     - full: includes dialects map for each entry
 *     - compact: just canonical + english
 *
 * No auth required for GET (it's just a dictionary, no PII).
 * Useful for the AI assistant to fetch the dictionary as JSON context.
 */
async function __GET(req: NextRequest) {
  const url = new URL(req.url)
  const category = url.searchParams.get('category') as DictCategory | null
  const format = (url.searchParams.get('format') ?? 'full') as 'full' | 'compact'

  if (category && !ALL_DICTIONARIES[category]) {
    return NextResponse.json(
      { error: `Category '${category}' غير معروفة. المتاح: ${Object.keys(ALL_DICTIONARIES).join(', ')}` },
      { status: 400 }
    )
  }

  const categories = category ? [category] : (Object.keys(ALL_DICTIONARIES) as DictCategory[])
  const result: Record<string, any> = {}

  for (const cat of categories) {
    const entries = ALL_DICTIONARIES[cat]
    result[cat] = entries.map((e) => {
      if (format === 'compact') {
        return { canonical: e.canonical, english: e.english }
      }
      return {
        canonical: e.canonical,
        english: e.english,
        meta: e.meta,
        dialects: e.dialects,
      }
    })
  }

  return NextResponse.json({
    ok: true,
    stats: DICTIONARY_STATS,
    format,
    ...(category ? { category } : {}),
    data: result,
  })
}

/**
 * POST /api/ai/dictionary
 *
 * Look up a single word in the dictionary.
 * Body: { word: string }
 *
 * Returns:
 *   {
 *     ok: true,
 *     word: "كوتشي",
 *     found: true,
 *     canonical: "حذاء رياضي",
 *     category: "shoes",
 *     dialect: "egypt",
 *     english: "sneakers",
 *     matches: [{ entry, dialect, matched }, ...]
 *   }
 *
 * Useful for the AI to normalize a single word the user typed.
 */
async function __POST(req: NextRequest) {
  let session
  try {
    session = await requireAuth()
  } catch (e) {
    const err = authErrorResponse(e)
    return NextResponse.json(err?.body, { status: err?.status })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const word = String(body.word ?? '').trim()
  if (!word) {
    return NextResponse.json({ error: 'word مطلوب' }, { status: 400 })
  }

  const lookup = lookupArabicWord(word)
  if (!lookup.found) {
    return NextResponse.json({
      ok: true,
      found: false,
      word,
      hint: 'مفيش match في القاموس. جرّب فحص الكلمة يدوياً في src/lib/arabic-dictionary.ts أو ضيفها كـ entry جديدة.',
    })
  }

  // Find the category
  let category: DictCategory | undefined
  for (const [cat, entries] of Object.entries(ALL_DICTIONARIES)) {
    if (entries.some((e) => e.canonical === lookup.canonical)) {
      category = cat as DictCategory
      break
    }
  }

  return NextResponse.json({
    ok: true,
    found: true,
    word,
    fuzzy: lookup.fuzzy ?? false,
    score: lookup.score ?? 1.0,
    canonical: lookup.canonical,
    category,
    dialect: lookup.dialect,
    english: lookup.english,
    meta: lookup.meta,
    matches: lookup.raw_matches?.map((m) => ({
      canonical: m.entry.canonical,
      dialect: m.dialect,
      matched: m.matched,
    })),
    // 🛡️ 2026-09-15 (v2): If this was a fuzzy match, include the other
    // suggestions too — the UI can show them so the user picks the right one.
    suggestions: lookup.suggestions ?? [],
    hint: lookup.fuzzy
      ? `⚠️ Match غير exact — "كتبت ${word}" و اللي لُقي أقرب هو "${lookup.canonical}" (score: ${lookup.score?.toFixed(2)}). ممكن تختار من الـ suggestions لو ده مش اللي تقصده.`
      : '✓ Match exact في القاموس.',
  })
}

export async function GET(...args: Parameters<typeof __GET>) {
  return withDb(() => __GET(...args))
}
export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
