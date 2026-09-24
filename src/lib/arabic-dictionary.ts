/**
 * 🛡️ 2026-09-15 (v1): Comprehensive Arabic product dictionary
 * for the AI assistant.
 *
 * Structure:
 *   - COLORS: Arabic color names across dialects
 *   - SIZES: clothing (XS-XXL, EU 36-46) + shoes (35-46)
 *   - CLOTHING: clothing item names across dialects
 *   - SHOES: shoe types across dialects
 *   - ELECTRONICS: phone/computer brands + popular models
 *   - ACCESSORIES: covers, chargers, headphones, etc.
 *
 * Coverage: MSA (Modern Standard Arabic) + Egyptian + Gulf + Levantine
 * + Maghrebi + Iraqi + Sudanese + Yemeni + Hassaniya.
 *
 * Each entry has a `canonical` (MSA) form which is what the system stores,
 * plus `dialects` map listing dialect-specific synonyms that the user might
 * type. The lookup function (`normalizeArabicWord`) returns the canonical
 * form for any dialect word.
 *
 * Used by:
 *   - /api/ai/dictionary (lookup endpoint)
 *   - /api/ai/normalize (text → structured product attributes)
 *   - The AI assistant's prompt-builder (injects the dictionary as context
 *     so the LLM knows the dialect → canonical mapping).
 */

// ─── Types ────────────────────────────────────────────────────────────
export type Dialect =
  | 'msa'        // Modern Standard Arabic (الفصحى)
  | 'egypt'      // Egyptian
  | 'gulf'       // Gulf (Saudi, UAE, Kuwait, Qatar, Bahrain, Oman)
  | 'levant'     // Levantine (Syria, Lebanon, Jordan, Palestine)
  | 'maghreb'    // Maghrebi (Morocco, Algeria, Tunisia, Libya, Mauritania)
  | 'iraq'       // Iraqi
  | 'sudan'      // Sudanese
  | 'yemen'      // Yemeni

export interface DictEntry {
  /** Canonical MSA form (stored in DB) */
  canonical: string
  /** English translation (optional, useful for barcode/SKU) */
  english?: string
  /** Optional metadata (hex for colors, size type for sizes, etc.) */
  meta?: Record<string, any>
  /** Dialect-specific synonyms */
  dialects: Partial<Record<Dialect, string[]>>
}

// ─── COLORS ────────────────────────────────────────────────────────────
export const COLORS: DictEntry[] = [
  // ── Basic colors ──
  {
    canonical: 'أسود',
    english: 'black',
    meta: { hex: '#000000' },
    dialects: {
      msa: ['أسود', 'اسود'],
      egypt: ['أسود', 'اسود', 'إسود'],
      gulf: ['أسود', 'اسود', 'كحلي'],
      levant: ['أسود', 'اسود', 'أسودون'],
      maghreb: ['أسود', 'كحل'],
      iraq: ['أسود', 'اسود'],
      sudan: ['أسود', 'اسود'],
      yemen: ['أسود', 'اسود'],
    },
  },
  {
    canonical: 'أبيض',
    english: 'white',
    meta: { hex: '#FFFFFF' },
    dialects: {
      msa: ['أبيض', 'ابيض'],
      egypt: ['أبيض', 'ابيض', 'نص أبيض'],
      gulf: ['أبيض', 'ابيض', 'أرويج'],
      levant: ['أبيض', 'ابيض', 'أبيضون'],
      maghreb: ['أبيض', 'بيض'],
      iraq: ['أبيض', 'ابيض'],
      sudan: ['أبيض', 'ابيض'],
      yemen: ['أبيض', 'ابيض'],
    },
  },
  {
    canonical: 'أحمر',
    english: 'red',
    meta: { hex: '#FF0000' },
    dialects: {
      msa: ['أحمر', 'احمر'],
      egypt: ['أحمر', 'احمر', 'أحمر دم'],
      gulf: ['أحمر', 'احمر', 'أحمر غامق', 'أحمر'],
      levant: ['أحمر', 'احمر', 'أحمر قشطي'],
      maghreb: ['أحمر', 'حمر'],
      iraq: ['أحمر', 'احمر'],
      sudan: ['أحمر', 'احمر'],
      yemen: ['أحمر', 'احمر'],
    },
  },
  {
    canonical: 'أصفر',
    english: 'yellow',
    meta: { hex: '#FFFF00' },
    dialects: {
      msa: ['أصفر', 'اصفر'],
      egypt: ['أصفر', 'اصفر', 'أصفر فاتح'],
      gulf: ['أصفر', 'اصفر', 'أصفر زعفراني'],
      levant: ['أصفر', 'اصفر', 'أصفر ليموني'],
      maghreb: ['أصفر', 'صفر'],
      iraq: ['أصفر', 'اصفر'],
      sudan: ['أصفر', 'اصفر'],
      yemen: ['أصفر', 'اصفر'],
    },
  },
  {
    canonical: 'أزرق',
    english: 'blue',
    meta: { hex: '#0000FF' },
    dialects: {
      msa: ['أزرق', 'ازرق'],
      egypt: ['أزرق', 'ازرق', 'أزرق سماوي'],
      gulf: ['أزرق', 'ازرق', 'سماء'],
      levant: ['أزرق', 'ازرق', 'سماوي'],
      maghreb: ['أزرق', 'زرق'],
      iraq: ['أزرق', 'ازرق'],
      sudan: ['أزرق', 'ازرق'],
      yemen: ['أزرق', 'ازرق'],
    },
  },
  {
    canonical: 'أخضر',
    english: 'green',
    meta: { hex: '#008000' },
    dialects: {
      msa: ['أخضر', 'اخضر'],
      egypt: ['أخضر', 'اخضر', 'أخضر زيتوني'],
      gulf: ['أخضر', 'اخضر', 'أخضر غامق'],
      levant: ['أخضر', 'اخضر', 'أخضر زيتوني'],
      maghreb: ['أخضر', 'خضر'],
      iraq: ['أخضر', 'اخضر'],
      sudan: ['أخضر', 'اخضر'],
      yemen: ['أخضر', 'اخضر'],
    },
  },
  {
    canonical: 'رمادي',
    english: 'gray',
    meta: { hex: '#808080' },
    dialects: {
      msa: ['رمادي', 'رصاصي'],
      egypt: ['رمادي', 'رصاصي', 'جير'],
      gulf: ['رمادي', 'رصاصي'],
      levant: ['رمادي', 'رصاصي'],
      maghreb: ['رمادي', 'رصاصي'],
      iraq: ['رمادي', 'رصاصي'],
      sudan: ['رمادي', 'رصاصي'],
      yemen: ['رمادي', 'رصاصي'],
    },
  },
  {
    canonical: 'بني',
    english: 'brown',
    meta: { hex: '#A52A2A' },
    dialects: {
      msa: ['بني', 'بنى'],
      egypt: ['بني', 'بنى', 'بني داكن', 'شوكولاتة'],
      gulf: ['بني', 'بنى', 'قهوهي'],
      levant: ['بني', 'بنى', 'بني داكن'],
      maghreb: ['بني', 'بنى', 'قهوة'],
      iraq: ['بني', 'بنى'],
      sudan: ['بني', 'بنى'],
      yemen: ['بني', 'بنى'],
    },
  },
  {
    canonical: 'برتقالي',
    english: 'orange',
    meta: { hex: '#FFA500' },
    dialects: {
      msa: ['برتقالي'],
      egypt: ['برتقالي', 'يقتين'],
      gulf: ['برتقالي'],
      levant: ['برتقالي', 'برتقالي'],
      maghreb: ['برتقالي', 'لرتقالي'],
      iraq: ['برتقالي'],
      sudan: ['برتقالي'],
      yemen: ['برتقالي'],
    },
  },
  {
    canonical: 'بنفسجي',
    english: 'purple',
    meta: { hex: '#800080' },
    dialects: {
      msa: ['بنفسجي', 'موف'],
      egypt: ['بنفسجي', 'حنفي', 'موفي'],
      gulf: ['بنفسجي', 'ياقوتي'],
      levant: ['بنفسجي', 'بنفسجي'],
      maghreb: ['بنفسجي', 'موف'],
      iraq: ['بنفسجي'],
      sudan: ['بنفسجي'],
      yemen: ['بنفسجي'],
    },
  },
  {
    canonical: 'وردي',
    english: 'pink',
    meta: { hex: '#FFC0CB' },
    dialects: {
      msa: ['وردي', 'زبردي'],
      egypt: ['وردي', 'فشنة', 'بنفسج فاتح', 'وردي فاتح'],
      gulf: ['وردي', 'زهري'],
      levant: ['وردي', 'زهر'],
      maghreb: ['وردي', 'زهر'],
      iraq: ['وردي', 'زهري'],
      sudan: ['وردي'],
      yemen: ['وردي'],
    },
  },
  {
    canonical: 'ذهبي',
    english: 'gold',
    meta: { hex: '#FFD700' },
    dialects: {
      msa: ['ذهبي', 'ذهبي'],
      egypt: ['ذهبي', 'دهبي'],
      gulf: ['ذهبي', 'ذهبي'],
      levant: ['ذهبي'],
      maghreb: ['ذهبي'],
      iraq: ['ذهبي'],
      sudan: ['ذهبي'],
      yemen: ['ذهبي'],
    },
  },
  {
    canonical: 'فضي',
    english: 'silver',
    meta: { hex: '#C0C0C0' },
    dialects: {
      msa: ['فضي', 'فضة'],
      egypt: ['فضي', 'فضي'],
      gulf: ['فضي'],
      levant: ['فضي'],
      maghreb: ['فضي'],
      iraq: ['فضي'],
      sudan: ['فضي'],
      yemen: ['فضي'],
    },
  },
  {
    canonical: 'كحلي',
    english: 'navy',
    meta: { hex: '#000080' },
    dialects: {
      msa: ['كحلي', 'كحلي'],
      egypt: ['كحلي', 'كحلي غامق', 'أزرق كحلي'],
      gulf: ['كحلي', 'كحلي'],
      levant: ['كحلي', 'كحلي'],
      maghreb: ['كحلي', 'كحلي'],
      iraq: ['كحلي'],
      sudan: ['كحلي'],
      yemen: ['كحلي'],
    },
  },
  {
    canonical: 'فيروزي',
    english: 'turquoise',
    meta: { hex: '#40E0D0' },
    dialects: {
      msa: ['فيروزي', 'تركوازي'],
      egypt: ['فيروزي', 'تركوازي'],
      gulf: ['فيروزي', 'تركوازي'],
      levant: ['فيروزي'],
      maghreb: ['فيروزي'],
      iraq: ['فيروزي'],
      sudan: ['فيروزي'],
      yemen: ['فيروزي'],
    },
  },
  {
    canonical: 'زيتي',
    english: 'olive',
    meta: { hex: '#808000' },
    dialects: {
      msa: ['زيتي', 'أخضر زيتوني'],
      egypt: ['زيتي', 'زيتوني'],
      gulf: ['زيتي', 'زيتوني'],
      levant: ['زيتي', 'زيتوني'],
      maghreb: ['زيتي'],
      iraq: ['زيتي'],
      sudan: ['زيتي'],
      yemen: ['زيتي'],
    },
  },
  {
    canonical: 'خمري',
    english: 'burgundy',
    meta: { hex: '#800020' },
    dialects: {
      msa: ['خمري', 'عنابي', 'نبيتي'],
      egypt: ['خمري', 'نبيتي', 'عنابي'],
      gulf: ['خمري', 'نبيتي'],
      levant: ['خمري', 'عنابي'],
      maghreb: ['خمري'],
      iraq: ['خمري'],
      sudan: ['خمري'],
      yemen: ['خمري'],
    },
  },
  {
    canonical: 'بيج',
    english: 'beige',
    meta: { hex: '#F5F5DC' },
    dialects: {
      msa: ['بيج', 'عاجي'],
      egypt: ['بيج', 'عاجي', 'كريمي'],
      gulf: ['بيج', 'عاجي'],
      levant: ['بيج', 'عاجي'],
      maghreb: ['بيج'],
      iraq: ['بيج'],
      sudan: ['بيج'],
      yemen: ['بيج'],
    },
  },
  {
    canonical: 'فستقي',
    english: 'pistachio',
    meta: { hex: '#93C572' },
    dialects: {
      msa: ['فستقي'],
      egypt: ['فستقي', 'فستق'],
      gulf: ['فستقي'],
      levant: ['فستقي'],
      maghreb: ['فستقي'],
      iraq: ['فستقي'],
      sudan: ['فستقي'],
      yemen: ['فستقي'],
    },
  },
  {
    canonical: 'كريمي',
    english: 'cream',
    meta: { hex: '#FFFDD0' },
    dialects: {
      msa: ['كريمي', 'عاجي'],
      egypt: ['كريمي', 'عاجي'],
      gulf: ['كريمي'],
      levant: ['كريمي'],
      maghreb: ['كريمي'],
      iraq: ['كريمي'],
      sudan: ['كريمي'],
      yemen: ['كريمي'],
    },
  },
  {
    canonical: 'مارون',
    english: 'maroon',
    meta: { hex: '#800000' },
    dialects: {
      msa: ['مارون', 'عنابي', 'نبيتي'],
      egypt: ['مارون', 'عنابي', 'نبيتي'],
      gulf: ['مارون', 'نبيتي'],
      levant: ['مارون', 'عنابي'],
      maghreb: ['مارون'],
      iraq: ['مارون'],
      sudan: ['مارون'],
      yemen: ['مارون'],
    },
  },
  {
    canonical: 'كاكاوي',
    english: 'tan',
    meta: { hex: '#D2B48C' },
    dialects: {
      msa: ['كاكاوي', 'تاني'],
      egypt: ['كاكاوي', 'كاكاو'],
      gulf: ['كاكاوي'],
      levant: ['كاكاوي'],
      maghreb: ['كاكاوي'],
      iraq: ['كاكاوي'],
      sudan: ['كاكاوي'],
      yemen: ['كاكاوي'],
    },
  },
  {
    canonical: 'فحمي',
    english: 'charcoal',
    meta: { hex: '#36454F' },
    dialects: {
      msa: ['فحمي', 'فحمي'],
      egypt: ['فحمي', 'فحمي'],
      gulf: ['فحمي'],
      levant: ['فحمي'],
      maghreb: ['فحمي'],
      iraq: ['فحمي'],
      sudan: ['فحمي'],
      yemen: ['فحمي'],
    },
  },
  {
    canonical: 'صحراوي',
    english: 'desert',
    meta: { hex: '#EDC9AF' },
    dialects: {
      msa: ['صحراوي', 'رمالي'],
      egypt: ['صحراوي', 'رملي'],
      gulf: ['صحراوي', 'رملي'],
      levant: ['صحراوي', 'رملي'],
      maghreb: ['صحراوي'],
      iraq: ['صحراوي'],
      sudan: ['صحراوي'],
      yemen: ['صحراوي'],
    },
  },
  {
    canonical: 'نحاسي',
    english: 'copper',
    meta: { hex: '#B87333' },
    dialects: {
      msa: ['نحاسي'],
      egypt: ['نحاسي', 'نحاس'],
      gulf: ['نحاسي'],
      levant: ['نحاسي'],
      maghreb: ['نحاسي'],
      iraq: ['نحاسي'],
      sudan: ['نحاسي'],
      yemen: ['نحاسي'],
    },
  },
  {
    canonical: 'أوف وايت',
    english: 'off-white',
    meta: { hex: '#FAF0E6' },
    dialects: {
      msa: ['أوف وايت', 'أبيض مائل'],
      egypt: ['أوف وايت', 'أوف', 'نص أبيض'],
      gulf: ['أوف وايت'],
      levant: ['أوف وايت'],
      maghreb: ['أوف وايت'],
      iraq: ['أوف وايت'],
      sudan: ['أوف وايت'],
      yemen: ['أوف وايت'],
    },
  },
  {
    canonical: 'كحلي فاتح',
    english: 'light navy',
    meta: { hex: '#3B5998' },
    dialects: {
      msa: ['كحلي فاتح'],
      egypt: ['كحلي فاتح'],
      gulf: ['كحلي فاتح'],
      levant: ['كحلي فاتح'],
      maghreb: ['كحلي فاتح'],
      iraq: ['كحلي فاتح'],
      sudan: ['كحلي فاتح'],
      yemen: ['كحلي فاتح'],
    },
  },
]

