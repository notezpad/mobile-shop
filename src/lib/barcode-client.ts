'use client'

import { generateUniqueEan13 } from '@/lib/barcode'

/**
 * بيطلب من السيرفر باركودات متحقّق إنها مش مستخدمة (منتجات/ألوان/وحدات).
 * - بيستخدم fetch مباشر (مش `api`) عشان طبقة الأوفلاين ماتخزّنش الرد وتديه نفس الكود تاني.
 * - لو السيرفر مش متاح (أوفلاين/خطأ) بيرجع للتوليد المحلي — والحفظ بعدها بيرفض أي تكرار.
 * - `exclude`: أكواد موجودة محلياً (مثلاً باركودات المنتج الحالي) ومش عايزينها.
 */
export async function fetchUniqueBarcodes(count: number, exclude: Iterable<string> = []): Promise<string[]> {
  const used = new Set(exclude)
  const n = Math.max(1, Math.floor(count))
  try {
    const res = await fetch(`/api/barcodes/generate?count=${n + used.size}`, { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as { barcodes?: string[] }
      const fresh = (data.barcodes ?? []).filter((c) => !used.has(c))
      if (fresh.length >= n) return fresh.slice(0, n)
      // ناقص (استبعدنا بعضهم) — نكمّل محلياً
      const out = [...fresh]
      const seen = new Set([...used, ...out])
      while (out.length < n) {
        const c = generateUniqueEan13(seen)
        seen.add(c)
        out.push(c)
      }
      return out
    }
  } catch {
    /* أوفلاين — نكمّل بالتوليد المحلي */
  }
  const out: string[] = []
  const seen = new Set(used)
  for (let i = 0; i < n; i++) {
    const c = generateUniqueEan13(seen)
    seen.add(c)
    out.push(c)
  }
  return out
}

export async function fetchUniqueBarcode(exclude: Iterable<string> = []): Promise<string> {
  return (await fetchUniqueBarcodes(1, exclude))[0]
}
