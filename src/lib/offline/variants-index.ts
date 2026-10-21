/**
 * 🎨 فهرس المتغيرات (لون/مقاس) للأوفلاين.
 *
 * قبل كده المتغيرات كانت بتتكاشّى بس لو المنتج اتفتح أونلاين (كاش URL)، ومفيش prewarm،
 * وبحث الباركود المحلي ما كانش بيعرف باركود المتغير. دلوقتي:
 *   - prewarmVariants(): بيسحب كل المتغيرات (/api/products/variants-index) ويخزنها في متجر `meta`
 *     (من غير ما نغيّر نسخة قاعدة IndexedDB).
 *   - upsertProductVariants(): أي GET أونلاين ناجح لمتغيرات منتج بيحدّث الفهرس (أحدث + يغطي المنتجات الجديدة).
 *   - getVariantsOfProduct() / findVariantByBarcode(): للقراءة أوفلاين.
 */
import { idb, idbAvailable } from './idb'

export interface IndexedVariant {
  id: number
  productId: number
  size: string | null
  color: string | null
  barcode: string | null
  quantity: number
}

const META_KEY = 'variantsIndex'
const META_AT_KEY = 'variantsIndexAt'

interface Loaded {
  byProduct: Map<number, IndexedVariant[]>
  byBarcode: Map<string, IndexedVariant>
}

let loaded: Promise<Loaded> | null = null

function build(rows: IndexedVariant[]): Loaded {
  const byProduct = new Map<number, IndexedVariant[]>()
  const byBarcode = new Map<string, IndexedVariant>()
  for (const v of rows) {
    const list = byProduct.get(v.productId)
    if (list) list.push(v)
    else byProduct.set(v.productId, [v])
    if (v.barcode) byBarcode.set(String(v.barcode), v)
  }
  return { byProduct, byBarcode }
}

function load(): Promise<Loaded> {
  if (!loaded) {
    loaded = (async () => {
      const rows = (await idb.getMeta<IndexedVariant[]>(META_KEY)) ?? []
      return build(Array.isArray(rows) ? rows : [])
    })()
  }
  return loaded
}

const slim = (v: any, productId: number): IndexedVariant => ({
  id: Number(v.id),
  productId: Number(v.productId ?? productId),
  size: v.size ?? null,
  color: v.color ?? null,
  barcode: v.barcode ?? null,
  quantity: Number(v.quantity) || 0,
})

async function persist(l: Loaded): Promise<void> {
  const rows: IndexedVariant[] = []
  for (const list of l.byProduct.values()) rows.push(...list)
  rows.sort((a, b) => a.id - b.id)
  await idb.setMeta(META_KEY, rows)
}

/** سحب كل المتغيرات (ترقيم بالـ cursor) وتخزينها. بيرجّع عددها (0 لو الباقة مفيهاش متغيرات أو فشل). */
export async function prewarmVariants(): Promise<number> {
  if (!idbAvailable()) return 0
  try {
    const LIMIT = 1000
    const MAX_PAGES = 200 // سقف أمان: 200 ألف متغير
    const all: IndexedVariant[] = []
    let cursor = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(`/api/products/variants-index?limit=${LIMIT}&cursor=${cursor}`)
      if (!res.ok) return 0 // فشل جزئي: نسيب الفهرس القديم زي ما هو
      const raw = await res.json().catch(() => null)
      const arr: any[] | null = raw && Array.isArray(raw.data) ? raw.data : null
      if (!arr) return 0
      for (const v of arr) all.push(slim(v, Number(v.productId)))
      if (raw.nextCursor == null) break
      cursor = Number(raw.nextCursor)
    }
    const l = build(all)
    loaded = Promise.resolve(l)
    await persist(l)
    await idb.setMeta(META_AT_KEY, Date.now())
    return all.length
  } catch {
    return 0
  }
}

/** تحديث متغيرات منتج واحد في الفهرس (بعد GET أونلاين ناجح). */
export async function upsertProductVariants(productId: number, variants: any[]): Promise<void> {
  if (!idbAvailable() || !Array.isArray(variants)) return
  try {
    const l = await load()
    const rows = variants.map((v) => slim(v, productId))
    for (const old of l.byProduct.get(productId) ?? []) if (old.barcode) l.byBarcode.delete(String(old.barcode))
    if (rows.length === 0) l.byProduct.delete(productId)
    else l.byProduct.set(productId, rows)
    for (const v of rows) if (v.barcode) l.byBarcode.set(String(v.barcode), v)
    await persist(l)
  } catch {
    /* الفهرس مساعد للأوفلاين بس — ما نكسرش الطلب الأصلي */
  }
}

/** متغيرات منتج من الفهرس المحلي (null = المنتج مش موجود في الفهرس أصلًا). */
export async function getVariantsOfProduct(productId: number): Promise<IndexedVariant[] | null> {
  if (!idbAvailable()) return null
  try {
    const l = await load()
    if (l.byProduct.size === 0) return null
    return l.byProduct.get(productId) ?? []
  } catch {
    return null
  }
}

/** متغير بباركود مطابق تمامًا (زي مطابقة السيرفر لـ matchedVariantId). */
export async function findVariantByBarcode(code: string): Promise<IndexedVariant | null> {
  if (!idbAvailable() || !code) return null
  try {
    const l = await load()
    return l.byBarcode.get(code) ?? null
  } catch {
    return null
  }
}

/** هل الفهرس اتسحب قبل كده؟ */
export async function hasVariantsIndex(): Promise<boolean> {
  return (await idb.getMeta<number>(META_AT_KEY)) != null
}