// ─── SIZES ────────────────────────────────────────────────────────────
export const SIZES_CLOTHING: DictEntry[] = [
  {
    canonical: 'XS',
    english: 'extra small',
    meta: { type: 'clothing', numeric_eu: 32 },
    dialects: {
      msa: ['XS', 'س صغير', 'صغير جدا', 'إكس صغير'],
      egypt: ['XS', 'س صغير', 'صغير خالص'],
      gulf: ['XS', 'س صغير'],
      levant: ['XS', 'س صغير'],
      maghreb: ['XS'],
      iraq: ['XS'],
      sudan: ['XS'],
      yemen: ['XS'],
    },
  },
  {
    canonical: 'S',
    english: 'small',
    meta: { type: 'clothing', numeric_eu: 36 },
    dialects: {
      msa: ['S', 'س', 'صغير'],
      egypt: ['S', 'س', 'صغير'],
      gulf: ['S', 'س', 'صغير'],
      levant: ['S', 'س', 'صغير'],
      maghreb: ['S'],
      iraq: ['S'],
      sudan: ['S'],
      yemen: ['S'],
    },
  },
  {
    canonical: 'M',
    english: 'medium',
    meta: { type: 'clothing', numeric_eu: 40 },
    dialects: {
      msa: ['M', 'إم', 'وسط', 'متوسط'],
      egypt: ['M', 'إم', 'وسط', 'متوسط'],
      gulf: ['M', 'إم', 'وسط'],
      levant: ['M', 'إم', 'وسط'],
      maghreb: ['M'],
      iraq: ['M'],
      sudan: ['M'],
      yemen: ['M'],
    },
  },
  {
    canonical: 'L',
    english: 'large',
    meta: { type: 'clothing', numeric_eu: 42 },
    dialects: {
      msa: ['L', 'إل', 'كبير'],
      egypt: ['L', 'إل', 'كبير'],
      gulf: ['L', 'إل', 'كبير'],
      levant: ['L', 'إل', 'كبير'],
      maghreb: ['L'],
      iraq: ['L'],
      sudan: ['L'],
      yemen: ['L'],
    },
  },
  {
    canonical: 'XL',
    english: 'extra large',
    meta: { type: 'clothing', numeric_eu: 44 },
    dialects: {
      msa: ['XL', 'إكس إل', 'كبير جدا'],
      egypt: ['XL', 'إكس إل', 'كبير خالص'],
      gulf: ['XL', 'إكس إل'],
      levant: ['XL', 'إكس إل', 'كبير جدا'],
      maghreb: ['XL'],
      iraq: ['XL'],
      sudan: ['XL'],
      yemen: ['XL'],
    },
  },
  {
    canonical: 'XXL',
    english: '2x large',
    meta: { type: 'clothing', numeric_eu: 46 },
    dialects: {
      msa: ['XXL', 'إكس إكس إل', 'ضخم', '2XL'],
      egypt: ['XXL', 'إكس إكس إل', 'ضخم', '2XL'],
      gulf: ['XXL', '2XL'],
      levant: ['XXL', '2XL', 'ضخم'],
      maghreb: ['XXL'],
      iraq: ['XXL'],
      sudan: ['XXL'],
      yemen: ['XXL'],
    },
  },
  {
    canonical: '3XL',
    english: '3x large',
    meta: { type: 'clothing', numeric_eu: 48 },
    dialects: {
      msa: ['3XL', '3XL', 'ثري إكس إل', 'ضخم جدا'],
      egypt: ['3XL', 'ضخم جدا', '3XL'],
      gulf: ['3XL'],
      levant: ['3XL', 'ضخم جدا'],
      maghreb: ['3XL'],
      iraq: ['3XL'],
      sudan: ['3XL'],
      yemen: ['3XL'],
    },
  },
  // Numeric clothing sizes (EU standard, very common in Arabic fashion)
  ...[36, 38, 40, 42, 44, 46, 48].flatMap((n) => [
    {
      canonical: String(n),
      english: `EU ${n}`,
      meta: { type: 'clothing_eu' },
      dialects: {
        msa: [String(n), `${n} مقاس`, `مقاس ${n}`],
        egypt: [String(n), `مقاس ${n}`, `${n}`],
        gulf: [String(n), `مقاس ${n}`],
        levant: [String(n), `مقاس ${n}`, `رقم ${n}`],
        maghreb: [String(n), `مقاس ${n}`],
        iraq: [String(n), `مقاس ${n}`],
        sudan: [String(n), `مقاس ${n}`],
        yemen: [String(n), `مقاس ${n}`],
      },
    },
  ]),
]

