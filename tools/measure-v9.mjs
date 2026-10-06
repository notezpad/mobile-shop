/**
 * ⏱️ v9 PLAYWRIGHT MEASUREMENT — قبل/بعد
 * ─────────────────────────────────────────────────────────────────────
 * الجهاز المستهدف: iPhone 14 (390×664 @3x) + CPU throttle 6x
 * بيقيس:
 *   1) تحميل الصفحات الثقيلة (3 عينات لكل صفحة — الوسيط)
 *   2) فتح الديالوجات فوق الصفحات الثقيلة (3 عينات — الوسيط)
 *   3) عدد عقد الـ DOM لكل صفحة (بصمة الصفحة)
 * النتيجة: JSON على المسار اللي بيتمرر كأول argument.
 *
 * تشغيل:
 *   NODE_PATH=$(npm root -g) node measure-v9.mjs /tmp/baseline.json
 */
import { chromium, devices } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787'
const OUT = process.argv[2] ?? '/tmp/measure.json'
// دفعة صفحات محددة (مفصولة بفواصل) — لتقسيم القياس على أكثر من تشغيلة
const ONLY = (process.argv[3] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const SAMPLES = Number(process.argv[4] ?? 3)

const IPHONE14 = {
  ...devices['iPhone 14'],
  // devices['iPhone 14'] = 390x664 @3x, mobile Safari UA — Chromium يستخدم نفس الأبعاد
}

const PAGES = [
  { name: 'dashboard', path: '/dashboard', ready: 'text=آخر المبيعات' },
  { name: 'inventory', path: '/inventory', ready: 'text=قيمة البضاعة بسعر التكلفة' },
  { name: 'reports', path: '/reports', ready: 'text=إجمالي المبيعات' },
  { name: 'products', path: '/products', ready: 'text=منتج جديد' },
  { name: 'sales', path: '/sales', ready: 'text=سجل المبيعات' },
  { name: 'purchases', path: '/purchases', ready: 'text=المشتريات' },
  { name: 'expenses', path: '/expenses', ready: 'text=إجمالي المصروفات' },
  { name: 'cash', path: '/cash', ready: 'text=الخزنة' },
  { name: 'finance', path: '/finance', ready: 'text=المعاملات المالية' },
  { name: 'customers', path: '/customers', ready: 'text=العملاء' },
]

const DIALOGS = [
  { page: 'products', label: 'product-dialog', open: 'button:has-text("منتج جديد")', ready: '[data-slot="dialog-content"]' },
  { page: 'customers', label: 'customer-dialog', open: '[aria-label="عميل جديد"]', ready: '[data-slot="dialog-content"]' },
  { page: 'inventory', label: 'adjust-dialog', open: '[title="إضافة كمية (وارد)"]', ready: '[data-slot="dialog-content"]' },
]

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

// ⚡ CPU throttle بيتطبق per-target — لازم CDP session لكل صفحة جديدة
const newThrottledPage = async (context) => {
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await page.addInitScript(() => {
    window.localStorage.setItem('pwa-install-dismissed-at', String(Date.now()))
  })
  return page
}

async function login(context) {
  const page = await newThrottledPage(context)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('input[type="email"]', { timeout: 30000 })
  await page.fill('input[type="email"]', 'admin@demo.com')
  await page.fill('input[type="password"]', 'admin123')
  await Promise.all([
    page.waitForURL('**/dashboard**', { timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(1500)
  const ok = page.url().includes('dashboard')
  if (!ok) throw new Error('فشل تسجيل الدخول — ' + page.url())
  return page
}

async function measurePage(context, sess, p, samples = 3) {
  const times = []
  let domNodes = 0
  for (let i = 0; i < samples; i++) {
    const page = await newThrottledPage(context)
    // نقل الـ session (cookies بتتشارك على مستوى الـ context)
    const t0 = Date.now()
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForSelector(p.ready, { timeout: 45000 })
      await page.waitForTimeout(500)
      times.push(Date.now() - t0)
      if (i === samples - 1) domNodes = await page.evaluate(() => document.getElementsByTagName('*').length)
    } catch (e) {
      times.push(-1)
      console.error(`  ⚠️ ${p.name} sample ${i + 1} failed: ${String(e).slice(0, 120)}`)
    }
    await page.close()
  }
  return { name: p.name, medianMs: median(times.filter((t) => t > 0)), raw: times, domNodes }
}

async function measureDialog(context, sess, d, samples = 3) {
  const times = []
  for (let i = 0; i < samples; i++) {
    const page = await newThrottledPage(context)
    try {
      const p = PAGES.find((x) => x.name === d.page)
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForSelector(p.ready, { timeout: 60000 })
      // استنى الـ trigger نفسه يبقى visible (البيانات بتوصل بعد الـ ready text)
      await page.waitForSelector(`${d.open}:visible`, { timeout: 30000 })
      await page.waitForTimeout(400)
      const t0 = Date.now()
      await page.locator(`${d.open}:visible`).first().click({ timeout: 10000 })
      await page.waitForSelector(d.ready, { state: 'visible', timeout: 30000 })
      times.push(Date.now() - t0)
      // اقفل الديالوج عشان العينة الجاية تكون نضيفة
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
    } catch (e) {
      times.push(-1)
      console.error(`  ⚠️ dialog ${d.label} sample ${i + 1} failed: ${String(e).slice(0, 120)}`)
    }
    await page.close()
  }
  return { label: d.label, page: d.page, medianMs: median(times.filter((t) => t > 0)), raw: times }
}

const run = async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    ...IPHONE14,
    locale: 'ar-EG',
  })
  const sess = await login(context)
  await sess.close()

  const results = { meta: { base: BASE, device: 'iPhone 14 (390x664 @3x)', cpuThrottle: 6, samples: SAMPLES, only: ONLY, at: new Date().toISOString() }, pages: [], dialogs: [] }
  for (const p of PAGES) {
    if (ONLY.length && !ONLY.includes(p.name)) continue
    process.stdout.write(` measuring ${p.name}…`)
    const r = await measurePage(context, sess, p, SAMPLES)
    results.pages.push(r)
    console.log(` ${r.medianMs}ms (dom=${r.domNodes}) raw=${JSON.stringify(r.raw)}`)
  }
  for (const d of DIALOGS) {
    if (ONLY.length && !ONLY.includes(d.page) && !ONLY.includes('dialogs')) continue
    process.stdout.write(` dialog ${d.label}…`)
    const r = await measureDialog(context, sess, d, SAMPLES)
    results.dialogs.push(r)
    console.log(` ${r.medianMs}ms raw=${JSON.stringify(r.raw)}`)
  }
  await browser.close()
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(results, null, 2))
  console.log(`\n✅ saved → ${OUT}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
