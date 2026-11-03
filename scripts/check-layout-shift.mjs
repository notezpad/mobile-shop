#!/usr/bin/env node
/**
 * 🛡️ check-layout-shift.mjs — فاحص قفزات التخطيط (layout-shift) — 2026-11-03
 *
 * بيفحص كل ملفات src/‏ (.ts/.tsx) بحثًا عن الأنماط الخطيرة اللي بتعمل قفزات
 * عند السكرول أو عند تحميل البيانات، ويطبع file:line مع وصف عربي مختصر.
 *
 * القواعد:
 *  P1 — `if (loading) return null` / `if (isLoading) return null` أثناء التحميل
 *       (تحذير فقط — بعضها مشروع مثل بوابات الصلاحيات؛ ملفات src/app/api مستثناة).
 *  P2/P4 — بوابة عرض `{loading ? ...}` أو `{isLoading ? ...}` عليها Skeleton قريب
 *       بدون أي حارس تحميل (loadedOnce/hasLoaded/firstLoad/refreshing/silent/!data)
 *       في نفس الدالة/الملف → فشل (ده نمط «إخفاء المحتوى القديم في سكيليتون»
 *       اللي بيقفز الصفحة في كل تحديث خلفي من useDataRefresh).
 *       استثناء: محتوى Dialogs (Portal فوق الصفحة — مؤثرها محدود) → تحذير فقط.
 *  P3 — استخدام كلاس `cv-heavy` في أي .tsx → فشل (content-visibility بدون
 *       contain-intrinsic-size مقاس بدقة = قفزات عند السكرول في الأقسام الطويلة).
 *
 * التشغيل:  npm run check:layout      (أو: node scripts/check-layout-shift.mjs [dir])
 * الخروج:  0 = سليم، 1 = فيه مخالفات.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(process.argv[2] || 'src')

// 🔑 رموز الحماية المعتمدة في الريبو ضد «الرجوع للسكيليتون بعد أول تحميل»
const GUARD_RE = /(loadedOnce|hasLoaded|firstLoad|refreshing|silent|!data|!== null|=== null)/
// بوابة عرض ثالثية على حالة التحميل
const GATE_RE = /\{[^\n?]*\b(loading|isLoading)\b[^\n?]*\?/
// عنصر سكيليتون فعلي (مش ذكر بالاسم في تعليق)
const SKELETON_RE = /<Skeleton[\s>/]/
// P1: return null أثناء التحميل (بحث نصي خام)
const P1_RE = /if \((?:loading|isLoading)\) return null/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p)
  }
  return out
}

/** إزالة تعليقات JS تقريبًا (سطرية بدون :// وكتلية) عشان لا يُحسب الذكر في التعليق استخدامًا */
function stripComments(line) {
  return line
    .replace(/(^|[^:])\/\/.*$/, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

const fails = []
const warns = []

for (const file of walk(ROOT).sort()) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const joined = lines.join('\n')
  const isApi = file.split(path.sep).includes('api')

  // ── P1: return null أثناء التحميل — تحذير فقط (بوابات auth/صلاحيات مشروعة أحيانًا)
  lines.forEach((line, i) => {
    if (P1_RE.test(line)) {
      if (isApi) return // مسارات API مستثناة تمامًا
      warns.push(`P1  ${file}:${i + 1} — «return null أثناء التحميل»: لو الكارت/القسم ده أعلى الصفحة فده بيعمل pop-in وقفزة. لو بوابة صلاحيات/ميزة مشروعة بعد انتهاء التحميل فده مقبول.`)
    }
  })

  // ── P2/P4: بوابة {loading ?} + Skeleton قريب بدون حارس — فشل (يندمج المنطقان لتجنب التكرار)
  for (let i = 0; i < lines.length; i++) {
    if (!GATE_RE.test(lines[i])) continue
    let skeletonLine = -1
    for (let j = i + 1; j <= i + 6 && j < lines.length; j++) {
      if (SKELETON_RE.test(lines[j])) { skeletonLine = j; break }
    }
    if (skeletonLine < 0) continue
    let guarded = false
    for (let k = i; k <= skeletonLine; k++) if (GUARD_RE.test(lines[k])) guarded = true
    if (guarded || GUARD_RE.test(joined)) continue // فيه حارس تحميل في الملف — سليم
    if (/<DialogContent/.test(joined)) {
      warns.push(`P2  ${file}:${i + 1} — بوابة Skeleton داخل Dialog (Portal) — مؤثرها محدود، يُفضّل حارس loadedOnce للاتساق.`)
      continue
    }
    if (!/\bsetLoading\(true\)/.test(joined)) continue // مفيش تحميل ذاتي (مكوّن عرض/ويدجت صغير) — تجاهل
    fails.push(`P2  ${file}:${i + 1} — بوابة «{loading ? Skeleton}» بدون حارس (loadedOnce/hasLoaded/firstLoad/refreshing/silent/!data): أي تحديث خلفي هيطيّ المحتوى القديم في سكيليتون ويعيد بناءه = قفزة عنيفة. استخدم النمط: if (!loadedOnceRef.current) setLoading(true) وبوابة «!loadedOnceRef.current && loading».`)
  }

  // ── P3: cv-heavy في .tsx — فشل (بعد استبعاد الذكر داخل التعليقات)
  const stripped = lines.map(stripComments).join('\n')
  if (/cv-heavy/.test(stripped)) {
    const lineNo = lines.findIndex((l) => stripComments(l).includes('cv-heavy')) + 1
    fails.push(`P3  ${file}:${lineNo} — استخدام كلاس «cv-heavy» (content-visibility:auto): الارتفاع التقديري بيتبدل بالحقيقي عند الاقتراب = قفزات عند السكرول في الأقسام الطويلة. لا يُستخدم إلا على أقسام ارتفاعها المقاس مضبوط بـ contain-intrinsic-size.`)
  }
}

console.log('🛡️  فاحص قفزات التخطيط — check-layout-shift')
console.log(`    المجلد المفحوص: ${ROOT}`)
if (warns.length) {
  console.log('\n⚠️  تحذيرات (لا تُفشل البناء):')
  for (const w of warns) console.log('  ' + w)
}
if (fails.length) {
  console.log('\n❌ مخالفات (لازم تتصلح):')
  for (const f of fails) console.log('  ' + f)
  console.log(`\nالنتيجة: ${fails.length} مخالفة، ${warns.length} تحذير.`)
  process.exit(1)
}
console.log(`\n✅ سليم — لا توجد مخالفات (${warns.length} تحذير).`)
process.exit(0)
