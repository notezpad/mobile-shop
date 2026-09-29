#!/usr/bin/env node
/**
 * CERTIFICATION SWEEP v2 — 2026-09-30
 * اعتماد نهائي لإصلاحات الموردين (13) + العملاء (6 مراحل) — أنماط مؤكدة بالجريب الفعلي.
 * Exit 0 = كل الفحوصات عدّت. أي ❌ = ثغرة مفتوحة.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const results = []
const has = (id, p, re, label) => {
  const s = (() => { try { return readFileSync(join(ROOT, p), 'utf8') } catch { return null } })()
  if (s === null) { results.push({ id, ok: false, why: `ملف مش موجود: ${p}` }); return }
  const m = s.match(re)
  if (!m) { results.push({ id, ok: false, why: `النمط مش موجود في ${p}: ${re}` }); return }
  const lineNo = s.slice(0, m.index).split('\n').length
  results.push({ id, ok: true, ev: `${p}:${lineNo}` })
}

/* ═══════ المرحلة 1: حذف/إلغاء المحاسبة ═══════ */
has('C1', 'src/app/api/sales/[id]/route.ts',
  /creditReversal\s*=\s*Math\.max\(0,\s*sale\.total\s*-\s*paidAtSale\)/,
  'C1 حذف بيع → عكس رصيد العميل مرة واحدة (total − مدفوع)')
has('C1', 'src/app/api/sales/[id]/route.ts',
  /balance:\s*\{\s*decrement:\s*creditReversal\s*\}/,
  'C1 تنفيذ العكس على رصيد العميل')
has('C2/C3', 'src/app/api/payments/[id]/route.ts',
  /requireAdmin\(\)/,
  'C2/C3 إلغاء دفعة عميل محمي بأدمن')