export const SIZES_SHOES: DictEntry[] = [
  // Adult shoe sizes 35-46
  ...[35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46].map((n) => ({
    canonical: String(n),
    english: `EU ${n}`,
    meta: { type: 'shoe_eu' },
    dialects: {
      msa: [String(n), `مقاس ${n}`, `رقم ${n}`, `حذاء ${n}`],
      egypt: [String(n), `مقاس ${n}`, `رقم ${n}`, `كرتونة ${n}`],
      gulf: [String(n), `مقاس ${n}`, `رقم ${n}`],
      levant: [String(n), `مقاس ${n}`, `رقم ${n}`],
      maghreb: [String(n), `مقاس ${n}`, `بلاصة ${n}`],
      iraq: [String(n), `مقاس ${n}`, `رقم ${n}`],
      sudan: [String(n), `مقاس ${n}`],
      yemen: [String(n), `مقاس ${n}`],
    },
  })),
]

// ─── CLOTHING ITEMS (ملابس) ──────────────────────────────────────────
export const CLOTHING: DictEntry[] = [
  {
    canonical: 'قميص',
    english: 'shirt',
    dialects: {
      msa: ['قميص', 'قميص رجالي'],
      egypt: ['قميص', 'قميص رجالي', 'ياقة', 'هامبر'],
      gulf: ['قميص', 'دشداشة', 'ثوب'],
      levant: ['قميص', 'هامبر', 'قميص ياقة'],
      maghreb: ['قميص', 'قميج'],
      iraq: ['قميص', 'هامبر'],
      sudan: ['قميص', 'جلابية'],
      yemen: ['قميص', 'معوز'],
    },
  },
  {
    canonical: 'تيشيرت',
    english: 't-shirt',
    dialects: {
      msa: ['تيشيرت', 'تي-شيرت', 'فانيلة'],
      egypt: ['تيشيرت', 'فانلة', 'فانيلة', 'تي-شيرت'],
      gulf: ['تيشيرت', 'فانيلة'],
      levant: ['تيشيرت', 'فانيلة', 'فانلة'],
      maghreb: ['تيشيرت', 'تيشيرت'],
      iraq: ['تيشيرت', 'فانيلة'],
      sudan: ['تيشيرت', 'فانيلة'],
      yemen: ['تيشيرت', 'فانيلة'],
    },
  },
  {
    canonical: 'بنطلون',
    english: 'pants',
    dialects: {
      msa: ['بنطلون', 'بنطلون', 'سروال'],
      egypt: ['بنطلون', 'بنطلون', 'سروال', 'شورت'],
      gulf: ['بنطلون', 'سروال', 'بنطلون'],
      levant: ['بنطلون', 'سروال', 'بنطلون'],
      maghreb: ['بنطلون', 'سروال', 'سروال'],
      iraq: ['بنطلون', 'سروال'],
      sudan: ['بنطلون', 'سروال'],
      yemen: ['بنطلون', 'سروال', 'فوطة'],
    },
  },
  {
    canonical: 'جينز',
    english: 'jeans',
    dialects: {
      msa: ['جينز', 'بنطلون جينز'],
      egypt: ['جينز', 'بنطلون جينز'],
      gulf: ['جينز', 'جينز'],
      levant: ['جينز'],
      maghreb: ['جينز'],
      iraq: ['جينز'],
      sudan: ['جينز'],
      yemen: ['جينز'],
    },
  },
  {
    canonical: 'جاكيت',
    english: 'jacket',
    dialects: {
      msa: ['جاكيت', 'جاكيت', 'سترة'],
      egypt: ['جاكيت', 'جاكيت شتوي', 'كاب', 'بالطو'],
      gulf: ['جاكيت', 'كاب', 'عباية'],
      levant: ['جاكيت', 'كاب', 'سترة'],
      maghreb: ['جاكيت', 'كاب'],
      iraq: ['جاكيت', 'كاب'],
      sudan: ['جاكيت', 'كاب'],
      yemen: ['جاكيت', 'كاب'],
    },
  },
  {
    canonical: 'فستان',
    english: 'dress',
    dialects: {
      msa: ['فستان', 'ثوب نسائي'],
      egypt: ['فستان', 'فستان بناتي', 'جوب'],
      gulf: ['فستان', 'ثوب', 'عباية نسائية'],
      levant: ['فستان', 'فستان بناتي'],
      maghreb: ['فستان', 'قفطان'],
      iraq: ['فستان', 'جوب'],
      sudan: ['فستان', 'جوب'],
      yemen: ['فستان', 'جوب'],
    },
  },
  {
    canonical: 'عباية',
    english: 'abaya',
    dialects: {
      msa: ['عباية', 'عباية'],
      egypt: ['عباية', 'عباية بنات', 'جلابية بنات'],
      gulf: ['عباية', 'عباية', 'دشداشة نسائية'],
      levant: ['عباية', 'عباية'],
      maghreb: ['عباية', 'جلابة'],
      iraq: ['عباية'],
      sudan: ['عباية', 'جلابية'],
      yemen: ['عباية', 'بلغة'],
    },
  },
  {
    canonical: 'حجاب',
    english: 'hijab',
    dialects: {
      msa: ['حجاب', 'خمار'],
      egypt: ['حجاب', 'طرحة', 'خمار', 'إيشارب'],
      gulf: ['حجاب', 'شيلة', 'طرحة'],
      levant: ['حجاب', 'طرحة'],
      maghreb: ['حجاب', 'خمار'],
      iraq: ['حجاب', 'طرحة'],
      sudan: ['حجاب', 'طرحة'],
      yemen: ['حجاب', 'طرحة', 'نقاب'],
    },
  },
  {
    canonical: 'طرحة',
    english: 'headscarf',
    dialects: {
      msa: ['طرحة', 'حجاب'],
      egypt: ['طرحة', 'إيشارب'],
      gulf: ['طرحة', 'شيلة'],
      levant: ['طرحة'],
      maghreb: ['طرحة'],
      iraq: ['طرحة'],
      sudan: ['طرحة'],
      yemen: ['طرحة'],
    },
  },
  {
    canonical: 'بنطلون قصير',
    english: 'shorts',
    dialects: {
      msa: ['بنطلون قصير', 'شورت'],
      egypt: ['شورت', 'بنطلون قصير'],
      gulf: ['شورت', 'بنطلون قصير'],
      levant: ['شورت', 'بنطلون قصير'],
      maghreb: ['شورت', 'بنطلون قصير'],
      iraq: ['شورت'],
      sudan: ['شورت'],
      yemen: ['شورت'],
    },
  },
  {
    canonical: 'بليزر',
    english: 'blazer',
    dialects: {
      msa: ['بليزر', 'جاكيت رسمي'],
      egypt: ['بليزر', 'جاكيت رسمي'],
      gulf: ['بليزر'],
      levant: ['بليزر'],
      maghreb: ['بليزر'],
      iraq: ['بليزر'],
      sudan: ['بليزر'],
      yemen: ['بليزر'],
    },
  },
  {
    canonical: 'كارديجان',
    english: 'cardigan',
    dialects: {
      msa: ['كارديجان'],
      egypt: ['كارديجان', 'كارديجان'],
      gulf: ['كارديجان'],
      levant: ['كارديجان'],
      maghreb: ['كارديجان'],
      iraq: ['كارديجان'],
      sudan: ['كارديجان'],
      yemen: ['كارديجان'],
    },
  },
  {
    canonical: 'بيجامة',
    english: 'pajamas',
    dialects: {
      msa: ['بيجامة', 'ملابس نوم'],
      egypt: ['بيجامة', 'بيجامة', 'بنطلون نوم'],
      gulf: ['بيجامة'],
      levant: ['بيجامة'],
      maghreb: ['بيجامة'],
      iraq: ['بيجامة'],
      sudan: ['بيجامة'],
      yemen: ['بيجامة'],
    },
  },
  {
    canonical: 'لبس داخلي',
    english: 'underwear',
    dialects: {
      msa: ['ملابس داخلية', 'لباس داخلي'],
      egypt: ['لبس داخلي', 'لانجري', 'شورت داخلي'],
      gulf: ['لبس داخلي'],
      levant: ['لبس داخلي'],
      maghreb: ['لبس داخلي'],
      iraq: ['لبس داخلي'],
      sudan: ['لبس داخلي'],
      yemen: ['لبس داخلي'],
    },
  },
  {
    canonical: 'كرافتة',
    english: 'tie',
    dialects: {
      msa: ['كرافتة', 'ربطة عنق'],
      egypt: ['كرافتة', 'رباطة'],
      gulf: ['كرافتة'],
      levant: ['كرافتة'],
      maghreb: ['كرافتة'],
      iraq: ['كرافتة'],
      sudan: ['كرافتة'],
      yemen: ['كرافتة'],
    },
  },
  {
    canonical: 'بالطو',
    english: 'coat',
    dialects: {
      msa: ['بالطو', 'معطف'],
      egypt: ['بالطو', 'معطف'],
      gulf: ['بالطو', 'معطف'],
      levant: ['بالطو', 'معطف'],
      maghreb: ['بالطو', 'معطف'],
      iraq: ['بالطو', 'معطف'],
      sudan: ['بالطو', 'معطف'],
      yemen: ['بالطو', 'معطف'],
    },
  },
]

