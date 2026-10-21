/**
 * اختبارات تصليح قيم الإعدادات قبل الحفظ (لوحة الأدمن → حفظ الإعدادات).
 * التشغيل:  node --experimental-strip-types scripts/settings-normalize.test.mjs
 * لو الحفظ بيرفض "الرابط غير صالح" — الجاني هنا.
 */
import assert from 'node:assert/strict'
import { normalizeSetting, phoneToWaLink, urlHint } from '../src/lib/settings-normalize.ts'

// نفس فحص الرابط اللي في src/app/api/admin/settings/route.ts
const isHttpsUrl = (v) => { try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false } }

let n = 0
const eq = (got, want, what) => { assert.equal(got, want, `${what}\n  expected: ${want}\n  actual:   ${got}`); n++ }

// ── واتساب: رقم محلي (مصر) ──
eq(normalizeSetting('whatsappUrl', '01010328471'), 'https://wa.me/201010328471', 'رقم محلي بصفر')
eq(normalizeSetting('whatsappUrl', ' 010 103 28471 '), 'https://wa.me/201010328471', 'رقم بمسافات')
eq(normalizeSetting('whatsappUrl', '+20 101-032-8471'), 'https://wa.me/201010328471', 'رقم بكود الدولة')
eq(normalizeSetting('whatsappUrl', '201010328471'), 'https://wa.me/201010328471', 'رقم بدون +')
eq(normalizeSetting('whatsappUrl', '٠١٠١٠٣٢٨٤٧١'), 'https://wa.me/201010328471', 'أرقام عربية')
// ── واتساب: روابط ──
eq(normalizeSetting('whatsappUrl', 'https://wa.me/201010328471'), 'https://wa.me/201010328471', 'رابط سليم ما يتغيرش')
eq(normalizeSetting('whatsappUrl', 'wa.me/01010328471'), 'https://wa.me/201010328471', 'wa.me من غير https')
eq(normalizeSetting('whatsappUrl', 'https://wa.me/01010328471'), 'https://wa.me/201010328471', 'wa.me برقم محلي')
eq(normalizeSetting('whatsappUrl', ''), '', 'فاضل يفضل فاضي')
// ── باقي الروابط ──
eq(normalizeSetting('facebookUrl', 'facebook.com/nezampos'), 'https://facebook.com/nezampos', 'فيسبوك من غير https')
eq(normalizeSetting('websiteUrl', '//nezampos.com'), 'https://nezampos.com', 'بروتوكول ناقص')
eq(normalizeSetting('instagramUrl', 'https://instagram.com/nezampos'), 'https://instagram.com/nezampos', 'رابط سليم ما يتغيرش')
// ── أرقام الدعم ──
eq(normalizeSetting('supportPhone', '+20 101 032 8471'), '+20 101 032 8471', 'رقم الدعم ما يتغيرش')
eq(normalizeSetting('subscriptionGraceDays', '٧'), '7', 'أيام سماح بأرقام عربية')
// ── نص عادي ──
eq(normalizeSetting('platformName', '  نظام المحل  '), 'نظام المحل', 'اسم المنصة يتقصّ منه الفراغ')

// ── القاعدة الأساسية: أي رابط بعد التصليح لازم ينجح في فحص الحفظ ──
for (const [key, raw] of [
  ['whatsappUrl', '01010328471'], ['whatsappUrl', 'wa.me/01010328471'],
  ['facebookUrl', 'facebook.com/nezampos'], ['websiteUrl', 'nezampos.com'],
]) {
  const fixed = normalizeSetting(key, raw)
  assert.ok(isHttpsUrl(fixed), `${key}="${raw}" → "${fixed}" لسه مرفوض من الحفظ`)
  n++
}

// ── قيمة مش قابلة للتصليح: تفضل مرفوضة، والرسالة توضح المطلوب ──
eq(isHttpsUrl(normalizeSetting('whatsappUrl', 'ليس رابطا')), false, 'نص مش رابط لازم يفضل مرفوض')
assert.ok(urlHint('whatsappUrl').includes('wa.me'), 'رسالة واتساب توضح المطلوب')
n++

// ── phoneToWaLink: أرقام قصيرة/غريبة ما تتحولش ──
eq(phoneToWaLink('123'), null, 'رقم قصير جدًا مش رقم')
eq(phoneToWaLink('https://wa.me/201010328471'), null, 'رابط كامل مش رقم')
n += 2

console.log(`settings-normalize: ${n} assertions passed`)
