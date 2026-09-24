# 🛡️ Arabic AI Dictionary — قاعدة بيانات عربية شاملة

قاعدة بيانات شاملة من الألوان والمقاسات والمنتجات بـ اللهجات العربية المختلفة،
مصممة لاستخدامها مع الـ AI assistant في الـ ProductDialog.

## الـ Categories المتاحة

| Category | الوصف | عدد المدخلات |
|----------|------|--------------|
| `colors` | ألوان (أسود، أبيض، أحمر، إلخ) | 27 |
| `clothing_sizes` | مقاسات ملابس (XS, S, M, L, XL, XXL, 3XL, EU 36-48) | 14 |
| `shoe_sizes` | مقاسات أحذية (EU 35-46) | 12 |
| `clothing` | ملابس (قميص، بنطلون، عباية، فستان، إلخ) | 16 |
| `shoes` | أحذية (كوتشي، صندل، جزمة، إلخ) | 9 |
| `electronics_brands` | علامات موبايلات و كمبيوتر | 19 |
| `electronics_models` | موديلات (iPhone 15, Galaxy S24, إلخ) | 18 |
| `accessories` | اكسسوار (كفر، شاحن، سماعة، إلخ) | 6 |
| **Total** | | **121** |

## اللهجات العربية المدعومة

| Code | اللهجة | الدول |
|------|------|------|
| `msa` | الفصحى | (مرجع) |
| `egypt` | مصرية | مصر |
| `gulf` | خليجية | السعودية، الإمارات، الكويت، قطر، البحرين، عمان |
| `levant` | شامية | سوريا، لبنان، الأردن، فلسطين |
| `maghreb` | مغربية | المغرب، الجزائر، تونس، ليبيا، موريتانيا |
| `iraq` | عراقية | العراق |
| `sudan` | سودانية | السودان |
| `yemen` | يمنية | اليمن |

## الـ API Endpoints

### 1. GET /api/ai/dictionary

يرجع القاموس كامل (أو فئة محددة).

```bash
# كل القاموس
curl http://localhost:3000/api/ai/dictionary

# فئة محددة فقط (الألوان)
curl 'http://localhost:3000/api/ai/dictionary?category=colors'

# صيغة compact (canonical + english فقط)
curl 'http://localhost:3000/api/ai/dictionary?format=compact'
```

### 2. POST /api/ai/dictionary

يـ lookup كلمة واحدة.

```bash
curl -X POST http://localhost:3000/api/ai/dictionary \
  -H 'Content-Type: application/json' \
  -d '{"word":"كوتشي"}'
```

Response:
```json
{
  "ok": true,
  "found": true,
  "word": "كوتشي",
  "canonical": "حذاء رياضي",
  "category": "shoes",
  "dialect": "egypt",
  "english": "sneakers"
}
```

### 3. POST /api/ai/normalize

يستخرج كل الـ attributes من نص عربي طبيعي.

```bash
curl -X POST http://localhost:3000/api/ai/normalize \
  -H 'Content-Type: application/json' \
  -d '{"text":"كوتشي أسود مقاس 42"}'
```

Response:
```json
{
  "ok": true,
  "raw_text": "كوتشي أسود مقاس 42",
  "extracted": {
    "colors": ["أسود"],
    "sizes": ["42"],
    "shoes": ["حذاء رياضي"],
    "clothing": [],
    "electronics_brands": [],
    "electronics_models": [],
    "accessories": []
  },
  "suggested_name": "حذاء رياضي أسود مقاس 42",
  "confidence": 0.75
}
```

### 4. GET /api/ai/context

يرجع القاموس كنص واحد مناسب لـ LLM prompt injection.

```bash
curl 'http://localhost:3000/api/ai/context?categories=colors,shoes&maxLength=3000'
```

Response:
```
── COLORS ──
  أسود (black): أسود | اسود | إسود | كحلي | أسودون | كحل
  ...
── SHOES ──
  حذاء رياضي (sneakers): حذاء رياضي | حذاء جيم | كوتشي | جزمة رياضي | سنيكر | ...
```

## الـ normalization

الـ lookup function بـ يعمل normalization للنص العربي قبل المطابقة:

1. **Remove harakat** (diacritics): أَسْوَد → اسود
2. **Fold alif variants**: أ → ا، إ → ا، آ → ا
3. **Fold taa marbuta**: ة → ه
4. **Fold yaa variants**: ى → ي
5. **Remove tatweel**: ـ (kashida)
6. **Lowercase + trim + collapse whitespace**

ده بيخلي الـ lookup يتعامل مع أي صيغة بيكتبها المستخدم (مع أو بدون تشكيل، مع أو بدون همزة).

## كيفية التكامل مع الـ AI Assistant

لو عندك AI assistant شغال بـ LLM (زي GPT-4 أو Claude)، تقدر تستخدم القاموس بـ 3 طرق:

### الطريقة 1: Pre-validation (الأسرع)

قبل ما تبعت النص للـ LLM، اعمل `/api/ai/normalize`. لو الـ confidence > 0.7، اعتمد على الـ output مباشرة بدون LLM.

```typescript
const norm = await fetch('/api/ai/normalize', {
  method: 'POST',
  body: JSON.stringify({ text: userInput }),
}).then(r => r.json())

if (norm.confidence > 0.7) {
  // اعتمد على الـ extracted attributes مباشرة
  return norm.suggested_name
}
// غير كده، وقّع للـ LLM
```

### الطريقة 2: Context injection (الأدق)

جيب الـ dictionary context من `/api/ai/context` و حقنه في الـ LLM prompt:

```typescript
const ctx = await fetch('/api/ai/context?maxLength=5000').then(r => r.json())

const prompt = `
أنت مساعد ذكاء اصطناعي لـ ERP عربي. استخرج بيانات المنتج من نص المستخدم.

قاموس اللهجات العربية:
${ctx.context}

نص المستخدم: "${userInput}"

أرجع JSON بالشكل ده:
{
  "name": "...",
  "color": "...",
  "size": "...",
  "category": "clothing|shoes|electronics|accessories"
}
`
```

### الطريقة 3: Post-validation (آمن)

بعد ما الـ LLM يرجّع JSON، اعمل `/api/ai/dictionary` lookup لكل كلمة في الـ JSON.
لو الـ LLM رجّع "كوتشي"، اعمل lookup → هيرجع "حذاء رياضي" → خزّن الـ canonical.

## الإضافة للقاموس

لو حابب تضيف كلمة جديدة، افتح `src/lib/arabic-dictionary.ts` و اضيفها في الـ entry المناسب.

مثلاً، لو حابب تضيف لون جديد:

```typescript
{
  canonical: 'فوشيا',
  english: 'fuchsia',
  meta: { hex: '#FF00FF' },
  dialects: {
    msa: ['فوشيا', 'فوشيا'],
    egypt: ['فوشيا', 'فوشيا'],
    gulf: ['فوشيا'],
    levant: ['فوشيا'],
    maghreb: ['فوشيا'],
    iraq: ['فوشيا'],
    sudan: ['فوشيا'],
    yemen: ['فوشيا'],
  },
},
```

ثم شغّل الـ tests:

```bash
bun run /tmp/test-dictionary.mjs
```