// ─── SHOES (أحذية) ──────────────────────────────────────────────────
export const SHOES: DictEntry[] = [
  {
    canonical: 'حذاء رياضي',
    english: 'sneakers',
    dialects: {
      msa: ['حذاء رياضي', 'حذاء جيم'],
      egypt: ['كوتشي', 'جزمة رياضي', 'سنيكر', 'بوتي رياضي'],
      gulf: ['كوتشي', 'سنيكرز', 'حذاء رياضي'],
      levant: ['كوتشي', 'صندل رياضي', 'سنيكرز'],
      maghreb: ['كوتشي', 'سبورت'],
      iraq: ['كوتشي', 'حذاء رياضي'],
      sudan: ['كوتشي', 'حذاء رياضي'],
      yemen: ['كوتشي', 'حذاء رياضي'],
    },
  },
  {
    canonical: 'صندل',
    english: 'sandals',
    dialects: {
      msa: ['صندل', 'نعال'],
      egypt: ['صندل', 'شبشب', 'صندلة'],
      gulf: ['صندل', 'شبشب', 'نعال'],
      levant: ['صندل', 'شبشب'],
      maghreb: ['صندل', 'سبندرة'],
      iraq: ['صندل', 'شبشب'],
      sudan: ['صندل', 'شبشب'],
      yemen: ['صندل', 'نعال'],
    },
  },
  {
    canonical: 'جزمة',
    english: 'boots',
    dialects: {
      msa: ['جزمة', 'حذاء عالي'],
      egypt: ['جزمة', 'بوت', 'بوتي'],
      gulf: ['جزمة', 'بوت'],
      levant: ['جزمة', 'بوت', 'صرماية'],
      maghreb: ['جزمة', 'بوت'],
      iraq: ['جزمة', 'بوت'],
      sudan: ['جزمة', 'بوت'],
      yemen: ['جزمة', 'بوت'],
    },
  },
  {
    canonical: 'كعب عالي',
    english: 'high heels',
    dialects: {
      msa: ['حذاء كعب عالي', 'كعب'],
      egypt: ['كعب', 'كعب عالي', 'استيلتو'],
      gulf: ['كعب', 'كعب عالي'],
      levant: ['كعب', 'كعب عالي'],
      maghreb: ['كعب', 'تالون'],
      iraq: ['كعب'],
      sudan: ['كعب'],
      yemen: ['كعب'],
    },
  },
  {
    canonical: 'حذاء مسطح',
    english: 'flats',
    dialects: {
      msa: ['حذاء مسطح', 'حذاء بدون كعب'],
      egypt: ['فلات', 'حذاء مسطح', 'بالي'],
      gulf: ['فلات', 'حذاء مسطح'],
      levant: ['فلات', 'حذاء مسطح'],
      maghreb: ['فلات'],
      iraq: ['فلات'],
      sudan: ['فلات'],
      yemen: ['فلات'],
    },
  },
  {
    canonical: 'شبشب',
    english: 'slippers',
    dialects: {
      msa: ['شبشب', 'نعال'],
      egypt: ['شبشب', 'شبشب حمام'],
      gulf: ['شبشب', 'نعال'],
      levant: ['شبشب', 'نعال'],
      maghreb: ['شبشب', 'نعل'],
      iraq: ['شبشب', 'نعال'],
      sudan: ['شبشب'],
      yemen: ['شبشب', 'نعال'],
    },
  },
  {
    canonical: 'حذاء كاجوال',
    english: 'casual shoes',
    dialects: {
      msa: ['حذاء كاجوال', 'حذاء يومي'],
      egypt: ['كاجوال', 'حذاء كاجوال'],
      gulf: ['كاجوال'],
      levant: ['كاجوال'],
      maghreb: ['كاجوال'],
      iraq: ['كاجوال'],
      sudan: ['كاجوال'],
      yemen: ['كاجوال'],
    },
  },
  {
    canonical: 'حذاء رسمي',
    english: 'formal shoes',
    dialects: {
      msa: ['حذاء رسمي', 'حذاء كلاسيك'],
      egypt: ['حذاء رسمي', 'كلاسيك'],
      gulf: ['حذاء رسمي', 'كلاسيك'],
      levant: ['حذاء رسمي', 'كلاسيك'],
      maghreb: ['حذاء رسمي'],
      iraq: ['حذاء رسمي'],
      sudan: ['حذاء رسمي'],
      yemen: ['حذاء رسمي'],
    },
  },
  {
    canonical: 'موكاسين',
    english: 'moccasins',
    dialects: {
      msa: ['موكاسين', 'حذاء جلدي'],
      egypt: ['موكاسين', 'لوفيرز'],
      gulf: ['موكاسين'],
      levant: ['موكاسين'],
      maghreb: ['موكاسين'],
      iraq: ['موكاسين'],
      sudan: ['موكاسين'],
      yemen: ['موكاسين'],
    },
  },
]

