# تدقيق شامل للستايل والألوان (الوضع الليلي + النهاري)

## الأخطاء المكتشفة (5 أخطاء)

### 1. شريط التمرير (Scrollbar) — مفيش dark mode ❌
الـ scrollbar كان يستخدم ألوان `oklch` ثابتة للوضع النهاري فقط. في الوضع الليلي، الـ scrollbar بيدمج مع الخلفية الداكنة ويكاد يكون غير مرئي.

**الإصلاح**: أضفت `.dark html` + `.dark *:hover` overrides بألوان أفتح:
```css
.dark html { scrollbar-color: oklch(0.74 0.16 162 / 0.5) transparent; }
.dark *:hover { scrollbar-color: oklch(0.74 0.16 162 / 0.35) transparent; }
```

### 2. فوتر لوحة الأدمن — `bg-white` ثابت ❌
```tsx
// قبل: bg-white ثابت — يبقى أبيض حتى في الوضع الليلي
<footer className="...bg-white px-4 py-3...">

// بعد: bg-background — يتكيف مع الـ theme
<footer className="...bg-background px-4 py-3...">
```

### 3. PurchaseOrderDialog — `bg-white` ثابت ❌
```tsx
// قبل
className="border-info-subtle bg-white hover:bg-info-subtle"
// بعد
className="border-info-subtle bg-background hover:bg-info-subtle"
```

### 4. focus-visible في الوضع الليلي — ring ضعيف ❌
الـ focus ring كان يستخدم `var(--ring)` بس — في الوضع الليلي كان ضعيف جداً وصعب تشوفه.

**الإصلاح**:
```css
.dark :focus-visible {
  box-shadow: 0 0 0 2px var(--background), 0 0 0 3px oklch(0.74 0.16 162 / 0.6);
}
```

### 5. ::selection في الوضع الليلي ❌
لون تحديد النص ما كانش متكيّف مع الوضع الليلي.

**الإصلاح**:
```css
.dark ::selection {
  background: oklch(0.74 0.16 162 / 0.30);
  color: var(--foreground);
}
```

## ما هو ممتاز بالفعل (ما يحتاج إبقاء)

| العنصر | الحالة |
|------|------|
| **Color tokens** | ✅ ممتاز — light/dark منفصلين تماماً |
| **Dark mode backgrounds** | ✅ محايد (zinc-based) — مش أخضر |
| **Primary in dark** | ✅ emerald أفتح (0.74) للتباين |
| **Status colors** | ✅ light/dark منفصلين (success/warning/danger/info) |
| **Chart palette** | ✅ ألوان زاهية للـ dark |
| **Sidebar** | ✅ محايد في dark، أخضر خفيف في light |
| **Border tokens** | ✅ transparent في dark |
| **Shadow tokens** | ✅ يعمل في كلا الوضعين |
| **RTL support** | ✅ direction: rtl + text-align: start |
| **Font (Cairo)** | ✅ عربي + لاتيني |
| **Radius scale** | ✅ 7 مستويات |
| **Motion tokens** | ✅ spring/out/in-out easing |

## الملفات (6 ملفات)

| الملف | التغيير |
|------|------|
| `src/app/globals.css` | ⭐ scrollbar dark + focus dark + selection dark |
| `src/components/admin/SuperAdminApp.tsx` | ⭐ footer bg-white → bg-background |
| `src/components/shop/PurchaseOrderDialog.tsx` | ⭐ bg-white → bg-background |
| `src/app/(shop)/layout.tsx` | ✅ (header bg-white/60 → bg-background/60) |
| `src/components/shop/OfflineIndicator.tsx` | ✅ |
| `src/components/shop/ThemeToggle.tsx` | ✅ |

## خطوات التطبيق

انسخ الـ 6 ملفات فوق الملفات الأصلية و `npm run dev`

الحزمة: `/home/z/my-project/download/shop_erp_style_audit.zip`