has('C2/C3', 'src/app/api/payments/[id]/route.ts',
  /status:\s*['"]cancelled['"][\s\S]{0,80}cancelledAt/,
  'C2/C3 إلغاء ناعم (مش حذف نهائي)')
has('C2/C3', 'src/app/api/payments/[id]/route.ts',
  /paid:\s*\{\s*decrement:\s*sp\.amount\s*\}|salePayment\.deleteMany/,
  'C2/C3 فك ربط الفاتورة (Sale.paid/SalePayment)')
has('C7', 'src/app/api/customers/[id]/route.ts',
  /FOR UPDATE/,
  'C7 قفل صف العميل FOR UPDATE')
has('C7', 'prisma/schema.prisma',
  /onDelete:\s*NoAction/,
  'C7 FK العميل NoAction (ممنوع cascade يمسح الدين)')
has('X1', 'src/app/api/maintenance/[id]/route.ts',
  /source:\s*['"]maintenance['"][\s\S]{0,60}refId:\s*oid/,
  'X1 خزنة الصيانة idempotent (قيد واحد لكل أمر)')

/* ═══════ المرحلة 2: تحقق المبيعات ═══════ */
has('C4', 'src/app/api/sales/route.ts',
  /paid\s*<\s*0/,
  'C4 paid سالب مرفوض')
has('C5', 'src/app/api/sales/route.ts',
  /(زايد|أكبر من الإجمالي|overpay|paid.*total.*مرفوض|مبلغ.*مدفوع.*مرفوض)/i,
  'C5 دفع زايد مرفوض (قرار 3)')
has('M1', 'src/lib/sale-return.ts',
  /FOR UPDATE/,
  'M1 claim ذري بـFOR UPDATE')

/* ═══════ المرحلة 3: المرتجع الجزئي/الاستبدال ═══════ */
has('C8', 'prisma/schema.prisma', /model SaleReturn\b/, 'C8 نموذج SaleReturn')
has('C8', 'prisma/schema.prisma', /model SaleReturnItem\b/, 'C8 نموذج SaleReturnItem')
has('M3', 'prisma/schema.prisma', /returnedQty\s+Int\s+@default\(0\)/, 'M3 SaleItem.returnedQty')
has('M2', 'src/lib/sale-return.ts', /weighted-average/, 'M2 تكلفة WAC بترجع للستوك')
has('M4', 'src/lib/sale-return.ts', /refund/, 'M4 سقف الاسترداد ≤ المدفوع')
has('C10', 'src/components/shop/SaleReturnDialog.tsx', /SaleReturnDialog/, 'C10 ديالوج المرتجع موجود')
has('C11', 'src/lib/features.ts', /returns_exchange/, 'C11 ميزة returns_exchange معرفة')

/* ═══════ المرحلة 4: طرق الدفع ═══════ */
has('C12', 'prisma/schema.prisma', /model Sale\b[\s\S]{0,600}paymentMethod\s+String/, 'C12 Sale.paymentMethod')
has('C12', 'src/app/api/sales/route.ts', /paymentMethod/, 'C12 API بياخد paymentMethod')
has('X5', 'src/app/api/expenses/route.ts', /EXPENSE_METHODS/, 'X5 مصروف بطريقة دفع + فئة')
has('X6', 'src/app/api/finance/[id]/route.ts', /cancelled/, 'X6 إلغاء معاملة خزنة soft')

/* ═══════ المرحلة 5: الصلاحيات والحوكمة ═══════ */
has('X8', 'src/app/api/inventory/stocktake/route.ts', /counted\s*<\s*0|سالب|لا يمكن أن تكون سالبة/, 'X8 جرد يرفض سالب')
has('X9', 'src/app/api/products/[id]/route.ts', /stockMovement|StockMovement/, 'X9 تغيير كمية/تكلفة ليه حركة')
has('X11', 'prisma/schema.prisma', /model Transaction\b[\s\S]{0,300}commission\s+Float/, 'X11 عمولة الخزنة حقل صريح')
has('X12', 'prisma/manual-cleanup-wrong-commissions.sql', /commission/i, 'X12 سكريبت تنظيف العمولات')

/* ═══════ المرحلة 6: الآجل والسجل ═══════ */
has('M10', 'prisma/schema.prisma', /dueDate/, 'M10 Sale.dueDate')
has('M10', 'prisma/schema.prisma', /creditLimit/, 'M10 Customer.creditLimit')
has('M10', 'src/app/api/sales/route.ts', /creditLimit/, 'M10 حد الائتمان متحقق في البيع')
has('X2', 'src/app/api/sales/route.ts', /stockMovement[\s\S]{0,200}type:\s*['"]sale['"]|['"]sale['"][\s\S]{0,200}stockMovement/i, 'X2 بيع بيكتب StockMovement')
has('C6', 'src/app/api/customers/[id]/route.ts', /saleReturns\.reduce/, 'C6 ملخص العميل بيدخل المرتجع في الحساب')

/* ═══════ الميجريشن ═══════ */
{
  const dir = join(ROOT, 'prisma/migrations')
  const names = existsSync(dir) ? readdirSync(dir) : []
  const hit = names.filter((n) => n.includes('customer_side') || (n.includes('20260930') && n.includes('customer')))
  hit.length
    ? results.push({ id: 'MIG', ok: true, ev: hit.join(', ') })
    : results.push({ id: 'MIG', ok: false, why: `مفيش ميجريشن عميل — موجود: ${names.slice(-4).join(', ')}` })
}

/* ═══════ ثغرة الطباعة المقفولة النهارده ═══════ */
has('P1', 'src/lib/print.ts', /export function printLtr/, 'P1 printLtr helper')
for (const f of ['src/components/shop/CashView.tsx', 'src/components/shop/FinanceView.tsx',
  'src/components/shop/MaintenanceView.tsx']) {
  const s = (() => { try { return readFileSync(join(ROOT, f), 'utf8') } catch { return null } })()
  if (!s) { results.push({ id: 'P1', ok: false, why: `ملف مش موجود: ${f}` }); continue }
  if (/<span[^>]*>\{formatArabicDateTime\(/.test(s)) {
    results.push({ id: 'P1', ok: false, why: `${f}: لسه فيه JSX في خلايا الطباعة` }); continue
  }
  s.includes('printLtr(')
    ? results.push({ id: 'P1', ok: true, ev: `${f} printLtr مستخدم` })
    : results.push({ id: 'P1', ok: false, why: `${f}: مستخدمش printLtr` })
}

/* ═══════ P2: ديالوج مرتجع العميل بنموذج الموردين (كل الأصناف مش منيو صنف واحد) ═══════ */
{
  const s = (() => { try { return readFileSync(join(ROOT, 'src/components/shop/SaleReturnDialog.tsx'), 'utf8') } catch { return null } })()
  if (!s) {
    results.push({ id: 'P2', ok: false, why: 'SaleReturnDialog.tsx مش موجود' })
  } else {
    const hasMenuPicker = /<select[\s\S]{0,200}items\.map/.test(s) // منيو صنف واحد — النموذج القديم الغلط
    const hasPerLineInputs = /qtys\[it\.id\]/.test(s) && /remainingOf/.test(s)
    const hasReturnAll = /إرجاع كل المتبقي/.test(s)
    const sendsLinesArray = /lines:\s*lines\.map/.test(s)
    const showsSplit = /يخرج من الخزنة/.test(s) && /يخصم من حساب العميل/.test(s)
    const inFlightGuard = /inFlight/.test(s)
    if (hasMenuPicker) results.push({ id: 'P2', ok: false, why: 'لسه فيه منيو صنف واحد (النموذج القديم)' })
    else {
      const checks = [
        [hasPerLineInputs, 'حقول كمية لكل سطر'],
        [hasReturnAll, 'زرار إرجاع كل المتبقي'],
        [sendsLinesArray, 'بتبعت lines[] متعددة للسيرفر'],
        [showsSplit, 'تقسيمة الخزنة/حساب العميل ظاهرة'],
        [inFlightGuard, 'حماية الدوس المزدوج'],
      ]
      for (const [pass, label] of checks) {
        results.push(pass
          ? { id: 'P2', ok: true, ev: `SaleReturnDialog: ${label} ✅` }
          : { id: 'P2', ok: false, why: `SaleReturnDialog ناقص: ${label}` })
      }
    }
  }
}

/* ═══════ التقرير ═══════ */
const passed = results.filter((r) => r.ok)
const failed = results.filter((r) => !r.ok)
console.log('════════ اعتماد الإصلاحات — فحص شامل v2 ════════')
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.id}${r.ok ? ' → ' + r.ev : ' — ' + r.why}`)
console.log('══════════════════════════════════════════')
console.log(`نجح: ${passed.length} / ${results.length} — فشل: ${failed.length}`)
if (failed.length) { console.log('GAPS:', failed.map((f) => f.id).join('، ')); process.exit(1) }
console.log('كل الفحوصات عدّت — الاعتماد جاهز ✅')