// ─── ELECTRONICS (موبايلات وكمبيوتر) ──────────────────────────────
export const ELECTRONICS_BRANDS: DictEntry[] = [
  {
    canonical: 'Apple',
    english: 'Apple',
    dialects: {
      msa: ['Apple', 'أبل', 'ابل', 'آبل'],
      egypt: ['Apple', 'أبل', 'ابل', 'آبل', 'أبل من'],
      gulf: ['Apple', 'أبل', 'ابل', 'آبل'],
      levant: ['Apple', 'أبل', 'ابل'],
      maghreb: ['Apple', 'أبل'],
      iraq: ['Apple', 'أبل'],
      sudan: ['Apple', 'أبل'],
      yemen: ['Apple', 'أبل'],
    },
  },
  {
    canonical: 'Samsung',
    english: 'Samsung',
    dialects: {
      msa: ['Samsung', 'سامسونج'],
      egypt: ['Samsung', 'سامسونج', 'سامسنج'],
      gulf: ['Samsung', 'سامسونج'],
      levant: ['Samsung', 'سامسونج'],
      maghreb: ['Samsung', 'سامسونج'],
      iraq: ['Samsung', 'سامسونج'],
      sudan: ['Samsung', 'سامسونج'],
      yemen: ['Samsung', 'سامسونج'],
    },
  },
  {
    canonical: 'Xiaomi',
    english: 'Xiaomi',
    dialects: {
      msa: ['Xiaomi', 'شاومي', 'شاومي', 'Xiaomi'],
      egypt: ['Xiaomi', 'شاومي', 'شاومي', 'شاومي'],
      gulf: ['Xiaomi', 'شاومي', 'شاومي'],
      levant: ['Xiaomi', 'شاومي'],
      maghreb: ['Xiaomi', 'شاومي'],
      iraq: ['Xiaomi', 'شاومي'],
      sudan: ['Xiaomi', 'شاومي'],
      yemen: ['Xiaomi', 'شاومي'],
    },
  },
  {
    canonical: 'Huawei',
    english: 'Huawei',
    dialects: {
      msa: ['Huawei', 'هواوي', 'هواوي'],
      egypt: ['Huawei', 'هواوي'],
      gulf: ['Huawei', 'هواوي'],
      levant: ['Huawei', 'هواوي'],
      maghreb: ['Huawei', 'هواوي'],
      iraq: ['Huawei', 'هواوي'],
      sudan: ['Huawei', 'هواوي'],
      yemen: ['Huawei', 'هواوي'],
    },
  },
  {
    canonical: 'OPPO',
    english: 'OPPO',
    dialects: {
      msa: ['OPPO', 'أوبو', 'أوپو'],
      egypt: ['OPPO', 'أوبو', 'أوپو'],
      gulf: ['OPPO', 'أوبو'],
      levant: ['OPPO', 'أوبو'],
      maghreb: ['OPPO', 'أوبو'],
      iraq: ['OPPO', 'أوبو'],
      sudan: ['OPPO', 'أوبو'],
      yemen: ['OPPO', 'أوبو'],
    },
  },
  {
    canonical: 'Realme',
    english: 'Realme',
    dialects: {
      msa: ['Realme', 'ريلمي'],
      egypt: ['Realme', 'ريلمي'],
      gulf: ['Realme', 'ريلمي'],
      levant: ['Realme', 'ريلمي'],
      maghreb: ['Realme', 'ريلمي'],
      iraq: ['Realme', 'ريلمي'],
      sudan: ['Realme', 'ريلمي'],
      yemen: ['Realme', 'ريلمي'],
    },
  },
  {
    canonical: 'OnePlus',
    english: 'OnePlus',
    dialects: {
      msa: ['OnePlus', 'وان بلس', '1+'],
      egypt: ['OnePlus', 'وان بلس'],
      gulf: ['OnePlus', 'وان بلس'],
      levant: ['OnePlus', 'وان بلس'],
      maghreb: ['OnePlus', 'وان بلس'],
      iraq: ['OnePlus', 'وان بلس'],
      sudan: ['OnePlus', 'وان بلس'],
      yemen: ['OnePlus', 'وان بلس'],
    },
  },
  {
    canonical: 'Honor',
    english: 'Honor',
    dialects: {
      msa: ['Honor', 'هونر', 'هونور'],
      egypt: ['Honor', 'هونر', 'هونور'],
      gulf: ['Honor', 'هونر'],
      levant: ['Honor', 'هونر'],
      maghreb: ['Honor', 'هونر'],
      iraq: ['Honor', 'هونر'],
      sudan: ['Honor', 'هونر'],
      yemen: ['Honor', 'هونر'],
    },
  },
  {
    canonical: 'Infinix',
    english: 'Infinix',
    dialects: {
      msa: ['Infinix', 'انفنكس', 'إنفينكس'],
      egypt: ['Infinix', 'انفنكس', 'إنفينكس'],
      gulf: ['Infinix', 'انفنكس'],
      levant: ['Infinix', 'انفنكس'],
      maghreb: ['Infinix', 'انفنكس'],
      iraq: ['Infinix', 'انفنكس'],
      sudan: ['Infinix', 'انفنكس'],
      yemen: ['Infinix', 'انفنكس'],
    },
  },
  {
    canonical: 'Tecno',
    english: 'Tecno',
    dialects: {
      msa: ['Tecno', 'تكنو', 'تيكنو'],
      egypt: ['Tecno', 'تكنو'],
      gulf: ['Tecno', 'تكنو'],
      levant: ['Tecno', 'تكنو'],
      maghreb: ['Tecno', 'تكنو'],
      iraq: ['Tecno', 'تكنو'],
      sudan: ['Tecno', 'تكنو'],
      yemen: ['Tecno', 'تكنو'],
    },
  },
  {
    canonical: 'Nokia',
    english: 'Nokia',
    dialects: {
      msa: ['Nokia', 'نوكيا'],
      egypt: ['Nokia', 'نوكيا'],
      gulf: ['Nokia', 'نوكيا'],
      levant: ['Nokia', 'نوكيا'],
      maghreb: ['Nokia', 'نوكيا'],
      iraq: ['Nokia', 'نوكيا'],
      sudan: ['Nokia', 'نوكيا'],
      yemen: ['Nokia', 'نوكيا'],
    },
  },
  {
    canonical: 'Sony',
    english: 'Sony',
    dialects: {
      msa: ['Sony', 'سوني'],
      egypt: ['Sony', 'سوني'],
      gulf: ['Sony', 'سوني'],
      levant: ['Sony', 'سوني'],
      maghreb: ['Sony', 'سوني'],
      iraq: ['Sony', 'سوني'],
      sudan: ['Sony', 'سوني'],
      yemen: ['Sony', 'سوني'],
    },
  },
  {
    canonical: 'Google Pixel',
    english: 'Google Pixel',
    dialects: {
      msa: ['Pixel', 'Google Pixel', 'بيكسل', 'جوجل بيكسل'],
      egypt: ['Pixel', 'بيكسل', 'جوجل بيكسل'],
      gulf: ['Pixel', 'بيكسل'],
      levant: ['Pixel', 'بيكسل'],
      maghreb: ['Pixel', 'بيكسل'],
      iraq: ['Pixel', 'بيكسل'],
      sudan: ['Pixel', 'بيكسل'],
      yemen: ['Pixel', 'بيكسل'],
    },
  },
  {
    canonical: 'Microsoft',
    english: 'Microsoft',
    dialects: {
      msa: ['Microsoft', 'مايكروسوفت'],
      egypt: ['Microsoft', 'مايكروسوفت'],
      gulf: ['Microsoft', 'مايكروسوفت'],
      levant: ['Microsoft', 'مايكروسوفت'],
      maghreb: ['Microsoft', 'مايكروسوفت'],
      iraq: ['Microsoft', 'مايكروسوفت'],
      sudan: ['Microsoft', 'مايكروسوفت'],
      yemen: ['Microsoft', 'مايكروسوفت'],
    },
  },
  {
    canonical: 'Dell',
    english: 'Dell',
    dialects: {
      msa: ['Dell', 'دل'],
      egypt: ['Dell', 'دل'],
      gulf: ['Dell', 'دل'],
      levant: ['Dell', 'دل'],
      maghreb: ['Dell', 'دل'],
      iraq: ['Dell', 'دل'],
      sudan: ['Dell', 'دل'],
      yemen: ['Dell', 'دل'],
    },
  },
  {
    canonical: 'HP',
    english: 'HP',
    dialects: {
      msa: ['HP', 'إتش بي', 'هيوليت باكارد'],
      egypt: ['HP', 'إتش بي'],
      gulf: ['HP', 'إتش بي'],
      levant: ['HP', 'إتش بي'],
      maghreb: ['HP'],
      iraq: ['HP', 'إتش بي'],
      sudan: ['HP'],
      yemen: ['HP'],
    },
  },
  {
    canonical: 'Lenovo',
    english: 'Lenovo',
    dialects: {
      msa: ['Lenovo', 'لينوفو'],
      egypt: ['Lenovo', 'لينوفو'],
      gulf: ['Lenovo', 'لينوفو'],
      levant: ['Lenovo', 'لينوفو'],
      maghreb: ['Lenovo', 'لينوفو'],
      iraq: ['Lenovo', 'لينوفو'],
      sudan: ['Lenovo', 'لينوفو'],
      yemen: ['Lenovo', 'لينوفو'],
    },
  },
  {
    canonical: 'Asus',
    english: 'Asus',
    dialects: {
      msa: ['Asus', 'أسوس'],
      egypt: ['Asus', 'أسوس'],
      gulf: ['Asus', 'أسوس'],
      levant: ['Asus', 'أسوس'],
      maghreb: ['Asus', 'أسوس'],
      iraq: ['Asus', 'أسوس'],
      sudan: ['Asus', 'أسوس'],
      yemen: ['Asus', 'أسوس'],
    },
  },
  {
    canonical: 'Acer',
    english: 'Acer',
    dialects: {
      msa: ['Acer', 'ايسر', 'أيسر'],
      egypt: ['Acer', 'ايسر', 'أيسر'],
      gulf: ['Acer', 'ايسر'],
      levant: ['Acer', 'ايسر'],
      maghreb: ['Acer', 'ايسر'],
      iraq: ['Acer', 'ايسر'],
      sudan: ['Acer', 'ايسر'],
      yemen: ['Acer', 'ايسر'],
    },
  },
]

