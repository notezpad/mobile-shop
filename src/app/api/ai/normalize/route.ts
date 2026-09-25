import { withDb } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { extractAttributesFromText } from '@/lib/arabic-dictionary'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/normalize
 *
 * 🛡️ 2026-09-15 (v1): Extract structured product attributes from a
 * natural-language Arabic description using the dictionary.
 *
 * Body: { text: string }
 *
 * Example:
 *   Input:  { "text": "كوتشي أسود مقاس 42" }
 *   Output: {
 *     ok: true,
 *     raw_text: "كوتشي أسود مقاس 42",
 *     extracted: {
 *       colors: ["أسود"],
 *       sizes: ["42"],
 *       clothing: [],
 *       shoes: ["حذاء رياضي"],   // ← "كوتشي" normalized to canonical
 *       electronics_brands: [],
 *       electronics_models: [],
 *       accessories: []
 *     },
 *     suggested_name: "حذاء رياضي أسود مقاس 42",
 *     confidence: 0.75
 *   }
 *
 * The AI assistant can call this endpoint to:
 *   1. Get a fallback for what the LLM returned (cross-check)
 *   2. Pre-fill the product form fields based on the dictionary lookup
 *   3. Show the user the canonical form so they can confirm
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

  const text = String(body.text ?? '').trim()
  if (!text) {
    return NextResponse.json({ error: 'text مطلوب' }, { status: 400 })
  }

  const extracted = extractAttributesFromText(text)

  // Build a suggested canonical product name from the extracted attributes
  const nameParts: string[] = []
  if (extracted.electronics_models.length > 0) {
    nameParts.push(...extracted.electronics_models)
  }
  if (extracted.electronics_brands.length > 0) {
    // Avoid duplicating brand if it's already in the model name
    for (const brand of extracted.electronics_brands) {
      if (!nameParts.some((p) => p.toLowerCase().includes(brand.toLowerCase()))) {
        nameParts.unshift(brand)
      }
    }
  }
  if (extracted.clothing.length > 0) nameParts.push(...extracted.clothing)
  if (extracted.shoes.length > 0) nameParts.push(...extracted.shoes)
  if (extracted.accessories.length > 0) nameParts.push(...extracted.accessories)
  if (extracted.colors.length > 0) nameParts.push(...extracted.colors)
  if (extracted.sizes.length > 0) nameParts.push(...extracted.sizes.map((s) => `مقاس ${s}`))

  // Compute confidence: ratio of extracted words to total tokens
  const totalTokens = text.split(/\s+/).filter(Boolean).length
  const matchedTokens =
    extracted.colors.length +
    extracted.sizes.length +
    extracted.clothing.length +
    extracted.shoes.length +
    extracted.electronics_brands.length +
    extracted.electronics_models.length +
    extracted.accessories.length
  const confidence = totalTokens > 0 ? Math.min(1, matchedTokens / totalTokens) : 0

  return NextResponse.json({
    ok: true,
    raw_text: text,
    extracted,
    suggested_name: nameParts.join(' ').trim(),
    confidence: Number(confidence.toFixed(2)),
    hint:
      confidence < 0.3
        ? '⚠️ الـ confidence منخفض — ممكن النص مش في الـ dictionary. لو الـ AI assistant شغّال، اعتمد على الـ LLM output.'
        : '✓ تم استخراج الـ attributes بنجاح من الـ dictionary.',
  })
}

export async function POST(...args: Parameters<typeof __POST>) {
  return withDb(() => __POST(...args))
}
