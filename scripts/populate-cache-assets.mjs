#!/usr/bin/env node
/**
 * ⚡ v11 (2026-10-06) — بديل `opennextjs-cloudflare populateCache local`
 * لما الكونفيج بيستخدم staticAssetsIncrementalCache.
 *
 * ليه السكربت ده موجود؟ أمر opennextjs الرسمي بيحاول يقلع platform proxy
 * وبتاع Hyperdrive محتاج Postgres محلي حتى للنسخ اللي مش محتاجاه — فبنعمل
 * نفس الشغل يدويًا: نسخ `.open-next/cache/**` جوا `.open-next/assets/cdn-cgi/_next_cache/`
 * (نفس ما بتعمله populateStaticAssetsIncrementalCache في الحزمة الرسمية —
 * راجع node_modules/@opennextjs/cloudflare/dist/cli/commands/populate-cache.js).
 *
 * النتيجة: الصفحات المعروفة مسبقًا (prerendered) بتتقري وقت التشغيل من
 * Workers Static Assets بدل React SSR جوا الـ Worker — ده اللي بيقضي على
 * Error 1102 على الخطة المجانية (10ms CPU).
 *
 * الاستخدام:  node scripts/populate-cache-assets.mjs   (بعد cf:build)
 */
import { cpSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = '.open-next'
const cacheDir = join(outputDir, 'cache')
const assetsCacheDir = join(outputDir, 'assets', 'cdn-cgi', '_next_cache')

if (!existsSync(cacheDir)) {
  console.error('❌ .open-next/cache not found — run `bun run cf:build` first')
  process.exit(1)
}

// نفس سلوك cpSync الرسمي: بيندمج فوق القديم. هنمسح الأول عشان ما تفضلش
// بقايا كاش من build قديم بـ buildId مختلف (نظافة أكتر من اللازم لكن آمنة)
rmSync(assetsCacheDir, { recursive: true, force: true })
cpSync(cacheDir, assetsCacheDir, { recursive: true })

function countFiles(dir) {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1
  }
  return n
}

// 🛡️ v12: فحص صحة — لازم نلاقي ملفات كاش صفحات (*.cache جوا route-cache).
// لو عددهم قليل جداً يبقى فيه حاجة غلط في البناء (زي ما حصل في جلسة v11
// لما deploy اتعمل من غير populate خالص → 503 على الموقع كله).
// ملاحظة: المسار بيتوسطه buildId متغير (.open-next/assets/cdn-cgi/_next_cache/
// <buildId>/route-cache/APP_PAGE/...) فبنعدّ ملفات .cache بشكل تكراري.
let pageCacheCount = 0
function countPageCaches(dir) {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countPageCaches(join(dir, e.name))
    else if (e.name.endsWith('.cache')) n += 1
  }
  return n
}
const routeCacheRoot = assetsCacheDir
if (existsSync(routeCacheRoot)) {
  pageCacheCount = countPageCaches(routeCacheRoot)
}

console.log(`✅ Populated static assets cache: ${assetsCacheDir}`)
console.log(`   ${countFiles(assetsCacheDir)} cache files copied from .open-next/cache`)
console.log(`   ${pageCacheCount} prerendered page cache files (APP_PAGE)`)
if (pageCacheCount < 20) {
  console.warn(
    `⚠️  تحذير: عدد ملفات كاش الصفحات قليل (${pageCacheCount} < 20)!` +
      `\n   المتوقع ~36 صفحة. راجع نتيجة cf:build قبل الـ deploy —` +
      `\n   deploy من غير كاش الصفحات بيرجّع كل صفحة لـ SSR كامل → Error 1102.`
  )
}
console.log('   Next step: wrangler deploy')