// Popular device models (canonical entries)
export const ELECTRONICS_MODELS: DictEntry[] = [
  // ── iPhone models ──
  {
    canonical: 'iPhone 15 Pro Max',
    english: 'iPhone 15 Pro Max',
    dialects: {
      msa: ['iPhone 15 Pro Max', 'ايفون 15 برو ماكس', 'ايفون 15 برومكس'],
      egypt: ['ايفون 15 برو ماكس', 'ايفون 15 برومكس', '15 برو ماكس'],
      gulf: ['ايفون 15 برو ماكس', 'ايفون 15 برومكس'],
      levant: ['ايفون 15 برو ماكس'],
      maghreb: ['ايفون 15 برو ماكس'],
      iraq: ['ايفون 15 برو ماكس'],
      sudan: ['ايفون 15 برو ماكس'],
      yemen: ['ايفون 15 برو ماكس'],
    },
  },
  {
    canonical: 'iPhone 15 Pro',
    english: 'iPhone 15 Pro',
    dialects: {
      msa: ['iPhone 15 Pro', 'ايفون 15 برو'],
      egypt: ['ايفون 15 برو', '15 برو'],
      gulf: ['ايفون 15 برو'],
      levant: ['ايفون 15 برو'],
      maghreb: ['ايفون 15 برو'],
      iraq: ['ايفون 15 برو'],
      sudan: ['ايفون 15 برو'],
      yemen: ['ايفون 15 برو'],
    },
  },
  {
    canonical: 'iPhone 15',
    english: 'iPhone 15',
    dialects: {
      msa: ['iPhone 15', 'ايفون 15'],
      egypt: ['ايفون 15', '15'],
      gulf: ['ايفون 15'],
      levant: ['ايفون 15'],
      maghreb: ['ايفون 15'],
      iraq: ['ايفون 15'],
      sudan: ['ايفون 15'],
      yemen: ['ايفون 15'],
    },
  },
  {
    canonical: 'iPhone 14 Pro Max',
    english: 'iPhone 14 Pro Max',
    dialects: {
      msa: ['iPhone 14 Pro Max', 'ايفون 14 برو ماكس'],
      egypt: ['ايفون 14 برو ماكس', '14 برو ماكس'],
      gulf: ['ايفون 14 برو ماكس'],
      levant: ['ايفون 14 برو ماكس'],
      maghreb: ['ايفون 14 برو ماكس'],
      iraq: ['ايفون 14 برو ماكس'],
      sudan: ['ايفون 14 برو ماكس'],
      yemen: ['ايفون 14 برو ماكس'],
    },
  },
  {
    canonical: 'iPhone 14',
    english: 'iPhone 14',
    dialects: {
      msa: ['iPhone 14', 'ايفون 14'],
      egypt: ['ايفون 14', '14'],
      gulf: ['ايفون 14'],
      levant: ['ايفون 14'],
      maghreb: ['ايفون 14'],
      iraq: ['ايفون 14'],
      sudan: ['ايفون 14'],
      yemen: ['ايفون 14'],
    },
  },
  {
    canonical: 'iPhone 13',
    english: 'iPhone 13',
    dialects: {
      msa: ['iPhone 13', 'ايفون 13'],
      egypt: ['ايفون 13', '13'],
      gulf: ['ايفون 13'],
      levant: ['ايفون 13'],
      maghreb: ['ايفون 13'],
      iraq: ['ايفون 13'],
      sudan: ['ايفون 13'],
      yemen: ['ايفون 13'],
    },
  },
  {
    canonical: 'iPhone SE',
    english: 'iPhone SE',
    dialects: {
      msa: ['iPhone SE', 'ايفون SE', 'ايفون اس اي'],
      egypt: ['ايفون SE', 'ايفون اس اي'],
      gulf: ['ايفون SE'],
      levant: ['ايفون SE'],
      maghreb: ['ايفون SE'],
      iraq: ['ايفون SE'],
      sudan: ['ايفون SE'],
      yemen: ['ايفون SE'],
    },
  },
  // ── Samsung Galaxy models ──
  {
    canonical: 'Samsung Galaxy S24 Ultra',
    english: 'Samsung Galaxy S24 Ultra',
    dialects: {
      msa: ['Galaxy S24 Ultra', 'سامسونج S24 الترا', 'جالاكسي S24 الترا'],
      egypt: ['سامسونج S24 الترا', 'S24 الترا', 'جالاكسي S24 الترا'],
      gulf: ['سامسونج S24 الترا', 'S24 الترا'],
      levant: ['سامسونج S24 الترا'],
      maghreb: ['سامسونج S24 الترا'],
      iraq: ['سامسونج S24 الترا'],
      sudan: ['سامسونج S24 الترا'],
      yemen: ['سامسونج S24 الترا'],
    },
  },
  {
    canonical: 'Samsung Galaxy S24',
    english: 'Samsung Galaxy S24',
    dialects: {
      msa: ['Galaxy S24', 'سامسونج S24'],
      egypt: ['سامسونج S24', 'S24'],
      gulf: ['سامسونج S24'],
      levant: ['سامسونج S24'],
      maghreb: ['سامسونج S24'],
      iraq: ['سامسونج S24'],
      sudan: ['سامسونج S24'],
      yemen: ['سامسونج S24'],
    },
  },
  {
    canonical: 'Samsung Galaxy S23',
    english: 'Samsung Galaxy S23',
    dialects: {
      msa: ['Galaxy S23', 'سامسونج S23'],
      egypt: ['سامسونج S23', 'S23'],
      gulf: ['سامسونج S23'],
      levant: ['سامسونج S23'],
      maghreb: ['سامسونج S23'],
      iraq: ['سامسونج S23'],
      sudan: ['سامسونج S23'],
      yemen: ['سامسونج S23'],
    },
  },
  {
    canonical: 'Samsung Galaxy A54',
    english: 'Samsung Galaxy A54',
    dialects: {
      msa: ['Galaxy A54', 'سامسونج A54'],
      egypt: ['سامسونج A54', 'A54'],
      gulf: ['سامسونج A54'],
      levant: ['سامسونج A54'],
      maghreb: ['سامسونج A54'],
      iraq: ['سامسونج A54'],
      sudan: ['سامسونج A54'],
      yemen: ['سامسونج A54'],
    },
  },
  {
    canonical: 'Samsung Galaxy Note',
    english: 'Samsung Galaxy Note',
    dialects: {
      msa: ['Galaxy Note', 'سامسونج نوت'],
      egypt: ['سامسونج نوت', 'نوت'],
      gulf: ['سامسونج نوت'],
      levant: ['سامسونج نوت'],
      maghreb: ['سامسونج نوت'],
      iraq: ['سامسونج نوت'],
      sudan: ['سامسونج نوت'],
      yemen: ['سامسونج نوت'],
    },
  },
  // ── Xiaomi models ──
  {
    canonical: 'Xiaomi Redmi Note 12',
    english: 'Xiaomi Redmi Note 12',
    dialects: {
      msa: ['Redmi Note 12', 'شاومي ريدمي نوت 12'],
      egypt: ['ريدمي نوت 12', 'شاومي نوت 12', 'Redmi 12'],
      gulf: ['ريدمي نوت 12'],
      levant: ['ريدمي نوت 12'],
      maghreb: ['ريدمي نوت 12'],
      iraq: ['ريدمي نوت 12'],
      sudan: ['ريدمي نوت 12'],
      yemen: ['ريدمي نوت 12'],
    },
  },
  {
    canonical: 'Xiaomi Mi 13',
    english: 'Xiaomi Mi 13',
    dialects: {
      msa: ['Mi 13', 'شاومي Mi 13'],
      egypt: ['شاومي Mi 13', 'Mi 13'],
      gulf: ['Mi 13'],
      levant: ['Mi 13'],
      maghreb: ['Mi 13'],
      iraq: ['Mi 13'],
      sudan: ['Mi 13'],
      yemen: ['Mi 13'],
    },
  },
  {
    canonical: 'Xiaomi Poco X5',
    english: 'Xiaomi Poco X5',
    dialects: {
      msa: ['Poco X5', 'شاومي بوكو X5'],
      egypt: ['بوكو X5', 'شاومي بوكو'],
      gulf: ['بوكو X5'],
      levant: ['بوكو X5'],
      maghreb: ['بوكو X5'],
      iraq: ['بوكو X5'],
      sudan: ['بوكو X5'],
      yemen: ['بوكو X5'],
    },
  },
  // ── iPad / MacBook ──
  {
    canonical: 'iPad Pro',
    english: 'iPad Pro',
    dialects: {
      msa: ['iPad Pro', 'ايباد برو'],
      egypt: ['ايباد برو', 'ايباد'],
      gulf: ['ايباد برو'],
      levant: ['ايباد برو'],
      maghreb: ['ايباد برو'],
      iraq: ['ايباد برو'],
      sudan: ['ايباد برو'],
      yemen: ['ايباد برو'],
    },
  },
  {
    canonical: 'MacBook Pro',
    english: 'MacBook Pro',
    dialects: {
      msa: ['MacBook Pro', 'ماك بوك برو'],
      egypt: ['ماك بوك برو', 'ماك بوك'],
      gulf: ['ماك بوك برو'],
      levant: ['ماك بوك برو'],
      maghreb: ['ماك بوك برو'],
      iraq: ['ماك بوك برو'],
      sudan: ['ماك بوك برو'],
      yemen: ['ماك بوك برو'],
    },
  },
  {
    canonical: 'MacBook Air',
    english: 'MacBook Air',
    dialects: {
      msa: ['MacBook Air', 'ماك بوك اير'],
      egypt: ['ماك بوك اير'],
      gulf: ['ماك بوك اير'],
      levant: ['ماك بوك اير'],
      maghreb: ['ماك بوك اير'],
      iraq: ['ماك بوك اير'],
      sudan: ['ماك بوك اير'],
      yemen: ['ماك بوك اير'],
    },
  },
]

