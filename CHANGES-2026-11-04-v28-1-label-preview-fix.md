# إصلاح v28.1 — معاينة مصمم الملصقات كانت فاضية 🐞🎨

**التاريخ:** 2026-11-04
**النوع:** إصلاح عاجل (hotfix) على التحديث 27 — ملف واحد بس.
**العرَض:** أول ما تفتح «مصمم الملصقات»، المنطقة اليمين (الكانفس) تظهر فاضية —
مفيش ملصق أبيض ومفيش عناصر، مع إن كل الأزرار واللوحة الجانبية شغالين.

---

## السبب الجذري (مُثبت باختبار)

`LabelDesignerDialog.tsx` كان فيه hook اسمه `useStage` بيقيس الحاوية عشان
يحسب الـ scale بتاع المعاينة:

```tsx
React.useLayoutEffect(() => {
  const el = ref.current
  if (!el) return            // ← هنا المشكلة
  const ro = new ResizeObserver(...)
  ro.observe(el)
  return () => ro.disconnect()
}, [])                        // ← deps فاضية: مفيش تنفيذ تاني أبدًا
```

**تسلسل الخلل:**

1. الديالوج بيفتح → `design` لسه `null` → الكانفس (وداخله الحاوية المُقاسة) **مش لسه اتولد**.
2. `useLayoutEffect` بينفذ مرة واحدة في اللحظة دي → بيلاقي `ref` فاضي → **بيخرج من غير ما يوصل الـ ResizeObserver**.
3. بعدها `useEffect` بيحط التصميم الافتراضي → الحاوية بتتولد في DOM…
4. …بس الـ effect الـ deps بتاعته فاضية **مش هينفذ تاني** → الـ observer عمرو ما اتوصل.
5. النتيجة: `box` فضل `{0,0}` → `scale = 0` → الملصق عليه
   `visibility: scale ? 'visible' : 'hidden'` → **مخفي للأبد**.

**ليه دايلوج الطباعة شغال ومتأثرش؟** لأن `useFit` هناك بيقيس حاوية بتتولد من
أول commit (المعاينة بتترندر ببيانات جاهزة) — فنفس الكود «صدف» شغال هناك.
في المصمم الكانفس بيعتمد على state بتجهز بعد أول commit، فالنمط ده وقع.

## الإصلاح (ملف واحد: `src/components/shop/LabelDesignerDialog.tsx`)

تحويل الـ ref لـ **callback ref + state** — أول ما الحاوية تتركب فعليًا،
الـ hook يعرف ويوصل الـ observer في اللحظة الصح:

```tsx
function useStage(natW: number, natH: number, max = 3.5) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const [box, setBox] = React.useState({ w: 0, h: 0 })
  React.useEffect(() => {
    if (!node) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(node)
    return () => ro.disconnect()
  }, [node])                       // ← بينفذ أول ما الحاوية تولد
  const scale = box.w > 0 && box.h > 0 ? Math.min(max, box.w / natW, box.h / natH) : 0
  return { ref: setNode, scale }
}
```

مفيش أي تغيير في: التصميم الافتراضي، العناصر، القوالب، الطباعة، أو أي ملف تاني.

## التحقق (React + jsdom — إعادة تسلسل فتح الديالوج حرفيًا)

| | الـ observer اتوصل؟ | الملصق ظاهر؟ |
| --- | --- | --- |
| النسخة القديمة | ❌ لا أبدًا | ❌ `visibility:hidden` |
| النسخة المصلحة | ✅ | ✅ scale = 3.5 |

## النشر

```bash
# استبدال الملف:
#   src/components/shop/LabelDesignerDialog.tsx
next build
```

- **مفيش migration** — التغيير frontend فقط.
- لو قالب محفوظ عندك قديمًا هيفضل زي ما هو — المشكلة كانت عرض بس، الداتا سليمة.