// ─── ACCESSORIES (اكسسوار) ──────────────────────────────────────────
export const ACCESSORIES: DictEntry[] = [
  {
    canonical: 'غطاء موبايل',
    english: 'phone case',
    dialects: {
      msa: ['غطاء موبايل', 'جراب موبايل', 'كفر موبايل'],
      egypt: ['كفر', 'جراب', 'كفر موبايل'],
      gulf: ['كفر', 'جراب', 'كفرة'],
      levant: ['كفر', 'جراب'],
      maghreb: ['كفر', 'جراب'],
      iraq: ['كفر', 'جراب'],
      sudan: ['كفر', 'جراب'],
      yemen: ['كفر', 'جراب'],
    },
  },
  {
    canonical: 'شاحن',
    english: 'charger',
    dialects: {
      msa: ['شاحن', 'شاحن موبايل'],
      egypt: ['شاحن', 'شارجر'],
      gulf: ['شاحن', 'شارجر'],
      levant: ['شاحن', 'شارجر'],
      maghreb: ['شاحن', 'شارجر'],
      iraq: ['شاحن', 'شارجر'],
      sudan: ['شاحن'],
      yemen: ['شاحن'],
    },
  },
  {
    canonical: 'سماعة',
    english: 'headphones',
    dialects: {
      msa: ['سماعة', 'سماعات'],
      egypt: ['سماعة', 'سماعات', 'هيدفون', 'ايربودز'],
      gulf: ['سماعة', 'هيدفون'],
      levant: ['سماعة', 'هيدفون'],
      maghreb: ['سماعة', 'كاسك'],
      iraq: ['سماعة', 'هيدفون'],
      sudan: ['سماعة'],
      yemen: ['سماعة'],
    },
  },
  {
    canonical: 'باور بانك',
    english: 'power bank',
    dialects: {
      msa: ['باور بانك', 'بطارية متنقلة'],
      egypt: ['باور بانك', 'باور'],
      gulf: ['باور بانك'],
      levant: ['باور بانك'],
      maghreb: ['باور بانك'],
      iraq: ['باور بانك'],
      sudan: ['باور بانك'],
      yemen: ['باور بانك'],
    },
  },
  {
    canonical: 'كابل شحن',
    english: 'charging cable',
    dialects: {
      msa: ['كابل شحن', 'وصلة شحن'],
      egypt: ['كابل', 'وصلة', 'شاحن سلك'],
      gulf: ['كابل', 'وصلة'],
      levant: ['كابل', 'وصلة'],
      maghreb: ['كابل', 'وصلة'],
      iraq: ['كابل', 'وصلة'],
      sudan: ['كابل', 'وصلة'],
      yemen: ['كابل', 'وصلة'],
    },
  },
  {
    canonical: 'شاشة حماية',
    english: 'screen protector',
    dialects: {
      msa: ['شاشة حماية', 'سكرين بروتكتور'],
      egypt: ['سكرين', 'حماية شاشة', 'ساكرين'],
      gulf: ['سكرين', 'حماية شاشة'],
      levant: ['سكرين', 'حماية شاشة'],
      maghreb: ['سكرين', 'حماية شاشة'],
      iraq: ['سكرين', 'حماية شاشة'],
      sudan: ['سكرين'],
      yemen: ['سكرين'],
    },
  },
]

// ─── LOOKUP FUNCTIONS ────────────────────────────────────────────────

/** All dictionaries combined for global lookup */
export const ALL_DICTIONARIES = {
  colors: COLORS,
  clothing_sizes: SIZES_CLOTHING,
  shoe_sizes: SIZES_SHOES,
  clothing: CLOTHING,
  shoes: SHOES,
  electronics_brands: ELECTRONICS_BRANDS,
  electronics_models: ELECTRONICS_MODELS,
  accessories: ACCESSORIES,
}

export type DictCategory = keyof typeof ALL_DICTIONARIES

/** Normalize an Arabic word by stripping diacritics + folding alif variants */
function normalizeArabic(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // Remove Arabic diacritics (harakat)
    .replace(/[\u064B-\u0652]/g, '')
    // Fold Alif variants: أ إ آ → ا
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    // Fold taa marbuta to haa (normalize ة → ه)
    .replace(/\u0629/g, '\u0647')
    // Fold yaa variants: ى → ي
    .replace(/\u0649/g, '\u064A')
    // Remove tatweel
    .replace(/\u0640/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── FUZZY MATCHING (Levenshtein + Arabic typo tolerance) ────────

/**
 * 🛡️ 2026-09-15 (v2): Fuzzy matching for spelling errors / missing letters.
 *
 * The user might write:
 *   - "كوتش" instead of "كوتشي" (missing ى at the end)
 *   - "قمص" instead of "قميص" (missing ي)
 *   - "اسودن" instead of "أسود" (extra ن at the end)
 *   - "بطلون" instead of "بنطلون" (missing ن)
 *   - "ايفون" instead of "ايفون 15" (incomplete)
 *
 * To handle this, we use Levenshtein distance with a dynamic threshold
 * based on word length, PLUS a list of common Arabic typo substitutions
 * that we apply before doing Levenshtein.
 */

/**
 * Compute Levenshtein distance between two strings.
 * Used to find "close enough" matches when exact match fails.
 *
 * Optimization: we use the two-row variant (only keep last 2 rows
 * in memory) for O(min(m,n)) space instead of O(m*n).
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  // Make sure `a` is the shorter one (less memory)
  if (m > n) return levenshtein(b, a)
  let prevRow = new Array(m + 1)
  let currRow = new Array(m + 1)
  for (let i = 0; i <= m; i++) prevRow[i] = i
  for (let j = 1; j <= n; j++) {
    currRow[0] = j
    const bChar = b.charCodeAt(j - 1)
    for (let i = 1; i <= m; i++) {
      const cost = a.charCodeAt(i - 1) === bChar ? 0 : 1
      currRow[i] = Math.min(
        prevRow[i] + 1,        // deletion
        currRow[i - 1] + 1,    // insertion
        prevRow[i - 1] + cost  // substitution
      )
    }
    ;[prevRow, currRow] = [currRow, prevRow]
  }
  return prevRow[m]
}

/**
 * Common Arabic typo substitutions. We apply these transformations
 * before doing Levenshtein so that common mistakes map to the same form.
 *
 * Each entry is [from_char, to_char] — we replace ALL occurrences.
 */
const ARABIC_TYPO_SUBSTITUTIONS: Array<[string, string]> = [
  // ة ↔ ه (taa marbuta vs haa) — already done in normalizeArabic but
  // repeated here in case the input bypasses normalization somehow.
  ['ة', 'ه'],
  // ى ↔ ي (alif maqsura vs yaa)
  ['ى', 'ي'],
  // أ إ آ ↔ ا (alif variants)
  ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'],
  // ؤ ↔ و (waw with hamza vs plain waw)
  ['ؤ', 'و'],
  // ئ ↔ ي (yaa with hamza vs plain yaa)
  ['ئ', 'ي'],
  // Common confusions:
  // ق ↔ غ (very common in Egyptian dialect)
  // (Don't apply globally — too aggressive. Instead, handle in substitutions.)
  // ت ↔ ث (often confused)
  // ذ ↔ ز (often confused)
  // ص ↔ س (often confused)
  // ض ↔ د (often confused)
  // ط ↔ ت (often confused)
  // ظ ↔ ز (often confused)
  // ح ↔ ه (often confused)
  // ع ↔ أ (often confused)
  // For these, we don't normalize — we let Levenshtein handle 1-char
  // substitutions.
]

/** Apply typo substitutions to a normalized word */
function applyTypoSubs(s: string): string {
  let result = s
  for (const [from, to] of ARABIC_TYPO_SUBSTITUTIONS) {
    result = result.split(from).join(to)
  }
  return result
}

/**
 * Compute a fuzzy match score between 0 and 1.
 *   1.0 = exact match
 *   0.8 = 1-char difference (Levenshtein=1)
 *   0.6 = 2-char difference (Levenshtein=2)
 *   < 0.5 = too different (rejected by default threshold)
 *
 * The threshold is dynamic — longer words allow more edits because
 * a 2-char typo in a 6-char word (33%) is more forgivable than a 2-char
 * typo in a 3-char word (67%).
 */
export function fuzzyScore(input: string, candidate: string): number {
  const a = applyTypoSubs(normalizeArabic(input))
  const b = applyTypoSubs(normalizeArabic(candidate))
  if (!a || !b) return 0
  if (a === b) return 1.0

  const distance = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  // Normalize distance to a 0-1 ratio (lower is better)
  const ratio = distance / maxLen
  // Score = 1 - ratio, but penalize longer-distance matches harder
  //   distance 0 → 1.0
  //   distance 1 → 0.8 (regardless of word length)
  //   distance 2 → 0.6
  //   distance 3 → 0.4 (rejected by default threshold of 0.6)
  if (distance === 0) return 1.0
  if (distance === 1) return 0.8
  if (distance === 2) return 0.6
  if (distance === 3) return 0.4
  return Math.max(0, 1 - ratio)
}

/**
 * Decide whether a fuzzy score is "good enough" to accept.
 * Default: ≥ 0.6 (i.e. Levenshtein ≤ 2).
 */
export function isFuzzyMatchAcceptable(score: number, threshold = 0.6): boolean {
  return score >= threshold
}

/**
 * Fuzzy match result — multiple candidates ranked by score.
 */
export interface FuzzyMatch {
  entry: DictEntry
  dialect: Dialect
  matched_synonym: string
  score: number
}

/**
 * Find fuzzy matches for a word across the entire dictionary.
 * Returns matches sorted by score (highest first).
 *
 * @param word The word the user typed
 * @param opts.maxResults Max number of results (default 5)
 * @param opts.threshold Minimum score to accept (default 0.6)
 */
export function fuzzyLookupWord(
  word: string,
  opts?: { maxResults?: number; threshold?: number }
): FuzzyMatch[] {
  const maxResults = opts?.maxResults ?? 5
  const threshold = opts?.threshold ?? 0.6
  const matches: FuzzyMatch[] = []

  for (const entries of Object.values(ALL_DICTIONARIES)) {
    for (const entry of entries) {
      for (const [dialect, synonyms] of Object.entries(entry.dialects)) {
        if (!synonyms) continue
        for (const synonym of synonyms) {
          const score = fuzzyScore(word, synonym)
          if (isFuzzyMatchAcceptable(score, threshold)) {
            matches.push({
              entry,
              dialect: dialect as Dialect,
              matched_synonym: synonym,
              score,
            })
          }
        }
      }
    }
  }

  // Sort by score (highest first), then by length (shorter synonyms first
  // to prefer the more common form)
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.matched_synonym.length - b.matched_synonym.length
  })

  return matches.slice(0, maxResults)
}

/** Match result for lookup */
export interface LookupResult {
  found: boolean
  /** True if matched via fuzzy fallback (Levenshtein ≤ 2), false if exact */
  fuzzy?: boolean
  /** Score 0..1 — 1.0 = exact, 0.8 = 1-char diff, 0.6 = 2-char diff */
  score?: number
  category?: DictCategory
  canonical?: string
  english?: string
  dialect?: Dialect
  meta?: Record<string, any>
  /** The original dialect word the user typed (echo back for UI) */
  input_word?: string
  raw_matches?: Array<{ entry: DictEntry; dialect: Dialect; matched: string }>
  /** Fuzzy fallback suggestions (when exact match fails) */
  suggestions?: Array<{
    canonical: string
    english?: string
    dialect: Dialect
    matched_synonym: string
    score: number
  }>
}

/**
 * Lookup a word in the dictionary. Tries all dialects of all entries
 * in all categories. Returns the canonical form if found.
 *
 * The lookup is dialect-agnostic — it doesn't matter which dialect the
 * user typed in, the function will find the canonical MSA form.
 *
 * 🛡️ 2026-09-15 (v2): Added fuzzy fallback for spelling errors / missing
 * letters. If exact match fails, we try Levenshtein distance ≤ 2 and
 * return the best match with `fuzzy: true` + `score: 0.6-0.8`.
 *
 * Examples of what's now handled:
 *   - "كوتش"  → matches "كوتشي" (missing ى) → canonical "حذاء رياضي"
 *   - "قمص"   → matches "قميص" (missing ي) → canonical "قميص"
 *   - "اسودن" → matches "أسود" (extra ن at end) → canonical "أسود"
 *   - "بطلون" → matches "بنطلون" (missing ن) → canonical "بنطلون"
 */
export function lookupArabicWord(word: string, opts?: { allowFuzzy?: boolean }): LookupResult {
  const normalizedInput = normalizeArabic(word)
  if (!normalizedInput) return { found: false, input_word: word }

  const allowFuzzy = opts?.allowFuzzy ?? true
  const matches: Array<{ entry: DictEntry; dialect: Dialect; matched: string }> = []

  for (const [, entries] of Object.entries(ALL_DICTIONARIES)) {
    for (const entry of entries) {
      for (const [dialect, synonyms] of Object.entries(entry.dialects)) {
        if (!synonyms) continue
        for (const synonym of synonyms) {
          if (normalizeArabic(synonym) === normalizedInput) {
            matches.push({
              entry,
              dialect: dialect as Dialect,
              matched: synonym,
            })
          }
        }
      }
    }
  }

  // Helper: find category for an entry canonical
  function findCategory(canonical: string): DictCategory | undefined {
    for (const [cat, entries] of Object.entries(ALL_DICTIONARIES)) {
      if (entries.some((e) => e.canonical === canonical)) {
        return cat as DictCategory
      }
    }
    return undefined
  }

  // ─── Exact match path ───
  if (matches.length > 0) {
    // Prefer MSA matches if any, otherwise take the first match
    const msaMatch = matches.find((m) => m.dialect === 'msa') ?? matches[0]
    return {
      found: true,
      fuzzy: false,
      score: 1.0,
      input_word: word,
      category: findCategory(msaMatch.entry.canonical),
      canonical: msaMatch.entry.canonical,
      english: msaMatch.entry.english,
      dialect: msaMatch.dialect,
      meta: msaMatch.entry.meta,
      raw_matches: matches,
    }
  }

  // ─── Fuzzy fallback path ───
  if (!allowFuzzy) return { found: false, input_word: word }

  const fuzzyMatches = fuzzyLookupWord(word, { maxResults: 5, threshold: 0.6 })
  if (fuzzyMatches.length === 0) {
    return { found: false, input_word: word }
  }

  const best = fuzzyMatches[0]
  return {
    found: true,
    fuzzy: true,
    score: best.score,
    input_word: word,
    category: findCategory(best.entry.canonical),
    canonical: best.entry.canonical,
    english: best.entry.english,
    dialect: best.dialect,
    meta: best.entry.meta,
    raw_matches: [{ entry: best.entry, dialect: best.dialect, matched: best.matched_synonym }],
    suggestions: fuzzyMatches.map((m) => ({
      canonical: m.entry.canonical,
      english: m.entry.english,
      dialect: m.dialect,
      matched_synonym: m.matched_synonym,
      score: m.score,
    })),
  }
}

/**
 * Build a context string for the AI assistant. This gets injected into the
 * LLM prompt so the model knows the dialect → canonical mapping.
 *
 * Format: "Colors: أسود (synonyms: اسود, إسود) | أحمر (synonyms: احمر, أحمر دم)"
 */
export function buildAIContext(opts?: {
  categories?: DictCategory[]
  maxLength?: number
}): string {
  const maxLength = opts?.maxLength ?? 8000
  const categories = opts?.categories ?? (Object.keys(ALL_DICTIONARIES) as DictCategory[])
  const lines: string[] = []
  let totalLen = 0

  for (const cat of categories) {
    const entries = ALL_DICTIONARIES[cat]
    if (!entries) continue
    lines.push(`\n── ${cat.toUpperCase()} ──`)
    for (const entry of entries) {
      const allSynonyms = new Set<string>()
      for (const syns of Object.values(entry.dialects)) {
        if (!syns) continue
        for (const s of syns) allSynonyms.add(s)
      }
      const line = `  ${entry.canonical}${entry.english ? ` (${entry.english})` : ''}: ${Array.from(allSynonyms).join(' | ')}`
      if (totalLen + line.length > maxLength) return lines.join('\n')
      lines.push(line)
      totalLen += line.length + 1
    }
  }

  return lines.join('\n')
}

/**
 * Extract product attributes from a natural-language Arabic description
 * by matching words against the dictionary. Returns the structured form.
 *
 * Example:
 *   Input: "حذاء رياضي كوتشي أسود مقاس 42"
 *   Output: {
 *     name: 'حذاء رياضي',
 *     color: 'أسود',
 *     size: '42',
 *     category: 'shoes',
 *   }
 */
export function extractAttributesFromText(text: string): {
  colors: string[]
  sizes: string[]
  clothing: string[]
  shoes: string[]
  electronics_brands: string[]
  electronics_models: string[]
  accessories: string[]
  raw_text: string
} {
  const result = {
    colors: [] as string[],
    sizes: [] as string[],
    clothing: [] as string[],
    shoes: [] as string[],
    electronics_brands: [] as string[],
    electronics_models: [] as string[],
    accessories: [] as string[],
    raw_text: text,
  }

  if (!text) return result

  // Split into words + small phrases (handle "مقاس 42" as one token)
  const tokens = text
    .replace(/[,\.\(\)\!]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  // Helper to check 1-token and 2-token phrases
  function checkPhrase(from: number, len: number): { found: boolean; canonical?: string; category?: DictCategory; consumed: number } {
    const phrase = tokens.slice(from, from + len).join(' ')
    if (!phrase) return { found: false, consumed: 0 }
    const lookup = lookupArabicWord(phrase)
    if (lookup.found) {
      // Find which category
      for (const [cat, entries] of Object.entries(ALL_DICTIONARIES)) {
        if (entries.some((e) => e.canonical === lookup.canonical)) {
          return { found: true, canonical: lookup.canonical, category: cat as DictCategory, consumed: len }
        }
      }
    }
    return { found: false, consumed: 0 }
  }

  for (let i = 0; i < tokens.length; ) {
    let matched = false
    // Try 3-token phrase first, then 2, then 1
    for (const len of [3, 2, 1]) {
      const res = checkPhrase(i, len)
      if (res.found && res.canonical && res.category) {
        switch (res.category) {
          case 'colors':
            if (!result.colors.includes(res.canonical)) result.colors.push(res.canonical)
            break
          case 'clothing_sizes':
          case 'shoe_sizes':
            if (!result.sizes.includes(res.canonical)) result.sizes.push(res.canonical)
            break
          case 'clothing':
            if (!result.clothing.includes(res.canonical)) result.clothing.push(res.canonical)
            break
          case 'shoes':
            if (!result.shoes.includes(res.canonical)) result.shoes.push(res.canonical)
            break
          case 'electronics_brands':
            if (!result.electronics_brands.includes(res.canonical)) result.electronics_brands.push(res.canonical)
            break
          case 'electronics_models':
            if (!result.electronics_models.includes(res.canonical)) result.electronics_models.push(res.canonical)
            break
          case 'accessories':
            if (!result.accessories.includes(res.canonical)) result.accessories.push(res.canonical)
            break
        }
        i += res.consumed
        matched = true
        break
      }
    }
    if (!matched) i++
  }

  return result
}

// ─── STATS (for debug/admin) ─────────────────────────────────────────
export const DICTIONARY_STATS = {
  total_entries: Object.values(ALL_DICTIONARIES).reduce((sum, arr) => sum + arr.length, 0),
  by_category: Object.fromEntries(
    Object.entries(ALL_DICTIONARIES).map(([cat, arr]) => [cat, arr.length])
  ) as Record<DictCategory, number>,
  dialects_covered: ['msa', 'egypt', 'gulf', 'levant', 'maghreb', 'iraq', 'sudan', 'yemen'] as Dialect[],
}
